import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@linuxcast/ui';
import type { LauncherApi,LauncherCommandsSnapshot } from '@linuxcast/contracts';
import '@linuxcast/ui/styles.css';
import { Launcher } from '../index.tsx';
import './preview.css';
const params=new URLSearchParams(location.search),mode=params.get('state');
const snapshot:LauncherCommandsSnapshot={revision:1,rankingAvailable:mode!=='ranking-unavailable',commands:[
  {id:'linuxcast:open-local-data',title:'Local data',subtitle:'Manage saved data and privacy',aliases:['data'],keywords:['privacy','settings','retention'],enabled:mode!=='disabled',...(mode==='disabled'?{unavailableReason:'Local data is unavailable. Reopen Linuxcast to try again.'}:{}),usage:null},
  {id:'linuxcast:hide',title:'Hide Linuxcast',subtitle:'Keep Linuxcast running in the background',aliases:['hide'],keywords:['dismiss'],enabled:true,usage:null},
  {id:'linuxcast:quit',title:'Quit Linuxcast',subtitle:'Close Linuxcast and stop background work',aliases:['quit'],keywords:['exit'],enabled:true,usage:null},
]};
function Fixture(){
  const [requested,setRequested]=useState('No command requested.');
  const [api]=useState<LauncherApi>(()=>({getLauncherCommands:async()=>{if(mode==='loading')return new Promise(()=>{});if(mode==='error')throw new Error('synthetic fixture error');return {ok:true,value:snapshot};},executeLauncherCommand:async request=>{setRequested(`Requested ${request.commandId}.`);if(mode==='execution-error')throw new Error('synthetic fixture error');return {ok:true,value:{outcome:'dispatched'}};}}));
  return <ThemeProvider appearance={params.get('theme')==='light'?'light':'dark'}><main className="launcher-fixture"><Launcher api={api} visible onDismiss={async()=>{setRequested('Requested Hide.');return {ok:true,value:null};}}/><output aria-live="polite">{requested}</output><p className="lc-muted">Component fixture · command requests are observed, not executed.</p></main></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
