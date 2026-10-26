import { useEffect, useLayoutEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { MAX_ENVELOPE_BYTES, uiTextSchema, type ActionModel } from '@linuxcast/contracts';
import { Button, EmptyState, ErrorState, IconButton, LoadingState, ShortcutHint, TextField, UnavailableState } from '../primitives/index.ts';
import { visibleItems, type ViewSession, type ViewFrame } from './session.ts';
import { availableActions, type Asset, type ViewHost } from './types.ts';
import { SafeMarkdown } from './markdown.tsx';
import { ViewForm } from './form.tsx';
import { safeImageSource } from './images.ts';

function editable(target: EventTarget | null) { return target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable); }
function matches(event: KeyboardEvent, action: ActionModel) {
  const shortcut = action.shortcut;
  return shortcut && event.key.toLocaleLowerCase() === shortcut.key.toLocaleLowerCase() && event.ctrlKey === shortcut.modifiers.includes('Ctrl') && event.altKey === shortcut.modifiers.includes('Alt') && event.shiftKey === shortcut.modifiers.includes('Shift') && event.metaKey === shortcut.modifiers.includes('Super');
}
/** Only trusted host-resolved packaged images enter the existing resource route. */
function imageSource(asset: Asset, host: ViewHost): string | null {
  try { const value = host.resolveImage?.(asset); return value ? safeImageSource(value) : null; } catch { return null; }
}
function Image({ asset, host, description }: { asset: Asset; host: ViewHost; description: string }) {
  const source = imageSource(asset, host);
  const [failed, setFailed] = useState<string | null>(null);
  return source && failed !== source ? <img className="lc-view-image" src={source} alt={description} onError={() => setFailed(source)} /> : <span className="lc-image-unavailable" role="img" aria-label={`${description}: image unavailable`}>▧<span>Image unavailable</span></span>;
}
function Icon({ icon, host }: { icon?: ActionModel['icon'] | undefined; host: ViewHost }) {
  if (icon && icon.kind !== 'builtin') return <span aria-hidden="true" className="lc-result-icon"><Image asset={icon} host={host} description="" /></span>;
  // Fixed host vocabulary. Unknown names get an inert generic icon, never markup.
  const symbols: Record<string, string> = { file: '▤', folder: '▱', search: '⌕', star: '☆', settings: '⚙', link: '↗', copy: '▣' };
  return <span aria-hidden="true" className="lc-result-icon">{icon?.kind === 'builtin' && Object.hasOwn(symbols, icon.name) ? symbols[icon.name] : '◇'}</span>;
}
function ActionPanel({ actions, invoke, close, host }: { actions: ActionModel[]; invoke: (id: string) => void; close: () => void; host: ViewHost }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(actions[0]?.id ?? null);
  const filtered = actions.filter(action => action.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const active = filtered.find(action => action.id === selected) ?? filtered[0];
  const id = useId();
  useLayoutEffect(() => { const prior = document.activeElement; const element = dialog.current; element?.showModal(); element?.querySelector('input')?.focus(); return () => { element?.close(); if (prior instanceof HTMLElement && prior.isConnected) prior.focus(); }; }, []);
  useLayoutEffect(() => {
    const position = () => {
      const element = dialog.current; const shell = element?.closest('.lc-view-shell');
      if (!element || !shell) return;
      const bounds = shell.getBoundingClientRect(); const size = element.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(element).paddingLeft);
      element.style.left = `${Math.max(gap, Math.min(bounds.right - size.width - gap, window.innerWidth - size.width - gap))}px`;
      element.style.top = `${Math.max(gap, Math.min(bounds.bottom - size.height - gap, window.innerHeight - size.height - gap))}px`;
    };
    position(); window.addEventListener('resize', position); return () => window.removeEventListener('resize', position);
  }, [query]);
  const keys = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); const index = filtered.findIndex(action => action === active);
      const nextIndex = (index + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length;
      setSelected(filtered[nextIndex]?.id ?? null);
      if (!(event.target instanceof HTMLInputElement)) dialog.current?.querySelectorAll<HTMLButtonElement>('.lc-panel-action')[nextIndex]?.focus();
    }
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); if (active && !active.disabledReason) invoke(active.id); }
  };
  return <dialog ref={dialog} className="lc-action-panel" aria-label="Actions" onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }} onKeyDown={keys}>
    <TextField label="Find an action" type="search" value={query} onChange={event => setQuery(event.target.value)} aria-controls={id} />
    <span className="lc-view-announcement" role="status" aria-live="polite">{active ? `${active.title}${active.disabledReason ? `: ${active.disabledReason}` : ''}` : 'No matching actions.'}</span><div id={id} className="lc-action-list">{filtered.map(action => <Button key={action.id} className="lc-panel-action" data-current={active?.id === action.id} variant={action.effect === 'destructive' ? 'danger' : 'quiet'} aria-disabled={Boolean(action.disabledReason)} title={action.disabledReason} onFocus={() => setSelected(action.id)} onClick={() => invoke(action.id)}><Icon icon={action.icon} host={host} /><span>{action.title}{action.disabledReason && <small>{action.disabledReason}</small>}</span>{action.shortcut && <ShortcutHint keys={[...action.shortcut.modifiers, action.shortcut.key]} />}</Button>)}</div>
    {!filtered.length && <p>No matching actions.</p>}<Button variant="quiet" onClick={close}>Close actions <ShortcutHint keys={['Escape']} /></Button>
  </dialog>;
}
function DiscardDialog({ discard, cancel }: { discard: () => void; cancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const prior = document.activeElement; ref.current?.showModal(); ref.current?.querySelector('button')?.focus(); return () => { if (prior instanceof HTMLElement && prior.isConnected) prior.focus(); }; }, []);
  return <dialog ref={ref} className="lc-discard-dialog" aria-labelledby="discard-title" onCancel={event => { event.preventDefault(); event.stopPropagation(); cancel(); }} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); cancel(); } }}><h2 id="discard-title">Discard this draft?</h2><p>Your unsent changes will be cleared.</p><Button onClick={cancel}>Keep editing</Button><Button variant="danger" onClick={discard}>Discard changes</Button></dialog>;
}
function ViewContent({ frame, session, host, active, canBack }: { frame: ViewFrame; session: ViewSession; host: ViewHost; active: boolean; canBack: boolean }) {
  const { view } = frame;
  const prefix = useId();
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [panel, setPanel] = useState(false);
  const [requestError, setRequestError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [formEpoch, setFormEpoch] = useState(0);
  const [discard, setDiscard] = useState<'back' | 'cancel' | null>(null);
  const [text, setText] = useState(view.kind === 'text' ? view.text : '');
  const [detailWidth, setDetailWidth] = useState(40);
  const collection = view.kind === 'list' || view.kind === 'grid';
  const items = visibleItems(frame);
  const selected = items.find(item => item.id === frame.selection);
  const suppliedActions = availableActions(view, frame.selection);
  const primary = suppliedActions.find(action => action.id === frame.primaryAction);
  const actions = primary ? [primary, ...suppliedActions.filter(action => action !== primary)] : suppliedActions;
  const close = () => { setPanel(false); session.pop(); };
  const cancelForm = (resetDraft = false) => {
    const top = session.getSnapshot().frames.at(-1)?.view;
    if (view.kind !== 'form' || top?.viewId !== view.viewId || top.revision !== view.revision) return;
    const action = view.actions?.find(value => value.id === view.cancelActionId);
    if (!action || action.disabledReason) return;
    try {
      host.action({ viewId: view.viewId, revision: view.revision, actionId: action.id });
      if (resetDraft) { setFormEpoch(value => value + 1); setDirty(false); }
    } catch { setRequestError(true); }
  };
  const requestClose = (kind: 'back' | 'cancel') => {
    if (kind === 'cancel' && view.kind === 'form' && view.actions?.find(value => value.id === view.cancelActionId)?.disabledReason) return;
    if (dirty) setDiscard(kind); else if (kind === 'back') close(); else cancelForm(true);
  };
  useEffect(() => {
    if (active) {
      if (scroller.current) scroller.current.scrollTop = frame.scroll;
      // Action-panel controls unmount on navigation. Restore the view's main
      // input before its header Back button when the saved control is gone.
      const formTarget = view.kind === 'form' ? root.current?.querySelector<HTMLElement>('form input:not(:disabled), form textarea:not(:disabled), form select:not(:disabled), form button:not(:disabled)') : null;
      const queryTarget = collection ? root.current?.querySelector<HTMLElement>('input[data-view-query]') : null;
      const detailTarget = view.kind === 'detail' ? root.current?.querySelector<HTMLElement>('article') : null;
      const target = previousFocus.current?.isConnected ? previousFocus.current : formTarget ?? queryTarget ?? detailTarget ?? root.current?.querySelector<HTMLElement>('input, textarea, select, [role="listbox"], button, article');
      target?.focus();
    }
    else setPanel(false);
  }, [active, frame.view.viewId, view.kind]); // Ordinary revisions never steal focus.
  const select = (id: string) => { session.select(view.viewId, id); host.selectionChanged?.(view.viewId, id); };
  const invoke = (id: string) => {
    // Re-read current state at the user event, not the action panel's opening revision.
    const top = session.getSnapshot().frames.at(-1);
    if (!active || !top || top.view.viewId !== view.viewId || top.view.revision !== view.revision) return;
    const action = availableActions(top.view, top.selection).find(value => value.id === id);
    if (!action || action.disabledReason) return;
    setPanel(false);
    if (view.kind === 'form' && id === view.submitActionId) { root.current?.querySelector('form')?.requestSubmit(); return; }
    if (view.kind === 'form' && id === view.cancelActionId) { requestClose('cancel'); return; }
    const intent = { viewId: view.viewId, revision: view.revision, actionId: id, ...(collection && top.selection ? { itemId: top.selection } : {}), ...(view.kind === 'text' && view.editable && id === view.submitActionId ? { values: { text } } : {}) };
    if (!uiTextSchema.safeParse(text).success || new TextEncoder().encode(JSON.stringify(intent)).byteLength > MAX_ENVELOPE_BYTES - 8192) { setRequestError(true); return; }
    try { host.action(intent); setRequestError(false); } catch { setRequestError(true); }
  };
  const keyboard = (event: KeyboardEvent) => {
    if (!active || event.isDefaultPrevented() || event.nativeEvent.isComposing) return;
    if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key === 'Escape') { event.preventDefault(); if (panel) setPanel(false); else requestClose('back'); return; }
    if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === 'k') { event.preventDefault(); setPanel(true); return; }
    const isQuery = event.target instanceof HTMLInputElement && event.target.dataset.viewQuery === 'true';
    const inCollection = collection && (isQuery || event.target instanceof HTMLElement && event.target.closest('[role="listbox"]'));
    if (inCollection && !event.ctrlKey && !event.altKey && !event.metaKey && ['ArrowDown', 'ArrowUp', 'Home', 'End', ...(isQuery ? [] : ['ArrowLeft', 'ArrowRight'])].includes(event.key)) {
      // Home/End retain native query caret semantics.
      if (isQuery && ['Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const current = items.findIndex(item => item.id === frame.selection);
      let step = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
      if (view.kind === 'grid' && !isQuery && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { const cells = Array.from(root.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []); const first = cells[0]; const columns = first ? cells.filter(cell => cell.offsetTop === first.offsetTop).length : 1; step *= columns; }
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.min(items.length - 1, Math.max(0, current + step));
      const next = items[index]; if (next) { select(next.id); root.current?.querySelectorAll('[role="option"]')[index]?.scrollIntoView({ block: 'nearest' }); } return;
    }
    if (!event.altKey && !event.metaKey && event.key === 'Enter' && (inCollection || !editable(event.target) && event.target instanceof HTMLElement && !event.target.closest('button, a, [role="link"]'))) { event.preventDefault(); const action = actions[event.ctrlKey ? 1 : 0]; if (action) invoke(action.id); return; }
    if (!editable(event.target)) { const action = actions.find(value => matches(event, value)); if (action) { event.preventDefault(); invoke(action.id); } }
  };
  let content: ReactNode;
  if (collection) content = <div className="lc-collection-layout" data-detail={Boolean(selected?.preview)}>
    <div className="lc-collection-main">
      <div id={`${prefix}-results`} role="listbox" aria-label={view.title} tabIndex={0} className={`lc-results lc-focus ${view.kind === 'grid' ? 'lc-grid' : ''}`} data-density={view.kind === 'grid' ? view.density : undefined} aria-activedescendant={selected ? `${prefix}-item-${items.indexOf(selected)}` : undefined}>
        {view.sections.map(section => { const sectionItems = items.filter(item => section.items.some(value => value.id === item.id)); return sectionItems.length ? <div role="group" aria-label={section.title ?? 'Results'} className="lc-result-group" key={section.id}>{section.title && <div className="lc-group-title" aria-hidden="true">{section.title}</div>}{sectionItems.map(item => <div role="option" id={`${prefix}-item-${items.indexOf(item)}`} aria-selected={item.id === frame.selection} aria-disabled={Boolean(item.disabledReason)} title={[item.title, item.subtitle, item.disabledReason].filter(Boolean).join(' — ')} className="lc-result" key={item.id} onClick={() => { select(item.id); root.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus(); }} onDoubleClick={() => { if (item.id === frame.selection && actions[0]) invoke(actions[0].id); }}>
          {view.kind === 'grid' && view.images.find(image => image.itemId === item.id) ? <Image asset={view.images.find(image => image.itemId === item.id)!.source} host={host} description={item.title} /> : <Icon icon={item.icon} host={host} />}
          <span className="lc-result-copy"><span dir="auto">{item.title}</span>{item.subtitle && <small dir="auto">{item.subtitle}</small>}{item.disabledReason && <small>{item.disabledReason}</small>}</span>
          {item.tags?.map((tag, index) => <span className="lc-tag" data-tone={tag.tone} key={index}>{tag.text}</span>)}{item.accessories?.map((accessory, index) => <span className="lc-accessory" title={accessory.tooltip} key={index}>{accessory.icon && <Icon icon={accessory.icon} host={host} />}{accessory.text}</span>)}
        </div>)}</div> : null; })}
      </div>
      {!items.length && <EmptyState title={frame.query ? 'No matching results' : view.empty?.title ?? 'No items yet'} description={frame.query ? (view.search.mode === 'extension' ? view.empty?.description ?? 'Try a different search.' : 'Try a different search.') : view.empty?.description ?? 'Items will appear here when available.'} />}
      {view.nextCursor && <Button disabled={!host.loadMore} onClick={() => host.loadMore?.(view.viewId, view.nextCursor!)}>Load more results</Button>}
    </div>
    {selected?.preview && <><input className="lc-detail-divider lc-focus" type="range" min={35} max={60} value={detailWidth} aria-label="Detail pane width" onChange={event => setDetailWidth(Number(event.target.value))} /><aside className="lc-item-preview" style={{ flexBasis: `${detailWidth}%` }} aria-label="Selected item preview">{selected.preview.kind === 'text' ? <SafeMarkdown text={selected.preview.text} openLink={host.openLink} /> : selected.preview.kind === 'image' ? <Image asset={selected.preview.source} host={host} description={selected.title} /> : <UnavailableState title="PDF preview unavailable" description="Open this document through a configured sandboxed document viewer." />}</aside></>}
  </div>;
  else if (view.kind === 'detail') content = <article className="lc-detail lc-focus" tabIndex={0}><SafeMarkdown text={view.markdown} openLink={host.openLink} /><dl className="lc-metadata">{view.metadata.map((entry, index) => <div key={index}><dt>{entry.label}</dt><dd dir="auto">{entry.value}</dd></div>)}</dl>{view.attachments.length > 0 && <section aria-label="Attachments">{view.attachments.map((asset, index) => <Image asset={asset} host={host} description={`Attachment ${index + 1}`} key={index} />)}</section>}</article>;
  else if (view.kind === 'form') content = <ViewForm key={formEpoch} view={view} host={host} active={active} isCurrent={(id, revision) => { const top = session.getSnapshot().frames.at(-1)?.view; return top?.viewId === id && top.revision === revision; }} onDirty={setDirty} requestCancel={() => requestClose('cancel')} />;
  else if (view.kind === 'text') content = view.editable ? <div className="lc-field"><label htmlFor={`${prefix}-text`}>{view.title}</label><textarea id={`${prefix}-text`} className="lc-input lc-focus" value={text} maxLength={65536} onChange={event => { setText(event.target.value); setDirty(true); }} /></div> : <pre className="lc-text-content">{view.text}</pre>;
  else if (view.kind === 'image') content = <Image asset={view.source} host={host} description={view.description} />;
  else content = <UnavailableState title="PDF preview unavailable" description="Connect the sandboxed document viewer to preview this file. Available document actions remain below." />;
  return <div ref={root} hidden={!active} className="lc-view" tabIndex={-1} onKeyDown={keyboard} onFocusCapture={event => { previousFocus.current = event.target; }}>
    <header className="lc-view-header">{canBack && <IconButton label="Back" onClick={() => requestClose('back')}>←</IconButton>}{collection ? <TextField label={view.title} type="search" data-view-query="true" value={frame.query} placeholder={view.search.placeholder} aria-controls={`${prefix}-results`} aria-activedescendant={selected ? `${prefix}-item-${items.indexOf(selected)}` : undefined} onChange={event => { if (uiTextSchema.safeParse(event.target.value).success) { session.setQuery(view.viewId, event.target.value); host.queryChanged?.(view.viewId, event.target.value, session.getSnapshot().frames.find(value => value.view.viewId === view.viewId)!.queryRevision); } }} /> : <h1>{view.title}</h1>}</header>
    {requestError && <p role="alert" className="lc-view-status">This request could not be sent. Check its size and try again.</p>}
    {view.loading && <LoadingState label={items.length ? 'Refreshing results…' : 'Loading…'} />}
    {view.status && <p className="lc-view-status" data-kind={view.status.kind} role={view.status.kind === 'error' ? 'alert' : 'status'}>{view.status.message}</p>}
    <div className="lc-view-scroll" ref={scroller} onScroll={event => session.saveScroll(view.viewId, event.currentTarget.scrollTop)}>{content}</div>
    <footer className="lc-view-footer"><span className="lc-footer-context" dir="auto">{selected?.title ?? view.title}</span><div>{view.kind !== 'form' && actions[0] && <Button variant="quiet" aria-disabled={Boolean(actions[0].disabledReason)} title={actions[0].disabledReason} onClick={() => invoke(actions[0]!.id)}>{actions[0].title}<ShortcutHint keys={['Enter']} /></Button>}<Button variant="quiet" onClick={() => setPanel(true)}>Actions <ShortcutHint keys={['Ctrl', 'K']} /></Button></div></footer>
    {panel && active && <ActionPanel actions={actions} invoke={invoke} close={() => setPanel(false)} host={host} />}
    {discard && active && <DiscardDialog cancel={() => { setDiscard(null); previousFocus.current?.focus(); }} discard={() => { setDiscard(null); if (discard === 'back') close(); else cancelForm(true); }} />}
  </div>;
}
export function ViewRenderer({ session, host }: { session: ViewSession; host: ViewHost }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return <div className="lc-view-shell" onKeyDownCapture={event=>{
    // A held Review/Submit key must not activate the next view's primary effect.
    // Multiline editors retain their ordinary repeated-newline behavior.
    if(event.key==='Enter'&&event.repeat&&!event.nativeEvent.isComposing&&!(event.target instanceof HTMLTextAreaElement)&&!(event.target instanceof HTMLElement&&event.target.isContentEditable)){event.preventDefault();event.stopPropagation();}
  }}>{state.error && <ErrorState title="This view could not be displayed" description="The view data is invalid. Return to the command and try again." />}{state.frames.map((frame, index) => <ViewContent key={`${frame.view.viewId}:${frame.view.kind}`} frame={frame} session={session} host={host} active={index === state.frames.length - 1} canBack={index > 0} />)}</div>;
}
