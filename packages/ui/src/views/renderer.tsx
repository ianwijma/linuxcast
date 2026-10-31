import { useEffect, useLayoutEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode, RefObject } from 'react';
import { MAX_ENVELOPE_BYTES, uiTextSchema, type ActionModel } from '@linuxcast/contracts';
import { Button, EmptyState, ErrorState, GlyphTile, GroupCaption, IconButton, LineIcon, Row, ShortcutHint, StatePlate, TextField, UnavailableState } from '../primitives/index.ts';
import type { GlyphCategory, LineIconName } from '../primitives/index.ts';
import { tokens } from '../tokens/index.ts';
import { visibleItems, type Item, type ViewSession, type ViewFrame } from './session.ts';
import { availableActions, type Asset, type ViewHost } from './types.ts';
import { SafeMarkdown } from './markdown.tsx';
import { ViewForm } from './form.tsx';
import { safeImageSource } from './images.ts';

type Icon = ActionModel['icon'];
function editable(target: EventTarget | null) { return target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable); }
function matches(event: KeyboardEvent, action: ActionModel) {
  const shortcut = action.shortcut;
  return shortcut && event.key.toLocaleLowerCase() === shortcut.key.toLocaleLowerCase() && event.ctrlKey === shortcut.modifiers.includes('Ctrl') && event.altKey === shortcut.modifiers.includes('Alt') && event.shiftKey === shortcut.modifiers.includes('Shift') && event.metaKey === shortcut.modifiers.includes('Super');
}
/** Presentation only: absolute or home-relative path text uses the monospace path style. */
const looksLikePath = (value: string | undefined) => !!value && /^(?:~\/|\/)/.test(value);

/* Closed host vocabularies. Validated builtin icon names select a fixed tile category and
 * static host glyph; unknown names fall back to `system`. No model supplies colours, SVG or CSS. */
const BUILTIN_TILES: Readonly<Record<string, { category: GlyphCategory; icon?: LineIconName }>> = {
  file: { category: 'files', icon: 'file' }, folder: { category: 'files', icon: 'folder' },
  search: { category: 'command' }, settings: { category: 'system', icon: 'gear' },
  link: { category: 'quicklink', icon: 'link' }, copy: { category: 'clipboard', icon: 'clipboard' },
};
const BUILTIN_LINES: Readonly<Record<string, LineIconName>> = { file: 'file', folder: 'folder', search: 'search', settings: 'gear', link: 'link', copy: 'clipboard' };
const KIND_LINES: Readonly<Record<ActionModel['kind'], LineIconName>> = { open: 'chevron', navigate: 'chevron', copy: 'clipboard', invoke: 'command' };

