import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { glyphCategories, tailwindCss, tokenCss, tokens, validateTokens } from './index.ts';

test('committed CSS bindings stay synchronized with the canonical design contract', () => {
  expect(readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')).toBe(tokenCss());
  expect(readFileSync(new URL('./tailwind.css', import.meta.url), 'utf8')).toBe(tailwindCss());
});

test('canonical contract passes the strict schema and keeps the shared baseline values', () => {
  expect(validateTokens(tokens)).toEqual([]);
  expect(tokens.fontSize).toEqual({ caption: 12, body: 14, emphasis: 16, panelTitle: 20, workspaceTitle: 28 });
  expect(tokens.spacing).toEqual([4, 8, 12, 16, 20, 24, 32]);
  expect(tokens.radius).toEqual({ shell: 16, popover: 12, row: 8, keycap: 4 });
  expect(tokens.layout).toMatchObject({ launcherWidth: 720, launcherMaxHeight: 560, headerHeight: 56, rowHeight: 40, footerHeight: 36, actionPanelWidth: 280 });
  expect(tokens.motion).toMatchObject({ stateMs: 100, panelMs: 160, reducedMotion: 'opacity-only-or-none' });
  expect(tokens.themes.dark).toMatchObject({ background: '#111216', surface: '#1C1D22', accent: '#FF786E', focus: '#A6B9FF' });
  expect(tokens.themes.light).toMatchObject({ background: '#F2F3F6', surface: '#FFFFFF', accent: '#B92F32', focus: '#3258BD' });
  expect(glyphCategories).toEqual(['command', 'files', 'clipboard', 'quicklink', 'ai', 'workflow', 'notes', 'system']);
});

test('dimensionless ratios, pixel strokes and the alpha scrim are emitted deliberately', () => {
  const css = tokenCss();
  expect(css).toContain('--lc-ratio-list-detail: 0.42;');
  expect(css).toContain('--lc-stroke-glyph: 1.5px;');
  expect(css).toContain('--lc-row-height: 2.5rem;');
  expect(css).toContain('--lc-motion-ease: cubic-bezier(0.2, 0, 0, 1);');
  expect(css).toContain('--lc-scrim: #0A0B0EB3;');
  expect(css).not.toMatch(/--lc-ratio-[a-z-]+: [0-9.]+rem/);
  expect(tailwindCss()).toContain('--color-tile-command: var(--lc-tile-command);');
});

function luminance(hex: string): number {
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}
function contrast(first: string, second: string): number {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
for (const [name, theme] of Object.entries(tokens.themes)) {
  const surfaces = [theme.background, theme.surface, theme.raised, theme.selection];
  test(`${name} actual text/state and focus colors satisfy the contrast contract`, () => {
    for (const surface of surfaces) {
      for (const text of [theme.text, theme.muted, theme.danger, theme.warning, theme.success]) expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.focus, surface)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(theme.accentText, theme.accent)).toBeGreaterThanOrEqual(4.5);
  });
  test(`${name} Instrument roles: control border, rail, tints, workspace surfaces and glyph tiles`, () => {
    for (const surface of surfaces) {
      expect(contrast(theme.controlBorder, surface), 'controlBorder identifies a control').toBeGreaterThanOrEqual(3);
      // Decorative by design: divider must never be mistaken for the accessible control boundary.
      expect(contrast(theme.divider, surface)).toBeLessThan(contrast(theme.controlBorder, surface));
    }
    expect(contrast(theme.selectionRail, theme.selection)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.focus, theme.selection)).toBeGreaterThanOrEqual(3);
    const tints = [[theme.danger, theme.tintDanger], [theme.warning, theme.tintWarning], [theme.success, theme.tintSuccess], [theme.focus, theme.tintInfo]] as const;
    for (const [tone, tint] of tints) {
      expect(contrast(tone, tint), `tone ${tone} on ${tint}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.text, tint)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.muted, tint)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.focus, tint)).toBeGreaterThanOrEqual(3);
    }
    for (const surface of [theme.userMessage, theme.toolSurface, theme.canvas]) {
      expect(contrast(theme.text, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.muted, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.focus, surface)).toBeGreaterThanOrEqual(3);
    }
    for (const tile of Object.values(tokens.glyphTiles)) expect(contrast(theme.glyphOnTile, tile), `glyph on ${tile}`).toBeGreaterThanOrEqual(4.5);
    const alpha = parseInt(theme.scrim.slice(7), 16) / 255;
    expect(alpha).toBeGreaterThan(0.3);
    expect(alpha).toBeLessThan(0.8);
  });
}

describe('schema rejects malformed variants', () => {
  type Json = Record<string, unknown>;
  const clone = () => JSON.parse(JSON.stringify(tokens)) as Json;
  /** Walks to a nested object or array inside the mutable clone. */
  const at = (t: Json, ...path: (string | number)[]) => path.reduce<unknown>((node, key) => (node as Json)[key], t) as Json & unknown[];
  const cases: [string, (t: Json) => void, RegExp][] = [
    ['an arbitrary extra theme role', t => { at(t, 'themes', 'dark').brandGlow = '#FF00FF'; }, /themes\.dark: keys differ/],
    ['a missing Instrument role', t => { delete at(t, 'themes', 'light').controlBorder; }, /themes\.light: keys differ/],
    ['alpha on an opaque role', t => { at(t, 'themes', 'dark').surface = '#1C1D2280'; }, /themes\.dark\.surface: expected opaque/],
    ['an opaque scrim', t => { at(t, 'themes', 'dark').scrim = '#0A0B0E'; }, /themes\.dark\.scrim: expected #RRGGBBAA/],
    ['a raw CSS colour value', t => { at(t, 'themes', 'light').divider = 'rgb(0 0 0 / 10%)'; }, /themes\.light\.divider/],
    ['an unknown glyph category', t => { at(t, 'glyphTiles').custom = '#123456'; }, /glyphTiles: keys differ/],
    ['a translucent glyph tile', t => { at(t, 'glyphTiles').ai = '#B83E6680'; }, /glyphTiles\.ai/],
    ['a ratio outside its limits', t => { at(t, 'ratio').listDetail = 0.9; }, /ratio\.listDetail/],
    ['a layout dimension shadowing a colour role', t => { const layout = at(t, 'layout'); layout.selectionRail = layout.selectionRailWidth; delete layout.selectionRailWidth; }, /layout\.selectionRail: collides with theme role/],
    ['an unknown layout dimension', t => { at(t, 'layout').promoBanner = 300; }, /layout: keys differ/],
    ['a fractional layout pixel', t => { at(t, 'layout').rowHeight = 40.5; }, /layout\.rowHeight/],
    ['an off-scale spacing step', t => { at(t, 'spacing').push(6); }, /spacing/],
    ['a raw shadow string', t => { at(t, 'elevation', 'dark').shell = '0 0 4px red'; }, /elevation\.dark\.shell/],
    ['an opaque shadow colour', t => { at(t, 'elevation', 'light', 'popover', 0).color = '#1C1D24'; }, /elevation\.light\.popover\[0\]\.color/],
    ['CSS injection in a font stack', t => { at(t, 'font').ui = 'Inter; } body { display: none'; }, /font\.ui/],
    ['a line height below its size', t => { at(t, 'lineHeight').body = 12; }, /lineHeight\.body/],
    ['a changed reduced-motion policy', t => { at(t, 'motion').reducedMotion = 'full'; }, /motion\.reducedMotion/],
    ['an unsupported version', t => { t.version = 1; }, /version/],
    ['an unknown top-level group', t => { t.gradients = {}; }, /tokens: keys differ/],
  ];
  for (const [label, mutate, expected] of cases) test(label, () => {
    const candidate = clone();
    mutate(candidate);
    const errors = validateTokens(candidate);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toMatch(expected);
  });
});
