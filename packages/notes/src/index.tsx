import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button, TextField, ThemeProvider, useFocusRestore } from '@linuxcast/ui';
import { noteTitleSchema } from '@linuxcast/contracts';
import type { NotesApi } from '@linuxcast/contracts';
import { NotesController } from './controller.ts';
import { RichNoteEditor } from './editor.tsx';
import '@linuxcast/ui/styles.css';
import './styles.css';
export { NotesController } from './controller.ts';
export interface NotesProps{api:NotesApi}
export function Notes({api}:NotesProps){
 const titleRef=useRef<HTMLInputElement>(null),recoveryRef=useRef<HTMLElement>(null);
 const controller=useMemo(()=>new NotesController(api),[api]);const state=useSyncExternalStore(controller.subscribe,()=>controller.snapshot);const [appearance,setAppearance]=useState<'dark'|'light'>('dark');
 useEffect(()=>{let active=true;void api.getAppearance().then(value=>{if(active&&['dark','light'].includes(value))setAppearance(value);}).catch(()=>{});const theme=api.onAppearance(value=>{if(active)setAppearance(value);});const close=api.onCloseRequested(()=>controller.requestClose());controller.start();return()=>{active=false;controller.dispose();theme();close();};},[api,controller]);
 useLayoutEffect(()=>{titleRef.current?.focus();},[state.id]);
 useFocusRestore(state.reloadConfirm||state.closeFailed,recoveryRef);
 useLayoutEffect(()=>{if(state.reloadConfirm||state.closeFailed)recoveryRef.current?.querySelector<HTMLButtonElement>('button')?.focus();},[state.reloadConfirm,state.closeFailed]);
 return <ThemeProvider appearance={appearance}><main className="notes-workspace" onKeyDownCapture={event=>{if(event.nativeEvent.isComposing)return;if(event.key==='s'&&(event.ctrlKey||event.metaKey)){event.preventDefault();if(!event.repeat)void controller.save();}else if(event.key==='Enter'&&event.repeat&&!(event.target as HTMLElement).isContentEditable){event.preventDefault();event.stopPropagation();}}}>
  <header className="notes-header"><h1>Notes</h1><Button onClick={()=>void controller.newNote()} busy={state.busy||state.reading}>New note</Button><Button onClick={()=>void controller.requestClose()}>Close Notes</Button></header>
  <div className="notes-columns"><aside aria-label="Notes library" className="notes-library"><TextField label="Search notes" type="search" value={state.query} onChange={event=>controller.setQuery(event.target.value)} hint="Search stored titles and body text locally."/>
   {state.listing&&<p role="status">Loading notes…</p>}{state.listError&&<div role="alert"><p>{state.listError}</p><Button onClick={()=>void controller.reloadList()}>Retry search</Button></div>}
   <ul aria-label="Saved notes" className="notes-list">{state.rows.map(row=><li key={row.id}><button type="button" aria-current={row.id===state.id?'true':undefined} onClick={()=>void controller.select(row.id)}><strong>{row.title}</strong><span>{row.excerpt||'Empty note'}</span>{row.hasDraft&&<small>Draft differs from saved version</small>}</button></li>)}</ul>
   {!state.listing&&!state.listError&&!state.rows.length&&<p>{state.query?'No matching notes. Clear or change the search.':'No notes yet. Create a note to begin.'}</p>}{state.cursor&&<Button busy={state.listing} onClick={()=>void controller.reloadList(true)}>Load more notes</Button>}
  </aside><section aria-label="Note editor" className="notes-editor">
   {state.reading&&<p role="status">Loading stored note…</p>}
   {state.content&&state.id?<><TextField ref={titleRef} disabled={state.reading||state.closing} {...(!noteTitleSchema.safeParse(state.content.title).success?{error:'Use a nonblank title of at most 256 UTF-8 bytes, without control characters.'}:{})} label="Note title" value={state.content.title} onChange={event=>controller.editTitle(event.target.value)} required/>
    <div className="notes-actions"><Button variant="primary" busy={state.busy} disabled={state.blocked||state.reading||state.closing} onClick={()=>void controller.save()}>Save note</Button><span className="lc-muted">Ctrl+S · Drafts store after 500 ms; Save updates the saved version.</span></div>
    <RichNoteEditor key={state.id} disabled={state.reading||state.closing} document={state.content.document} onChange={document=>controller.editDocument(document)} onError={message=>controller.inputError(message)}/>
    <p className="lc-muted">{controller.unsaved?'Draft differs from the last saved version.':'Matches the last saved version.'}{controller.dirty?' Latest local edits are not stored yet.':''}</p>
    {(state.paused||state.blocked)&&<div className="notes-actions">{!state.blocked&&<Button busy={state.busy} onClick={()=>void controller.retry()}>Retry draft</Button>}<Button disabled={state.busy||state.reading} onClick={()=>controller.confirmReload()}>Reload stored note</Button></div>}
   </>:<div className="notes-empty"><h2>A quiet place for your notes</h2><p>Create a note or choose one from the library. Rich text and tasks stay in private local storage.</p></div>}
   {state.message&&<p role="status">{state.message}</p>}{state.error&&<p role="alert" className="notes-error">{state.error}</p>}
   {state.reloadConfirm&&<section ref={recoveryRef} role="alertdialog" aria-labelledby="notes-reload-title" className="notes-recovery"><h2 id="notes-reload-title">Reload stored note?</h2><p>Confirm the current stored revision. Your local edits stay here for review; no Save or draft is replayed. A previous write may already have been stored.</p><Button onClick={()=>controller.cancelReload()}>Keep editing</Button><Button onClick={()=>void controller.reconcile()}>Reload stored note now</Button></section>}
   {state.closeFailed&&<section ref={recoveryRef} role="alertdialog" aria-labelledby="notes-close-title" className="notes-recovery"><h2 id="notes-close-title">Latest changes could not be confirmed</h2><p>Keep editing or retry closing after recovery. Closing without latest changes does not undo earlier writes; they may already be stored.</p><Button onClick={()=>controller.keepEditing()}>Keep editing</Button><Button onClick={()=>void controller.requestClose()}>Retry close</Button><Button variant="danger" onClick={()=>void controller.closeWithoutFlush()}>Close without latest changes</Button></section>}
  </section></div><footer className="notes-footer">Local notes · Pin, archive, trash, revision restore, export, Quicknote and Markdown roundtrip are not available in this increment.</footer>
 </main></ThemeProvider>;
}
export default Notes;