/** Only trusted host-resolved packaged images enter the existing resource route. */
function imageSource(asset: Asset, host: ViewHost): string | null {
  try { const value = host.resolveImage?.(asset); return value ? safeImageSource(value) : null; } catch { return null; }
}
function Image({ asset, host, description }: { asset: Asset; host: ViewHost; description: string }) {
  const source = imageSource(asset, host);
  const [failed, setFailed] = useState<string | null>(null);
  return source && failed !== source ? <img className="lc-view-image" src={source} alt={description} onError={() => setFailed(source)} />
    : <span className="lc-image-unavailable" role="img" aria-label={`${description}: image unavailable`}><LineIcon name="info" /><span>Image unavailable</span></span>;
}
/** Noun marker: validated emoji glyph text, packaged image, or a host category tile. */
function ItemGlyph({ icon, host, small = false }: { icon?: Icon | undefined; host: ViewHost; small?: boolean }) {
  if (icon?.kind === 'glyph') return <span aria-hidden="true" className="lc-result-icon" data-size={small ? 'small' : undefined}>{icon.value}</span>;
  if (icon && icon.kind !== 'builtin') return <span aria-hidden="true" className="lc-result-icon" data-size={small ? 'small' : undefined}><Image asset={icon} host={host} description="" /></span>;
  const known = icon?.kind === 'builtin' && Object.hasOwn(BUILTIN_TILES, icon.name) ? BUILTIN_TILES[icon.name] : undefined;
  return <GlyphTile category={known?.category ?? 'system'} icon={known?.icon} size={small ? 'small' : 'default'} />;
}
/** Verb marker: monochrome host line icon (or validated glyph/packaged image content). */
function ActionGlyph({ action, host }: { action: ActionModel; host: ViewHost }) {
  const icon = action.icon;
  if (icon?.kind === 'glyph') return <span aria-hidden="true" className="lc-action-icon">{icon.value}</span>;
  if (icon && icon.kind !== 'builtin') return <span aria-hidden="true" className="lc-action-icon"><Image asset={icon} host={host} description="" /></span>;
  const named = icon?.kind === 'builtin' && Object.hasOwn(BUILTIN_LINES, icon.name) ? BUILTIN_LINES[icon.name] : undefined;
  return <span aria-hidden="true" className="lc-action-icon"><LineIcon name={named ?? (action.effect === 'destructive' ? 'close' : KIND_LINES[action.kind])} /></span>;
}
function Accessories({ item, host }: { item: Item; host: ViewHost }) {
  return <>
    {item.disabledReason && <span className="lc-result-reason" dir="auto">{item.disabledReason}</span>}
    {item.tags?.map((tag, index) => <span className="lc-tag" data-tone={tag.tone} key={`t${index}`}>{tag.text}</span>)}
    {item.accessories?.map((accessory, index) => <span className="lc-accessory" title={accessory.tooltip} key={`a${index}`}>{accessory.icon && <ActionGlyph action={{ id: 'accessory', title: '', kind: 'invoke', effect: 'read', icon: accessory.icon }} host={host} />}{accessory.text}</span>)}
  </>;
}

