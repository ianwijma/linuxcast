import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, ErrorState, Keycap, LoadingState, ThemeProvider } from '@linuxcast/ui';
import type { DesktopShellApi, DesktopShellState } from '@linuxcast/contracts';
import '@linuxcast/ui/styles.css';
import './shell.css';
import { Launcher } from '../features/launcher/index.tsx';
import { observeShellSize } from './shell-sizing.ts';



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
    return observeShellSize(content.current, height => { void api.reportContentHeight(height); });
  }, [api]);
  useEffect(() => { if (state?.visible !== false && error) hide.current?.focus(); }, [state?.visible, error]);
  const command = async (kind: 'hide' | 'quit') => {
    if (!api || busy) return;
    setBusy(true);
    const reply = await (kind === 'hide' ? api.hideLauncher() : api.quit());
    setBusy(false);
    if (!reply.ok) setError(true);
  };
  return <ThemeProvider appearance={state?.appearance ?? 'system'}>
    <main ref={content} className="shell" onKeyDown={event => {
      if (!event.defaultPrevented && event.key === 'Escape' && !event.nativeEvent.isComposing && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault(); void command('hide');
      }
    }}>
      {(!state || error || !api) && <h1 className="lc-view-announcement">Linuxcast</h1>}
      <div className={state && api && !error ? "shell-launcher" : "shell-content"}>
        {error ? <ErrorState title="Linuxcast could not connect" description="Quit and reopen Linuxcast to try again." announce />
          : !state ? <LoadingState label="Opening Linuxcast…" />
          : api ? <Launcher api={api} visible={state.visible} onDismiss={() => api.hideLauncher()} /> : null}
        {state && !state.focused && <p className="lc-muted">Select the Linuxcast window to use the keyboard.</p>}
      </div>
      {(!state || error || !api) && <footer className="shell-footer">
        <span className="lc-muted"><Keycap>Esc</Keycap> Hide window</span>
        <div className="shell-actions">
          <Button busy={busy} disabled={!api} onClick={() => { void api?.openDataSettings().then(reply => { if (!reply.ok) setError(true); }); }}>Local data</Button>
          <Button ref={hide} busy={busy} disabled={!api} onClick={() => { void command('hide'); }}>Hide</Button>
          <Button busy={busy} disabled={!api} onClick={() => { void command('quit'); }}>Quit Linuxcast</Button>
        </div>
      </footer>}
    </main>
  </ThemeProvider>;
}

createRoot(document.getElementById('root')!).render(<Shell />);
