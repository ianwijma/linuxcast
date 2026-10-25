import type Database from 'better-sqlite3';
import { MAX_ENVELOPE_BYTES } from '../../contracts/src/index.ts';
import { localSettingIdSchema } from '@linuxcast/platform-contracts/data-controls';
import type { DataClearParams, DataClearResult, DataExportParams } from '@linuxcast/platform-contracts/data-controls';
import { StorageError } from './errors.ts';
/** Column names are fixed call-site constants; only values become placeholders. */
function selected(column: string, ids: readonly string[] | undefined): {sql:string;values:readonly string[]} {
  if (ids === undefined) return {sql:'1',values:[]};
  return {sql:ids.length ? `${column} IN (${ids.map(()=>'?').join(',')})` : '0',values:ids};
}
/** Runs inside Repositories' result-checked transaction. No original source files are touched. */
export function clearLocalData(db: Database.Database, params: DataClearParams): DataClearResult {
  if (params.category === 'command-usage') {
    const filter=selected('command_id',params.ids);
    const changed=db.prepare(`UPDATE command_usage SET use_count=0,last_used_at=NULL WHERE (${filter.sql}) AND (use_count!=0 OR last_used_at IS NOT NULL)`).run(...filter.values).changes;
    return {category:params.category,removed:changed,complete:true};
  }
  if (params.category === 'ai-conversations') {
    const filter=selected('id',params.ids);
    db.prepare(`DELETE FROM message_revisions WHERE conversation_id IN (SELECT id FROM conversations WHERE ${filter.sql})`).run(...filter.values);
    const removed=db.prepare(`DELETE FROM conversations WHERE ${filter.sql}`).run(...filter.values).changes;
    return {category:params.category,removed,complete:true};
  }
  const filter=selected('id',params.ids);
  // Invalidate all chosen published and in-flight generations before any pruning.
  // The trusted controller stops jobs before clearing; late old batches fail closed.
  db.prepare(`UPDATE file_index_roots SET state=CASE WHEN state='removed' THEN 'removed' ELSE 'idle' END,
    generation=NULL,scan_id=NULL,progress=NULL,previous_state='idle' WHERE ${filter.sql}`).run(...filter.values);
  const entries=db.prepare(`SELECT rowid,name,path FROM file_index_entries WHERE root_id IN
    (SELECT id FROM file_index_roots WHERE ${filter.sql}) LIMIT 512`).all(...filter.values) as {rowid:number;name:string;path:string}[];
  const erase=db.prepare("INSERT INTO file_index_fts(file_index_fts,rowid,name,path) VALUES('delete',?,?,?)");
  const remove=db.prepare('DELETE FROM file_index_entries WHERE rowid=?');
  for (const entry of entries) {erase.run(entry.rowid,entry.name,entry.path);remove.run(entry.rowid);}
  const remaining=db.prepare(`SELECT 1 FROM file_index_entries WHERE root_id IN
    (SELECT id FROM file_index_roots WHERE ${filter.sql}) LIMIT 1`).get(...filter.values);
  return {category:params.category,removed:entries.length,complete:!remaining};
}
/** Complete bounded snapshot. Oversized categories fail, never silently truncate. */
export function exportLocalData(db: Database.Database, params: DataExportParams): unknown {
  let bytes=1024;
  const read=(sql:string,values:readonly string[],project:(row:Record<string,unknown>)=>unknown) => {
    const records:unknown[]=[];
    for (const row of db.prepare(sql).iterate(...values) as Iterable<Record<string,unknown>>) {
      const record=project(row);bytes+=Buffer.byteLength(JSON.stringify(record))+1;
      if (bytes>MAX_ENVELOPE_BYTES-8192) throw new StorageError('export-too-large');
      records.push(record);
    }
    return records;
  };
  if (params.category === 'settings') {
    const filter=selected('id',params.ids??localSettingIdSchema.options);
    const records=read(`SELECT id,revision,value,modified_at FROM settings WHERE ${filter.sql} ORDER BY id`,filter.values,row=>({
      id:row.id,revision:row.revision,value:JSON.parse(row.value as string),modifiedAt:row.modified_at}));
    return {category:params.category,records};
  }
  if (params.category === 'command-usage') {
    const filter=selected('command_id',params.ids);
    const records=read(`SELECT command_id,use_count,last_used_at,pinned,alias FROM command_usage WHERE ${filter.sql} ORDER BY command_id`,filter.values,row=>({
      commandId:row.command_id,useCount:row.use_count,lastUsedAt:row.last_used_at,pinned:row.pinned===1,alias:row.alias}));
    return {category:params.category,records};
  }
  const filter=selected('id',params.ids);
  const conversations=read(`SELECT record FROM conversations WHERE ${filter.sql} ORDER BY id`,filter.values,row=>JSON.parse(row.record as string));
  const messageRevisions=read(`SELECT record FROM message_revisions WHERE conversation_id IN
    (SELECT id FROM conversations WHERE ${filter.sql}) ORDER BY conversation_id,sequence`,filter.values,row=>JSON.parse(row.record as string));
  return {category:params.category,conversations,messageRevisions};
}
