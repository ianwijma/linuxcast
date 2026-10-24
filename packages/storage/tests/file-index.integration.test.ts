import { afterEach, beforeAll, expect, it } from 'vitest';
import { fork, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { RootIndexer } from '@linuxcast/file-index';
import { FILE_INDEX_SCHEMA_SQL } from '@linuxcast/file-index/repository';
import { createStorageClient } from '../src/client.ts';
import { StorageOwner } from '../src/owner.ts';
import { foundationMigrations } from '../src/migrations.ts';
import { STORAGE_SCHEMA_VERSION } from '../src/schema-version.ts';
const directories: string[] = [], children: ChildProcess[] = [], jobs: RootIndexer[] = [], owners: StorageOwner[] = [];
beforeAll(() => {
  const result = spawnSync('cargo', ['build', '--locked', '--offline', '-p', 'linuxcast-platform'], {encoding:'utf8',timeout:60_000});
  expect(result.status, result.stderr).toBe(0);
}, 65_000);
afterEach(async () => {
  for (const job of jobs.splice(0)) await job.stop();
  for (const owner of owners.splice(0)) await owner.close();
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
  }
  for (const dir of directories.splice(0)) await rm(dir, {recursive:true,force:true});
});
async function directory() { const dir = await mkdtemp(join(tmpdir(), 'linuxcast-index-owner-')); directories.push(dir); return dir; }
async function open(dataDirectory: string) {
  const child = fork(new URL('../src/utility.ts', import.meta.url), [], {stdio:['ignore','ignore','ignore','ipc']}); children.push(child);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Owner fixture timeout.')); }, 10_000);
    const cleanup = () => { clearTimeout(timer); child.off('message', receive); child.off('exit', exited); };
    const receive = (value: unknown) => { if (value && typeof value === 'object' && 'kind' in value && value.kind === 'ready') {cleanup(); resolve();} };
    const exited = () => {cleanup(); reject(new Error('Owner fixture exited.'));};
    child.on('message', receive); child.once('exit', exited);
    child.send({kind:'initialize',dataDirectory,applicationBuild:'synthetic-index-owner'});
  });
  const client = createStorageClient({send:value => {child.send(value as object);}, onMessage:listener => {
    child.on('message',listener); return () => child.off('message',listener);
  }});
  return {client, close:async () => {client.disconnect(); const exited = once(child,'exit'); child.send({kind:'shutdown'}); await exited;}};
}
it('upgrades schema2 and indexes through the actual typed utility owner, preserving settings and interrupted generations', async () => {
  const data = await directory(), source = await directory(); await mkdir(join(source,'selected'));
  const selected = join(source,'selected'); await writeFile(join(selected,'before.txt'),'synthetic');
  const migrations = await foundationMigrations();
  expect(migrations[2]!.sql.trim().endsWith(FILE_INDEX_SCHEMA_SQL.trim())).toBe(true);
  const old = await StorageOwner.open({dataDirectory:data,applicationBuild:'synthetic-schema2',migrations:migrations.slice(0,2)}); owners.push(old);
  old.request({schemaVersion:1,requestId:randomUUID(),method:'settings.set',params:{id:'ui.theme',value:'dark',expectedRevision:0}});
  await old.confirmSuccessfulLaunch(); await old.close();
  const first = await open(data);
  expect(await first.client.request('settings.get',{id:'ui.theme'})).toMatchObject({value:'dark'});
  const config = {id:randomUUID(),path:selected,includeHidden:false,excludeGlobs:[],excludedDirectories:[],maxFileBytes:null};
  const job = await RootIndexer.create(first.client,config,resolve('target/debug/linuxcast-platform')); jobs.push(job);
  await job.reconcile();
  expect(await first.client.request('files.search',{query:'before',rootId:config.id,limit:10})).toMatchObject([{path:'before.txt',rootId:config.id}]);
  await rename(join(selected,'before.txt'),join(selected,'after.txt')); await job.reconcile();
  expect(await first.client.request('files.search',{query:'before',limit:10})).toEqual([]);
  const saved = (await first.client.request('files.roots.list',{}))[0]!; await job.stop();
  const scanId = randomUUID(); await first.client.request('files.scan.begin',{rootId:config.id,scanId});
  await first.client.request('files.scan.batch',{rootId:config.id,scanId,entries:[{path:'staging-only.txt',kind:'file',size:0,modifiedMs:0,device:'1',inode:'1'}]});
  await first.close();
  const second = await open(data);
  expect((await second.client.request('files.roots.list',{}))[0]).toMatchObject({generation:saved.generation,state:'degraded'});
  expect(await second.client.request('files.search',{query:'staging',limit:10})).toEqual([]);
  expect(await second.client.request('files.search',{query:'after',limit:10})).toMatchObject([{path:'after.txt'}]);
  expect(await second.client.request('files.scan.prune',{rootId:config.id})).toEqual({removed:1});
  await second.close();
  const current = await StorageOwner.open({dataDirectory:data,applicationBuild:'synthetic-schema-check'}); owners.push(current);
  expect(current.version).toBe(STORAGE_SCHEMA_VERSION);
});
