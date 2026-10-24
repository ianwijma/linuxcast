import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, EmptyState, ErrorState, IconButton, LoadingState, ShortcutHint, TextField, ThemeProvider, UnavailableState, useFocusRestore, useTheme } from '../index.ts';
import '../primitives.css';
import './preview.css';

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
          <div className="preview-actions"><Button type="submit" variant="primary">Save changes</Button><Button onClick={() => { setName('Personal commands'); setError(''); setMessage('Changes discarded.'); }}>Discard</Button></div>
          <p role="status" className="lc-muted">{message}</p>
        </form>
      </section>
      <section className="preview-section" aria-labelledby="actions-title"><h2 id="actions-title">Actions and keyboard focus</h2>
        <div className="preview-actions"><Button onClick={() => setPanel(true)}>Open details</Button><IconButton label="Show help" onClick={() => setMessage('Help opened in this example.')}><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"><circle cx="10" cy="10" r="7" /><path d="M8 7a2 2 0 0 1 4 0c0 2-2 2-2 4M10 13v1" /></svg></IconButton></div>
        {panel && <div ref={scope} className="preview-details"><p>Details opened from the invoking button.</p><button ref={close} className="lc-button lc-focus" onClick={() => setPanel(false)}>Close details</button></div>}
        <div className="preview-actions"><Button busy onClick={() => setBusyCount(value => value + 1)}>Saving changes</Button><Button disabled>Unavailable</Button><Button variant="danger" onClick={() => setMessage('Example selection removed.')}>Remove selection</Button></div>
        <p className="lc-muted" data-busy-count={busyCount}>Busy actions keep keyboard focus and ignore activation.</p>
        {loading ? <LoadingState label="Loading example commands…" action={<Button variant="quiet" onClick={() => setLoading(false)}>Cancel loading</Button>} /> : <p role="status">Loading cancelled.</p>}
      </section>
      <EmptyState title="No matching commands" description="Try another search or clear the filter to see your commands." action={<Button onClick={() => setMessage('Example filter cleared.')}>Clear filter</Button>} />
      <ErrorState title="Changes could not be saved" description="Your edits are still here. Try saving again." action={<Button onClick={() => setMessage('Example retry requested.')}>Try again</Button>} />
      <UnavailableState title="Permission required" description="Enable this integration in Settings before using its commands." action={<Button onClick={() => setMessage('Example settings opened.')}>Open settings</Button>} />
      <EmptyState title="No commands yet" description="Add your first command when you are ready. Your existing settings are unchanged." />
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<ThemeProvider><Preview /></ThemeProvider>);
