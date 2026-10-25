import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import {
  LAUNCHER_CHANNELS, launcherCommandsRequestSchema, launcherExecuteRequestSchema,
  launcherCommandsReplySchema, launcherPinRequestSchema,
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
  setPinned?: (commandId: string, pinned: boolean) => Promise<CommandUsage>;
}

const failure = (code: 'invalid-request' | 'permission-denied' | 'cancelled' | 'internal'): Extract<LauncherExecuteReply,{ok:false}> => ({
  ok: false, error: {code, message: {
    'invalid-request': 'Command list changed. Search again to refresh it.',
    'permission-denied': 'Launcher request denied.',
    cancelled: 'Launcher action is already running or Linuxcast is quitting.',
    internal: 'Launcher action unavailable. Try again from the launcher.',
  }[code], retryable: false},
});

/** Three trusted built-ins only. Query text and renderer-provided handlers never enter main. */
export function registerLauncherIpc(ipc: Pick<IpcMain,'handle'|'removeHandler'>, actions: LauncherActions): () => void {
  let disposed = false, busy = false, quitDispatched = false;
  const revision = actions.openDataSettings ? 1 : 2;
  const descriptors: Omit<LauncherCommandMetadata,'usage'>[] = [
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
  const snapshot = async (changed?: CommandUsage): Promise<LauncherCommandsReply> => {
    try {
      let rankingAvailable = !!actions.getUsage;
      const commands = await Promise.all(descriptors.map(async command => {
        let usage: CommandUsage | null = null;
        try { usage = changed?.commandId === command.id ? changed : await actions.getUsage?.(command.id) ?? null; }
        catch { rankingAvailable = false; }
        return {...command, usage: usage ? {useCount:usage.useCount,lastUsedAt:usage.lastUsedAt,pinned:usage.pinned,alias:usage.alias} : null};
      }));
      if (!active()) return failure('cancelled');
      const value = launcherCommandsReplySchema.parse({ok:true,value:{revision,commands,rankingAvailable}});
      return value;
    } catch { return failure('internal'); }
  };
  ipc.handle(LAUNCHER_CHANNELS.getCommands, async (event: IpcMainInvokeEvent, payload: unknown): Promise<LauncherCommandsReply> => {
    if (!trustedShellSender(event,actions.contents())) return failure('permission-denied');
    if (!launcherCommandsRequestSchema.safeParse(payload).success) return failure('invalid-request');
    if (!active()) return failure('cancelled');
    return snapshot();
  });
  ipc.handle(LAUNCHER_CHANNELS.setPinned, async (event: IpcMainInvokeEvent, payload: unknown): Promise<LauncherCommandsReply> => {
    if (!trustedShellSender(event,actions.contents())) return failure('permission-denied');
    const parsed = launcherPinRequestSchema.safeParse(payload);
    if (!parsed.success || parsed.data.revision !== revision) return failure('invalid-request');
    if (!active() || busy) return failure('cancelled');
    if (!actions.setPinned || !descriptors.some(command => command.id === parsed.data.commandId)) return failure('permission-denied');
    busy = true;
    try {
      const usage = await actions.setPinned(parsed.data.commandId, parsed.data.pinned);
      if (usage.commandId !== parsed.data.commandId || usage.pinned !== parsed.data.pinned) throw new Error('Invalid saved pin.');
      // The mutation result is the acknowledgement. No success is inferred from a UI toggle.
      return await snapshot(usage);
    } catch {
      return {ok:false,error:{code:'internal',message:'The pin change could not be confirmed. Reload commands before trying again.',retryable:false}};
    } finally { busy = false; }
  });
  ipc.handle(LAUNCHER_CHANNELS.execute, async (event: IpcMainInvokeEvent, payload: unknown): Promise<LauncherExecuteReply> => {
    if (!trustedShellSender(event,actions.contents())) return failure('permission-denied');
    const parsed = launcherExecuteRequestSchema.safeParse(payload);
    if (!parsed.success || parsed.data.revision !== revision) return failure('invalid-request');
    if (!active() || busy) return failure('cancelled');
    const command = descriptors.find(item => item.id === parsed.data.commandId);
    if (!command?.enabled) return failure('permission-denied');
    busy = true;
    try {
      if (command.id === 'linuxcast:quit') {
        quitDispatched = true;
        // A dispatch receipt, not a claim that service teardown completed.
        setImmediate(() => { void recordUse(command.id).finally(() => actions.quit()); });
        return {ok:true,value:{outcome:'dispatched'}};
      }
      if (command.id === 'linuxcast:open-local-data') await actions.openDataSettings!();
      else actions.hide();
      await recordUse(command.id);
      return {ok:true,value:{outcome:'completed'}};
    } catch { return failure('internal'); }
    finally { busy = false; }
  });
  return () => { disposed = true; for (const channel of Object.values(LAUNCHER_CHANNELS)) ipc.removeHandler(channel); };
}
