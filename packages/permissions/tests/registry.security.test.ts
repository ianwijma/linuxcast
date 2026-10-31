import { afterEach, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { randomUUID } from 'node:crypto';
import { PermissionRegistry } from '../src/registry.ts';
import type { PermissionAdministrationRepository } from '../src/registry.ts';
import { CapabilityBroker } from '../../platform-contracts/src/capabilities.ts';
import type { DecisionRecord, Principal, Requirement } from '../src/types.ts';
import type { PermissionBroker, Operation } from '../src/broker.ts';
const principal:Principal={kind:'workflow',id:'public-workflow',version:'1.0.0',integrity:'a'.repeat(64)};
const read:Requirement={permissionId:'files.read',scope:{kind:'resource',resourceId:'public:selected'}};
const submission={schemaVersion:1,operationId:'files.preview',arguments:{}};
const registries:PermissionRegistry[]=[];
afterEach(async()=>{for(const registry of registries.splice(0))await registry.close();});
function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function fixture() {
  const records=new Map<string,DecisionRecord>();
  const put=vi.fn(async(record:DecisionRecord)=>{records.set(record.id,structuredClone(record));return structuredClone(record);});
  const revoke=vi.fn(async(id:string)=>records.delete(id));
  const selected=vi.fn(async(record:DecisionRecord)=>{
    const current=records.get(record.id);if(!current)return 'missing' as const;
    if(JSON.stringify(current)!==JSON.stringify(record))return 'changed' as const;
    records.delete(record.id);return 'removed' as const;
  });
  const repository={request:async(method:string,params:{record:DecisionRecord;id:string})=>{
    if(method==='permissions.list')return {records:[...records.values()].map(row=>structuredClone(row)),nextCursor:null};
    if(method==='permissions.put')return put(params.record);
    if(method==='permissions.revoke')return revoke(params.id);
    if(method==='permissions.revokeSelected')return selected(params.record);
    throw new Error('Unexpected fixture operation.');
  }} as unknown as PermissionAdministrationRepository;
  const registry=new PermissionRegistry(repository);registries.push(registry);
  return {registry,records,put,revoke,selected};
}
function operation(patch:Partial<Operation>={}):Operation {
  return {contract:{id:'files.preview',effect:'read',externallyCommunicating:false,queryAllowed:true,retrySafe:true,permissionIds:['files.read']},
    arguments:z.strictObject({}),capabilities:[],requirements:()=>[read],validate:async()=>{},prepare:async()=>{},execute:async()=>null,...patch};
}
async function approval(broker:PermissionBroker,identity:object) {
  await broker.connect(identity,principal,[read]);
  const invocation=broker.begin(identity,{source:'explicit-user-action'});
  const outcome=await invocation.submit(submission);if(outcome.outcome!=='permission-required')throw new Error('Missing fixture prompt.');
  return {invocation,prompt:outcome.prompt};
}
it('cancels every matching broker before durable deletion and blocks newly created connections',async()=>{
  const f=fixture(),held=deferred<null>(),deleting=deferred<'removed'>(),executed=vi.fn(()=>held.promise),notified=vi.fn();
  const one=f.registry.createBroker({capabilities:new CapabilityBroker([]),operations:[operation({execute:executed})],onRevoked:notified});
  const id1={},first=await approval(one,id1);await one.decide(first.prompt.id,'persistent');
  const selected=[...f.records.values()][0]!;
  const two=f.registry.createBroker({capabilities:new CapabilityBroker([]),operations:[operation({execute:executed})],onRevoked:notified}),id2={};
  await two.connect(id2,principal,[read]);
  const pending1=first.invocation.submit(submission),pending2=two.begin(id2,{source:'query'}).submit(submission);
  await vi.waitFor(()=>expect(executed).toHaveBeenCalledTimes(2));
  f.selected.mockImplementation(()=>deleting.promise);
  const removing=f.registry.revoke(selected);
  expect(notified).toHaveBeenCalledTimes(2);
  expect(await pending1).toMatchObject({outcome:'cancelled',effectOutcome:'unknown',automaticReplay:false,requiresReview:true,remediationAction:'request-permission-again'});
  expect(await pending2).toMatchObject({outcome:'cancelled',effectOutcome:'unknown'});
  const three=f.registry.createBroker({capabilities:new CapabilityBroker([]),operations:[operation()]});
  await expect(three.connect({},principal,[read])).rejects.toThrow();
  held.resolve(null);f.records.delete(selected.id);deleting.resolve('removed');expect(await removing).toBe('removed');
  await three.connect({},principal,[read]);expect(executed).toHaveBeenCalledTimes(2);
});
it('waits for a late grant write and its deletion before reopening admission',async()=>{
  const f=fixture(),writing=deferred<DecisionRecord>(),cleanup=deferred<boolean>();
  const old:DecisionRecord={schemaVersion:1,id:randomUUID(),principal,declarationHash:'b'.repeat(64),...read,decision:'allow',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'};
  f.records.set(old.id,old);
  f.put.mockImplementation(record=>{writing.resolve(record);return new Promise(done=>{finishPut=()=>{f.records.set(record.id,record);done(record);};});});
  let finishPut!:()=>void;
  f.revoke.mockImplementation(async id=>{await cleanup.promise;return f.records.delete(id);});
  const broker=f.registry.createBroker({capabilities:new CapabilityBroker([]),operations:[operation()]}),a=await approval(broker,{});
  const deciding=broker.decide(a.prompt.id,'persistent');await writing.promise;
  const removing=f.registry.revoke(old);finishPut();
  await vi.waitFor(()=>expect(f.revoke).toHaveBeenCalledTimes(1));
  expect(f.selected).not.toHaveBeenCalled();
  const other=f.registry.createBroker({capabilities:new CapabilityBroker([]),operations:[operation()]});
  await expect(other.connect({},principal,[read])).rejects.toThrow();
  cleanup.resolve(true);expect(await deciding).toEqual({outcome:'unavailable',remediationAction:'request-permission-again'});
  expect(await removing).toBe('removed');expect(f.records.size).toBe(0);
  const fresh=await approval(other,{});expect(fresh.prompt.requirements).toEqual([read]);
});
it('does not dispatch a prepared effect after revocation and never treats an external action as undone',async()=>{
  const f=fixture(),validated=deferred<void>(),execute=vi.fn(async()=>null);
  const broker=f.registry.createBroker({capabilities:new CapabilityBroker([]),operations:[operation({validate:()=>validated.promise,execute})]});
  const a=await approval(broker,{});await broker.decide(a.prompt.id,'persistent');
  const pending=a.invocation.submit(submission);
  await f.registry.revoke([...f.records.values()][0]!);
  expect(await pending).toMatchObject({outcome:'cancelled',effectOutcome:'not-dispatched',requiresReview:false});
  validated.resolve();await Promise.resolve();expect(execute).not.toHaveBeenCalled();
});
it('preserves newer choices and quarantines failed revocation across future brokers',async()=>{
  const f=fixture(),broker=f.registry.createBroker({capabilities:new CapabilityBroker([]),operations:[operation()]});
  const a=await approval(broker,{});await broker.decide(a.prompt.id,'persistent');const row=[...f.records.values()][0]!;
  f.records.set(row.id,{...row,decision:'deny',updatedAt:'2026-12-01T00:00:00.000Z'});
  expect(await f.registry.revoke(row)).toBe('changed');expect(f.records.get(row.id)?.decision).toBe('deny');
  f.selected.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE_ERROR'));
  expect(await f.registry.revoke(f.records.get(row.id)!)).toBe('unavailable');
  const fresh=f.registry.createBroker({capabilities:new CapabilityBroker([]),operations:[operation()]});
  await expect(fresh.connect({},principal,[read])).rejects.toThrow('recovery');
});
