import {
  SHELL_CHANNELS, desktopShellStateSchema, shellCommandReplySchema, shellStateReplySchema,
} from '../../../../packages/contracts/src/desktop-shell.ts';
import type { DesktopShellApi } from '../../../../packages/contracts/src/desktop-shell.ts';
import {createRateApi} from './rates.ts';
import { createQuicklinkApi } from './quicklinks.ts';
import { calculatorCopyRequestSchema,calculatorCopyReplySchema,MAX_ENVELOPE_BYTES } from '@linuxcast/contracts';
import { LAUNCHER_CHANNELS, launcherCommandsReplySchema, launcherExecuteReplySchema, launcherExecuteRequestSchema, launcherPinRequestSchema, launcherAliasRequestSchema, launcherVisibilityRequestSchema, launcherCommandsRequestSchema, launcherOpenUrlRequestSchema, launcherOpenUrlReplySchema,launcherApplicationActionRequestSchema,launcherApplicationActionReplySchema } from '../../../../packages/contracts/src/launcher.ts';

/** Private adapter, never exposed across contextBridge. No Electron event crosses it. */
export interface ShellTransport {
  invoke(channel: string, payload: unknown): Promise<unknown>;
  on(channel: string, listener: (event: unknown, value: unknown) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, value: unknown) => void): unknown;
}

export function createShellApi(transport: ShellTransport): DesktopShellApi {
  const unavailable = { ok: false as const, error: {
    code: 'internal' as const, message: 'Shell operation unavailable.', retryable: false,
  } };
  const command = async (channel: string, payload: unknown) => {
    try {
      const result = shellCommandReplySchema.safeParse(await transport.invoke(channel, payload));
      return result.success ? result.data : unavailable;
    } catch { return unavailable; }
  };
  return Object.freeze({
    ...createQuicklinkApi(transport),
    ...createRateApi(transport),
    executeApplicationAction:async(request:Parameters<NonNullable<DesktopShellApi['executeApplicationAction']>>[0])=>{
      try{
        const parsed=launcherApplicationActionRequestSchema.safeParse({...request,protocolVersion:1});if(!parsed.success)return unavailable;
        const value=await transport.invoke(LAUNCHER_CHANNELS.applicationAction,parsed.data);
        if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_ENVELOPE_BYTES)return unavailable;
        const result=launcherApplicationActionReplySchema.safeParse(value);
        return result.success&&(!result.data.ok||result.data.value.actionId===parsed.data.actionId)?result.data:unavailable;
      }catch{return unavailable;}
    },
    setLauncherHidden:async(request:Parameters<NonNullable<DesktopShellApi['setLauncherHidden']>>[0])=>{
      try{
        const parsed=launcherVisibilityRequestSchema.safeParse({...request,protocolVersion:1});if(!parsed.success)return unavailable;
        const value=await transport.invoke(LAUNCHER_CHANNELS.setHidden,parsed.data);
        if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_ENVELOPE_BYTES)return unavailable;
        const result=launcherCommandsReplySchema.safeParse(value);return result.success?result.data:unavailable;
      }catch{return unavailable;}
    },
    copyCalculatorResult:async(request:{revision:number;expression:string})=>{
      try {
        const parsed=calculatorCopyRequestSchema.safeParse({...request,protocolVersion:1});if(!parsed.success)return unavailable;
        const value=await transport.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,parsed.data);
        if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_ENVELOPE_BYTES)return unavailable;
        const result=calculatorCopyReplySchema.safeParse(value);return result.success?result.data:unavailable;
      }catch{return unavailable;}
    },
    openLauncherUrl: async (request:Parameters<DesktopShellApi['openLauncherUrl']>[0])=>{
      try {
        const parsed=launcherOpenUrlRequestSchema.safeParse({...request,protocolVersion:1});
        if(!parsed.success)return {ok:false as const,error:{code:'invalid-request' as const,message:'Enter a valid HTTP or HTTPS address without credentials.',retryable:false}};
        const result=launcherOpenUrlReplySchema.safeParse(await transport.invoke(LAUNCHER_CHANNELS.openUrl,parsed.data));
        return result.success?result.data:unavailable;
      }catch{return unavailable;}
    },
    setLauncherAlias: async (request: Parameters<DesktopShellApi['setLauncherAlias']>[0]) => {
      try {
        const parsed=launcherAliasRequestSchema.safeParse({...request,protocolVersion:1});
        if(!parsed.success)return unavailable;
        const result=launcherCommandsReplySchema.safeParse(await transport.invoke(LAUNCHER_CHANNELS.setAlias,parsed.data));
        return result.success?result.data:unavailable;
      }catch{return unavailable;}
    },
    setLauncherPinned: async (request: Parameters<DesktopShellApi['setLauncherPinned']>[0]) => {
      try {
        const parsed = launcherPinRequestSchema.safeParse({ ...request, protocolVersion: 1 });
        if (!parsed.success) return unavailable;
        const result = launcherCommandsReplySchema.safeParse(await transport.invoke(LAUNCHER_CHANNELS.setPinned, parsed.data));
        return result.success ? result.data : unavailable;
      } catch { return unavailable; }
    },
    getLauncherCommands: async (request: Parameters<DesktopShellApi['getLauncherCommands']>[0]) => {
      try {
        const parsed = launcherCommandsRequestSchema.safeParse({...request,protocolVersion:1});
        if (!parsed.success) return unavailable;
        const result = launcherCommandsReplySchema.safeParse(await transport.invoke(LAUNCHER_CHANNELS.getCommands, parsed.data));
        return result.success ? result.data : unavailable;
      } catch { return unavailable; }
    },
    executeLauncherCommand: async (request: Parameters<DesktopShellApi['executeLauncherCommand']>[0]) => {
      try {
        const parsed = launcherExecuteRequestSchema.safeParse({ ...request, protocolVersion: 1 });
        if (!parsed.success) return unavailable;
        const result = launcherExecuteReplySchema.safeParse(await transport.invoke(LAUNCHER_CHANNELS.execute, parsed.data));
        return result.success ? result.data : unavailable;
      } catch { return unavailable; }
    },
    getState: async () => {
      try {
        const result = shellStateReplySchema.safeParse(await transport.invoke(SHELL_CHANNELS.getState, { protocolVersion: 1 }));
        return result.success ? result.data : unavailable;
      } catch { return unavailable; }
    },
    openDataSettings: () => command(SHELL_CHANNELS.openDataSettings, { protocolVersion: 1 }),
    hideLauncher: () => command(SHELL_CHANNELS.hide, { protocolVersion: 1 }),
    reportContentHeight: (height: number) => command(SHELL_CHANNELS.contentHeight, { protocolVersion: 1, height }),
    quit: () => command(SHELL_CHANNELS.quit, { protocolVersion: 1 }),
    onState: (listener: Parameters<DesktopShellApi['onState']>[0]) => {
      if (typeof listener !== 'function') throw new TypeError('A state listener is required.');
      let active = true;
      const wrapped = (_event: unknown, value: unknown) => {
        const state = desktopShellStateSchema.safeParse(value);
        if (active && state.success) listener(state.data);
      };
      transport.on(SHELL_CHANNELS.state, wrapped);
      return () => {
        if (!active) return;
        active = false;
        transport.removeListener(SHELL_CHANNELS.state, wrapped);
      };
    },
    runtime: Object.freeze({ sandboxed: true, contextIsolated: true }),
  });
}
