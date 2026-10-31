import { useEffect, useId, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, EmptyState, ErrorState, GlyphTile, GroupCaption, IconButton, LineIcon, LoadingState, Row, ShortcutHint, StatePlate, TextField, ThemeProvider, UnavailableState, useFocusRestore, useTheme } from '../index.ts';
import type { GlyphCategory } from '../index.ts';
import '../primitives.css';
import './preview.css';

/* Public synthetic preview data. Rows describe example commands only; nothing runs. */
const RESULTS: { id: string; group: string; category: GlyphCategory | 'unknown-extension-category'; title: string; subtitle?: string; mono?: boolean; accessory?: string; keys?: string[] }[] = [
  { id: 'search-files', group: 'Commands', category: 'command', title: 'Search files', subtitle: 'Names and contents in your search roots', accessory: 'Command', keys: ['Alt', 'Shift', 'F'] },
  { id: 'clipboard', group: 'Commands', category: 'clipboard', title: 'Clipboard history', subtitle: 'Opt-in, example only' },
  { id: 'quicklinks', group: 'Commands', category: 'quicklink', title: 'Quicklinks', subtitle: 'Six saved links (synthetic)' },
  { id: 'checklist', group: 'Files', category: 'files', title: 'Launch checklist.md', subtitle: '~/Documents/Example/', mono: true },
  { id: 'note', group: 'Notes and workflows', category: 'notes', title: 'Launch checklist', subtitle: 'Note · 2 of 5 tasks done' },
  { id: 'workflow', group: 'Notes and workflows', category: 'workflow', title: 'Morning brief', subtitle: 'Workflow · draft' },
  { id: 'ask', group: 'Ask AI', category: 'ai', title: 'Summarise the launch checklist and every linked planning document with a deliberately long title that must truncate in the row', subtitle: 'Configured provider / configured model' },
  { id: 'extension', group: 'Ask AI', category: 'unknown-extension-category', title: 'Extension command', subtitle: 'Unknown category falls back to system' },
];

function ResultList() {
  const id = useId();
  const [cursor, setCursor] = useState(0);
  const [query, setQuery] = useState('');
  const shown = RESULTS.filter(item => item.title.toLowerCase().includes(query.trim().toLowerCase()));
  const active = Math.min(cursor, Math.max(shown.length - 1, 0));
  const groups = [...new Set(shown.map(item => item.group))];
  return <section className="preview-section preview-wide" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Rows, captions and glyph tiles</h2>
    <input className="lc-input lc-focus preview-query" role="combobox" aria-label="Filter example rows" aria-expanded="true" aria-controls={`${id}-list`}
      aria-activedescendant={shown.length ? `${id}-${shown[active]!.id}` : undefined} value={query} placeholder="Filter example rows…"
      onChange={event => { setQuery(event.target.value); setCursor(0); }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setCursor(Math.min(active + 1, shown.length - 1)); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setCursor(Math.max(active - 1, 0)); }
      }} />
    <div id={`${id}-list`} role="listbox" aria-label="Example results" className="preview-list">
      {groups.map(group => <div role="group" aria-label={group} key={group}>
        <GroupCaption label={group} count={shown.filter(item => item.group === group).length} aria-hidden="true" />
        {shown.filter(item => item.group === group).map(item => <Row key={item.id} id={`${id}-${item.id}`} role="option" aria-selected={shown[active]?.id === item.id}
          leading={<GlyphTile category={item.category} />} title={item.title} subtitle={item.subtitle} subtitleMono={item.mono} accessory={item.accessory} shortcut={item.keys}
          onClick={() => setCursor(shown.indexOf(item))} />)}
      </div>)}
    </div>
    {!shown.length && <EmptyState filtered layout="block" title={`No rows match “${query}”`} description="Clear the filter to see the example rows." action={<Button variant="ghost" onClick={() => setQuery('')}>Clear filter</Button>} />}
  </section>;
}

