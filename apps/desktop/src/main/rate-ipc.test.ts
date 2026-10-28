import {afterEach,expect,it,vi} from 'vitest';
import type {IpcMainInvokeEvent,WebContents} from 'electron';
import {LAUNCHER_CHANNELS,RATE_CHANNELS,RATE_ENDPOINT,rateConvertReplySchema} from '@linuxcast/contracts';
import type {LauncherCommandsReply,RateConfiguration,RateSnapshot} from '@linuxcast/contracts';
import {RateConversionService} from './rate-service.ts';
import {registerLauncherIpc} from './launcher-ipc.ts';
import {APP_URL} from './assets.ts';

const removers:(()=>void)[]=[];
afterEach(()=>{for(const remove of removers.splice(0))remove();vi.useRealTimers();});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
const pair={base:'USD',quote:'EUR'},payload={date:'2026-10-28',...pair,rate:0.8};
const commandId='linuxcast:currency-conversion';
async function fixture(options:{copy?:boolean}={}){
  let config:RateConfiguration={revision:0,source:'disabled',endpoint:RATE_ENDPOINT},snapshot:RateSnapshot|null=null;
  let visible=true,quitting=false,hidden:string[]=[],now='2026-10-29T00:00:00.000Z';
  const configuration=vi.fn(async()=>config);
  const configure=vi.fn(async(expectedRevision:number,source:'disabled'|'frankfurter')=>{
    if(config.revision!==expectedRevision)throw new Error('PRIVATE_OWNER_CONFLICT');
    config={revision:expectedRevision+1,source,endpoint:RATE_ENDPOINT};return config;
  });
  const fetch=vi.fn<(value:typeof pair,signal:AbortSignal)=>Promise<unknown>>(async()=>payload);
  const cache=vi.fn(async(value:RateSnapshot,revision:number)=>{if(config.source!=='frankfurter'||config.revision!==revision)throw new Error('PRIVATE_CACHE_CONFLICT');snapshot=value;});
  const clear=vi.fn(async(revision:number)=>{if(config.revision!==revision)throw new Error('PRIVATE_CLEAR_CONFLICT');snapshot=null;});
  const service=new RateConversionService({configuration,configure,fetch,cache,clear,cached:async()=>snapshot,now:()=>new Date(now)});
  const frame={url:APP_URL},contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>APP_URL} as unknown as WebContents;
  const event={sender:contents,senderFrame:frame} as IpcMainInvokeEvent;
  const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
  const copy=vi.fn<(text:string)=>Promise<'written'|'busy'|'unsupported'>>(async()=>'written');
  const recordUse=vi.fn(async()=>{}),hide=vi.fn(),visibility=vi.fn(async()=>hidden);
  const remove=registerLauncherIpc({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:channel=>{handlers.delete(channel);}}, {
    contents:()=>contents,quitting:()=>quitting,hide,quit:()=>{},openDataSettings:async()=>{},rates:service,rateVisible:()=>visible,
    ...(options.copy===false?{}:{copyCalculatorResult:copy}),recordUse,listHidden:visibility,
    setHidden:async(id,value)=>{hidden=hidden.filter(item=>item!==id);if(value)hidden.push(id);hidden.sort();return {commandId:id,hidden:value};},
  });
  removers.push(remove);
  const invoke=async(channel:string,value:unknown,sender=event)=>handlers.get(channel)!(sender,value);
  const catalogue=async()=>{const reply=await invoke(LAUNCHER_CHANNELS.getCommands,{protocolVersion:1}) as LauncherCommandsReply;if(!reply.ok)throw new Error('Catalogue unavailable.');return reply.value;};
  let revision=(await catalogue()).revision;
  const call=(channel:string,value:Record<string,unknown>={},sender=event)=>invoke(channel,{protocolVersion:1,revision,...value},sender);
  const enable=async()=>{const result=await call(RATE_CHANNELS.configure,{expectedRevision:config.revision,source:'frankfurter'});expect(result).toMatchObject({ok:true});};
  const convert=async(amount='100')=>{const reply=rateConvertReplySchema.parse(await call(RATE_CHANNELS.convert,{configurationRevision:config.revision,amount,...pair}));if(!reply.ok)throw new Error('Conversion unavailable.');return reply.value;};
  return {call,invoke,catalogue,enable,convert,fetch,cache,clear,configure,configuration,copy,recordUse,hide,visibility,frame,event,contents,handlers,service,remove,
    setVisible(value:boolean){visible=value;},setQuitting(value:boolean){quitting=value;},setHidden(value:string[]){hidden=value;},setNow(value:string){now=value;},
    setRevision(value:number){revision=value;},get revision(){return revision;},get config(){return config;}};
}

