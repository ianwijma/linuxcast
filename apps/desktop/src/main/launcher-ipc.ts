import { MAX_ENVELOPE_BYTES } from '../../../../packages/contracts/src/index.ts';
import { ApplicationsUnavailable } from '@linuxcast/applications';
import { createHash } from 'node:crypto';
import { nativeApplicationSchema } from '../../../../packages/contracts/src/applications.ts';
import type { NativeApplication } from '../../../../packages/contracts/src/applications.ts';
import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import {
  LAUNCHER_CHANNELS, launcherCommandsRequestSchema, launcherExecuteRequestSchema,
  launcherCommandsReplySchema, launcherPinRequestSchema, launcherAliasRequestSchema, normalizeCommandAlias,
} from '../../../../packages/contracts/src/launcher.ts';
import type { LauncherCommandMetadata, LauncherCommandsReply, LauncherExecuteReply } from '../../../../packages/contracts/src/launcher.ts';
import type { CommandUsage } from '@linuxcast/storage';
import { trustedShellSender } from './ipc.ts';

export interface LauncherActions {
  contents(): WebContents | undefined;
  quitting(): boolean;
  hide(): void;
  quit(): void;
  openDataSettings?: () => Promise<void>;
  getUsage?: (commandId: string) => Promise<CommandUsage | null>;
  recordUse?: (commandId: string) => Promise<unknown>;
  listApplications?: () => Promise<NativeApplication[]>;
  launchApplication?: (application: Pick<NativeApplication,'desktopId'|'fingerprint'>) => Promise<'dispatched'>;
  setPinned?: (commandId: string, pinned: boolean) => Promise<CommandUsage>;
  setAlias?: (commandId: string, alias: string | null) => Promise<CommandUsage>;
}

const failure = (code: 'invalid-request' | 'permission-denied' | 'cancelled' | 'internal'): Extract<LauncherExecuteReply,{ok:false}> => ({
  ok: false, error: {code, message: {
    'invalid-request': 'Command list changed. Search again to refresh it.',
    'permission-denied': 'Launcher request denied.',
    cancelled: 'Launcher action is already running or Linuxcast is quitting.',
    internal: 'Launcher action unavailable. Try again from the launcher.',
  }[code], retryable: false},
});

