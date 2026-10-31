import { useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore } from 'react';
import { Button,EmptyState,GlyphTile,LineIcon,LoadingState,StatePlate,ThemeProvider } from '@linuxcast/ui';
import type { PermissionSettingsApi } from '../../../platform-contracts/src/permission-settings.ts';
import { PermissionScreenController } from './controller.ts';
import { decisionText,operations,removalConsequence,reviewName,sourceKinds,sourceTiles,versionText } from './presentation.ts';
import './permissions.css';

/**
 * Existing Saved permissions window in the selected Instrument settings composition (docs/design/DESIGN.md
 * "Settings and permissions", "List, grid, detail and form", "States and motion", "Accessibility").
 * Presentation only: the controller and main own snapshots, opaque selections, compare-delete and outcomes.
 */
export function SavedPermissions({api}:{api:PermissionSettingsApi}) {
  const [controller]=useState(()=>new PermissionScreenController(api));
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  const [review,setReview]=useState<string|null>(null),refresh=useRef<HTMLButtonElement>(null),keep=useRef<HTMLButtonElement>(null),opener=useRef<HTMLElement|null>(null);
  const restore=useRef<HTMLElement|null>(null);
  const initializedFocus=useRef(false);
  const selected=state.snapshot?.records.find(row=>row.selectionId===review),busy=state.loading||state.removing;
  useEffect(()=>{void controller.refresh();return()=>controller.dispose();},[controller]);
  useLayoutEffect(()=>{if(!initializedFocus.current){initializedFocus.current=true;refresh.current?.focus();}},[]);
  useEffect(()=>{if(review)keep.current?.focus();},[review]);
  useEffect(()=>{if(review&&!selected){restore.current=refresh.current;setReview(null);}},[review,selected]);
  useLayoutEffect(()=>{if(!review&&!busy&&restore.current){const target=restore.current.isConnected?restore.current:refresh.current;restore.current=null;target?.focus();}},[review,busy]);
  const closeReview=()=>{restore.current=opener.current?.isConnected?opener.current:refresh.current;setReview(null);};
  const records=state.snapshot?.records??[];
  return <ThemeProvider appearance={state.appearance??'system'} className="permission-window">
    <div className="permission-shell" onKeyDown={event=>{
      if(event.key==='Escape'&&!event.nativeEvent.isComposing&&!event.altKey&&!event.ctrlKey&&!event.metaKey){
        event.preventDefault();if(state.removing)return;if(review)closeReview();else void api.close();
      }
    }}>
      <header className="permission-header">
        <GlyphTile category="system" icon="gear"/>
        <p className="permission-header-title">Linuxcast settings</p>
        <div className="permission-header-actions">
          <Button ref={refresh} busy={state.loading} disabled={state.removing} onClick={()=>{setReview(null);void controller.refresh();}}>Refresh</Button>
          <Button variant="ghost" shortcut={['Escape']} disabled={state.removing} onClick={()=>{void api.close();}}>Close</Button>
        </div>
      </header>
      <main className="permission-content">
        <div className="permission-page">
          <h1>Saved permissions</h1>
          <p className="permission-lede lc-muted">Review remembered allow and deny choices. Each choice applies to its saved source version and declared scope.</p>
          <aside className="permission-notice" aria-label="About saved decisions">
            <LineIcon name="info"/>
            <p>These are saved decisions, not proof that a desktop capability is currently available. Every operation checks its current permissions and backend.</p>
          </aside>
          {state.message&&<p role="status" className="permission-message"><LineIcon name="info"/><span>{state.message}</span></p>}
          {state.error&&<StatePlate kind="unavailable" layout="band" title="Review current permissions" description={state.error} announce/>}
          {state.loading&&<LoadingState label="Reading saved permissions…"/>}
          {!state.loading&&!state.error&&state.snapshot?.records.length===0&&<EmptyState title="No saved decisions on this page" description="Allow once is never saved. A source asks again when it needs access without a remembered choice."/>}
          {selected&&<section className="permission-review" aria-labelledby="permission-review-title" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();event.preventDefault();if(!state.removing)closeReview();}}}>
            <div className="permission-review-heading">
              <p className="permission-eyebrow">Review removal</p>
              <h2 id="permission-review-title">Remove this saved {selected.decision==='allow'?'allow':'deny'} choice?</h2>
            </div>
            <div className="permission-review-details lc-focus" role="region" tabIndex={0} aria-label="Complete saved decision">
              <dl className="permission-facts">
                <div><dt>Requesting source</dt><dd dir="auto"><strong>{selected.sourceLabel}</strong> <span className="lc-muted">· {sourceKinds[selected.sourceKind]}</span></dd></div>
                <div><dt>Version</dt><dd dir="auto">{versionText(selected)}</dd></div>
                <div><dt>Operation</dt><dd>{operations[selected.permissionId]} <code className="permission-id">{selected.permissionId}</code></dd></div>
                <div><dt>Declared scope</dt><dd dir="auto">{selected.scopeLabel}</dd></div>
                <div><dt>Current decision</dt><dd><Decision decision={selected.decision} text={decisionText(selected)}/></dd></div>
              </dl>
            </div>
            <p className="permission-consequence">{removalConsequence(selected)}</p>
            <div className="permission-review-actions"><Button ref={keep} disabled={state.removing} onClick={closeReview}>Keep decision</Button><Button variant="danger" busy={state.removing} disabled={state.loading||state.unconfirmed} onClick={()=>{restore.current=refresh.current;void controller.revoke(selected.selectionId).then(()=>{setReview(null);});}}>Remove decision</Button></div>
          </section>}
          {records.length>0&&<ul className="permission-list" aria-label="Saved permission decisions">
            {records.map(row=><li key={row.selectionId} className="permission-row" aria-current={row.selectionId===review?'true':undefined}>
              <span className="permission-row-glyph"><GlyphTile category={sourceTiles[row.sourceKind]}/></span>
              <div className="permission-row-text">
                <div className="permission-row-title"><h2>{operations[row.permissionId]}</h2><Decision decision={row.decision} text={decisionText(row)}/></div>
                <dl className="permission-facts">
                  <div><dt>Source</dt><dd><span className="permission-clamp" dir="auto" title={row.sourceLabel}>{row.sourceLabel}</span> <span className="permission-source-kind lc-muted">{sourceKinds[row.sourceKind]}</span></dd></div>
                  <div><dt>Version</dt><dd><span className="permission-clamp" dir="auto" title={versionText(row)}>{versionText(row)}</span></dd></div>
                  <div><dt>Scope</dt><dd><span className="permission-clamp" data-lines="3" dir="auto" title={row.scopeLabel}>{row.scopeLabel}</span></dd></div>
                  <div><dt>Updated</dt><dd><time dateTime={row.updatedAt}>{new Date(row.updatedAt).toLocaleString()}</time></dd></div>
                </dl>
              </div>
              <div className="permission-row-actions">
                <Button disabled={busy||state.unconfirmed||!!review} aria-label={reviewName(row)} title={reviewName(row)} onClick={event=>{opener.current=event.currentTarget;setReview(row.selectionId);}}>Review removal</Button>
              </div>
            </li>)}
          </ul>}
          <nav className="permission-pages" aria-label="Saved decision pages"><Button disabled={busy||state.page===0} onClick={()=>{setReview(null);void controller.previous();}}>Previous page</Button><span>Page {state.page+1}</span><Button disabled={busy||state.unconfirmed||!state.snapshot?.nextCursor} onClick={()=>{setReview(null);void controller.next();}}>Next page</Button></nav>
        </div>
      </main>
    </div>
  </ThemeProvider>;
}

/** Remembered classification: the word is the signal, the glyph shape repeats it, colour stays neutral. */
function Decision({decision,text}:{decision:'allow'|'deny';text:string}) {
  return <span className="permission-decision" data-decision={decision}><LineIcon name={decision==='allow'?'check':'stateDenied'}/><span>{text}</span></span>;
}
