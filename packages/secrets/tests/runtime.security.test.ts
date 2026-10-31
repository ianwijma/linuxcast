import { afterEach,expect,it,vi } from 'vitest';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SecretSessionClient } from '../src/session-client.ts';
import { CredentialRuntime } from '../src/runtime.ts';
import type { OwnedSecretSession } from '../src/runtime.ts';
import type { SecretSessionState } from '../src/session.ts';
import type { ElectronSafeStorage,SecretReferences } from '../src/types.ts';
const roots:string[]=[],runtimes:CredentialRuntime[]=[];
afterEach(async()=>{await Promise.allSettled(runtimes.splice(0).map(runtime=>runtime.close()));await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
function session(){
  let state:SecretSessionState='unavailable';const listeners=new Set<(state:SecretSessionState)=>void>();
  const saved:((state:SecretSessionState)=>void)[]=[];
  const value:OwnedSecretSession={state:()=>state,subscribe(listener){saved.push(listener);listeners.add(listener);listener(state);return ()=>{listeners.delete(listener);};},invalidate:vi.fn(()=>{state='unavailable';for(const listener of listeners)listener(state);}),stop:vi.fn(async()=>{})};
  return {value,emit(next:SecretSessionState){state=next;for(const listener of listeners)listener(next);},saved};
}
async function fixture(){
  const dataDirectory=await mkdtemp(join(tmpdir(),'linuxcast-credential-runtime-'));roots.push(dataDirectory);
  const sessions:ReturnType<typeof session>[]=[],create=vi.fn(()=>{const next=session();sessions.push(next);return next.value;});let ready=true;
  const references:SecretReferences={get:async()=>null,put:async record=>record,delete:async()=>false,list:async()=>({records:[],nextCursor:null})};
  const safeStorage:ElectronSafeStorage={isEncryptionAvailable:()=>false,getSelectedStorageBackend:()=> 'basic_text',encryptString:()=>{throw new Error('Unexpected encryption.');},decryptString:()=>{throw new Error('Unexpected decryption.');}};
  const runtime=new CredentialRuntime({helperPath:'/fixed/test-helper',dataDirectory,safeStorage,references,isStorageReady:()=>ready,createSession:create});runtimes.push(runtime);
  return {runtime,sessions,create,references,setReady(value:boolean){ready=value;runtime.notifyStorageState();}};
}
it('waits for storage readiness, coalesces opening and never invents eligibility',async()=>{
  const f=await fixture();f.setReady(false);expect(await f.runtime.store()).toBe(null);expect(f.create).not.toHaveBeenCalled();f.setReady(true);
  const first=f.runtime.store();expect(f.runtime.store()).toBe(first);const store=await first;expect(store).not.toBe(null);expect(f.create).toHaveBeenCalledTimes(1);
  expect(store!.status()).toMatchObject({state:'unavailable',reason:'session-unavailable',sessionOnlyAvailable:false});
  f.sessions[0]!.emit('observed-unlocked');expect(store!.status()).toMatchObject({state:'unavailable',reason:'insecure-backend',sessionOnlyAvailable:true});
});
it('aborts leases before restart, waits for exact old shutdown and ignores old callbacks',async()=>{
  const f=await fixture(),store=(await f.runtime.store())!;f.sessions[0]!.emit('observed-unlocked');
  const saved=await store.store({ownerKind:'provider',ownerId:'synthetic-provider'},'synthetic-runtime-secret','session-only');if(saved.outcome!=='stored')throw new Error('Fixture save failed.');
  let finish!:()=>void,signal:AbortSignal|undefined;
  const using=store.use(saved.reference,{ownerKind:'provider',ownerId:'synthetic-provider'},async(_secret,lease)=>{signal=lease;await new Promise<void>(resolve=>{finish=resolve;});});
  while(!finish)await new Promise(resolve=>setImmediate(resolve));let release!:()=>void;
  vi.mocked(f.sessions[0]!.value.stop).mockImplementation(()=>new Promise<void>(resolve=>{release=resolve;}));
  const restarting=f.runtime.retrySession();expect(f.runtime.retrySession()).toBe(restarting);expect(signal!.aborted).toBe(true);
  await new Promise(resolve=>setImmediate(resolve));expect(f.create).toHaveBeenCalledTimes(1);release();expect(await restarting).toEqual({outcome:'observing'});
  for(const listener of f.sessions[0]!.saved)listener('observed-unlocked');expect(f.runtime.sessionState()).toBe('unavailable');
  f.sessions[1]!.emit('observed-unlocked');finish();expect(await using).toMatchObject({outcome:'unavailable',status:{reason:'cancelled'}});
  expect(await store.use(saved.reference,{ownerKind:'provider',ownerId:'synthetic-provider'},async()=>{})).toEqual({outcome:'used'});
});
it('suspend denies synchronously and resume requires a new observed generation',async()=>{
  const f=await fixture(),store=(await f.runtime.store())!;f.sessions[0]!.emit('observed-unlocked');f.runtime.suspend();
  expect(f.runtime.sessionState()).toBe('unavailable');expect(await f.runtime.store()).toBe(null);expect(store.status()).toMatchObject({sessionOnlyAvailable:false});
  expect(await f.runtime.resume()).toEqual({outcome:'observing'});expect(f.create).toHaveBeenCalledTimes(2);expect(f.runtime.sessionState()).toBe('unavailable');
  f.sessions[1]!.emit('observed-unlocked');expect(f.runtime.sessionState()).toBe('observed-unlocked');
});
it('storage-owner loss aborts without waiting for another native heartbeat',async()=>{
  const f=await fixture(),store=(await f.runtime.store())!;f.sessions[0]!.emit('observed-unlocked');const states:SecretSessionState[]=[];f.runtime.subscribe(state=>states.push(state));
  f.setReady(false);expect(states.at(-1)).toBe('unavailable');expect(store.status()).toMatchObject({sessionOnlyAvailable:false});
});
it('never starts a replacement after unverified helper shutdown and reports close failure',async()=>{
  const f=await fixture();await f.runtime.store();vi.mocked(f.sessions[0]!.value.stop).mockRejectedValue(new Error('SYNTHETIC_PRIVATE_ERROR'));
  expect(await f.runtime.retrySession()).toEqual({outcome:'unavailable'});expect(f.create).toHaveBeenCalledTimes(1);
  expect(await f.runtime.retrySession()).toEqual({outcome:'unavailable'});expect(f.create).toHaveBeenCalledTimes(1);
  await expect(f.runtime.close()).rejects.toThrow('Credential shutdown unverified.');expect(f.runtime.sessionState()).toBe('unavailable');
});
it('close retains and drains an opening store and blocks later resumes',async()=>{
  const f=await fixture();let release!:()=>void;f.references.list=async()=>{await new Promise<void>(resolve=>{release=resolve;});return {records:[],nextCursor:null};};
  const opening=f.runtime.store();while(!release)await new Promise(resolve=>setImmediate(resolve));
  const closing=f.runtime.close();expect(f.runtime.close()).toBe(closing);expect(f.runtime.sessionState()).toBe('unavailable');
  let closed=false;void closing.then(()=>{closed=true;});await new Promise(resolve=>setImmediate(resolve));expect(closed).toBe(false);expect(f.sessions[0]!.value.stop).toHaveBeenCalledTimes(1);release();
  expect(await opening).toBe(null);await closing;expect(closed).toBe(true);expect(await f.runtime.resume()).toEqual({outcome:'unavailable'});expect(f.create).toHaveBeenCalledTimes(1);
});

it('resume waits for an older in-flight attempt then starts only one fresh generation',async()=>{
  const f=await fixture();await f.runtime.store();let release!:()=>void;
  vi.mocked(f.sessions[0]!.value.stop).mockImplementation(()=>new Promise<void>(resolve=>{release=resolve;}));
  const older=f.runtime.retrySession();await new Promise(resolve=>setImmediate(resolve));f.runtime.suspend();const resumed=f.runtime.resume();
  expect(f.runtime.sessionState()).toBe('unavailable');release();expect(await older).toEqual({outcome:'unavailable'});
  expect(await resumed).toEqual({outcome:'observing'});expect(f.create).toHaveBeenCalledTimes(2);expect(f.runtime.sessionState()).toBe('unavailable');
});
it('does not silently fall back when an explicitly supplied session factory is invalid',async()=>{
  const f=await fixture();f.create.mockReturnValue(undefined as unknown as OwnedSecretSession);
  const fallback=vi.spyOn(SecretSessionClient,'start').mockImplementation(()=>{throw new Error('Unexpected fallback.');});
  try{expect(await f.runtime.retrySession()).toEqual({outcome:'unavailable'});expect(fallback).not.toHaveBeenCalled();}finally{fallback.mockRestore();}
});
it('retains and stops a session created by a factory that reenters close',async()=>{
  const f=await fixture(),created=session();let closing:Promise<void>|undefined;
  f.create.mockImplementation(()=>{closing=f.runtime.close();return created.value;});
  expect(await f.runtime.retrySession()).toEqual({outcome:'unavailable'});await closing;
  expect(created.value.stop).toHaveBeenCalledTimes(1);expect(f.runtime.sessionState()).toBe('unavailable');
});
it('does not start an unused observer merely because the computer resumes',async()=>{
  const f=await fixture();f.runtime.suspend();expect(await f.runtime.resume()).toEqual({outcome:'unavailable'});expect(f.create).not.toHaveBeenCalled();
  await f.runtime.store();expect(f.create).toHaveBeenCalledTimes(1);
});
