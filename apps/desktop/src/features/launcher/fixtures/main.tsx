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
const applicationMode=mode==='applications'||mode==='application-unknown'||mode?.startsWith('alias');
if(mode?.startsWith('url'))snapshot.commands.push({id:'linuxcast:open-url',title:'Open URL',subtitle:'Hand an HTTP or HTTPS address to your default browser',aliases:['url'],keywords:['browser','http','https'],enabled:mode!=='url-disabled',...(mode==='url-disabled'?{unavailableReason:'Browser handoff is unavailable. Reload commands to try again.'}:{}),usage:null});
if(mode?.startsWith('alias'))snapshot.commands[1]!.usage={useCount:4,lastUsedAt:'2026-10-25T00:00:00Z',pinned:false,alias:'conceal'};
if(applicationMode){snapshot.applicationState='available';snapshot.commands.push(...['Public Notes','Public Calculator'].map((title,index)=>({id:`application:${String(index+1).repeat(64)}`,provider:'applications' as const,title,subtitle:'Synthetic application fixture',aliases:[],keywords:['public'],enabled:true,usage:null})));}
if(mode==='applications-unavailable')snapshot.applicationState='unavailable';
function Fixture(){
  const [requested,setRequested]=useState('No command requested.');
  const [api]=useState<LauncherApi>(()=>{
    const saved=structuredClone(snapshot);let urlRequests=0;
    return {openLauncherUrl:async request=>{
        setRequested(`Requested URL ${request.url}.`);
        if(mode==='url-pending')await new Promise(resolve=>setTimeout(resolve,600));
        if(mode==='url-unknown')return {ok:false,error:{code:'deadline-exceeded',message:'synthetic private URL detail',retryable:false}};
        if(mode==='url-unavailable' && ++urlRequests===1)return {ok:false,error:{code:'capability-unavailable',message:'synthetic private URL detail',retryable:false}};
        return {ok:true,value:{outcome:'dispatched'}};
      },getLauncherCommands:async request=>{if(mode==='loading')return new Promise(()=>{});if(mode==='error')throw new Error('synthetic fixture error');return {ok:true,value:structuredClone(applicationMode?{...saved,commands:request?.cursor?saved.commands.slice(3):saved.commands.slice(0,3),nextCursor:request?.cursor?null:'1:3'}:saved)};},
      executeLauncherCommand:async request=>{setRequested(`Requested ${request.commandId}.`);if(mode==='application-unknown')return {ok:false,error:{code:'deadline-exceeded',message:'Synthetic private detail',retryable:false}};if(mode==='execution-error')throw new Error('synthetic fixture error');return {ok:true,value:{outcome:'dispatched'}};},
      setLauncherAlias:async request=>{
        setRequested(`Requested alias ${request.alias??'removal'} for ${request.commandId}.`);
        if(mode==='alias-failed')throw new Error('synthetic private alias error');
        if(mode==='alias-unavailable')return {ok:false,error:{code:'capability-unavailable',message:'Synthetic private detail',retryable:false}};
        if(mode==='alias-pending')await new Promise(resolve=>setTimeout(resolve,600));
        if(mode==='alias-conflict' || request.alias==='quit')return {ok:false,error:{code:'conflict',message:'Synthetic private detail',retryable:false}};
        const command=saved.commands.find(value=>value.id===request.commandId)!;
        command.usage={useCount:0,lastUsedAt:null,pinned:false,...command.usage,alias:request.alias};
        return {ok:true,value:{...structuredClone(saved),commands:[structuredClone(command)],updateOnly:true,nextCursor:null}};
      },
      setLauncherPinned:async request=>{
        setRequested(`Requested ${request.pinned?'pin':'unpin'} for ${request.commandId}.`);
        if(mode==='pin-failed')throw new Error('synthetic pin error');
        if(mode==='pin-pending')await new Promise(resolve=>setTimeout(resolve,600));
        const command=saved.commands.find(value=>value.id===request.commandId)!;
        command.usage={useCount:0,lastUsedAt:null,alias:null,...command.usage,pinned:request.pinned};
        return {ok:true,value:structuredClone(applicationMode?{...saved,commands:[command],updateOnly:true,nextCursor:null}:saved)};
      }};
  });
  return <ThemeProvider appearance={params.get('theme')==='light'?'light':'dark'}><main className="launcher-fixture"><Launcher api={api} visible onDismiss={async()=>{if(!mode?.startsWith('url'))setRequested('Requested Hide.');return {ok:true,value:null};}}/><output aria-live="polite">{requested}</output><p className="lc-muted">Component fixture · command requests are observed, not executed.</p></main></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
