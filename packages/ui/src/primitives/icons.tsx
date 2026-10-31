import type { ReactElement } from 'react';
import { glyphCategories } from '../tokens/index.ts';
import type { GlyphCategory } from '../tokens/index.ts';

/*
 * Original Linuxcast 16-unit line glyphs (selected Instrument direction). They are
 * static, trusted host artwork: no caller, extension or workflow can supply SVG
 * markup, paths, colours or CSS. Strokes are 1.5 px and non-scaling.
 */
const paths = {
  search: <><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></>,
  command: <><path d="M3.5 5l3 3-3 3" /><path d="M8.5 11.5h4" /></>,
  file: <><path d="M4 1.75h5l3 3v9.5H4z" /><path d="M9 1.75v3h3" /></>,
  folder: <path d="M1.75 4.25a1 1 0 011-1h3l1.5 1.5h6a1 1 0 011 1v6.5a1 1 0 01-1 1H2.75a1 1 0 01-1-1z" />,
  clipboard: <><rect x="3.5" y="3" width="9" height="11" rx="1.5" /><rect x="6" y="1.75" width="4" height="2.5" rx=".75" /></>,
  link: <><path d="M6.75 9.25l2.5-2.5" /><path d="M7.4 4.6l1.1-1.1a2.6 2.6 0 013.7 3.7l-1.1 1.1" /><path d="M8.6 11.4l-1.1 1.1a2.6 2.6 0 01-3.7-3.7l1.1-1.1" /></>,
  spark: <path d="M8 2c.5 3.2 2.1 5 5.5 6-3.4 1-5 2.8-5.5 6-.5-3.2-2.1-5-5.5-6 3.4-1 5-2.8 5.5-6z" />,
  workflow: <><circle cx="4" cy="4" r="1.75" /><circle cx="12" cy="8" r="1.75" /><circle cx="4" cy="12" r="1.75" /><path d="M5.6 4.8l4.8 2.4M10.4 8.8l-4.8 2.4" /></>,
  note: <><rect x="3" y="2" width="10" height="12" rx="1.5" /><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" /></>,
  gear: <><circle cx="8" cy="8" r="2.25" /><path d="M8 1.75v2M8 12.25v2M1.75 8h2M12.25 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4L5 11M11 5l1.4-1.4" /></>,
  check: <path d="M3.5 8.5l3 3 6-7" />,
  chevron: <path d="M6 3.5L10.5 8 6 12.5" />,
  back: <path d="M10 3.5L5.5 8l4.5 4.5" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  plus: <path d="M8 3v10M3 8h10" />,
  retry: <><path d="M13 8a5 5 0 11-1.46-3.54" /><path d="M13 2.5v2.75h-2.75" /></>,
  info: <><circle cx="8" cy="8" r="6" /><path d="M8 7.25v4M8 4.75v.01" /></>,
  // Shape-coded state glyphs: shape and an eyebrow word carry the state, never colour alone.
  stateLoading: <><circle cx="8" cy="8" r="5.75" opacity=".35" /><path className="lc-spin" d="M8 2.25a5.75 5.75 0 015.75 5.75" /></>,
  stateEmpty: <circle cx="8" cy="8" r="5.75" strokeDasharray="1.5 2.5" />,
  stateFiltered: <><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14M5 7h4" /></>,
  stateError: <><path d="M8 2.25l6.25 11H1.75z" /><path d="M8 6.5v3M8 11.25v.01" /></>,
  stateDenied: <><circle cx="8" cy="8" r="5.75" /><path d="M3.95 3.95l8.1 8.1" /></>,
  stateUnsupported: <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2" strokeDasharray="2.2 2.2" />,
  stateInterrupted: <><circle cx="8" cy="8" r="5.75" /><path d="M6.5 5.75v4.5M9.5 5.75v4.5" /></>,
  statePending: <><path d="M8 1.75l5 2v4c0 3.2-2.1 5.4-5 6.5-2.9-1.1-5-3.3-5-6.5v-4z" /><path d="M8 6v2.5M8 10.5v.01" /></>,
  stateSuccess: <><circle cx="8" cy="8" r="5.75" /><path d="M5.25 8.25l2 2 3.5-4" /></>,
} satisfies Record<string, ReactElement>;

export type LineIconName = keyof typeof paths;
export const lineIconNames = Object.freeze(Object.keys(paths)) as readonly LineIconName[];
const isLineIcon = (value: unknown): value is LineIconName => typeof value === 'string' && Object.hasOwn(paths, value);

/** Decorative 16-unit line icon in `currentColor`. Name the control, not the icon. */
export function LineIcon({ name, className = '' }: { name: LineIconName; className?: string }) {
  const glyph = isLineIcon(name) ? paths[name] : paths.info;
  return <svg className={`lc-line-icon ${className}`} viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor"
    strokeLinecap="round" strokeLinejoin="round">{glyph}</svg>;
}

const categoryIcon: Record<GlyphCategory, LineIconName> = {
  command: 'command', files: 'file', clipboard: 'clipboard', quicklink: 'link',
  ai: 'spark', workflow: 'workflow', notes: 'note', system: 'gear',
};

/** Closed-enum resolution: anything outside the eight host categories falls back to `system`. */
export function resolveGlyphCategory(value: unknown): GlyphCategory {
  return typeof value === 'string' && (glyphCategories as readonly string[]).includes(value) ? value as GlyphCategory : 'system';
}

export interface GlyphTileProps {
  /** One of the eight host categories. Unknown values render as `system`. */
  category: GlyphCategory | (string & {});
  /** Optional host glyph; defaults to the category glyph. Never caller-supplied SVG. */
  icon?: LineIconName | undefined;
  size?: 'default' | 'small';
}
/**
 * A noun marker: a category-coloured tile with a white glyph. Decorative (`aria-hidden`);
 * the row title and accessory carry type in text, so hue is never the only signal.
 */
export function GlyphTile({ category, icon, size = 'default' }: GlyphTileProps) {
  const resolved = resolveGlyphCategory(category);
  return <span className="lc-glyph-tile" data-category={resolved} data-size={size} aria-hidden="true">
    <LineIcon name={isLineIcon(icon) ? icon : categoryIcon[resolved]} />
  </span>;
}
