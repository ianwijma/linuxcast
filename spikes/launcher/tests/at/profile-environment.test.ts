import { expect, test } from 'vitest';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { prepareProfile } from '../../src/profile.ts';

// The retained guest UI failure is only localized to electron-launch. These
// real own-file cases demonstrate an environment mismatch, not its sole cause.
async function withOwnedProfile(check: (base: string, profile: string) => Promise<void>) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'linuxcast-at-profile-test-'));
  const profile = mkdtempSync(join(base, 'linuxcast-launcher-activation-'));
  const prior = process.env.TMPDIR;
  try { await check(base, profile); }
  finally {
    if (prior === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = prior;
    rmSync(base, { recursive: true, force: true });
  }
}

test('the actual profile guard rejects a child-equivalent missing temporary base', async () => {
  await withOwnedProfile(async (_base, profile) => {
    delete process.env.TMPDIR;
    expect(() => prepareProfile(profile)).toThrow('Invalid disposable launcher profile.');
  });
});

test('the actual UI launch environment preserves the profile base without weakening its guard', async () => {
  await withOwnedProfile(async (base, profile) => {
    process.env.TMPDIR = base;
    const text = readFileSync(new URL('../activation-help-ui.ts', import.meta.url), 'utf8');
    const begin = text.indexOf('  application = await electron.launch(');
    const end = text.indexOf('  runtimeVersions = ', begin);
    expect(begin).toBeGreaterThan(0); expect(end).toBeGreaterThan(begin);
    let captured: { chromiumSandbox: boolean; env: Record<string, string> } | undefined;
    const context = { application: undefined, executable: '/public/electron', main: '/public/main', root: base, profile, join, tmpdir,
      process: { env: { DISPLAY: ':owned', XAUTHORITY: '/owned/auth' } },
      electron: { launch: async (options: typeof captured) => { captured = options; return {}; } } };
    await runInNewContext(`(async () => {${stripTypeScriptTypes(text.slice(begin, end))}})()`, context);
    expect(captured?.chromiumSandbox).toBe(true);
    expect(captured?.env.TMPDIR).toBe(base);
    expect(captured?.env.LINUXCAST_LAUNCHER_PROFILE).toBe(profile);
    process.env.TMPDIR = captured!.env.TMPDIR;
    expect(prepareProfile(captured!.env.LINUXCAST_LAUNCHER_PROFILE)).toBe(profile);
  });
});
