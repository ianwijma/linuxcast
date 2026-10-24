import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, stat, writeFile, chmod, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import Database from 'better-sqlite3';
import { StorageOwner } from '../src/owner.ts';
import { foundationMigrations, schemaVersion } from '../src/migrations.ts';
import { createStorageClient } from '../src/client.ts';
import { serveStorage } from '../src/service.ts';
import { defaultDataDirectory } from '../src/paths.ts';

const directories: string[] = [];
const owners: StorageOwner[] = [];
const children: ChildProcess[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) {
    const exit = once(child, 'exit'); child.kill('SIGKILL'); await exit;
  }
  for (const owner of owners.splice(0)) await owner.close();
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function directory() { const dir = await mkdtemp(join(tmpdir(), 'linuxcast-storage-test-')); directories.push(dir); return dir; }
async function open(dir: string) { const owner = await StorageOwner.open({ dataDirectory: dir, applicationBuild: 'fixture-build' }); owners.push(owner); return owner; }
function request(owner: StorageOwner, method: string, params: unknown) {
  return owner.request({ schemaVersion: 1, requestId: randomUUID(), method, params }).result;
}
function child(file: string, args: string[]) {
  const proc = fork(new URL(file, import.meta.url), args, { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  children.push(proc); return proc;
}
async function message(proc: ChildProcess, kind: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Child response timeout.')); }, 10_000);
    function cleanup() { clearTimeout(timer); proc.off('message', listener); proc.off('exit', exited); }
    function exited() { cleanup(); reject(new Error('Child exited before response.')); }
    function listener(value: unknown) {
      if (value && typeof value === 'object' && 'kind' in value && value.kind === kind) { cleanup(); resolve(value as Record<string, unknown>); }
    }
    proc.on('message', listener); proc.once('exit', exited);
  });
}
const timestamp = '2026-01-01T00:00:00.000Z';
function conversation() { return { schemaVersion: 1 as const, id: randomUUID(), revision: 1, title: 'Synthetic conversation', projectId: null,
  pinned: false, archived: false, trashedAt: null, createdAt: timestamp, modifiedAt: timestamp }; }
