import {afterEach,expect,it,vi} from 'vitest';
import type {IpcMainInvokeEvent,WebContents} from 'electron';
import {registerSpellingIpc} from './dictionary-spelling-ipc.ts';
import {DICTIONARY_SPELLING_CHANNELS as channels,dictionarySpellingReplySchema} from '../../../../packages/contracts/src/dictionary-spelling.ts';
import type {DictionaryBackend} from './dictionary-ipc.ts';
// Synthetic IPC/source/clipboard, distinct from the real native and Electron suites.
const language={id:`language:${'a'.repeat(64)}`,name:'en_US',state:'available' as const,encoding:'UTF-8'},snapshotId='b'.repeat(64);
const uuid=(n=1)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};}
function fixture(){
 const frame={url:'linuxcast://synthetic-shell'},owner={} as WebContents,event={sender:owner,senderFrame:frame} as unknown as IpcMainInvokeEvent,state={active:true,busy:false,revision:5,generation:1};
 const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
 const backend={languages:vi.fn<DictionaryBackend['languages']>(async()=>({languages:[language],truncated:false})),search:vi.fn<DictionaryBackend['search']>(async()=>({language,snapshotId,query:'',words:[],truncated:false})),checkSpelling:vi.fn<NonNullable<DictionaryBackend['checkSpelling']>>(async input=>({language,snapshotId,word:input.word,correct:false,suggestions:['café','two words'],truncated:false,backend:'hunspell-1.7'}))};
 const released=vi.fn(()=>{state.busy=false;}),context:Parameters<typeof registerSpellingIpc>[2]={trusted:vi.fn(e=>e.sender===owner&&e.senderFrame===event.senderFrame&&frame.url==='linuxcast://synthetic-shell'),active:()=>state.active,busy:()=>state.busy,revision:()=>state.revision,generation:()=>state.generation,authorize:vi.fn(async()=>undefined),acquire:vi.fn(()=>{state.busy=true;state.generation++;return released;}),recordUse:vi.fn(async()=>{}),copy:vi.fn(async()=>'written' as const)};
 const remove=registerSpellingIpc({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:channel=>{handlers.delete(channel);}},backend,context);
 const invoke=(channel:string,payload:unknown,sender=event)=>Promise.resolve(handlers.get(channel)!(sender,payload));
 const request=(n=1)=>({protocolVersion:1,revision:5,requestId:uuid(n),languageId:language.id,word:'caff'});
 const check=(n=1)=>invoke(channels.check,request(n));
 const issue=async(n=1)=>{const reply=dictionarySpellingReplySchema.parse(await check(n));if(!reply.ok)throw new Error('Synthetic issue failed');return reply.value;};
 const selection=(choice:Awaited<ReturnType<typeof issue>>)=>({...request(),requestId:choice.requestId,checkId:choice.checkId,snapshotId:choice.snapshotId,id:choice.records[0]!.id});
 const release=(n=1)=>invoke(channels.release,{protocolVersion:1,revision:5,requestId:uuid(n)});
 return{frame,event,state,handlers,backend,context,released,remove,invoke,request,check,issue,selection,release};
}
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('checks read-only, preserves native suggestion order/spaces, freshly validates source and only copies issued text with aggregate use',async()=>{
 const f=fixture(),choice=await f.issue();expect(choice.records.map(row=>row.text)).toEqual(['café','two words']);expect(f.context.copy).not.toHaveBeenCalled();expect(f.context.recordUse).not.toHaveBeenCalled();
 for(let n=0;n<2;n++)expect(await f.invoke(channels.copy,f.selection(choice))).toMatchObject({ok:true,value:{outcome:'copied',text:'café',requestId:uuid()}});
 expect(f.backend.search).toHaveBeenCalledTimes(2);expect(f.backend.search).toHaveBeenLastCalledWith({languageId:language.id,query:''});expect(f.context.copy).toHaveBeenNthCalledWith(1,'café');expect(f.context.recordUse).toHaveBeenCalledTimes(2);expect(f.context.recordUse).toHaveBeenLastCalledWith();expect(f.released).toHaveBeenCalledTimes(2);
});
it('returns the original correctly recognised word as the only Copy choice',async()=>{const f=fixture();f.backend.checkSpelling.mockImplementationOnce(async input=>({language,snapshotId,word:input.word,correct:true,suggestions:[],truncated:false,backend:'hunspell-1.7'}));expect(await f.issue()).toMatchObject({correct:true,records:[{text:'caff'}],truncated:false});});
it('denies forged frames, extra fields, malformed words and obsolete revisions before reading sources',async()=>{
 const f=fixture();for(const channel of Object.values(channels))expect(await f.invoke(channel,{}, {...f.event,senderFrame:{url:f.frame.url}} as IpcMainInvokeEvent)).toMatchObject({ok:false,error:{code:'permission-denied'}});
 for(const patch of [{revision:4},{protocolVersion:2},{requestId:'old'},{word:'two words'},{word:'\u202e'},{word:'x'.repeat(257)},{path:'/private'},{suggestions:['forged']},{signal:4}])expect(await f.invoke(channels.check,{...f.request(),...patch})).toMatchObject({ok:false,error:{code:'invalid-request'}});
 expect(f.backend.languages).not.toHaveBeenCalled();expect(f.backend.checkSpelling).not.toHaveBeenCalled();expect(f.context.acquire).not.toHaveBeenCalled();
});
it('honestly rejects absent backend, unavailable language and malformed or mismatched native results without copy authority',async()=>{
 const base={language,snapshotId,word:'caff',correct:false,suggestions:['café'],truncated:false,backend:'hunspell-1.7'};
 for(const patch of [{word:'other'},{language:{...language,name:'other'}},{snapshotId:'invalid'},{suggestions:['duplicate','duplicate']},{correct:true},{suggestions:['\u202e']},{backend:'fallback'}]){const f=fixture();f.backend.checkSpelling.mockResolvedValueOnce({...base,...patch} as never);expect(await f.check()).toMatchObject({ok:false});expect(f.context.copy).not.toHaveBeenCalled();}
 const f=fixture();f.backend.languages.mockResolvedValueOnce({languages:[{...language,state:'unavailable'}],truncated:false} as never);expect(await f.check()).toMatchObject({ok:false,error:{code:'capability-unavailable'}});expect(f.backend.checkSpelling).not.toHaveBeenCalled();
});
it.each(['visibility','frame','revision','generation','busy','dispose'] as const)('refuses late check results after %s changes',async mode=>{
 const f=fixture(),held=deferred<Awaited<ReturnType<NonNullable<DictionaryBackend['checkSpelling']>>>>();f.backend.checkSpelling.mockReturnValueOnce(held.promise);const pending=f.check();await vi.waitFor(()=>expect(f.backend.checkSpelling).toHaveBeenCalledTimes(1));if(mode==='visibility')f.state.active=false;else if(mode==='frame')f.frame.url='https://example.invalid';else if(mode==='revision')f.state.revision++;else if(mode==='generation')f.state.generation++;else if(mode==='busy')f.state.busy=true;else f.remove();held.resolve({language,snapshotId,word:'caff',correct:false,suggestions:['café'],truncated:false,backend:'hunspell-1.7'});expect(await pending).toMatchObject({ok:false,error:{code:'cancelled'}});expect(f.context.copy).not.toHaveBeenCalled();
});
it('cancels a pending invocation by UUID and ignores a stale release for a newer result',async()=>{
 const f=fixture(),held=deferred<Awaited<ReturnType<NonNullable<DictionaryBackend['checkSpelling']>>>>();f.backend.checkSpelling.mockReturnValueOnce(held.promise);const old=f.check();await vi.waitFor(()=>expect(f.backend.checkSpelling).toHaveBeenCalledTimes(1));await f.release();expect(f.backend.checkSpelling.mock.calls[0]![0].signal.aborted).toBe(true);const fresh=await f.issue(2);await f.release();held.resolve({language,snapshotId,word:'caff',correct:false,suggestions:['old'],truncated:false,backend:'hunspell-1.7'});expect(await old).toMatchObject({ok:false});expect(await f.invoke(channels.copy,f.selection(fresh))).toMatchObject({ok:true});
});
it('holds four actual read slots after timeout until settlement, aborts native work and queues no fifth request',async()=>{
 vi.useFakeTimers();const f=fixture(),held=deferred<Awaited<ReturnType<NonNullable<DictionaryBackend['checkSpelling']>>>>();f.backend.checkSpelling.mockReturnValue(held.promise);const pending=[];for(let n=1;n<=4;n++){pending.push(f.check(n));await vi.advanceTimersByTimeAsync(0);}expect(f.backend.checkSpelling).toHaveBeenCalledTimes(4);await vi.advanceTimersByTimeAsync(4001);expect((await Promise.all(pending)).every(reply=>(reply as {ok:boolean}).ok===false)).toBe(true);expect(await f.check(5)).toMatchObject({ok:false,error:{code:'cancelled'}});expect(f.backend.checkSpelling.mock.calls.every(([input])=>input.signal.aborted)).toBe(true);held.resolve({language,snapshotId,word:'caff',correct:false,suggestions:[],truncated:false,backend:'hunspell-1.7'});await vi.advanceTimersByTimeAsync(0);f.backend.checkSpelling.mockResolvedValue({language,snapshotId,word:'caff',correct:false,suggestions:[],truncated:false,backend:'hunspell-1.7'});expect(await f.check(6)).toMatchObject({ok:true});
});
it('binds Copy to the full issued context, refusing injected text and changed sources before clipboard dispatch',async()=>{
 const f=fixture(),choice=await f.issue(),payload=f.selection(choice);for(const patch of [{requestId:uuid(2)},{checkId:choice.checkId+1},{word:'other'},{snapshotId:'f'.repeat(64)},{id:`spelling:${'f'.repeat(64)}`}])expect(await f.invoke(channels.copy,{...payload,...patch})).toMatchObject({ok:false,error:{code:'conflict'}});
 for(const patch of [{text:'injected'},{path:'/private'}])expect(await f.invoke(channels.copy,{...payload,...patch})).toMatchObject({ok:false,error:{code:'invalid-request'}});
 f.backend.search.mockResolvedValueOnce({language,snapshotId:'d'.repeat(64),query:'',words:[],truncated:false});expect(await f.invoke(channels.copy,payload)).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.context.copy).not.toHaveBeenCalled();expect(f.context.recordUse).not.toHaveBeenCalled();expect(f.released).toHaveBeenCalledTimes(1);
});
it('reauthorizes immediately before Copy and cancels release before dispatch while holding the actual reservation',async()=>{
 const f=fixture(),choice=await f.issue(),held=deferred<undefined>();vi.mocked(f.context.authorize).mockReturnValueOnce(held.promise);const pending=f.invoke(channels.copy,f.selection(choice));await f.release();expect(f.state.busy).toBe(true);expect(await f.check(2)).toMatchObject({ok:false,error:{code:'cancelled'}});held.resolve(undefined);expect(await pending).toMatchObject({ok:false,error:{code:'cancelled'}});expect(f.context.copy).not.toHaveBeenCalled();expect(f.released).toHaveBeenCalledTimes(1);
 const next=await f.issue(2);vi.mocked(f.context.authorize).mockResolvedValueOnce(undefined).mockResolvedValueOnce({ok:false,error:{code:'permission-denied',message:'Synthetic revoked.',retryable:false}});expect(await f.invoke(channels.copy,f.selection(next))).toMatchObject({ok:false,error:{code:'permission-denied'}});expect(f.context.copy).not.toHaveBeenCalled();
});
it('keeps a dispatched write reserved past release/deadline; late outcome never replays or records use',async()=>{
 vi.useFakeTimers();const f=fixture(),choice=await f.issue(),held=deferred<'written'>();vi.mocked(f.context.copy!).mockReturnValueOnce(held.promise);const pending=f.invoke(channels.copy,f.selection(choice));await vi.advanceTimersByTimeAsync(0);expect(f.context.copy).toHaveBeenCalledTimes(1);await f.release();await vi.advanceTimersByTimeAsync(4001);expect(await pending).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(f.state.busy).toBe(true);expect(f.released).not.toHaveBeenCalled();expect(await f.check(2)).toMatchObject({ok:false,error:{code:'cancelled'}});held.resolve('written');await vi.advanceTimersByTimeAsync(0);expect(f.state.busy).toBe(false);expect(f.context.recordUse).not.toHaveBeenCalled();expect(await f.invoke(channels.copy,f.selection(choice))).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.context.copy).toHaveBeenCalledTimes(1);
});
it('bounds work by monotonic time even before the timer callback and redacts source failures',async()=>{
 const f=fixture(),held=deferred<undefined>(),clock=vi.spyOn(performance,'now').mockReturnValue(0);vi.mocked(f.context.authorize).mockReturnValueOnce(held.promise);const pending=f.check();clock.mockReturnValue(4001);held.resolve(undefined);expect(await pending).toMatchObject({ok:false,error:{code:'cancelled'}});expect(f.backend.languages).not.toHaveBeenCalled();clock.mockRestore();f.backend.checkSpelling.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE_WORD_PATH'));const reply=await f.check(2);expect(reply).toMatchObject({ok:false,error:{code:'capability-unavailable'}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');
});
it.each(['unsupported','busy','throw'] as const)('reports %s Copy without simulated success or automatic retry',async mode=>{
 const f=fixture(),choice=await f.issue();if(mode==='throw')vi.mocked(f.context.copy!).mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE'));else vi.mocked(f.context.copy!).mockResolvedValueOnce(mode);const reply=await f.invoke(channels.copy,f.selection(choice));expect(reply).toMatchObject({ok:false,error:{code:mode==='throw'?'deadline-exceeded':mode==='busy'?'cancelled':'capability-unavailable'}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');expect(f.context.recordUse).not.toHaveBeenCalled();expect(f.context.copy).toHaveBeenCalledTimes(1);expect(f.state.busy).toBe(false);
});
