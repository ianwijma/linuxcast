import { afterEach,describe,expect,it } from 'vitest';
import { mkdtemp,readdir,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes,createCipheriv,createDecipheriv } from 'node:crypto';
import { SecretStore } from '../src/store.ts';
import { createSecretReferences } from '../src/references.ts';
import { openFixtureOwner } from './owner-fixture.ts';
import type { ElectronSafeStorage } from '../src/types.ts';
const directories:string[]=[],stores:SecretStore[]=[],owners:Awaited<ReturnType<typeof openFixtureOwner>>[]=[];
afterEach(async()=>{for(const store of stores.splice(0))await store.close();for(const owner of owners.splice(0))await owner.close();for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});
async function owner(directory?:string){const path=directory??await mkdtemp(join(tmpdir(),'linuxcast-secrets-owner-'));if(!directory)directories.push(path);const opened=await openFixtureOwner(path);owners.push(opened);return {...opened,directory:path};}
/** Generated test cipher only; real OS keyring acceptance is the separate Electron smoke. */
function fixtureCrypto(backend='gnome_libsecret'):ElectronSafeStorage {
  const key=randomBytes(32);return {getSelectedStorageBackend:()=>backend,isEncryptionAvailable:()=>true,
    encryptString:value=>{const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);return Buffer.concat([Buffer.from('v11'),nonce,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]);},
    decryptString:value=>{const decipher=createDecipheriv('aes-256-gcm',key,value.subarray(3,15));decipher.setAuthTag(value.subarray(-16));return Buffer.concat([decipher.update(value.subarray(15,-16)),decipher.final()]).toString('utf8');}};
}
const identity={ownerKind:'provider' as const,ownerId:'synthetic-provider'};
async function secrets(f:Awaited<ReturnType<typeof owner>>,safeStorage:ElectronSafeStorage){const store=await SecretStore.open({dataDirectory:f.directory,safeStorage,references:createSecretReferences(f.client)});stores.push(store);return store;}
describe('F2-02 actual owner secret metadata lifecycle (test cipher)',()=>{
  it('reopens the child owner and decrypts using metadata-only references, then permanently removes both on deletion',async()=>{
    const api=fixtureCrypto(),first=await owner(),store=await secrets(first,api),secret=`synthetic-${randomBytes(24).toString('hex')}`;
    const result=await store.store(identity,secret,'persistent');if(result.outcome!=='stored')throw new Error('Fixture storage failed.');
    const record=await first.client.request('secretRefs.get',{id:result.reference.id});expect(Object.keys(record!).sort()).toEqual(['createdAt','id','ownerId','ownerKind','updatedAt']);expect(JSON.stringify(record).includes(secret)).toBe(false);
    expect((await readFile(join(first.directory,'secrets',`${result.reference.id}.blob`))).includes(Buffer.from(secret))).toBe(false);
    await store.close();await first.close();const second=await owner(first.directory),restored=await secrets(second,api);let matches=false;
    expect(await restored.use(result.reference,identity,async value=>{matches=value===secret;})).toEqual({outcome:'used'});expect(matches).toBe(true);
    expect(await restored.delete(result.reference,identity)).toEqual({outcome:'deleted'});await restored.close();await second.close();
    const third=await owner(first.directory);expect(await third.client.request('secretRefs.list',{limit:200})).toEqual({records:[],nextCursor:null});expect(await readdir(join(first.directory,'secrets'))).toEqual([]);
  });
  it('refuses basic_text while explicitly selected session credentials never reach the real database',async()=>{
    const f=await owner(),store=await secrets(f,fixtureCrypto('basic_text'));expect(await store.store(identity,'synthetic fixture','persistent')).toMatchObject({outcome:'unavailable',status:{reason:'insecure-backend'}});
    const session=await store.store(identity,'synthetic fixture','session-only');expect(session).toMatchObject({outcome:'stored',reference:{mode:'session-only'}});
    expect(await f.client.request('secretRefs.list',{limit:200})).toEqual({records:[],nextCursor:null});expect(await readdir(join(f.directory,'secrets'))).toEqual([]);await store.close();await f.close();
    const reopened=await owner(f.directory);expect(await reopened.client.request('secretRefs.list',{limit:200})).toEqual({records:[],nextCursor:null});
  });
  it('reports failed persistence after actual owner disconnect and cleans its encrypted staging file',async()=>{
    const f=await owner(),store=await secrets(f,fixtureCrypto());await f.close();expect(await store.store(identity,'synthetic fixture','persistent')).toMatchObject({outcome:'unavailable',status:{reason:'storage-failed'}});expect(await readdir(join(f.directory,'secrets'))).toEqual([]);
  });
});
