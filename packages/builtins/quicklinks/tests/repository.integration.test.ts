import { afterEach,expect,it,vi } from 'vitest';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { ContractError,MAX_QUICKLINKS,parseContract,quicklinkRepositoryContracts,WEB_SEARCH_TEMPLATE } from '@linuxcast/contracts';
import type { QuicklinkRecord,QuicklinkStorageMethod,QuicklinkStorageMethods } from '@linuxcast/contracts';
import { dispatchQuicklinks,QuicklinkRepositoryError } from '../src/repository.ts';

const require=createRequire(new URL('../../../storage/package.json',import.meta.url));
const Sqlite=require('better-sqlite3') as typeof Database;
const directories:string[]=[],databases:Database.Database[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const db of databases.splice(0))if(db.open)db.close();for(const dir of directories.splice(0))await rm(dir,{recursive:true,force:true});});
function request<M extends QuicklinkStorageMethod>(db:Database.Database,method:M,input:unknown):QuicklinkStorageMethods[M]['result'] {
  return db.transaction(()=>parseContract(quicklinkRepositoryContracts.get(method)!.result,dispatchQuicklinks(db,method,input))).immediate() as QuicklinkStorageMethods[M]['result'];
}
async function fixture(version:6|7|10|11|12|18=18){
  const directory=await mkdtemp(join(tmpdir(),'linuxcast-quicklinks-repository-'));directories.push(directory);
  const path=join(directory,'data.db'),db=new Sqlite(path);databases.push(db);
  db.pragma('foreign_keys=ON');db.pragma('journal_mode=WAL');db.pragma('trusted_schema=OFF');
  for(const name of ['001-foundation.sql','002-permissions.sql','003-file-index.sql','004-secret-references.sql','005-command-visibility.sql'])db.exec(await readFile(new URL(`../../../storage/src/migrations/${name}`,import.meta.url),'utf8'));
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name='quicklinks'").get()).toBeUndefined();
  db.prepare('INSERT INTO command_usage(command_id,use_count,last_used_at,pinned,alias) VALUES(?,3,NULL,1,?)').run('linuxcast:calculator','public calc');
  db.transaction(()=>db.exec(schema)).immediate();
  if(version>=7)db.transaction(()=>db.exec(webSearchMigration)).immediate();
  if(version>=10)db.transaction(()=>db.exec(tagsMigration)).immediate();
  if(version>=11)db.transaction(()=>db.exec(presentationMigration)).immediate();
  if(version>=12)db.transaction(()=>db.exec(pathMigration)).immediate();
  if(version>=18)db.transaction(()=>db.exec(clockMigration)).immediate();
  return {db,path};
}
const schema=await readFile(new URL('../../../storage/src/migrations/006-quicklinks.sql',import.meta.url),'utf8');
const webSearchMigration=await readFile(new URL('../../../storage/src/migrations/007-quicklink-web-searches.sql',import.meta.url),'utf8');
const tagsMigration=await readFile(new URL('../../../storage/src/migrations/010-quicklink-tags.sql',import.meta.url),'utf8');
const presentationMigration=await readFile(new URL('../../../storage/src/migrations/011-quicklink-presentation.sql',import.meta.url),'utf8');
const pathMigration=await readFile(new URL('../../../storage/src/migrations/012-quicklink-path-argument.sql',import.meta.url),'utf8');
const clockMigration=await readFile(new URL('../../../storage/src/migrations/018-quicklink-clock.sql',import.meta.url),'utf8');
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