it('uses the real registered command and named source methods without fetching on reads, configuration or generic execution',async()=>{
  const f=await fixture();expect((await f.catalogue()).commands.find(row=>row.id===commandId)).toMatchObject({enabled:true});
  expect(await f.call(RATE_CHANNELS.configuration)).toEqual({ok:true,value:{revision:0,source:'disabled',endpoint:RATE_ENDPOINT}});
  expect(await f.call(RATE_CHANNELS.convert,{configurationRevision:0,amount:'100',...pair})).toMatchObject({ok:false,error:{code:'permission-denied'}});
  await f.enable();expect(await f.call(LAUNCHER_CHANNELS.execute,{commandId})).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(f.fetch).not.toHaveBeenCalled();expect(f.copy).not.toHaveBeenCalled();expect(f.recordUse).not.toHaveBeenCalled();expect(f.hide).not.toHaveBeenCalled();
});

it('rejects foreign windows, subframes and navigated own frames before storage or network operations',async()=>{
  const f=await fixture();for(const sender of [{sender:{},senderFrame:f.frame},{sender:f.contents,senderFrame:{url:APP_URL}}])expect(await f.call(RATE_CHANNELS.configuration,{},sender as IpcMainInvokeEvent)).toMatchObject({ok:false,error:{code:'permission-denied'}});
  f.frame.url='https://example.invalid/';expect(await f.call(RATE_CHANNELS.configure,{expectedRevision:0,source:'frankfurter'})).toMatchObject({ok:false,error:{code:'permission-denied'}});
  expect(f.configuration).not.toHaveBeenCalled();expect(f.configure).not.toHaveBeenCalled();expect(f.fetch).not.toHaveBeenCalled();
});

it('rejects target, result and endpoint authority and malformed payloads before dispatch',async()=>{
  const f=await fixture();for(const extra of [{endpoint:'https://example.invalid'},{rate:0.1},{text:'800 EUR'},{query:'private'}])expect(await f.call(RATE_CHANNELS.convert,{configurationRevision:0,amount:'100',...pair,...extra})).toMatchObject({ok:false,error:{code:'invalid-request'}});
  for(const patch of [{amount:'1e3'},{amount:'1+2'},{base:'../USD'},{quote:'USD'}])expect(await f.call(RATE_CHANNELS.convert,{configurationRevision:0,amount:'100',...pair,...patch})).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(f.configuration).not.toHaveBeenCalled();expect(f.fetch).not.toHaveBeenCalled();
});

it.each(['stale','hidden-window','quitting','hidden-command'] as const)('refuses %s context before starting rates work',async mode=>{
  const f=await fixture();await f.enable();if(mode==='stale')f.setRevision(f.revision-1);if(mode==='hidden-window')f.setVisible(false);if(mode==='quitting')f.setQuitting(true);if(mode==='hidden-command')f.setHidden([commandId]);
  expect(await f.call(RATE_CHANNELS.convert,{configurationRevision:1,amount:'100',...pair})).toMatchObject({ok:false});expect(f.fetch).not.toHaveBeenCalled();expect(f.copy).not.toHaveBeenCalled();
});

