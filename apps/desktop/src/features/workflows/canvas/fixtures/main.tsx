import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, ThemeProvider } from '@linuxcast/ui';
import { WorkflowEditor } from '../index.tsx';
import { createFixtureOwner } from './owner.ts';
const params = new URLSearchParams(location.search), owner = createFixtureOwner(params.get('state') ?? '');
function Fixture() {
  const [, render] = useState(0), [closed, setClosed] = useState(false);
  const [api] = useState(() => ({ ...owner.api, write: async (...args: Parameters<typeof owner.api.write>) => { const reply = await owner.api.write(...args); render(value => value + 1); return reply; }, close: async () => { await owner.api.close(); setClosed(true); } }));
  return <ThemeProvider style={{minHeight: '100vh'}} appearance={params.get('theme') === 'light' ? 'light' : 'dark'}>
    {!closed ? <WorkflowEditor api={api} /> : <p>Fixture editor closed.</p>}
    <footer style={{ padding: 'var(--lc-space-24)' }}><Button onClick={() => { void owner.requestClose(); }}>Request window close</Button><output style={{ display:'block' }}>Observed owner writes: {owner.requests.length}. No execution requests.</output><p className="lc-muted">Component fixture · public synthetic in-memory owner; saves and window close are observations, not SQLite or native-session evidence.</p></footer>
  </ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
