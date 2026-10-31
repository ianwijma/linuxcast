import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Button, EmptyState, GlyphTile, GroupCaption, LineIcon, LoadingState, Row, StatePlate, TextField, ThemeProvider, UnavailableState } from '@linuxcast/ui';
import type { StatePlateKind } from '@linuxcast/ui';
import type { DataSettingsActionReply, DataSettingsApi } from '@linuxcast/contracts';
import { LOCAL_DATA_CATEGORIES, actionLabel, matchCategories } from './model.ts';
import type { CapturedAction, LocalDataActionKind, LocalDataCategory } from './model.ts';

/** Fixed preload/main failure copy for an unclassified transport or service failure. */
const GENERIC_UNAVAILABLE = 'Local data controls are unavailable.';

type Outcome =
  | { readonly status: 'busy'; readonly action: CapturedAction }
  | { readonly status: 'saved' | 'cleared' | 'cancelled' | 'opened'; readonly action: CapturedAction }
  | { readonly status: 'failed'; readonly action: CapturedAction; readonly code: string; readonly message: string }
  /** The bridge itself rejected: Linuxcast did not report an outcome. Never retried automatically. */
  | { readonly status: 'unknown'; readonly action: CapturedAction };

const busyCopy: Record<LocalDataActionKind, string> = {
  export: 'Waiting for the save dialog and the export to finish. Other data actions wait until this one ends.',
  clear: 'Waiting for your answer in the confirmation dialog and for clearing to finish. Other data actions wait until this one ends.',
  credentials: 'Opening the credential settings window.',
};

function outcomePlate(outcome: Outcome): { kind: StatePlateKind; eyebrow?: string; title: string; description?: string; detail?: string } {
  const { action } = outcome;
  const label = actionLabel(action);
  const subject = action.title;
  switch (outcome.status) {
    case 'busy':
      return { kind: 'loading', eyebrow: 'In progress', title: `${action.kind === 'export' ? 'Exporting' : action.kind === 'clear' ? 'Clearing' : 'Opening'} ${action.kind === 'credentials' ? 'credential settings' : subject.toLowerCase()}…`, description: busyCopy[action.kind] };
    case 'saved':
      return { kind: 'success', title: 'Export saved.', description: `${subject}: written to the file you chose as unencrypted JSON.` };
    case 'cleared':
      return { kind: 'success', title: 'Data cleared.', description: `${subject}: cleared. Other categories are managed separately.` };
    case 'opened':
      return { kind: 'success', title: 'Credential settings opened.', description: 'Continue in the credential settings window.' };
    case 'cancelled':
      return { kind: 'interrupted', eyebrow: 'Cancelled', title: 'Action cancelled.',
        description: action.kind === 'export' ? `${subject}: nothing was exported.` : action.kind === 'clear' ? `${subject}: nothing was cleared.` : 'Credential settings were not opened.' };
    case 'failed': {
      const kind: StatePlateKind = outcome.code === 'permission-denied' ? 'denied'
        : outcome.code === 'capability-unavailable' || outcome.message === GENERIC_UNAVAILABLE ? 'unavailable' : 'error';
      const title = action.kind === 'credentials' ? 'Credential settings could not be opened.' : `${label} did not complete.`;
      return { kind, title, description: outcome.message, detail: `code: ${outcome.code}` };
    }
    case 'unknown':
      return { kind: 'unavailable', title: 'Outcome unknown.',
        description: `Linuxcast did not report whether “${label}” finished. Check the category before trying again; nothing is retried automatically.` };
  }
}

export interface LocalDataSettingsProps {
  /** Narrow first-party preload bridge. Absent when the page is opened outside its dedicated window. */
  api: DataSettingsApi | undefined;
}

/**
 * Existing Local data window, selected Instrument settings composition (docs/design/DESIGN.md
 * "Settings and permissions", "Workspaces", "States and motion"). Presentation only: main owns native
 * save/confirmation dialogs, category allowlists, serialization, cancellation and outcomes.
 */