const EXPORTABLE = [{ id: 'a', title: 'Search files' }, { id: 'b', title: 'Clipboard history' }, { id: 'c', title: 'Quicklinks' }];
function MultiSelect() {
  const id = useId();
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set(['b']));
  const [focused, setFocused] = useState<string | null>(null);
  return <section className="preview-section" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Multi-selection</h2>
    <p className="lc-muted">Checkboxes record the choice; the rail follows the keyboard cursor only.</p>
    <div role="group" aria-labelledby={`${id}-title`} className="preview-list">
      <GroupCaption label="Choose commands" count={checked.size} flush />
      {EXPORTABLE.map(item => <Row key={item.id} title={item.title} current={focused === item.id} data-checked={checked.has(item.id)}
        leading={<input type="checkbox" className="lc-focus" aria-label={item.title} checked={checked.has(item.id)}
          onFocus={() => setFocused(item.id)} onBlur={() => setFocused(null)}
          onChange={event => setChecked(previous => { const next = new Set(previous); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} />} />)}
    </div>
  </section>;
}

function Preview() {
  const { appearance, setAppearance, reducedMotion } = useTheme();
  const [name, setName] = useState('Personal commands');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('No changes saved.');
  const [loading, setLoading] = useState(true);
  const [busyCount, setBusyCount] = useState(0);
  const [panel, setPanel] = useState(false);
  const scope = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useFocusRestore(panel, scope);
  useEffect(() => { if (panel) close.current?.focus(); }, [panel]);
  return <main className="preview">
    <header className="preview-header"><div><p className="preview-eyebrow">LINUXCAST / SHARED CONTROLS</p><h1>Ready for your next command.</h1><p className="lc-muted">Interactive component preview. Actions change this example only.</p></div>
      <div className="preview-toolbar" role="group" aria-label="Appearance">
        {(['system', 'dark', 'light'] as const).map(value => <Button key={value} aria-pressed={appearance === value} onClick={() => setAppearance(value)}>{value[0]!.toUpperCase() + value.slice(1)}</Button>)}
      </div>
    </header>
    <div className="preview-meta"><span>Opaque surface · {reducedMotion ? 'Reduced motion' : 'Standard motion'}</span><ShortcutHint keys={['Ctrl', 'K']} label="Control plus K" /></div>
    <div className="preview-grid">
      <section className="preview-section" aria-labelledby="form-title"><h2 id="form-title">Command preferences</h2>
        <form noValidate onSubmit={event => { event.preventDefault(); if (!name.trim()) { setError('Enter a name for this collection.'); return; } setError(''); setMessage('Example changes saved.'); }}>
          <TextField label="Collection name" required value={name} onChange={event => setName(event.target.value)} hint="Choose a name you can recognize in search." error={error} />
          <TextField label="Local search" type="search" placeholder="Search commands…" hint="Text stays in this component preview." />
          <TextField label="Unavailable setting" disabled value="Requires an enabled integration" readOnly />
          <div className="preview-actions"><Button type="submit" variant="primary" shortcut={['Enter']}>Save changes</Button><Button onClick={() => { setName('Personal commands'); setError(''); setMessage('Changes discarded.'); }}>Discard</Button></div>
          <p role="status" className="lc-muted">{message}</p>
        </form>
      </section>
      <section className="preview-section" aria-labelledby="actions-title"><h2 id="actions-title">Actions and keyboard focus</h2>
        <div className="preview-actions"><Button onClick={() => setPanel(true)}>Open details</Button><IconButton label="Show help" onClick={() => setMessage('Help opened in this example.')}><LineIcon name="info" /></IconButton></div>
        {panel && <div ref={scope} className="preview-details"><p>Details opened from the invoking button.</p><button ref={close} className="lc-button lc-focus" onClick={() => setPanel(false)}>Close details</button></div>}
        <div className="preview-actions"><Button busy onClick={() => setBusyCount(value => value + 1)}>Saving changes</Button><Button disabled>Unavailable</Button><Button variant="danger" onClick={() => setMessage('Example selection removed.')}>Remove selection</Button></div>
        <p className="lc-muted" data-busy-count={busyCount}>Busy actions keep keyboard focus and ignore activation.</p>
        <div className="preview-footer" role="group" aria-label="Example footer verbs">
          <Button variant="ghost" shortcut={['Ctrl', 'Enter']} onClick={() => setMessage('Example secondary verb.')}>Show in Files</Button>
          <Button variant="ghost" shortcut={['Ctrl', 'K']} onClick={() => setMessage('Example actions verb.')}>Actions</Button>
        </div>
        {loading ? <LoadingState label="Loading example commands…" action={<Button variant="quiet" onClick={() => setLoading(false)}>Cancel loading</Button>} /> : <p role="status">Loading cancelled.</p>}
      </section>
      <ResultList />
      <section className="preview-section preview-wide" aria-labelledby="narrow-title"><h2 id="narrow-title">Narrow row</h2>
        <div className="preview-narrow"><Row current leading={<GlyphTile category="system" />} title="Switch windows" subtitle="Window management (synthetic)" accessory="Temporarily unavailable" shortcut={['Alt', 'Shift', 'F']} /></div>
      </section>
      <MultiSelect />
      <EmptyState filtered title="No matching commands" description="Try another search or clear the filter to see your commands." action={<Button onClick={() => setMessage('Example filter cleared.')}>Clear filter</Button>} />
      <ErrorState title="Changes could not be saved" description="Your edits are still here. Try saving again." detail="example-store · write failed" action={<Button onClick={() => setMessage('Example retry requested.')}>Try again</Button>} />
      <UnavailableState reason="denied" title="Permission required" description="Enable this integration in Settings before using its commands." action={<Button onClick={() => setMessage('Example settings opened.')}>Open settings</Button>} />
      <UnavailableState reason="unsupported" title="Window switching isn’t available here" description="This session does not expose the capability. Nothing was run." detail="example-backend · unsupported" />
      <UnavailableState title="Example source needs review" description="Unclassified: the caller explains why; no session or permission cause is implied." />
      <EmptyState title="No commands yet" description="Add your first command when you are ready. Your existing settings are unchanged." />
      <section className="preview-section preview-wide" aria-labelledby="bands-title"><h2 id="bands-title">Inline state bands</h2>
        <div className="preview-bands">
          <StatePlate layout="band" kind="error" headingLevel={3} title="Example search stopped responding" description="Other groups keep working." detail="example-worker · timeout" />
          <StatePlate layout="band" kind="denied" headingLevel={3} title="Example folder access was declined" description="The extension continues without the folder." />
          <StatePlate layout="band" kind="interrupted" headingLevel={3} title="Example response stopped part-way" description="The partial text is marked as incomplete." />
          <StatePlate layout="band" kind="pending" headingLevel={3} title="Example approval needed" description="Nothing runs until you decide." />
          <StatePlate layout="band" kind="unsupported" headingLevel={3} title="Example preview isn’t supported" description="The last-known details stay visible." />
          <StatePlate layout="band" kind="success" headingLevel={3} title="Example confirmation" description="Shown only after a caller confirms a real result; this preview performs no operation." />
        </div>
      </section>
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<ThemeProvider><Preview /></ThemeProvider>);
