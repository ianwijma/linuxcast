import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

test.describe.configure({ mode: 'serial' });
let server: ViteDevServer;
let url: string;
// Instrument adoption evidence; historical captures in ./evidence/ are not rewritten.
const evidence = fileURLToPath(new URL('./evidence/instrument/', import.meta.url));
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
    await expect(page.getByLabel('Collection name', { exact: false })).toHaveCSS('border-top-color', hex(appearance === 'dark' ? '#7D808E' : '#7F8492'));
    await page.screenshot({ path: `${evidence}/${appearance}-opaque.png`, fullPage: true });
  });
}

const hex = (value: string) => `rgb(${[1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16)).join(', ')})`;

test('rows: hanging alignment, neutral selection plus rail, independent focus and activedescendant', async ({ page }) => {
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  const query = page.getByRole('combobox', { name: 'Filter example rows' });
  const listbox = page.getByRole('listbox', { name: 'Example results' });
  await expect(listbox.getByRole('group', { name: 'Commands' })).toBeVisible();
  const first = listbox.getByRole('option', { name: /Search files/ });
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(first).toHaveCSS('background-color', hex('#35363F'));
  expect(await first.evaluate(element => getComputedStyle(element, '::before').backgroundColor)).toBe(hex('#FF786E'));
  expect(await first.evaluate(element => getComputedStyle(element, '::before').width)).toBe('2px');
  // Keycaps: one cap per key, Linux names, display only.
  await expect(first.locator('kbd')).toHaveText(['Alt', 'Shift', 'F']);
  // Caption starts on the title column: caption text left edge equals row title left edge.
  const captionX = await listbox.locator('.lc-group-caption-label').first().evaluate(element => element.getBoundingClientRect().left);
  const titleX = await first.locator('.lc-row-title').evaluate(element => element.getBoundingClientRect().left);
  expect(Math.abs(captionX - titleX)).toBeLessThanOrEqual(1);
  await query.focus();
  await query.press('ArrowDown');
  const second = listbox.getByRole('option', { name: /Clipboard history/ });
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await expect(query).toHaveAttribute('aria-activedescendant', (await second.getAttribute('id'))!);
  await expect(query).toBeFocused();
  await expect(query).toHaveCSS('outline-style', 'solid');
  // Truncated title keeps its full value as tooltip and accessible name.
  const long = listbox.getByRole('option', { name: /deliberately long title that must truncate/ });
  expect(await long.locator('.lc-row-title').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await expect(long).toHaveAttribute('title', /deliberately long title that must truncate/);
  // Unknown extension category is coerced to the closed system tile; no caller colour reaches the DOM.
  const fallback = listbox.getByRole('option', { name: /Extension command/ }).locator('.lc-glyph-tile');
  await expect(fallback).toHaveAttribute('data-category', 'system');
  await expect(fallback).toHaveCSS('background-color', hex('#5A5E6B'));
  await query.fill('zzz');
  await expect(page.getByRole('heading', { name: 'No rows match “zzz”' })).toBeVisible();
  await expect(page.locator('.lc-plate[data-kind="filtered"]').first()).toContainText('No matches');
  await page.getByRole('button', { name: 'Clear filter', exact: true }).first().click();
  await expect(first).toBeVisible();
  await page.screenshot({ path: `${evidence}/rows-dark.png`, clip: (await page.locator('.preview-wide').first().boundingBox())! });
});

test('multi-selection checkboxes stay distinct from the cursor rail', async ({ page }) => {
  const group = page.getByRole('group', { name: 'Multi-selection' });
  const clipboard = group.getByRole('checkbox', { name: 'Clipboard history' });
  const search = group.getByRole('checkbox', { name: 'Search files' });
  await expect(clipboard).toBeChecked();
  await expect(group.locator('.lc-row[data-current]')).toHaveCount(0);
  await search.focus();
  await expect(group.locator('.lc-row[data-current]')).toHaveCount(1);
  await expect(group.locator('.lc-row[data-current]')).toContainText('Search files');
  await search.press('Space');
  await expect(search).toBeChecked();
  await expect(clipboard).toBeChecked();
  await expect(group.locator('.lc-group-caption-count')).toHaveText('2');
  await page.keyboard.press('Tab');
  await expect(clipboard).toBeFocused();
  await expect(group.locator('.lc-row[data-current]')).toContainText('Clipboard history');
});

test('state plates: shape, eyebrow word and tone for every kind; caller-owned actions only', async ({ page }) => {
  const expected: Record<string, string> = { filtered: 'No matches', error: 'Error', denied: 'Permission denied', unsupported: 'Unsupported in this session', unavailable: 'Unavailable', interrupted: 'Interrupted', pending: 'Approval needed', success: 'Done', empty: 'Empty' };
  for (const [kind, word] of Object.entries(expected)) {
    const plate = page.locator(`.lc-plate[data-kind="${kind}"]`).first();
    await expect(plate.locator('.lc-plate-eyebrow')).toHaveText(word);
    await expect(plate.locator('.lc-plate-glyph svg')).toHaveAttribute('aria-hidden', 'true');
  }
  await expect(page.locator('.lc-plate[data-layout="band"][data-kind="error"]')).toHaveCSS('background-color', /rgb/);
  // Legacy UnavailableState without an explicit classification asserts no cause.
  const unclassified = page.locator('.lc-plate', { has: page.getByRole('heading', { name: 'Example source needs review' }) });
  await expect(unclassified).toHaveAttribute('data-kind', 'unavailable');
  await expect(unclassified).not.toContainText(/Unsupported|Permission denied|Approval needed|Done/);
  // Errors are not live-announced unless the caller opts in.
  await expect(page.locator('.lc-plate[data-kind="error"] [role="status"]')).toHaveCount(0);
  await expect(page.getByText('Loading example commands…')).toHaveAttribute('role', 'status');
  await expect(page.locator('.lc-loading .lc-loading-mark svg')).toBeVisible();
  for (const appearance of ['dark', 'light'] as const) {
    await page.getByRole('button', { name: appearance === 'dark' ? 'Dark' : 'Light', exact: true }).click();
    const band = page.locator('.preview-bands');
    await band.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidence}/states-${appearance}.png`, clip: (await page.locator('.preview-bands').locator('..').boundingBox())! });
  }
});

test('buttons: ghost variant, primary keycaps and aria-keyshortcuts without registering handlers', async ({ page }) => {
  const save = page.getByRole('button', { name: 'Save changes', exact: true });
  await expect(save).toHaveAttribute('aria-keyshortcuts', 'Enter');
  await expect(save.locator('kbd')).toHaveText(['Enter']);
  const actions = page.getByRole('button', { name: 'Actions', exact: true });
  await expect(actions).toHaveAttribute('data-variant', 'ghost');
  await expect(actions).toHaveAttribute('aria-keyshortcuts', 'Control+K');
  await expect(actions.locator('kbd')).toHaveText(['Ctrl', 'K']);
  await expect(actions).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  // Display-only: pressing the advertised chord elsewhere does nothing in the primitives.
  await page.locator('body').press('Control+k');
  await expect(page.getByText('No changes saved.', { exact: true })).toBeVisible();
});

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
  await expect(page.locator('.lc-loading .lc-spin')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.lc-row').first()).toHaveCSS('transition-duration', '0s');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('.lc-theme')).toHaveAttribute('data-lc-theme', 'light');
  await page.screenshot({ path: `${evidence}/light-reduced-motion.png`, fullPage: true });
});

test('200 percent text scaling and narrow viewport preserve labels, wrapping and actions', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 1100 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.getByLabel('Collection name', { exact: false })).toHaveCSS('font-size', '28px');
  // Rows and captions grow with text (minimum, not fixed, heights) and do not clip vertically.
  for (const element of await page.locator('.lc-row, .lc-group-caption').all()) {
    const metrics = await element.evaluate(node => ({ height: node.getBoundingClientRect().height, clipped: node.scrollHeight > node.clientHeight + 1 }));
    expect(metrics.clipped).toBe(false);
    expect(metrics.height).toBeGreaterThanOrEqual(56);
  }
  for (const option of await page.getByRole('option').all()) expect(await option.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(80);
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

test('480 px row at 200 percent text wraps the trailing accessory and keycaps inside the row', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 1100 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.fonts.check('28px Inter') && document.fonts.check('24px "JetBrains Mono"'))).toBe(true);
  const narrow = page.locator('.preview-narrow');
  await narrow.evaluate(element => { element.style.inlineSize = '480px'; });
  const row = narrow.locator('.lc-row');
  await row.scrollIntoViewIfNeeded();
  const layout = await row.evaluate(element => {
    const box = element.getBoundingClientRect();
    const children = Array.from(element.querySelectorAll<HTMLElement>('*')).map(child => ({ name: `${child.tagName}.${child.className}`, rect: child.getBoundingClientRect() }));
    return {
      width: box.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      outside: children.filter(child => child.rect.left < box.left - 0.5 || child.rect.right > box.right + 0.5).map(child => child.name),
      caps: Array.from(element.querySelectorAll('kbd'), cap => ({ text: cap.textContent, fits: cap.scrollWidth <= cap.clientWidth })),
      accessorySize: getComputedStyle(element.querySelector('.lc-row-accessory')!).fontSize,
      rail: getComputedStyle(element, '::before').height,
    };
  });
  expect(layout.width).toBe(480);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.outside).toEqual([]);
  expect(layout.caps).toEqual([{ text: 'Alt', fits: true }, { text: 'Shift', fits: true }, { text: 'F', fits: true }]);
  expect(layout.accessorySize).toBe('24px');
  expect(parseFloat(layout.rail)).toBeGreaterThan(0);
  await expect(row).toContainText('Temporarily unavailable');
  await page.screenshot({ path: `${evidence}/narrow-row-200-percent.png`, clip: (await narrow.boundingBox())! });
});

test('forced colors retain native control boundaries and visible keyboard focus', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  const field = page.getByLabel('Collection name', { exact: false });
  await field.focus();
  await expect(field).toHaveCSS('outline-style', 'solid');
  await expect(field).toHaveCSS('border-top-style', 'solid');
  const selected = page.getByRole('option', { selected: true });
  await expect(selected).toHaveCSS('outline-style', 'solid');
  await expect(page.locator('.lc-glyph-tile').first()).toHaveCSS('border-top-style', 'solid');
  await expect(page.locator('.lc-plate[data-layout="band"]').first()).toHaveCSS('border-top-style', 'solid');
  await page.screenshot({ path: `${evidence}/forced-colors.png`, fullPage: true });
});
