import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, ThemeProvider } from '../../primitives/index.ts';
import type { Appearance } from '../../primitives/index.ts';
import { ViewSession, ViewRenderer } from '../index.ts';
import type { ViewHost } from '../types.ts';
import { list, grid, detail, form, split, glyphGrid, note, longList } from './models.ts';
import '../../primitives/primitives.css';
import '../views.css';
import './preview.css';

function Example() {
  const [appearance, setAppearance] = useState<Appearance>('dark');
  const [session, setSession] = useState(() => new ViewSession(list));
  const [event, setEvent] = useState('No action requested.');
  const [closed, setClosed] = useState('');
  const [sealed, setSealed] = useState(false);
  const host: ViewHost = {
    action: intent => { setEvent(`Requested ${intent.actionId} at revision ${intent.revision}${intent.itemId ? ` for ${intent.itemId}` : ''}${intent.values ? ` with ${Object.keys(intent.values).length} fields` : ''}.`); if (intent.actionId === 'open') session.navigate({ protocolVersion: 1, kind: 'push', fromViewId: intent.viewId, view: detail }); },
    openLink: () => setEvent('Public link intent received.'),
    sealSecret: async () => { setSealed(true); return { secretHandle: 'public-test-handle' }; }, releaseSecret: () => { setSealed(false); },
  };
  // Later snapshot that changes the first item's action count while the action panel may be open.
  const resizeActions = (count: number) => { window.setTimeout(() => { const current = session.getSnapshot().frames.at(-1)?.view; if (!current || current.kind !== 'list') return; session.update(current.viewId, { protocolVersion: 1, kind: 'snapshot', view: { ...current, revision: current.revision + 1, sections: current.sections.map((section, index) => index ? section : { ...section, items: section.items.map((item, position) => position ? item : { ...item, actions: Array.from({ length: count }, (_, number) => ({ id: `public-action-${String(number + 1).padStart(2, '0')}`, title: `Public action ${String(number + 1).padStart(2, '0')}`, kind: 'invoke' as const, effect: 'read' as const })) }) }) } }); }, 400); };
  const replace = (view: unknown) => { session.close(); setSession(new ViewSession(view, id => setClosed(id))); setEvent('No action requested.'); setSealed(false); };
  const refresh = () => { const current = session.getSnapshot().frames.at(-1)?.view; if (!current || current.kind !== 'list') return; session.update(current.viewId, { protocolVersion: 1, kind: 'snapshot', view: { ...current, revision: current.revision + 1, sections: [{ ...current.sections[0], items: [{ id: 'new', title: 'New arrival', actions: [current.sections[0]!.items[0]!.actions![0]] }, ...current.sections[0]!.items] }, ...current.sections.slice(1)] } }); };
  return <ThemeProvider appearance={appearance}><main className="view-example"><header><p className="example-kicker">LINUXCAST · COMPONENT EXAMPLES</p><h1>One familiar place to work.</h1><p className="lc-muted">Host-rendered views. Public synthetic content. No system operations.</p></header>
    <nav aria-label="Example views">{Object.entries({ List: list, Grid: grid, Detail: detail, Form: form, Split: split, 'Glyph grid': glyphGrid, Text: note, 'Long list': longList }).map(([name, view]) => <Button key={name} onClick={() => replace(view)}>{name}</Button>)}<Button onClick={() => setAppearance(appearance === 'dark' ? 'light' : 'dark')}>Switch theme</Button></nav>
    <ViewRenderer session={session} host={host} />
    <section className="example-controls" aria-label="Fixture controls"><Button onClick={refresh}>Async update</Button><Button onClick={() => { window.setTimeout(refresh, 400); }}>Delayed update</Button><Button onClick={() => resizeActions(24)}>Grow actions later</Button><Button onClick={() => resizeActions(1)}>Shrink actions later</Button><Button onClick={() => replace({ ...list, loading: true, sections: [] })}>Loading state</Button><Button onClick={() => replace({ ...list, sections: [] })}>Empty state</Button><Button onClick={() => replace({ ...list, status: { kind: 'error', message: 'The library could not refresh. Your existing items are still available.' } })}>Error state</Button><Button onClick={() => replace({ ...list, loading: true })}>Refreshing state</Button><Button onClick={() => replace({ ...list, status: { kind: 'warning', message: 'Directory access is required. Choose a directory in settings to continue.' } })}>Permission state</Button><Button onClick={() => replace({ ...detail, markdown: '<script>window.attack = true</script>\n\n<img src="https://example.org/track" onerror="alert(1)">\n\n[Bad](javascript:alert%281%29)\n\n![Tracking](https://example.org/pixel)\n\n[Safe](https://example.org/guide)' })}>Adversarial Markdown</Button><Button onClick={() => replace({ ...list, component: 'script', code: 'alert(1)' })}>Malformed view</Button><Button onClick={() => session.navigate({ protocolVersion: 1, kind: 'push', fromViewId: session.getSnapshot().frames.at(-1)?.view.viewId, view: detail })}>Push detail</Button></section>
    <output className="example-event" data-sealed={sealed} data-closed={closed}>{event}</output>
  </main></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Example />);
