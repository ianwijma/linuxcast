import canonical from '../../../../docs/design/tokens.json' with { type: 'json' };

/** The design contract is the only source of token values. */
export const tokens = canonical;
export type Theme = keyof typeof tokens.themes;
export type ThemeRole = keyof typeof tokens.themes.dark;
/** Closed glyph-tile vocabulary. Extensions may name a category; they never supply colours. */
export type GlyphCategory = keyof typeof tokens.glyphTiles;
export const glyphCategories = Object.freeze(Object.keys(tokens.glyphTiles)) as readonly GlyphCategory[];

const kebab = (value: string) => value.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
const rem = (value: number) => `${value / 16}rem`;

/* ---------------------------------------------------------------------------
 * Schema. Every group has an exact key set; unknown roles, raw CSS and loose
 * values are rejected so features cannot smuggle ad hoc values into the
 * contract. `scripts/validate_plan.py` mirrors these rules for documentation CI.
 * ------------------------------------------------------------------------- */
const BASE_ROLES = ['background', 'surface', 'raised', 'selection', 'border', 'text', 'muted', 'accent', 'accentText', 'focus', 'danger', 'warning', 'success'] as const;
const INSTRUMENT_ROLES = ['divider', 'controlBorder', 'selectionRail', 'userMessage', 'toolSurface', 'canvas', 'canvasDot', 'scrim', 'tintDanger', 'tintWarning', 'tintSuccess', 'tintInfo', 'glyphOnTile'] as const;
/** Only the modal scrim may carry alpha; every other role is opaque. */
const ALPHA_ROLES = new Set(['scrim']);
export const tokenSchema = Object.freeze({
  version: 2,
  topLevel: ['version', 'font', 'fontFeature', 'fontWeight', 'fontSize', 'lineHeight', 'letterSpacingEm', 'spacing', 'radius', 'layout', 'ratio', 'strokePx', 'motion', 'glyphTiles', 'themes', 'elevation'],
  font: ['ui', 'mono', 'emoji'],
  fontFeature: ['ui', 'numeric'],
  fontWeight: ['regular', 'medium', 'semibold'],
  fontSize: ['caption', 'body', 'emphasis', 'panelTitle', 'workspaceTitle'],
  lineHeight: ['caption', 'body', 'emphasis', 'panelTitle', 'workspaceTitle', 'prose'],
  letterSpacingEm: ['caption', 'groupCaption', 'workspaceTitle'],
  spacing: [4, 8, 12, 16, 20, 24, 32],
  radius: ['shell', 'popover', 'row', 'keycap'],
  layout: ['launcherWidth', 'launcherMaxHeight', 'headerHeight', 'rowHeight', 'footerHeight', 'actionPanelWidth',
    'glyphTrack', 'glyphTile', 'glyphTileSmall', 'glyphInner', 'glyphInnerSmall', 'lineIcon',
    'selectionRailWidth', 'selectionRailInset', 'focusWidth', 'hairline',
    'groupCaptionHeight', 'keyColumn', 'keycapHeight', 'keycapMinWidth', 'controlHeight', 'compactControlHeight',
    'actionRowHeight', 'actionFilterHeight', 'statePlateMaxWidth',
    'listMinWidth', 'detailMinWidth', 'gridCellMin',
    'workspaceHeaderHeight', 'workspaceSidebarWidth', 'workspaceInspectorWidth', 'workspaceMinWidth',
    'proseMeasure', 'composerMinHeight', 'workflowNodeWidth', 'workflowPortSize', 'canvasDotSpacing', 'narrowBreakpoint'],
  ratio: ['listDetail', 'listDetailMin', 'listDetailMax', 'listDetailStep'],
  strokePx: ['glyph', 'lineIcon', 'edge'],
  motion: ['stateMs', 'panelMs', 'reducedMotion', 'easing', 'panelOffset'],
  glyphTiles: ['command', 'files', 'clipboard', 'quicklink', 'ai', 'workflow', 'notes', 'system'],
  themes: ['dark', 'light'],
  themeRoles: [...BASE_ROLES, ...INSTRUMENT_ROLES],
  elevation: ['shell', 'popover', 'highlight'],
});