export function LocalDataSettings({ api }: LocalDataSettingsProps) {
  const [appearance, setAppearance] = useState<'dark' | 'light'>();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(LOCAL_DATA_CATEGORIES[0]!.id);
  const [navFocus, setNavFocus] = useState<string | undefined>();
  const [outcome, setOutcome] = useState<Outcome>();

  const search = useRef<HTMLInputElement>(null);
  const content = useRef<HTMLElement>(null);
  const navItems = useRef(new Map<string, HTMLDivElement>());
  const sections = useRef(new Map<string, HTMLElement>());
  const mounted = useRef(false);
  const loadSeq = useRef(0);
  const appearanceEvents = useRef(0);
  const tokens = useRef(0);
  /** Synchronous single-flight guard: a second Enter/click in the same frame never dispatches. */
  const inFlight = useRef<CapturedAction | null>(null);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const eventsAtStart = appearanceEvents.current;
    setFailed(false);
    if (!api) { setReady(false); setFailed(true); return; }
    let result: Awaited<ReturnType<DataSettingsApi['getState']>> | undefined;
    try { result = await api.getState(); } catch { result = undefined; }
    if (!mounted.current || seq !== loadSeq.current) return;
    if (result?.ok) {
      // A theme event that arrived while the request was pending is newer than this snapshot.
      if (appearanceEvents.current === eventsAtStart) setAppearance(result.value.appearance);
      setReady(true);
    } else { setReady(false); setFailed(true); }
  }, [api]);

  useEffect(() => {
    mounted.current = true;
    const remove = api?.onAppearance(value => { appearanceEvents.current += 1; setAppearance(value); });
    void load();
    search.current?.focus();
    return () => { mounted.current = false; loadSeq.current += 1; inFlight.current = null; remove?.(); };
  }, [api, load]);

  const visible = matchCategories(query);
  const visibleIds = visible.map(category => category.id).join(' ');
  const currentVisible = visible.some(category => category.id === current) ? current : visible[0]?.id;
  // Keep the rail on a visible category; filtering never changes the URL or triggers an action.
  useLayoutEffect(() => { if (currentVisible && currentVisible !== current) setCurrent(currentVisible); }, [current, currentVisible]);
  const previousQuery = useRef(query);
  useLayoutEffect(() => {
    if (previousQuery.current === query) return;
    previousQuery.current = query;
    // Scroll restoration: a new filter starts at the top; clearing it returns to the current category.
    if (!query.trim() && currentVisible) sections.current.get(currentVisible)?.scrollIntoView?.({ block: 'start' });
    else content.current?.scrollTo?.({ top: 0 });
  }, [query, currentVisible, visibleIds]);

  const run = (kind: LocalDataActionKind, category: LocalDataCategory) => {
    if (!api || !ready || inFlight.current) return;
    const action: CapturedAction = { token: ++tokens.current, kind, categoryId: category.id, title: category.title };
    inFlight.current = action;
    setOutcome({ status: 'busy', action });
    let request: Promise<DataSettingsActionReply>;
    try {
      request = kind === 'export' && category.exportCategory ? api.exportCategory(category.exportCategory)
        : kind === 'clear' && category.clearCategory ? api.clearCategory(category.clearCategory)
          : api.openCredentials();
    } catch (error) { request = Promise.reject(error); }
    const settle = (next: Outcome) => {
      // Late replies after close/unmount or for a superseded attempt never change visible state.
      if (!mounted.current || inFlight.current?.token !== action.token) return;
      inFlight.current = null;
      setOutcome(next);
    };
    request.then(reply => settle(reply.ok ? { status: reply.value.outcome, action }
      : { status: 'failed', action, code: reply.error.code, message: reply.error.message }), () => settle({ status: 'unknown', action }));
  };

  const busy = outcome?.status === 'busy' ? outcome.action : undefined;
  const actionProps = (kind: LocalDataActionKind, category: LocalDataCategory) => {
    const mine = busy?.kind === kind && busy.categoryId === category.id;
    return { disabled: !api || !ready, busy: mine, 'aria-disabled': busy && !mine ? true : undefined, onClick: () => run(kind, category) };
  };

  const activate = (id: string) => {
    setCurrent(id);
    const section = sections.current.get(id);
    section?.scrollIntoView?.({ block: 'start' });
    section?.focus({ preventScroll: true });
  };
  const navKey = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    const index = visible.findIndex(category => category.id === id);
    const target = event.key === 'ArrowDown' ? visible[Math.min(index + 1, visible.length - 1)]
      : event.key === 'ArrowUp' ? visible[Math.max(index - 1, 0)]
        : event.key === 'Home' ? visible[0] : event.key === 'End' ? visible.at(-1) : undefined;
    if (target) { event.preventDefault(); setNavFocus(target.id); navItems.current.get(target.id)?.focus(); return; }
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) { event.preventDefault(); activate(id); }
  };
  const tabStop = visible.some(category => category.id === navFocus) ? navFocus : currentVisible;

  const plate = outcome && outcomePlate(outcome);
  let initState: ReactNode = null;
  if (failed) initState = <UnavailableState layout="band" title="Local data controls are unavailable" description="Close and reopen settings, or try again."
    action={api ? <Button onClick={() => { void load(); }}>Try again</Button> : undefined} />;

  return <ThemeProvider appearance={appearance ?? 'system'} className="data-settings">
    <div className="ld-shell" onKeyDown={event => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing && !event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault(); void api?.close(); }
    }}>
      <header className="ld-header">
        <GlyphTile category="system" icon="gear" />
        <p className="ld-header-title">Linuxcast settings</p>
        <Button className="ld-close" variant="ghost" shortcut={['Escape']} disabled={!api} onClick={() => { void api?.close(); }}>Close settings</Button>
      </header>
      <div className="ld-body">
        <nav className="ld-sidebar" aria-label="Data categories">
          <TextField ref={search} type="search" label="Search data categories" value={query} onChange={event => setQuery(event.target.value)} />
          <GroupCaption flush label="Categories" count={visible.length} />
          {visible.length ? <div className="ld-nav-list" role="list">
            {visible.map(category => <div role="listitem" key={category.id}>
              <Row ref={(element: HTMLDivElement | null) => { if (element) navItems.current.set(category.id, element); else navItems.current.delete(category.id); }}
                role="button" tabIndex={category.id === tabStop ? 0 : -1} aria-current={category.id === currentVisible ? 'true' : undefined}
                leading={<LineIcon name={category.navIcon} />} title={category.title}
                onFocus={() => setNavFocus(category.id)} onClick={() => activate(category.id)} onKeyDown={event => navKey(event, category.id)} />
            </div>)}
          </div> : <p className="ld-nav-empty lc-muted">No categories match.</p>}
        </nav>
        <main className="ld-content" ref={content}>
          <div className="ld-page">
            <h1>Local data</h1>
            <p className="ld-lede lc-muted">Export or clear what Linuxcast keeps on this computer, one category at a time. Exports open a system save dialog; clearing asks for confirmation in a system dialog.</p>
            <aside className="ld-notice" aria-label="Export and deletion notice">
              <LineIcon name="info" />
              <p>Exports are unencrypted JSON. Choose a new filename; existing files are kept. Deletion is local and does not securely erase disk contents. Existing backups may retain earlier data.</p>
            </aside>
            <div className="ld-status" role="status" aria-live="polite" aria-atomic="true" data-active={(plate || (!ready && !failed)) ? true : undefined}>
              {plate ? <StatePlate layout="band" headingLevel={2} kind={plate.kind} eyebrow={plate.eyebrow} title={plate.title} description={plate.description} detail={plate.detail} />
                : !ready && !failed ? <LoadingState announce={false} label="Opening data controls…" /> : null}
            </div>
            {initState}
            {visible.length === 0
              ? <EmptyState filtered title="No matching categories" description="Try another category name." />
              : <div className="ld-categories">{visible.map(category => <section key={category.id} className="ld-category lc-focus" tabIndex={-1}
                aria-labelledby={`category-${category.id}`} data-current={category.id === currentVisible || undefined}
                ref={element => { if (element) sections.current.set(category.id, element); else sections.current.delete(category.id); }}>
                <span className="ld-category-glyph"><GlyphTile category={category.tile} icon={category.tileIcon} /></span>
                <div className="ld-category-text">
                  <h2 id={`category-${category.id}`}>{category.title}</h2>
                  <p className="lc-muted">{category.description}</p>
                </div>
                <div className="ld-category-actions">
                  {category.credentials && <Button {...actionProps('credentials', category)}>Manage credentials</Button>}
                  {category.exportCategory && <Button {...actionProps('export', category)} aria-label={`Export ${category.title.toLowerCase()}`}>Export</Button>}
                  {category.clearCategory && <Button variant="danger" {...actionProps('clear', category)} aria-label={`Clear ${category.title.toLowerCase()}`}>Clear…</Button>}
                </div>
              </section>)}</div>}
          </div>
        </main>
      </div>
    </div>
  </ThemeProvider>;
}