/* ------------------------------------------------------------------ action panel */
function ActionPanel({ actions, context, invoke, close, host }: { actions: ActionModel[]; context: string; invoke: (id: string) => void; close: () => void; host: ViewHost }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  // Initial highlight is the current primary action (actions[0]); grouping is visual only.
  const [selected, setSelected] = useState<string | null>(actions[0]?.id ?? null);
  const bound = actions.slice(0, 2).filter(action => action.effect !== 'destructive');
  const groups = [bound, actions.filter(action => !bound.includes(action) && action.effect !== 'destructive'), actions.filter(action => action.effect === 'destructive')];
  const match = (action: ActionModel) => action.title.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const visibleGroups = groups.map(group => group.filter(match)).filter(group => group.length);
  const filtered = visibleGroups.flat();
  const active = filtered.find(action => action.id === selected) ?? filtered[0];
  const id = useId();
  useLayoutEffect(() => { const prior = document.activeElement; const element = dialog.current; element?.showModal(); element?.querySelector<HTMLInputElement>('input[type="search"]')?.focus(); return () => { element?.close(); if (prior instanceof HTMLElement && prior.isConnected) prior.focus(); }; }, []);
  // Anchor above the footer hint, bounded by the shell and viewport. The list scrolls so the
  // header and bottom filter stay reachable in compact windows, at 200% zoom and when a live
  // snapshot grows or shrinks the actions while the panel is open. Placement only: it never
  // moves focus, the highlight or the list scroll position.
  const place = useRef(() => {});
  place.current = () => {
    const element = dialog.current; const view = element?.closest('.lc-view'); const shell = element?.closest('.lc-view-shell');
    if (!element || !shell) return;
    const bounds = shell.getBoundingClientRect(); const footer = view?.querySelector('.lc-view-footer')?.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(element).getPropertyValue('--lc-panel-gap')) || 8;
    const anchor = Math.min(footer && footer.height ? footer.top : bounds.bottom, window.innerHeight) - gap;
    // Prefer the shell space above the footer; if even header + one row + filter cannot fit
    // there, fall back to the viewport so every control stays reachable.
    const parts = ['.lc-panel-header', '.lc-panel-filter', '.lc-panel-action, .lc-panel-empty'].map(selector => element.querySelector<HTMLElement>(selector)?.offsetHeight ?? 0);
    const edges = element.offsetHeight - element.clientHeight;
    const minimum = parts.reduce((total, value) => total + value, edges);
    const ceiling = Math.max(gap, bounds.top + gap), fits = anchor - ceiling >= minimum;
    const cap = Math.max(0, fits ? anchor - ceiling : window.innerHeight - gap * 2);
    if (element.style.maxBlockSize !== `${cap}px`) element.style.maxBlockSize = `${cap}px`;
    const size = element.getBoundingClientRect();
    element.style.left = `${Math.max(gap, Math.min(bounds.right - size.width - gap, window.innerWidth - size.width - gap))}px`;
    element.style.top = `${Math.max(fits ? ceiling : gap, Math.min(anchor - size.height, window.innerHeight - gap - size.height))}px`;
  };
  // Every render (new actions, filter, revision) re-anchors synchronously before paint.
  useLayoutEffect(() => { place.current(); });
  useLayoutEffect(() => {
    const element = dialog.current; const view = element?.closest('.lc-view');
    let frame = 0;
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; place.current(); }); };
    // Environments without ResizeObserver still re-anchor on every render and window resize.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    for (const target of [element, element?.querySelector('.lc-action-list'), view?.querySelector('.lc-view-footer'), element?.closest('.lc-view-shell')]) if (target) observer?.observe(target);
    window.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', schedule); };
  }, []);
  const keys = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    event.stopPropagation();
    if (event.key === 'Escape' || (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === 'k')) { event.preventDefault(); close(); return; }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && filtered.length) {
      event.preventDefault(); const index = filtered.findIndex(action => action === active);
      const nextIndex = (index + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length;
      setSelected(filtered[nextIndex]?.id ?? null);
      if (!(event.target instanceof HTMLInputElement)) dialog.current?.querySelectorAll<HTMLButtonElement>('.lc-panel-action')[nextIndex]?.focus();
    }
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); if (active && !active.disabledReason) invoke(active.id); }
  };
  return <dialog ref={dialog} className="lc-action-panel" aria-label="Actions" onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }} onKeyDown={keys}
    onClick={event => { if (event.target !== dialog.current) return; const box = dialog.current.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close(); }}>
    <div className="lc-panel-header"><span className="lc-panel-context" dir="auto" title={context}>{context}</span><IconButton label="Close actions" aria-keyshortcuts="Escape" className="lc-panel-close" onClick={close}><LineIcon name="close" /></IconButton></div>
    <span className="lc-view-announcement" role="status" aria-live="polite">{active ? `${active.title}${active.disabledReason ? `: ${active.disabledReason}` : ''}` : 'No matching actions.'}</span>
    <div id={id} className="lc-action-list">
      {visibleGroups.map((group, index) => <div className="lc-panel-group" key={index}>{group.map(action => {
        const destructive = action.effect === 'destructive';
        return <Button key={action.id} className="lc-panel-action" data-current={active?.id === action.id} data-destructive={destructive || undefined} variant={destructive ? 'danger' : 'quiet'} aria-disabled={Boolean(action.disabledReason)} title={action.disabledReason}
          onFocus={() => setSelected(action.id)} onClick={() => invoke(action.id)}>
          <ActionGlyph action={action} host={host} />
          <span className="lc-panel-label"><span dir="auto">{action.title}</span>{action.disabledReason && <small>{action.disabledReason}</small>}</span>
          {action.shortcut && <ShortcutHint keys={[...action.shortcut.modifiers, action.shortcut.key]} />}
          {destructive && <span className="lc-view-announcement"> (destructive)</span>}
        </Button>;
      })}</div>)}
      {!filtered.length && <p className="lc-panel-empty">No matching actions.</p>}
    </div>
    <div className="lc-panel-filter"><LineIcon name="search" /><TextField label="Find an action" type="search" value={query} placeholder="Filter actions" onChange={event => setQuery(event.target.value)} aria-controls={id} /><ShortcutHint keys={['Ctrl', 'K']} label="Close with Ctrl+K" /></div>
  </dialog>;
}
function DiscardDialog({ discard, cancel }: { discard: () => void; cancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const prior = document.activeElement; ref.current?.showModal(); ref.current?.querySelector('button')?.focus(); return () => { if (prior instanceof HTMLElement && prior.isConnected) prior.focus(); }; }, []);
  return <dialog ref={ref} className="lc-discard-dialog" aria-labelledby="discard-title" onCancel={event => { event.preventDefault(); event.stopPropagation(); cancel(); }} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); cancel(); } }}><h2 id="discard-title">Discard this draft?</h2><p>Your unsent changes will be cleared.</p><div className="lc-discard-actions"><Button onClick={cancel}>Keep editing</Button><Button variant="danger" onClick={discard}>Discard changes</Button></div></dialog>;
}

