import {expect,it,vi} from 'vitest';
import {execFileSync} from 'node:child_process';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {IpcMainInvokeEvent,WebContents} from 'electron';
import {createInstalledDictionary} from '../src/installed.ts';
import {createNativeSpeller} from '../src/native-spelling.ts';
import {registerSpellingIpc} from '../../../../apps/desktop/src/main/dictionary-spelling-ipc.ts';
import {DICTIONARY_SPELLING_CHANNELS as channels,dictionarySpellingReplySchema} from '../../../contracts/src/dictionary-spelling.ts';
// Real authored on-disk UTF8 pair, reader, fixed native Hunspell/containment and
// IPC handler. Electron identity/context and clipboard are synthetic here.
it('binds actual native spelling to the current installed source and refuses Copy after a real source replacement without replay',async()=>{
 const root=resolve(fileURLToPath(new URL('../../../..',import.meta.url)));
 execFileSync('cargo',['build','--locked','-p','linuxcast-platform'],{cwd:root,timeout:60000,stdio:'pipe'});
 const directory=await fs.mkdtemp(join(tmpdir(),'linuxcast-spelling-assembly-')),aff=join(directory,'en_PUBLIC.aff'),dic=join(directory,'en_PUBLIC.dic');
 await fs.writeFile(aff,'SET UTF-8\nTRY abcdefghijklmnopqrstuvwxyz\nSFX S Y 1\nSFX S 0 s .\n');await fs.writeFile(dic,'2\ncat/S\ndog/S\n');
 const before=await fs.readFile(aff),backend=createInstalledDictionary({roots:[directory],speller:createNativeSpeller(join(root,'target/debug/linuxcast-platform'))});
 const language=(await backend.languages()).languages[0]!;expect(language.state).toBe('available');const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>(),frame={},owner={} as WebContents,event={sender:owner,senderFrame:frame} as IpcMainInvokeEvent;let busy=false,generation=1;
 const copy=vi.fn(async()=>'written' as const),recordUse=vi.fn(async()=>{}),remove=registerSpellingIpc({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:channel=>{handlers.delete(channel);}},backend,{trusted:e=>e.sender===owner&&e.senderFrame===frame,active:()=>true,busy:()=>busy,revision:()=>1,generation:()=>generation,authorize:async()=>undefined,acquire:()=>{busy=true;generation++;return()=>{busy=false;};},copy,recordUse});
 const request={protocolVersion:1,revision:1,requestId:'00000000-0000-4000-8000-000000000001',languageId:language.id,word:'cats'};
 try{
  const reply=dictionarySpellingReplySchema.parse(await handlers.get(channels.check)!(event,request));if(!reply.ok)throw new Error('Actual native spelling unavailable.');expect(reply.value).toMatchObject({correct:true,backend:'hunspell-1.7',records:[{text:'cats'}]});expect(copy).not.toHaveBeenCalled();expect(recordUse).not.toHaveBeenCalled();expect(await fs.readFile(aff)).toEqual(before);expect(await fs.readFile(dic,'utf8')).toBe('2\ncat/S\ndog/S\n');
  const replacement=join(directory,'replacement.dic');await fs.writeFile(replacement,'2\ncat/S\nbird/S\n');await fs.rename(replacement,dic);
  const selection={...request,checkId:reply.value.checkId,snapshotId:reply.value.snapshotId,id:reply.value.records[0]!.id};expect(await handlers.get(channels.copy)!(event,selection)).toMatchObject({ok:false,error:{code:'conflict'}});expect(copy).not.toHaveBeenCalled();expect(recordUse).not.toHaveBeenCalled();expect(busy).toBe(false);
  expect(await handlers.get(channels.copy)!(event,selection)).toMatchObject({ok:false,error:{code:'conflict'}});expect(copy).not.toHaveBeenCalled();
  const fresh=dictionarySpellingReplySchema.parse(await handlers.get(channels.check)!(event,{...request,requestId:'00000000-0000-4000-8000-000000000002'}));expect(fresh).toMatchObject({ok:true,value:{correct:true}});if(!fresh.ok)throw new Error();expect(fresh.value.snapshotId).not.toBe(reply.value.snapshotId);expect(copy).not.toHaveBeenCalled();expect(recordUse).not.toHaveBeenCalled();
 }finally{remove();await fs.rm(directory,{recursive:true,force:true});}
},60000);