it('upgrades actual literal schema6 rows without changing identity/version/base/timestamps and persists optional search configuration after reopen',async()=>{
  const {db,path}=await fixture(6),literal={id:randomUUID(),revision:4,name:'Existing Literal',url:'https://example.org/public?q=literal',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-02-01T00:00:00.000Z'};
  db.prepare('INSERT INTO quicklinks(id,revision,name,name_key,url,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(literal.id,literal.revision,literal.name,'existing literal',literal.url,literal.createdAt,literal.updatedAt);
  db.transaction(()=>{db.exec(webSearchMigration);db.exec(tagsMigration);db.exec(presentationMigration);db.exec(pathMigration);db.exec(clockMigration);}).immediate();
  expect(request(db,'quicklinks.get',selection(literal))).toEqual(literal);
  expect(db.prepare('SELECT web_search FROM quicklinks').get()).toEqual({web_search:null});
  expect(request(db,'quicklinks.list',{})).toEqual([{id:literal.id,revision:4,name:literal.name,host:'example.org'}]);
  const config={queryParameter:'q',template:WEB_SEARCH_TEMPLATE},saved=request(db,'quicklinks.save',{id:literal.id,expectedRevision:4,name:literal.name,url:literal.url,webSearch:config});
  expect(saved).toMatchObject({...literal,updatedAt:saved.updatedAt,revision:5,webSearch:config});expect(saved.createdAt).toBe(literal.createdAt);expect(Date.parse(saved.updatedAt)).toBeGreaterThanOrEqual(Date.parse(literal.updatedAt));
  const serialized=db.prepare('SELECT web_search FROM quicklinks WHERE id=?').pluck().get(literal.id);
  expect(serialized).toBe(JSON.stringify(config));
  db.close();const next=new Sqlite(path);databases.push(next);
  expect(request(next,'quicklinks.get',selection(saved))).toEqual(saved);
  expect(request(next,'quicklinks.list',{})).toEqual([{id:literal.id,revision:5,name:literal.name,host:'example.org',webSearch:true}]);
});
it('replaces query configuration or removes it on absence while preserving literal records and enforcing CAS',async()=>{
  const {db}=await fixture(),literal=create(db,'Independent Literal'),config={queryParameter:'q',template:WEB_SEARCH_TEMPLATE};
  const search=request(db,'quicklinks.save',{expectedRevision:0,name:'Public Search',url:'https://example.org/search?keep=public',webSearch:config});
  expect(search.webSearch).toEqual(config);
  expect(()=>request(db,'quicklinks.save',{id:search.id,expectedRevision:2,name:search.name,url:search.url})).toThrowError(expect.objectContaining({reason:'conflict'}));
  const next=request(db,'quicklinks.save',{id:search.id,expectedRevision:1,name:search.name,url:search.url,webSearch:{...config,queryParameter:'Search.Query'}});
  expect(next.revision).toBe(2);expect(next.createdAt).toBe(search.createdAt);expect(next.webSearch?.queryParameter).toBe('Search.Query');
  const changed=request(db,'quicklinks.save',{id:search.id,expectedRevision:2,name:search.name,url:search.url});
  expect(changed.revision).toBe(3);expect(changed).not.toHaveProperty('webSearch');
  expect(db.prepare('SELECT web_search FROM quicklinks WHERE id=?').pluck().get(changed.id)).toBeNull();
  expect(request(db,'quicklinks.list',{}).find(row=>row.id===changed.id)).not.toHaveProperty('webSearch');
  expect(request(db,'quicklinks.get',selection(literal))).toEqual(literal);
  request(db,'quicklinks.remove',selection(changed));expect(request(db,'quicklinks.list',{})).toHaveLength(1);
});
it('uses the same name uniqueness and capacity rules for searches and never accepts query or preview history fields',async()=>{
  const {db}=await fixture(),config={queryParameter:'q',template:WEB_SEARCH_TEMPLATE},base={expectedRevision:0,name:'Public Search',url:'https://example.org/search',webSearch:config};
  const saved=request(db,'quicklinks.save',base);
  expect(()=>create(db,'ＰＵＢＬＩＣ SEARCH')).toThrowError(expect.objectContaining({reason:'quicklink-name-conflict'}));
  for(const extra of [{query:'transient argument'},{preview:'https://example.org/?q=transient'},{webSearch:{...config,query:'transient'}},{webSearch:{...config,template:'{{context.clipboard}}'}},{webSearch:{...config,queryParameter:'q&other'}},{webSearch:null}])expect(()=>request(db,'quicklinks.save',{...base,...extra})).toThrow(ContractError);
  expect(request(db,'quicklinks.get',selection(saved))).toEqual(saved);
  const inserted=db.prepare('INSERT INTO quicklinks(id,revision,name,name_key,url,created_at,updated_at) VALUES(?,1,?,?,?,?,?)');
  db.transaction(()=>{for(let n=1;n<MAX_QUICKLINKS;n++)inserted.run(randomUUID(),`Capacity ${n}`,`capacity ${n}`,saved.url,saved.createdAt,saved.updatedAt);}).immediate();
  expect(()=>request(db,'quicklinks.save',{...base,name:'One Too Many'})).toThrowError(expect.objectContaining({reason:'quicklink-limit-reached'}));
  const updated=request(db,'quicklinks.save',{...base,id:saved.id,expectedRevision:1,webSearch:{...config,queryParameter:'term'}});
  expect(updated.revision).toBe(2);expect(request(db,'quicklinks.list',{})).toHaveLength(500);
});
it.each(['{','null','{}','{"queryParameter":"q","template":"{{context.clipboard}}"}','{"queryParameter":"q","template":"{{vars.query}}","query":"public"}'])('rejects corrupt stored configuration %# without raw JSON diagnostics or partial collections',async configuration=>{
  const {db}=await fixture(),first=create(db,'Independent'),saved=create(db,'Corruptible');
  db.prepare('UPDATE quicklinks SET web_search=? WHERE id=?').run(configuration,saved.id);
  for(const operation of [()=>request(db,'quicklinks.list',{}),()=>request(db,'quicklinks.get',selection(saved)),()=>request(db,'quicklinks.save',{id:saved.id,expectedRevision:1,name:'No Partial Write',url:saved.url})])expect(operation).toThrowError(expect.objectContaining({message:'Invalid protocol message.'}));
  expect(request(db,'quicklinks.get',selection(first))).toEqual(first);
  expect(db.prepare('SELECT revision,name FROM quicklinks WHERE id=?').get(saved.id)).toEqual({revision:1,name:saved.name});
});
it('rolls back writes when a stored result contains invalid configuration',async()=>{
  const {db}=await fixture(),saved=create(db);
  db.exec("CREATE TRIGGER synthetic_bad_web_search AFTER UPDATE ON quicklinks BEGIN UPDATE quicklinks SET web_search='{}' WHERE id=NEW.id; END");
  expect(()=>request(db,'quicklinks.save',{id:saved.id,expectedRevision:1,name:'Rollback Search',url:saved.url,webSearch:{queryParameter:'q',template:WEB_SEARCH_TEMPLATE}})).toThrow(ContractError);
  expect(request(db,'quicklinks.get',selection(saved))).toEqual(saved);
  expect(db.prepare('SELECT web_search FROM quicklinks WHERE id=?').pluck().get(saved.id)).toBeNull();
});

it('stores canonical tag labels with exact versioning, summary projection, clear and reopen persistence',async()=>{
 const {db,path}=await fixture(),saved=request(db,'quicklinks.save',{expectedRevision:0,name:'Tagged public docs',url:'https://example.org/docs',tags:[' Ｗｏｒｋ ','猫','two words']});expect(saved.tags).toEqual(['Work','猫','two words']);expect(request(db,'quicklinks.list',{})).toEqual([{id:saved.id,revision:1,name:saved.name,host:'example.org',tags:saved.tags}]);
 const changed=request(db,'quicklinks.save',{id:saved.id,expectedRevision:1,name:saved.name,url:saved.url,tags:['Other']});expect(changed).toMatchObject({revision:2,tags:['Other'],createdAt:saved.createdAt});expect(()=>request(db,'quicklinks.save',{id:saved.id,expectedRevision:1,name:saved.name,url:saved.url,tags:['Stale']})).toThrow(QuicklinkRepositoryError);db.close();const next=new Sqlite(path);databases.push(next);expect(request(next,'quicklinks.get',selection(changed))).toEqual(changed);const cleared=request(next,'quicklinks.save',{id:changed.id,expectedRevision:2,name:changed.name,url:changed.url,tags:[]});expect(cleared).not.toHaveProperty('tags');expect(next.prepare('SELECT tags_json FROM quicklinks WHERE id=?').pluck().get(saved.id)).toBe('[]');
});
it.each(['["Work","ｗｏｒｋ"]','["bad,tag"]','[1]','["bad\\nlabel"]'])('rejects corrupt stored tag labels without partial results or overwritten source: %s',async tags=>{
 const {db}=await fixture(),saved=create(db);db.prepare('UPDATE quicklinks SET tags_json=? WHERE id=?').run(tags,saved.id);for(const operation of [()=>request(db,'quicklinks.list',{}),()=>request(db,'quicklinks.get',selection(saved)),()=>request(db,'quicklinks.save',{id:saved.id,expectedRevision:1,name:'Do not overwrite',url:saved.url})])expect(operation).toThrowError(expect.objectContaining({message:'Invalid protocol message.'}));expect(db.prepare('SELECT revision,name FROM quicklinks WHERE id=?').get(saved.id)).toEqual({revision:1,name:saved.name});
});

it('persists reversible pin/hide flags with CAS and preserves full saved definitions across reopen',async()=>{
 const {db,path}=await fixture(),base={expectedRevision:0,name:'Public pinned search',url:'https://example.org/search',webSearch:{queryParameter:'q',template:WEB_SEARCH_TEMPLATE},tags:['Public']},saved=request(db,'quicklinks.save',base);expect(saved).not.toHaveProperty('pinned');expect(saved).not.toHaveProperty('hidden');
 const pinned=request(db,'quicklinks.save',{...base,id:saved.id,expectedRevision:1,pinned:true}),hidden=request(db,'quicklinks.save',{...base,id:saved.id,expectedRevision:2,pinned:true,hidden:true});expect(pinned).toMatchObject({...saved,revision:2,pinned:true,updatedAt:pinned.updatedAt});expect(hidden).toMatchObject({...saved,revision:3,pinned:true,hidden:true,updatedAt:hidden.updatedAt});expect(request(db,'quicklinks.list',{})).toEqual([{id:saved.id,revision:3,name:saved.name,host:'example.org',webSearch:true,tags:['Public'],pinned:true,hidden:true}]);expect(()=>request(db,'quicklinks.save',{...base,id:saved.id,expectedRevision:2,hidden:false})).toThrow(QuicklinkRepositoryError);db.close();const next=new Sqlite(path);databases.push(next);expect(request(next,'quicklinks.get',selection(hidden))).toEqual(hidden);const shown=request(next,'quicklinks.save',{...base,id:saved.id,expectedRevision:3,pinned:false,hidden:false});expect(shown).not.toHaveProperty('pinned');expect(shown).not.toHaveProperty('hidden');expect(shown).toMatchObject({...saved,revision:4,updatedAt:shown.updatedAt});expect(next.prepare('SELECT pinned,hidden FROM quicklinks WHERE id=?').get(saved.id)).toEqual({pinned:0,hidden:0});
});
it('rejects nonboolean stored presentation flags without publishing or overwriting corrupt source',async()=>{
 const {db}=await fixture(),saved=create(db);db.pragma('ignore_check_constraints=ON');db.prepare('UPDATE quicklinks SET pinned=2 WHERE id=?').run(saved.id);for(const operation of [()=>request(db,'quicklinks.list',{}),()=>request(db,'quicklinks.get',selection(saved)),()=>request(db,'quicklinks.save',{id:saved.id,expectedRevision:1,name:'Do not overwrite',url:saved.url})])expect(operation).toThrowError(expect.objectContaining({message:'Invalid protocol message.'}));expect(db.prepare('SELECT revision,pinned FROM quicklinks WHERE id=?').get(saved.id)).toEqual({revision:1,pinned:2});
});

const pathConfig={component:'path-segment' as const,template:WEB_SEARCH_TEMPLATE};
it('persists typed path config, labels and preferences through reopen and explicit path/query/literal conversion with exact CAS',async()=>{
 const {db,path}=await fixture(),saved=request(db,'quicklinks.save',{expectedRevision:0,name:'Public path',url:'https://example.invalid/base?fixed=yes#part',pathArgument:pathConfig,tags:['Work'],pinned:true,hidden:true});expect(saved.pathArgument).toEqual(pathConfig);expect(request(db,'quicklinks.list',{})).toEqual([{id:saved.id,revision:1,name:saved.name,host:'example.invalid',pathArgument:true,tags:['Work'],pinned:true,hidden:true}]);db.close();const next=new Sqlite(path);databases.push(next);expect(request(next,'quicklinks.get',selection(saved))).toEqual(saved);
 const query=request(next,'quicklinks.save',{id:saved.id,expectedRevision:1,name:saved.name,url:saved.url,webSearch:{queryParameter:'q',template:WEB_SEARCH_TEMPLATE},tags:saved.tags,pinned:true,hidden:true});expect(query).not.toHaveProperty('pathArgument');expect(query).toMatchObject({id:saved.id,revision:2,createdAt:saved.createdAt,tags:['Work'],pinned:true,hidden:true});expect(()=>request(next,'quicklinks.save',{id:saved.id,expectedRevision:1,name:saved.name,url:saved.url,pathArgument:pathConfig})).toThrow(QuicklinkRepositoryError);const literal=request(next,'quicklinks.save',{id:saved.id,expectedRevision:2,name:saved.name,url:saved.url,tags:saved.tags,pinned:true,hidden:true});expect(literal).not.toHaveProperty('webSearch');expect(literal).not.toHaveProperty('pathArgument');
});
it('rejects corrupt path configuration and dual stored kinds before publishing or overwriting source',async()=>{
 const {db}=await fixture(),saved=create(db);db.prepare('UPDATE quicklinks SET path_argument=? WHERE id=?').run('{"component":"host","template":"{{vars.query}}"}',saved.id);for(const operation of [()=>request(db,'quicklinks.get',selection(saved)),()=>request(db,'quicklinks.list',{}),()=>request(db,'quicklinks.save',{id:saved.id,expectedRevision:1,name:saved.name,url:saved.url})])expect(operation).toThrow(ContractError);db.prepare('UPDATE quicklinks SET path_argument=? WHERE id=?').run(JSON.stringify(pathConfig),saved.id);expect(()=>db.prepare('UPDATE quicklinks SET web_search=? WHERE id=?').run(JSON.stringify({queryParameter:'q',template:WEB_SEARCH_TEMPLATE}),saved.id)).toThrow();
});

const clockConfig={queryParameter:'when',source:'date' as const,timeZone:'UTC' as const};
it('persists typed clock definitions through reopen, preserves flags/labels and converts exclusively with exact CAS',async()=>{
 const {db,path}=await fixture(),base={name:'Public date',url:'https://example.invalid/calendar?keep=yes#part',tags:['Work'],pinned:true,hidden:true},saved=request(db,'quicklinks.save',{...base,expectedRevision:0,clock:clockConfig});
 expect(saved.clock).toEqual(clockConfig);expect(request(db,'quicklinks.list',{})).toEqual([{...selection(saved),name:saved.name,host:'example.invalid',tags:['Work'],pinned:true,hidden:true,clock:true}]);expect(db.prepare('SELECT clock_link FROM quicklinks').get()).toEqual({clock_link:JSON.stringify(clockConfig)});
 db.close();const next=new Sqlite(path);databases.push(next);expect(request(next,'quicklinks.get',selection(saved))).toEqual(saved);
 const pathLink=request(next,'quicklinks.save',{...base,id:saved.id,expectedRevision:1,pathArgument:pathConfig});expect(pathLink).not.toHaveProperty('clock');expect(pathLink).toMatchObject({...base,revision:2,createdAt:saved.createdAt,pathArgument:pathConfig});expect(next.prepare('SELECT clock_link FROM quicklinks').get()).toEqual({clock_link:null});
 expect(()=>request(next,'quicklinks.save',{...base,id:saved.id,expectedRevision:1,clock:clockConfig})).toThrow(QuicklinkRepositoryError);
 const clockLink=request(next,'quicklinks.save',{...base,id:saved.id,expectedRevision:2,clock:{...clockConfig,source:'time',timeZone:'system'}});expect(clockLink).not.toHaveProperty('pathArgument');expect(clockLink.revision).toBe(3);
 const search=request(next,'quicklinks.save',{...base,id:saved.id,expectedRevision:3,webSearch:{queryParameter:'q',template:WEB_SEARCH_TEMPLATE}});expect(search).not.toHaveProperty('clock');
 const literal=request(next,'quicklinks.save',{...base,id:saved.id,expectedRevision:4});expect(literal).not.toHaveProperty('clock');expect(request(next,'quicklinks.list',{})[0]).not.toHaveProperty('clock');
});
it('refuses snapshots in definitions and corrupt/dual clock rows without overwriting owner data or publishing partial lists',async()=>{
 const {db}=await fixture(),saved=create(db),input={id:saved.id,expectedRevision:1,name:saved.name,url:saved.url,clock:clockConfig};
 for(const patch of [{capturedAt:'2026-12-31T23:59:59.123Z'},{snapshot:{timeZone:'UTC'}},{clock:{...clockConfig,value:'2026-12-31'}},{webSearch:{queryParameter:'q',template:WEB_SEARCH_TEMPLATE}}])expect(()=>request(db,'quicklinks.save',{...input,...patch})).toThrow(ContractError);
 for(const stored of ['{','null','{}','{"queryParameter":"when","source":"clipboard","timeZone":"UTC"}']){db.prepare('UPDATE quicklinks SET clock_link=? WHERE id=?').run(stored,saved.id);for(const operation of [()=>request(db,'quicklinks.list',{}),()=>request(db,'quicklinks.get',selection(saved)),()=>request(db,'quicklinks.save',input)])expect(operation).toThrow(ContractError);expect(db.prepare('SELECT revision,name FROM quicklinks').get()).toEqual({revision:1,name:saved.name});}
 db.prepare('UPDATE quicklinks SET clock_link=? WHERE id=?').run(JSON.stringify(clockConfig),saved.id);expect(()=>db.prepare('UPDATE quicklinks SET path_argument=? WHERE id=?').run(JSON.stringify(pathConfig),saved.id)).toThrow();expect(()=>db.prepare('UPDATE quicklinks SET web_search=? WHERE id=?').run(JSON.stringify({queryParameter:'q',template:WEB_SEARCH_TEMPLATE}),saved.id)).toThrow();
});