/** Registered built-ins and GIO applications only. No query, path or Exec authority enters main. */
export function registerLauncherIpc(ipc: Pick<IpcMain,'handle'|'removeHandler'>, actions: LauncherActions): () => void {
  let disposed = false, busy = false, quitDispatched = false;
  let revision = actions.openDataSettings ? 1 : 2;
  let applicationState: 'available'|'unavailable'|undefined;
  let applications: NativeApplication[] = [];
  let refreshing: Promise<void>|undefined;
  const applicationRecords = new Map<string,NativeApplication>();
  const builtins: Omit<LauncherCommandMetadata,'usage'>[] = [
    {id:'linuxcast:open-local-data', title:'Local data', subtitle:'Clear usage or export local application data', aliases:['data','settings'], keywords:['privacy','clear','export','history'], enabled:!!actions.openDataSettings,
      ...(!actions.openDataSettings ? {unavailableReason:'Local data settings are unavailable. Reopen Linuxcast to try again.'} : {})},
    {id:'linuxcast:hide', title:'Hide Linuxcast', subtitle:'Keep Linuxcast running and close the launcher', aliases:['hide'], keywords:['close','dismiss'], enabled:true},
    {id:'linuxcast:quit', title:'Quit Linuxcast', subtitle:'Stop Linuxcast and its application services', aliases:['quit','exit'], keywords:['stop','close'], enabled:true},
  ];
  const active = () => !disposed && !actions.quitting() && !quitDispatched;
  const recordUse = async (id: string) => {
    // Usage failure must never replay an action or prevent recovery through Hide/Quit.
    try { await actions.recordUse?.(id); } catch { /* Explicitly best-effort local ranking only. */ }
  };
  const descriptors = (): Omit<LauncherCommandMetadata,'usage'>[] => [
    ...builtins,
    ...[...applicationRecords].map(([id,application])=>({id,provider:'applications' as const,title:application.title,
      subtitle:application.description||'Installed application',aliases:[],keywords:[],enabled:applicationState==='available',
      ...(applicationState!=='available'?{unavailableReason:'Applications are unavailable. Reload commands to try again.'}:{}),
    })),
  ];
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
    let start=0;
    if(parsed.data.cursor){
      const [version=0,offset=-1]=parsed.data.cursor.split(':').map(Number);
      if(version!==revision||!Number.isSafeInteger(offset)||offset<1||offset>=descriptors().length)return failure('invalid-request');
      start=offset;
    }else await refreshApplications();
    return snapshot(start);
  });
  ipc.handle(LAUNCHER_CHANNELS.setAlias, async (event: IpcMainInvokeEvent, payload: unknown): Promise<LauncherCommandsReply> => {
    if (!trustedShellSender(event,actions.contents())) return failure('permission-denied');
    const parsed=launcherAliasRequestSchema.safeParse(payload);
    if(!parsed.success || parsed.data.revision!==revision)return failure('invalid-request');
    if(!active() || busy)return failure('cancelled');
    const {commandId,alias}=parsed.data,registered=descriptors();
    if(!registered.some(command=>command.id===commandId))return failure('permission-denied');
    if(!actions.setAlias || !actions.getUsage)return {ok:false,error:{code:'capability-unavailable',message:'Alias editing is unavailable. Reload commands to reconnect to storage.',retryable:false}};
    busy=true;
    let attempted=false;
    try {
      if(alias!==null){
        const normalized=normalizeCommandAlias(alias),others=registered.filter(command=>command.id!==commandId);
        let collision=others.some(command=>command.aliases.some(value=>normalizeCommandAlias(value)===normalized));
        // Bound owner concurrency below the client's pending-request limit. No query enters storage.
        for(let start=0;!collision && start<others.length;start+=32){
          const chunk=others.slice(start,start+32);
          const usage=await Promise.all(chunk.map(command=>actions.getUsage!(command.id)));
          collision=usage.some((row,index)=>{
            if(row && row.commandId!==chunk[index]!.id)throw new Error('Usage identity.');
            return row?.alias!==null && row?.alias!==undefined && normalizeCommandAlias(row.alias)===normalized;
          });
        }
        if(collision)return {ok:false,error:{code:'conflict',message:'Another command already uses this alias. Choose a different alias.',retryable:false}};
      }
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
    }finally{busy=false;}
  });
  ipc.handle(LAUNCHER_CHANNELS.setPinned, async (event: IpcMainInvokeEvent, payload: unknown): Promise<LauncherCommandsReply> => {
    if (!trustedShellSender(event,actions.contents())) return failure('permission-denied');
    const parsed = launcherPinRequestSchema.safeParse(payload);
    if (!parsed.success || parsed.data.revision !== revision) return failure('invalid-request');
    if (!active() || busy) return failure('cancelled');
    if (!actions.setPinned || !descriptors().some(command => command.id === parsed.data.commandId)) return failure('permission-denied');
    busy = true;
    try {
      const usage = await actions.setPinned(parsed.data.commandId, parsed.data.pinned);
      if(revision!==parsed.data.revision || !active() || !descriptors().some(command=>command.id===parsed.data.commandId))throw new Error('Registry changed during pin.');
      if (usage.commandId !== parsed.data.commandId || usage.pinned !== parsed.data.pinned) throw new Error('Invalid saved pin.');
      // The mutation result is the acknowledgement. No success is inferred from a UI toggle.
      return await snapshot(0,usage);
    } catch {
      return {ok:false,error:{code:'internal',message:'The pin change could not be confirmed. Reload commands before trying again.',retryable:false}};
    } finally { busy = false; }
  });
  ipc.handle(LAUNCHER_CHANNELS.execute, async (event: IpcMainInvokeEvent, payload: unknown): Promise<LauncherExecuteReply> => {
    if (!trustedShellSender(event,actions.contents())) return failure('permission-denied');
    const parsed = launcherExecuteRequestSchema.safeParse(payload);
    if (!parsed.success || parsed.data.revision !== revision) return failure('invalid-request');
    if (!active() || busy) return failure('cancelled');
    const command = descriptors().find(item => item.id === parsed.data.commandId);
    if (!command?.enabled) return failure('permission-denied');
    busy = true;
    try {
      if (command.id === 'linuxcast:quit') {
        quitDispatched = true;
        // A dispatch receipt, not a claim that service teardown completed.
        setImmediate(() => { void recordUse(command.id).finally(() => actions.quit()); });
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
      if (command.id === 'linuxcast:open-local-data') await actions.openDataSettings!();
      else actions.hide();
      await recordUse(command.id);
      return {ok:true,value:{outcome:'completed'}};
    } catch (error) {
      if(command.provider==='applications') {
        const code=error instanceof ApplicationsUnavailable && error.effectOutcome==='not-dispatched'
          ? error.reason==='stale-application'?'conflict':'capability-unavailable' : 'deadline-exceeded';
        return {ok:false,error:{code,message:code==='deadline-exceeded'?'The application launch could not be confirmed. Check your desktop before trying again.':'This application is unavailable or changed. Reload commands to try again.',retryable:false}};
      }
      return failure('internal');
    }
    finally { busy = false; }
  });
  return () => { disposed = true; for (const channel of Object.values(LAUNCHER_CHANNELS)) ipc.removeHandler(channel); };
}