type Json = unknown;
const isRecord = (value: Json): value is Record<string, Json> => typeof value === 'object' && value !== null && !Array.isArray(value);
const HEX6 = /^#[0-9A-Fa-f]{6}$/;
const HEX8 = /^#[0-9A-Fa-f]{8}$/;
/** Font stacks/features: names, quotes, commas, digits and spaces only. No CSS punctuation. */
const SAFE_CSS_TEXT = /^[A-Za-z0-9 ,"'\-.]+$/;

/** Returns a list of schema violations; an empty list means the candidate is a valid token contract. */
export function validateTokens(candidate: Json): string[] {
  const errors: string[] = [];
  const fail = (message: string) => { errors.push(message); };
  const exact = (path: string, value: Json, keys: readonly string[]): value is Record<string, Json> => {
    if (!isRecord(value)) { fail(`${path}: expected object`); return false; }
    // Compare counts and individual keys; a delimiter serialisation would let "a,b" impersonate a and b.
    const actual = Object.keys(value).sort(), expected = [...keys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) { fail(`${path}: keys differ (expected ${expected.join(', ')})`); return false; }
    return true;
  };
  const int = (path: string, value: Json, min: number, max: number) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) fail(`${path}: expected integer ${min}–${max}`);
  };
  const num = (path: string, value: Json, min: number, max: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${path}: expected number ${min}–${max}`);
  };
  if (!exact('tokens', candidate, tokenSchema.topLevel)) return errors;
  const t = candidate;
  if (t.version !== tokenSchema.version) fail('version: unsupported');
  if (exact('font', t.font, tokenSchema.font)) for (const [key, value] of Object.entries(t.font))
    if (typeof value !== 'string' || !SAFE_CSS_TEXT.test(value)) fail(`font.${key}: unsafe or empty stack`);
  if (exact('fontFeature', t.fontFeature, tokenSchema.fontFeature)) for (const [key, value] of Object.entries(t.fontFeature))
    if (typeof value !== 'string' || !SAFE_CSS_TEXT.test(value)) fail(`fontFeature.${key}: unsafe value`);
  if (exact('fontWeight', t.fontWeight, tokenSchema.fontWeight)) for (const [key, value] of Object.entries(t.fontWeight)) {
    int(`fontWeight.${key}`, value, 100, 900);
    if (typeof value === 'number' && value % 100 !== 0) fail(`fontWeight.${key}: expected multiple of 100`);
  }
  const sizes = exact('fontSize', t.fontSize, tokenSchema.fontSize) ? t.fontSize : null;
  if (sizes) for (const [key, value] of Object.entries(sizes)) int(`fontSize.${key}`, value, 8, 64);
  if (exact('lineHeight', t.lineHeight, tokenSchema.lineHeight)) for (const [key, value] of Object.entries(t.lineHeight)) {
    int(`lineHeight.${key}`, value, 8, 96);
    const size = sizes?.[key === 'prose' ? 'body' : key];
    if (typeof value === 'number' && typeof size === 'number' && value < size) fail(`lineHeight.${key}: smaller than its font size`);
  }
  if (exact('letterSpacingEm', t.letterSpacingEm, tokenSchema.letterSpacingEm)) for (const [key, value] of Object.entries(t.letterSpacingEm)) num(`letterSpacingEm.${key}`, value, -0.1, 0.2);
  if (!Array.isArray(t.spacing) || t.spacing.length !== tokenSchema.spacing.length || t.spacing.some((value: Json, index) => typeof value !== 'number' || value !== tokenSchema.spacing[index])) fail('spacing: the 4 px scale is fixed');
  if (exact('radius', t.radius, tokenSchema.radius)) for (const [key, value] of Object.entries(t.radius)) int(`radius.${key}`, value, 0, 32);
  if (exact('layout', t.layout, tokenSchema.layout)) for (const [key, value] of Object.entries(t.layout)) int(`layout.${key}`, value, 1, 4096);
  if (exact('ratio', t.ratio, tokenSchema.ratio)) {
    for (const [key, value] of Object.entries(t.ratio)) num(`ratio.${key}`, value, 0.01, 0.99);
    const { listDetail, listDetailMin, listDetailMax, listDetailStep } = t.ratio as Record<string, number>;
    if (!(listDetailMin! <= listDetail! && listDetail! <= listDetailMax!)) fail('ratio.listDetail: outside min/max');
    if (!(listDetailStep! <= 0.1)) fail('ratio.listDetailStep: too large');
  }
  if (exact('strokePx', t.strokePx, tokenSchema.strokePx)) for (const [key, value] of Object.entries(t.strokePx)) num(`strokePx.${key}`, value, 0.5, 4);
  if (exact('motion', t.motion, tokenSchema.motion)) {
    int('motion.stateMs', t.motion.stateMs, 1, 400);
    int('motion.panelMs', t.motion.panelMs, 1, 400);
    int('motion.panelOffset', t.motion.panelOffset, 0, 8);
    if (t.motion.reducedMotion !== 'opacity-only-or-none') fail('motion.reducedMotion: must be opacity-only-or-none');
    const easing = t.motion.easing;
    if (!Array.isArray(easing) || easing.length !== 4 || easing.some(value => typeof value !== 'number' || !Number.isFinite(value))
      || (easing[0] as number) < 0 || (easing[0] as number) > 1 || (easing[2] as number) < 0 || (easing[2] as number) > 1) fail('motion.easing: expected cubic-bezier control points');
  }
  if (exact('glyphTiles', t.glyphTiles, tokenSchema.glyphTiles)) for (const [key, value] of Object.entries(t.glyphTiles))
    if (typeof value !== 'string' || !HEX6.test(value)) fail(`glyphTiles.${key}: expected opaque #RRGGBB`);
  if (exact('themes', t.themes, tokenSchema.themes)) for (const [name, theme] of Object.entries(t.themes)) {
    if (!exact(`themes.${name}`, theme, tokenSchema.themeRoles)) continue;
    for (const [role, value] of Object.entries(theme)) {
      const pattern = ALPHA_ROLES.has(role) ? HEX8 : HEX6;
      if (typeof value !== 'string' || !pattern.test(value)) fail(`themes.${name}.${role}: expected ${ALPHA_ROLES.has(role) ? '#RRGGBBAA' : 'opaque #RRGGBB'}`);
    }
  }
  if (exact('elevation', t.elevation, tokenSchema.themes)) for (const [name, levels] of Object.entries(t.elevation)) {
    if (!exact(`elevation.${name}`, levels, tokenSchema.elevation)) continue;
    for (const [level, layers] of Object.entries(levels)) {
      if (!Array.isArray(layers) || layers.length === 0 || layers.length > 4) { fail(`elevation.${name}.${level}: expected 1–4 layers`); continue; }
      layers.forEach((layer: Json, index) => {
        const path = `elevation.${name}.${level}[${index}]`;
        const keys = isRecord(layer) && 'inset' in layer ? ['y', 'blur', 'spread', 'color', 'inset'] : ['y', 'blur', 'spread', 'color'];
        if (!exact(path, layer, keys)) return;
        int(`${path}.y`, layer.y, -8, 64);
        int(`${path}.blur`, layer.blur, 0, 96);
        int(`${path}.spread`, layer.spread, 0, 8);
        if (typeof layer.color !== 'string' || !HEX8.test(layer.color)) fail(`${path}.color: expected #RRGGBBAA`);
        if ('inset' in layer && layer.inset !== true) fail(`${path}.inset: only true is allowed`);
      });
    }
  }
  // Generated custom properties share one namespace: a layout dimension must never shadow a colour role.
  if (isRecord(t.layout) && isRecord(t.themes) && isRecord(t.themes.dark)) {
    const roles = new Set(Object.keys(t.themes.dark).map(kebab));
    for (const key of Object.keys(t.layout)) if (roles.has(kebab(key))) fail(`layout.${key}: collides with theme role --lc-${kebab(key)}`);
  }
  return errors;
}

