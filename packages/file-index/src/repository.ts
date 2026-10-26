import type Database from 'better-sqlite3';
import type { FileSearchOptions } from '../../contracts/src/file-search.ts';
import { MAX_ENVELOPE_BYTES, parseContract } from '../../contracts/src/index.ts';
import { fileIndexSchemas, rootStateSchema } from './contracts.ts';
import type { FileIndexMethod, IndexEntry, RootConfig, RootState } from './contracts.ts';

/** Coordinator copies this exact SQL to storage migration 003. Never run here. */
export const FILE_INDEX_SCHEMA_SQL = `
CREATE TABLE file_index_roots (
 id TEXT PRIMARY KEY, config TEXT NOT NULL CHECK(json_valid(config)),
 state TEXT NOT NULL CHECK(state IN ('idle','scanning','ready','degraded','unavailable','removed')),
 generation TEXT, scan_id TEXT, progress TEXT CHECK(progress IS NULL OR json_valid(progress)),
 previous_state TEXT NOT NULL DEFAULT 'idle' CHECK(previous_state IN ('idle','ready','degraded','unavailable'))
) STRICT;
CREATE TABLE file_index_entries (
 rowid INTEGER PRIMARY KEY, root_id TEXT NOT NULL REFERENCES file_index_roots(id),
 generation TEXT NOT NULL, path TEXT NOT NULL, name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('file','directory')), size INTEGER NOT NULL CHECK(size>=0),
 modified_ms INTEGER NOT NULL, device TEXT NOT NULL, inode TEXT NOT NULL,
 UNIQUE(root_id,generation,path)
) STRICT;
CREATE INDEX file_index_generation ON file_index_entries(root_id,generation);
CREATE VIRTUAL TABLE file_index_fts USING fts5(name,path,content='file_index_entries',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2');
`;
export class FileIndexRepositoryError extends Error {
  readonly reason = 'conflict';
  constructor() { super('File index generation conflict.'); }
}
interface RootRow {id: string; config: string; state: RootState['state'] | 'removed'; previous_state: 'idle'|'ready'|'degraded'|'unavailable'; generation: string | null; scan_id: string | null; progress: string | null}
function root(db: Database.Database, id: string): RootRow {
  const row = db.prepare('SELECT * FROM file_index_roots WHERE id=?').get(id) as RootRow | undefined;
  if (!row || row.state === 'removed') throw new FileIndexRepositoryError();
  return row;
}
function state(row: RootRow): RootState {
  return parseContract(rootStateSchema, {config: JSON.parse(row.config), state: row.state,
    generation: row.generation, progress: row.progress === null ? null : JSON.parse(row.progress)});
}
function active(db: Database.Database, id: string, scanId: string): RootRow {
  const row = root(db, id);
  if (row.scan_id !== scanId || row.state !== 'scanning') throw new FileIndexRepositoryError();
  return row;
}
/** Once after migrations, before serving requests: interrupted scans never publish. */
export function recoverFileIndex(db: Database.Database): void {
  db.prepare("UPDATE file_index_roots SET scan_id=NULL,previous_state=CASE WHEN generation IS NULL THEN 'idle' ELSE 'degraded' END,state=CASE WHEN generation IS NULL THEN 'idle' ELSE 'degraded' END WHERE state='scanning'").run();
}
/** Called synchronously only inside the trusted, sole storage owner. */
export function dispatchFileIndex(db: Database.Database, method: FileIndexMethod, input: unknown): unknown {
  const p = parseContract<unknown>(fileIndexSchemas[method].params, input) as Record<string, unknown>;
  return db.transaction(() => {
    const result=(() => {
    switch (method) {
      case 'files.roots.put': {
        const config = p.config as RootConfig;
        const prior = db.prepare('SELECT * FROM file_index_roots WHERE id=?').get(config.id) as RootRow | undefined;
        if (prior?.scan_id) throw new FileIndexRepositoryError();
        if (!prior && (db.prepare('SELECT count(*) AS n FROM file_index_roots').get() as {n: number}).n >= 100) throw new FileIndexRepositoryError();
        const serialized = JSON.stringify(config);
        if (prior?.config === serialized && prior.state !== 'removed') return state(prior);
        db.prepare("INSERT INTO file_index_roots(id,config,state) VALUES(?,?,'idle') ON CONFLICT(id) DO UPDATE SET config=excluded.config,state='idle',previous_state='idle',generation=NULL,scan_id=NULL,progress=NULL")
          .run(config.id, serialized);
        return state(root(db, config.id));
      }
      case 'files.roots.list': return (db.prepare("SELECT * FROM file_index_roots WHERE state!='removed' ORDER BY id").all() as RootRow[]).map(state);
      case 'files.roots.remove':
        db.prepare("UPDATE file_index_roots SET state='removed',generation=NULL,scan_id=NULL WHERE id=?").run(p.rootId);
        return {ok: true};
      case 'files.scan.begin': {
        const row = root(db, p.rootId as string);
        if (row.scan_id || row.generation === p.scanId || db.prepare('SELECT 1 FROM file_index_entries WHERE root_id=? AND generation=? LIMIT 1').get(p.rootId,p.scanId)) throw new FileIndexRepositoryError();
        db.prepare("UPDATE file_index_roots SET scan_id=?,previous_state=state,state='scanning' WHERE id=?").run(p.scanId,p.rootId);
        return {ok:true};
      }
      case 'files.scan.batch': {
        active(db, p.rootId as string, p.scanId as string);
        const insert = db.prepare('INSERT INTO file_index_entries(root_id,generation,path,name,kind,size,modified_ms,device,inode) VALUES(?,?,?,?,?,?,?,?,?)');
        const fts = db.prepare('INSERT INTO file_index_fts(rowid,name,path) VALUES(?,?,?)');
        for (const entry of p.entries as IndexEntry[]) {
          const name=entry.path.split('/').at(-1)!;
          const row=insert.run(p.rootId,p.scanId,entry.path,name,entry.kind,entry.size,entry.modifiedMs,entry.device,entry.inode);
          fts.run(row.lastInsertRowid,name,entry.path);
        }
        return {ok:true};
      }
      case 'files.scan.finish': {
        active(db,p.rootId as string,p.scanId as string);
        const progress = p.progress as {indexed:number;denied:number;unsupported:number;watchFailures:number};
        const count = db.prepare('SELECT count(*) AS n FROM file_index_entries WHERE root_id=? AND generation=?').get(p.rootId,p.scanId) as {n:number};
        if (count.n!==progress.indexed) throw new FileIndexRepositoryError();
        const next = progress.denied || progress.unsupported || progress.watchFailures ? 'degraded' : 'ready';
        db.prepare('UPDATE file_index_roots SET generation=scan_id,scan_id=NULL,state=?,previous_state=?,progress=? WHERE id=?').run(next,next,JSON.stringify(progress),p.rootId);
        return state(root(db,p.rootId as string));
      }
      case 'files.scan.abort': {
        const row = active(db,p.rootId as string,p.scanId as string);
        db.prepare('UPDATE file_index_roots SET scan_id=NULL,state=? WHERE id=?').run(p.unavailable ? 'unavailable' : row.previous_state,p.rootId);
        return {ok:true};
      }
      case 'files.scan.prune': {
        const rows=db.prepare(`SELECT e.rowid,e.name,e.path FROM file_index_entries e JOIN file_index_roots r ON r.id=e.root_id
           WHERE r.id=? AND e.generation IS NOT r.generation AND e.generation IS NOT r.scan_id LIMIT 512`).all(p.rootId) as {rowid:number;name:string;path:string}[];
        const erase=db.prepare("INSERT INTO file_index_fts(file_index_fts,rowid,name,path) VALUES('delete',?,?,?)");
        const remove=db.prepare('DELETE FROM file_index_entries WHERE rowid=?');
        for (const row of rows) {erase.run(row.rowid,row.name,row.path);remove.run(row.rowid);}
        const removed=rows.length;
        db.prepare("DELETE FROM file_index_roots WHERE id=? AND state='removed' AND NOT EXISTS(SELECT 1 FROM file_index_entries WHERE root_id=?)").run(p.rootId,p.rootId);
        return {removed};
      }
      case 'files.search': {
        // Quote every token: input cannot inject FTS operators or column filters.
        const words = (p.query as string).match(/[\p{L}\p{N}_]+/gu)?.slice(0,32) ?? [];
        if (!words.length && (p.directory===undefined || (p.query as string).trim())) return [];
        const query = words.map(word => `"${word}"*`).join(' AND ');
        const options=p.options as FileSearchOptions|undefined;
        // Only fixed fragments selected by the validated enum enter SQL.
        let order=words.length?'rank,e.path,e.root_id':'e.name COLLATE NOCASE,e.name,e.path,e.root_id';
        switch(options?.sort){
          case 'name':order='e.name COLLATE NOCASE,e.name,e.path,e.root_id';break;
          case 'modified-desc':order='e.modified_ms DESC,e.path,e.root_id';break;
          case 'size-desc':order='e.size DESC,e.path,e.root_id';break;
        }
        const directory=p.directory as string|undefined,prefix=directory===undefined?null:directory===''?'':`${directory}/`;
        const rows = db.prepare(`SELECT e.*,r.config FROM file_index_entries e ${words.length?'JOIN file_index_fts f ON e.rowid=f.rowid':''}
          JOIN file_index_roots r ON r.id=e.root_id WHERE ${words.length?'file_index_fts MATCH ?':'1'}
          AND e.generation=r.generation AND (r.state IN ('ready','degraded') OR (r.state='scanning' AND r.previous_state IN ('ready','degraded')))
          AND (? IS NULL OR r.id=?) AND (? IS NULL OR e.kind=?)
          AND (? IS NULL OR e.modified_ms>=?) AND (? IS NULL OR e.modified_ms<?)
          AND (? IS NULL OR (substr(e.path,1,length(?))=? AND instr(substr(e.path,length(?)+1),'/')=0))
          ORDER BY ${order} LIMIT ?`).all(...(words.length?[query]:[]),p.rootId ?? null,p.rootId ?? null,
          options?.kind??null,options?.kind??null,options?.modifiedFromMs??null,options?.modifiedFromMs??null,
          options?.modifiedBeforeMs??null,options?.modifiedBeforeMs??null,prefix,prefix,prefix,prefix,p.limit) as
          (IndexEntry & {root_id:string;generation:string;config:string;modified_ms:number})[];
        const candidates=rows.map(row => ({rootId:row.root_id,rootPath:(JSON.parse(row.config) as RootConfig).path,
          id:`${row.root_id}:${row.path}`,generation:row.generation,path:row.path,kind:row.kind,size:row.size,
          modifiedMs:row.modified_ms,device:row.device,inode:row.inode}));
        let bytes=2,cutoff=candidates.length;
        for(let i=0;i<candidates.length;i++) {
          bytes+=Buffer.byteLength(JSON.stringify(candidates[i]))+1;
          if(bytes>MAX_ENVELOPE_BYTES-8192) {cutoff=i;break;}
        }
        return candidates.slice(0,cutoff);
      }
    }
    })();
    return parseContract<unknown>(fileIndexSchemas[method].result,result);
  }).immediate();
}
