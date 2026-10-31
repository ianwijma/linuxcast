import { useId } from 'react';
import type { ReactNode } from 'react';
import { LineIcon } from './icons.tsx';
import type { LineIconName } from './icons.tsx';

/**
 * Shape-coded state vocabulary. Each kind has a glyph shape, an eyebrow word and a
 * semantic tone, so colour is never the only signal. Plates present caller-owned
 * copy and actions only: they never retry, grant, cancel or claim a system effect.
 */
export type StatePlateKind = 'loading' | 'empty' | 'filtered' | 'error' | 'denied' | 'unsupported' | 'interrupted' | 'pending' | 'success';
export type StatePlateLayout = 'block' | 'band';
const KINDS: Readonly<Record<StatePlateKind, { glyph: LineIconName; tone: 'muted' | 'danger' | 'warning' | 'focus' | 'success'; eyebrow: string }>> = {
  loading: { glyph: 'stateLoading', tone: 'muted', eyebrow: 'Loading' },
  empty: { glyph: 'stateEmpty', tone: 'muted', eyebrow: 'Empty' },
  filtered: { glyph: 'stateFiltered', tone: 'muted', eyebrow: 'No matches' },
  error: { glyph: 'stateError', tone: 'danger', eyebrow: 'Error' },
  denied: { glyph: 'stateDenied', tone: 'warning', eyebrow: 'Permission denied' },
  unsupported: { glyph: 'stateUnsupported', tone: 'muted', eyebrow: 'Unsupported in this session' },
  interrupted: { glyph: 'stateInterrupted', tone: 'warning', eyebrow: 'Interrupted' },
  pending: { glyph: 'statePending', tone: 'focus', eyebrow: 'Approval needed' },
  success: { glyph: 'stateSuccess', tone: 'success', eyebrow: 'Done' },
};

export interface StatePlateProps {
  kind: StatePlateKind;
  title: string;
  description?: string | undefined;
  /** Optional monospace line naming the backend or an error code. Never secrets or user content. */
  detail?: string | undefined;
  /** Overrides the default eyebrow word (for example for localisation). Keep it truthful to `kind`. */
  eyebrow?: string | undefined;
  /** Caller-owned actions: at most one primary and one secondary, plus an optional ghost. */
  action?: ReactNode | undefined;
  /** `block` centres in an empty region; `band` is a tinted inline strip that never replaces working results. */
  layout?: StatePlateLayout | undefined;
  /** Polite live announcement. Use sparingly; loading announces by default, errors only on opt-in. */
  announce?: boolean | undefined;
  headingLevel?: 2 | 3 | 4 | undefined;
}
export function StatePlate({ kind, title, description, detail, eyebrow, action, layout = 'block', announce = false, headingLevel = 2 }: StatePlateProps) {
  const id = useId();
  const meta = KINDS[kind];
  const Heading = `h${headingLevel}` as const;
  return <section className="lc-plate" data-kind={kind} data-tone={meta.tone} data-layout={layout} aria-labelledby={id}>
    <span className="lc-plate-glyph" aria-hidden="true"><LineIcon name={meta.glyph} /></span>
    <div className="lc-plate-copy" role={announce ? 'status' : undefined} aria-live={announce ? 'polite' : undefined} aria-atomic={announce || undefined}>
      <p className="lc-plate-eyebrow">{eyebrow ?? meta.eyebrow}</p>
      <Heading id={id} className="lc-plate-title">{title}</Heading>
      {description && <p className="lc-plate-description">{description}</p>}
      {detail && <p className="lc-plate-detail">{detail}</p>}
    </div>
    {action && <div className="lc-plate-action">{action}</div>}
  </section>;
}

interface StateProps { title: string; description?: string | undefined; action?: ReactNode | undefined; detail?: string | undefined; layout?: StatePlateLayout | undefined }
/** Nothing to show. `filtered` marks a query/filter that matched nothing, distinct from a truly empty source. */
export function EmptyState({ filtered = false, ...props }: StateProps & { filtered?: boolean }) {
  return <StatePlate {...props} kind={filtered ? 'filtered' : 'empty'} />;
}
export function ErrorState(props: StateProps & { announce?: boolean }) { return <StatePlate {...props} kind="error" />; }
/**
 * A capability that cannot run: `unsupported` (default) for a missing backend/session capability,
 * `denied` for a recorded permission refusal. Callers must describe the real reason and remediation.
 */
export function UnavailableState({ reason = 'unsupported', ...props }: StateProps & { reason?: 'unsupported' | 'denied' }) {
  return <StatePlate {...props} kind={reason} />;
}
/** Compact inline progress row (open-ring glyph, static under reduced motion). Announces politely by default. */
export function LoadingState({ label = 'Loading…', action, announce = true }: { label?: string; action?: ReactNode; announce?: boolean }) {
  return <div className="lc-loading" data-tone="muted">
    <span className="lc-loading-mark" aria-hidden="true"><LineIcon name="stateLoading" /></span>
    <span role={announce ? 'status' : undefined} aria-live={announce ? 'polite' : undefined}>{label}</span>
    {action && <div className="lc-state-action">{action}</div>}
  </div>;
}