const contractErrors = validateTokens(canonical);
if (contractErrors.length) throw new Error(`docs/design/tokens.json violates the token schema:\n${contractErrors.join('\n')}`);

interface ShadowLayer { y: number; blur: number; spread: number; color: string; inset?: boolean }
// Decorative shadows stay in device-independent pixels; they are not layout.
const px = (value: number) => value === 0 ? '0' : `${value}px`;
const shadow = (layers: readonly ShadowLayer[]) => layers.map(layer => `${layer.inset ? 'inset ' : ''}0 ${px(layer.y)} ${px(layer.blur)} ${px(layer.spread)} ${layer.color}`).join(', ');

export function tokenCss(): string {
  const declarations = [
    ...Object.entries(tokens.font).map(([key, value]) => `--lc-font-${key}: ${value};`),
    `--lc-font-feature-ui: ${tokens.fontFeature.ui};`,
    `--lc-font-numeric: ${tokens.fontFeature.numeric};`,
    ...Object.entries(tokens.fontWeight).map(([key, value]) => `--lc-weight-${key}: ${value};`),
    ...Object.entries(tokens.fontSize).map(([key, value]) => `--lc-text-${kebab(key)}: ${rem(value)};`),
    ...Object.entries(tokens.lineHeight).map(([key, value]) => `--lc-leading-${kebab(key)}: ${rem(value)};`),
    ...Object.entries(tokens.letterSpacingEm).map(([key, value]) => `--lc-tracking-${kebab(key)}: ${value}em;`),
    ...tokens.spacing.map(value => `--lc-space-${value}: ${rem(value)};`),
    ...Object.entries(tokens.radius).map(([key, value]) => `--lc-radius-${key}: ${rem(value)};`),
    ...Object.entries(tokens.layout).map(([key, value]) => `--lc-${kebab(key)}: ${rem(value)};`),
    // Dimensionless: proportions of the available width, never converted to rem.
    ...Object.entries(tokens.ratio).map(([key, value]) => `--lc-ratio-${kebab(key)}: ${value};`),
    // Strokes stay device-independent pixels (used with non-scaling-stroke); they do not grow with text.
    ...Object.entries(tokens.strokePx).map(([key, value]) => `--lc-stroke-${kebab(key)}: ${value}px;`),
    `--lc-motion-state: ${tokens.motion.stateMs}ms;`,
    `--lc-motion-panel: ${tokens.motion.panelMs}ms;`,
    `--lc-motion-ease: cubic-bezier(${tokens.motion.easing.join(', ')});`,
    `--lc-motion-panel-offset: ${rem(tokens.motion.panelOffset)};`,
    ...Object.entries(tokens.glyphTiles).map(([key, value]) => `--lc-tile-${kebab(key)}: ${value};`),
  ];
  const themes = Object.entries(tokens.themes).map(([theme, values]) => {
    const levels = tokens.elevation[theme as Theme] as Record<string, readonly ShadowLayer[]>;
    const lines = [
      ...Object.entries(values).map(([key, value]) => `  --lc-${kebab(key)}: ${value};`),
      ...Object.entries(levels).map(([key, layers]) => `  --lc-elevation-${kebab(key)}: ${shadow(layers)};`),
    ];
    return `[data-lc-theme="${theme}"] {\n  color-scheme: ${theme};\n${lines.join('\n')}\n}\n`;
  });
  return `/* Generated from docs/design/tokens.json by tokens/generate.ts. */\n:root {\n  ${declarations.join('\n  ')}\n}\n${themes.join('')}`;
}

