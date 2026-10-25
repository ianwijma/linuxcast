import * as z from 'zod';
import { capabilityStatusSchema, rpcFailureSchema } from './protocol.ts';

export const SHELL_APP_ID = 'io.github.ianwijma.Linuxcast';
export const SHELL_CHANNELS = {
  getState: 'shell:get-state', hide: 'shell:hide', contentHeight: 'shell:content-height',
  quit: 'shell:quit', state: 'shell:state', openDataSettings: 'shell:open-data-settings',
} as const;

export const shellRequestSchema = z.strictObject({ protocolVersion: z.literal(1) });
export const shellContentHeightRequestSchema = shellRequestSchema.extend({ height: z.number().int().min(32).max(4096) });
export const desktopShellStateSchema = z.strictObject({
  protocolVersion: z.literal(1), identity: z.literal(SHELL_APP_ID),
  visible: z.boolean(), focused: z.boolean(), appearance: z.enum(['dark', 'light']),
  activation: capabilityStatusSchema.extend({
    id: z.literal('launcher.activate'), backend: z.string().max(64).nullable(),
    reasonCode: z.string().max(128).optional(), remediationAction: z.string().max(128).optional(),
  }),
});
const failed = z.strictObject({ ok: z.literal(false), error: rpcFailureSchema });
export const shellStateReplySchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), value: desktopShellStateSchema }), failed,
]);
export const shellCommandReplySchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), value: z.null() }), failed,
]);
export type DesktopShellState = z.infer<typeof desktopShellStateSchema>;
export type ShellStateReply = z.infer<typeof shellStateReplySchema>;
export type ShellCommandReply = z.infer<typeof shellCommandReplySchema>;

/** Only fixed shell operations are exposed to the sandboxed renderer.
 * Validation does not authenticate an IPC sender or establish native effects.
 */
export interface DesktopShellApi {
  readonly runtime: { readonly sandboxed: true; readonly contextIsolated: true };
  getState(): Promise<ShellStateReply>;
  hideLauncher(): Promise<ShellCommandReply>;
  openDataSettings(): Promise<ShellCommandReply>;
  reportContentHeight(height: number): Promise<ShellCommandReply>;
  quit(): Promise<ShellCommandReply>;
  onState(listener: (state: DesktopShellState) => void): () => void;
}
