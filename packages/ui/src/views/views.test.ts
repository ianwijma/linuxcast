import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer, type ViteDevServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
test.describe.configure({ mode: 'serial' });
let server: ViteDevServer; let url: string;
// Instrument captures. Earlier appearance evidence in ../evidence/ stays as historical record.
const evidence = fileURLToPath(new URL('./evidence/instrument/', import.meta.url));
test.beforeAll(async () => {
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('./fixtures/', import.meta.url)), esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 0, fs: { allow: [fileURLToPath(new URL('../../../../', import.meta.url))] } }, logLevel: 'silent' });
  await server.listen(); const address = server.httpServer!.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture address'); url = `http://127.0.0.1:${address.port}`; await mkdir(evidence, { recursive: true });
});
test.afterAll(async () => { await server?.close(); });
const axe = async (page: Page) => expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
const shot = (page: Page, name: string) => page.locator('.lc-view-shell').screenshot({ path: `${evidence}/${name}.png` });
const pageShot = (page: Page, name: string) => page.screenshot({ path: `${evidence}/${name}.png` });
const query = (page: Page, name = 'Library') => page.getByRole('combobox', { name, exact: true });
test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1040, height: 1100 }); await page.goto(url); await expect(query(page)).toBeVisible(); await page.evaluate(() => document.fonts.ready); });

for (const theme of ['dark', 'light']) test(`${theme} List, Grid, Detail, Form, split and glyph grid render accessible Instrument screenshots`, async ({ page }) => {
  if (theme === 'light') await page.getByRole('button', { name: 'Switch theme', exact: true }).click();
  for (const name of ['List', 'Grid', 'Detail', 'Form', 'Split', 'Glyph grid']) {
    await page.getByRole('button', { name, exact: true }).click();
    await axe(page);
    await shot(page, `${theme}-${name.toLowerCase().replace(' ', '-')}`);
  }
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await query(page).press('Control+k');
  await axe(page);
  await shot(page, `${theme}-action-panel`);
});

test('root query is a combobox controlling a grouped listbox with a valid active descendant', async ({ page }) => {
  const box = query(page); const list = page.getByRole('listbox', { name: 'Library', exact: true });
  await expect(box).toHaveAttribute('aria-expanded', 'true'); await expect(box).toHaveAttribute('aria-autocomplete', 'list');
  expect(await box.getAttribute('aria-controls')).toBe(await list.getAttribute('id'));
  const active = async () => page.locator(`[id="${await box.getAttribute('aria-activedescendant')}"]`);
  await expect(await active()).toHaveAttribute('role', 'option'); await expect(await active()).toHaveAttribute('aria-selected', 'true');
  await expect(list.getByRole('group', { name: 'Recent', exact: true }).getByRole('option')).toHaveCount(3);
  await box.press('ArrowDown'); await expect(await active()).toContainText('Weekly planning');
  expect(await list.getAttribute('aria-activedescendant')).toBe(await box.getAttribute('aria-activedescendant'));
  // Full title, subtitle and disabled reason stay in the accessible name and tooltip.
  const archive = page.getByRole('option', { name: /Shared archive/ });
  await expect(archive).toHaveAccessibleName(/A selected directory.*Permission required\. Choose this directory to grant access\./);
  await expect(archive).toHaveAttribute('title', 'Shared archive — A selected directory — Permission required. Choose this directory to grant access.');
  // Native caret keys remain in the query.
  await box.fill('plan'); await box.press('Home'); await box.press('ArrowRight'); expect(await box.evaluate(input => (input as HTMLInputElement).selectionStart)).toBe(1);
  await box.fill('no such item'); await expect(box).toHaveAttribute('aria-expanded', 'false'); await expect(box).not.toHaveAttribute('aria-activedescendant');
  await expect(page.getByRole('heading', { name: 'No matching results' })).toBeVisible(); await expect(page.getByText('No matches', { exact: true })).toBeVisible();
});

