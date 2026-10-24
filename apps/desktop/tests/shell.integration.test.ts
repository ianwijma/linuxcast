import { afterEach, expect, it } from 'vitest';
import { _electron as electron } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import type { DesktopShellApi } from '@linuxcast/contracts';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const executable = createRequire(import.meta.url)('electron') as string;
const appUrl = 'linuxcast-app://shell/index.html';
let application: ElectronApplication | undefined;
let temporary = '';

afterEach(async () => {
  if (application) await application.close().catch(() => { application?.process().kill('SIGKILL'); });
  application = undefined;
  if (temporary) rmSync(temporary, { recursive: true, force: true });
});

it('runs the bundled isolated shell, rejects renderer privileges and preserves resident ownership', async () => {
  if (!process.env.DISPLAY || process.env.LINUXCAST_PRIVATE_DISPLAY !== '1')
    throw new Error('Run only with an owned Xvfb display and LINUXCAST_PRIVATE_DISPLAY=1; this is not a desktop integration pass.');
  execFileSync(process.execPath, ['apps/desktop/build.ts'], { cwd: root, timeout: 30000, stdio: 'pipe' });
  temporary = mkdtempSync(join(tmpdir(), 'linuxcast-product-shell-'));
  const profile = join(temporary, 'profile'), wrapper = join(temporary, 'entry.cjs');
  for (const name of ['profile', 'home', 'config', 'cache', 'data', 'runtime']) mkdirSync(join(temporary, name), { mode: 0o700 });
  // Wrapper owns the test profile and strips only Playwright instrumentation flags; all app bundles are production.
  writeFileSync(wrapper, `const { app } = require('electron');\nprocess.argv = process.argv.filter(value => value !== '--inspect=0' && value !== '--remote-debugging-port=0');\napp.setPath('userData', ${JSON.stringify(profile)});\napp.setPath('sessionData', ${JSON.stringify(profile)});\nrequire(${JSON.stringify(join(root, 'apps/desktop/dist/main.cjs'))});\n`, { mode: 0o600 });
  const env: Record<string, string> = { HOME: join(temporary, 'home'), XDG_CONFIG_HOME: join(temporary, 'config'),
    XDG_CACHE_HOME: join(temporary, 'cache'), XDG_DATA_HOME: join(temporary, 'data'),
    XDG_RUNTIME_DIR: join(temporary, 'runtime'), XDG_SESSION_TYPE: 'x11' };
  for (const key of ['DISPLAY', 'XAUTHORITY', 'PATH', 'LANG'])
    if (process.env[key]) env[key] = process.env[key]!;
  application = await electron.launch({ executablePath: executable, args: [wrapper, '--show'],
    chromiumSandbox: true, env, timeout: 20000 });
  const app = application, page = await app.firstWindow();
  await page.waitForURL(appUrl);
  await page.getByRole('heading', { name: 'Search is not available yet' }).waitFor({ timeout: 5000 });
  expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(profile);
  expect(await page.evaluate(() => {
    const windowApi = window as unknown as { require?: unknown; process?: unknown; linuxcast?: DesktopShellApi };
    return { require: typeof windowApi.require, process: typeof windowApi.process,
      methods: Object.keys(windowApi.linuxcast ?? {}).sort(), runtime: windowApi.linuxcast?.runtime };
  })).toEqual({ require: 'undefined', process: 'undefined',
    methods: ['getState', 'hideLauncher', 'onState', 'quit', 'reportContentHeight', 'runtime'],
    runtime: { sandboxed: true, contextIsolated: true } });
  expect(await page.evaluate(async () => {
    return await new Promise<boolean>(resolve => {
      document.addEventListener('securitypolicyviolation', event => {
        if (event.violatedDirective === 'connect-src') resolve(true);
      }, { once: true });
      void fetch('https://example.invalid/').catch(() => {});
      setTimeout(() => resolve(false), 1000);
    });
  })).toBe(true);
  const evidence = join(root, 'apps/desktop/evidence'); mkdirSync(evidence, { recursive: true });
  for (const theme of ['dark', 'light'] as const) {
    await app.evaluate(({ nativeTheme }, value) => { nativeTheme.themeSource = value; }, theme);
    await expect.poll(() => page.locator('.lc-theme').getAttribute('data-lc-theme')).toBe(theme);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(evidence, `shell-${theme}.png`) });
  }
  expect(await app.evaluate(({ app }) => app.getAppMetrics().filter(metric => metric.name === 'Linuxcast storage').length)).toBe(1);
  expect(await app.evaluate(async ({ utilityProcess }, options) => new Promise<boolean>((resolve, reject) => {
    const child = utilityProcess.fork(options.entry, [], { env: {}, stdio: 'ignore' });
    let denied = false;
    const timer = setTimeout(() => { child.kill(); reject(new Error('Resident owner check timed out.')); }, 5000);
    child.once('spawn', () => child.postMessage({ kind: 'initialize', dataDirectory: options.directory,
      applicationBuild: 'synthetic-contender', nativeBinding: options.binding }));
    child.on('message', (message: { kind: string; reasonCode?: string }) => {
      denied = message.kind === 'unavailable' && message.reasonCode === 'owner-already-running';
      child.kill();
    });
    child.once('exit', () => { clearTimeout(timer); resolve(denied); });
  }), { entry: join(root, 'apps/desktop/dist/storage.cjs'), directory: join(temporary, 'data/linuxcast'),
    binding: join(root, 'apps/desktop/dist/sqlite/better_sqlite3.node') })).toBe(true);
  const storage = await app.evaluate(async ({ utilityProcess }, options) => {
    async function run(write: boolean) {
      return await new Promise<{ sqliteVersion: string; value: unknown }>((resolve, reject) => {
        const child = utilityProcess.fork(options.entry, [], { env: {}, stdio: 'ignore' });
        const timer = setTimeout(() => { child.kill(); reject(new Error('Storage utility timed out.')); }, 10000);
        let sqliteVersion = '', result: unknown;
        child.once('spawn', () => child.postMessage({ kind: 'initialize', dataDirectory: options.directory,
          applicationBuild: 'synthetic-integration', nativeBinding: options.binding }));
        child.on('message', (message: { kind: string; sqliteVersion?: string; response?: { outcome: string; result?: unknown } }) => {
          if (message.kind === 'ready') {
            sqliteVersion = message.sqliteVersion!;
            child.postMessage({ kind: 'request', deadline: Date.now() + 5000, request: {
              schemaVersion: 1, requestId: write ? 'synthetic-write' : 'synthetic-read',
              method: write ? 'settings.set' : 'settings.get',
              params: write ? { id: 'ui.theme', value: 'dark', expectedRevision: 0 } : { id: 'ui.theme' },
            } });
          } else if (message.kind === 'response' && message.response?.outcome === 'completed') {
            result = message.response.result;
            child.postMessage({ kind: 'shutdown' });
          } else if (message.kind !== 'closed') {
            child.kill(); reject(new Error('Storage utility did not complete the synthetic request.'));
          }
        });
        child.once('exit', code => {
          clearTimeout(timer);
          if (code !== 0 || !sqliteVersion || result === undefined) reject(new Error('Storage utility exited without completion.'));
          else resolve({ sqliteVersion, value: result });
        });
      });
    }
    return { write: await run(true), reopened: await run(false) };
  }, { entry: join(root, 'apps/desktop/dist/storage.cjs'), directory: join(temporary, 'utility-data'),
    binding: join(root, 'apps/desktop/dist/sqlite/better_sqlite3.node') });
  expect(storage.write.sqliteVersion).toBe('3.53.4');
  expect(storage.reopened.sqliteVersion).toBe('3.53.4');
  expect(storage.reopened.value).toMatchObject({ id: 'ui.theme', value: 'dark', revision: 1 });
  const windowId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.id);
  await page.getByRole('button', { name: 'Hide', exact: true }).click({ timeout: 5000 });
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(false);
  const secondCode = await new Promise<number>((resolve, reject) => {
    const second = spawn(executable, [wrapper, '--toggle'], { env, stdio: 'ignore' });
    const timeout = setTimeout(() => { second.kill('SIGKILL'); reject(new Error('Second invocation timed out.')); }, 10000);
    second.once('error', error => { clearTimeout(timeout); reject(error); });
    second.once('exit', code => { clearTimeout(timeout); resolve(code ?? 1); });
  });
  expect(secondCode).toBe(0);
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.id))).toEqual([windowId]);
  expect(await app.evaluate(async ({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]!.webContents;
    const blocked = new Promise<boolean>(resolve => contents.once('will-frame-navigate', event => resolve(event.defaultPrevented)));
    void contents.executeJavaScript("location.href = 'https://example.invalid/';").catch(() => {});
    return await Promise.race([blocked, new Promise<boolean>(resolve => setTimeout(() => resolve(false), 2000))]);
  })).toBe(true);
  expect(page.url()).toBe(appUrl);
  await page.evaluate(() => { window.open('https://example.invalid/'); });
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  const child = app.process();
  const exited = new Promise<number | null>(resolve => child.once('exit', resolve));
  // Renderer navigation denial leaves Playwright's locator navigation wait pending.
  // Invoke the same DOM button directly after asserting the denial.
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Quit Linuxcast')!.click());
  expect(await exited).toBe(0);
  application = undefined;
}, 60000);
