import { describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { randomUUID } from 'node:crypto';
import { CapabilityBroker } from '../../platform-contracts/src/capabilities.ts';
import { permissionRequirementSchema } from '../../platform-contracts/src/permissions.ts';
import { PermissionBroker } from '../src/broker.ts';
import type { Operation } from '../src/broker.ts';
import type { DecisionRecord, DecisionStore, Requirement, Principal, BrokerOutcome } from '../src/types.ts';
const principal:Principal={kind:'extension',id:'org.test.files',version:'1.0.0',integrity:'a'.repeat(64)};
const read:Requirement={permissionId:'files.read',scope:{kind:'resource',resourceId:'selected:one'}};
const submission={schemaVersion:1,operationId:'files.preview',arguments:{handle:'selected:one'}};
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
function memoryStore() {
  const records:DecisionRecord[]=[];
  const store:DecisionStore={list:async()=>structuredClone(records),put:async record=>{records.push(structuredClone(record));return structuredClone(record);},revoke:async id=>{const index=records.findIndex(r=>r.id===id);if(index<0)return false;records.splice(index,1);return true;}};
  return {store,records};
}
function fixture(overrides:Partial<Operation>={},store:DecisionStore=memoryStore().store) {
  const capabilities=new CapabilityBroker(['files.read']);
  capabilities.report({id:'files.read',state:'available',backend:'test-adapter'});
  const execute=vi.fn(async()=>({preview:'fixture'}));
  const validate=vi.fn(async()=>{});const prepare=vi.fn(async()=>{});
  const operation:Operation={contract:{id:'files.preview',effect:'read',externallyCommunicating:false,queryAllowed:true,retrySafe:true,permissionIds:['files.read']},arguments:z.strictObject({handle:z.string()}),capabilities:['files.read'],requirements:args=>[{permissionId:'files.read',scope:{kind:'resource',resourceId:(args as {handle:string}).handle}}],validate,prepare,execute,...overrides};
  const broker=new PermissionBroker({store,capabilities,operations:[operation]});
  return {broker,capabilities,execute,validate,prepare,operation};
}
async function prompt(_broker:PermissionBroker,session:{submit(value:unknown):Promise<BrokerOutcome>}) {
  const result=await session.submit(submission);expect(result.outcome).toBe('permission-required');
  if(result.outcome!=='permission-required')throw new Error('Missing prompt.');
  return result.prompt;
}
async function granted(overrides:Partial<Operation>={},store?:DecisionStore) {
  const f=fixture(overrides,store);const identity={};await f.broker.connect(identity,principal,[read]);
  const session=f.broker.begin(identity,{source:'explicit-user-action'});
  const approval=await prompt(f.broker,session);await f.broker.decide(approval.id,'once');
  return {...f,identity,session};
}

describe('F3-01 trusted permission boundaries',()=>{
  it('rejects spoofed principal/context/operation metadata and unknown connection identity',async()=>{
    const f=await granted();
    expect(()=>f.broker.begin({}, {source:'explicit-user-action'})).toThrow('Connection unavailable');
    expect(await f.session.submit({...submission,principal:{kind:'builtin',id:'host'}})).toMatchObject({outcome:'failed',reasonCode:'invalid-request'});
    expect(f.execute).not.toHaveBeenCalled();f.broker.close();
  });
  it('copies trusted principal/declarations and retains exact scope',async()=>{
    const f=fixture();const identity={};const copy={...principal};const declared=structuredClone([read]);await f.broker.connect(identity,copy,declared);
    copy.id='changed';declared[0]!.permissionId='files.write';
    const session=f.broker.begin(identity,{source:'explicit-user-action'});const approval=await prompt(f.broker,session);
    expect(approval.principal.id).toBe(principal.id);approval.requirements[0]!.scope={kind:'global'};
    await f.broker.decide(approval.id,'once');expect(await session.submit(submission)).toMatchObject({outcome:'completed'});
    expect(f.validate.mock.calls.length).toBe(2);expect(f.prepare).toHaveBeenCalledOnce();f.broker.close();
  });
  it('does not permit begin while durable decisions are still loading',async()=>{
    const f=fixture({}, {list:()=>new Promise(()=>{}),put:async r=>r,revoke:async()=>true});const identity={};void f.broker.connect(identity,principal,[read]);
    expect(()=>f.broker.begin(identity,{source:'explicit-user-action'})).toThrow();f.broker.close();
  });
  it('binds once approval to exactly one invocation and prevents replay',async()=>{
    const f=await granted();expect(await f.session.submit(submission)).toMatchObject({outcome:'completed'});
    expect(await f.session.submit(submission)).toMatchObject({outcome:'denied',reasonCode:'invocation-used'});
    const other=f.broker.begin(f.identity,{source:'explicit-user-action'});expect(await other.submit(submission)).toMatchObject({outcome:'permission-required'});
    expect(f.execute).toHaveBeenCalledOnce();f.broker.close();
  });
  it('does not transfer approval to changed arguments or undeclared handles',async()=>{
    const f=await granted();expect(await f.session.submit({...submission,arguments:{handle:'selected:other'}})).toMatchObject({outcome:'denied',reasonCode:'invocation-request-changed'});
    const other=f.broker.begin(f.identity,{source:'explicit-user-action'});expect(await other.submit({...submission,arguments:{handle:'selected:other'}})).toMatchObject({outcome:'denied',reasonCode:'undeclared-permission'});expect(f.execute).not.toHaveBeenCalled();f.broker.close();
  });
  it('restores exact persistent decisions but not changed version/integrity/declarations',async()=>{
    const memory=memoryStore();const f=fixture({},memory.store);const identity={};await f.broker.connect(identity,principal,[read]);
    const session=f.broker.begin(identity,{source:'explicit-user-action'});const approval=await prompt(f.broker,session);expect(await f.broker.decide(approval.id,'persistent')).toEqual({outcome:'recorded'});
    expect(memory.records).toHaveLength(1);expect(await session.submit(submission)).toMatchObject({outcome:'completed'});f.broker.disconnect(identity);
    const restored={};await f.broker.connect(restored,principal,[read]);expect(await f.broker.begin(restored,{source:'explicit-user-action'}).submit(submission)).toMatchObject({outcome:'completed'});
    const expanded={};await f.broker.connect(expanded,principal,[read,{permissionId:'files.write',scope:read.scope}]);expect(await f.broker.begin(expanded,{source:'explicit-user-action'}).submit(submission)).toMatchObject({outcome:'permission-required'});
    await expect(f.broker.connect({}, {...principal,version:'2.0.0'},[read])).rejects.toThrow('storage unavailable');
    await expect(f.broker.connect({}, {...principal,integrity:'b'.repeat(64)},[read])).rejects.toThrow('storage unavailable');f.broker.close();
  });
  it('durably denies and does not dispatch a rejected prompt',async()=>{
    const memory=memoryStore();const f=fixture({},memory.store);const identity={};await f.broker.connect(identity,principal,[read]);const session=f.broker.begin(identity,{source:'explicit-user-action'});const approval=await prompt(f.broker,session);
    expect(await f.broker.decide(approval.id,'deny')).toEqual({outcome:'recorded'});expect(memory.records[0]!.decision).toBe('deny');
    expect(await f.broker.begin(identity,{source:'explicit-user-action'}).submit(submission)).toMatchObject({outcome:'denied',reasonCode:'permission-denied'});expect(f.execute).not.toHaveBeenCalled();f.broker.close();
  });
  it('fails closed after persistent write failure with actionable remediation',async()=>{
    const f=fixture({}, {list:async()=>[],put:async()=>{throw new Error('private-token');},revoke:async()=>true});const identity={};await f.broker.connect(identity,principal,[read]);const session=f.broker.begin(identity,{source:'explicit-user-action'});const approval=await prompt(f.broker,session);
    expect(await f.broker.decide(approval.id,'persistent')).toEqual({outcome:'unavailable',remediationAction:'retry-storage'});
    expect(await session.submit(submission)).toMatchObject({outcome:'cancelled',effectOutcome:'not-dispatched',remediationAction:'retry-storage'});expect(f.execute).not.toHaveBeenCalled();f.broker.close();
  });
  it('rejects durable record substitution without enabling partial cache',async()=>{
    const f=fixture({}, {list:async()=>[],put:async r=>({...r,scope:{kind:'resource',resourceId:'another'}}),revoke:async()=>true});const identity={};await f.broker.connect(identity,principal,[read]);const session=f.broker.begin(identity,{source:'explicit-user-action'});const approval=await prompt(f.broker,session);
    expect(await f.broker.decide(approval.id,'persistent')).toMatchObject({outcome:'unavailable',remediationAction:'retry-storage'});expect(f.execute).not.toHaveBeenCalled();f.broker.close();
  });
  it('revokes pending effects immediately even while durable deletion waits',async()=>{
    const memory=memoryStore();let release!:()=>void;memory.store.revoke=()=>new Promise(resolve=>{release=()=>resolve(true);});
    let signal:AbortSignal|undefined;const f=fixture({execute:async(_request,lease)=>{signal=lease.signal;return new Promise(()=>{});}},memory.store);const identity={};await f.broker.connect(identity,principal,[read]);const session=f.broker.begin(identity,{source:'explicit-user-action'});const approval=await prompt(f.broker,session);await f.broker.decide(approval.id,'persistent');
    const result=session.submit(submission);await tick();const revocation=f.broker.revoke(identity,memory.records[0]!.id);
    expect(signal!.aborted).toBe(true);expect(await result).toMatchObject({outcome:'cancelled',effectOutcome:'unknown',automaticReplay:false,requiresReview:true,remediationAction:'request-permission-again'});release();expect(await revocation).toBe(true);f.broker.close();
  });
  it('blocks reconnect/loading connections and grant admission until asynchronous revocation settles',async()=>{
    const memory=memoryStore();const f=fixture({},memory.store);const identity={};await f.broker.connect(identity,principal,[read]);
    const session=f.broker.begin(identity,{source:'explicit-user-action'});const approval=await prompt(f.broker,session);await f.broker.decide(approval.id,'persistent');
    const originalList=memory.store.list;let releaseRead!:(records:DecisionRecord[])=>void;
    const captured=structuredClone(memory.records);memory.store.list=()=>new Promise(resolve=>{releaseRead=resolve;});
    const loading=f.broker.connect({},principal,[read]);const rejected=expect(loading).rejects.toThrow('storage unavailable');
    let releaseDelete!:()=>void;memory.store.revoke=()=>new Promise(resolve=>{releaseDelete=()=>{memory.records.length=0;resolve(true);};});
    const revocation=f.broker.revoke(identity,memory.records[0]!.id);
    await expect(f.broker.connect({},principal,[read])).rejects.toThrow('requires recovery');
    expect(()=>f.broker.begin(identity,{source:'explicit-user-action'})).toThrow('Connection unavailable');
    releaseRead(captured);await rejected;releaseDelete();expect(await revocation).toBe(true);
    memory.store.list=originalList;const reconnected={};await f.broker.connect(reconnected,principal,[read]);
    expect(await f.broker.begin(reconnected,{source:'explicit-user-action'}).submit(submission)).toMatchObject({outcome:'permission-required'});f.broker.close();
  });
  it('holds admission closed until a concurrent late grant and its cleanup both settle',async()=>{
    const memory=memoryStore();const f=fixture({},memory.store);const identity={};await f.broker.connect(identity,principal,[read]);
    const session=f.broker.begin(identity,{source:'explicit-user-action'});const approval=await prompt(f.broker,session);
    let releasePut!:()=>void;memory.store.put=record=>new Promise(resolve=>{releasePut=()=>{memory.records.push(record);resolve(record);};});
    const deciding=f.broker.decide(approval.id,'persistent');f.broker.disconnect(identity);
    await expect(f.broker.connect({},principal,[read])).rejects.toThrow();
    let releaseCleanup!:()=>void;memory.store.revoke=()=>new Promise(resolve=>{releaseCleanup=()=>{memory.records.length=0;resolve(true);};});
    releasePut();await tick();await expect(f.broker.connect({},principal,[read])).rejects.toThrow();
    releaseCleanup();expect(await deciding).toMatchObject({outcome:'unavailable'});
    await f.broker.connect({},principal,[read]);f.broker.close();
  });
  it('disconnect cancels dispatched work and refuses stale reconnect closure',async()=>{
    let resolve!:(value:unknown)=>void;const f=await granted({execute:async()=>new Promise(r=>{resolve=r;})});
    const pending=f.session.submit(submission);await tick();f.broker.disconnect(f.identity);expect(await pending).toMatchObject({outcome:'cancelled',effectOutcome:'unknown',remediationAction:'reconnect'});
    await f.broker.connect(f.identity,principal,[read]);resolve({late:true});expect(await f.session.submit(submission)).toMatchObject({outcome:'cancelled'});f.broker.close();
  });
  it('capability generation invalidates prompts and work even if next state is available',async()=>{
    const f=await granted({validate:async()=>new Promise(()=>{})});const pending=f.session.submit(submission);await tick();f.capabilities.report({id:'files.read',state:'available',backend:'same-adapter'});
    expect(await pending).toMatchObject({outcome:'cancelled',effectOutcome:'not-dispatched',remediationAction:'refresh-capability'});expect(f.execute).not.toHaveBeenCalled();f.broker.close();
  });
  it.each(['permission-required','component-required','unsupported','temporarily-unavailable'] as const)('exposes %s and remediation without dispatch',async state=>{
    const f=fixture();f.capabilities.report({id:'files.read',state,backend:null,reasonCode:'probe-result',remediationAction:'configure-backend'});const identity={};await f.broker.connect(identity,principal,[read]);
    expect(await f.broker.begin(identity,{source:'explicit-user-action'}).submit(submission)).toMatchObject({outcome:'unavailable',capability:{state},remediationAction:'configure-backend'});expect(f.execute).not.toHaveBeenCalled();f.broker.close();
  });
  it('query rejects writes but permits authorized declared read operations',async()=>{
    const f=fixture();const identity={};await f.broker.connect(identity,principal,[read]);const query=f.broker.begin(identity,{source:'query'});const approval=await prompt(f.broker,query);await f.broker.decide(approval.id,'once');expect(await query.submit(submission)).toMatchObject({outcome:'completed'});f.broker.close();
    const write=fixture({contract:{...f.operation.contract,effect:'write'}});await write.broker.connect(identity,principal,[read]);expect(await write.broker.begin(identity,{source:'query'}).submit(submission)).toMatchObject({outcome:'denied',reasonCode:'query-effect-forbidden'});expect(write.execute).not.toHaveBeenCalled();write.broker.close();
  });
  it('model tool requires trusted approved intent; background requires separate permission',async()=>{
    const f=fixture();const identity={};await f.broker.connect(identity,principal,[read]);expect(await f.broker.begin(identity,{source:'model-tool'}).submit(submission)).toMatchObject({outcome:'denied',reasonCode:'missing-approved-intent'});
    expect(await f.broker.begin(identity,{source:'background'}).submit(submission)).toMatchObject({outcome:'denied',reasonCode:'undeclared-permission'});f.broker.close();
  });
  it('rechecks resource/target validity after durable preparation before effect',async()=>{
    let calls=0;const f=await granted({validate:async()=>{if(++calls===2)throw new Error('stale handle');}});expect(await f.session.submit(submission)).toMatchObject({outcome:'failed',effectOutcome:'not-dispatched'});expect(f.execute).not.toHaveBeenCalled();f.broker.close();
  });
  it('requires lease revalidation for subsequent effect and stops after cancellation',async()=>{
    let revalidate!:(()=>Promise<void>);const f=await granted({execute:async(_r,lease)=>{revalidate=lease.revalidate;return new Promise(()=>{});}});const result=f.session.submit(submission);await tick();f.session.cancel();await result;
    await expect(revalidate()).rejects.toThrow('Authority expired');f.broker.close();
  });
  it('applies bounded deadline without waiting for an uncooperative handler',async()=>{
    vi.useFakeTimers();try {const f=await granted({execute:async()=>new Promise(()=>{})});const pending=f.session.submit(submission);await vi.advanceTimersByTimeAsync(30_000);expect(await pending).toMatchObject({outcome:'cancelled',effectOutcome:'unknown',automaticReplay:false});f.broker.close();}finally{vi.useRealTimers();}
  });
  it('cleans a late persistent grant after the connection is disconnected',async()=>{
    let release!:(record:DecisionRecord)=>void;let record!:DecisionRecord;const revoke=vi.fn(async()=>true);
    const f=fixture({}, {list:async()=>[],put:r=>{record=r;return new Promise(resolve=>{release=resolve;});},revoke});const identity={};await f.broker.connect(identity,principal,[read]);const session=f.broker.begin(identity,{source:'explicit-user-action'});const approval=await prompt(f.broker,session);const pending=f.broker.decide(approval.id,'persistent');f.broker.disconnect(identity);release(record);
    expect(await pending).toMatchObject({outcome:'unavailable'});expect(revoke).toHaveBeenCalledWith(record.id);f.broker.close();
  });
  it('audit includes only safe operational fields and strips content/errors',async()=>{
    const f=await granted({execute:async()=>{throw new Error('secret private path /home/private');}});expect(await f.session.submit(submission)).toMatchObject({outcome:'failed',reasonCode:'operation-failed'});
    const serialized=JSON.stringify(f.broker.audit());for(const forbidden of ['selected:one','org.test','secret','private','preview'])expect(serialized).not.toContain(forbidden);
    expect(f.broker.audit().at(-1)).toMatchObject({principalKind:'extension',outcome:'failed',permissionIds:['files.read']});f.broker.close();
  });
  it('limits registered, connected and outstanding objects',async()=>{
    const f=fixture();const identity={};await f.broker.connect(identity,principal,[read]);for(let index=0;index<256;index++)f.broker.begin(identity,{source:'query'});
    expect(()=>f.broker.begin(identity,{source:'query'})).toThrow('Connection unavailable');f.broker.close();
  });
});

describe('F3-01 capability and scope contracts',()=>{
  it('starts unprobed and invalidation never infers session availability',()=>{
    const broker=new CapabilityBroker(['input.paste']);expect(broker.get('input.paste')).toMatchObject({state:'temporarily-unavailable',generation:0,reasonCode:'not-probed'});
    broker.report({id:'input.paste',state:'available',backend:'explicit-probe'});const snapshot=broker.snapshot();snapshot[0]!.state='unsupported';expect(broker.get('input.paste').state).toBe('available');broker.invalidate();expect(broker.get('input.paste')).toMatchObject({state:'temporarily-unavailable',generation:2});
  });
  it('isolates subscriber failures and rejects unregistered capability reports',()=>{
    const broker=new CapabilityBroker(['input.paste']);const listener=vi.fn();broker.subscribe(()=>{throw new Error();});broker.subscribe(listener);broker.invalidate();expect(listener).toHaveBeenCalledOnce();expect(()=>broker.report({id:'unknown',state:'available',backend:'test'})).toThrow();
  });
  it.each(['files.read','files.write','network.fetch','network.local','clipboard.history','input.paste','input.shortcut','applications.launch','windows.control','scripts.execute'])('rejects global scope for %s',permissionId=>{
    expect(permissionRequirementSchema.safeParse({permissionId,scope:{kind:'global'}}).success).toBe(false);
  });
  it('requires exact canonical network origins and separate private-origin grant',()=>{
    for(const origin of ['https://user:pass@example.com','https://example.com/','https://example.com/path','https://EXAMPLE.com','file:///tmp','https://example.com#secret'])expect(permissionRequirementSchema.safeParse({permissionId:'network.fetch',scope:{kind:'origin',origin}}).success).toBe(false);
    expect(permissionRequirementSchema.safeParse({permissionId:'network.fetch',scope:{kind:'origin',origin:'https://example.com'}}).success).toBe(true);
    expect(permissionRequirementSchema.safeParse({permissionId:'network.local',scope:{kind:'origin',origin:'http://127.0.0.1'}}).success).toBe(true);
  });
  it('supports scoped file-open and session-window handle without application-wide window grant',()=>{
    expect(permissionRequirementSchema.safeParse({permissionId:'applications.launch',scope:{kind:'resource',resourceId:randomUUID()}}).success).toBe(true);
    expect(permissionRequirementSchema.safeParse({permissionId:'windows.control',scope:{kind:'application',applicationId:'test'}}).success).toBe(false);
    expect(permissionRequirementSchema.safeParse({permissionId:'windows.control',scope:{kind:'resource',resourceId:'window:session-one'}}).success).toBe(true);
  });
});
