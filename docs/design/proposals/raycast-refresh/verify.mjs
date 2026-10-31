/* global document, innerWidth */
// Documentation-only review harness. Uses an existing Playwright install without
// changing the application dependency graph. See EVIDENCE.md for invocation.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const modulePath = process.env.LINUXCAST_REVIEW_PLAYWRIGHT;
const executablePath = process.env.LINUXCAST_REVIEW_CHROMIUM;
assert(modulePath && executablePath, 'Set LINUXCAST_REVIEW_PLAYWRIGHT and LINUXCAST_REVIEW_CHROMIUM');
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);
const browser = await chromium.launch({ executablePath, headless: true });
const candidates = process.argv.slice(2);
assert(candidates.length, 'Pass candidate directories: sol opus');
const results = [];
const baseline = JSON.parse(await readFile(resolve(root, '../../tokens.json'), 'utf8'));
function contrast(first, second) {
  const luminance = hex => {
    const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
try {
  for (const candidate of candidates) {
    assert(['sol', 'opus'].includes(candidate), 'Unknown candidate');
    const tokens = JSON.parse(await readFile(resolve(root, candidate, 'tokens.json'), 'utf8'));
    for (const [key, value] of Object.entries(baseline)) {
      assert.deepEqual(tokens[key], value, `${candidate}: baseline ${key} drifted`);
    }
    for (const theme of Object.values(tokens.themes)) {
      for (const surface of [theme.background, theme.surface, theme.raised, theme.selection]) {
        assert(contrast(theme.text, surface) >= 4.5, 'Base text contrast');
        assert(contrast(theme.muted, surface) >= 4.5, 'Base muted-text contrast');
        assert(contrast(theme.focus, surface) >= 3, 'Base focus contrast');
      }
      assert(contrast(theme.accentText, theme.accent) >= 4.5, 'Base accent-text contrast');
    }
    if (candidate === 'opus') {
      for (const [name, extra] of Object.entries(tokens.proposal.themes)) {
        const theme = tokens.themes[name];
        assert(contrast(extra.selectionRail, theme.selection) >= 3, 'Proposed selection rail contrast');
        for (const surface of [theme.background, theme.surface, theme.raised, theme.selection]) {
          assert(contrast(extra.controlBorder, surface) >= 3, 'Proposed control border contrast');
        }
        for (const tile of Object.values(tokens.proposal.glyphTiles)) {
          assert(contrast(extra.glyphOnTile, tile) >= 4.5, 'Proposed glyph tile contrast');
        }
      }
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const externalRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/^https?:/.test(request.url())) externalRequests.push(request.url());
    });
    const base = pathToFileURL(resolve(root, candidate, 'review.html')).href;
    const candidateView = view => candidate === 'opus' ? ({ grid: 'emoji', workflows: 'workflow' }[view] || view) : view;
    const reviewUrl = (view, state = 'default', theme = 'dark', actions = false) =>
      `${base}${candidate === 'opus' ? '#' : '?'}view=${candidateView(view)}&state=${state}&theme=${theme}${actions ? '&actions=open' : ''}`;
    const app = () => page.locator(candidate === 'sol' ? '#app' : '.shell, .ws').first();
    const stateSelect = candidate === 'sol' ? '#review-state' : '#stateSel';
    async function navigate(view, state = 'default', theme = 'dark', actions = false) {
      // File URL hash changes alone do not rerun the Opus boot function.
      if (candidate === 'opus') await page.goto('about:blank');
      await page.goto(reviewUrl(view, state, theme, actions));
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator(stateSelect).inputValue(), state, 'Requested state did not render');
      const activeView = candidate === 'sol'
        ? await page.locator('#tabs button[aria-pressed="true"]').getAttribute('data-view')
        : await page.locator('.rv-tab[aria-selected="true"]').getAttribute('data-view');
      assert.equal(activeView, candidateView(view), 'Requested view did not render');
      assert.equal(await page.evaluate(() => document.body.dataset.theme || document.documentElement.dataset.theme), theme,
        'Requested theme did not render');
    }
    const output = resolve(root, candidate, 'screenshots');
    await mkdir(output, { recursive: true });
    let combinations = 0;
    // Each artifact exposes URL state as its review automation seam.
    for (const theme of ['dark', 'light']) {
      for (const view of ['launcher', 'files', 'grid', 'chat', 'notes', 'workflows', 'settings']) {
        for (const state of ['default', 'loading', 'empty', 'error', 'denied', 'unsupported', 'interrupted']) {
          await navigate(view, state, theme);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false,
            `${candidate}/${view}/${state}/${theme}: page overflow`);
          assert((await page.locator('body').innerText()).trim().length > 200, 'Empty render');
          if (state === 'default') {
            await app().screenshot({ path: resolve(output, `${view}-${theme}.png`) });
          }
          combinations++;
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const view of ['launcher', 'files', 'grid', 'chat', 'notes', 'workflows', 'settings']) {
      await navigate(view);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false,
        `${candidate}/${view}: 390px page overflow`);
    }
    await navigate('launcher');
    await page.screenshot({ path: resolve(output, 'launcher-narrow.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const [view, state] of [['files', 'loading'], ['grid', 'empty'], ['notes', 'error'],
      ['settings', 'denied'], ['launcher', 'unsupported'], ['workflows', 'interrupted']]) {
      await navigate(view, state);
      await page.screenshot({ path: resolve(output, `${view}-${state}.png`), fullPage: true });
    }
    await navigate('launcher', 'default', 'dark', true);
    const geometry = await app().evaluate(element => ({ width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height }));
    assert.equal(geometry.width, 720, 'Launcher must be 720px at baseline');
    assert(geometry.height <= 560, 'Launcher exceeds normal-size height cap');
    await app().screenshot({ path: resolve(output, 'launcher-actions-dark.png') });
    await app().locator('input').first().focus();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    assert.equal(await page.evaluate(() => document.activeElement?.id), candidate === 'sol' ? 'action-query' : 'apq',
      'Ctrl+K must focus the action filter');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement?.id), candidate === 'sol' ? 'actions-toggle' : 'lq',
      'Escape must restore focus to the invoking control/query');
    await page.keyboard.press('Shift+Tab');
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      return element && !['BODY', 'HTML'].includes(element.tagName);
    });
    assert(focused, 'Shift+Tab must reach an interactive control from the restored footer focus');
    await navigate('launcher', 'default', 'light', true);
    await app().screenshot({ path: resolve(output, 'launcher-actions-light.png') });
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
    await navigate('launcher');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: resolve(output, 'launcher-forced-colors.png'), fullPage: true });
    assert.deepEqual(errors, [], `${candidate}: runtime errors`);
    assert.deepEqual(externalRequests, [], `${candidate}: external requests`);
    results.push({ candidate, desktopViewThemeStateCombinations: combinations,
      narrowViewsWithoutPageOverflow: 7, runtimeErrors: errors.length,
      externalRequests: externalRequests.length,
      keyboard: 'Ctrl+K action-filter focus, Escape then Shift+Tab',
      forcedColorsReducedMotion: 'render smoke check only',
      baselineTokens: 'unchanged; base text, muted, focus and accent-text contrast pass',
      proposedThemeRoles: candidate === 'opus' ? Object.keys(tokens.proposal.themes.dark).length : 0,
      launcherGeometry: geometry,
      screenshotCount: 24 });
    await page.close();
  }
  const comparison = await browser.newPage({ viewport: { width: 728, height: 1000 } });
  const comparisonErrors = [];
  comparison.on('pageerror', error => comparisonErrors.push(error.message));
  await comparison.goto(pathToFileURL(resolve(root, 'comparison.html')).href);
  for (const width of [728, 390]) {
    await comparison.setViewportSize({ width, height: 1000 });
    for (const surface of ['launcher', 'files', 'grid', 'chat', 'notes', 'workflows', 'settings']) {
      for (const theme of ['dark', 'light']) {
        await comparison.locator('#surface').selectOption(surface);
        await comparison.locator('#theme').selectOption(theme);
        assert.equal(await comparison.locator('.gallery:not([hidden]) img:not([hidden])').count(), 2);
        assert.equal(await comparison.evaluate(() => document.documentElement.scrollWidth > innerWidth), false,
          'Comparison page overflow');
      }
    }
  }
  assert(await comparison.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)),
    'A comparison screenshot is missing');
  const selection = JSON.parse(await readFile(resolve(root, 'selection.json'), 'utf8'));
  assert.equal(selection.selectedCandidate, 'opus');
  const summary = await comparison.locator('#decisions').inputValue();
  for (const name of ['Launcher & actions', 'Files', 'Emoji grid', 'AI chat', 'Notes', 'Workflow editor', 'Settings & permission']) {
    assert(summary.includes(`${name}: Opus`), 'Comparison must reflect the recorded user selection');
  }
  assert.equal(await comparison.locator('[data-choice]').count(), 0, 'Recorded decision must be read-only');
  assert.deepEqual(comparisonErrors, []);
  await comparison.close();
  await writeFile(resolve(root, 'verification-results.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), browserVersion: browser.version(),
    nodeVersion: process.version, results,
    comparison: '28 images load; all 7 surfaces × 2 themes at 728px and 390px; read-only summary records Opus for all surfaces; no script errors',
    limits: 'Chromium documentation artifacts only. No Electron, native desktop, screen-reader, backend or product acceptance claim.'
  }, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
