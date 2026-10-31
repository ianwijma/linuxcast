import type { ReactNode } from 'react';
import { LineIcon } from '@linuxcast/ui';
import type { LineIconName } from '@linuxcast/ui';

/*
 * Presentation-only Notes helpers (docs/design/DESIGN.md: Instrument direction, Chat and notes,
 * States and motion). They render shared host glyphs and token styles around caller-owned copy.
 * They never carry a live role themselves, never retry/confirm anything and never classify a
 * controller message beyond the tone the caller derives from structured state.
 */
export type NoteBandTone = 'neutral' | 'warning' | 'loading';

/**
 * Inline band at the top of the document or list. The caller keeps the original `role="status"`
 * or `role="alert"` element as `children`, so announcements and accessible text are unchanged.
 * `neutral` is used for fixed controller messages: it implies neither success nor failure.
 */
export function NoteBand({ tone = 'neutral', glyph, children, actions, className = '' }: { tone?: NoteBandTone; glyph?: LineIconName; children: ReactNode; actions?: ReactNode; className?: string }) {
  const icon: LineIconName = glyph ?? (tone === 'loading' ? 'stateLoading' : 'info');
  return <div className={`notes-band ${className}`} data-tone={tone}>
    <span className="notes-band-glyph" aria-hidden="true"><LineIcon name={icon} /></span>
    <div className="notes-band-copy">{children}</div>
    {actions ? <div className="notes-band-actions">{actions}</div> : null}
  </div>;
}

/** Decorative glyph placed before existing visible copy; the copy remains the accessible text. */
export function NoteGlyph({ name }: { name: LineIconName }) {
  return <span className="notes-glyph" aria-hidden="true"><LineIcon name={name} /></span>;
}
