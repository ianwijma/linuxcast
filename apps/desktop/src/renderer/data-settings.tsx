import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, EmptyState, ErrorState, LoadingState, TextField, ThemeProvider } from '@linuxcast/ui';
import type { DataSettingsApi, DataSettingsClearCategory, DataSettingsExportCategory } from '@linuxcast/contracts';
import '@linuxcast/ui/styles.css';
import './data-settings.css';
const categories:[string,string,string,DataSettingsExportCategory|null,DataSettingsClearCategory|null][]=[
  ['settings','Settings','Export appearance, shortcuts and collection preferences. Credentials and permission grants are excluded.','settings',null],
  ['command-usage','Command usage','Clear usage counts and last-used times. Your pins and aliases stay.','command-usage','command-usage'],
  ['ai-conversations','AI conversations','Export conversations as unencrypted JSON, or delete conversations and their message revisions.','ai-conversations','ai-conversations'],
  ['file-index','File index','Clear indexed metadata. Selected folders and original files stay.',null,'file-index'],
  ['application-logs','Application logs','Export or reset local event metadata. No content bodies or credentials. Kept for 14 days, up to 20 MiB. New events may appear after clearing.','application-logs','application-logs'],
  ['tool-diagnostics','Tool diagnostics','Export or reset local tool event metadata. No tool arguments, results or credentials. Kept for 30 days, up to 100 MiB. Each category is managed separately.','tool-diagnostics','tool-diagnostics'],
];
function DataSettings(){
  const api=(window as unknown as {linuxcastData?:DataSettingsApi}).linuxcastData;
  const [appearance,setAppearance]=useState<'dark'|'light'>();
  const [ready,setReady]=useState(false),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[message,setMessage]=useState('');
  const search=useRef<HTMLInputElement>(null),active=useRef(true);
  const load=async()=>{setFailed(false);if(!api){setFailed(true);return;}const result=await api.getState();if(active.current){setReady(result.ok);setFailed(!result.ok);if(result.ok)setAppearance(result.value.appearance);}};
  useEffect(()=>{active.current=true;const remove=api?.onAppearance(setAppearance);void load();search.current?.focus();return()=>{active.current=false;remove?.();};},[api]); // API is a frozen preload object.
  const run=async(kind:'export'|'clear',category:DataSettingsExportCategory|DataSettingsClearCategory)=>{
    if(!api||busy||!ready)return;setBusy(true);setMessage('');
    const result=await(kind==='export'?api.exportCategory(category as DataSettingsExportCategory):api.clearCategory(category as DataSettingsClearCategory));
    if(!active.current)return;setBusy(false);
    setMessage(result.ok?(result.value.outcome==='saved'?'Export saved.':result.value.outcome==='cleared'?'Data cleared.':'Action cancelled.'):result.error.message);
  };
  const visible=categories.filter(([,title,description])=>`${title} ${description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
  return <ThemeProvider appearance={appearance??'system'}><main className="data-settings" onKeyDown={event=>{
    if(event.key==='Escape'&&!event.nativeEvent.isComposing&&!event.ctrlKey&&!event.altKey&&!event.metaKey){event.preventDefault();void api?.close();}
  }}>
    <header className="data-settings-header"><div><p className="lc-muted">Linuxcast settings</p><h1>Local data</h1></div><Button disabled={!api} onClick={()=>{void api?.close();}}>Close settings</Button></header>
    <TextField ref={search} type="search" label="Search data categories" value={query} onChange={event=>setQuery(event.target.value)} />
    <p className="lc-muted">Exports are unencrypted JSON. Choose a new filename; existing files are kept. Deletion is local and does not securely erase disk contents. Existing backups may retain earlier data.</p>
    {failed?<ErrorState title="Local data controls are unavailable" description="Close and reopen settings, or try again." action={<Button onClick={()=>{void load();}}>Try again</Button>} />
      :!ready?<LoadingState label="Opening data controls…" />
      :visible.length===0&&!(!query.trim()||'credentials openrouter key storage'.includes(query.toLocaleLowerCase().trim()))?<EmptyState title="No matching categories" description="Try another category name." />
      :<div className="data-settings-categories">{(!query.trim()||'credentials openrouter key storage'.includes(query.toLocaleLowerCase().trim()))&&<section aria-labelledby="credential-category"><div><h2 id="credential-category">Credentials</h2><p className="lc-muted">Manage the OpenRouter key, storage mode and session-only clearing. Provider and model selection are separate.</p></div><Button disabled={busy} onClick={()=>{void api?.openCredentials().then(reply=>{if(active.current&&!reply.ok)setMessage('Credential settings could not be opened.');});}}>Manage credentials</Button></section>}{visible.map(([id,title,description,exportCategory,clearCategory])=><section key={id} aria-labelledby={`category-${id}`}>
        <div><h2 id={`category-${id}`}>{title}</h2><p className="lc-muted">{description}</p></div>
        <div className="data-settings-actions">
          {exportCategory&&<Button busy={busy} disabled={!ready} aria-label={`Export ${title.toLowerCase()}`} onClick={()=>{void run('export',exportCategory);}}>Export</Button>}
          {clearCategory&&<Button variant="danger" busy={busy} disabled={!ready} aria-label={`Clear ${title.toLowerCase()}`} onClick={()=>{void run('clear',clearCategory);}}>Clear…</Button>}
        </div>
      </section>)}</div>}
    <p className="data-settings-status" role="status" aria-live="polite">{busy?'Waiting for the data action…':message}</p>
  </main></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<DataSettings/>);
