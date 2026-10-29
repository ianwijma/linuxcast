import {registerDictionaryIpc} from './dictionary-ipc.ts';
import type {DictionaryBackend} from './dictionary-ipc.ts';
import {registerEmojiIpc} from './emoji-ipc.ts';
import type {EmojiBackend} from './emoji-ipc.ts';
import {registerLauncherNotesIpc} from './notes-launcher-ipc.ts';
import type {NotesLauncherSelection,NotesRootSearch} from '../../../../packages/contracts/src/notes-launcher.ts';
import type {NoteRecord} from '../../../../packages/contracts/src/notes.ts';
import { compileQuicklinkCommands } from './quicklink-commands.ts';
import { compileWorkflowCommands,matchWorkflowCommand,WorkflowCommandUnavailable } from './workflow-commands.ts';
import type { WorkflowCommand,WorkflowCommandSelection } from './workflow-commands.ts';
import type { WorkflowEditorRecord } from '../../../../packages/contracts/src/workflow-editor.ts';
import { formatCalculationText } from '@linuxcast/calculator/result';
import { evaluateExpression } from '@linuxcast/calculator/evaluate';
import { calculatorCopyRequestSchema } from '@linuxcast/contracts';
import type { CalculatorCopyReply } from '@linuxcast/contracts';
import { MAX_ENVELOPE_BYTES } from '../../../../packages/contracts/src/index.ts';
import { ApplicationsUnavailable } from '@linuxcast/applications';
import { createHash } from 'node:crypto';
import { nativeApplicationSchema } from '../../../../packages/contracts/src/applications.ts';
import type { NativeApplication } from '../../../../packages/contracts/src/applications.ts';
import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import {
  LAUNCHER_CHANNELS, launcherCommandsRequestSchema, launcherExecuteRequestSchema,
  launcherCommandsReplySchema, launcherPinRequestSchema, launcherAliasRequestSchema, normalizeCommandAlias, launcherOpenUrlRequestSchema, launcherVisibilityRequestSchema, isLauncherVisibilityProtected, launcherApplicationActionRequestSchema,launcherApplicationActionReplySchema,
} from '../../../../packages/contracts/src/launcher.ts';
import type { LauncherCommandMetadata, LauncherCommandsReply, LauncherExecuteReply, LauncherOpenUrlReply,LauncherApplicationActionReply } from '../../../../packages/contracts/src/launcher.ts';
import { hiddenCommandIdsSchema } from '@linuxcast/storage';
import type { CommandUsage, CommandVisibility } from '@linuxcast/storage';
import { trustedShellSender } from './ipc.ts';
import {registerRateIpc} from './rate-ipc.ts';
import type {RateConversionService} from './rate-service.ts';
import { registerQuicklinksIpc } from './quicklinks-ipc.ts';
import type { QuicklinkBackend } from './quicklinks-ipc.ts';

export interface LauncherActions {
  dictionary?:DictionaryBackend;
  dictionaryVisible?:()=>boolean;
  emoji?:EmojiBackend;
  emojiVisible?:()=>boolean;
  searchNotes?:(query:string)=>Promise<NotesRootSearch>;
  getNote?:(id:string)=>Promise<NoteRecord|null>;
  openNote?:(selection:NotesLauncherSelection,current:()=>boolean)=>Promise<void>;
  rates?:RateConversionService;
  rateVisible?:()=>boolean;
  quicklinks?:QuicklinkBackend;
  loadWorkflowCommands?:()=>Promise<WorkflowEditorRecord|null>;
  openWorkflowEntry?:(selection:WorkflowCommandSelection,trusted:()=>boolean)=>Promise<void>;
  contents(): WebContents | undefined;
  quitting(): boolean;
  hide(): void;
  quit(): void | Promise<boolean>;
  copyCalculatorResult?: (text:string) => Promise<'written'|'unsupported'|'busy'>;
  openWorkflowEditor?: () => Promise<void>;
  openNotes?: () => Promise<void>;
  openQuickNote?: () => Promise<void>;
  openFileSearch?: () => Promise<void>;
  openDataSettings?: () => Promise<void>;
  openUrl?: (url:string) => Promise<'dispatched'>;
  getUsage?: (commandId: string) => Promise<CommandUsage | null>;
  recordUse?: (commandId: string) => Promise<unknown>;
  listApplications?: () => Promise<NativeApplication[]>;
  launchApplication?: (application: Pick<NativeApplication,'desktopId'|'fingerprint'>) => Promise<'dispatched'>;
  launchApplicationAction?: (application:Pick<NativeApplication,'desktopId'|'fingerprint'>&{actionId:string})=>Promise<{outcome:'requested';actionId:string}>;
  setPinned?: (commandId: string, pinned: boolean) => Promise<CommandUsage>;
  setAlias?: (commandId: string, alias: string | null) => Promise<CommandUsage>;
  listHidden?: () => Promise<string[]>;
  setHidden?: (commandId:string,hidden:boolean) => Promise<CommandVisibility>;
}

const failure = (code: 'invalid-request' | 'permission-denied' | 'cancelled' | 'internal'): Extract<LauncherExecuteReply,{ok:false}> => ({
  ok: false, error: {code, message: {
    'invalid-request': 'Command list changed. Search again to refresh it.',
    'permission-denied': 'Launcher request denied.',
    cancelled: 'Launcher action is already running or Linuxcast is quitting.',
    internal: 'Launcher action unavailable. Try again from the launcher.',
  }[code], retryable: false},
});

