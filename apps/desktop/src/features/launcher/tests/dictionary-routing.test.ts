import {afterEach,expect,it,vi} from 'vitest';
import type {LauncherApi,LauncherCommandMetadata,DictionarySearchReply} from '@linuxcast/contracts';
import {LauncherController} from '../controller.ts';
const controllers:LauncherController[]=[];
afterEach(()=>{for(const controller of controllers.splice(0))controller.dispose();});
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
const language={id:'language:'+'a'.repeat(64),name:'en_US',state:'available' as const};
const record={id:'word:'+'b'.repeat(64),word:'café'};
const snapshotId='c'.repeat(64);
function setup(){
 let revision=1,searchId=0;
 const commands:LauncherCommandMetadata[]=[{id:'linuxcast:dictionary',title:'Dictionary',aliases:['dictionary'],keywords:['word'],enabled:true,hidden:false,usage:null}];
 const api:LauncherApi={getLauncherCommands:vi.fn(async()=>({ok:true as const,value:{revision,rankingAvailable:true,commands}})),executeLauncherCommand:vi.fn(),openLauncherUrl:vi.fn(),setLauncherPinned:vi.fn(),setLauncherAlias:vi.fn(),searchDictionary:vi.fn(async input=>({ok:true as const,value:{revision:input.revision,query:input.query,searchId:++searchId,requestedLanguageId:input.languageId??null,language,languages:[language],languagesTruncated:false,snapshotId,records:[record],truncated:false}})),copyDictionaryWord:vi.fn(async input=>({ok:true as const,value:{...input,outcome:'copied' as const,word:record.word}})),releaseDictionarySearch:vi.fn(async input=>({ok:true as const,value:{outcome:'released' as const,searchId:input.searchId}}))};
 const controller=new LauncherController(api,vi.fn(async()=>({ok:true as const,value:null})));controllers.push(controller);controller.setVisible(true);
 return {api,controller,commands,nextRevision:()=>{revision++;}};
}
function top(f:ReturnType<typeof setup>){return f.controller.session.getSnapshot().frames.at(-1)!;}
async function open(f:ReturnType<typeof setup>,extra:Record<string,unknown>={}){const frame=top(f);f.controller.session.select(frame.view.viewId,'linuxcast:dictionary');await f.controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId:'linuxcast:dictionary',itemId:'linuxcast:dictionary',...extra});await settle();}
async function action(f:ReturnType<typeof setup>,actionId:string){const frame=top(f);return f.controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId,...(frame.selection?{itemId:frame.selection}:{})});}
it('opens registered Dictionary and routes local queries and canonical selected Copy only to named APIs',async()=>{
 const f=setup();await settle();f.controller.session.setQuery('linuxcast-launcher','dictionary');f.controller.query('dictionary');await settle();await open(f);
 expect(top(f).view).toMatchObject({kind:'list',title:'Dictionary'});expect(f.api.copyDictionaryWord).not.toHaveBeenCalled();expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
 const id=top(f).view.viewId;f.controller.session.setQuery(id,'café');f.controller.host.queryChanged!(id,'café',top(f).queryRevision);await settle();
 expect(f.api.searchDictionary).toHaveBeenLastCalledWith({revision:1,query:'café',languageId:language.id});f.controller.session.select(id,record.id);await action(f,'dictionary:copy');
 expect(f.api.copyDictionaryWord).toHaveBeenCalledExactlyOnceWith({revision:1,searchId:2,query:'café',languageId:language.id,snapshotId,id:record.id});expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
 f.controller.session.pop();await settle();expect(top(f)).toMatchObject({query:'dictionary',selection:'linuxcast:dictionary'});expect(f.api.releaseDictionarySearch).toHaveBeenCalledWith({revision:1,searchId:2});
});
it('clears the language Form and query on Hide and rejects stale language submission after reopen',async()=>{
 const f=setup();await settle();await open(f);await action(f,'dictionary:language');const old=top(f);expect(old.view).toMatchObject({kind:'form',title:'Dictionary language'});
 f.controller.setVisible(false);await settle();expect(f.controller.session.getSnapshot().frames).toHaveLength(1);expect(f.api.releaseDictionarySearch).toHaveBeenCalledWith({revision:1,searchId:1});
 f.nextRevision();f.controller.setVisible(true);await settle();await open(f);expect(top(f).view).toMatchObject({kind:'list',title:'Dictionary',search:{query:''}});
 await f.controller.execute({viewId:old.view.viewId,revision:old.view.revision,actionId:'dictionary:apply-language',values:{languageId:language.id}});expect(top(f).view.kind).toBe('list');expect(f.api.copyDictionaryWord).not.toHaveBeenCalled();expect(f.api.searchDictionary).toHaveBeenLastCalledWith({revision:2,query:''});
});
it('releases a late Dictionary result after Hide without publishing into the new root',async()=>{
 const f=setup();let finish!:(value:DictionarySearchReply)=>void;vi.mocked(f.api.searchDictionary!).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await settle();await open(f);f.controller.setVisible(false);f.controller.setVisible(true);await settle();
 finish({ok:true,value:{revision:1,searchId:99,query:'',requestedLanguageId:null,language,languages:[language],languagesTruncated:false,snapshotId,records:[record],truncated:false}});await settle();expect(top(f).view.title).toBe('Search commands');expect(f.api.releaseDictionarySearch).toHaveBeenCalledWith({revision:1,searchId:99});expect(f.api.copyDictionaryWord).not.toHaveBeenCalled();
});
it.each(['hidden','disabled'] as const)('does not open Dictionary when its registered command is %s',async state=>{const f=setup();await settle();if(state==='hidden')f.commands[0]!.hidden=true;else{f.commands[0]!.enabled=false;f.commands[0]!.unavailableReason='Synthetic unavailable.';}await f.controller.refresh();await open(f);expect(top(f).view.title).toBe('Search commands');expect(f.api.searchDictionary).not.toHaveBeenCalled();expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();});
it('rejects extra root payload and selection mismatch before opening Dictionary',async()=>{const f=setup();await settle();await open(f,{values:{word:'forged'}});expect(top(f).view.title).toBe('Search commands');const frame=top(f);await f.controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId:'linuxcast:dictionary',itemId:'not-selected'});expect(f.api.searchDictionary).not.toHaveBeenCalled();expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();});