export function tailwindCss(): string {
  const aliases = [
    ...Object.keys(tokens.themes.dark).map(key => `--color-${kebab(key)}: var(--lc-${kebab(key)});`),
    ...Object.keys(tokens.glyphTiles).map(key => `--color-tile-${kebab(key)}: var(--lc-tile-${kebab(key)});`),
    ...Object.keys(tokens.font).map(key => `--font-${key}: var(--lc-font-${key});`),
    ...Object.keys(tokens.fontWeight).map(key => `--font-weight-${key}: var(--lc-weight-${key});`),
    ...Object.keys(tokens.fontSize).map(key => `--text-${kebab(key)}: var(--lc-text-${kebab(key)});`),
    ...Object.keys(tokens.fontSize).map(key => `--text-${kebab(key)}--line-height: var(--lc-leading-${kebab(key)});`),
    ...Object.keys(tokens.lineHeight).map(key => `--leading-${kebab(key)}: var(--lc-leading-${kebab(key)});`),
    ...Object.keys(tokens.letterSpacingEm).map(key => `--tracking-${kebab(key)}: var(--lc-tracking-${kebab(key)});`),
    ...Object.keys(tokens.radius).map(key => `--radius-${key}: var(--lc-radius-${key});`),
    ...tokens.spacing.map(value => `--spacing-${value / 4}: var(--lc-space-${value});`),
    ...Object.keys(tokens.elevation.dark).map(key => `--shadow-${kebab(key)}: var(--lc-elevation-${kebab(key)});`),
    '--ease-standard: var(--lc-motion-ease);',
  ];
  return `/* Generated semantic aliases; import after Tailwind and tokens.css. */\n@theme inline {\n  ${aliases.join('\n  ')}\n}\n`;
}
