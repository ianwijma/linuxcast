import { syntheticSession } from './session-fixture.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readdir, readFile, writeFile, chmod, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { SecretStore } from '../src/store.ts';
import { privateSmokeEnvironment } from './smoke-environment.ts';
import { SafeStorageAdapter } from '../src/safe-storage.ts';
import type { ElectronSafeStorage, SecretReferences, SecretReferenceRecord, SecretReference } from '../src/types.ts';
const directories:string[]=[];const stores:SecretStore[]=[];
afterEach(async()=>{for(const store of stores.splice(0))await store.close();for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});
const owner={ownerKind:'provider' as const,ownerId:'fixture-provider'};
const generated=()=>`synthetic-${randomBytes(24).toString('hex')}`;
/** Test double only. Production encryption is exclusively actual safeStorage. */
function fakeSafeStorage(backend='gnome_libsecret') {
  const key=randomBytes(32);
  const api:ElectronSafeStorage={getSelectedStorageBackend:()=>backend,isEncryptionAvailable:()=>true,
    encryptString:vi.fn(value=>{const nonce=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,nonce);return Buffer.concat([Buffer.from('v11'),nonce,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]);}),
    decryptString:vi.fn(value=>{const decipher=createDecipheriv('aes-256-gcm',key,value.subarray(3,15));decipher.setAuthTag(value.subarray(-16));return Buffer.concat([decipher.update(value.subarray(15,-16)),decipher.final()]).toString('utf8');})};
  return api;
}
function references() {
  const records=new Map<string,SecretReferenceRecord>();
  const refs:SecretReferences={get:async id=>structuredClone(records.get(id)??null),put:async record=>{records.set(record.id,structuredClone(record));return structuredClone(record);},delete:async id=>records.delete(id),list:async()=>({records:structuredClone([...records.values()].sort((a,b)=>a.id.localeCompare(b.id))),nextCursor:null})};
  return {refs,records};
}
async function setup(api=fakeSafeStorage(),refs=references().refs) {
  const directory=await mkdtemp(join(tmpdir(),'linuxcast-secret-fixture-'));directories.push(directory);
  const store=await SecretStore.open({session:syntheticSession().access,dataDirectory:directory,safeStorage:api,references:refs});stores.push(store);return {store,directory,api,refs};
}
async function stored(store:SecretStore,secret=generated(),mode:'persistent'|'session-only'='persistent'):Promise<SecretReference> {const result=await store.store(owner,secret,mode);expect(result.outcome).toBe('stored');if(result.outcome!=='stored')throw new Error();return result.reference;}