function revisionRecord(conversationId: string) {
  return { schemaVersion: 1 as const, id: randomUUID(), revision: 1, createdAt: timestamp, modifiedAt: timestamp,
    conversationId, messageId: randomUUID(), branchId: randomUUID(), parentRevisionId: null as string | null,
    message: { role: 'user' as const, parts: [{ type: 'text' as const, text: 'Synthetic fixture content' }] } };
}
describe('F2-01 real SQLite storage owner', () => {
  it('reports supported SQLite, persists typed content, and uses private WAL/FULL/foreign-key configuration', async () => {
    const dir = await directory(); const owner = await open(dir);
    const [major, minor, patch] = owner.sqliteVersion.split('.').map(Number);
    expect(major! > 3 || (major === 3 && (minor! > 51 || (minor === 51 && patch! >= 3)))).toBe(true);
    expect(owner.version).toBe(1);
    const result = request(owner, 'settings.set', { id: 'ui.theme', value: 'dark', expectedRevision: 0 });
    expect(result).toMatchObject({ revision: 1, value: 'dark' });
    expect((await stat(join(dir, 'linuxcast.db'))).mode & 0o777).toBe(0o600);
    expect((await stat(join(dir, 'backups'))).mode & 0o777).toBe(0o700);
    await owner.confirmSuccessfulLaunch(); await owner.close();
    const reopened = await open(dir);
    expect(request(reopened, 'settings.get', { id: 'ui.theme' })).toMatchObject({ value: 'dark' });
    const db = new Database(join(dir, 'linuxcast.db'), { readonly: true });
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal'); db.close();
  });
  it('rejects a competing owner before opening SQLite, and canonical aliases share one lock', async () => {
    const dir = await directory(); const owner = await open(dir);
    await expect(StorageOwner.open({ dataDirectory: dir, applicationBuild: 'second' })).rejects.toMatchObject({reason:'owner-already-running'});
    await expect(StorageOwner.open({ dataDirectory: join(dir, '.'), applicationBuild: 'second' })).rejects.toMatchObject({reason:'owner-already-running'});
    await owner.close(); expect((await open(dir)).version).toBe(1);
  });
  it('holds ownership across processes and kernel releases the lock after SIGKILL', async () => {
    const dir = await directory(); const proc = child('./fixtures/crash-owner.ts', [dir, 'owner']);
    await message(proc, 'ready');
    await expect(StorageOwner.open({ dataDirectory: dir, applicationBuild: 'competitor' })).rejects.toMatchObject({reason:'owner-already-running'});
    const exit = once(proc, 'exit'); proc.kill('SIGKILL'); await exit;
    expect((await open(dir)).version).toBe(1);
  });
  it('many concurrent IPC clients write through one owner with no lost usage increments', async () => {
    const dir = await directory(); const proc = child('../src/utility.ts', []);
    const ready = message(proc, 'ready'); proc.send({kind:'initialize', dataDirectory:dir, applicationBuild:'fixture'});
    expect((await ready).ownerPid).toBe(proc.pid);
    const clients = Array.from({length: 4}, () => createStorageClient({
      send: value => { proc.send(value as object); },
      onMessage: listener => { proc.on('message', listener); return () => proc.off('message', listener); },
    }));
    const results = await Promise.all(Array.from({length: 80}, (_, i) => clients[i % clients.length]!.request('commands.recordUse', {commandId:'builtin.fixture'})));
    expect(new Set(results.map(r => r.useCount)).size).toBe(80);
    expect(await clients[0]!.request('commands.getUsage', {commandId:'builtin.fixture'})).toMatchObject({useCount:80});
    await expect(StorageOwner.open({dataDirectory:dir,applicationBuild:'other'})).rejects.toMatchObject({reason:'owner-already-running'});
    clients.forEach(c => c.disconnect());
  });
  it('rejects coerced setting arrays and oversized recovery manifests before parsing', async () => {
    const dir=await directory(); const owner=await open(dir);
    expect(()=>request(owner,'settings.set',{id:'ui.theme',value:['dark'],expectedRevision:0})).toThrow('invalid-request');
    expect(()=>request(owner,'settings.get',{id:['ui.theme']})).toThrow('invalid-request');
    expect(request(owner,'settings.get',{id:'ui.theme'})).toBeNull(); await owner.close();
    const manifest=(await readdir(join(dir,'backups'))).find(f=>f.endsWith('.json'))!;
    await writeFile(join(dir,'backups',manifest),' '.repeat(4097));
    await expect(open(dir)).rejects.toMatchObject({reason:'recovery-required'});
  });
  it.each(['before-initialize','during-initialize','after-ready'])('shutdown %s acknowledges and exits the actual owner process', async phase => {
    const dir=await directory(); const proc=child('../src/utility.ts',[]);
    if(phase==='after-ready') {
      const ready=message(proc,'ready'); proc.send({kind:'initialize',dataDirectory:dir,applicationBuild:'fixture'}); await ready;
    }
    const closed=message(proc,'closed'); const exit=once(proc,'exit');
    if(phase==='during-initialize') proc.send({kind:'initialize',dataDirectory:dir,applicationBuild:'fixture'});
    proc.send({kind:'shutdown'}); await closed; expect((await exit)[0]).toBe(0);
    expect((await open(dir)).version).toBe(1);
  });
  it('optimistic writes reject stale revisions atomically', async () => {
    const owner = await open(await directory());
    request(owner, 'settings.set', {id:'ui.theme',value:'light',expectedRevision:0});
    expect(() => request(owner, 'settings.set', {id:'ui.theme',value:'dark',expectedRevision:0})).toThrow('conflict');
    expect(request(owner,'settings.get',{id:'ui.theme'})).toMatchObject({revision:1,value:'light'});
  });
  it('enforces immutable AI revision identities, sequencing and conversation foreign keys', async () => {
    const owner = await open(await directory()); const conv = conversation(); const record = revisionRecord(conv.id);
    expect(() => request(owner,'ai.messages.appendRevision',{record})).toThrow();
    request(owner,'ai.conversations.put',{record:conv,expectedRevision:0});
    expect(request(owner,'ai.messages.appendRevision',{record})).toEqual(record);
    expect(() => request(owner,'ai.messages.appendRevision',{record:{...record,message:{role:'user',parts:[{type:'text',text:'Changed'}]}}})).toThrow('conflict');
    expect(() => request(owner,'ai.messages.appendRevision',{record:{...record,id:randomUUID(),revision:3,parentRevisionId:record.id}})).toThrow('conflict');
    const other = conversation(); request(owner,'ai.conversations.put',{record:other,expectedRevision:0});
    expect(() => request(owner,'ai.messages.appendRevision',{record:{...record,id:randomUUID(),conversationId:other.id,revision:2,parentRevisionId:record.id}})).toThrow('conflict');
    expect(request(owner,'ai.messages.list',{conversationId:conv.id,limit:10})).toEqual([record]);
  });
  it('backs up committed WAL contents using the SQLite API before upgrade', async () => {
    const dir = await directory(); const owner = await open(dir);
    const reader = new Database(join(dir,'linuxcast.db'), {readonly:true}); reader.exec('BEGIN'); reader.prepare('SELECT * FROM settings').all();
    request(owner,'settings.set',{id:'ui.theme',value:'dark',expectedRevision:0}); await owner.confirmSuccessfulLaunch(); await owner.close();
    expect((await stat(join(dir,'linuxcast.db-wal'))).size).toBeGreaterThan(32);
    const backup = vi.spyOn(Database.prototype, 'backup');
    const migrations = [...await foundationMigrations(), {version:2,sql:'CREATE TABLE upgrade_fixture (id INTEGER PRIMARY KEY) STRICT;'}];
    const upgraded = await StorageOwner.open({dataDirectory:dir,applicationBuild:'fixture-v2',migrations}); owners.push(upgraded);
    expect(backup).toHaveBeenCalledOnce(); expect(upgraded.version).toBe(2);
    const manifests = await Promise.all((await readdir(join(dir,'backups'))).filter(f=>f.endsWith('.json')).map(async f=>JSON.parse(await readFile(join(dir,'backups',f),'utf8')) as {id:string;fromVersion:number;sha256:string}));
    const manifest = manifests.find(m=>m.fromVersion===1)!; const path = join(dir,'backups',`${manifest.id}.db`);
    expect(createHash('sha256').update(await readFile(path)).digest('hex')).toBe(manifest.sha256);
    const snapshot = new Database(path,{readonly:true});
    expect(schemaVersion(snapshot)).toBe(1);
    expect(snapshot.prepare('SELECT value FROM settings').get()).toEqual({value:'"dark"'}); snapshot.close(); reader.close();
  });
  it('failed backup stops migration before schema changes and redacts native errors', async () => {
    const dir = await directory(); const owner = await open(dir); await owner.confirmSuccessfulLaunch(); await owner.close();
    vi.spyOn(Database.prototype,'backup').mockRejectedValue(new Error('seeded-private-content'));
    await expect(StorageOwner.open({dataDirectory:dir,applicationBuild:'v2',migrations:[...await foundationMigrations(),{version:2,sql:'CREATE TABLE never_created (id INTEGER);'}]}))
      .rejects.toMatchObject({reason:'backup-failed',message:'Storage unavailable: backup-failed.'});
    const db = new Database(join(dir,'linuxcast.db'),{readonly:true}); expect(schemaVersion(db)).toBe(1); db.close();
  });
  it('failed migration rolls back, preserves backup and requires explicit retry', async () => {
    const dir = await directory(); const owner = await open(dir);
    request(owner,'settings.set',{id:'ui.theme',value:'light',expectedRevision:0}); await owner.confirmSuccessfulLaunch(); await owner.close();
    const migration = [...await foundationMigrations(),{version:2,sql:'CREATE TABLE failure_probe (id INTEGER); INSERT INTO missing_table VALUES(1);'}];
    await expect(StorageOwner.open({dataDirectory:dir,applicationBuild:'v2',migrations:migration})).rejects.toMatchObject({reason:'migration-failed'});
    const db = new Database(join(dir,'linuxcast.db'),{readonly:true}); expect(schemaVersion(db)).toBe(1);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='failure_probe'").get()).toBeUndefined(); db.close();
    await expect(StorageOwner.open({dataDirectory:dir,applicationBuild:'old'})).rejects.toMatchObject({reason:'recovery-required'});
    const fixed = [...await foundationMigrations(),{version:2,sql:'CREATE TABLE failure_probe (id INTEGER);'}];
    const retry = await StorageOwner.open({dataDirectory:dir,applicationBuild:'fixed',migrations:fixed,retryFailedMigration:true}); owners.push(retry);
    expect(request(retry,'settings.get',{id:'ui.theme'})).toMatchObject({value:'light'});
  });
  it('interrupted migration is rolled back by SQLite and reported without automatic replay', async () => {
    const dir = await directory(); const owner = await open(dir); await owner.confirmSuccessfulLaunch(); await owner.close();
    const proc = child('./fixtures/crash-owner.ts',[dir,'transaction']); await message(proc,'inside-transaction');
    const exit = once(proc,'exit'); proc.kill('SIGKILL'); await exit;
    await expect(StorageOwner.open({dataDirectory:dir,applicationBuild:'recovery'})).rejects.toMatchObject({reason:'recovery-required'});
    const db = new Database(join(dir,'linuxcast.db'),{readonly:true}); expect(schemaVersion(db)).toBe(1);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='crash_probe'").get()).toBeUndefined(); db.close();
  });
  it('recognizes a commit completed before the final journal flush without replaying migration', async () => {
    const dir=await directory(); const owner=await open(dir); await owner.confirmSuccessfulLaunch(); await owner.close();
    const proc=child('./fixtures/crash-owner.ts',[dir,'commit']); await message(proc,'after-commit');
    const exit=once(proc,'exit'); proc.kill('SIGKILL'); await exit;
    const migrations=[...await foundationMigrations(),{version:2,sql:'CREATE TABLE crash_probe (id INTEGER) STRICT;'}];
    const recovered=await StorageOwner.open({dataDirectory:dir,applicationBuild:'recovery',migrations}); owners.push(recovered);
    expect(recovered.version).toBe(2); await recovered.confirmSuccessfulLaunch();
  });
  it('stops before required backup when disk availability is insufficient', async () => {
    const dir=await directory(); const owner=await open(dir); await owner.confirmSuccessfulLaunch(); await owner.close();
    const real=Database.prototype.pragma;
    vi.spyOn(Database.prototype,'pragma').mockImplementation(function(this: Database.Database, source: string, options?: Database.PragmaOptions) {
      return source === 'page_count' ? Number.MAX_SAFE_INTEGER : real.call(this, source, options);
    });
    const backup=vi.spyOn(Database.prototype,'backup');
    await expect(StorageOwner.open({dataDirectory:dir,applicationBuild:'v2',migrations:[...await foundationMigrations(),{version:2,sql:'CREATE TABLE disk_fixture (id INTEGER);'}]}))
      .rejects.toMatchObject({reason:'insufficient-space'});
    expect(backup).not.toHaveBeenCalled();
  });
  it('SQLITE_FULL rolls back migration without deleting original records', async () => {
    const dir=await directory(); const owner=await open(dir); request(owner,'settings.set',{id:'ui.theme',value:'dark',expectedRevision:0});
    await owner.confirmSuccessfulLaunch(); await owner.close();
    const original=Database.prototype.exec;
    vi.spyOn(Database.prototype,'exec').mockImplementation(function(this: Database.Database, sql: string) {
      if (sql==='BEGIN IMMEDIATE') this.pragma(`max_page_count = ${Number(this.pragma('page_count',{simple:true}))+1}`);
      return original.call(this,sql);
    });
    await expect(StorageOwner.open({dataDirectory:dir,applicationBuild:'v2',migrations:[...await foundationMigrations(),{version:2,sql:'CREATE TABLE disk_fixture (body BLOB); INSERT INTO disk_fixture VALUES(zeroblob(1048576));'}]}))
      .rejects.toMatchObject({reason:'migration-failed'});
    const db=new Database(join(dir,'linuxcast.db'),{readonly:true}); expect(schemaVersion(db)).toBe(1);
    expect(db.prepare('SELECT value FROM settings').get()).toEqual({value:'"dark"'}); db.close();
  });
  it('retains the latest three confirmed snapshots and keeps a new unconfirmed snapshot', async () => {
    const dir=await directory(); const migrations=await foundationMigrations();
    for(let version=1;version<=5;version++) {
      if(version>1) migrations.push({version,sql:`CREATE TABLE retention_fixture_${version} (id INTEGER);`});
      const owner=await StorageOwner.open({dataDirectory:dir,applicationBuild:`v${version}`,migrations}); owners.push(owner);
      if(version<5) await owner.confirmSuccessfulLaunch(); await owner.close();
    }
    expect((await readdir(join(dir,'backups'))).filter(f=>f.endsWith('.db'))).toHaveLength(4);
    const owner=await StorageOwner.open({dataDirectory:dir,applicationBuild:'v5',migrations}); owners.push(owner);
    await owner.confirmSuccessfulLaunch();
    expect((await readdir(join(dir,'backups'))).filter(f=>f.endsWith('.db'))).toHaveLength(3);
  });
  it('validates snapshot checksums and refuses modified applied migration source', async () => {
    const dir=await directory(); const owner=await open(dir); await owner.close();
    const snapshot=(await readdir(join(dir,'backups'))).find(f=>f.endsWith('.db'))!;
    await writeFile(join(dir,'backups',snapshot),'synthetic corruption');
    await expect(open(dir)).rejects.toMatchObject({reason:'recovery-required'});
    const other=await directory(); const good=await open(other); await good.confirmSuccessfulLaunch(); await good.close();
    const migrations=await foundationMigrations(); migrations[0]!.sql+='\n-- changed applied source';
    await expect(StorageOwner.open({dataDirectory:other,applicationBuild:'changed',migrations})).rejects.toMatchObject({reason:'invalid-migration'});
  });
  it('message pagination preserves insertion order and rejects another conversation cursor', async () => {
    const owner=await open(await directory()); const conv=conversation(); request(owner,'ai.conversations.put',{record:conv,expectedRevision:0});
    const first={...revisionRecord(conv.id),id:'ffffffff-ffff-4fff-8fff-ffffffffffff'};
    const second={...revisionRecord(conv.id),id:'00000000-0000-4000-8000-000000000001'};
    request(owner,'ai.messages.appendRevision',{record:first}); request(owner,'ai.messages.appendRevision',{record:second});
    expect(request(owner,'ai.messages.list',{conversationId:conv.id,limit:1})).toEqual([first]);
    expect(request(owner,'ai.messages.list',{conversationId:conv.id,afterId:first.id,limit:1})).toEqual([second]);
    expect(()=>request(owner,'ai.messages.list',{conversationId:randomUUID(),afterId:first.id,limit:1})).toThrow('conflict');
  });
  it('newer schema refuses downgrade and retains database bytes', async () => {
    const dir=await directory(); const owner=await open(dir); await owner.confirmSuccessfulLaunch(); await owner.close();
    const db=new Database(join(dir,'linuxcast.db')); db.pragma('user_version=99'); db.close();
    const before=await readFile(join(dir,'linuxcast.db'));
    await expect(open(dir)).rejects.toMatchObject({reason:'newer-schema'});
    expect(await readFile(join(dir,'linuxcast.db'))).toEqual(before);
  });
  it('corrupt source data is preserved rather than replaced', async () => {
    const dir=await directory(); const bytes=Buffer.from('not a database: synthetic fixture');
    await writeFile(join(dir,'linuxcast.db'),bytes,{mode:0o600});
    await expect(open(dir)).rejects.toMatchObject({reason:'corrupt-database'});
    expect(await readFile(join(dir,'linuxcast.db'))).toEqual(bytes);
  });
  it('rejects permissive directories, symlink database and arbitrary repository/secret settings', async () => {
    const dir=await directory(); await chmod(dir,0o755); await expect(open(dir)).rejects.toMatchObject({reason:'private-path-required'});
    await chmod(dir,0o700); const target=join(dir,'target'); await writeFile(target,'',{mode:0o600}); await symlink(target,join(dir,'linuxcast.db'));
    await expect(open(dir)).rejects.toMatchObject({reason:'private-path-required'});
    const owner=await open(await directory());
    for (const [method,params] of [['sql.exec',{sql:'DELETE FROM settings'}],['settings.set',{id:'provider.apiKey',value:'seeded-private-content',expectedRevision:0}],['settings.get',{id:'ui.theme',path:'/other'}]] as const) {
      expect(() => request(owner,method,params)).toThrow();
      try { request(owner,method,params); } catch(error) { expect(String(error)).not.toContain('seeded-private-content'); expect(String(error)).not.toContain('DELETE'); }
    }
  });
  it('honors XDG data directory and rejects relative XDG values by using the standard fallback', () => {
    expect(defaultDataDirectory({XDG_DATA_HOME:'/tmp/fixture-xdg'})).toBe('/tmp/fixture-xdg/linuxcast');
    expect(defaultDataDirectory({XDG_DATA_HOME:'relative'})).not.toContain('relative');
  });
  it('cancels queued requests before dispatch, rejects unknown methods and never repeats request IDs', async () => {
    const dir=await directory(); const sent: unknown[]=[]; let receive: (v:unknown)=>void=()=>{};
    const service=serveStorage({send:v=>sent.push(v),onMessage:listener=>{receive=listener;}});
    receive({kind:'initialize',dataDirectory:dir,applicationBuild:'fixture'});
    await vi.waitFor(()=>expect(sent).toEqual(expect.arrayContaining([expect.objectContaining({kind:'ready'})])));
    const r={schemaVersion:1,requestId:'cancel-fixture',method:'commands.recordUse',params:{commandId:'builtin.fixture'}};
    receive({kind:'request',request:r,deadline:Date.now()+5000}); receive({kind:'cancel',requestId:r.requestId});
    await vi.waitFor(()=>expect(sent).toEqual(expect.arrayContaining([expect.objectContaining({kind:'response',response:expect.objectContaining({outcome:'cancelled',effectOutcome:'not-dispatched'})})])));
    receive({kind:'request',request:r,deadline:Date.now()+5000});
    expect(sent.filter(v=>(v as {kind:string}).kind==='response')).toHaveLength(1); await service.close();
  });
  it.each([true,{id:'ui.theme',revision:1,value:['dark'],modifiedAt:timestamp},
    {id:'clipboard.historyEnabled',revision:1,value:false,modifiedAt:timestamp}])('malformed or mismatched completed result fails closed without replay', async result => {
    let receive:(value:unknown)=>void=()=>{}; const sent:unknown[]=[];
    const client=createStorageClient({send:value=>sent.push(value),onMessage:listener=>{receive=listener;return()=>{};}});
    const pending=client.request('settings.get',{id:'ui.theme'});
    const envelope=sent[0] as {request:{requestId:string;method:string}};
    receive({kind:'response',response:{schemaVersion:1,requestId:envelope.request.requestId,method:envelope.request.method,outcome:'completed',result}});
    await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false}); expect(sent).toHaveLength(1);
  });
  it('method result validation preserves legitimate null and typed settings', async () => {
    let receive:(value:unknown)=>void=()=>{}; const sent:unknown[]=[];
    const client=createStorageClient({send:value=>sent.push(value),onMessage:listener=>{receive=listener;return()=>{};}});
    for(const result of [null,{id:'ui.theme',revision:1,value:'dark',modifiedAt:timestamp}]) {
      const pending=client.request('settings.get',{id:'ui.theme'}); const envelope=sent.at(-1) as {request:{requestId:string;method:string}};
      receive({kind:'response',response:{schemaVersion:1,requestId:envelope.request.requestId,method:envelope.request.method,outcome:'completed',result}});
      await expect(pending).resolves.toEqual(result);
    }
    client.disconnect();
  });
  it('client disconnect reports unknown write outcome and never automatically retries', async () => {
    const sent: unknown[]=[];
    const client=createStorageClient({send:v=>sent.push(v),onMessage:()=>()=>{}});
    const result=client.request('commands.recordUse',{commandId:'builtin.fixture'}); client.disconnect();
    await expect(result).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false}); expect(sent).toHaveLength(1);
  });
});
