import type { ComponentPropsWithRef, ReactNode } from 'react';
import { ShortcutHint } from './controls.tsx';

export interface RowProps extends Omit<ComponentPropsWithRef<'div'>, 'title' | 'children'> {
  /** Leading glyph track (32 px): a `GlyphTile`, a line icon, or a native checkbox for multi-selection. */
  leading?: ReactNode | undefined;
  title: string;
  subtitle?: string | undefined;
  /** Render the subtitle as a 12 px monospace path. */
  subtitleMono?: boolean | undefined;
  /** Short muted accessory text or a state glyph plus its word. Never the only copy of an action. */
  accessory?: ReactNode | undefined;
  /** Display-only keycaps. The owning control must bind the shortcut and carry `aria-keyshortcuts`. */
  shortcut?: readonly string[] | undefined;
  /**
   * The keyboard cursor/current item: neutral selection fill plus the accent rail. Defaults to the
   * row's `aria-selected`/`aria-current`. Pass it explicitly for multi-select lists, where
   * `aria-selected` reports the checkbox choice and the cursor is a separate signal.
   */
  current?: boolean | undefined;
  /** Full text tooltip. Defaults to title and subtitle so visual truncation never hides the value. */
  tooltip?: string | undefined;
}

const truthy = (value: unknown) => value === true || value === 'true' || (typeof value === 'string' && value !== 'false');

/**
 * Hanging-alignment row: `glyph | title + subtitle | accessory | keys`. When space is short
 * (narrow windows, 200% text) the trailing accessory/keys wrap under the title instead of starving it.
 * Purely presentational:
 * callers supply the role (`option`, `link`, `button`…), ARIA state and handlers. The row grows
 * with text scaling (minimum, not fixed, height) and truncates visually without losing its name.
 */
export function Row({ leading, title, subtitle, subtitleMono = false, accessory, shortcut, current, tooltip, className = '', ...props }: RowProps) {
  const isCurrent = current ?? (truthy(props['aria-selected']) || truthy(props['aria-current']));
  return <div {...props} className={`lc-row lc-focus ${className}`} data-current={isCurrent || undefined} title={tooltip ?? [title, subtitle].filter(Boolean).join(' — ')}>
    <span className="lc-row-leading">{leading}</span>
    <span className="lc-row-text">
      <span className="lc-row-title" dir="auto" data-solo={!subtitle || undefined}>{title}</span>
      {subtitle && <span className="lc-row-subtitle" dir="auto" data-mono={subtitleMono || undefined}>{subtitle}</span>}
    </span>
    {(accessory !== undefined || shortcut?.length) ? <span className="lc-row-trailing">
      {accessory !== undefined && <span className="lc-row-accessory">{accessory}</span>}
      {shortcut?.length ? <span className="lc-row-keys" aria-hidden="true"><ShortcutHint keys={shortcut} /></span> : null}
    </span> : null}
  </div>;
}

export interface GroupCaptionProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  label: string;
  /** Right-aligned monospace count with tabular numerals. */
  count?: number | undefined;
  /** Flush (12 px) for sidebars and palettes instead of starting on the title column. */
  flush?: boolean;
}
/** 12 px uppercase caption that starts on the row title column. Grows with text; never clips. */
export function GroupCaption({ label, count, flush = false, className = '', ...props }: GroupCaptionProps) {
  return <div {...props} className={`lc-group-caption ${className}`} data-flush={flush || undefined}>
    <span className="lc-group-caption-label">{label}</span>
    {count !== undefined && <span className="lc-group-caption-count">{count}</span>}
  </div>;
}
