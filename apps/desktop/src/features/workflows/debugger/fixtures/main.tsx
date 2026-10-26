import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, ThemeProvider } from '@linuxcast/ui';
import { WorkflowRunPanel } from '../index.tsx';
import { createRunFixture, savedDefinition, multipleEntryDefinition } from './owner.ts';
const params = new URLSearchParams(location.search), owner = createRunFixture(params.get('state') ?? '');
function Fixture() {
  const [open, setOpen] = useState(true), [, render] = useState(0);
  const [initialEntry, setInitialEntry] = useState<string | undefined>(() => params.get('entry') ?? undefined);
  const entryFixture = params.has('entryIntent');
  const [api] = useState(() => ({ ...owner.api,
    startWorkflowRun: async (...args: Parameters<typeof owner.api.startWorkflowRun>) => { const pending = owner.api.startWorkflowRun(...args); render(value => value + 1); const result = await pending; render(value => value + 1); return result; },
    decideWorkflowRun: async (...args: Parameters<typeof owner.api.decideWorkflowRun>) => { const pending = owner.api.decideWorkflowRun(...args); render(value => value + 1); const result = await pending; render(value => value + 1); return result; },
    cancelWorkflowRun: async (...args: Parameters<typeof owner.api.cancelWorkflowRun>) => { const pending = owner.api.cancelWorkflowRun(...args); render(value => value + 1); const result = await pending; render(value => value + 1); return result; },
    resetWorkflowClipboardPermission: async (...args: Parameters<typeof owner.api.resetWorkflowClipboardPermission>) => { const pending = owner.api.resetWorkflowClipboardPermission(...args); render(value => value + 1); const result = await pending; render(value => value + 1); return result; },
  }));
  return <ThemeProvider appearance={params.get('theme') === 'light' ? 'light' : 'dark'} style={{ minHeight: '100vh' }}><main><h1 style={{padding:'var(--lc-space-24)',margin:0,fontSize:'var(--lc-text-panel-title)'}}>Workflow run component fixture</h1>{open ? <WorkflowRunPanel api={api} editorRevision={5} savedDefinition={entryFixture ? multipleEntryDefinition : savedDefinition} {...(initialEntry !== undefined ? { initialEntry } : {})} onClose={() => setOpen(false)} /> : <section style={{ padding: 'var(--lc-space-24)' }}><h1>Fixture editor</h1><Button onClick={() => setOpen(true)}>Open Run panel</Button></section>}</main><footer style={{ padding: 'var(--lc-space-24)' }}>{entryFixture && <div><Button onClick={() => setInitialEntry('second')}>Present second Keyword</Button><Button onClick={() => setInitialEntry('missing')}>Present unavailable Keyword</Button><output aria-label="Observed entry intent">Last explicit entry: {owner.calls.starts.at(-1)?.triggerNodeId ?? 'none'}</output></div>}<output>Observed requests: {owner.calls.starts.length} starts, {owner.calls.decisions.length} decisions, {owner.calls.cancels.length} cancellations, {owner.calls.resets.length} scoped resets.</output><p className="lc-muted">Component fixture · public synthetic host states and request observers. No worker, permission broker, clipboard, SQLite or native effects run here.</p></footer></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