test('async selection, keyboard primary/secondary, action filtering and nested return', async ({ page }) => {
  const box = query(page); await box.focus(); await box.press('ArrowDown');
  await expect(page.getByRole('option', { name: /Weekly planning/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Async update', exact: true }).click();
  await expect(page.getByRole('option', { name: /Weekly planning/ })).toHaveAttribute('aria-selected', 'true');
  await expect(box).not.toBeFocused(); // the async snapshot itself never moved focus
  await box.focus(); await box.press('Control+Enter'); await expect(page.locator('output')).toHaveText('Requested copy at revision 2 for work.');
  await box.press('Control+k'); const actions = page.getByRole('dialog', { name: 'Actions' }); await expect(actions).toBeVisible();
  await page.getByRole('searchbox', { name: 'Find an action' }).fill('copy'); await shot(page, 'dark-actions-filtered');
  await axe(page);
  await page.getByRole('searchbox', { name: 'Find an action' }).press('Escape'); await expect(actions).not.toBeVisible(); await expect(box).toBeFocused();
  await box.fill('planning'); await box.press('Enter'); await expect(page.getByRole('heading', { name: 'A calmer workspace', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(box).toHaveValue('planning'); await expect(box).toBeFocused(); await expect(page.getByRole('option', { name: /Weekly planning/ })).toHaveAttribute('aria-selected', 'true');
});

test('root Escape closes actions, then clears a nonempty query, then dismisses; nested Escape pops first', async ({ page }) => {
  await page.getByRole('button', { name: 'List', exact: true }).click(); // session with an observable close callback
  const box = query(page); await box.fill('planning'); await box.press('Control+k');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(box).toHaveValue('planning'); await expect(box).toBeFocused();
  await page.keyboard.press('Escape'); await expect(box).toHaveValue(''); await expect(box).toBeFocused(); await expect(page.getByRole('option')).toHaveCount(4);
  await expect(page.locator('output')).toHaveText('No action requested.'); await expect(page.locator('output')).toHaveAttribute('data-closed', '');
  // Nested: panel closes first, then the view pops with the parent query/selection/focus intact.
  await box.fill('weekly'); await box.press('Enter'); await page.keyboard.press('Control+k'); await expect(page.getByRole('dialog', { name: 'Actions' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('heading', { name: 'A calmer workspace', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(box).toHaveValue('weekly'); await expect(box).toBeFocused(); await expect(page.getByRole('option', { name: /Weekly planning/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape'); await expect(box).toHaveValue('');
  await page.keyboard.press('Escape'); await expect(page.locator('output')).toHaveAttribute('data-closed', 'library');
  await expect(page.locator('output')).toHaveText('Requested open at revision 1 for work.'); // no action was invoked by any Escape
});

test('IME composition Escape keeps the query and panel state', async ({ page }) => {
  const box = query(page); await box.fill('planning');
  expect(await box.evaluate(input => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true })))).toBe(true);
  await expect(box).toHaveValue('planning');
});

test('footer status line shows selected context and only genuinely bound verbs', async ({ page }) => {
  const footer = page.locator('.lc-view-footer');
  await expect(footer.locator('.lc-footer-title')).toHaveText('A calmer workspace'); await expect(footer.getByText('Recent')).toHaveCount(0); // no invented type label
  await expect(footer.locator('.lc-glyph-tile')).toHaveAttribute('data-size', 'small');
  await expect(footer.getByRole('button', { name: 'Open details Enter', exact: true })).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Copy reference Ctrl+Enter', exact: true })).toBeVisible();
  const actionsButton = footer.getByRole('button', { name: 'Actions Ctrl+K', exact: true });
  await expect(actionsButton).toHaveAttribute('aria-haspopup', 'dialog'); await expect(actionsButton).toHaveAttribute('aria-expanded', 'false');
  // A disabled item has no actions: no primary or secondary verb is invented.
  await query(page).press('ArrowDown'); await query(page).press('ArrowDown');
  await expect(footer.locator('.lc-footer-title')).toHaveText('Shared archive'); await expect(footer.getByRole('button')).toHaveCount(1);
  await query(page).press('Enter'); await query(page).press('Control+Enter'); await expect(page.locator('output')).toHaveText('No action requested.');
  // Footer clicks dispatch the same selected primary identity as Enter.
  await query(page).press('ArrowUp'); await footer.getByRole('button', { name: 'Open details Enter', exact: true }).click();
  await expect(page.locator('output')).toHaveText('Requested open at revision 1 for work.');
});

test('action panel: 280px, bottom filter, grouped destructive last, focus return and Ctrl K close', async ({ page }) => {
  const box = query(page); await box.press('Control+k');
  const panel = page.getByRole('dialog', { name: 'Actions', exact: true }); const filter = page.getByRole('searchbox', { name: 'Find an action', exact: true });
  await expect(filter).toBeFocused(); await expect(page.getByRole('button', { name: 'Actions Ctrl+K', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await panel.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  const geometry = await panel.evaluate(element => {
    const rect = element.getBoundingClientRect(); const footer = element.closest('.lc-view')!.querySelector('.lc-view-footer')!.getBoundingClientRect();
    const filterBox = element.querySelector('.lc-panel-filter')!.getBoundingClientRect(); const list = element.querySelector('.lc-action-list')!.getBoundingClientRect();
    const rows = Array.from(element.querySelectorAll('.lc-panel-action'), row => row.getBoundingClientRect().height);
    return { width: rect.width, bottom: rect.bottom, footerTop: footer.top, filterTop: filterBox.top, filterHeight: filterBox.height, listBottom: list.bottom, rows };
  });
  expect(geometry.width).toBeCloseTo(280, 0); expect(geometry.bottom).toBeLessThanOrEqual(geometry.footerTop); expect(geometry.filterTop).toBeGreaterThanOrEqual(geometry.listBottom - 1);
  expect(geometry.filterHeight).toBeGreaterThanOrEqual(44); for (const height of geometry.rows) expect(height).toBeGreaterThanOrEqual(36);
  const names = await panel.locator('.lc-panel-action').evaluateAll(rows => rows.map(row => row.textContent));
  expect(names.at(-1)).toContain('Remove from library'); expect(names.at(-1)).toContain('(destructive)');
  const destructive = panel.getByRole('button', { name: /^Remove from library.*\(destructive\)$/ });
  await expect(destructive).toHaveAttribute('data-variant', 'danger');
  expect(await destructive.evaluate(row => row.closest('.lc-panel-group')!.querySelectorAll('.lc-panel-action').length)).toBe(1);
  await expect(panel.getByRole('button', { name: /^Open details/ })).toHaveAttribute('data-current', 'true'); // primary stays the initial choice
  await page.keyboard.press('Control+k'); await expect(panel).toHaveCount(0); await expect(box).toBeFocused();
  // Pointer: the close control and an outside click both close without invoking.
  await box.press('Control+k'); await panel.getByRole('button', { name: 'Close actions', exact: true }).click(); await expect(panel).toHaveCount(0);
  await box.press('Control+k'); await page.mouse.click(5, 5); await expect(panel).toHaveCount(0); await expect(page.locator('output')).toHaveText('No action requested.');
});

test('action-panel arrows move button focus so Enter invokes the highlighted action', async ({ page }) => {
  const box = query(page); await box.focus(); await box.press('Control+k');
  await page.getByRole('searchbox', { name: 'Find an action' }).press('Shift+Tab');
  const panel = page.getByRole('dialog', { name: 'Actions' });
  await expect(panel.getByRole('button', { name: /^Remove from library/ })).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(panel.getByRole('button', { name: 'Open details', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown'); const copy = panel.getByRole('button', { name: /Copy reference/ });
  await expect(copy).toBeFocused(); await expect(copy).toHaveAttribute('data-current', 'true'); await page.keyboard.press('Enter');
  await expect(page.locator('output')).toHaveText('Requested copy at revision 1 for guide.');
});

test('a snapshot arriving while actions are open dispatches the latest revision and stable selection', async ({ page }) => {
  await page.getByRole('button', { name: 'Delayed update', exact: true }).click(); await query(page).press('Control+k');
  await expect(page.getByRole('option', { name: /New arrival/ })).toBeAttached();
  await expect(page.getByRole('option', { name: /A calmer workspace/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('searchbox', { name: 'Find an action' }).fill('copy'); await page.getByRole('searchbox', { name: 'Find an action' }).press('Enter');
  await expect(page.locator('output')).toHaveText('Requested copy at revision 2 for guide.');
});

test('grouped grid uses grid/row/gridcell semantics, real-column arrows, stable failed images and disabled cells', async ({ page }) => {
  await page.getByRole('button', { name: 'Grid', exact: true }).click(); const gridBox = page.getByRole('grid', { name: 'Collections', exact: true }); await gridBox.focus(); await gridBox.press('ArrowRight');
  await expect(page.getByRole('gridcell', { name: /Weekly planning/ })).toHaveAttribute('aria-selected', 'true');
  await expect(query(page, 'Collections')).toHaveAttribute('aria-haspopup', 'grid');
  await gridBox.press('ArrowRight'); await expect(page.getByRole('gridcell', { name: /Shared archive/ })).toHaveAttribute('aria-disabled', 'true');
  await gridBox.press('Enter'); await expect(page.locator('output')).toHaveText('No action requested.');
  const failed = page.getByRole('img', { name: 'A calmer workspace: image unavailable' }); await expect(failed).toBeVisible();
  const sizes = await page.locator('.lc-grid-media').evaluateAll(media => media.map(element => element.getBoundingClientRect().height));
  expect(new Set(sizes.map(Math.round)).size).toBe(1); // failed image keeps the shared cell footprint
  await page.getByRole('button', { name: 'Glyph grid', exact: true }).click();
  const glyphs = page.getByRole('grid', { name: 'Public glyphs', exact: true });
  const rows = await glyphs.getByRole('row').evaluateAll(values => values.map(row => ({ cells: row.querySelectorAll('[role="gridcell"]').length, tops: [...new Set(Array.from(row.querySelectorAll('[role="gridcell"]'), cell => Math.round(cell.getBoundingClientRect().top)))].length })));
  for (const row of rows) expect(row.tops).toBe(1); // each ARIA row is one visual row
  const columns = rows[0]!.cells; expect(columns).toBeGreaterThan(1);
  await expect(glyphs.getByRole('rowgroup', { name: 'Smileys', exact: true })).toBeVisible();
  await glyphs.focus(); await glyphs.press('ArrowDown');
  const selectedIndex = async () => (await page.locator('[role="gridcell"]').evaluateAll(cells => cells.findIndex(cell => cell.getAttribute('aria-selected') === 'true')));
  expect(await selectedIndex()).toBe(Math.min(columns, 8));
  await glyphs.press('End'); const rowEnd = await selectedIndex(); await glyphs.press('Home'); const rowStart = await selectedIndex();
  expect(rowStart % columns).toBe(0); expect(rowEnd).toBeGreaterThan(rowStart);
  await glyphs.press('Control+End'); await expect(page.getByRole('gridcell', { name: /Unavailable public glyph/ })).toHaveAttribute('aria-selected', 'true');
  await glyphs.press('Control+Home'); await expect(page.getByRole('gridcell', { name: /Grinning face/ })).toHaveAttribute('aria-selected', 'true');
  // The search field moves by grid row, leaving Left/Right to the caret.
  await query(page, 'Public glyphs').press('ArrowDown'); expect(await selectedIndex()).toBe(Math.min(columns, 8));
  await page.getByRole('gridcell', { name: /Penguin/ }).click(); await expect(page.locator('.lc-footer-title')).toHaveText('Penguin');
  await expect(page.locator('.lc-grid-cell[aria-selected="true"]')).toHaveCSS('background-color', /rgb/);
  expect(await page.locator('.lc-grid-cell[aria-selected="true"]').evaluate(cell => getComputedStyle(cell, '::after').content)).not.toBe('none');
  await page.keyboard.press('Enter'); await expect(page.locator('output')).toHaveText('Requested copy-glyph at revision 1 for penguin.');
});

test('list/detail separator is focusable, keyboard and pointer adjustable, with truthful preview bands', async ({ page }) => {
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  const separator = page.getByRole('separator', { name: 'Resize list and preview', exact: true });
  await expect(separator).toHaveAttribute('aria-valuenow', '42'); await expect(separator).toHaveAttribute('aria-valuemin', '30'); await expect(separator).toHaveAttribute('aria-valuemax', '60');
  expect(await separator.getAttribute('aria-controls')).toBe(await page.getByRole('listbox', { name: 'Reading list' }).getAttribute('id'));
  const ratio = () => page.locator('.lc-collection-layout').evaluate(layout => layout.querySelector('.lc-collection-main')!.getBoundingClientRect().width / layout.getBoundingClientRect().width);
  expect(await ratio()).toBeCloseTo(0.42, 1);
  await separator.focus(); await separator.press('ArrowRight'); await expect(separator).toHaveAttribute('aria-valuenow', '44');
  await separator.press('ArrowLeft'); await separator.press('ArrowLeft'); await expect(separator).toHaveAttribute('aria-valuenow', '40');
  await separator.press('Home'); await expect(separator).toHaveAttribute('aria-valuenow', '30'); await separator.press('End'); await expect(separator).toHaveAttribute('aria-valuenow', '60');
  expect(await ratio()).toBeCloseTo(0.6, 1);
  const box = (await page.locator('.lc-collection-layout').boundingBox())!; const handle = (await separator.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 20); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.5, handle.y + 20, { steps: 4 }); await page.mouse.up();
  expect(Number(await separator.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(48); expect(Number(await separator.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(52);
  await expect(page.locator('output')).toHaveText('No action requested.');
  await expect(page.getByRole('complementary', { name: 'Selected item preview' }).getByRole('heading', { name: 'Launch brief' })).toBeVisible();
  await expect(page.getByRole('option', { name: /Launch brief/ }).locator('.lc-row-subtitle')).toHaveAttribute('data-mono', 'true');
  await query(page, 'Reading list').press('ArrowDown');
  const preview = page.getByRole('complementary', { name: 'Selected item preview' });
  await expect(preview.getByRole('heading', { name: 'PDF preview unavailable' })).toBeVisible(); await expect(preview.locator('.lc-plate')).toHaveAttribute('data-layout', 'band');
  await expect(page.getByRole('option')).toHaveCount(3); await shot(page, 'dark-split-pdf-band');
  await query(page, 'Reading list').press('ArrowDown'); await expect(preview.getByRole('img', { name: 'Cover image: image unavailable' })).toBeVisible();
  await axe(page);
  await page.setViewportSize({ width: 560, height: 1100 }); await expect(separator).toBeHidden(); await expect(preview).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); await shot(page, 'dark-split-narrow');
});

test('Markdown and malformed models cannot introduce scripts, images or external navigation', async ({ page }) => {
  const remote: string[] = []; page.on('request', request => { if (!request.url().startsWith(url) && !request.url().includes('/@fs/')) remote.push(request.url()); });
  await page.getByRole('button', { name: 'Adversarial Markdown', exact: true }).click();
  await expect(page.locator('.lc-markdown script,.lc-markdown img,.lc-markdown iframe')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Bad' })).toHaveCount(0); await page.getByRole('link', { name: 'Safe', exact: true }).click();
  await expect(page.locator('output')).toHaveText('Public link intent received.'); expect(remote).toEqual([]);
  await page.getByRole('button', { name: 'Malformed view', exact: true }).click(); await expect(page.getByRole('heading', { name: 'This view could not be displayed' })).toBeVisible(); await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('loading, refreshing, empty, error and permission states use truthful plates and bands', async ({ page }) => {
  for (const [button, file] of [['Loading state', 'loading'], ['Refreshing state', 'refreshing'], ['Empty state', 'empty'], ['Error state', 'error'], ['Permission state', 'permission']] as const) {
    await page.getByRole('button', { name: button, exact: true }).click(); await axe(page); await shot(page, `dark-${file}`);
    if (file === 'loading') { await expect(page.getByRole('status').filter({ hasText: 'Loading…' })).toBeVisible(); await expect(page.locator('.lc-view-progress')).toBeVisible(); await expect(page.getByText('No items yet')).toHaveCount(0); }
    if (file === 'refreshing') { await expect(page.getByRole('option')).toHaveCount(4); await expect(page.locator('.lc-view-progress')).toBeVisible(); await expect(page.getByRole('status').filter({ hasText: 'Refreshing results…' })).toBeAttached(); }
    if (file === 'empty') { await expect(page.getByText('Empty', { exact: true })).toBeVisible(); await expect(page.locator('.lc-plate')).toHaveAttribute('data-kind', 'empty'); }
    if (file === 'error') { await expect(page.getByRole('alert')).toHaveText('The library could not refresh. Your existing items are still available.'); await expect(page.getByRole('option')).toHaveCount(4); }
    // A warning is presented as caller copy only; no denied/unsupported classification is inferred.
    if (file === 'permission') { await expect(page.locator('.lc-view-band')).toHaveAttribute('data-kind', 'warning'); await expect(page.locator('.lc-plate')).toHaveCount(0); await expect(page.getByText('Permission denied')).toHaveCount(0); await expect(page.getByRole('option')).toHaveCount(4); }
  }
});

test('forms validate, preserve drafts through navigation, clear closed credentials and submit only explicit intents', async ({ page }) => {
  await page.getByRole('button', { name: 'Form', exact: true }).click(); const name = page.getByLabel('Collection name', { exact: false });
  await page.getByRole('button', { name: 'Create collection', exact: true }).click(); await expect(name).toBeFocused(); await expect(name).toHaveAttribute('aria-invalid', 'true'); await expect(page.locator('output')).toHaveText('No action requested.'); await shot(page, 'dark-form-validation');
  await name.fill('Public collection'); await page.getByLabel('Optional credential', { exact: false }).fill('synthetic-transient-value');
  await page.getByRole('button', { name: 'Push detail', exact: true }).click(); await page.keyboard.press('Escape'); await expect(name).toHaveValue('Public collection');
  await expect(page.getByLabel('Optional credential', { exact: false })).toHaveValue('synthetic-transient-value');
  await name.press('Enter'); await expect(page.locator('output')).toHaveText('Requested save at revision 1 with 7 fields.'); await expect(page.locator('output')).toHaveAttribute('data-sealed', 'true');
  await expect(page.getByLabel('Optional credential', { exact: false })).toHaveValue('');
  await name.fill('Changed draft'); await name.press('Escape'); const discard = page.getByRole('dialog', { name: 'Discard this draft?' }); await expect(discard).toBeVisible(); await shot(page, 'dark-discard-draft');
  await page.getByRole('button', { name: 'Keep editing', exact: true }).press('Enter'); await expect(discard).not.toBeVisible(); await name.focus(); await name.press('Escape'); await page.getByRole('button', { name: 'Discard changes', exact: true }).click(); await expect(page.getByRole('form')).not.toBeVisible();
  await page.getByRole('button', { name: 'Form', exact: true }).click(); await expect(name).toHaveValue(''); await expect(page.getByLabel('Optional credential', { exact: false })).toHaveValue('');
});

test('480px at 200 percent text keeps rows growing, footer bounded and every action control reachable', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 }); await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const rows = await page.locator('.lc-result').evaluateAll(values => values.map(row => ({ height: row.getBoundingClientRect().height, scroll: row.scrollWidth <= row.clientWidth + 1 })));
  for (const row of rows) { expect(row.height).toBeGreaterThanOrEqual(80); expect(row.scroll).toBe(true); }
  const footer = await page.locator('.lc-view-footer').evaluate(element => { const shell = element.closest('.lc-view-shell')!.getBoundingClientRect(); const box = element.getBoundingClientRect(); return { inside: box.left >= shell.left - 1 && box.right <= shell.right + 1, overflow: element.scrollWidth <= element.clientWidth + 1, hiddenLabel: getComputedStyle(element.querySelector('.lc-footer-label')!).clipPath }; });
  expect(footer.inside).toBe(true); expect(footer.overflow).toBe(true); expect(footer.hiddenLabel).toBe('inset(50%)');
  await expect(page.getByRole('button', { name: 'Actions Ctrl+K', exact: true })).toBeVisible();
  await query(page).focus(); await page.keyboard.press('Control+k'); await expect(page.getByRole('searchbox', { name: 'Find an action' })).toBeFocused();
  await page.getByRole('dialog', { name: 'Actions' }).evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  const panel = await page.getByRole('dialog', { name: 'Actions' }).evaluate(element => { const box = element.getBoundingClientRect(); return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: window.innerWidth, height: window.innerHeight }; });
  expect(panel.top).toBeGreaterThanOrEqual(0); expect(panel.left).toBeGreaterThanOrEqual(0); expect(panel.right).toBeLessThanOrEqual(panel.width); expect(panel.bottom).toBeLessThanOrEqual(panel.height);
  for (const control of await page.getByRole('dialog', { name: 'Actions' }).locator('button, input').all()) { await control.scrollIntoViewIfNeeded(); await expect(control).toBeInViewport(); }
  await axe(page); await pageShot(page, 'text-200-480-actions');
});

test('200 percent text, forced colors and reduced motion preserve keyboard controls', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 1200 }); await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(page.locator('.lc-theme')).toHaveAttribute('data-lc-motion', 'reduced');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await query(page).focus(); await page.keyboard.press('Control+k'); await expect(page.getByRole('searchbox', { name: 'Find an action' })).toBeFocused();
  await expect(page.getByRole('dialog', { name: 'Actions' })).toHaveCSS('animation-name', 'none');
  await axe(page); await pageShot(page, 'text-200-actions');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Loading state', exact: true }).click(); await expect(page.locator('.lc-view-progress')).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: 'List', exact: true }).click(); await page.emulateMedia({ forcedColors: 'active' }); await query(page).press('ArrowDown'); await page.getByRole('listbox').focus(); await expect(page.getByRole('listbox')).toHaveCSS('outline-style', 'solid');
  await expect(page.locator('.lc-result[aria-selected="true"]')).toHaveCSS('outline-style', 'solid'); await shot(page, 'forced-colors');
  await page.getByRole('button', { name: 'Glyph grid', exact: true }).click(); await expect(page.locator('.lc-grid-cell[aria-selected="true"]')).toHaveCSS('outline-style', 'solid'); await shot(page, 'forced-colors-grid');
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
  const box=query(page);await box.focus();
  expect(await box.evaluate(element=>element.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true,isComposing:true,bubbles:true,cancelable:true})))).toBe(true);
  await expect(box).toBeVisible();await expect(page.locator('output')).toHaveText('No action requested.');
  expect(await box.evaluate(element=>element.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true,cancelable:true})))).toBe(false);
  await expect(box).toBeVisible();await expect(page.locator('output')).toHaveText('No action requested.');
});
