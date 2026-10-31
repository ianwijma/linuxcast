import { afterEach, expect, it } from 'vitest';
import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const executable = createRequire(import.meta.url)('electron') as string;
let application: ElectronApplication | undefined;
let temporary = '';

afterEach(async () => {
  if (application) await application.close().catch(() => { application?.process().kill('SIGKILL'); });
  application = undefined;
  if (temporary) rmSync(temporary, { recursive: true, force: true });
});

async function fitsWindow(page: Page) {
  return page.evaluate(() => {
    const footer = document.querySelector('.lc-view:not([hidden]) .lc-view-footer')!;
    const bounds = footer.getBoundingClientRect();
    return {
      footerVisible: bounds.top >= 0 && bounds.bottom <= innerHeight + 1,
      bodyVisible: document.querySelector<HTMLElement>('.lc-view:not([hidden]) .lc-view-scroll')!.clientHeight > 0,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      noDocumentScroll: document.documentElement.scrollHeight <= innerHeight + 1,
    };
  });
}

it('keeps the real launcher keyboard controls in the native viewport at 200 percent zoom', async () => {
  if (!process.env.DISPLAY || process.env.LINUXCAST_PRIVATE_DISPLAY !== '1')
    throw new Error('Requires an owned Xvfb display; this does not establish native desktop or screen-reader acceptance.');
  execFileSync(process.execPath, ['apps/desktop/build.ts'], { cwd: root, timeout: 30000, stdio: 'pipe' });
  temporary = mkdtempSync(join(tmpdir(), 'linuxcast-shell-accessibility-'));
  for (const name of ['home', 'profile', 'config', 'cache', 'data', 'runtime', 'system'])
    mkdirSync(join(temporary, name), { mode: 0o700 });
  mkdirSync(join(temporary, 'data/applications'), { mode: 0o700 });
  for (let index = 0; index < 120; index++)
    writeFileSync(join(temporary, `data/applications/public-${index}.desktop`),
      `[Desktop Entry]\nType=Application\nName=Public catalogue ${index}\nExec=/usr/bin/true\n`, { mode: 0o600 });
  const wrapper = join(temporary, 'entry.cjs');
  writeFileSync(wrapper, `const { app } = require('electron');
process.argv = process.argv.filter(value => value !== '--inspect=0' && value !== '--remote-debugging-port=0');
app.setPath('userData', ${JSON.stringify(join(temporary, 'profile'))});
app.setPath('sessionData', ${JSON.stringify(join(temporary, 'profile'))});
require(${JSON.stringify(join(root, 'apps/desktop/dist/main.cjs'))});
`, { mode: 0o600 });
  const env: Record<string, string> = {
    HOME: join(temporary, 'home'), XDG_CONFIG_HOME: join(temporary, 'config'),
    XDG_CACHE_HOME: join(temporary, 'cache'), XDG_DATA_HOME: join(temporary, 'data'),
    XDG_RUNTIME_DIR: join(temporary, 'runtime'), XDG_DATA_DIRS: join(temporary, 'system'),
    XDG_CONFIG_DIRS: join(temporary, 'config'), XDG_SESSION_TYPE: 'x11',
    DBUS_SESSION_BUS_ADDRESS: 'unix:path=/nonexistent-linuxcast-accessibility-bus',
  };
  for (const key of ['DISPLAY', 'XAUTHORITY', 'PATH', 'LANG'])
    if (process.env[key]) env[key] = process.env[key]!;
  application = await electron.launch({ executablePath: executable, args: [wrapper, '--show'], chromiumSandbox: true, env });
  const app = application, page = await app.firstWindow();
  page.setDefaultTimeout(5000);
  await page.waitForURL('linuxcast-app://shell/index.html');
  const query = page.getByRole('searchbox', { name: 'Search commands', exact: true });
  await expect.poll(() => query.evaluate(element => element === document.activeElement)).toBe(true);
  await expect.poll(() => page.getByRole('option').count()).toBeGreaterThan(25);
  await query.fill('hide');
  await expect.poll(() => page.getByRole('option').count()).toBe(1);
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getSize()[1]!)).toBeLessThan(560);
  const shortHeight = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getSize()[1]!);
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(2); });
  await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(2);
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getSize()[1]!)).toBeGreaterThan(shortHeight);
  await query.fill('');
  await expect.poll(() => page.getByRole('option').count()).toBeGreaterThan(25);
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getSize()[1]!)).toBe(560);
  await expect.poll(() => fitsWindow(page)).toEqual({ footerVisible: true, bodyVisible: true, noHorizontalOverflow: true, noDocumentScroll: true });
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setSize(600, 400); });
  await expect.poll(() => fitsWindow(page)).toEqual({ footerVisible: true, bodyVisible: true, noHorizontalOverflow: true, noDocumentScroll: true });
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getSize()[0])).toBe(600);
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setSize(720, 560); });
  await query.fill('public catalogue no matching command');
  await expect.poll(() => page.getByRole('option').count()).toBe(0);
  await expect.poll(() => fitsWindow(page)).toEqual({ footerVisible: true, bodyVisible: true, noHorizontalOverflow: true, noDocumentScroll: true });
  await query.fill('');
  await expect.poll(() => page.getByRole('option').count()).toBeGreaterThan(25);
  await query.press('Tab');
  const results = page.getByRole('listbox', { name: 'Search commands', exact: true });
  await expect.poll(() => results.evaluate(element => element === document.activeElement)).toBe(true);
  await results.press('End');
  await expect.poll(() => page.getByRole('option').last().getAttribute('aria-selected')).toBe('true');
  await expect.poll(() => page.getByRole('option', { selected: true }).evaluate(element => {
    const row = element.getBoundingClientRect(), body = element.closest('.lc-view-scroll')!.getBoundingClientRect();
    return { topVisible: row.top >= body.top, bottomVisible: row.bottom <= body.bottom + 1,
      rowTop: row.top, rowBottom: row.bottom, bodyTop: body.top, bodyBottom: body.bottom };
  })).toMatchObject({ topVisible: true, bottomVisible: true });
  await results.press('Home');
  await results.press('Shift+Tab');
  await expect.poll(() => query.evaluate(element => element === document.activeElement)).toBe(true);
  await query.press('Control+k');
  const find = page.getByRole('searchbox', { name: 'Find an action', exact: true });
  await expect.poll(() => find.evaluate(element => element === document.activeElement)).toBe(true);
  await find.fill('Edit search alias');
  await find.press('Enter');
  const alias = page.getByRole('textbox', { name: 'Search alias', exact: true });
  await expect.poll(() => alias.evaluate(element => element === document.activeElement)).toBe(true);
  await expect.poll(() => fitsWindow(page)).toEqual({ footerVisible: true, bodyVisible: true, noHorizontalOverflow: true, noDocumentScroll: true });
  await page.keyboard.press('Tab');
  await expect.poll(() => page.getByRole('button', { name: 'Save alias', exact: true }).evaluate(element => element === document.activeElement)).toBe(true);
  await page.keyboard.press('Tab');
  await expect.poll(() => page.getByRole('button', { name: 'Cancel', exact: true }).evaluate(element => element === document.activeElement)).toBe(true);
  await page.keyboard.press('Enter');
  await expect.poll(() => query.evaluate(element => element === document.activeElement)).toBe(true);
  const evidence = join(root, 'apps/desktop/evidence');
  const capture = async (name: string) => {
    const sizes = await page.evaluate(async () => {
      const observed: string[] = [];
      for (let frame = 0; frame < 12; frame++) {
        await new Promise<void>(done => requestAnimationFrame(() => done()));
        observed.push(`${innerWidth}:${innerHeight}`);
      }
      return observed;
    });
    expect(new Set(sizes.slice(-6)).size, JSON.stringify(sizes)).toBe(1);
    // CDP screenshots crop a zoomed Electron surface to CSS dimensions. Capture
    // the actual native window so the image includes every visible control.
    const image = await app.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0]!.capturePage()).toPNG().toString('base64'));
    writeFileSync(join(evidence, name), Buffer.from(image, 'base64'));
  };
  for (const theme of ['dark', 'light'] as const) {
    await app.evaluate(({ nativeTheme }, value) => { nativeTheme.themeSource = value; }, theme);
    await expect.poll(() => page.locator('.lc-theme').getAttribute('data-lc-theme')).toBe(theme);
    await expect.poll(() => fitsWindow(page)).toEqual({ footerVisible: true, bodyVisible: true, noHorizontalOverflow: true, noDocumentScroll: true });
    expect((await new AxeBuilder({ page }).setLegacyMode().analyze()).violations).toEqual([]);
    await capture(`shell-zoom-200-${theme}.png`);
  }
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches && matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect.poll(() => fitsWindow(page)).toEqual({ footerVisible: true, bodyVisible: true, noHorizontalOverflow: true, noDocumentScroll: true });
  expect((await new AxeBuilder({ page }).setLegacyMode().analyze()).violations).toEqual([]);
  await capture('shell-zoom-200-forced-colors.png');
  await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
  await query.press('Escape');
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(false);
  await new Promise<void>((done, reject) => {
    const child = spawn(executable, [wrapper, '--show'], { env, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Reopen timed out.')); }, 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); if (code === 0) done(); else reject(new Error('Reopen failed.')); });
  });
  await expect.poll(() => query.evaluate(element => element === document.activeElement)).toBe(true);
  await expect.poll(() => fitsWindow(page)).toEqual({ footerVisible: true, bodyVisible: true, noHorizontalOverflow: true, noDocumentScroll: true });
  // Inject only fixed pending/failed state replies at the existing main handler.
  // These are renderer-state fixtures, not backend failure or recovery proof.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('shell:get-state');
    ipcMain.handle('shell:get-state', () => new Promise(() => {}));
  });
  const fallbackFits = () => page.evaluate(() => {
    const footer = document.querySelector('.shell-footer')!.getBoundingClientRect();
    return footer.top >= 0 && footer.bottom <= innerHeight + 1 &&
      document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1;
  });
  for (const theme of ['dark', 'light'] as const) {
    await app.evaluate(({ nativeTheme }, value) => { nativeTheme.themeSource = value; }, theme);
    await page.reload();
    await page.getByText('Opening Linuxcast…', { exact: true }).waitFor();
    await page.emulateMedia({ colorScheme: theme });
    await expect.poll(() => page.locator('.lc-theme').getAttribute('data-lc-theme')).toBe(theme);
    await expect.poll(fallbackFits).toBe(true);
    expect((await new AxeBuilder({ page }).setLegacyMode().analyze()).violations).toEqual([]);
    await capture(`shell-zoom-200-loading-${theme}.png`);
  }
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('shell:get-state');
    ipcMain.handle('shell:get-state', () => ({ ok: false, error: { code: 'internal', message: 'Shell operation unavailable.', retryable: false } }));
  });
  for (const theme of ['dark', 'light'] as const) {
    await app.evaluate(({ nativeTheme }, value) => { nativeTheme.themeSource = value; }, theme);
    await page.reload();
    await page.getByRole('heading', { name: 'Linuxcast could not connect', exact: true }).waitFor();
    await expect.poll(() => page.getByRole('button', { name: 'Hide', exact: true }).evaluate(element => element === document.activeElement)).toBe(true);
    await page.emulateMedia({ colorScheme: theme });
    await expect.poll(() => page.locator('.lc-theme').getAttribute('data-lc-theme')).toBe(theme);
    await expect.poll(fallbackFits).toBe(true);
    expect((await new AxeBuilder({ page }).setLegacyMode().analyze()).violations).toEqual([]);
    await capture(`shell-zoom-200-error-${theme}.png`);
  }
}, 60000);
