import { afterEach,expect,it,vi } from 'vitest';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { ContractError,MAX_QUICKLINKS,parseContract,quicklinkRepositoryContracts } from '@linuxcast/contracts';
import type { QuicklinkRecord,QuicklinkStorageMethod,QuicklinkStorageMethods } from '@linuxcast/contracts';
import { dispatchQuicklinks,QuicklinkRepositoryError } from '../src/repository.ts';

const require=createRequire(new URL('../../../storage/package.json',import.meta.url));
const Sqlite=require('better-sqlite3') as typeof Database;
const directories:string[]=[],databases:Database.Database[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const db of databases.splice(0))if(db.open)db.close();for(const dir of directories.splice(0))await rm(dir,{recursive:true,force:true});});
function request<M extends QuicklinkStorageMethod>(db:Database.Database,method:M,input:unknown):QuicklinkStorageMethods[M]['result'] {
  return db.transaction(()=>parseContract(quicklinkRepositoryContracts.get(method)!.result,dispatchQuicklinks(db,method,input))).immediate() as QuicklinkStorageMethods[M]['result'];
}
async function fixture(){
  const directory=await mkdtemp(join(tmpdir(),'linuxcast-quicklinks-repository-'));directories.push(directory);
  const path=join(directory,'data.db'),db=new Sqlite(path);databases.push(db);
  db.pragma('foreign_keys=ON');db.pragma('journal_mode=WAL');db.pragma('trusted_schema=OFF');
  for(const name of ['001-foundation.sql','002-permissions.sql','003-file-index.sql','004-secret-references.sql','005-command-visibility.sql'])db.exec(await readFile(new URL(`../../../storage/src/migrations/${name}`,import.meta.url),'utf8'));
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name='quicklinks'").get()).toBeUndefined();
  db.prepare('INSERT INTO command_usage(command_id,use_count,last_used_at,pinned,alias) VALUES(?,3,NULL,1,?)').run('linuxcast:calculator','public calc');
  db.transaction(()=>db.exec(schema)).immediate();
  return {db,path};
}
const schema=await readFile(new URL('../../../storage/src/migrations/006-quicklinks.sql',import.meta.url),'utf8');
const create=(db:Database.Database,name='Public Link',url='https://example.com/public')=>request(db,'quicklinks.save',{expectedRevision:0,name,url});
const selection=(value:QuicklinkRecord)=>({id:value.id,revision:value.revision});

