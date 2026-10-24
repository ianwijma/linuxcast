import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import * as z from 'zod';
import { createStorageClient } from '../../storage/src/client.ts';
import { principalKeyMaterial } from '../../platform-contracts/src/permissions.ts';
import { CapabilityBroker } from '../../platform-contracts/src/capabilities.ts';
import { PermissionBroker } from '../src/broker.ts';
import { createDecisionStore } from '../src/storage.ts';
import type { Principal, Requirement, BrokerOutcome } from '../src/types.ts';
const directories:string[]=[];const children:ChildProcess[]=[];const brokers:PermissionBroker[]=[];
afterEach(async()=>{
  for(const broker of brokers.splice(0))broker.close();
  for(const child of children.splice(0))if(child.exitCode===null && child.signalCode===null){const exited=once(child,'exit');child.kill('SIGKILL');await exited;}
  for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});
});
async function message(child:ChildProcess,kind:string):Promise<void> {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{cleanup();reject(new Error('Fixture timeout.'));},10_000);
    const cleanup=()=>{clearTimeout(timer);child.off('message',listener);child.off('exit',exited);};
    const listener=(value:unknown)=>{if(value && typeof value==='object' && 'kind' in value && value.kind===kind){cleanup();resolve();}};
    const exited=()=>{cleanup();reject(new Error('Owner exited.'));};child.on('message',listener);child.once('exit',exited);
  });
}
async function open(directory?:string) {
  const dataDirectory=directory??await mkdtemp(join(tmpdir(),'linuxcast-f3-permissions-'));if(!directory)directories.push(dataDirectory);
  const child=fork(new URL('../../storage/src/utility.ts',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc']});children.push(child);
  const ready=message(child,'ready');child.send({kind:'initialize',dataDirectory,applicationBuild:'synthetic-permission-owner'});await ready;
  const client=createStorageClient({send:value=>{child.send(value as object);},onMessage:listener=>{child.on('message',listener);return()=>child.off('message',listener);}});
  const store=createDecisionStore(client);
  return {dataDirectory,client,store,close:async()=>{client.disconnect();const exited=once(child,'exit');child.send({kind:'shutdown'});await exited;}};
}
const principal:Principal={kind:'extension',id:'org.fixture.reader',version:'1.0.0',integrity:'a'.repeat(64)};
const read:Requirement={permissionId:'files.read',scope:{kind:'resource',resourceId:'selected:fixture'}};
const value={schemaVersion:1,operationId:'files.preview',arguments:{}};
function broker(store:ReturnType<typeof createDecisionStore>) {
  const capabilities=new CapabilityBroker([]);
  const instance=new PermissionBroker({store,capabilities,operations:[{contract:{id:'files.preview',effect:'read',externallyCommunicating:false,queryAllowed:true,retrySafe:true,permissionIds:['files.read']},arguments:z.strictObject({}),capabilities:[],requirements:()=>[read],validate:async()=>{},prepare:async()=>{},execute:async()=>({synthetic:true})}]});brokers.push(instance);return instance;
}
const key=(principal:Principal)=>createHash('sha256').update(principalKeyMaterial(principal)).digest('hex');
function promptId(result:BrokerOutcome):string {expect(result.outcome).toBe('permission-required');if(result.outcome!=='permission-required')throw new Error();return result.prompt.id;}

describe('F3-01 actual owner-backed permission lifecycle',()=>{
  it('persists allow across owner exit/reopen but never transfers it across package versions, integrity or declarations',async()=>{
    const first=await open();const firstBroker=broker(first.store);const connection={};await firstBroker.connect(connection,principal,[read]);const invocation=firstBroker.begin(connection,{source:'explicit-user-action'});
    expect(await firstBroker.decide(promptId(await invocation.submit(value)),'persistent')).toEqual({outcome:'recorded'});expect(await invocation.submit(value)).toMatchObject({outcome:'completed'});
    firstBroker.close();await first.close();const second=await open(first.dataDirectory);const secondBroker=broker(second.store);const restored={};await secondBroker.connect(restored,principal,[read]);expect(await secondBroker.begin(restored,{source:'query'}).submit(value)).toMatchObject({outcome:'completed'});
    for(const changed of [{...principal,version:'2.0.0'},{...principal,integrity:'b'.repeat(64)}]) {const connection={};await secondBroker.connect(connection,changed,[read]);expect(await secondBroker.begin(connection,{source:'query'}).submit(value)).toMatchObject({outcome:'permission-required'});}
    const expanded={};await secondBroker.connect(expanded,principal,[read,{permissionId:'files.write',scope:read.scope}]);expect(await secondBroker.begin(expanded,{source:'query'}).submit(value)).toMatchObject({outcome:'permission-required'});
    expect(await second.store.list(key(principal))).toHaveLength(1);
  });
  it('persists denial and durable revocation restores a prompt after a new owner starts',async()=>{
    const first=await open();const instance=broker(first.store);const connection={};await instance.connect(connection,principal,[read]);const invocation=instance.begin(connection,{source:'explicit-user-action'});
    expect(await instance.decide(promptId(await invocation.submit(value)),'deny')).toEqual({outcome:'recorded'});instance.close();await first.close();
    const second=await open(first.dataDirectory);const restored=broker(second.store);const identity={};await restored.connect(identity,principal,[read]);expect(await restored.begin(identity,{source:'query'}).submit(value)).toMatchObject({outcome:'denied',reasonCode:'permission-denied'});
    const records=await second.store.list(key(principal));expect(await restored.revoke(identity,records[0]!.id)).toBe(true);restored.close();await second.close();
    const third=await open(first.dataDirectory);const revoked=broker(third.store);const reconnected={};await revoked.connect(reconnected,principal,[read]);expect(await revoked.begin(reconnected,{source:'query'}).submit(value)).toMatchObject({outcome:'permission-required'});expect(await third.store.list(key(principal))).toEqual([]);
  });
  it('never persists once decisions and fails closed on actual owner disconnect',async()=>{
    const owner=await open();const instance=broker(owner.store);const connection={};await instance.connect(connection,principal,[read]);const invocation=instance.begin(connection,{source:'explicit-user-action'});
    await instance.decide(promptId(await invocation.submit(value)),'once');expect(await invocation.submit(value)).toMatchObject({outcome:'completed'});expect(await owner.store.list(key(principal))).toEqual([]);
    const next=instance.begin(connection,{source:'explicit-user-action'});const id=promptId(await next.submit(value));await owner.close();expect(await instance.decide(id,'persistent')).toEqual({outcome:'unavailable',remediationAction:'retry-storage'});expect(await next.submit(value)).toMatchObject({outcome:'cancelled',effectOutcome:'not-dispatched'});
  });
});
