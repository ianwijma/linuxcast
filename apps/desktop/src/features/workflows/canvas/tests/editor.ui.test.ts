import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer, type ViteDevServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
test.describe.configure({ mode: 'serial' });
let server: ViteDevServer, url: string;
const evidence = fileURLToPath(new URL('../evidence/instrument/', import.meta.url));
test.beforeAll(async () => { server = await createServer({ configFile: false, root: fileURLToPath(new URL('../fixtures/', import.meta.url)), esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 0, fs: { allow: [fileURLToPath(new URL('../../../../../../../../', import.meta.url))] } }, logLevel: 'silent' }); await server.listen(); const address = server.httpServer!.address(); if (!address || typeof address === 'string') throw new Error(); url = `http://127.0.0.1:${address.port}`; await mkdir(evidence, { recursive: true }); });
test.afterAll(async () => { await server?.close(); });
async function ready(page: Page, suffix = '') { await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(url + suffix); await expect(page.getByRole('heading', { name: 'Workflow editor', exact: true })).toBeVisible(); await page.evaluate(() => document.fonts.ready); await expect(page.getByRole('button', { name: 'New workflow', exact: true })).toBeVisible(); }
async function fresh(page: Page) { await page.getByRole('button', { name: 'New workflow', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Workflow name', exact: true })).toBeFocused(); }
async function add(page: Page, title: string) { await page.getByRole('button', { name: `Add ${title}`, exact: false }).click(); await expect(page.getByRole('textbox', { name: 'Node label', exact: true })).toBeFocused(); }
async function connect(page: Page, from: string, to: string) { await page.getByRole('combobox', { name: 'Connection source', exact: true }).selectOption(from); await page.getByRole('combobox', { name: 'Connection target', exact: true }).selectOption(to); await page.getByRole('button', { name: 'Connect nodes', exact: true }).click(); }
for (const theme of ['dark', 'light']) test(`${theme} empty editor is honest, accessible and never writes or runs on load`, async ({ page }) => {
  await ready(page, `?theme=${theme}`); await expect(page.getByRole('button', { name: 'Run unavailable' })).toBeDisabled(); await expect(page.locator('output')).toHaveText('Observed owner writes: 0. No execution requests.'); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); await page.screenshot({ path: `${evidence}/${theme}-workflow-empty.png`, fullPage: true });
});
for (const theme of ['dark', 'light']) test(`${theme} keyboard add configure connect delete and undo uses real graph schemas`, async ({ page }) => {
  await ready(page, `?theme=${theme}`); await fresh(page); await page.getByRole('textbox', { name: 'Workflow name', exact: true }).fill('Public trim workflow'); await page.getByRole('button', { name: /^Add Keyword/ }).focus(); await page.keyboard.press('Enter'); const label = page.getByRole('textbox', { name: 'Node label', exact: true }); await expect(label).toBeFocused(); await label.fill('Public start'); await page.getByRole('textbox', { name: 'Keyword', exact: true }).fill('public'); await page.getByRole('combobox', { name: 'Argument', exact: true }).selectOption('optional'); await page.getByRole('checkbox', { name: 'Trim query' }).check(); await add(page, 'Transform text'); await page.getByRole('combobox', { name: 'Text operation', exact: true }).selectOption('upper'); await page.getByRole('textbox', { name: 'Locale (optional)', exact: true }).fill('en'); await add(page, 'Copy text'); await expect(page.getByText('Clipboard execution unavailable', { exact: true })).toBeVisible(); await connect(page, 'node-1', 'node-2'); await connect(page, 'node-2', 'node-3'); await expect(page.getByRole('button', { name: /^Remove connection edge-/ })).toHaveCount(2); await expect(page.locator('.react-flow__node')).toHaveCount(3); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); await page.screenshot({ path: `${evidence}/${theme}-workflow-editing.png`, fullPage: true }); await page.getByRole('button', { name: 'Delete node', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Workflow name', exact: true })).toBeFocused(); await expect(page.getByRole('button', { name: /^Remove connection edge-/ })).toHaveCount(1); await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('.react-flow__node')).toHaveCount(3); await page.getByRole('button', { name: 'Save workflow', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Workflow saved'); await page.getByRole('button', { name: 'Run unavailable' }).isDisabled();
});
test('palette has seven categories, local search and visible missing categories', async ({ page }) => {
  await ready(page); await fresh(page); for (const name of ['Triggers', 'Inputs', 'Actions', 'Automations', 'User Interface', 'Utilities', 'Outputs']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible(); await page.getByRole('searchbox', { name: 'Search node palette', exact: true }).fill('trim'); await expect(page.getByRole('button', { name: /^Add Transform text/ })).toBeVisible(); await expect(page.getByRole('button', { name: /^Add Keyword/ })).toHaveCount(0); await expect(page.getByText('Nodes in this category are not available yet.', { exact: true })).toHaveCount(4);
});
for (const theme of ['dark', 'light']) test(`${theme} invalid connection is rejected with recovery and no false edge`, async ({ page }) => {
  await ready(page, `?theme=${theme}`); await fresh(page); await add(page, 'Transform text'); await add(page, 'Copy text'); await connect(page, 'node-1', 'node-2'); await connect(page, 'node-2', 'node-1'); await expect(page.getByRole('alert')).toContainText('Connection rejected'); await expect(page.getByRole('button', { name: /^Remove connection edge-/ })).toHaveCount(1); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); await page.screenshot({ path: `${evidence}/${theme}-workflow-invalid-connection.png`, fullPage: true }); await page.getByRole('button', { name: 'Remove connection edge-1' }).click(); await connect(page, 'node-2', 'node-1'); await expect(page.getByRole('button', { name: /^Remove connection edge-/ })).toHaveCount(1);
});
test('invalid keyword draft persists but Save remains a truthful validation failure', async ({ page }) => {
  await ready(page); await fresh(page); await add(page, 'Keyword'); await page.getByRole('textbox', { name: 'Keyword', exact: true }).fill('invalid space'); await expect(page.getByRole('textbox', { name: 'Keyword', exact: true })).toHaveAttribute('aria-invalid', 'true'); await page.getByRole('button', { name: 'Save workflow', exact: true }).click(); await expect(page.getByRole('alert').first()).toContainText('not valid'); await expect(page.getByText('Draft stored locally', { exact: true })).toBeVisible();
});
for (const theme of ['dark', 'light']) test(`${theme} unknown write retains editable draft, stops autosave and confirms Reload`, async ({ page }) => {
  await ready(page, `?state=unknown&theme=${theme}`); await fresh(page); await page.getByRole('textbox', { name: 'Workflow name', exact: true }).fill('Retained public draft'); await page.getByRole('button', { name: 'Save workflow', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('could not be confirmed'); await expect(page.getByRole('button', { name: 'Save workflow', exact: true })).toBeDisabled(); await page.getByRole('textbox', { name: 'Workflow name', exact: true }).fill('Still editable'); await page.waitForTimeout(600); await expect(page.locator('output')).toHaveText('Observed owner writes: 1. No execution requests.'); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); await page.screenshot({ path: `${evidence}/${theme}-workflow-write-error.png`, fullPage: true }); await page.getByRole('button', { name: 'Reload', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Replace local edits?' })).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('textbox', { name: 'Workflow name', exact: true })).toHaveValue('Still editable'); await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeFocused(); await page.getByRole('button', { name: 'Reload', exact: true }).click(); await page.getByRole('button', { name: 'Reload stored draft', exact: true }).click(); await expect(page.getByRole('button', { name: 'New workflow', exact: true })).toBeVisible();
});
test('native close request flushes latest draft; failed flush exposes explicit discard without retry', async ({ page }) => {
  await ready(page, '?state=pending'); await fresh(page); await page.getByRole('textbox', { name: 'Workflow name', exact: true }).fill('Close public'); await page.getByRole('button', { name: 'Request window close', exact: true }).click(); await expect(page.getByText('Fixture editor closed.', { exact: true })).toBeVisible(); await expect(page.locator('output')).toHaveText('Observed owner writes: 1. No execution requests.'); await ready(page, '?state=unknown'); await fresh(page); await page.getByRole('button', { name: 'Close editor', exact: true }).click(); await expect(page.getByRole('heading', { name: 'The editor is still open', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Discard and close', exact: true }).click(); await page.getByRole('button', { name: 'Close without saving', exact: true }).click(); await expect(page.getByText('Fixture editor closed.', { exact: true })).toBeVisible(); await expect(page.locator('output')).toHaveText('Observed owner writes: 1. No execution requests.');
});
test('Revert dirty confirmation retains focus/cancel; explicit revert restores saved version', async ({ page }) => {
  await ready(page); await fresh(page); await page.getByRole('textbox', { name: 'Workflow name', exact: true }).fill('Saved public'); await page.getByRole('button', { name: 'Save workflow', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Workflow saved'); await page.getByRole('textbox', { name: 'Workflow name', exact: true }).fill('Unsent'); await page.getByRole('button', { name: 'Revert', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Revert this draft?' })).toBeVisible(); await page.getByRole('button', { name: 'Keep editing', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Workflow name', exact: true })).toHaveValue('Unsent'); await page.getByRole('button', { name: 'Revert', exact: true }).click(); await page.getByRole('button', { name: 'Revert draft', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Workflow name', exact: true })).toHaveValue('Saved public');
});
test('200 percent text keeps structured editing and controls within the document', async ({ page }) => {
  await ready(page); await page.setViewportSize({ width: 1000, height: 1100 }); await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await fresh(page); await add(page, 'Keyword'); await add(page, 'Transform text'); await connect(page, 'node-1', 'node-2'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); await page.getByRole('button', { name: 'Save workflow', exact: true }).focus(); await expect(page.getByRole('button', { name: 'Save workflow', exact: true })).toBeFocused(); await page.screenshot({ path: `${evidence}/dark-workflow-200-percent.png`, fullPage: true });
});

// Instrument composition regressions: outcomes, keyboard and geometry rather than CSS hooks.
test('canvas nodes are keyboard buttons whose selection survives edits and matches the structured list', async ({ page }) => {
  await ready(page); await fresh(page); await add(page, 'Keyword'); await add(page, 'Transform text');
  const first = page.locator('.react-flow__node[data-id="node-1"]');
  await expect(first).toHaveAttribute('role', 'button'); await expect(first).toHaveAttribute('aria-pressed', 'false');
  await first.focus(); await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed', 'true'); await expect(page.getByRole('textbox', { name: 'Node label', exact: true })).toHaveValue('Keyword');
  await expect(page.getByRole('button', { name: /^Keyword · node-1/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('textbox', { name: 'Node label', exact: true }).fill('Renamed public start');
  await expect(first).toHaveAttribute('aria-pressed', 'true'); await expect(first).toContainText('Renamed public start');
  await expect(page.getByRole('button', { name: /^Renamed public start · node-1/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.react-flow__node[data-id="node-2"]')).toHaveAttribute('aria-pressed', 'false');
  // The node name comes from its visible card text: category, title, configuration and typed ports.
  await expect(first).toHaveAccessibleName(/Inputs.*Renamed public start.*text required.*Start → out · text/);
});
test('header shortcuts are shown only where bound and receipts are never a success plate', async ({ page }) => {
  await ready(page); await fresh(page);
  await expect(page.getByRole('button', { name: 'Save workflow', exact: true })).toHaveAttribute('aria-keyshortcuts', 'Control+S');
  await expect(page.getByRole('button', { name: 'Close editor', exact: true })).toHaveAttribute('aria-keyshortcuts', 'Escape');
  for (const name of ['Run unavailable', 'Revert', 'Reload', 'Undo', 'Redo']) expect(await page.getByRole('button', { name, exact: true }).getAttribute('aria-keyshortcuts')).toBeNull();
  await page.getByRole('textbox', { name: 'Workflow name', exact: true }).fill('Shortcut public');
  await page.getByRole('textbox', { name: 'Workflow name', exact: true }).press('Control+s');
  await expect(page.getByRole('alert')).toHaveText('Workflow saved.'); await expect(page.locator('[data-kind="success"]')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Workflow name', exact: true })).toBeFocused();
  await expect(page.getByText('Draft stored locally', { exact: true })).toBeVisible();
});
test('240 px palette rows and every keyboard target stay inside their panels at normal and 200% text', async ({ page }) => {
  for (const [width, scale] of [[1440, '100%'], [1000, '200%'], [600, '100%']] as const) {
    await ready(page); await page.setViewportSize({ width, height: 1000 }); await page.evaluate(value => { document.documentElement.style.fontSize = value; }, scale); await fresh(page); await add(page, 'Keyword'); await add(page, 'Copy text');
    const result = await page.evaluate(() => {
      const palette = document.querySelector('[aria-label="Node palette"]')!.getBoundingClientRect(), inspector = document.querySelector('[aria-label="Node inspector"]')!.getBoundingClientRect();
      const inside = (outer: DOMRect, inner: DOMRect) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1;
      const items = [...document.querySelectorAll('.wf-palette-item')].map(item => inside(palette, item.getBoundingClientRect()) && item.scrollWidth <= item.clientWidth + 1);
      const controls = [...document.querySelectorAll('[aria-label="Node inspector"] :is(button,input,select)')].map(item => inside(inspector, item.getBoundingClientRect()));
      return { items, controls, paletteWidth: palette.width, documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth };
    });
    expect(result.items.length).toBe(3); expect(result.items.every(Boolean)).toBe(true); expect(result.controls.every(Boolean)).toBe(true); expect(result.documentFits).toBe(true);
    if (width === 1440) expect(Math.round(result.paletteWidth)).toBeLessThanOrEqual(260);
  }
});
for (const theme of ['dark', 'light']) test(`${theme} forced colors and reduced motion keep selection, focus and boundaries visible`, async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' }); await ready(page, `?theme=${theme}`); await fresh(page); await add(page, 'Keyword'); await add(page, 'Transform text'); await connect(page, 'node-1', 'node-2');
  const selected = page.locator('.react-flow__node[data-id="node-2"] .wf-node');
  expect(await selected.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  await page.getByRole('button', { name: /^Add Transform text/ }).focus(); await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: /^Add Copy text/ })).toBeFocused();
  expect(await page.getByRole('button', { name: /^Add Copy text/ }).evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  expect(await page.locator('.wf-workspace').evaluate(element => getComputedStyle(element).transitionDuration)).toMatch(/^0s/);
  /* axe compares authored colours with the forced canvas; forced-colour checks use computed system styles. */ await page.screenshot({ path: `${evidence}/${theme}-workflow-forced-colors-focus.png`, fullPage: true });
});
test('200 percent text keeps the focused structured node row and selected canvas node visible', async ({ page }) => {
  await ready(page); await page.setViewportSize({ width: 1000, height: 1100 }); await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await fresh(page); await add(page, 'Keyword'); await add(page, 'Transform text'); await add(page, 'Copy text'); await connect(page, 'node-1', 'node-2');
  const row = page.getByRole('button', { name: /^Transform text · node-2/ }); await row.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Node label', exact: true })).toBeFocused(); await row.focus(); await expect(row).toBeFocused();
  const box = await row.boundingBox(); expect(box && box.width > 0 && box.height > 0).toBe(true);
  expect(await row.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); await page.screenshot({ path: `${evidence}/dark-workflow-200-percent-focus.png`, fullPage: true });
});

// Text-size projection regressions: cards follow rem tokens, stored positions stay numeric and exact.
type Box = { left: number; top: number; right: number; bottom: number };
async function canvasGeometry(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element): Box => { const rect = element.getBoundingClientRect(); return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }; };
    return { nodes: [...document.querySelectorAll('.react-flow__node')].map(box), labels: [...document.querySelectorAll('.react-flow .wf-edge-label')].map(element => ({ ...box(element), text: element.textContent, title: element.getAttribute('title') })) };
  });
}
const overlaps = (a: Box, b: Box) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
const storedGraph = async (page: Page) => JSON.parse((await page.locator('pre[data-observe="stored-graph"]').textContent()) || 'null') as { positions: Record<string, { x: number; y: number }>; viewport: unknown; nodes: unknown[]; edges: unknown[] };
const writes = async (page: Page) => Number(/writes: (\d+)/.exec((await page.locator('output').first().textContent()) ?? '')?.[1]);
async function buildChain(page: Page) { await fresh(page); await add(page, 'Keyword'); await add(page, 'Transform text'); await add(page, 'Copy text'); await connect(page, 'node-1', 'node-2'); await connect(page, 'node-2', 'node-3'); }
for (const scale of ['100%', '200%']) test(`${scale} root text: default cards and typed edge labels never overlap and labels stay reachable`, async ({ page }) => {
  await ready(page); await page.evaluate(value => { document.documentElement.style.fontSize = value; }, scale); await buildChain(page);
  await expect.poll(async () => { const { nodes } = await canvasGeometry(page); return nodes.length === 3 && !nodes.some((a, i) => nodes.some((b, j) => i < j && overlaps(a, b))); }, { message: 'cards overlap' }).toBe(true);
  await expect(page.locator('.react-flow .wf-edge-label')).toHaveCount(2);
  await expect.poll(async () => { const { nodes, labels } = await canvasGeometry(page); return nodes.length === 3 && labels.length === 2 && !nodes.some((a, i) => nodes.some((b, j) => i < j && overlaps(a, b))) && !labels.some(label => nodes.some(node => overlaps(label, node))); }).toBe(true);
  const { labels } = await canvasGeometry(page); expect(labels.map(label => [label.text, label.title])).toEqual([['text', 'text connection'], ['text', 'text connection']]);
  const edge = page.locator('.react-flow__edge').first(); await edge.focus(); await expect(edge).toBeFocused(); await expect(edge).toHaveAccessibleName(/^Connection node-\d out to node-\d in · text$/);
  await expect(page.locator('.react-flow__node[data-id="node-1"] .react-flow__handle-right')).toHaveAttribute('aria-label', 'text output out');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `${evidence}/dark-workflow-canvas-labels-${scale === '100%' ? '100' : '200'}-percent.png`, fullPage: true });
});
test('text resizing never writes or changes stored layout, viewport, undo or the execution graph; pointer moves map back exactly', async ({ page }) => {
  await ready(page); await buildChain(page); await page.waitForTimeout(700);
  const before = await storedGraph(page), count = await writes(page), factor100 = Number(await page.locator('.wf-canvas').getAttribute('data-projection'));
  expect(before.edges).toHaveLength(2); await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled(); await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect.poll(async () => Number(await page.locator('.wf-canvas').getAttribute('data-projection'))).toBeGreaterThan(factor100 * 1.5);
  await page.waitForTimeout(700); expect(await writes(page)).toBe(count); expect(await storedGraph(page)).toEqual(before);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled(); await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
  // Pointer drag in the projected canvas stores the exact inverse (screen delta / zoom / factor).
  const factor = Number(await page.locator('.wf-canvas').getAttribute('data-projection'));
  const zoom = await page.locator('.react-flow__viewport').evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
  const node = page.locator('.react-flow__node[data-id="node-1"]'), start = (await node.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down(); await page.mouse.move(start.x + start.width / 2 + 60, start.y + start.height / 2 + 30, { steps: 6 }); await page.mouse.move(start.x + start.width / 2 + 120, start.y + start.height / 2 + 60, { steps: 6 }); await page.mouse.up();
  const end = (await node.boundingBox())!; await page.waitForTimeout(700);
  const moved = await storedGraph(page);
  expect(moved.positions['node-1']!.x - before.positions['node-1']!.x).toBeCloseTo((end.x - start.x) / zoom / factor, 0);
  expect(moved.positions['node-1']!.y - before.positions['node-1']!.y).toBeCloseTo((end.y - start.y) / zoom / factor, 0);
  expect(moved.positions['node-2']).toEqual(before.positions['node-2']); expect(moved.positions['node-3']).toEqual(before.positions['node-3']); expect(moved.nodes).toEqual(before.nodes); expect(moved.edges).toEqual(before.edges);
  // Keyboard selection still works on projected nodes; Undo restores the stored (not projected) position.
  const second = page.locator('.react-flow__node[data-id="node-2"]'); await second.focus(); await page.keyboard.press('Enter'); await expect(second).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.waitForTimeout(700);
  expect((await storedGraph(page)).positions).toEqual(before.positions);
  const settled = await writes(page); await page.evaluate(() => { document.documentElement.style.fontSize = ''; }); await page.waitForTimeout(700);
  expect(await writes(page)).toBe(settled); expect((await storedGraph(page)).positions).toEqual(before.positions);
});

// One coordinate frame per pointer gesture: a text-size change while a drag is held must not rescale its release.
const projection = async (page: Page) => Number(await page.locator('.wf-canvas').getAttribute('data-projection'));
const viewportZoom = (page: Page) => page.locator('.react-flow__viewport').evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
async function centre(page: Page, id: string) { const box = (await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox())!; return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; }
/** Card top-left relative to the React Flow pane: survives page reflow and card-size changes. */
async function paneOrigin(page: Page, id: string) { return page.evaluate(nodeId => { const pane = document.querySelector('.react-flow')!.getBoundingClientRect(), node = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`)!.getBoundingClientRect(); return { x: node.left - pane.left, y: node.top - pane.top }; }, id); }
async function resizeRootText(page: Page, value: string, minimumCardWidth: number) {
  await page.evaluate(size => { document.documentElement.style.fontSize = size; }, value);
  await expect.poll(() => page.locator('.wf-canvas-probe [data-probe="card"]').evaluate(element => (element as HTMLElement).offsetWidth)).toBeGreaterThanOrEqual(minimumCardWidth);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
test('text resize during a held pointer drag keeps the exact settled stored point, writes, undo and graph on release', async ({ page }) => {
  await ready(page); await buildChain(page); await page.waitForTimeout(700);
  const initial = await storedGraph(page), start = await centre(page, 'node-2');
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 20, start.y + 10, { steps: 4 }); await page.mouse.move(start.x + 40, start.y + 20, { steps: 4 });
  await page.waitForTimeout(700); // the held drag settles through ordinary autosave
  const settled = await storedGraph(page), count = await writes(page);
  expect(settled.positions['node-2']).not.toEqual(initial.positions['node-2']);
  await resizeRootText(page, '200%', 400);
  await page.mouse.up(); await page.waitForTimeout(700);
  const released = await storedGraph(page);
  expect(released.positions).toEqual(settled.positions); expect(await writes(page)).toBe(count);
  expect(released.nodes).toEqual(initial.nodes); expect(released.edges).toEqual(initial.edges); expect(released.viewport).toEqual(initial.viewport);
  await expect.poll(() => projection(page)).toBeGreaterThan(2); // the new frame applies only after release
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.waitForTimeout(700);
  const undone = (await storedGraph(page)).positions['node-2']!; // one drag step back, still in the stored frame
  expect(undone.x).toBeGreaterThanOrEqual(initial.positions['node-2']!.x - 0.001); expect(undone.x).toBeLessThan(settled.positions['node-2']!.x);
  expect(undone.y).toBeGreaterThanOrEqual(initial.positions['node-2']!.y - 0.001); expect(undone.y).toBeLessThanOrEqual(settled.positions['node-2']!.y);
});
test('controls: 100% drag, resize with further pointer motion, and keyboard move use the gesture frame; Undo restores exactly', async ({ page }) => {
  await ready(page); await buildChain(page); await page.waitForTimeout(700);
  const initial = await storedGraph(page), f100 = await projection(page), zoom = await viewportZoom(page);
  // Ordinary 100% drag stores screen delta / zoom / f.
  let from = await centre(page, 'node-1'); await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x + 50, from.y + 25, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(700);
  const to = await centre(page, 'node-1'); let stored = await storedGraph(page);
  expect(to.x - from.x).toBeGreaterThan(30);
  expect(stored.positions['node-1']!.x - initial.positions['node-1']!.x).toBeCloseTo((to.x - from.x) / zoom / f100, 1); expect(stored.positions['node-1']!.y - initial.positions['node-1']!.y).toBeCloseTo((to.y - from.y) / zoom / f100, 1);
  // Resize while held, then keep moving: the whole gesture stays in its start frame.
  const before3 = stored.positions['node-3']!, start3 = await paneOrigin(page, 'node-3'); from = await centre(page, 'node-3');
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x + 40, from.y + 20, { steps: 6 });
  await resizeRootText(page, '200%', 400);
  await page.mouse.move(from.x + 70, from.y + 35, { steps: 6 }); const drawn = await paneOrigin(page, 'node-3'); // still drawn in the gesture frame
  await page.mouse.up(); await page.waitForTimeout(700);
  stored = await storedGraph(page);
  expect(stored.positions['node-3']!.x - before3.x).toBeCloseTo((drawn.x - start3.x) / zoom / f100, 1); expect(stored.positions['node-3']!.y - before3.y).toBeCloseTo((drawn.y - start3.y) / zoom / f100, 1);
  expect(stored.positions['node-3']!.x).toBeGreaterThan(before3.x);
  expect(stored.nodes).toEqual(initial.nodes); expect(stored.edges).toEqual(initial.edges);
  // Keyboard move at 200% stores the display step divided by the current frame; Undo restores exactly.
  const f200 = await projection(page); expect(f200).toBeGreaterThan(2);
  const second = page.locator('.react-flow__node[data-id="node-2"]'); await second.focus(); await page.keyboard.press('Enter'); await expect(second).toHaveAttribute('aria-pressed', 'true');
  const beforeKey = (await storedGraph(page)).positions; await page.keyboard.press('ArrowRight'); await page.waitForTimeout(700);
  const keyed = (await storedGraph(page)).positions;
  expect(keyed['node-2']!.x - beforeKey['node-2']!.x).toBeCloseTo(5 / f200, 6); expect(keyed['node-2']!.y).toBe(beforeKey['node-2']!.y);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.waitForTimeout(700);
  expect((await storedGraph(page)).positions).toEqual(beforeKey);
});