it('converts only the explicit pair and copies canonical locally recomputed text through an exact receipt',async()=>{
  const f=await fixture();await f.enable();const quote=await f.convert('-12.5');
  expect(quote).toMatchObject({amount:'-12.5',text:'-10',connection:'online',stale:false});expect(f.fetch).toHaveBeenCalledExactlyOnceWith(pair,expect.any(AbortSignal));expect(f.copy).not.toHaveBeenCalled();expect(f.recordUse).not.toHaveBeenCalled();
  expect(await f.call(RATE_CHANNELS.copy,{quoteId:quote.id})).toEqual({ok:true,value:{outcome:'copied',quoteId:quote.id,text:'-10',currency:'EUR'}});
  expect(f.copy).toHaveBeenCalledExactlyOnceWith('-10 EUR');expect(f.recordUse).toHaveBeenCalledExactlyOnceWith(commandId);expect(f.hide).not.toHaveBeenCalled();
});

it('invalidates an old quote when the caller supplies a newer valid registry revision',async()=>{
  const f=await fixture();await f.enable();const quote=await f.convert();
  const changed=await f.call(LAUNCHER_CHANNELS.setHidden,{commandId:'linuxcast:calculator',hidden:true}) as Extract<LauncherCommandsReply,{ok:true}>;expect(changed.ok).toBe(true);f.setRevision(changed.value.revision);
  expect(await f.call(RATE_CHANNELS.copy,{quoteId:quote.id})).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.copy).not.toHaveBeenCalled();
});

it.each(['clear','configure','expiry'] as const)('withholds stale quote copying after %s',async mode=>{
  const f=await fixture();await f.enable();const quote=await f.convert();
  if(mode==='clear')expect(await f.call(RATE_CHANNELS.clearCache,{configurationRevision:1})).toMatchObject({ok:true});
  if(mode==='configure')expect(await f.call(RATE_CHANNELS.configure,{expectedRevision:1,source:'disabled'})).toMatchObject({ok:true});
  if(mode==='expiry')f.setNow('2026-10-29T00:05:00.000Z');
  expect(await f.call(RATE_CHANNELS.copy,{quoteId:quote.id})).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.copy).not.toHaveBeenCalled();expect(f.fetch).toHaveBeenCalledTimes(1);
});

it.each(['frame','window','registry','dispose'] as const)('withholds a late converted quote after %s changes',async mode=>{
  const f=await fixture();await f.enable();const response=deferred<unknown>();f.fetch.mockImplementationOnce(()=>response.promise);
  const pending=f.call(RATE_CHANNELS.convert,{configurationRevision:1,amount:'100',...pair});await vi.waitFor(()=>expect(f.fetch).toHaveBeenCalledOnce());
  if(mode==='frame')f.frame.url='https://example.invalid/';if(mode==='window')f.setVisible(false);if(mode==='dispose')f.remove();
  if(mode==='registry'){const changed=await f.call(LAUNCHER_CHANNELS.setHidden,{commandId:'linuxcast:calculator',hidden:true}) as Extract<LauncherCommandsReply,{ok:true}>;expect(changed.ok).toBe(true);f.setRevision(changed.value.revision);}
  response.resolve(payload);expect(await pending).toMatchObject({ok:false});expect(f.copy).not.toHaveBeenCalled();expect(f.recordUse).not.toHaveBeenCalled();
});

it('rechecks the invoking frame after copy configuration await and dispatches no write',async()=>{
  const f=await fixture();await f.enable();const quote=await f.convert(),wait=deferred<RateConfiguration>();f.configuration.mockImplementationOnce(()=>wait.promise);
  const pending=f.call(RATE_CHANNELS.copy,{quoteId:quote.id});await vi.waitFor(()=>expect(f.configuration).toHaveBeenCalledTimes(3));f.frame.url='https://example.invalid/';wait.resolve(f.config);
  expect(await pending).toMatchObject({ok:false,error:{code:'permission-denied'}});expect(f.copy).not.toHaveBeenCalled();
});

it.each(['clear','configure'] as const)('refuses a quote invalidated by %s during the final pre-copy visibility read',async action=>{
  const f=await fixture();await f.enable();const quote=await f.convert(),read=deferred<string[]>(),before=f.visibility.mock.calls.length;
  f.visibility.mockResolvedValueOnce([]).mockImplementationOnce(()=>read.promise);
  const pending=f.call(RATE_CHANNELS.copy,{quoteId:quote.id});await vi.waitFor(()=>expect(f.visibility).toHaveBeenCalledTimes(before+2));
  if(action==='clear')expect(await f.call(RATE_CHANNELS.clearCache,{configurationRevision:1})).toMatchObject({ok:true});
  else expect(await f.call(RATE_CHANNELS.configure,{expectedRevision:1,source:'disabled'})).toMatchObject({ok:true});
  read.resolve([]);expect(await pending).toMatchObject({ok:false});expect(f.copy).not.toHaveBeenCalled();expect(f.recordUse).not.toHaveBeenCalled();
});

