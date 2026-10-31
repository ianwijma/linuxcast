import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {CredentialRuntime} from '../src/runtime.ts';
import {CredentialSettingsService} from '../src/settings.ts';
import type {CredentialPreferences} from '../src/settings.ts';
import type {SecretReferenceRecord,SecretReferences,ElectronSafeStorage} from '../src/types.ts';
import type {SecretSessionState} from '../src/session.ts';
const roots:string[]=[],runtimes:CredentialRuntime[]=[],services:CredentialSettingsService[]=[];
afterEach(async()=>{await Promise.all(services.splice(0).map(service=>service.close()));await Promise.allSettled(runtimes.splice(0).map(runtime=>runtime.close()));await Promise.all(roots.splice(0).map(path=>rm(path,{recursive:true,force:true})));});
const confirm=async()=>true,signal=()=>new AbortController().signal;
async function fixture(secure=false){
  const root=await mkdtemp(join(tmpdir(),'linuxcast-credential-settings-'));roots.push(root);
  let session:SecretSessionState='observed-unlocked';const listeners=new Set<(state:SecretSessionState)=>void>();
  const records=new Map<string,SecretReferenceRecord>();
  const references:SecretReferences={get:async id=>records.get(id)??null,put:async record=>{records.set(record.id,record);return record;},delete:async id=>records.delete(id),list:async({afterId,limit})=>{const all=[...records.values()].sort((a,b)=>a.id.localeCompare(b.id)).filter(row=>!afterId||row.id>afterId),page=all.slice(0,limit);return {records:page,nextCursor:all.length>page.length?page.at(-1)!.id:null};}};
  let row:{revision:number;value:string}|null=null;
  const preferences:CredentialPreferences={read:vi.fn(async()=>row?{...row}:null),write:vi.fn(async(expected,value)=>{if((row?.revision??0)!==expected)throw new Error('Synthetic conflict.');row={revision:expected+1,value};return {...row};})};
  // Synthetic keyring adapter, never OS-backed evidence or real key material.
  const safeStorage:ElectronSafeStorage={getSelectedStorageBackend:()=>secure?'gnome_libsecret':'basic_text',isEncryptionAvailable:()=>secure,
    encryptString:vi.fn(value=>Buffer.concat([Buffer.from('v11'),Buffer.from(value)])),decryptString:vi.fn(value=>value.subarray(3).toString())};
  const runtime=new CredentialRuntime({dataDirectory:root,helperPath:'/fixed/unused-helper',safeStorage,references,isStorageReady:()=>true,createSession:()=>({state:()=>session,subscribe(listener){listeners.add(listener);listener(session);return()=>{listeners.delete(listener);};},invalidate(){},async stop(){}})});runtimes.push(runtime);
  const service=new CredentialSettingsService({runtime,preferences,references,appearance:()=> 'dark'});services.push(service);
  return {runtime,service,preferences,records,safeStorage,row:()=>row,emit(value:SecretSessionState){session=value;for(const listener of listeners)listener(value);}};
}
async function save(f:Awaited<ReturnType<typeof fixture>>,persistence:'persistent'|'session-only'='session-only',value='SYNTHETIC_ENTRY_ONLY'){
  const state=await f.service.state();return f.service.save({protocolVersion:1,expectedRevision:state.revision,persistence,value},confirm,signal());
}
it('saves session-only input without persisting its value or reference and replaces only after confirmation',async()=>{
  const f=await fixture();expect(await save(f)).toEqual({ok:true,value:{outcome:'saved'}});
  const store=(await f.runtime.store())!,first=await f.service.state();expect(first).toMatchObject({stored:'session-only',storage:'insecure-backend',sessionOnlyAvailable:true});
  expect(f.records.size).toBe(0);expect(f.row()!.value).toBe('{"schemaVersion":1,"referenceId":null,"clearSessionOnLock":false}');expect(JSON.stringify(first)).not.toContain('SYNTHETIC_ENTRY_ONLY');
  const denied=vi.fn(async()=>false);expect(await f.service.save({protocolVersion:1,expectedRevision:first.revision,persistence:'session-only',value:'SYNTHETIC_REPLACEMENT'},denied,signal())).toEqual({ok:true,value:{outcome:'cancelled'}});
  expect(denied).toHaveBeenCalledWith(true,expect.any(AbortSignal));expect(await f.service.state()).toMatchObject({stored:'session-only'});
  const deleteSpy=vi.spyOn(store,'delete');expect(await save(f)).toEqual({ok:true,value:{outcome:'saved'}});expect(deleteSpy).toHaveBeenCalledTimes(1);
});
it('refuses basic-text persistence without encryption, invalid targets and unbounded inputs',async()=>{
  const f=await fixture();expect(await save(f,'persistent')).toEqual({ok:true,value:{outcome:'unavailable'}});expect(f.safeStorage.encryptString).not.toHaveBeenCalled();
  const state=await f.service.state();for(const extra of [{ownerId:'foreign'},{referenceId:randomUUID()},{value:'x'.repeat(65537)},{value:'\ud800'}]){
    expect(await f.service.save({protocolVersion:1,expectedRevision:state.revision,persistence:'session-only',value:'SYNTHETIC',...extra},confirm,signal())).toEqual({ok:false,error:{code:'invalid-request'}});
  }expect(f.row()).toBe(null);
});
it('rejects denial or metadata changes delivered during native confirmation before storing any value',async()=>{
  const f=await fixture(true),store=(await f.runtime.store())!,spy=vi.spyOn(store,'store'),state=await f.service.state();
  expect(await f.service.save({protocolVersion:1,expectedRevision:state.revision,persistence:'persistent',value:'SYNTHETIC'},async()=>{f.emit('locked');return true;},signal())).toEqual({ok:true,value:{outcome:'stale'}});
  expect(spy).not.toHaveBeenCalled();expect(await f.service.state()).toMatchObject({session:'locked',sessionOnlyAvailable:false,storage:'unavailable'});
});
it('does not replay an uncertain persistent pointer write; explicit removal cleans only the fixed owner',async()=>{
  const f=await fixture(true),foreignId=randomUUID(),now=new Date().toISOString();f.records.set(foreignId,{id:foreignId,ownerKind:'provider',ownerId:'other-provider',createdAt:now,updatedAt:now});
  const write=vi.mocked(f.preferences.write);write.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE_FAILURE'));
  expect(await save(f,'persistent')).toEqual({ok:true,value:{outcome:'unknown'}});expect(write).toHaveBeenCalledTimes(1);expect(f.records.size).toBe(2);
  const state=await f.service.state();expect(state.stored).toBe('needs-review');expect(await save(f,'persistent')).toEqual({ok:true,value:{outcome:'unavailable'}});expect(write).toHaveBeenCalledTimes(1);
  const current=await f.service.state();expect(await f.service.remove({protocolVersion:1,expectedRevision:current.revision},confirm,signal())).toEqual({ok:true,value:{outcome:'removed'}});
  expect([...f.records.keys()]).toEqual([foreignId]);expect(await f.service.state()).toMatchObject({stored:'none'});
});
it('retains ownership of both memory references after uncertain replacement and removes both explicitly',async()=>{
  const f=await fixture();expect(await save(f)).toMatchObject({value:{outcome:'saved'}});const store=(await f.runtime.store())!,erased=vi.spyOn(store,'delete');
  vi.mocked(f.preferences.write).mockRejectedValueOnce(new Error('Synthetic uncertainty.'));expect(await save(f)).toMatchObject({value:{outcome:'unknown'}});
  const state=await f.service.state();expect(state.stored).toBe('needs-review');expect(await f.service.remove({protocolVersion:1,expectedRevision:state.revision},confirm,signal())).toMatchObject({value:{outcome:'removed'}});
  expect(erased).toHaveBeenCalledTimes(2);expect(await f.service.state()).toMatchObject({stored:'none'});
});
it('retains memory on default lock but applies explicit clear policy before a denied session can recover',async()=>{
  const f=await fixture();await save(f);f.emit('locked');expect(await f.service.state()).toMatchObject({stored:'session-only',sessionOnlyAvailable:false});f.emit('observed-unlocked');
  const state=await f.service.state();expect(await f.service.setPolicy({protocolVersion:1,expectedRevision:state.revision,clearSessionOnLock:true},signal())).toMatchObject({value:{outcome:'policy-updated'}});
  f.emit('inactive');expect(await f.service.state()).toMatchObject({stored:'none',clearSessionOnLock:true,sessionOnlyAvailable:false});f.emit('observed-unlocked');expect(await f.service.state()).toMatchObject({stored:'none'});
});
it('serializes mutations, checks cancellation and does not retain an entered value in replies',async()=>{
  const f=await fixture(),state=await f.service.state();let finish!:(value:boolean)=>void;
  const saving=f.service.save({protocolVersion:1,expectedRevision:state.revision,persistence:'session-only',value:'SYNTHETIC_PRIVATE_KEY'},()=>new Promise(resolve=>{finish=resolve;}),signal());
  while(!finish)await new Promise(resolve=>setImmediate(resolve));expect(await f.service.state()).toMatchObject({busy:true});expect(await f.service.remove({protocolVersion:1,expectedRevision:state.revision},confirm,signal())).toEqual({ok:false,error:{code:'conflict'}});
  finish(false);expect(await saving).toEqual({ok:true,value:{outcome:'cancelled'}});expect(f.row()).toBe(null);
  const abort=new AbortController();abort.abort();const current=await f.service.state();expect(await f.service.save({protocolVersion:1,expectedRevision:current.revision,persistence:'session-only',value:'SYNTHETIC'},confirm,abort.signal)).toMatchObject({value:{outcome:'cancelled'}});
});
it('removes persistent credentials while locked and never returns a key or opaque ID',async()=>{
  const f=await fixture(true);expect(await save(f,'persistent')).toMatchObject({value:{outcome:'saved'}});const id=[...f.records.keys()][0]!;expect(f.row()!.value).toContain(id);f.emit('locked');
  const state=await f.service.state();expect(JSON.stringify(state)).not.toContain(id);expect(await f.service.remove({protocolVersion:1,expectedRevision:state.revision},confirm,signal())).toEqual({ok:true,value:{outcome:'removed'}});expect(f.records.size).toBe(0);
});
it('requires review for orphaned fixed-owner records without a secret or raw error response',async()=>{
  const f=await fixture(),records=f.records;for(const id of ['ffffffff-ffff-4fff-afff-ffffffffffff','00000000-0000-4000-a000-000000000000']){records.set(id,{id,ownerKind:'provider',ownerId:'openrouter-default',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});}
  const state=await f.service.state();expect(state.stored).toBe('needs-review');
  const reply=await f.service.save({protocolVersion:1,expectedRevision:state.revision,persistence:'session-only',value:'SYNTHETIC_PRIVATE'},confirm,signal());expect(reply).toEqual({ok:true,value:{outcome:'unavailable'}});
});

