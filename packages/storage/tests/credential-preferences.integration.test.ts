import {afterEach,expect,it} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {StorageOwner} from '../src/owner.ts';
import {createStorageClient} from '../src/client.ts';
import type {StorageMethod,StorageMethods} from '../src/repositories.ts';
import {CREDENTIAL_PREFERENCE_ID,parseCredentialPreference} from '../../platform-contracts/src/credential-preferences.ts';
const roots:string[]=[],owners:StorageOwner[]=[];
afterEach(async()=>{await Promise.all(owners.splice(0).map(owner=>owner.close()));await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
function ask<M extends StorageMethod>(owner:StorageOwner,method:M,params:StorageMethods[M]['params']){return owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result as StorageMethods[M]['result'];}
async function open(root?:string){const directory=root??await mkdtemp(join(tmpdir(),'linuxcast-credential-pref-'));if(!root)roots.push(directory);const owner=await StorageOwner.open({dataDirectory:directory,applicationBuild:'synthetic-credential-settings'});owners.push(owner);return {owner,directory};}
const referenceId='00000000-0000-4000-a000-000000000001',value=JSON.stringify({schemaVersion:1,referenceId,clearSessionOnLock:false});
it('persists only strict opaque metadata through restart with compare-and-set and no export inclusion',async()=>{
  const f=await open(),saved=ask(f.owner,'settings.set',{id:CREDENTIAL_PREFERENCE_ID,expectedRevision:0,value});expect(parseCredentialPreference(saved.value)).toEqual({schemaVersion:1,referenceId,clearSessionOnLock:false});
  expect(()=>ask(f.owner,'settings.set',{id:CREDENTIAL_PREFERENCE_ID,expectedRevision:0,value})).toThrow('conflict');
  const exported=JSON.stringify(ask(f.owner,'dataControls.export',{category:'settings'}));expect(exported).not.toContain(referenceId);expect(exported).not.toContain(CREDENTIAL_PREFERENCE_ID);
  expect(()=>ask(f.owner,'dataControls.export',{category:'settings',ids:[CREDENTIAL_PREFERENCE_ID]} as never)).toThrow();
  await f.owner.confirmSuccessfulLaunch();await f.owner.close();const reopened=await open(f.directory);expect(ask(reopened.owner,'settings.get',{id:CREDENTIAL_PREFERENCE_ID})).toEqual(saved);
});
it('rejects secret-bearing, noncanonical, ill-typed and oversized preference metadata',async()=>{
  const {owner}=await open();for(const invalid of [true,'null','{}',JSON.stringify({schemaVersion:1,referenceId:'SYNTHETIC_KEY',clearSessionOnLock:false}),JSON.stringify({schemaVersion:1,referenceId:null,clearSessionOnLock:false,value:'SYNTHETIC_KEY'}),JSON.stringify({schemaVersion:1,referenceId:null,clearSessionOnLock:false},null,2),' '.repeat(257)])expect(()=>ask(owner,'settings.set',{id:CREDENTIAL_PREFERENCE_ID,expectedRevision:0,value:invalid})).toThrow();
  expect(ask(owner,'settings.get',{id:CREDENTIAL_PREFERENCE_ID})).toBe(null);
});
it('requires the exact opaque CAS receipt and never replays uncertain writes',async()=>{
  let receive:(value:unknown)=>void=()=>{};const sent:unknown[]=[],client=createStorageClient({send:message=>sent.push(message),onMessage:listener=>{receive=listener;return()=>{};}});
  const pending=client.request('settings.set',{id:CREDENTIAL_PREFERENCE_ID,expectedRevision:2,value});const envelope=sent[0] as {request:{requestId:string;method:string}};
  receive({kind:'response',response:{schemaVersion:1,...envelope.request,outcome:'completed',result:{id:CREDENTIAL_PREFERENCE_ID,revision:4,value,modifiedAt:'2026-10-31T00:00:00.000Z'}}});
  await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(sent).toHaveLength(1);client.disconnect();
});