it('routes Local definitions and clears all three nested Dictionary frames on Hide',async()=>{
 const f=setup(),source={id:'stardict:'+'a'.repeat(64),name:'Public definitions',wordCount:1,snapshotId:'c'.repeat(64)},entry={id:'entry:'+'d'.repeat(64),word:'café au lait'};let searchId=0;
 f.api.searchDictionaryDefinitions=vi.fn(async input=>({ok:true as const,value:{...input,searchId:++searchId,configurationRevision:1,sourceState:'available' as const,source,records:[entry],truncated:false}}));
 f.api.readDictionaryDefinition=vi.fn(async input=>({ok:true as const,value:{...input,word:entry.word,parts:[{kind:'meaning' as const,text:'A public phrase definition.'}]}}));
 f.api.configureDictionaryDefinitions=vi.fn(async()=>({ok:false as const,error:{code:'capability-unavailable' as const,message:'Synthetic source selection unavailable.',retryable:false}}));
 f.api.releaseDictionaryDefinitionsSearch=vi.fn(async input=>({ok:true as const,value:{outcome:'released' as const,searchId:input.searchId}}));
 await settle();await open(f);await action(f,'dictionary:definitions');await settle();expect(top(f).view).toMatchObject({kind:'list',title:'Local definitions'});f.controller.session.select(top(f).view.viewId,entry.id);await action(f,'definitions:read');await settle();expect(top(f).view).toMatchObject({kind:'detail',title:entry.word});expect(f.controller.session.getSnapshot().frames).toHaveLength(4);expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();expect(f.api.copyDictionaryWord).not.toHaveBeenCalled();
 f.controller.setVisible(false);await settle();expect(f.controller.session.getSnapshot().frames).toHaveLength(1);expect(f.api.releaseDictionaryDefinitionsSearch).toHaveBeenCalledWith({revision:1,searchId:1});f.nextRevision();f.controller.setVisible(true);await settle();await open(f);expect(top(f).view).toMatchObject({kind:'list',title:'Dictionary',search:{query:''}});expect(f.api.configureDictionaryDefinitions).not.toHaveBeenCalled();expect(f.api.readDictionaryDefinition).toHaveBeenCalledTimes(1);
});
