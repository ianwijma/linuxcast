import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer, type ViteDevServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
test.describe.configure({ mode: 'serial' });
let server: ViteDevServer; let url: string;
const evidence = fileURLToPath(new URL('./evidence/', import.meta.url));
test.beforeAll(async () => {
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('./fixtures/', import.meta.url)), esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 0, fs: { allow: [fileURLToPath(new URL('../../../../', import.meta.url))] } }, logLevel: 'silent' });
  await server.listen(); const address = server.httpServer!.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture address'); url = `http://127.0.0.1:${address.port}`; await mkdir(evidence, { recursive: true });
});
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1040, height: 1100 }); await page.goto(url); await expect(page.getByRole('searchbox', { name: 'Library' })).toBeVisible(); await page.evaluate(() => document.fonts.ready); });
for (const theme of ['dark', 'light']) test(`${theme} List, Grid, Detail and Form render accessible actual screenshots`, async ({ page }) => {
  if (theme === 'light') await page.getByRole('button', { name: 'Switch theme', exact: true }).click();
  for (const name of ['List', 'Grid', 'Detail', 'Form']) {
    await page.getByRole('button', { name, exact: true }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `${evidence}/${theme}-${name.toLowerCase()}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Library' }).press('Control+k');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `${evidence}/${theme}-action-panel.png`, fullPage: true });
});
test('async selection, keyboard primary/secondary, action filtering and nested return', async ({ page }) => {
  const query = page.getByRole('searchbox', { name: 'Library' }); await query.focus(); await query.press('ArrowDown');
  await expect(page.getByRole('option', { name: /Weekly planning/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Async update', exact: true }).click();
  await expect(page.getByRole('option', { name: /Weekly planning/ })).toHaveAttribute('aria-selected', 'true');
  await query.focus(); await query.press('Control+Enter'); await expect(page.locator('output')).toHaveText('Requested copy at revision 2 for work.');
  await query.press('Control+k'); const actions = page.getByRole('dialog', { name: 'Actions' }); await expect(actions).toBeVisible();
  await page.getByRole('searchbox', { name: 'Find an action' }).fill('copy'); await page.screenshot({ path: `${evidence}/dark-actions.png`, fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('searchbox', { name: 'Find an action' }).press('Escape'); await expect(actions).not.toBeVisible(); await expect(query).toBeFocused();
  await query.fill('planning'); await query.press('Enter'); await expect(page.getByRole('heading', { name: 'A calmer workspace', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(query).toHaveValue('planning'); await expect(query).toBeFocused(); await expect(page.getByRole('option', { name: /Weekly planning/ })).toHaveAttribute('aria-selected', 'true');
});
test('grid arrows, failed images and disabled permission actions remain usable', async ({ page }) => {
  await page.getByRole('button', { name: 'Grid', exact: true }).click(); const box = page.getByRole('listbox'); await box.focus(); await box.press('ArrowRight');
  await expect(page.getByRole('option', { name: /Weekly planning/ })).toHaveAttribute('aria-selected', 'true');
  await box.press('ArrowRight'); await expect(page.getByRole('option', { name: /Shared archive/ })).toHaveAttribute('aria-disabled', 'true');
  await box.press('Enter'); await expect(page.locator('output')).toHaveText('No action requested.');
  await expect(page.getByRole('img', { name: 'A calmer workspace: image unavailable' })).toBeVisible();
});
test('forms validate, preserve drafts through navigation, clear closed credentials and submit only explicit intents', async ({ page }) => {
  await page.getByRole('button', { name: 'Form', exact: true }).click(); const name = page.getByLabel('Collection name', { exact: false });
  await page.getByRole('button', { name: 'Create collection', exact: true }).click(); await expect(name).toBeFocused(); await expect(name).toHaveAttribute('aria-invalid', 'true'); await expect(page.locator('output')).toHaveText('No action requested.'); await page.screenshot({ path: `${evidence}/dark-form-validation.png`, fullPage: true });
  await name.fill('Public collection'); await page.getByLabel('Optional credential', { exact: false }).fill('synthetic-transient-value');
  await page.getByRole('button', { name: 'Push detail', exact: true }).click(); await page.keyboard.press('Escape'); await expect(name).toHaveValue('Public collection');
  await expect(page.getByLabel('Optional credential', { exact: false })).toHaveValue('synthetic-transient-value');
  await name.press('Enter'); await expect(page.locator('output')).toHaveText('Requested save at revision 1 with 7 fields.'); await expect(page.locator('output')).toHaveAttribute('data-sealed', 'true');
  await expect(page.getByLabel('Optional credential', { exact: false })).toHaveValue('');
  await name.fill('Changed draft'); await name.press('Escape'); const discard = page.getByRole('dialog', { name: 'Discard this draft?' }); await expect(discard).toBeVisible(); await page.screenshot({ path: `${evidence}/dark-discard-draft.png`, fullPage: true });
  await page.getByRole('button', { name: 'Keep editing', exact: true }).press('Enter'); await expect(discard).not.toBeVisible(); await name.focus(); await name.press('Escape'); await page.getByRole('button', { name: 'Discard changes', exact: true }).click(); await expect(page.getByRole('form')).not.toBeVisible();
  await page.getByRole('button', { name: 'Form', exact: true }).click(); await expect(name).toHaveValue(''); await expect(page.getByLabel('Optional credential', { exact: false })).toHaveValue('');
});
test('Markdown and malformed models cannot introduce scripts, images or external navigation', async ({ page }) => {
  const remote: string[] = []; page.on('request', request => { if (!request.url().startsWith(url) && !request.url().includes('/@fs/')) remote.push(request.url()); });
  await page.getByRole('button', { name: 'Adversarial Markdown', exact: true }).click();
  await expect(page.locator('.lc-markdown script,.lc-markdown img,.lc-markdown iframe')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Bad' })).toHaveCount(0); await page.getByRole('link', { name: 'Safe', exact: true }).click();
  await expect(page.locator('output')).toHaveText('Public link intent received.'); expect(remote).toEqual([]);
  await page.getByRole('button', { name: 'Malformed view', exact: true }).click(); await expect(page.getByRole('heading', { name: 'This view could not be displayed' })).toBeVisible(); await expect(page.getByRole('listbox')).toHaveCount(0);
});
test('loading, empty, error and permission states have real accessible screenshots', async ({ page }) => {
  for (const [button, file] of [['Loading state', 'loading'], ['Empty state', 'empty'], ['Error state', 'error'], ['Permission state', 'permission']] as const) {
    await page.getByRole('button', { name: button, exact: true }).click(); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); await page.screenshot({ path: `${evidence}/dark-${file}.png`, fullPage: true });
  }
});
test('200 percent text, forced colors and reduced motion preserve keyboard controls', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 1200 }); await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(page.locator('.lc-theme')).toHaveAttribute('data-lc-motion', 'reduced');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('searchbox', { name: 'Library' }).focus(); await page.keyboard.press('Control+k'); await expect(page.getByRole('searchbox', { name: 'Find an action' })).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); await page.screenshot({ path: `${evidence}/text-200-actions.png`, fullPage: true });
  await page.keyboard.press('Escape'); await page.emulateMedia({ forcedColors: 'active' }); await page.getByRole('listbox').focus(); await expect(page.getByRole('listbox')).toHaveCSS('outline-style', 'solid'); await page.screenshot({ path: `${evidence}/forced-colors.png`, fullPage: true });
});

test('action-panel arrows move button focus so Enter invokes the highlighted action', async ({ page }) => {
  const query = page.getByRole('searchbox', { name: 'Library' }); await query.focus(); await query.press('Control+k');
  await page.getByRole('searchbox', { name: 'Find an action' }).press('Tab');
  const panel = page.getByRole('dialog', { name: 'Actions' });
  await expect(panel.getByRole('button', { name: 'Open details', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown'); const copy = panel.getByRole('button', { name: /Copy reference/ });
  await expect(copy).toBeFocused(); await expect(copy).toHaveAttribute('data-current', 'true'); await page.keyboard.press('Enter');
  await expect(page.locator('output')).toHaveText('Requested copy at revision 1 for guide.');
});
test('confirmed Cancel clears drafts and secrets even when host intent does not navigate', async ({ page }) => {
  await page.getByRole('button', { name: 'Form', exact: true }).click();
  const name = page.getByLabel('Collection name', { exact: false }); const secret = page.getByLabel('Optional credential', { exact: false });
  await name.fill('Unsent public draft'); await secret.fill('synthetic-transient-value');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('form')).toBeVisible(); await expect(name).toHaveValue(''); await expect(secret).toHaveValue(''); await expect(name).toBeFocused();
  await expect(page.locator('output')).toHaveText('Requested cancel at revision 1.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('composing Enter repeats retain native IME behavior while ordinary repeats cannot invoke a new action',async({page})=>{
  const query=page.getByRole('searchbox',{name:'Library',exact:true});await query.focus();
  expect(await query.evaluate(element=>element.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true,isComposing:true,bubbles:true,cancelable:true})))).toBe(true);
  await expect(query).toBeVisible();await expect(page.locator('output')).toHaveText('No action requested.');
  expect(await query.evaluate(element=>element.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true,cancelable:true})))).toBe(false);
  await expect(query).toBeVisible();await expect(page.locator('output')).toHaveText('No action requested.');
});