it.each(['busy','unsupported'] as const)('does not claim a copy or record use for native %s',async outcome=>{
  const f=await fixture();await f.enable();const quote=await f.convert();f.copy.mockResolvedValueOnce(outcome);
  expect(await f.call(RATE_CHANNELS.copy,{quoteId:quote.id})).toMatchObject({ok:false,error:{code:outcome==='busy'?'cancelled':'capability-unavailable'}});expect(f.copy).toHaveBeenCalledOnce();expect(f.recordUse).not.toHaveBeenCalled();
});

it('reports unavailable copying without losing the readable local quote',async()=>{
  const f=await fixture({copy:false});await f.enable();const quote=await f.convert();expect(quote.text).toBe('80');
  expect(await f.call(RATE_CHANNELS.copy,{quoteId:quote.id})).toMatchObject({ok:false,error:{code:'capability-unavailable'}});expect(f.copy).not.toHaveBeenCalled();
});

it('retains the unresolved copy slot after timeout and never automatically replays its write',async()=>{
  const f=await fixture();await f.enable();const quote=await f.convert(),write=deferred<'written'>();f.copy.mockImplementationOnce(()=>write.promise);vi.useFakeTimers();
  const pending=f.call(RATE_CHANNELS.copy,{quoteId:quote.id});await vi.waitFor(()=>expect(f.copy).toHaveBeenCalledOnce());await vi.advanceTimersByTimeAsync(4001);
  expect(await pending).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(await f.call(RATE_CHANNELS.copy,{quoteId:quote.id})).toMatchObject({ok:false,error:{code:'cancelled'}});expect(f.copy).toHaveBeenCalledOnce();
  write.resolve('written');await vi.waitFor(()=>expect(f.recordUse).toHaveBeenCalledOnce());expect(f.copy).toHaveBeenCalledOnce();
});

it('returns fixed redacted failures for provider, owner and clipboard errors without replay',async()=>{
  const f=await fixture();f.configure.mockRejectedValueOnce(new Error('PRIVATE_CONFIGURATION_BODY'));let reply=await f.call(RATE_CHANNELS.configure,{expectedRevision:0,source:'frankfurter'});expect(reply).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(JSON.stringify(reply)).not.toContain('PRIVATE_');await f.enable();
  f.fetch.mockRejectedValueOnce(new Error('PRIVATE_PROVIDER_BODY'));reply=await f.call(RATE_CHANNELS.convert,{configurationRevision:1,amount:'100',...pair});expect(reply).toMatchObject({ok:false,error:{code:'capability-unavailable'}});expect(JSON.stringify(reply)).not.toContain('PRIVATE_');
  const quote=await f.convert();f.copy.mockRejectedValueOnce(new Error('PRIVATE_CLIPBOARD_BODY'));reply=await f.call(RATE_CHANNELS.copy,{quoteId:quote.id});expect(reply).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(JSON.stringify(reply)).not.toContain('PRIVATE_');expect(f.copy).toHaveBeenCalledOnce();expect(f.recordUse).not.toHaveBeenCalled();
});

it('marks a dispatched configuration save unconfirmed after the window hides',async()=>{
  const f=await fixture(),saved=deferred<RateConfiguration>();f.configure.mockImplementationOnce(()=>saved.promise);
  const pending=f.call(RATE_CHANNELS.configure,{expectedRevision:0,source:'frankfurter'});await vi.waitFor(()=>expect(f.configure).toHaveBeenCalledOnce());f.setVisible(false);saved.resolve({revision:1,source:'frankfurter',endpoint:RATE_ENDPOINT});
  expect(await pending).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(f.fetch).not.toHaveBeenCalled();expect(f.configure).toHaveBeenCalledOnce();
});
