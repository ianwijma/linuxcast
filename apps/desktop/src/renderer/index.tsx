import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, ErrorState, Keycap, LoadingState, ThemeProvider, UnavailableState } from '@linuxcast/ui';
import type { DesktopShellApi, DesktopShellState } from '@linuxcast/contracts';
import '@linuxcast/ui/styles.css';
import './shell.css';



function Shell() {
  const api = (window as unknown as { linuxcast?: DesktopShellApi }).linuxcast;
  const [state, setState] = useState<DesktopShellState>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const content = useRef<HTMLElement>(null);
  const hide = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!api) { setError(true); return; }
    let active = true;
    let receivedEvent = false;
    const unsubscribe = api.onState(next => {
      receivedEvent = true;
      setState(next);
    });
    void api.getState().then(reply => {
      if (!active) return;
      if (reply.ok) { if (!receivedEvent) setState(reply.value); }
      else setError(true);
    });
    return () => { active = false; unsubscribe(); };
  }, [api]);
  useEffect(() => {
    if (!api || !content.current) return;
    const observer = new ResizeObserver(entries => {
      const height = Math.ceil(entries[0]?.borderBoxSize[0]?.blockSize ?? 0);
      if (height >= 32 && height <= 4096) void api.reportContentHeight(height);
    });
    observer.observe(content.current);
    return () => observer.disconnect();
  }, [api]);
  useEffect(() => { if (state?.visible) hide.current?.focus(); }, [state?.visible]);
  const command = async (kind: 'hide' | 'quit') => {
    if (!api || busy) return;
    setBusy(true);
    const reply = await (kind === 'hide' ? api.hideLauncher() : api.quit());
    setBusy(false);
    if (!reply.ok) setError(true);
  };
  return <ThemeProvider appearance={state?.appearance ?? 'system'}>
    <main ref={content} className="shell" onKeyDown={event => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault(); void command('hide');
      }
    }}>
      <header className="shell-header"><h1>Linuxcast</h1><span className="lc-muted">Application preview</span></header>
      <div className="shell-content">
        {error ? <ErrorState title="Linuxcast could not connect" description="Quit and reopen Linuxcast to try again." announce />
          : !state ? <LoadingState label="Opening Linuxcast…" />
          : <UnavailableState title="Search is not available yet" description="The application is taking shape. You can hide this window and reopen it with Linuxcast, or quit below." />}
        {state && !state.focused && <p className="lc-muted">Select the Linuxcast window to use the keyboard.</p>}
      </div>
      <footer className="shell-footer">
        <span className="lc-muted"><Keycap>Esc</Keycap> Hide window</span>
        <div className="shell-actions">
          <Button ref={hide} busy={busy} disabled={!api} onClick={() => { void command('hide'); }}>Hide</Button>
          <Button busy={busy} disabled={!api} onClick={() => { void command('quit'); }}>Quit Linuxcast</Button>
        </div>
      </footer>
    </main>
  </ThemeProvider>;
}

createRoot(document.getElementById('root')!).render(<Shell />);
