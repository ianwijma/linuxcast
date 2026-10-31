import { afterEach,expect,it,vi } from 'vitest';
import { mkdtemp,rm,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes,createCipheriv,createDecipheriv } from 'node:crypto';
import { SecretStore } from '../src/store.ts';
import { SecretSessionStream } from '../src/session-stream.ts';
import { syntheticSession } from './session-fixture.ts';
import type { SecretSessionAccess } from '../src/session.ts';
import type { ElectronSafeStorage,SecretReferences,SecretReferenceRecord } from '../src/types.ts';
const stores:SecretStore[]=[],roots:string[]=[];
afterEach(async()=>{await Promise.all(stores.splice(0).map(store=>store.close()));await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
const owner={ownerKind:'provider' as const,ownerId:'synthetic-session-provider'};
function crypto(){const key=randomBytes(32);const api:ElectronSafeStorage={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'gnome_libsecret',encryptString:vi.fn(value=>{const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);return Buffer.concat([Buffer.from('v11'),nonce,cipher.update(value),cipher.final(),cipher.getAuthTag()]);}),decryptString:vi.fn(value=>{const decipher=createDecipheriv('aes-256-gcm',key,value.subarray(3,15));decipher.setAuthTag(value.subarray(-16));return Buffer.concat([decipher.update(value.subarray(15,-16)),decipher.final()]).toString('utf8');})};return api;}
async function fixture(session=syntheticSession(),clearSessionOnLock=false){
  const root=await mkdtemp(join(tmpdir(),'linuxcast-session-store-'));roots.push(root);const api=crypto(),records=new Map<string,SecretReferenceRecord>();
  const refs:SecretReferences={get:async id=>records.get(id)??null,put:async record=>{records.set(record.id,record);return record;},delete:async id=>records.delete(id),list:async()=>({records:[...records.values()],nextCursor:null})};
  const store=await SecretStore.open({dataDirectory:root,safeStorage:api,references:refs,session:session.access,clearSessionOnLock});stores.push(store);
  return {store,session,api,refs,records,root};
}
async function reference(f:Awaited<ReturnType<typeof fixture>>,mode:'session-only'|'persistent'='session-only'){
  const result=await f.store.store(owner,'synthetic-test-credential',mode);if(result.outcome!=='stored')throw new Error('Synthetic credential fixture failed.');return result.reference;
}
it('requires a session owner and denies unknown/locked/inactive admission for both persistence modes',async()=>{
  for(const state of ['unavailable','locked','inactive'] as const){
    const f=await fixture(syntheticSession(state));
    for(const mode of ['session-only','persistent'] as const)expect(await f.store.store(owner,'synthetic-test-credential',mode)).toMatchObject({outcome:'unavailable',status:{sessionOnlyAvailable:false}});
    expect(f.api.encryptString).not.toHaveBeenCalled();expect(f.records.size).toBe(0);expect(await readdir(join(f.root,'secrets'))).toEqual([]);
    f.store.setLocked(false);expect(f.store.status()).toMatchObject({state:'unavailable',sessionOnlyAvailable:false});
    f.session.set('observed-unlocked');expect(await reference(f)).toMatchObject({mode:'session-only'});
  }
  const f=await fixture();await expect(SecretStore.open({dataDirectory:f.root,safeStorage:f.api,references:f.refs} as Parameters<typeof SecretStore.open>[0])).rejects.toThrow('Session observation unavailable.');
});
it('synchronously aborts active consumers on lock; a quick unlock never revives the old lease',async()=>{
  const f=await fixture(),ref=await reference(f);let finish!:()=>void,signal:AbortSignal|undefined;
  const pending=f.store.use(ref,owner,async(_secret,lease)=>{signal=lease;await new Promise<void>(resolve=>{finish=resolve;});});
  while(!finish)await new Promise(resolve=>setImmediate(resolve));
  f.session.set('locked');expect(signal!.aborted).toBe(true);f.session.set('observed-unlocked');finish();
  expect(await pending).toMatchObject({outcome:'unavailable',status:{reason:'cancelled'}});
  expect(await f.store.use(ref,owner,async()=>{})).toEqual({outcome:'used'});
});
it('applies clear-on-lock to every observation denial while leaving encrypted credentials intact',async()=>{
  for(const state of ['locked','inactive','unavailable'] as const){
    const f=await fixture(syntheticSession(),true),session=await reference(f),persistent=await reference(f,'persistent');
    f.session.set(state);f.session.set('observed-unlocked');
    expect(await f.store.use(session,owner,async()=>{throw new Error('Unexpected session use.');})).toMatchObject({outcome:'unavailable',status:{reason:'not-found'}});
    expect(await f.store.use(persistent,owner,async()=>{})).toEqual({outcome:'used'});
  }
});
it('fresh-checks after a held metadata read, before decrypting or calling the consumer',async()=>{
  const f=await fixture(),ref=await reference(f,'persistent');let release!:(record:SecretReferenceRecord|null)=>void;
  f.refs.get=()=>new Promise(resolve=>{release=resolve;});vi.mocked(f.api.decryptString).mockClear();const consumer=vi.fn(async()=>{});
  const pending=f.store.use(ref,owner,consumer);while(!release)await new Promise(resolve=>setImmediate(resolve));
  f.session.set('locked');f.session.set('observed-unlocked');release(f.records.get(ref.id)!);
  expect(await pending).toMatchObject({outcome:'unavailable',status:{reason:'cancelled'}});expect(f.api.decryptString).not.toHaveBeenCalled();expect(consumer).not.toHaveBeenCalled();
});
it('fresh-checks immediately before consumer dispatch even without a state notification',async()=>{
  let time=100;const stream=new SecretSessionStream({monotonic:()=>time,wall:()=>time});
  stream.ingest(Buffer.from(JSON.stringify({schemaVersion:1,sequence:1,state:'observed',active:true,lockedHint:false,localGraphical:true,ownerMatches:true})+'\n'));
  const access:SecretSessionAccess={state:()=>stream.state(),subscribe:listener=>{listener(stream.state());return ()=>{};}};
  const f=await fixture({access,set:()=>{},listeners:new Set()}),ref=await reference(f,'persistent'),decrypt=f.api.decryptString;
  f.api.decryptString=value=>{const text=decrypt(value);time+=2500;return text;};const consumer=vi.fn(async()=>{});
  expect(await f.store.use(ref,owner,consumer)).toMatchObject({outcome:'unavailable',status:{reason:'cancelled'}});expect(consumer).not.toHaveBeenCalled();
  expect(f.store.status()).toMatchObject({state:'unavailable',reason:'session-unavailable',sessionOnlyAvailable:false,remediationAction:'retry-session'});
});
it('rejects a failed subscription despite an eligible read, and unsubscribes on close',async()=>{
  const session=syntheticSession();session.access.subscribe=()=>{throw new Error('SYNTHETIC_PRIVATE_SUBSCRIPTION');};
  const f=await fixture(session);expect(await f.store.store(owner,'synthetic-test-credential','session-only')).toMatchObject({outcome:'unavailable',status:{reason:'session-unavailable'}});
  const healthy=await fixture();expect(healthy.session.listeners.size).toBe(1);await healthy.store.close();expect(healthy.session.listeners.size).toBe(0);expect(healthy.store.status()).toMatchObject({state:'unavailable',sessionOnlyAvailable:false});
});
it('cancels and removes a persistent write whose metadata settles after session loss',async()=>{
  const f=await fixture();let release!:(record:SecretReferenceRecord)=>void,record:SecretReferenceRecord|undefined;
  f.refs.put=value=>{record=value;f.records.set(value.id,value);return new Promise(resolve=>{release=resolve;});};
  const pending=f.store.store(owner,'synthetic-test-credential','persistent');while(!release)await new Promise(resolve=>setImmediate(resolve));
  f.session.set('unavailable');release(record!);expect(await pending).toMatchObject({outcome:'unavailable',status:{reason:'cancelled'}});
  expect(f.records.size).toBe(0);expect(await readdir(join(f.root,'secrets'))).toEqual([]);
});

it('close coalesces and waits for in-flight reads and deletions before releasing the private directory',async()=>{
  for(const action of ['use','delete'] as const){
    const f=await fixture(),ref=await reference(f,'persistent');let release!:(record:SecretReferenceRecord|null)=>void;
    f.refs.get=()=>new Promise(resolve=>{release=resolve;});
    const operation=action==='use'?f.store.use(ref,owner,async()=>{throw new Error('Unexpected late use.');}):f.store.delete(ref,owner);
    while(!release)await new Promise(resolve=>setImmediate(resolve));
    const closing=f.store.close();expect(f.store.close()).toBe(closing);let closed=false;void closing.then(()=>{closed=true;});
    await new Promise(resolve=>setImmediate(resolve));expect(closed).toBe(false);
    release(f.records.get(ref.id)!);await operation;await closing;expect(closed).toBe(true);
  }
});

it('coalesces a close reentered synchronously by a consumer abort callback',async()=>{
  const f=await fixture(),ref=await reference(f);let entered=false,nested:Promise<void>|undefined;
  const pending=f.store.use(ref,owner,async(_secret,signal)=>{
    entered=true;await new Promise<void>(resolve=>{signal.addEventListener('abort',()=>{nested=f.store.close();resolve();},{once:true});});
  });
  while(!entered)await new Promise(resolve=>setImmediate(resolve));
  const closing=f.store.close();expect(nested).toBe(closing);await closing;expect(await pending).toMatchObject({outcome:'unavailable'});
});