it('uses actual migration SQL, generates owner identity/time, canonicalizes URLs and persists exact records after reopen',async()=>{
  const {db,path}=await fixture(),before=Date.now();
  const saved=create(db,'Public Unicode Link','HTTPS://例え.example:443/public?q=%7Bvalue%7D#section');
  expect(saved).toMatchObject({revision:1,name:'Public Unicode Link',url:'https://xn--r8jz45g.example/public?q=%7Bvalue%7D#section'});
  expect(saved.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  expect(Date.parse(saved.createdAt)).toBeGreaterThanOrEqual(before);expect(saved.updatedAt).toBe(saved.createdAt);
  expect(request(db,'quicklinks.list',{})).toEqual([{id:saved.id,revision:1,name:saved.name,host:'xn--r8jz45g.example'}]);
  expect(request(db,'quicklinks.get',selection(saved))).toEqual(saved);
  expect(db.prepare('SELECT use_count,pinned,alias FROM command_usage').get()).toEqual({use_count:3,pinned:1,alias:'public calc'});
  db.close();const next=new Sqlite(path);databases.push(next);
  expect(request(next,'quicklinks.get',selection(saved))).toEqual(saved);
});
it('lists every saved definition in UUID order with host only, including rows beyond the local first100',async()=>{
  const {db}=await fixture();const saved=Array.from({length:125},(_,n)=>create(db,`Public Link ${n}`,`https://example.com:8443/path/${n}?value=public#fragment`));
  const summaries=request(db,'quicklinks.list',{});
  expect(summaries).toHaveLength(125);expect(summaries.map(row=>row.id)).toEqual(saved.map(row=>row.id).sort());
  expect(summaries.every(row=>Object.keys(row).sort().join(',')==='host,id,name,revision'&&row.host==='example.com:8443')).toBe(true);
});
it.each([['Café','Cafe\u0301'],['ＦＯＯ','foo'],['Public  Link','public\u00a0link'],['Kelvin','kelvin']])('rejects normalized Unicode name collision %j/%j without changing either row',async(first,duplicate)=>{
  const {db}=await fixture(),saved=create(db,first),other=create(db,'Independent');
  expect(()=>create(db,duplicate)).toThrowError(expect.objectContaining({reason:'quicklink-name-conflict'}));
  expect(()=>request(db,'quicklinks.save',{id:other.id,expectedRevision:1,name:duplicate,url:other.url})).toThrowError(expect.objectContaining({reason:'quicklink-name-conflict'}));
  expect(request(db,'quicklinks.get',selection(saved))).toEqual(saved);expect(request(db,'quicklinks.get',selection(other))).toEqual(other);
  expect(request(db,'quicklinks.list',{})).toHaveLength(2);
});
it('preserves creation/other rows, increments once, retains monotonic modified time after a clock rollback, and releases renamed keys',async()=>{
  const {db}=await fixture(),saved=create(db),other=create(db,'Other');
  vi.spyOn(Date,'now').mockReturnValue(Date.parse(saved.createdAt)-60_000);
  const updated=request(db,'quicklinks.save',{id:saved.id,expectedRevision:1,name:'Renamed',url:'http://example.org:8080/new'});
  expect(updated).toEqual({...saved,revision:2,name:'Renamed',url:'http://example.org:8080/new'});
  expect(request(db,'quicklinks.get',selection(other))).toEqual(other);
  expect(create(db,saved.name).revision).toBe(1);
  const again=request(db,'quicklinks.save',{id:updated.id,expectedRevision:2,name:updated.name,url:updated.url});
  expect(again.revision).toBe(3);expect(again.createdAt).toBe(saved.createdAt);
});
it('distinguishes missing get from stale versions; stale/missing writes and deletes never succeed',async()=>{
  const {db}=await fixture(),saved=create(db),missing={id:randomUUID(),revision:1};
  expect(request(db,'quicklinks.get',missing)).toBeNull();
  for(const revision of [2,Number.MAX_SAFE_INTEGER]){
    expect(()=>request(db,'quicklinks.get',{id:saved.id,revision})).toThrowError(expect.objectContaining({reason:'conflict'}));
    expect(()=>request(db,'quicklinks.remove',{id:saved.id,revision})).toThrowError(expect.objectContaining({reason:'conflict'}));
    expect(()=>request(db,'quicklinks.save',{id:saved.id,expectedRevision:revision,name:'Changed',url:saved.url})).toThrowError(expect.objectContaining({reason:'conflict'}));
  }
  expect(()=>request(db,'quicklinks.save',{id:missing.id,expectedRevision:1,name:'Missing',url:saved.url})).toThrowError(expect.objectContaining({reason:'conflict'}));
  expect(()=>request(db,'quicklinks.remove',missing)).toThrowError(expect.objectContaining({reason:'conflict'}));
  expect(request(db,'quicklinks.remove',selection(saved))).toEqual(selection(saved));
  expect(request(db,'quicklinks.get',selection(saved))).toBeNull();
  expect(()=>request(db,'quicklinks.remove',selection(saved))).toThrowError(expect.objectContaining({reason:'conflict'}));
});
it('enforces500 on creation while allowing update/delete and a new definition after removal',async()=>{
  const {db}=await fixture(),rows=Array.from({length:MAX_QUICKLINKS},(_,n)=>create(db,`Capacity Link ${n}`));
  expect(request(db,'quicklinks.list',{})).toHaveLength(500);
  expect(()=>create(db,'Overflow')).toThrowError(expect.objectContaining({reason:'quicklink-limit-reached'}));
  const first=rows[0]!,updated=request(db,'quicklinks.save',{id:first.id,expectedRevision:1,name:'Capacity Updated',url:first.url});
  expect(updated.revision).toBe(2);expect(request(db,'quicklinks.list',{})).toHaveLength(500);
  request(db,'quicklinks.remove',selection(updated));expect(create(db,'New After Delete').revision).toBe(1);
  expect(request(db,'quicklinks.list',{})).toHaveLength(500);
});
it('validates direct calls before SQL writes and reports fixed errors without payload text',async()=>{
  const {db}=await fixture(),base={expectedRevision:0,name:'Public',url:'https://example.com/'};
  for(const input of [null,{}, {...base,id:randomUUID()}, {...base,expectedRevision:1},{...base,name:' untrimmed'}, {...base,name:'bad\nname'}, {...base,name:'\ud800'}, {...base,url:'https://example.com/{{vars.query}}'},{...base,url:'https://user:pass@example.com/'},{...base,url:'javascript:alert(1)'},{...base,createdAt:'2020-01-01T00:00:00Z'},{...base,revision:1}])expect(()=>dispatchQuicklinks(db,'quicklinks.save',input)).toThrow(ContractError);
  expect(()=>dispatchQuicklinks(db,'quicklinks.list',{query:'not persisted'})).toThrow(ContractError);
  expect(()=>dispatchQuicklinks(db,'quicklinks.get',{id:'forged',revision:1})).toThrow(ContractError);
  expect(request(db,'quicklinks.list',{})).toEqual([]);
  for(const reason of ['conflict','quicklink-name-conflict','quicklink-limit-reached'] as const)expect(new QuicklinkRepositoryError(reason).message).toBe(`Quicklink operation unavailable: ${reason}.`);
});
it('rejects overflowing revision and overfilled catalogues; owner transaction rolls back invalid stored results',async()=>{
  const {db}=await fixture(),saved=create(db);
  db.prepare('UPDATE quicklinks SET revision=? WHERE id=?').run(Number.MAX_SAFE_INTEGER,saved.id);
  expect(()=>request(db,'quicklinks.save',{id:saved.id,expectedRevision:Number.MAX_SAFE_INTEGER,name:saved.name,url:saved.url})).toThrowError(expect.objectContaining({reason:'conflict'}));
  db.prepare('UPDATE quicklinks SET revision=1 WHERE id=?').run(saved.id);
  db.exec("CREATE TRIGGER synthetic_invalid_result AFTER UPDATE ON quicklinks BEGIN UPDATE quicklinks SET updated_at='invalid' WHERE id=NEW.id; END");
  expect(()=>request(db,'quicklinks.save',{id:saved.id,expectedRevision:1,name:'Must Roll Back',url:saved.url})).toThrow(ContractError);
  expect(request(db,'quicklinks.get',selection(saved))).toEqual(saved);
  db.exec('DROP TRIGGER synthetic_invalid_result');
  const insert=db.prepare('INSERT INTO quicklinks(id,revision,name,name_key,url,created_at,updated_at) VALUES(?,1,?,?,?,?,?)');
  db.transaction(()=>{for(let n=0;n<500;n++)insert.run(randomUUID(),`Excess ${n}`,`excess ${n}`,saved.url,saved.createdAt,saved.updatedAt);}).immediate();
  expect(()=>request(db,'quicklinks.list',{})).toThrow(ContractError);
});
