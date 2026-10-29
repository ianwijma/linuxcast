import {afterEach,expect,it,vi} from 'vitest';
import type {LauncherApi,LauncherCommandMetadata,EmojiSearchReply} from '@linuxcast/contracts';
import {LauncherController} from '../controller.ts';
const controllers:LauncherController[]=[];
afterEach(()=>{for(const controller of controllers.splice(0))controller.dispose();});
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
const record={id:'emoji:1f600',value:'😀',name:'grinning face',group:'Smileys & Emotion',subgroup:'face-smiling',version:'1.0'};
function setup(){
 let revision=1,searchId=0;
 const commands:LauncherCommandMetadata[]=[{id:'linuxcast:emoji',title:'Emoji',aliases:['emoji'],keywords:['unicode'],enabled:true,hidden:false,usage:null}];
 const api:LauncherApi={getLauncherCommands:vi.fn(async()=>({ok:true as const,value:{revision,rankingAvailable:true,commands}})),executeLauncherCommand:vi.fn(),openLauncherUrl:vi.fn(),setLauncherPinned:vi.fn(),setLauncherAlias:vi.fn(),searchEmoji:vi.fn(async input=>({ok:true as const,value:{...input,searchId:++searchId,datasetVersion:'17.0' as const,group:input.group??null,groups:[{id:record.group,name:record.group,count:1}],records:[record]}})),copyEmoji:vi.fn(async input=>({ok:true as const,value:{...input,outcome:'copied' as const,group:input.group??null,value:record.value}})),releaseEmojiSearch:vi.fn(async input=>({ok:true as const,value:{outcome:'released' as const,searchId:input.searchId}}))};
 const controller=new LauncherController(api,vi.fn(async()=>({ok:true as const,value:null})));controllers.push(controller);controller.setVisible(true);
 return {api,controller,commands,nextRevision:()=>{revision++;}};
}
function top(f:ReturnType<typeof setup>){return f.controller.session.getSnapshot().frames.at(-1)!;}
async function open(f:ReturnType<typeof setup>,extra:Record<string,unknown>={}){const frame=top(f);f.controller.session.select(frame.view.viewId,'linuxcast:emoji');await f.controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId:'linuxcast:emoji',itemId:'linuxcast:emoji',...extra});await settle();}
async function action(f:ReturnType<typeof setup>,actionId:string){const frame=top(f);return f.controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId,...(frame.selection?{itemId:frame.selection}:{})});}
it('opens a registered Emoji shared Grid and routes query and exact selected Copy to named APIs only',async()=>{
 const f=setup();await settle();f.controller.session.setQuery('linuxcast-launcher','emoji');f.controller.query('emoji');await settle();await open(f);
 expect(top(f).view).toMatchObject({kind:'grid',title:'Emoji'});expect(f.api.copyEmoji).not.toHaveBeenCalled();expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
 const id=top(f).view.viewId;f.controller.session.setQuery(id,'grin');f.controller.host.queryChanged!(id,'grin',top(f).queryRevision);await settle();
 expect(f.api.searchEmoji).toHaveBeenLastCalledWith({revision:1,query:'grin'});f.controller.session.select(id,record.id);await action(f,'emoji:copy');
 expect(f.api.copyEmoji).toHaveBeenCalledExactlyOnceWith({revision:1,searchId:2,query:'grin',id:record.id});expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
 f.controller.session.pop();await settle();expect(top(f)).toMatchObject({query:'emoji',selection:'linuxcast:emoji'});expect(f.api.releaseEmojiSearch).toHaveBeenCalledWith({revision:1,searchId:2});
});
it('clears category and Grid on Hide, releases its handle and rejects stale actions after reopen',async()=>{
 const f=setup();await settle();await open(f);await action(f,'emoji:category');const old=top(f);expect(old.view).toMatchObject({kind:'form',title:'Emoji category'});
 f.controller.setVisible(false);await settle();expect(f.controller.session.getSnapshot().frames).toHaveLength(1);expect(f.api.releaseEmojiSearch).toHaveBeenCalledWith({revision:1,searchId:1});
 f.nextRevision();f.controller.setVisible(true);await settle();await open(f);expect(top(f).view).toMatchObject({kind:'grid',search:{query:''}});
 await f.controller.execute({viewId:old.view.viewId,revision:old.view.revision,actionId:'emoji:apply-category',values:{category:record.group}});expect(top(f).view.kind).toBe('grid');expect(f.api.copyEmoji).not.toHaveBeenCalled();
 expect(f.api.searchEmoji).toHaveBeenLastCalledWith({revision:2,query:''});
});
it('releases a late search after Hide and does not publish it into a reopened root',async()=>{
 const f=setup();let finish!:(value:EmojiSearchReply)=>void;vi.mocked(f.api.searchEmoji!).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await settle();await open(f);f.controller.setVisible(false);f.controller.setVisible(true);await settle();
 finish({ok:true,value:{revision:1,searchId:99,datasetVersion:'17.0',query:'',group:null,groups:[{id:record.group,name:record.group,count:1}],records:[record]}});await settle();expect(top(f).view.kind).toBe('list');expect(f.api.releaseEmojiSearch).toHaveBeenCalledWith({revision:1,searchId:99});expect(f.api.copyEmoji).not.toHaveBeenCalled();
});
it.each(['hidden','disabled'] as const)('does not open an Emoji command that is %s',async state=>{const f=setup();await settle();if(state==='hidden')f.commands[0]!.hidden=true;else {f.commands[0]!.enabled=false;f.commands[0]!.unavailableReason='Synthetic unavailable.';}await f.controller.refresh();await open(f);expect(top(f).view.kind).toBe('list');expect(f.api.searchEmoji).not.toHaveBeenCalled();expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();});
it('rejects extra root payload and selection mismatch before opening the local flow',async()=>{const f=setup();await settle();await open(f,{values:{text:'forged'}});expect(top(f).view.kind).toBe('list');const frame=top(f);await f.controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId:'linuxcast:emoji',itemId:'not-selected'});expect(f.api.searchEmoji).not.toHaveBeenCalled();expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();});
it('applies a read-only tone filter through the shared Form before a separate tone-bound Copy',async()=>{
 const f=setup();await settle();await open(f);await action(f,'emoji:tone');const form=top(f);expect(form.view).toMatchObject({kind:'form',title:'Skin tone'});
 await f.controller.execute({viewId:form.view.viewId,revision:form.view.revision,actionId:'emoji:apply-tone',values:{tone:'unmodified'}});await settle();
 expect(top(f).view.kind).toBe('grid');expect(f.api.searchEmoji).toHaveBeenLastCalledWith({revision:1,query:'',tone:'unmodified'});expect(f.api.copyEmoji).not.toHaveBeenCalled();
 await action(f,'emoji:copy');expect(f.api.copyEmoji).toHaveBeenCalledExactlyOnceWith({revision:1,searchId:2,query:'',tone:'unmodified',id:record.id});expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
});
it('clears the tone Form and filter on Hide and opens All tones with an omitted key after reopen',async()=>{
 const f=setup();await settle();await open(f);await action(f,'emoji:tone');let form=top(f);await f.controller.execute({viewId:form.view.viewId,revision:form.view.revision,actionId:'emoji:apply-tone',values:{tone:'unmodified'}});await settle();await action(f,'emoji:tone');form=top(f);
 f.controller.setVisible(false);await settle();expect(f.controller.session.getSnapshot().frames).toHaveLength(1);f.nextRevision();f.controller.setVisible(true);await settle();await open(f);
 expect(f.api.searchEmoji).toHaveBeenLastCalledWith({revision:2,query:''});await f.controller.execute({viewId:form.view.viewId,revision:form.view.revision,actionId:'emoji:apply-tone',values:{tone:'dark'}});expect(top(f).view.kind).toBe('grid');expect(f.api.copyEmoji).not.toHaveBeenCalled();
});

