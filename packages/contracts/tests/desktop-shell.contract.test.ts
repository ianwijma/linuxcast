import { describe, expect, it } from 'vitest';
import { desktopShellStateSchema, SHELL_APP_ID, shellCommandReplySchema, shellContentHeightRequestSchema, shellRequestSchema, shellStateReplySchema } from '../src/desktop-shell.ts';

const state = {
  protocolVersion: 1, identity: SHELL_APP_ID, visible: true, focused: false, appearance: 'dark',
  activation: { id: 'launcher.activate', state: 'component-required', backend: 'wayland', generation: 0 },
};
describe('sandboxed shell boundary', () => {
  it('retains an explicit unavailable focus capability without asserting focus', () => {
    expect(desktopShellStateSchema.parse(state)).toEqual(state);
    expect(shellStateReplySchema.parse({ ok: true, value: state })).toEqual({ ok: true, value: state });
  });
  it.each([0, 2, '1', null])('rejects unsupported protocol %s', protocolVersion => {
    expect(shellRequestSchema.safeParse({ protocolVersion }).success).toBe(false);
  });
  it.each([31, 4097, 32.5, NaN, Infinity, '100'])('rejects invalid content height %s', height => {
    expect(shellContentHeightRequestSchema.safeParse({ protocolVersion: 1, height }).success).toBe(false);
  });
  it('accepts exact height bounds and rejects authority or routing fields', () => {
    for (const height of [32, 4096]) expect(shellContentHeightRequestSchema.safeParse({ protocolVersion: 1, height }).success).toBe(true);
    for (const extra of [{ channel: 'arbitrary' }, { path: '/private' }, { grants: ['all'] }]) {
      expect(shellRequestSchema.safeParse({ protocolVersion: 1, ...extra }).success).toBe(false);
    }
  });
  it('rejects unrelated identities and capabilities', () => {
    expect(desktopShellStateSchema.safeParse({ ...state, identity: 'other' }).success).toBe(false);
    expect(desktopShellStateSchema.safeParse({ ...state, activation: { ...state.activation, id: 'input.capture' } }).success).toBe(false);
  });
  it('separates typed failures, state replies and command acknowledgement', () => {
    const failure = { ok: false, error: { code: 'permission-denied', message: 'Shell operation denied.', retryable: false } };
    expect(shellStateReplySchema.safeParse(failure).success).toBe(true);
    expect(shellCommandReplySchema.safeParse(failure).success).toBe(true);
    expect(shellCommandReplySchema.safeParse({ ok: true, value: null }).success).toBe(true);
    expect(shellCommandReplySchema.safeParse({ ok: true, value: state }).success).toBe(false);
    expect(shellStateReplySchema.safeParse({ ok: true, value: null }).success).toBe(false);
  });
});