describe('F2-02 secret boundary',()=>{
  it('builds a private allowlisted smoke environment before D-Bus starts',()=>{
    const env=privateSmokeEnvironment('/tmp/synthetic-keyring');expect(env.HOME).toBe('/tmp/synthetic-keyring/home');expect(env.XDG_DATA_HOME).toBe('/tmp/synthetic-keyring/data');
    for(const name of ['DISPLAY','WAYLAND_DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS','SESSION_MANAGER','ELECTRON_RUN_AS_NODE','NODE_OPTIONS','LD_PRELOAD'])expect(env).not.toHaveProperty(name);
    expect(privateSmokeEnvironment('/tmp/synthetic-keyring','unix:path=/tmp/synthetic-bus').DBUS_SESSION_BUS_ADDRESS).toBe('unix:path=/tmp/synthetic-bus');
  });
  it.each(['basic_text','unknown','unrecognized'])('refuses %s persistence even when encryption API claims available',async backend=>{
    const f=await setup(fakeSafeStorage(backend));expect(await f.store.store(owner,generated(),'persistent')).toMatchObject({outcome:'unavailable',status:{reason:backend==='basic_text'?'insecure-backend':'unavailable',sessionOnlyAvailable:true}});
    expect(f.api.encryptString).not.toHaveBeenCalled();expect(await readdir(join(f.directory,'secrets'))).toEqual([]);
    const reference=await stored(f.store,generated(),'session-only');expect(reference.mode).toBe('session-only');
  });
  it('never auto-falls back or writes when keyring availability is false',async()=>{
    const api=fakeSafeStorage();api.isEncryptionAvailable=()=>false;const f=await setup(api);expect(await f.store.store(owner,generated(),'persistent')).toMatchObject({outcome:'unavailable',status:{reason:'unavailable'}});expect(api.encryptString).not.toHaveBeenCalled();expect(await readdir(join(f.directory,'secrets'))).toEqual([]);
  });
  it('roundtrips private encrypted bytes and returns only an opaque reference',async()=>{
    const metadata=references();const f=await setup(fakeSafeStorage(),metadata.refs);const secret=generated();const reference=await stored(f.store,secret);
    expect(Object.keys(reference).sort()).toEqual(['id','mode']);const file=await readFile(join(f.directory,'secrets',`${reference.id}.blob`));expect(file.toString('utf8')).not.toContain(secret);
    expect(JSON.stringify([...metadata.records.values()])).not.toContain(secret);let observed=false;expect(await f.store.use(reference,owner,async value=>{observed=value===secret;})).toEqual({outcome:'used'});expect(observed).toBe(true);
    await f.store.close();const reopened=await SecretStore.open({session:syntheticSession().access,dataDirectory:f.directory,safeStorage:f.api,references:metadata.refs});stores.push(reopened);expect(await reopened.use(reference,owner,async value=>{expect(value===secret).toBe(true);})).toEqual({outcome:'used'});
  });
  it('binds ciphertext to its exact reference and owner instead of trusting the filename alone',async()=>{
    const f=await setup();const first=await stored(f.store);const secondResult=await f.store.store({...owner,ownerId:'second-provider'},generated(),'persistent');if(secondResult.outcome!=='stored')throw new Error();
    const firstPath=join(f.directory,'secrets',`${first.id}.blob`);const secondPath=join(f.directory,'secrets',`${secondResult.reference.id}.blob`);const otherCiphertext=await readFile(secondPath);await writeFile(firstPath,otherCiphertext,{mode:0o600});
    let used=false;expect(await f.store.use(first,owner,async()=>{used=true;})).toMatchObject({outcome:'unavailable'});expect(used).toBe(false);
  });
  it('rejects wrong owner and missing refs before decryption',async()=>{
    const f=await setup();const reference=await stored(f.store);vi.mocked(f.api.decryptString).mockClear();expect(await f.store.use(reference,{...owner,ownerId:'different'},async()=>{})).toMatchObject({outcome:'unavailable',status:{reason:'not-found'}});expect(f.api.decryptString).not.toHaveBeenCalled();
  });
  it('disables persistence after a failed roundtrip until an explicit successful recheck',async()=>{
    const api=fakeSafeStorage();const decrypt=api.decryptString;api.decryptString=()=>generated();const f=await setup(api);
    expect(await f.store.store(owner,generated(),'persistent')).toMatchObject({outcome:'unavailable',status:{reason:'encryption-failed'}});expect(f.store.status()).toMatchObject({state:'unavailable',reason:'encryption-failed'});
    api.decryptString=decrypt;expect(f.store.status().state).toBe('unavailable');expect(f.store.recheckKeyring().state).toBe('available');await stored(f.store);
  });
  it('rejects v10 ciphertext and backend changes during roundtrip',()=>{
    const api=fakeSafeStorage();api.encryptString=()=>Buffer.from('v10insecure');expect(()=>new SafeStorageAdapter(api).encrypt(generated())).toThrow('Secure encryption failed');
    const real=fakeSafeStorage();const decrypt=real.decryptString;real.decryptString=value=>{real.getSelectedStorageBackend=()=> 'basic_text';return decrypt(value);};expect(()=>new SafeStorageAdapter(real).encrypt(generated())).toThrow('Secure encryption failed');
  });
  it('copies owner identity across persistence awaits and rejects metadata substitution',async()=>{
    const metadata=references();const api=fakeSafeStorage();let release!:(record:SecretReferenceRecord)=>void;let actual!:SecretReferenceRecord;
    metadata.refs.put=record=>{actual=record;return new Promise(resolve=>{release=resolve;});};const f=await setup(api,metadata.refs);const mutable={...owner};const pending=f.store.store(mutable,generated(),'persistent');while(!release)await new Promise(resolve=>setImmediate(resolve));mutable.ownerId='changed';expect(actual.ownerId).toBe(owner.ownerId);release({...actual,ownerId:'substituted'});
    expect(await pending).toMatchObject({outcome:'unavailable',status:{reason:'storage-failed'}});expect(await readdir(join(f.directory,'secrets'))).toEqual([]);
  });
  it('session lock suspends all use; optional clear-on-lock and quit remove session credentials',async()=>{
    const f=await setup();const reference=await stored(f.store,generated(),'session-only');f.store.setLocked(true);expect(await f.store.use(reference,owner,async()=>{})).toMatchObject({outcome:'unavailable',status:{reason:'locked'}});
    f.store.setLocked(false);expect(await f.store.use(reference,owner,async()=>{})).toEqual({outcome:'used'});f.store.setLocked(true,{clearSession:true});f.store.setLocked(false);expect(await f.store.use(reference,owner,async()=>{})).toMatchObject({outcome:'unavailable',status:{reason:'not-found'}});await f.store.close();expect(f.store.status().state).toBe('unavailable');
  });
  it('deletion aborts active consumers and removes encrypted blob and reference',async()=>{
    const metadata=references();const f=await setup(fakeSafeStorage(),metadata.refs);const reference=await stored(f.store);let finish!:()=>void;let signal:AbortSignal|undefined;
    const using=f.store.use(reference,owner,async(_value,active)=>{signal=active;await new Promise<void>(resolve=>{finish=resolve;});});while(!finish)await new Promise(resolve=>setImmediate(resolve));
    expect(await f.store.delete(reference,owner)).toEqual({outcome:'deleted'});expect(signal!.aborted).toBe(true);finish();expect(await using).toMatchObject({outcome:'unavailable',status:{reason:'cancelled'}});expect(metadata.records.size).toBe(0);expect(await readdir(join(f.directory,'secrets'))).toEqual([]);
  });
  it('rejects symlink/hardlinked/nonprivate credential files without returning plaintext',async()=>{
    const f=await setup();const reference=await stored(f.store);const filename=join(f.directory,'secrets',`${reference.id}.blob`);
    await chmod(filename,0o644);expect(await f.store.use(reference,owner,async()=>{throw new Error('unexpected');})).toMatchObject({outcome:'unavailable'});await chmod(filename,0o600);
    await link(filename,join(f.directory,'copy'));expect(await f.store.use(reference,owner,async()=>{})).toMatchObject({outcome:'unavailable'});await rm(join(f.directory,'copy'));
    await rm(filename);await symlink(join(f.directory,'outside'),filename);expect(await f.store.use(reference,owner,async()=>{})).toMatchObject({outcome:'unavailable'});
  });
  it('fails closed after metadata write failure without leaking seeded error text',async()=>{
    const metadata=references();const secret=generated();metadata.refs.put=async()=>{throw new Error(secret);};const f=await setup(fakeSafeStorage(),metadata.refs);const result=await f.store.store(owner,secret,'persistent');expect(result).toMatchObject({outcome:'unavailable'});expect(JSON.stringify(result)).not.toContain(secret);expect(await readdir(join(f.directory,'secrets'))).toEqual([]);
  });
  it('waits for pending write cleanup before closing its pinned directory',async()=>{
    const metadata=references();let release!:(record:SecretReferenceRecord)=>void;let record!:SecretReferenceRecord;metadata.refs.put=value=>{record=value;return new Promise(resolve=>{release=resolve;});};const f=await setup(fakeSafeStorage(),metadata.refs);
    const pending=f.store.store(owner,generated(),'persistent');while(!release)await new Promise(resolve=>setImmediate(resolve));const closing=f.store.close();release(record);expect(await pending).toMatchObject({outcome:'unavailable',status:{reason:'unavailable',sessionOnlyAvailable:false}});await closing;expect(await readdir(join(f.directory,'secrets'))).toEqual([]);
  });
  it('reconciles only owned orphan/staging names after complete metadata validation',async()=>{
    const metadata=references();const f=await setup(fakeSafeStorage(),metadata.refs);const reference=await stored(f.store);const folder=join(f.directory,'secrets');
    const orphan=`${randomUUID()}.blob`;const temporary=`${randomUUID()}.blob.${randomUUID()}.tmp`;
    for(const name of [orphan,temporary,'unrelated.txt'])await writeFile(join(folder,name),'synthetic fixture',{mode:0o600});
    expect(await f.store.reconcile()).toEqual({outcome:'reconciled',removed:2});expect((await readdir(folder)).sort()).toEqual([`${reference.id}.blob`,'unrelated.txt'].sort());
    expect(await f.store.use(reference,owner,async()=>{})).toEqual({outcome:'used'});
  });
  it('never deletes files from a partial/failed inventory and retains explicit session fallback',async()=>{
    const metadata=references();const f=await setup(fakeSafeStorage(),metadata.refs);const reference=await stored(f.store);const folder=join(f.directory,'secrets');
    const list=metadata.refs.list;metadata.refs.list=async()=>{throw new Error('synthetic failure');};expect(await f.store.reconcile()).toEqual({outcome:'unavailable'});
    expect(await readdir(folder)).toEqual([`${reference.id}.blob`]);expect(f.store.status()).toMatchObject({state:'unavailable',reason:'storage-failed'});await stored(f.store,generated(),'session-only');
    metadata.refs.list=list;expect(await f.store.reconcile()).toMatchObject({outcome:'reconciled',removed:0});expect(await f.store.use(reference,owner,async()=>{})).toEqual({outcome:'used'});
  });
  it('bounds credential/session sizes and rejects invalid owners and references',async()=>{
    const f=await setup();expect(await f.store.store(owner,'x'.repeat(64*1024+1),'session-only')).toMatchObject({outcome:'unavailable',status:{reason:'invalid-request'}});expect(await f.store.store({...owner,ownerId:'../escape'},generated(),'persistent')).toMatchObject({outcome:'unavailable'});
    expect(await f.store.use({id:'../escape',mode:'secure-persistent'},owner,async()=>{})).toMatchObject({outcome:'unavailable'});for(let i=0;i<16;i++)await stored(f.store,'x'.repeat(64*1024),'session-only');expect(await f.store.store(owner,'x','session-only')).toMatchObject({outcome:'unavailable',status:{reason:'storage-failed'}});
  });
});
