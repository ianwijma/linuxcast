import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

test.describe.configure({ mode: 'serial' });
let server: ViteDevServer;
let url: string;
const evidence = fileURLToPath(new URL('./evidence/', import.meta.url));
test.beforeAll(async () => {
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('./examples/', import.meta.url)),
    esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 0, fs: { allow: [fileURLToPath(new URL('../../../../', import.meta.url))] } }, logLevel: 'silent' });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error('Example server address unavailable');
  url = `http://127.0.0.1:${address.port}`;
  await mkdir(evidence, { recursive: true });
});
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 1000 });
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Ready for your next command.' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});

for (const appearance of ['dark', 'light'] as const) {
  test(`${appearance} opaque controls, local fonts and accessible affected-state screenshot`, async ({ page }) => {
    await page.getByRole('button', { name: appearance === 'dark' ? 'Dark' : 'Light', exact: true }).click();
    const theme = page.locator('.lc-theme');
    await expect(theme).toHaveAttribute('data-lc-theme', appearance);
    await expect(theme).toHaveAttribute('data-lc-surface', 'opaque');
    await expect(theme).toHaveCSS('background-color', appearance === 'dark' ? 'rgb(17, 18, 22)' : 'rgb(242, 243, 246)');
    expect(await page.evaluate(() => document.fonts.check('14px Inter') && document.fonts.check('12px "JetBrains Mono"'))).toBe(true);
    const violations = (await new AxeBuilder({ page }).analyze()).violations;
    expect(violations).toEqual([]);
    await page.getByLabel('Collection name', { exact: false }).focus();
    await expect(page.getByLabel('Collection name', { exact: false })).toHaveCSS('outline-style', 'solid');
    await page.screenshot({ path: `${evidence}/${appearance}-opaque.png`, fullPage: true });
  });
}

test('native labels, validation descriptions, submit and cancellation are functional', async ({ page }) => {
  const field = page.getByLabel('Collection name', { exact: false });
  await field.fill('');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription('Choose a name you can recognize in search. Enter a name for this collection.');
  await field.fill('Local commands');
  await field.press('Enter');
  await expect(page.getByText('Example changes saved.', { exact: true })).toBeVisible();
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Cancel loading' }).click();
  await expect(page.getByText('Loading cancelled.', { exact: true })).toBeVisible();
});

test('keyboard activation, busy suppression, focus return and disabled tab order', async ({ page }) => {
  const open = page.getByRole('button', { name: 'Open details', exact: true });
  await open.focus(); await open.press('Enter');
  const close = page.getByRole('button', { name: 'Close details', exact: true });
  await expect(close).toBeFocused(); await close.press('Space');
  await expect(open).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Show help', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  const busy = page.getByRole('button', { name: 'Saving changes', exact: false });
  await expect(busy).toBeFocused(); await busy.press('Enter'); await busy.press('Space');
  await expect(page.locator('[data-busy-count]')).toHaveAttribute('data-busy-count', '0');
  await expect(busy).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Remove selection' })).toBeFocused();
});

test('system theme changes and reduced motion update without remounting controls', async ({ page }) => {
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.locator('.lc-theme')).toHaveAttribute('data-lc-theme', 'dark');
  await expect(page.locator('.lc-theme')).toHaveAttribute('data-lc-motion', 'reduced');
  const button = page.getByRole('button', { name: 'Save changes', exact: true });
  await expect(button).toHaveCSS('transition-duration', '0s');
  await expect(button).toHaveCSS('transform', 'none');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('.lc-theme')).toHaveAttribute('data-lc-theme', 'light');
  await page.screenshot({ path: `${evidence}/light-reduced-motion.png`, fullPage: true });
});

test('200 percent text scaling and narrow viewport preserve labels, wrapping and actions', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 1100 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.getByLabel('Collection name', { exact: false })).toHaveCSS('font-size', '28px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const names = ['Save changes', 'Cancel loading', 'Open settings', 'Try again'];
  for (const name of names) {
    const button = page.getByRole('button', { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
    expect(await button.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `${evidence}/text-200-percent.png`, fullPage: true });
});

test('forced colors retain native control boundaries and visible keyboard focus', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  const field = page.getByLabel('Collection name', { exact: false });
  await field.focus();
  await expect(field).toHaveCSS('outline-style', 'solid');
  await expect(field).toHaveCSS('border-top-style', 'solid');
  await page.screenshot({ path: `${evidence}/forced-colors.png`, fullPage: true });
});
