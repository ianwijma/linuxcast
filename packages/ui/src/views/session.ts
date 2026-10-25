import { availableActions } from './types.ts';
import { applyViewUpdate, parseViewNavigation, uiTextSchema, type ViewModel } from '@linuxcast/contracts';

export type CollectionView = Extract<ViewModel, { kind: 'list' | 'grid' }>;
export type Item = CollectionView['sections'][number]['items'][number];
export interface ViewFrame { view: ViewModel; query: string; queryRevision: number; selection: string | null; primaryAction: string | null; scroll: number }
export interface SessionSnapshot { frames: readonly ViewFrame[]; error: boolean }
export function visibleItems(frame: ViewFrame): Item[] {
  if (frame.view.kind !== 'list' && frame.view.kind !== 'grid') return [];
  const items = frame.view.sections.flatMap(section => section.items);
  const query = frame.query.toLocaleLowerCase().trim();
  return frame.view.search.mode === 'extension' || !query ? items : items.filter(item =>
    [item.title, item.subtitle ?? '', ...(item.keywords ?? [])].join(' ').toLocaleLowerCase().includes(query));
}
function frame(view: ViewModel, previous?: ViewFrame): ViewFrame {
  const collection = view.kind === 'list' || view.kind === 'grid';
  const next = { view, query: previous?.query ?? (collection ? view.search.query : ''), queryRevision: previous?.queryRevision ?? 0,
    selection: previous?.selection ?? (collection ? view.selectedId ?? null : null), primaryAction: previous?.primaryAction ?? null, scroll: previous?.scroll ?? 0 };
  const items = visibleItems(next);
  if (!items.some(item => item.id === next.selection)) next.selection = items.find(item => !item.disabledReason)?.id ?? items[0]?.id ?? null;
  const actions = availableActions(view, next.selection);
  if (next.selection !== previous?.selection || !actions.some(action => action.id === next.primaryAction)) next.primaryAction = actions[0]?.id ?? null;
  return next;
}
/** Host-owned state. Only bounded, strict JSON ViewModels enter this store.
 * Brokers still own session identity, update throttling, effect policy and cancellation. */
export class ViewSession {
  private state: SessionSnapshot = { frames: [], error: false };
  private listeners = new Set<() => void>();
  private readonly closed: (viewId: string) => void;
  constructor(initial: unknown, closed: (viewId: string) => void = () => {}) {
    this.closed = closed;
    this.navigate({ protocolVersion: 1, kind: 'push', fromViewId: null, view: initial });
  }
  getSnapshot = (): SessionSnapshot => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(frames: readonly ViewFrame[], error = false) { this.state = { frames, error }; for (const listener of this.listeners) listener(); }
  update(viewId: string, message: unknown) {
    const previous = this.state.frames.find(value => value.view.viewId === viewId);
    if (!previous) return { kind: 'discard-stale' } as const;
    try {
      const decision = applyViewUpdate(message, viewId, previous.view);
      if (decision.kind === 'applied') this.emit(this.state.frames.map(value => value === previous ? frame(decision.view, previous) : value));
      return decision;
    } catch { this.emit(this.state.frames, true); return { kind: 'invalid' } as const; }
  }
  navigate(message: unknown): boolean {
    try {
      const request = parseViewNavigation(message, this.state.frames.map(value => value.view.viewId));
      const frames = [...this.state.frames];
      let removed: ViewFrame | undefined;
      if (request.kind !== 'push') removed = frames.pop();
      if (request.kind !== 'pop') frames.push(frame(request.view));
      this.emit(frames);
      if (removed) this.closed(removed.view.viewId);
      return true;
    } catch { this.emit(this.state.frames, true); return false; }
  }
  pop() { const top = this.state.frames.at(-1); if (top) this.navigate({ protocolVersion: 1, kind: 'pop', fromViewId: top.view.viewId }); }
  setQuery(viewId: string, query: string) {
    if (!uiTextSchema.safeParse(query).success) return;
    this.emit(this.state.frames.map(value => value.view.viewId === viewId ? frame(value.view, { ...value, query, queryRevision: value.queryRevision + 1 }) : value));
  }
  select(viewId: string, selection: string) {
    this.emit(this.state.frames.map(value => value.view.viewId === viewId && visibleItems(value).some(item => item.id === selection) ? frame(value.view, { ...value, selection, primaryAction: selection === value.selection ? value.primaryAction : null }) : value));
  }
  saveScroll(viewId: string, scroll: number) {
    // Scroll does not rerender; the next immutable snapshot carries its saved value.
    const current = this.state.frames.find(value => value.view.viewId === viewId);
    if (current) current.scroll = scroll;
  }
  close() { const ids = this.state.frames.map(value => value.view.viewId); this.emit([]); ids.forEach(this.closed); }
}