it('aborts a current provider lease after confirmed replacement and fences a late dispatch',async()=>{
  const f=await fixture();await save(f);let release!:()=>void,lease:AbortSignal|undefined,fresh:(()=>boolean)|undefined;
  const using=f.service.use(async(value,signal,isFresh)=>{expect(value).toBe('SYNTHETIC_ENTRY_ONLY');lease=signal;fresh=isFresh;await new Promise<void>(resolve=>{release=resolve;});});
  while(!release)await new Promise(resolve=>setImmediate(resolve));expect(fresh!()).toBe(true);expect(lease!.aborted).toBe(false);
  expect(await save(f)).toEqual({ok:true,value:{outcome:'saved'}});expect(lease!.aborted).toBe(true);expect(fresh!()).toBe(false);release();expect(await using).toEqual({outcome:'unavailable'});
});
it('keeps an applied but unacknowledged pointer write uncertain until explicit review/removal',async()=>{
  const f=await fixture(true);let row:{revision:number;value:string}|null=null;
  f.preferences.read=async()=>row;f.preferences.write=vi.fn(async(expected,value)=>{row={revision:expected+1,value};throw new Error('SYNTHETIC_ACK_LOST');});
  expect(await save(f,'persistent')).toMatchObject({value:{outcome:'unknown'}});expect(await f.service.state()).toMatchObject({stored:'needs-review'});expect(f.records.size).toBe(1);expect(f.preferences.write).toHaveBeenCalledTimes(1);
});
it('offers explicit fixed-target removal for corrupt preference metadata instead of reading a key',async()=>{
  const f=await fixture();f.preferences.read=async()=>({revision:3,value:'SYNTHETIC_CORRUPT_METADATA'});expect(await f.service.state()).toMatchObject({stored:'needs-review',clearSessionOnLock:true});
});
