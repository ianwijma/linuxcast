import {afterEach,beforeAll,describe,expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rename,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {DataControls} from '@linuxcast/data-controls';
import type {IndexStorage} from '@linuxcast/file-index';
import {openFixtureOwner} from '../../../secrets/tests/owner-fixture.ts';
import {createFileSearchService} from '../src/service.ts';
import type {FileSearchService} from '../src/service.ts';
const directories:string[]=[],services:FileSearchService[]=[],owners:Awaited<ReturnType<typeof openFixtureOwner>>[]=[];
const executable=resolve('target/debug/linuxcast-platform');
beforeAll(()=>{
  const built=spawnSync('cargo',['build','--locked','--offline','-p','linuxcast-platform'],{encoding:'utf8',timeout:60_000});expect(built.status,built.stderr).toBe(0);
},65_000);
afterEach(async()=>{
  for(const service of services.splice(0))await service.stop();
  for(const owner of owners.splice(0))await owner.close();
  for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100});
});
async function directory() {const value=await mkdtemp(join(tmpdir(),'linuxcast-file-service-'));directories.push(value);return value;}
async function session(data:string,native=executable) {
  const owner=await openFixtureOwner(data);owners.push(owner);
  const repository:IndexStorage={request:(method,params)=>owner.client.request(method,params,{timeoutMs:1000})};
  const controls=new DataControls(owner.client);const service=createFileSearchService({repository,controls,executable:native});services.push(service);return {owner,service,controls};
}
async function watching(service:FileSearchService,id:string) {
  await expect.poll(async()=>(await service.getState()).roots.find(root=>root.id===id)?.activity,{timeout:8000}).toBe('watching');
}
describe('L2-02 actual sole-owner SQLite and Linux openat2/inotify selected-folder service',()=>{
  it('scans metadata, watches rename/update, pauses, clears, removes only derived data and reopens paused',async()=>{
    const data=await directory(),source=await directory(),selected=join(source,'selected');await mkdir(selected);
    await writeFile(join(selected,'before.txt'),'synthetic original');await writeFile(join(selected,'.excluded.txt'),'synthetic hidden');
    await writeFile(join(selected,'unreadable.txt'),'synthetic unreadable');await chmod(join(selected,'unreadable.txt'),0o000);
    const first=await session(data);const {rootId}=await first.service.addFolder(selected);
    expect((await first.service.getState()).roots).toMatchObject([{id:rootId,activity:'paused',generation:null}]);
    expect((await first.service.search({query:'before'})).results).toEqual([]);
    await first.service.startIndex(rootId);await watching(first.service,rootId);
    const original=await first.service.search({query:'before',rootId});expect(original.results).toMatchObject([{id:`${rootId}:before.txt`,path:'before.txt',kind:'file',size:18}]);
    expect(original.results[0]).not.toHaveProperty('rootPath');
    // Denied source files are skipped without stalling readable metadata.
    expect((await first.service.search({query:'unreadable'})).results).toEqual([]);
    await chmod(join(selected,'unreadable.txt'),0o600);
    expect((await first.service.search({query:'excluded'})).results).toEqual([]);
    await rename(join(selected,'before.txt'),join(selected,'after.txt'));await writeFile(join(selected,'after.txt'),'synthetic updated original');
    await expect.poll(async()=>(await first.service.search({query:'after'})).results[0]?.size,{timeout:8000}).toBe(26);
    expect((await first.service.search({query:'before'})).results).toEqual([]);
    await first.service.pauseIndex(rootId);const paused=(await first.service.getState()).roots[0]!;expect(paused.activity).toBe('paused');
    await rename(join(selected,'after.txt'),join(selected,'later.txt'));
    // Last published metadata is visibly paused/outdated until explicit resume.
    expect((await first.service.search({query:'after'})).results[0]?.generation).toBe(paused.generation);
    expect((await first.service.search({query:'later'})).results).toEqual([]);
    await first.service.stop();await first.owner.close();
    const second=await session(data);expect((await second.service.getState()).roots[0]).toMatchObject({id:rootId,activity:'paused',generation:paused.generation});
    expect((await second.service.search({query:'after'})).results).toHaveLength(1);
    await second.service.startIndex(rootId);await watching(second.service,rootId);expect((await second.service.search({query:'later'})).results).toHaveLength(1);
    expect((await second.service.search({query:'after'})).results).toEqual([]);
    expect(await second.controls.clear({category:'file-index'})).toMatchObject({outcome:'completed'});
    expect((await second.service.getState()).roots[0]).toMatchObject({id:rootId,activity:'paused',generation:null});
    expect((await second.service.search({query:'later'})).results).toEqual([]);
    expect(await readFile(join(selected,'later.txt'),'utf8')).toBe('synthetic updated original');
    await second.service.startIndex(rootId);await watching(second.service,rootId);expect((await second.service.search({query:'later'})).results).toHaveLength(1);
    await second.service.removeFolder(rootId);expect((await second.service.getState()).roots).toEqual([]);expect((await second.service.search({query:'later'})).results).toEqual([]);
    expect(await readFile(join(selected,'later.txt'),'utf8')).toBe('synthetic updated original');await chmod(join(selected,'unreadable.txt'),0o600);
    await second.service.stop();await second.owner.close();
    const third=await session(data);expect((await third.service.getState()).roots).toEqual([]);
  },30_000);
  it('shows unavailable native startup, closes it, and permits an explicit later retry',async()=>{
    const data=await directory(),source=await directory();await writeFile(join(source,'fixture.txt'),'synthetic');const active=await session(data,join(source,'missing-helper'));
    const {rootId}=await active.service.addFolder(source);await active.service.startIndex(rootId);
    await expect.poll(async()=>(await active.service.getState()).roots[0]?.activity,{timeout:8000}).toBe('unavailable');
    expect((await active.service.search({query:'fixture'})).results).toEqual([]);await active.service.pauseIndex(rootId);
    expect((await active.service.getState()).roots[0]?.activity).toBe('paused');
    expect(await active.controls.clear({category:'file-index'})).toMatchObject({outcome:'completed'});
    await active.service.stop();await active.owner.close();
    const retry=await session(data);await retry.service.startIndex(rootId);await watching(retry.service,rootId);expect((await retry.service.search({query:'fixture'})).results).toHaveLength(1);
  },20_000);
});
