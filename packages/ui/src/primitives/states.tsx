import { useId } from 'react';
import type { ReactNode } from 'react';

interface StateProps { title: string; description?: string; action?: ReactNode }
function State({ title, description, action, kind, announce = false }: StateProps & { kind: 'empty' | 'error' | 'unavailable'; announce?: boolean }) {
  const id = useId();
  return <section className="lc-state" data-kind={kind} aria-labelledby={id}>
    <div role={announce ? 'status' : undefined} aria-live={announce ? 'polite' : undefined} aria-atomic={announce || undefined}>
      <h2 id={id} className="lc-state-title">{title}</h2>
      {description && <p className="lc-state-description">{description}</p>}
    </div>
    {action && <div className="lc-state-action">{action}</div>}
  </section>;
}
export function EmptyState(props: StateProps) { return <State {...props} kind="empty" />; }
export function ErrorState(props: StateProps & { announce?: boolean }) { return <State {...props} kind="error" />; }
export function UnavailableState(props: StateProps) { return <State {...props} kind="unavailable" />; }
export function LoadingState({ label = 'Loading…', action, announce = true }: { label?: string; action?: ReactNode; announce?: boolean }) {
  return <div className="lc-loading">
    <span className="lc-loading-mark" aria-hidden="true" />
    <span role={announce ? 'status' : undefined} aria-live={announce ? 'polite' : undefined}>{label}</span>
    {action && <div className="lc-state-action">{action}</div>}
  </div>;
}