/** Registered built-ins, GIO applications and saved Keyword entries. No query, path or Exec authority enters main. */
export function registerLauncherIpc(ipc: Pick<IpcMain,'handle'|'removeHandler'>, actions: LauncherActions): () => void {
  let disposed = false, busy = false, quitDispatched = false;
  let metadataPending=false,metadataGeneration=0,urlPending=false,calculatorPending=false,applicationActionPending=false,quicklinksPending=false;
  let revision = actions.openDataSettings ? 1 : 2;
  let applicationState: 'available'|'unavailable'|undefined;
  let quicklinkState:'available'|'unavailable'|undefined,quicklinkCommands:Omit<LauncherCommandMetadata,'usage'>[]=[],quicklinkRefreshing:Promise<void>|undefined,quicklinkRefreshGeneration=-1;
  let workflowState:'available'|'unavailable'|undefined,workflowCommands:WorkflowCommand[]=[],workflowRefreshing:Promise<void>|undefined;
  let applications: NativeApplication[] = [];
  let refreshing: Promise<void>|undefined;
  let hiddenIds=new Set<string>(),visibilityAvailable:boolean|undefined;
  const applicationRecords = new Map<string,NativeApplication>();
  const builtins: Omit<LauncherCommandMetadata,'usage'>[] = [
    {id:'linuxcast:open-local-data', title:'Local data', subtitle:'Clear usage or export local application data', aliases:['data','settings'], keywords:['privacy','clear','export','history'], enabled:!!actions.openDataSettings,
      ...(!actions.openDataSettings ? {unavailableReason:'Local data settings are unavailable. Reopen Linuxcast to try again.'} : {})},
    {id:'linuxcast:hide', title:'Hide Linuxcast', subtitle:'Keep Linuxcast running and close the launcher', aliases:['hide'], keywords:['close','dismiss'], enabled:true},
    {id:'linuxcast:quit', title:'Quit Linuxcast', subtitle:'Stop Linuxcast and its application services', aliases:['quit','exit'], keywords:['stop','close'], enabled:true},
    {id:'linuxcast:open-url',title:'Open URL',subtitle:'Open an HTTP or HTTPS address in your default browser',aliases:['url','open url'],keywords:['web','browser','address','link'],enabled:!!actions.openUrl,
      ...(!actions.openUrl?{unavailableReason:'Browser opening is unavailable. Reopen Linuxcast to try again.'}:{})},
    {id:'linuxcast:open-notes',title:'Notes',subtitle:'Create, search and edit local notes',aliases:['notes','note'],keywords:['write','draft','editor','tasks'],enabled:!!actions.openNotes,
      ...(!actions.openNotes?{unavailableReason:'Notes are unavailable. Reopen Linuxcast to try again.'}:{})},
    {id:'linuxcast:quick-note',title:'Quick note',subtitle:'Create a new local note',aliases:['quick note','new note'],keywords:['write','capture','draft'],enabled:!!actions.openQuickNote,
      ...(!actions.openQuickNote?{unavailableReason:'Quick note is unavailable. Reopen Linuxcast to reconnect Notes.'}:{})},
    {id:'linuxcast:open-file-search',title:'File search',subtitle:'Search filenames in folders you choose',aliases:['files','file search'],keywords:['folder','filename','index'],enabled:!!actions.openFileSearch,
      ...(!actions.openFileSearch?{unavailableReason:'File search is unavailable. Reopen Linuxcast to try again.'}:{})},
    {id:'linuxcast:calculator',title:'Calculator',subtitle:'Evaluate arithmetic, units, colours or dates locally',aliases:['calc','calculator'],keywords:['math','arithmetic','calculate','units','convert','dates','timezones'],enabled:true},
  ];
  if(actions.dictionary)builtins.push({id:'linuxcast:dictionary',title:'Dictionary',subtitle:'Browse installed language base entries and copy a selected word',aliases:['dictionary','spelling'],keywords:['word','language','hunspell','headword'],enabled:true});
  if(actions.emoji)builtins.push({id:'linuxcast:emoji',title:'Emoji',subtitle:'Search offline Unicode emoji and copy a selected result',aliases:['emoji','emoticon'],keywords:['unicode','symbol','smile','copy','character'],enabled:true});
  const active = () => !disposed && !actions.quitting() && !quitDispatched;
  if(actions.openWorkflowEditor)builtins.push({id:'linuxcast:open-workflow-editor',title:'Workflow draft',subtitle:'Build and save a local workflow draft',aliases:['workflow','workflows'],keywords:['graph','editor','automation','draft'],enabled:true});
  if(actions.quicklinks)builtins.push({id:'linuxcast:open-quicklinks',title:'Quicklinks',subtitle:'Create, find and open saved web links',aliases:['quicklinks','saved links'],keywords:['web','browser','bookmark','link'],enabled:!!actions.openUrl,...(!actions.openUrl?{unavailableReason:'Browser opening is unavailable. Reopen Linuxcast to try again.'}:{})});
  if(actions.rates)builtins.push({id:'linuxcast:currency-conversion',title:'Currency conversion',subtitle:'Convert with an explicitly configured reference-rate source',aliases:['currency','rates'],keywords:['exchange','money','reference'],enabled:true});
  const recordUse = async (id: string) => {
    // Usage failure must never replay an action or prevent recovery through Hide/Quit.
    try { await actions.recordUse?.(id); } catch { /* Explicitly best-effort local ranking only. */ }
  };
  const descriptors = (): Omit<LauncherCommandMetadata,'usage'>[] => ([
    ...builtins,
    ...quicklinkCommands.map(command=>({...command,...(quicklinkState==='unavailable'?{enabled:false,unavailableReason:'Saved Quicklinks are unavailable. Open Quicklinks or Reload commands to reconnect.'}:{})})),
    ...workflowCommands.map(command=>({...command.metadata,...(workflowState==='unavailable'?{enabled:false,unavailableReason:'Saved workflow commands are unavailable. Reload commands to reconnect.'}:{})})),
    ...[...applicationRecords].map(([id,application])=>({id,provider:'applications' as const,title:application.title,
      subtitle:application.description||'Installed application',aliases:[],keywords:[],enabled:applicationState==='available',
      ...(application.actions?{applicationActions:application.actions}:{}),
      ...(applicationState!=='available'?{unavailableReason:'Applications are unavailable. Reload commands to try again.'}:{}),
    })),
  ] as Omit<LauncherCommandMetadata,'usage'>[]).map(command=>({
    ...command,
    ...(command.id==='linuxcast:open-quicklinks'&&quicklinkState==='unavailable'?{subtitle:'Saved links unavailable. Open Quicklinks to reload saved links.'}:{}),
    ...(command.id==='linuxcast:open-workflow-editor'&&workflowState==='unavailable'?{subtitle:'Saved commands unavailable. Open the editor or Reload commands to reconnect.'}:{}),
    ...(visibilityAvailable===undefined?{}:{hidden:hiddenIds.has(command.id)}),
    ...(visibilityAvailable===false&&!isLauncherVisibilityProtected(command.id)?{
      enabled:false,unavailableReason:'Command visibility is unavailable. Reload commands to reconnect to storage.',
    }:{}),
  }));
  const installVisibility=(ids:string[],available:boolean)=>{
    if(visibilityAvailable!==available||JSON.stringify([...hiddenIds])!==JSON.stringify(ids))revision++;
    hiddenIds=new Set(ids);visibilityAvailable=available;
  };
  const refreshVisibility=async(generation:number)=>{
    if(!actions.listHidden)return;
    try{
      const ids=hiddenCommandIdsSchema.parse(await actions.listHidden());
      if(active()&&!metadataPending&&generation===metadataGeneration)installVisibility(ids,true);
    }catch{
      if(active()&&!metadataPending&&generation===metadataGeneration)installVisibility([...hiddenIds],false);
    }
  };
  const visibilityFailure=()=>({ok:false as const,error:{code:'capability-unavailable' as const,message:'Command visibility is unavailable. Reload commands to reconnect to storage.',retryable:false}});
  const checkVisibility=async(event:IpcMainInvokeEvent,commandId:string,expectedRevision:number):Promise<Extract<LauncherExecuteReply,{ok:false}>|undefined>=>{
    if(isLauncherVisibilityProtected(commandId)||!actions.listHidden)return;
    await refreshVisibility(metadataGeneration);
    if(!trustedShellSender(event,actions.contents()))return failure('permission-denied');
    if(!active())return failure('cancelled');
    if(visibilityAvailable!==true)return visibilityFailure();
    if(revision!==expectedRevision)return failure('invalid-request');
    if(hiddenIds.has(commandId))return failure('permission-denied');
  };
  const refreshApplications = async () => {
    if (!actions.listApplications) return;
    if (!refreshing) refreshing=(async()=>{
      try {
        const records=await actions.listApplications!();
        if(records.length>4096)throw new Error('Catalogue bound.');
        const next=records.map(record=>nativeApplicationSchema.parse(record));
        if(new Set(next.map(record=>record.desktopId)).size!==next.length)throw new Error('Duplicate identity.');
        next.sort((a,b)=>a.desktopId<b.desktopId?-1:a.desktopId>b.desktopId?1:0);
        if(!active())return;
        if(applicationState!=='available'||JSON.stringify(next)!==JSON.stringify(applications))revision++;
        applications=next;applicationState='available';applicationRecords.clear();
        for(const record of next)applicationRecords.set(`application:${createHash('sha256').update(record.desktopId).digest('hex')}`,record);
      }catch{
        if(applicationState!=='unavailable')revision++;
        applicationState='unavailable';
      }
    })().finally(()=>{refreshing=undefined;});
    await refreshing;
  };
  const refreshWorkflows=async()=>{
    if(!actions.loadWorkflowCommands||!actions.openWorkflowEntry)return;
    if(!workflowRefreshing)workflowRefreshing=(async()=>{
      try{const next=compileWorkflowCommands(await actions.loadWorkflowCommands!());if(!active())return;
        if(workflowState!=='available'||JSON.stringify(next)!==JSON.stringify(workflowCommands))revision++;
        workflowCommands=next;workflowState='available';
      }catch{if(active()){if(workflowState!=='unavailable')revision++;workflowState='unavailable';}}
    })().finally(()=>{workflowRefreshing=undefined;});
    await workflowRefreshing;
  };
  const refreshQuicklinks=async(generation:number)=>{
    if(!actions.quicklinks)return;
    // A new-generation Reload cannot inherit the discarded result of an older
    // read. Await that slot, then perform its own authoritative list.
    if(quicklinkRefreshing&&quicklinkRefreshGeneration!==generation){
      await quicklinkRefreshing;
      if(active()&&!metadataPending&&!quicklinksPending&&generation===metadataGeneration)await refreshQuicklinks(generation);
      return;
    }
    if(!quicklinkRefreshing){quicklinkRefreshGeneration=generation;quicklinkRefreshing=(async()=>{
      try{const next=compileQuicklinkCommands(await actions.quicklinks!.list(),!!actions.openUrl);
        if(!active()||metadataPending||quicklinksPending||generation!==metadataGeneration)return;
        if(quicklinkState!=='available'||JSON.stringify(next)!==JSON.stringify(quicklinkCommands))revision++;
        quicklinkCommands=next;quicklinkState='available';
      }catch{if(active()&&!metadataPending&&!quicklinksPending&&generation===metadataGeneration){if(quicklinkState!=='unavailable')revision++;quicklinkState='unavailable';}}
    })().finally(()=>{quicklinkRefreshing=undefined;});}
    await quicklinkRefreshing;
  };
  const snapshot = async (start=0,changed?: CommandUsage): Promise<LauncherCommandsReply> => {
    try {
      const expectedRevision=revision,all=descriptors(),selected=changed?all.filter(command=>command.id===changed.commandId):all.slice(start,start+100);
      if(changed&&selected.length!==1)return failure('invalid-request');
      let rankingAvailable = !!actions.getUsage;
      const commands = await Promise.all(selected.map(async command => {
        let usage: CommandUsage | null = null;
        try { usage = changed?.commandId === command.id ? changed : await actions.getUsage?.(command.id) ?? null; }
        catch { rankingAvailable = false; }
        return {...command, usage: usage ? {useCount:usage.useCount,lastUsedAt:usage.lastUsedAt,pinned:usage.pinned,alias:usage.alias} : null};
      }));
      if (!active()) return failure('cancelled');
      if(expectedRevision!==revision)return failure('invalid-request');
      let bytes=commands.reduce((total,command)=>total+Buffer.byteLength(JSON.stringify(command))+1,0);
      while(bytes>MAX_ENVELOPE_BYTES-4096&&commands.length>1)bytes-=Buffer.byteLength(JSON.stringify(commands.pop()))+1;
      return launcherCommandsReplySchema.parse({ok:true,value:{revision,commands,rankingAvailable,
        ...(visibilityAvailable===undefined?{}:{visibilityAvailable}),
        nextCursor:!changed&&start+commands.length<all.length?`${revision}:${start+commands.length}`:null,
        ...(applicationState?{applicationState}:{}),...(changed?{updateOnly:true}:{}),
      }});
    } catch { return failure('internal'); }
  };
  ipc.handle(LAUNCHER_CHANNELS.getCommands, async (event: IpcMainInvokeEvent, payload: unknown): Promise<LauncherCommandsReply> => {
    if (!trustedShellSender(event,actions.contents())) return failure('permission-denied');
    const parsed=launcherCommandsRequestSchema.safeParse(payload);
    if (!parsed.success) return failure('invalid-request');
    if (!active()) return failure('cancelled');
    const admittedMetadata=metadataGeneration;
    let start=0;
    if(parsed.data.cursor){
      const [version=0,offset=-1]=parsed.data.cursor.split(':').map(Number);
      if(version!==revision||!Number.isSafeInteger(offset)||offset<1||offset>=descriptors().length)return failure('invalid-request');
      start=offset;
    }else{
      await refreshApplications();
      await refreshWorkflows();
      await refreshQuicklinks(admittedMetadata);
      if(!metadataPending&&admittedMetadata===metadataGeneration)await refreshVisibility(admittedMetadata);
    }
    if(!trustedShellSender(event,actions.contents()))return failure('permission-denied');
    if(metadataPending || urlPending || applicationActionPending || quicklinksPending || admittedMetadata!==metadataGeneration)return failure('cancelled');
    const reply=await snapshot(start);
    if(!trustedShellSender(event,actions.contents()))return failure('permission-denied');
    return metadataPending || urlPending || applicationActionPending || quicklinksPending || admittedMetadata!==metadataGeneration?failure('cancelled'):reply;
  });
  ipc.handle(LAUNCHER_CHANNELS.applicationAction,async(event:IpcMainInvokeEvent,payload:unknown):Promise<LauncherApplicationActionReply>=>{
    if(!trustedShellSender(event,actions.contents()))return failure('permission-denied');
    const parsed=launcherApplicationActionRequestSchema.safeParse(payload);
    if(!parsed.success||parsed.data.revision!==revision)return failure('invalid-request');
    if(!active()||busy||calculatorPending)return failure('cancelled');
    const {commandId,actionId}=parsed.data,application=applicationRecords.get(commandId);
    if(!application||applicationState!=='available')return failure('permission-denied');
    if(!application.actions?.available||!actions.launchApplicationAction)return {ok:false,error:{code:'capability-unavailable',message:'Application actions are unavailable. Open the application to use its other actions.',retryable:false}};
    if(!application.actions.actions.some(action=>action.id===actionId))return failure('permission-denied');
    busy=true;applicationActionPending=true;metadataGeneration++;
    try{
      if(actions.listHidden){const denied=await checkVisibility(event,commandId,parsed.data.revision);if(denied)return denied;}
      if(!trustedShellSender(event,actions.contents()))return failure('permission-denied');
      if(!active())return failure('cancelled');
      if(parsed.data.revision!==revision||applicationRecords.get(commandId)?.fingerprint!==application.fingerprint)return failure('invalid-request');
      // Native reconstructs the current GIO entry and checks its fingerprint
      // (including action Exec) and declared action before requesting it.
      const receipt=await actions.launchApplicationAction({desktopId:application.desktopId,fingerprint:application.fingerprint,actionId});
      const reply=launcherApplicationActionReplySchema.parse({ok:true,value:receipt});
      if(!reply.ok||reply.value.actionId!==actionId)throw new Error('Mismatched application action receipt.');
      await recordUse(commandId);
      // The renderer validates context before separately invoking Hide. GIO's
      // void API cannot establish target completion, startup or focus.
      return reply;
    }catch(error){
      const known=error instanceof ApplicationsUnavailable&&error.effectOutcome==='not-dispatched';
      return {ok:false,error:{code:known?error.reason==='stale-application'?'conflict':'capability-unavailable':'deadline-exceeded',message:known?'This application action is unavailable or changed. Reload commands, or open the application to use its other actions.':'The application action outcome is unknown. Check the application, then reload commands before trying again.',retryable:false}};
    }finally{busy=false;applicationActionPending=false;}
  });
  ipc.handle(LAUNCHER_CHANNELS.copyCalculatorResult,async(event:IpcMainInvokeEvent,payload:unknown):Promise<CalculatorCopyReply>=>{
    if(!trustedShellSender(event,actions.contents()))return failure('permission-denied');
    const parsed=calculatorCopyRequestSchema.safeParse(payload);
    if(!parsed.success||parsed.data.revision!==revision)return failure('invalid-request');
    if(!active()||busy||calculatorPending)return failure('cancelled');
    const calculated=evaluateExpression(parsed.data.expression);
    if(!calculated.ok)return {ok:false,error:{code:'invalid-request',message:'Enter a supported arithmetic, unit, colour or date/time expression, then evaluate it again.',retryable:false}};
    let clipboardText:string;try{clipboardText=formatCalculationText(calculated);}catch{return failure('invalid-request');}
    if(!actions.copyCalculatorResult)return {ok:false,error:{code:'capability-unavailable',message:'Clipboard copying is unavailable in this session. The local result is still available.',retryable:false}};
    calculatorPending=true;
    // A timed-out write keeps its slot until the actual backend settles. Hide/Quit
    // remain usable, and no later copy can overtake an unresolved clipboard write.
    const work=Promise.resolve().then(async()=>{
      if(!active())throw new Error('Stopped.');
      if(actions.listHidden){const denied=await checkVisibility(event,'linuxcast:calculator',parsed.data.revision);if(denied)return denied;}
      return actions.copyCalculatorResult!(clipboardText);
    });
    void work.finally(()=>{calculatorPending=false;}).catch(()=>{});
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const outcome=await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Copy deadline.')),4000);})]);
      if(typeof outcome==='object')return outcome;
      if(outcome==='busy')return failure('cancelled');
      if(outcome==='unsupported')return {ok:false,error:{code:'capability-unavailable',message:'Clipboard copying is unavailable in this session. The local result is still available.',retryable:false}};
      if(outcome!=='written')throw new Error('Invalid copy receipt.');
      await recordUse('linuxcast:calculator');
      return {ok:true,value:{outcome:'copied',text:calculated.text,...(calculated.kind==='date-time'?{dateTime:calculated.dateTime}:calculated.kind==='colour'?{colour:calculated.colour}:calculated.unit===undefined?{}:{unit:calculated.unit})}};
    }catch{return {ok:false,error:{code:'deadline-exceeded',message:'The copy outcome is unknown. Check your clipboard before choosing Copy result again.',retryable:false}};}
    finally{clearTimeout(timer);}
  });
  ipc.handle(LAUNCHER_CHANNELS.openUrl, async (event:IpcMainInvokeEvent,payload:unknown):Promise<LauncherOpenUrlReply>=>{
    if(!trustedShellSender(event,actions.contents()))return failure('permission-denied');
    const parsed=launcherOpenUrlRequestSchema.safeParse(payload);
    if(!parsed.success || parsed.data.revision!==revision)return failure('invalid-request');
    if(!active() || busy)return failure('cancelled');
    if(!actions.openUrl)return {ok:false,error:{code:'capability-unavailable',message:'Browser opening is unavailable. Set a default web browser and try again.',retryable:false}};
    busy=true;urlPending=true;
    try {
      if(actions.listHidden){const denied=await checkVisibility(event,'linuxcast:open-url',parsed.data.revision);if(denied)return denied;}
      const outcome=await actions.openUrl(parsed.data.url);
      if(outcome!=='dispatched')throw new Error('Invalid browser handoff receipt.');
      await recordUse('linuxcast:open-url');
      // The renderer dismisses only after validating this receipt. Browser focus,
      // navigation and page completion cannot be inferred from native dispatch.
      return {ok:true,value:{outcome}};
    }catch(error){
      const known=error instanceof ApplicationsUnavailable && error.effectOutcome==='not-dispatched';
      return {ok:false,error:{code:known?'capability-unavailable':'deadline-exceeded',message:known?'No web browser is available. Set a default browser, then try Open URL again.':'The browser handoff could not be confirmed. Check your browser before trying again.',retryable:false}};
    }finally{busy=false;urlPending=false;}
  });
  ipc.handle(LAUNCHER_CHANNELS.setHidden,async(event:IpcMainInvokeEvent,payload:unknown):Promise<LauncherCommandsReply>=>{
    if(!trustedShellSender(event,actions.contents()))return failure('permission-denied');
    const parsed=launcherVisibilityRequestSchema.safeParse(payload);
    if(!parsed.success||parsed.data.revision!==revision)return failure('invalid-request');
    if(!active()||busy||calculatorPending)return failure('cancelled');
    const {commandId,hidden}=parsed.data;
    if(commandId.startsWith('quicklink:'))return failure('permission-denied');
    if(!descriptors().some(command=>command.id===commandId))return failure('permission-denied');
    if(!actions.setHidden||!actions.listHidden||visibilityAvailable!==true)return visibilityFailure();
    busy=true;metadataPending=true;metadataGeneration++;
    try{
      const saved=await actions.setHidden(commandId,hidden);
      if(saved.commandId!==commandId||saved.hidden!==hidden)throw new Error('Visibility receipt identity.');
      const ids=hiddenCommandIdsSchema.parse(await actions.listHidden());
      const expected=new Set(hiddenIds);if(hidden)expected.add(commandId);else expected.delete(commandId);
      if(!active()||parsed.data.revision!==revision||!descriptors().some(command=>command.id===commandId)||
        ids.includes(commandId)!==hidden||JSON.stringify(ids)!==JSON.stringify([...expected].sort()))throw new Error('Visibility state changed.');
      // Full metadata at exactly the next revision, including targets past page1.
      hiddenIds=new Set(ids);visibilityAvailable=true;revision++;
      const reply=await snapshot();if(!reply.ok)throw new Error('Visibility acknowledgement unavailable.');
      return reply;
    }catch{
      // The owner may have committed. Invalidate stale effects; only Reload can
      // reconnect this catalogue to authoritative state. Never replay the write.
      visibilityAvailable=false;revision++;
      return {ok:false,error:{code:'internal',message:'The visibility change could not be confirmed. Reload commands before trying again.',retryable:false}};
    }finally{busy=false;metadataPending=false;}
  });
  ipc.handle(LAUNCHER_CHANNELS.setAlias, async (event: IpcMainInvokeEvent, payload: unknown): Promise<LauncherCommandsReply> => {
    if (!trustedShellSender(event,actions.contents())) return failure('permission-denied');
    const parsed=launcherAliasRequestSchema.safeParse(payload);
    if(!parsed.success || parsed.data.revision!==revision)return failure('invalid-request');
    if(!active() || busy)return failure('cancelled');
    const {commandId,alias}=parsed.data,registered=descriptors();
    if(commandId.startsWith('quicklink:'))return failure('permission-denied');
    if(!registered.some(command=>command.id===commandId))return failure('permission-denied');
    if(!actions.setAlias || !actions.getUsage)return {ok:false,error:{code:'capability-unavailable',message:'Alias editing is unavailable. Reload commands to reconnect to storage.',retryable:false}};
    busy=true;metadataPending=true;metadataGeneration++;
    let attempted=false;
    const preflightExpires=Date.now()+2000;
    try {
      if(alias!==null){
        const normalized=normalizeCommandAlias(alias),others=registered.filter(command=>command.id!==commandId);
        let collision=others.some(command=>command.aliases.some(value=>normalizeCommandAlias(value)===normalized));
        // Bound owner concurrency below the client's pending-request limit. No query enters storage.
        for(let start=0;!collision && start<others.length;start+=32){
          if(Date.now()>=preflightExpires)throw new Error('Alias check deadline.');
          const chunk=others.slice(start,start+32);
          const usage=await Promise.all(chunk.map(command=>actions.getUsage!(command.id)));
          collision=usage.some((row,index)=>{
            if(row && row.commandId!==chunk[index]!.id)throw new Error('Usage identity.');
            return row?.alias!==null && row?.alias!==undefined && normalizeCommandAlias(row.alias)===normalized;
          });
        }
        if(collision)return {ok:false,error:{code:'conflict',message:'Another command already uses this alias. Choose a different alias.',retryable:false}};
      }
      if(Date.now()>=preflightExpires)throw new Error('Alias check deadline.');
      if(!active() || revision!==parsed.data.revision)return failure('invalid-request');
      attempted=true;
      const usage=await actions.setAlias(commandId,alias);
      if(!active() || revision!==parsed.data.revision || !descriptors().some(command=>command.id===commandId))throw new Error('Registry changed during alias edit.');
      if(usage.commandId!==commandId || usage.alias!==alias)throw new Error('Invalid saved alias.');
      const reply=await snapshot(0,usage);
      if(!reply.ok)throw new Error('Alias acknowledgement unavailable.');
      return reply;
    }catch{
      return {ok:false,error:{code:attempted?'internal':'capability-unavailable',message:attempted?'The alias change could not be confirmed. Reload commands before trying again.':'Alias editing is unavailable. Reload commands to reconnect to storage.',retryable:false}};
    }finally{busy=false;metadataPending=false;}
  });
  ipc.handle(LAUNCHER_CHANNELS.setPinned, async (event: IpcMainInvokeEvent, payload: unknown): Promise<LauncherCommandsReply> => {
    if (!trustedShellSender(event,actions.contents())) return failure('permission-denied');
    const parsed = launcherPinRequestSchema.safeParse(payload);
    if(parsed.success&&parsed.data.commandId.startsWith('quicklink:'))return failure('permission-denied');
    if (!parsed.success || parsed.data.revision !== revision) return failure('invalid-request');
    if (!active() || busy) return failure('cancelled');
    if (!actions.setPinned || !descriptors().some(command => command.id === parsed.data.commandId)) return failure('permission-denied');
    busy = true;metadataPending=true;metadataGeneration++;
    try {
      const usage = await actions.setPinned(parsed.data.commandId, parsed.data.pinned);
      if(revision!==parsed.data.revision || !active() || !descriptors().some(command=>command.id===parsed.data.commandId))throw new Error('Registry changed during pin.');
      if (usage.commandId !== parsed.data.commandId || usage.pinned !== parsed.data.pinned) throw new Error('Invalid saved pin.');
      // The mutation result is the acknowledgement. No success is inferred from a UI toggle.
      return await snapshot(0,usage);
    } catch {
      return {ok:false,error:{code:'internal',message:'The pin change could not be confirmed. Reload commands before trying again.',retryable:false}};
    } finally { busy = false;metadataPending=false; }
  });
  ipc.handle(LAUNCHER_CHANNELS.execute, async (event: IpcMainInvokeEvent, payload: unknown): Promise<LauncherExecuteReply> => {
    if (!trustedShellSender(event,actions.contents())) return failure('permission-denied');
    const parsed = launcherExecuteRequestSchema.safeParse(payload);
    if (!parsed.success || parsed.data.revision !== revision) return failure('invalid-request');
    if (!active() || busy) return failure('cancelled');
    const command = descriptors().find(item => item.id === parsed.data.commandId);
    if (!command?.enabled) return failure('permission-denied');
    if(command.id==='linuxcast:dictionary'||command.id==='linuxcast:emoji'||command.id.startsWith('quicklink:')||command.id==='linuxcast:open-url'||command.id==='linuxcast:calculator'||command.id==='linuxcast:currency-conversion'||command.id==='linuxcast:open-quicklinks')return failure('invalid-request');
    busy = true;
    try {
      if(actions.listHidden&&!isLauncherVisibilityProtected(command.id)){
        const denied=await checkVisibility(event,command.id,parsed.data.revision);if(denied)return denied;
      }
      if (command.id === 'linuxcast:quit') {
        quitDispatched = true;
        // A dispatch receipt, not a claim that service teardown completed.
        setImmediate(() => { void(async()=>{try{await recordUse(command.id);if(await actions.quit()===false)quitDispatched=false;}catch{quitDispatched=false;}})(); });
        return {ok:true,value:{outcome:'dispatched'}};
      }
      if (command.provider === 'applications') {
        const application=applicationRecords.get(command.id);
        if(!application||!actions.launchApplication)return failure('permission-denied');
        const outcome=await actions.launchApplication({desktopId:application.desktopId,fingerprint:application.fingerprint});
        actions.hide();
        await recordUse(command.id);
        return {ok:true,value:{outcome}};
      }
      if(command.id.startsWith('workflow:')){
        const selected=workflowCommands.find(candidate=>candidate.metadata.id===command.id);
        if(!selected||workflowState!=='available'||!actions.loadWorkflowCommands||!actions.openWorkflowEntry)return failure('permission-denied');
        const current=compileWorkflowCommands(await actions.loadWorkflowCommands());
        const trusted=()=>active()&&revision===parsed.data.revision&&trustedShellSender(event,actions.contents());
        if(!trusted())return failure('permission-denied');
        const matched=matchWorkflowCommand(current,selected.selection);
        await actions.openWorkflowEntry(matched.selection,trusted);
      }
      else if(command.id==='linuxcast:open-workflow-editor')await actions.openWorkflowEditor!();
      else if(command.id==='linuxcast:open-notes')await actions.openNotes!();
      else if(command.id==='linuxcast:quick-note')await actions.openQuickNote!();
      else if(command.id==='linuxcast:open-file-search')await actions.openFileSearch!();
      else if (command.id === 'linuxcast:open-local-data') await actions.openDataSettings!();
      else actions.hide();
      await recordUse(command.id);
      return {ok:true,value:{outcome:'completed'}};
    } catch (error) {
      if(error instanceof WorkflowCommandUnavailable)return {ok:false,error:{code:'conflict',message:error.message,retryable:false}};
      if(command.provider==='applications') {
        const code=error instanceof ApplicationsUnavailable && error.effectOutcome==='not-dispatched'
          ? error.reason==='stale-application'?'conflict':'capability-unavailable' : 'deadline-exceeded';
        return {ok:false,error:{code,message:code==='deadline-exceeded'?'The application launch could not be confirmed. Check your desktop before trying again.':'This application is unavailable or changed. Reload commands to try again.',retryable:false}};
      }
      return failure('internal');
    }
    finally { busy = false; }
  });
  const removeDictionary=actions.dictionary?registerDictionaryIpc(ipc,actions.dictionary,{
    trusted:event=>trustedShellSender(event,actions.contents()),active:()=>active()&&(actions.dictionaryVisible?.()??true),busy:()=>busy||metadataPending||calculatorPending||urlPending||applicationActionPending||quicklinksPending,revision:()=>revision,generation:()=>metadataGeneration,
    authorize:async(event,expected)=>{const denied=await checkVisibility(event,'linuxcast:dictionary',expected);if(denied)return denied;if(!trustedShellSender(event,actions.contents()))return failure('permission-denied');if(!active()||metadataPending||!(actions.dictionaryVisible?.()??true))return failure('cancelled');if(expected!==revision)return failure('invalid-request');const parent=descriptors().find(command=>command.id==='linuxcast:dictionary');return !parent?.enabled||parent.hidden?failure('permission-denied'):undefined;},
    acquire:()=>{busy=true;metadataGeneration++;return()=>{busy=false;};},recordUse:()=>recordUse('linuxcast:dictionary'),...(actions.copyCalculatorResult?{copy:actions.copyCalculatorResult}:{}),
  }):undefined;
  const removeEmoji=actions.emoji?registerEmojiIpc(ipc,actions.emoji,{
    trusted:event=>trustedShellSender(event,actions.contents()),active:()=>active()&&(actions.emojiVisible?.()??true),busy:()=>busy||metadataPending||calculatorPending||urlPending||applicationActionPending||quicklinksPending,revision:()=>revision,generation:()=>metadataGeneration,
    authorize:async(event,expected)=>{const denied=await checkVisibility(event,'linuxcast:emoji',expected);if(denied)return denied;if(!trustedShellSender(event,actions.contents()))return failure('permission-denied');if(!active()||metadataPending||!(actions.emojiVisible?.()??true))return failure('cancelled');if(expected!==revision)return failure('invalid-request');const parent=descriptors().find(command=>command.id==='linuxcast:emoji');return !parent?.enabled||parent.hidden?failure('permission-denied'):undefined;},
    acquire:()=>{busy=true;metadataGeneration++;return()=>{busy=false;};},recordUse:()=>recordUse('linuxcast:emoji'),...(actions.copyCalculatorResult?{copy:actions.copyCalculatorResult}:{}),
  }):undefined;
  const removeNotes=actions.searchNotes&&actions.getNote&&actions.openNote?registerLauncherNotesIpc(ipc,{search:actions.searchNotes,get:actions.getNote,open:actions.openNote},{
    trusted:event=>trustedShellSender(event,actions.contents()),active,busy:()=>busy||metadataPending||calculatorPending||urlPending||applicationActionPending||quicklinksPending,revision:()=>revision,generation:()=>metadataGeneration,
    authorize:async(event,expected)=>{const denied=await checkVisibility(event,'linuxcast:open-notes',expected);if(denied)return denied;if(!trustedShellSender(event,actions.contents()))return failure('permission-denied');if(!active()||metadataPending)return failure('cancelled');if(expected!==revision)return failure('invalid-request');const parent=descriptors().find(command=>command.id==='linuxcast:open-notes');return !parent?.enabled||parent.hidden?failure('permission-denied'):undefined;},
    acquire:()=>{busy=true;metadataGeneration++;return()=>{busy=false;};},recordUse:()=>recordUse('linuxcast:open-notes'),
  }):undefined;
  const removeRates=actions.rates?registerRateIpc(ipc,actions.rates,{trusted:event=>trustedShellSender(event,actions.contents()),active:()=>active()&&!busy&&(actions.rateVisible?.()??true),revision:()=>revision,checkVisibility:(event,expected)=>checkVisibility(event,'linuxcast:currency-conversion',expected),...(actions.copyCalculatorResult?{copy:actions.copyCalculatorResult}:{}),recordUse:()=>recordUse('linuxcast:currency-conversion')}):undefined;
  const removeQuicklinks=actions.quicklinks?registerQuicklinksIpc(ipc,actions.quicklinks,{
    trusted:event=>trustedShellSender(event,actions.contents()),active,busy:()=>busy||calculatorPending,
    generation:()=>metadataGeneration,revision:()=>revision,
    acquire:()=>{busy=true;quicklinksPending=true;metadataGeneration++;return()=>{busy=false;quicklinksPending=false;};},
    checkVisibility:(event,expected)=>checkVisibility(event,'linuxcast:open-quicklinks',expected),
    openUrl:async url=>{if(!actions.openUrl)throw new ApplicationsUnavailable('unavailable','not-dispatched');return actions.openUrl(url);},
    recordUse:()=>recordUse('linuxcast:open-quicklinks'),
  }):undefined;
  return () => { disposed = true;removeDictionary?.();removeEmoji?.();removeNotes?.();removeQuicklinks?.();removeRates?.(); for (const channel of Object.values(LAUNCHER_CHANNELS)) ipc.removeHandler(channel); };
}
