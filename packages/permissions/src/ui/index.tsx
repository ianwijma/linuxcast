import { useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore } from 'react';
import { Button,EmptyState,ErrorState,LoadingState,ThemeProvider } from '@linuxcast/ui';
import type { PermissionSettingsApi,PermissionSettingsRow } from '../../../platform-contracts/src/permission-settings.ts';
import { PermissionScreenController } from './controller.ts';
import './permissions.css';
const operations:Record<PermissionSettingsRow['permissionId'],string>={
  'files.read':'Read selected files','files.write':'Write selected files','network.fetch':'Contact an allowed website','network.local':'Contact a local network service',
  'clipboard.read':'Read the current clipboard','clipboard.history':'Read selected clipboard history','clipboard.write':'Replace the clipboard','input.paste':'Paste into an application',
  'input.shortcut':'Send a shortcut to an application','applications.launch':'Open an application or selected file','windows.control':'Control a selected window','ai.generate':'Use the configured AI provider',
  'notifications.show':'Show notifications','background.run':'Run in the background','scripts.execute':'Run a sandboxed script',
};
const sourceKinds={builtin:'Linuxcast',workflow:'Workflow',extension:'Extension'} as const;
export function SavedPermissions({api}:{api:PermissionSettingsApi}) {
  const [controller]=useState(()=>new PermissionScreenController(api));
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  const [review,setReview]=useState<string|null>(null),refresh=useRef<HTMLButtonElement>(null),keep=useRef<HTMLButtonElement>(null),opener=useRef<HTMLElement|null>(null);
  const restore=useRef<HTMLElement|null>(null);
  const selected=state.snapshot?.records.find(row=>row.selectionId===review),busy=state.loading||state.removing;
  useEffect(()=>{void controller.refresh();return()=>controller.dispose();},[controller]);
  useEffect(()=>{if(review)keep.current?.focus();},[review]);
  useEffect(()=>{if(review&&!selected){restore.current=refresh.current;setReview(null);}},[review,selected]);
  useLayoutEffect(()=>{if(!review&&!busy&&restore.current){const target=restore.current.isConnected?restore.current:refresh.current;restore.current=null;target?.focus();}},[review,busy]);
  const closeReview=()=>{restore.current=opener.current?.isConnected?opener.current:refresh.current;setReview(null);};
  return <ThemeProvider appearance={state.appearance??'system'}>
    <main className="permission-screen" onKeyDown={event=>{
      if(event.key==='Escape'&&!event.nativeEvent.isComposing&&!event.altKey&&!event.ctrlKey&&!event.metaKey){
        event.preventDefault();if(state.removing)return;if(review)closeReview();else void api.close();
      }
    }}>
      <header className="permission-heading"><div><h1>Saved permissions</h1><p>Review remembered allow and deny choices. Each choice applies to its saved source version and declared scope.</p></div>
        <div className="permission-actions"><Button ref={refresh} busy={state.loading} disabled={state.removing} onClick={()=>{setReview(null);void controller.refresh();}}>Refresh</Button><Button disabled={state.removing} onClick={()=>{void api.close();}}>Close</Button></div>
      </header>
      <p className="lc-muted">These are saved decisions, not proof that a desktop capability is currently available. Every operation checks its current permissions and backend.</p>
      {state.message&&<p role="status" className="permission-message">{state.message}</p>}
      {state.error&&<ErrorState title="Review current permissions" description={state.error} announce/>}
      {state.loading&&<LoadingState label="Reading saved permissions…"/>}
      {!state.loading&&!state.error&&state.snapshot?.records.length===0&&<EmptyState title="No saved decisions on this page" description="Allow once is never saved. A source asks again when it needs access without a remembered choice."/>}
      {selected&&<section className="permission-review" aria-label="Remove saved decision" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();event.preventDefault();if(!state.removing)closeReview();}}}>
        <h2>Remove this saved {selected.decision==='allow'?'allow':'deny'} choice?</h2>
        <p><strong>{selected.sourceLabel}</strong> · {operations[selected.permissionId]}</p><p>{selected.scopeLabel}</p>
        <p>{selected.decision==='deny'?'Removing a denial permits a new request. It does not approve or rerun anything.':'Future operations will need a new approval. Pending requests for this source will be cancelled; an action already sent cannot be undone.'}</p>
        <div className="permission-actions"><Button ref={keep} disabled={state.removing} onClick={closeReview}>Keep decision</Button><Button variant="danger" busy={state.removing} disabled={state.loading||state.unconfirmed} onClick={()=>{restore.current=refresh.current;void controller.revoke(selected.selectionId).then(()=>{setReview(null);});}}>Remove decision</Button></div>
      </section>}
      <ul className="permission-list" aria-label="Saved permission decisions">
        {state.snapshot?.records.map(row=><li key={row.selectionId} className="permission-row">
          <div><p className="permission-source"><strong dir="auto">{row.sourceLabel}</strong><span className="lc-muted">{sourceKinds[row.sourceKind]}{row.version?' · version '+row.version:''}</span></p>
            <h2>{operations[row.permissionId]}</h2><p dir="auto">{row.scopeLabel}</p><p className="lc-muted">{row.decision==='allow'?'Remembered: allow':'Remembered: deny'} · Updated <time dateTime={row.updatedAt}>{new Date(row.updatedAt).toLocaleString()}</time></p></div>
          <Button disabled={busy||state.unconfirmed||!!review} aria-label={'Review removal: '+row.sourceLabel+' · '+operations[row.permissionId]} onClick={event=>{opener.current=event.currentTarget;setReview(row.selectionId);}}>Review removal</Button>
        </li>)}
      </ul>
      <footer className="permission-actions"><Button disabled={busy||state.page===0} onClick={()=>{setReview(null);void controller.previous();}}>Previous page</Button><span>Page {state.page+1}</span><Button disabled={busy||state.unconfirmed||!state.snapshot?.nextCursor} onClick={()=>{setReview(null);void controller.next();}}>Next page</Button></footer>
    </main>
  </ThemeProvider>;
}