it('routes custom keyword editing through the selected shared Form and clears the Form on Hide without generic execution or clipboard work',async()=>{
 const f=setup();let keywords:string[]=[],preferenceRevision=0,searchId=0;
 vi.mocked(f.api.searchEmoji!).mockImplementation(async input=>({ok:true,value:{...input,searchId:++searchId,datasetVersion:'17.0',group:input.group??null,keywords:{available:true,revision:preferenceRevision},groups:[{id:record.group,name:record.group,count:1}],records:[{...record,customKeywords:keywords}]}}));
 f.api.setEmojiKeywords=vi.fn(async (input:Parameters<NonNullable<LauncherApi['setEmojiKeywords']>>[0])=>{keywords=input.keywords;preferenceRevision++;return {ok:true as const,value:{...input,outcome:'updated' as const,group:input.group??null,keywordsRevision:preferenceRevision}};});
 await settle();await open(f);await action(f,'emoji:keywords');let form=top(f);expect(form.view).toMatchObject({kind:'form',title:'Emoji search keywords',fields:[{id:'keywords',kind:'text',multiline:true,value:''}]});
 await f.controller.execute({viewId:form.view.viewId,revision:form.view.revision,actionId:'emoji:save-keywords',values:{keywords:'public café\npublic family'}});await settle();expect(f.api.setEmojiKeywords).toHaveBeenCalledExactlyOnceWith({revision:1,query:'',searchId:1,id:record.id,keywords:['public café','public family'],keywordsRevision:0});
 expect(top(f).view.kind).toBe('grid');expect(f.api.releaseEmojiSearch).toHaveBeenCalledWith({revision:1,searchId:1});expect(f.api.copyEmoji).not.toHaveBeenCalled();expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
 await action(f,'emoji:keywords');form=top(f);expect(form.view).toMatchObject({kind:'form',fields:[{value:'public café\npublic family'}]});f.controller.setVisible(false);await settle();expect(f.controller.session.getSnapshot().frames).toHaveLength(1);f.controller.setVisible(true);await settle();await open(f);
 await f.controller.execute({viewId:form.view.viewId,revision:form.view.revision,actionId:'emoji:save-keywords',values:{keywords:'stale'}});expect(top(f).view.kind).toBe('grid');expect(f.api.setEmojiKeywords).toHaveBeenCalledTimes(1);expect(f.api.copyEmoji).not.toHaveBeenCalled();expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
});
