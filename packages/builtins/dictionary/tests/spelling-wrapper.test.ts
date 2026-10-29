import {expect,it,vi} from 'vitest';
import type {DictionaryApi,DictionarySpellingCopyReply,ViewModel} from '@linuxcast/contracts';
import {ViewSession} from '@linuxcast/ui/views';
import type {ActionIntent} from '@linuxcast/ui/views';
import {DictionaryFlow} from '../src/presentation.ts';
const language={id:'language:'+'a'.repeat(64),name:'en_AU',state:'available' as const},snapshotId='b'.repeat(64);
const words=[{id:'word:'+'1'.repeat(64),word:'notebook'},{id:'word:'+'2'.repeat(64),word:'notepad'}],suggestion={id:'spelling:'+'3'.repeat(64),text:'note book'};
const root:ViewModel={protocolVersion:1,viewId:'root',revision:1,kind:'list',title:'Search commands',search:{query:'dictionary',placeholder:'Search…',mode:'extension'},sections:[{id:'commands',items:[{id:'linuxcast:dictionary',title:'Dictionary'}]}]};
const tick=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
it('keeps base read failure truthful and competing effects fenced after spelling Copy → Back → failed new query until actual settlement',async()=>{
 let finishCopy!:(reply:DictionarySpellingCopyReply)=>void,searchId=0,failNextSearch=false;
 const actualCopy=new Promise<DictionarySpellingCopyReply>(resolve=>{finishCopy=resolve;});
 const api:DictionaryApi={
  searchDictionary:vi.fn(async input=>{if(failNextSearch){failNextSearch=false;throw new Error('SYNTHETIC_PRIVATE_SOURCE');}return{ok:true as const,value:{revision:input.revision,searchId:++searchId,query:input.query,requestedLanguageId:input.languageId??null,language,languages:[language],languagesTruncated:false,snapshotId,records:words,truncated:false}};}),
  releaseDictionarySearch:vi.fn(async input=>({ok:true as const,value:{outcome:'released' as const,searchId:input.searchId}})),
  copyDictionaryWord:vi.fn(async input=>({ok:true as const,value:{...input,outcome:'copied' as const,word:words[1]!.word}})),
  checkDictionarySpelling:vi.fn(async input=>({ok:true as const,value:{...input,checkId:9,language,snapshotId,backend:'hunspell-1.7' as const,correct:false,records:[suggestion],truncated:false}})),
  copyDictionarySpellingSuggestion:vi.fn(()=>actualCopy),
  releaseDictionarySpelling:vi.fn(async input=>({ok:true as const,value:{outcome:'released' as const,requestId:input.requestId}})),
  searchDictionaryDefinitions:vi.fn(async()=>{throw new Error('must remain fenced');}),
  releaseDictionaryDefinitionsSearch:vi.fn(async input=>({ok:true as const,value:{outcome:'released' as const,searchId:input.searchId}})),
 };
 const session=new ViewSession(root,id=>flow.closed(id)),flow=new DictionaryFlow({session,api,viewId:'wrapper',revision:7}),top=()=>session.getSnapshot().frames.at(-1)!;
 const act=(actionId:string,values?:ActionIntent['values'])=>{const frame=top();return flow.handle({viewId:frame.view.viewId,revision:frame.view.revision,actionId,...(frame.selection?{itemId:frame.selection}:{}),...(values?{values}:{})});};
 try{
  flow.open('root');await tick();const baseId=top().view.viewId;flow.query(baseId,'note');await tick();session.select(baseId,words[1]!.id);
  await act('dictionary:spelling');expect(top().view).toMatchObject({kind:'form',title:'Check spelling'});await act('spelling:check',{word:'notebok'});expect(top().view).toMatchObject({kind:'list',title:'Spelling results'});
  const callerCopy=act('spelling:copy');await tick();expect(api.copyDictionarySpellingSuggestion).toHaveBeenCalledTimes(1);const issued=vi.mocked(api.copyDictionarySpellingSuggestion!).mock.calls[0]![0];
  session.pop();await callerCopy;await tick();expect(top()).toMatchObject({query:'note',selection:words[1]!.id});expect(top().view.title).toBe('Dictionary');expect(api.releaseDictionarySpelling).toHaveBeenCalledExactlyOnceWith({revision:7,requestId:issued.requestId});
  const retained=top().view;if(retained.kind!=='list')throw new Error('Expected base List.');expect(retained.sections[0]!.items.find(row=>row.id===words[1]!.id)?.actions?.[0]?.disabledReason).toContain('pending spelling request');await act('dictionary:copy');expect(api.copyDictionaryWord).not.toHaveBeenCalled();
  failNextSearch=true;flow.query(baseId,'revised');await tick();expect(top()).toMatchObject({query:'revised',selection:null});expect(top().view.status?.message).toContain('Wait for pending requests to settle');expect(top().view.status?.message).not.toMatch(/nothing was copied|SYNTHETIC_PRIVATE_SOURCE|Copied note book/iu);
  const base=top().view;if(base.kind!=='list')throw new Error('Expected retained Dictionary List.');expect(base.sections[0]?.items??[]).toHaveLength(0);
  // No row is kept authoritative after the failed base read. Every competing
  // global route is visibly fenced, and direct attempts cannot reach its API.
  for(const id of ['dictionary:language','dictionary:reload','dictionary:definitions','dictionary:spelling'])expect(base.actions?.find(action=>action.id===id)?.disabledReason).toContain('Wait for the current request');
  const searchesBefore=vi.mocked(api.searchDictionary!).mock.calls.length;
  for(const id of ['dictionary:copy','dictionary:language','dictionary:reload','dictionary:definitions','dictionary:spelling'])await act(id);
  expect(top().view.title).toBe('Dictionary');expect(api.copyDictionaryWord).not.toHaveBeenCalled();expect(api.searchDictionaryDefinitions).not.toHaveBeenCalled();expect(api.searchDictionary).toHaveBeenCalledTimes(searchesBefore);expect(api.checkDictionarySpelling).toHaveBeenCalledTimes(1);expect(api.copyDictionarySpellingSuggestion).toHaveBeenCalledTimes(1);
  finishCopy({ok:true,value:{...issued,outcome:'copied',text:suggestion.text}});await tick();expect(top()).toMatchObject({query:'revised',selection:words[0]!.id});expect(top().view.status?.message).not.toContain('Copied note book');expect(api.searchDictionary).toHaveBeenLastCalledWith({revision:7,query:'revised',languageId:language.id});
  const refreshed=top().view;if(refreshed.kind!=='list')throw new Error('Expected refreshed Dictionary List.');expect(refreshed.sections[0]!.items.find(row=>row.id===words[1]!.id)?.actions?.[0]?.disabledReason).toBeUndefined();expect(refreshed.actions?.find(action=>action.id==='dictionary:spelling')?.disabledReason).toBeUndefined();expect(api.copyDictionaryWord).not.toHaveBeenCalled();expect(api.checkDictionarySpelling).toHaveBeenCalledTimes(1);expect(api.copyDictionarySpellingSuggestion).toHaveBeenCalledTimes(1);
 }finally{flow.dispose();}
});