/* ------------------------------------------------------------- list/detail split */
const SPLIT = { initial: Math.round(tokens.ratio.listDetail * 100), min: Math.round(tokens.ratio.listDetailMin * 100), max: Math.round(tokens.ratio.listDetailMax * 100), step: Math.round(tokens.ratio.listDetailStep * 100) };
const clampSplit = (value: number) => Math.min(SPLIT.max, Math.max(SPLIT.min, Math.round(value)));
function Splitter({ value, change, controls, layout }: { value: number; change: (value: number) => void; controls: string; layout: RefObject<HTMLDivElement | null> }) {
  const dragging = useRef(false);
  const fromPointer = (event: PointerEvent) => { const box = layout.current?.getBoundingClientRect(); if (box?.width) change(clampSplit(((event.clientX - box.left) / box.width) * 100)); };
  return <div role="separator" tabIndex={0} className="lc-split lc-focus" aria-orientation="vertical" aria-label="Resize list and preview" aria-controls={controls}
    aria-valuemin={SPLIT.min} aria-valuemax={SPLIT.max} aria-valuenow={value} aria-valuetext={`List ${value} percent`}
    onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
      const next = event.key === 'ArrowLeft' ? value - SPLIT.step : event.key === 'ArrowRight' ? value + SPLIT.step : event.key === 'Home' ? SPLIT.min : event.key === 'End' ? SPLIT.max : null;
      if (next === null) return;
      event.preventDefault(); change(clampSplit(next));
    }}
    onPointerDown={event => { if (event.button !== 0) return; dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus(); }}
    onPointerMove={event => { if (dragging.current) fromPointer(event); }}
    onPointerUp={event => { dragging.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { dragging.current = false; }} />;
}

/* ------------------------------------------------------------------- grid layout */
/** Column count of the rendered grid, measured from a token-sized probe so `role="row"`
 * groups match the visual rows. Server rendering and zero-width layouts use one column. */
