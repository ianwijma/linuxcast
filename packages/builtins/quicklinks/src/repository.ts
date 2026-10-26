import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { MAX_QUICKLINKS, normalizeQuicklinkName, parseContract, quicklinkRecordSchema, quicklinkRepositoryContracts } from '@linuxcast/contracts';
import type { QuicklinkRecord, QuicklinkSave, QuicklinkSelection, QuicklinkStorageMethod } from '@linuxcast/contracts';

export type QuicklinkRepositoryReason='conflict'|'quicklink-name-conflict'|'quicklink-limit-reached';
export class QuicklinkRepositoryError extends Error {
  readonly reason:QuicklinkRepositoryReason;
  constructor(reason:QuicklinkRepositoryReason){super(`Quicklink operation unavailable: ${reason}.`);this.name='QuicklinkRepositoryError';this.reason=reason;}
}
interface Row {id:string;revision:number;name:string;url:string;created_at:string;updated_at:string}
function record(row:Row):QuicklinkRecord {
  return parseContract(quicklinkRecordSchema,{id:row.id,revision:row.revision,name:row.name,url:row.url,createdAt:row.created_at,updatedAt:row.updated_at});
}
function find(db:Database.Database,id:string):QuicklinkRecord|null {
  const row=db.prepare('SELECT id,revision,name,url,created_at,updated_at FROM quicklinks WHERE id=?').get(id) as Row|undefined;
  return row?record(row):null;
}
/** Synchronous domain dispatch inside the sole owner's immediate transaction.
 * The owner validates the result before commit; no connection, transaction,
 * query history or native effect is created here. */
export function dispatchQuicklinks(db:Database.Database,method:QuicklinkStorageMethod,input:unknown):unknown {
  const contract=quicklinkRepositoryContracts.get(method);
  if(!contract)throw new QuicklinkRepositoryError('conflict');
  const params=parseContract(contract.params,input);
  switch(method){
    case 'quicklinks.list': {
      const rows=db.prepare('SELECT id,revision,name,url,created_at,updated_at FROM quicklinks ORDER BY id COLLATE BINARY LIMIT ?').all(MAX_QUICKLINKS+1) as Row[];
      // Reading one excess row detects corrupt/externally overfilled storage;
      // never silently publish a truncated catalogue.
      return parseContract(contract.result,rows.map(row=>{const value=record(row);return {id:value.id,revision:value.revision,name:value.name,host:new URL(value.url).host};}));
    }
    case 'quicklinks.get': {
      const {id,revision}=params as QuicklinkSelection,current=find(db,id);
      if(current && current.revision!==revision)throw new QuicklinkRepositoryError('conflict');
      return current;
    }
    case 'quicklinks.save': {
      const {id,expectedRevision,name,url}=params as QuicklinkSave;
      const prior=id===undefined?null:find(db,id);
      if(id!==undefined && (!prior || prior.revision!==expectedRevision || prior.revision===Number.MAX_SAFE_INTEGER))throw new QuicklinkRepositoryError('conflict');
      const key=normalizeQuicklinkName(name);
      const collision=db.prepare('SELECT id FROM quicklinks WHERE name_key=?').get(key) as {id:string}|undefined;
      if(collision && collision.id!==id)throw new QuicklinkRepositoryError('quicklink-name-conflict');
      if(!prior && (db.prepare('SELECT count(*) AS count FROM quicklinks').get() as {count:number}).count>=MAX_QUICKLINKS)throw new QuicklinkRepositoryError('quicklink-limit-reached');
      const storedId=id??randomUUID(),now=new Date(Math.max(Date.now(),prior?Date.parse(prior.updatedAt):-Infinity)).toISOString();
      if(prior){
        const result=db.prepare('UPDATE quicklinks SET revision=revision+1,name=?,name_key=?,url=?,updated_at=? WHERE id=? AND revision=?').run(name,key,url,now,storedId,expectedRevision);
        if(result.changes!==1)throw new QuicklinkRepositoryError('conflict');
      }else{
        db.prepare('INSERT INTO quicklinks(id,revision,name,name_key,url,created_at,updated_at) VALUES(?,1,?,?,?,?,?)').run(storedId,name,key,url,now,now);
      }
      const saved=find(db,storedId);
      if(!saved)throw new QuicklinkRepositoryError('conflict');
      return saved;
    }
    case 'quicklinks.remove': {
      const selection=params as QuicklinkSelection;
      const result=db.prepare('DELETE FROM quicklinks WHERE id=? AND revision=?').run(selection.id,selection.revision);
      if(result.changes!==1)throw new QuicklinkRepositoryError('conflict');
      return selection;
    }
  }
}