function useGridColumns(grid: RefObject<HTMLDivElement | null>, enabled: boolean, density: string | undefined): number {
  const [columns, setColumns] = useState(1);
  useLayoutEffect(() => {
    const element = grid.current;
    if (!enabled || !element) return;
    const measure = () => {
      const probe = element.querySelector<HTMLElement>('.lc-grid-probe');
      const width = element.clientWidth; const cell = probe?.offsetWidth ?? 0;
      const gap = probe ? parseFloat(getComputedStyle(probe).marginInlineEnd) || 0 : 0;
      setColumns(width > 0 && cell > 0 ? Math.max(1, Math.floor((width + gap) / (cell + gap))) : 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [grid, enabled, density]);
  return columns;
}
const chunk = <T,>(values: T[], size: number): T[][] => { const rows: T[][] = []; for (let index = 0; index < values.length; index += size) rows.push(values.slice(index, index + size)); return rows; };

function ViewContent({ frame, session, host, active, canBack }: { frame: ViewFrame; session: ViewSession; host: ViewHost; active: boolean; canBack: boolean }) {
  const { view } = frame;
  const prefix = useId();
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const layout = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [panel, setPanel] = useState(false);
  const [requestError, setRequestError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [formEpoch, setFormEpoch] = useState(0);
  const [discard, setDiscard] = useState<'back' | 'cancel' | null>(null);
  const [text, setText] = useState(view.kind === 'text' ? view.text : '');
  const [split, setSplit] = useState(SPLIT.initial);
  // Enter/Ctrl+Enter are not view chords while an editable control (other than the collection
  // query) has focus: there they keep native editing behaviour. Footer hints follow that context.
  const [editing, setEditing] = useState(false);
  // One-shot: after a nonempty root query is cleared, reveal the preserved selection once the
  // settled (non-loading) unfiltered results render. Ordinary revisions never scroll.
  const reveal = useRef(false);
  const collection = view.kind === 'list' || view.kind === 'grid';
  const grid = view.kind === 'grid';
  const items = visibleItems(frame);
  const selected = items.find(item => item.id === frame.selection);
  const suppliedActions = availableActions(view, frame.selection);
  const primary = suppliedActions.find(action => action.id === frame.primaryAction);
  const actions = primary ? [primary, ...suppliedActions.filter(action => action !== primary)] : suppliedActions;
  const columns = useGridColumns(results, grid, grid ? view.density : undefined);
  const itemId = (item: Item) => `${prefix}-item-${items.indexOf(item)}`;
  const sections = collection ? view.sections.map(section => ({ section, items: items.filter(item => section.items.some(value => value.id === item.id)) })).filter(value => value.items.length) : [];
  const gridRows = grid ? sections.flatMap(value => chunk(value.items, columns).map(row => row.map(item => items.indexOf(item)))) : [];
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
  const changeQuery = (value: string) => {
    if (!collection || !uiTextSchema.safeParse(value).success) return;
    reveal.current = !canBack && value === '' && frame.query !== '';
    session.setQuery(view.viewId, value);
    host.queryChanged?.(view.viewId, value, session.getSnapshot().frames.find(entry => entry.view.viewId === view.viewId)!.queryRevision);
  };
  useEffect(() => {
    if (active) {
      if (scroller.current) scroller.current.scrollTop = frame.scroll;
      // Action-panel controls unmount on navigation. Restore the view's main
      // input before its header Back button when the saved control is gone.
      const formTarget = view.kind === 'form' ? root.current?.querySelector<HTMLElement>('form input:not(:disabled), form textarea:not(:disabled), form select:not(:disabled), form button:not(:disabled)') : null;
      const queryTarget = collection ? root.current?.querySelector<HTMLElement>('input[data-view-query]') : null;
      const detailTarget = view.kind === 'detail' ? root.current?.querySelector<HTMLElement>('article') : null;
      const target = previousFocus.current?.isConnected ? previousFocus.current : formTarget ?? queryTarget ?? detailTarget ?? root.current?.querySelector<HTMLElement>('input, textarea, select, [role="listbox"], [role="grid"], button, article');
      target?.focus();
    }
    else setPanel(false);
  }, [active, frame.view.viewId, view.kind]); // Ordinary revisions never steal focus.
  useLayoutEffect(() => {
    if (!reveal.current || !active || !collection) return;
    if (frame.query !== '') { reveal.current = false; return; }
    if (view.loading || !selected) return;
    reveal.current = false;
    const row = document.getElementById(itemId(selected)); const box = scroller.current;
    if (!row || !box || !box.contains(row)) return;
    // Adjust only the result viewport: no focus change, no document scroll, no invocation.
    const rowBox = row.getBoundingClientRect(), port = box.getBoundingClientRect();
    if (rowBox.top < port.top) box.scrollTop -= port.top - rowBox.top;
    else if (rowBox.bottom > port.bottom) box.scrollTop += rowBox.bottom - port.bottom;
  });
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
  /** Next item index for a navigation key. Grids follow the rendered columns. */
  const target = (key: string, ctrl: boolean): number | null => {
    if (!items.length) return null;
    const current = items.findIndex(item => item.id === frame.selection);
    const last = items.length - 1;
    if (!grid) return key === 'Home' ? 0 : key === 'End' ? last : current < 0 ? 0 : Math.min(last, Math.max(0, current + (key === 'ArrowUp' ? -1 : 1)));
    if (current < 0) return 0;
    const row = gridRows.findIndex(value => value.includes(current)); const cells = gridRows[row] ?? [current]; const column = cells.indexOf(current);
    if (key === 'ArrowLeft') return Math.max(0, current - 1);
    if (key === 'ArrowRight') return Math.min(last, current + 1);
    if (key === 'Home') return ctrl ? 0 : cells[0]!;
    if (key === 'End') return ctrl ? last : cells.at(-1)!;
    const next = gridRows[row + (key === 'ArrowUp' ? -1 : 1)];
    return next ? next[Math.min(column, next.length - 1)]! : current;
  };
  const keyboard = (event: KeyboardEvent) => {
    if (!active || event.isDefaultPrevented() || event.nativeEvent.isComposing) return;
    if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key === 'Escape') {
      // Panel first; a nonempty root query clears next; then pop/dismiss. Dirty drafts confirm first.
      event.preventDefault();
      if (panel) setPanel(false); else if (!canBack && collection && frame.query && !dirty) changeQuery(''); else requestClose('back');
      return;
    }
    if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === 'k') { event.preventDefault(); setPanel(true); return; }
    const isQuery = event.target instanceof HTMLInputElement && event.target.dataset.viewQuery === 'true';
    const inCollection = collection && (isQuery || event.target instanceof HTMLElement && !!event.target.closest('[role="listbox"], [role="grid"]'));
    const navigation = ['ArrowDown', 'ArrowUp', 'Home', 'End', ...(isQuery ? [] : ['ArrowLeft', 'ArrowRight'])];
    const gridJump = grid && !isQuery && event.ctrlKey && !event.shiftKey && (event.key === 'Home' || event.key === 'End');
    if (inCollection && (gridJump || (!event.ctrlKey && !event.altKey && !event.metaKey)) && navigation.includes(event.key)) {
      // Home/End and Left/Right retain native query caret semantics.
      if (isQuery && ['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = target(event.key, event.ctrlKey); const next = index === null ? undefined : items[index];
      if (next) { select(next.id); document.getElementById(itemId(next))?.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    if (!event.altKey && !event.metaKey && event.key === 'Enter' && (inCollection || !editable(event.target) && event.target instanceof HTMLElement && !event.target.closest('button, a, [role="link"]'))) { event.preventDefault(); const action = actions[event.ctrlKey ? 1 : 0]; if (action) invoke(action.id); return; }
    if (!editable(event.target)) { const action = actions.find(value => matches(event, value)); if (action) { event.preventDefault(); invoke(action.id); } }
  };
  const tooltip = (item: Item) => [item.title, item.subtitle, item.disabledReason].filter(Boolean).join(' — ');
  const choose = (item: Item) => { select(item.id); results.current?.focus(); };
  const run = (item: Item) => { if (item.id === frame.selection && actions[0]) invoke(actions[0].id); };
  let content: ReactNode;
  if (collection) {
    const resultsId = `${prefix}-results`;
    const activeId = selected ? itemId(selected) : undefined;
    const filtered = !!frame.query && !(view.search.mode === 'extension' && (view.status?.kind === 'warning' || view.status?.kind === 'error'));
    const list = grid
      ? <div ref={results} id={resultsId} role="grid" aria-label={view.title} tabIndex={0} className="lc-results lc-grid lc-focus" data-density={view.density} aria-activedescendant={activeId} style={{ ['--lc-view-grid-columns' as string]: columns }}>
        <span className="lc-grid-probe" aria-hidden="true" />
        {sections.map(({ section, items: sectionItems }) => <div role="rowgroup" aria-label={section.title ?? 'Results'} className="lc-result-group" key={section.id}>
          {section.title && <GroupCaption label={section.title} count={sectionItems.length} flush aria-hidden="true" className="lc-group-title" />}
          {chunk(sectionItems, columns).map((row, rowIndex) => <div role="row" className="lc-grid-row" key={rowIndex}>{row.map(item => {
            const image = view.images.find(value => value.itemId === item.id);
            return <div role="gridcell" id={itemId(item)} key={item.id} aria-selected={item.id === frame.selection} aria-disabled={Boolean(item.disabledReason)} title={tooltip(item)} className="lc-result lc-grid-cell"
              onClick={() => choose(item)} onDoubleClick={() => run(item)}>
              <span className="lc-grid-media">{image ? <Image asset={image.source} host={host} description={item.title} /> : <ItemGlyph icon={item.icon} host={host} />}</span>
              <span className="lc-grid-caption"><span className="lc-grid-title" dir="auto">{item.title}</span>{item.subtitle && <span className="lc-grid-subtitle" dir="auto">{item.subtitle}</span>}<Accessories item={item} host={host} /></span>
            </div>;
          })}</div>)}
        </div>)}
      </div>
      : <div ref={results} id={resultsId} role="listbox" aria-label={view.title} tabIndex={0} className="lc-results lc-focus" aria-activedescendant={activeId}>
        {sections.map(({ section, items: sectionItems }) => <div role="group" aria-label={section.title ?? 'Results'} className="lc-result-group" key={section.id}>
          {section.title && <GroupCaption label={section.title} count={sectionItems.length} aria-hidden="true" className="lc-group-title" />}
          {sectionItems.map(item => {
            const accessory = item.disabledReason || item.tags?.length || item.accessories?.length ? <Accessories item={item} host={host} /> : undefined;
            return <Row role="option" id={itemId(item)} key={item.id} aria-selected={item.id === frame.selection} aria-disabled={Boolean(item.disabledReason)} className="lc-result"
              leading={<ItemGlyph icon={item.icon} host={host} />} title={item.title} subtitle={item.subtitle} subtitleMono={looksLikePath(item.subtitle)} accessory={accessory} tooltip={tooltip(item)}
              onClick={() => choose(item)} onDoubleClick={() => run(item)} />;
          })}
        </div>)}
      </div>;
    const preview = selected?.preview;
    content = <div ref={layout} className="lc-collection-layout" data-detail={Boolean(preview)} style={preview ? { ['--lc-view-split' as string]: `${split}%` } : undefined}>
      <div className="lc-collection-main">
        {list}
        {!items.length && view.loading && <StatePlate kind="loading" title="Loading…" announce />}
        {!items.length && !view.loading && <EmptyState filtered={filtered} title={filtered ? 'No matching results' : view.empty?.title ?? 'No items yet'} description={frame.query ? (view.search.mode === 'extension' ? view.empty?.description ?? 'Try a different search.' : 'Try a different search.') : view.empty?.description ?? 'Items will appear here when available.'} />}
        {view.nextCursor && <Button className="lc-load-more" disabled={!host.loadMore} onClick={() => host.loadMore?.(view.viewId, view.nextCursor!)}>Load more results</Button>}
      </div>
      {preview && <><Splitter value={split} change={setSplit} controls={resultsId} layout={layout} /><aside className="lc-item-preview" aria-label="Selected item preview">
        {preview.kind === 'text' ? <SafeMarkdown text={preview.text} openLink={host.openLink} />
          : preview.kind === 'image' ? <Image asset={preview.source} host={host} description={selected.title} />
            : <UnavailableState layout="band" title="PDF preview unavailable" description="Open this document through a configured sandboxed document viewer." />}
      </aside></>}
    </div>;
  }
  else if (view.kind === 'detail') content = <article className="lc-detail lc-focus" tabIndex={0}><SafeMarkdown text={view.markdown} openLink={host.openLink} />{view.metadata.length > 0 && <dl className="lc-metadata">{view.metadata.map((entry, index) => <div key={index}><dt dir="auto">{entry.label}</dt><dd dir="auto" data-path={looksLikePath(entry.value) || undefined}>{entry.value}</dd></div>)}</dl>}{view.attachments.length > 0 && <section aria-label="Attachments" className="lc-attachments">{view.attachments.map((asset, index) => <Image asset={asset} host={host} description={`Attachment ${index + 1}`} key={index} />)}</section>}</article>;
  else if (view.kind === 'form') content = <ViewForm key={formEpoch} view={view} host={host} active={active} isCurrent={(id, revision) => { const top = session.getSnapshot().frames.at(-1)?.view; return top?.viewId === id && top.revision === revision; }} onDirty={setDirty} requestCancel={() => requestClose('cancel')} />;
  else if (view.kind === 'text') content = view.editable ? <div className="lc-field lc-view-text"><label className="lc-field-label" htmlFor={`${prefix}-text`}>{view.title}</label><textarea id={`${prefix}-text`} className="lc-input lc-focus" value={text} maxLength={65536} onChange={event => { setText(event.target.value); setDirty(true); }} /></div> : <pre className="lc-text-content">{view.text}</pre>;
  else if (view.kind === 'image') content = <Image asset={view.source} host={host} description={view.description} />;
  else content = <UnavailableState title="PDF preview unavailable" description="Connect the sandboxed document viewer to preview this file. Available document actions remain below." />;
  const secondary = view.kind !== 'form' ? actions[1] : undefined;
  const footerPrimary = view.kind !== 'form' ? actions[0] : undefined;
  return <div ref={root} hidden={!active} className="lc-view" tabIndex={-1} onKeyDown={keyboard} onFocusCapture={event => { previousFocus.current = event.target; setEditing(editable(event.target) && !(event.target instanceof HTMLInputElement && event.target.dataset.viewQuery === 'true') && !(event.target instanceof HTMLElement && event.target.closest('dialog'))); }}
    onBlurCapture={event => { if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setEditing(false); }}>
    <header className="lc-view-header" data-loading={view.loading || undefined}>
      {canBack ? <IconButton label="Back" aria-keyshortcuts="Escape" onClick={() => requestClose('back')}><LineIcon name="back" /></IconButton> : collection ? <span className="lc-view-search-glyph" aria-hidden="true"><LineIcon name="search" /></span> : null}
      {collection ? <TextField label={view.title} type="search" role="combobox" data-view-query="true" value={frame.query} placeholder={view.search.placeholder}
        aria-expanded={items.length > 0} aria-haspopup={grid ? 'grid' : 'listbox'} aria-autocomplete="list" aria-controls={`${prefix}-results`}
        aria-activedescendant={selected && items.length ? itemId(selected) : undefined} onChange={event => changeQuery(event.target.value)} />
        : <h1>{view.title}</h1>}
      {view.loading && <span className="lc-view-progress" aria-hidden="true" />}
    </header>
    {requestError && <p role="alert" className="lc-view-status" data-kind="error">This request could not be sent. Check its size and try again.</p>}
    {/* Collections without rows show the Loading plate; otherwise the header hairline is paired with a polite status. */}
    {view.loading && (!collection || items.length > 0) && <span className="lc-view-announcement" role="status" aria-live="polite">{collection ? 'Refreshing results…' : 'Loading…'}</span>}
    {view.status && <div className="lc-view-band" data-kind={view.status.kind}><span className="lc-view-band-glyph" aria-hidden="true"><LineIcon name={view.status.kind === 'error' ? 'stateError' : 'info'} /></span><p className="lc-view-status" data-kind={view.status.kind} role={view.status.kind === 'error' ? 'alert' : 'status'}>{view.status.message}</p></div>}
    <div className="lc-view-scroll" ref={scroller} onScroll={event => session.saveScroll(view.viewId, event.currentTarget.scrollTop)}>{content}</div>
    <footer className="lc-view-footer">
      {/* Selected object context. The ViewModel carries no object-type field, so no type label is inferred. */}
      <span className="lc-footer-context" title={selected?.title ?? view.title}>
        {selected ? <ItemGlyph icon={selected.icon} host={host} small /> : null}
        <span className="lc-footer-title" dir="auto">{selected?.title ?? view.title}</span>
      </span>
      <div className="lc-footer-actions">
        {footerPrimary && <Button variant="ghost" className="lc-footer-verb" aria-disabled={Boolean(footerPrimary.disabledReason)} title={footerPrimary.disabledReason} onClick={() => invoke(footerPrimary.id)}><span className="lc-footer-label">{footerPrimary.title}</span>{!editing && <ShortcutHint keys={['Enter']} />}</Button>}
        {secondary && <><span className="lc-footer-separator" aria-hidden="true" /><Button variant="ghost" className="lc-footer-verb" aria-disabled={Boolean(secondary.disabledReason)} title={secondary.disabledReason} onClick={() => invoke(secondary.id)}><span className="lc-footer-label">{secondary.title}</span>{!editing && <ShortcutHint keys={['Ctrl', 'Enter']} />}</Button></>}
        {footerPrimary && <span className="lc-footer-separator" aria-hidden="true" />}
        <Button variant="ghost" className="lc-footer-verb" aria-haspopup="dialog" aria-expanded={panel && active} onClick={() => setPanel(true)}><span className="lc-footer-label">Actions</span> <ShortcutHint keys={['Ctrl', 'K']} /></Button>
      </div>
    </footer>
    {panel && active && <ActionPanel actions={actions} context={selected?.title ?? view.title} invoke={invoke} close={() => setPanel(false)} host={host} />}
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
