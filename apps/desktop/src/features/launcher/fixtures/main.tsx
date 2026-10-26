import { buildWebSearchUrl } from '@linuxcast/quicklinks/web-search';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button,ThemeProvider } from '@linuxcast/ui';
import type { LauncherApi,QuicklinkApi,QuicklinkRecord,LauncherCommandsSnapshot } from '@linuxcast/contracts';
import '@linuxcast/ui/styles.css';
import { Launcher } from '../index.tsx';
import './preview.css';
const params=new URLSearchParams(location.search),mode=params.get('state');
const snapshot:LauncherCommandsSnapshot={revision:1,rankingAvailable:mode!=='ranking-unavailable',commands:[
  {id:'linuxcast:open-local-data',title:'Local data',subtitle:'Manage saved data and privacy',aliases:['data'],keywords:['privacy','settings','retention'],enabled:mode!=='disabled',...(mode==='disabled'?{unavailableReason:'Local data is unavailable. Reopen Linuxcast to try again.'}:{}),usage:null},
  {id:'linuxcast:hide',title:'Hide Linuxcast',subtitle:'Keep Linuxcast running in the background',aliases:['hide'],keywords:['dismiss'],enabled:true,usage:null},
  {id:'linuxcast:quit',title:'Quit Linuxcast',subtitle:'Close Linuxcast and stop background work',aliases:['quit'],keywords:['exit'],enabled:true,usage:null},
]};
const quicklinkMode=mode?.startsWith('quicklink-entry'),quicklinkId=(index:number)=>`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
const quicklinkRecords:QuicklinkRecord[]=Array.from({length:mode==='quicklink-entry-many'?120:2},(_,index)=>({id:quicklinkId(index+1),revision:1,name:index===0?'Public documentation':index===1?'Public web search':`Public saved ${index+1}`,url:index===1?'https://search.example/find':`https://public${index+1}.example/docs`,tags:index===0?['Research']:index===1?['Reference']:['Later'],...(index===1?{webSearch:{queryParameter:'q',template:'{{vars.query}}' as const}}:{}),createdAt:'2026-10-27T00:00:00.000Z',updatedAt:'2026-10-27T00:00:00.000Z'}));
if(quicklinkMode){snapshot.visibilityAvailable=true;snapshot.commands.push({id:'linuxcast:open-quicklinks',title:'Quicklinks',aliases:[],keywords:[],enabled:mode!=='quicklink-entry-parent-disabled',...(mode==='quicklink-entry-parent-disabled'?{unavailableReason:'Saved definitions are temporarily unavailable.'}:{}),...(mode==='quicklink-entry-parent-hidden'?{hidden:true}:{}),usage:null},...quicklinkRecords.map(record=>({id:`quicklink:${record.id}`,title:record.name,subtitle:new URL(record.url).host,aliases:[],keywords:[new URL(record.url).host,...record.tags??[]],enabled:true,usage:null,quicklink:{id:record.id,revision:record.revision}})));}
const applicationMode=mode==='applications'||mode==='application-unknown'||mode?.startsWith('alias')||mode?.startsWith('desktop-actions');
if(mode?.startsWith('url'))snapshot.commands.push({id:'linuxcast:open-url',title:'Open URL',subtitle:'Hand an HTTP or HTTPS address to your default browser',aliases:['url'],keywords:['browser','http','https'],enabled:mode!=='url-disabled',...(mode==='url-disabled'?{unavailableReason:'Browser handoff is unavailable. Reload commands to try again.'}:{}),usage:null});
if(mode?.startsWith('alias'))snapshot.commands[1]!.usage={useCount:4,lastUsedAt:'2026-10-25T00:00:00Z',pinned:false,alias:'conceal'};
if(applicationMode){snapshot.applicationState='available';snapshot.commands.push(...['Public Notes','Public Calculator'].map((title,index)=>({id:`application:${String(index+1).repeat(64)}`,provider:'applications' as const,title,subtitle:'Synthetic application fixture',aliases:[],keywords:['public'],enabled:true,usage:null})));}
if(mode?.startsWith('desktop-actions')){
  snapshot.visibilityAvailable=true;
  snapshot.commands[3]!.applicationActions={available:mode!=='desktop-actions-unavailable',actions:mode==='desktop-actions-unavailable'||mode==='desktop-actions-empty'?[]:[{id:'NewWindow',title:'New Window'},{id:'scratch-pad',title:'Open Scratchpad'}]};
}
if(mode==='applications-unavailable')snapshot.applicationState='unavailable';
const visibilityMode=mode?.startsWith('visibility');
if(visibilityMode){
  snapshot.visibilityAvailable=mode!=='visibility-unavailable';
  snapshot.commands.push({id:`application:${'4'.repeat(64)}`,provider:'applications',title:'Public Hidden Notes',subtitle:'Synthetic hidden application metadata',aliases:['notes'],keywords:[],enabled:false,unavailableReason:'Synthetic application is unavailable.',hidden:true,usage:{pinned:true,useCount:3,lastUsedAt:'2026-10-25T00:00:00Z',alias:'public-hidden'}});
  if(mode==='visibility-later')snapshot.commands.push(...Array.from({length:110},(_,index)=>({id:`application:${(index+100).toString(16).padStart(64,'0')}`,provider:'applications' as const,title:`Public Tool ${String(index).padStart(3,'0')}`,aliases:[],keywords:[],enabled:true,usage:null})));
}
function Fixture(){
  const [requested,setRequested]=useState('No command requested.');const [visible,setVisible]=useState(true);
  const [api]=useState<LauncherApi&QuicklinkApi>(()=>{
    const saved=structuredClone(snapshot);let quicklinkOpens=0,urlRequests=0,visibilityRequests=0,applicationActionRequests=0;
    const page=(cursor?:string)=>{const offset=cursor?Number(cursor.split(':')[1]):0,limit=quicklinkMode?100:visibilityMode?100:applicationMode?3:saved.commands.length;return structuredClone({...saved,commands:saved.commands.slice(offset,offset+limit),nextCursor:offset+limit<saved.commands.length?`${saved.revision}:${offset+limit}`:null});};
    return {...(quicklinkMode?{listQuicklinks:async()=>{if(mode==='quicklink-entry-pending')await new Promise(resolve=>setTimeout(resolve,1400));if(mode==='quicklink-entry-storage')throw new Error('synthetic private storage detail');const records=structuredClone(quicklinkRecords);if(mode==='quicklink-entry-stale')records[0]!.revision++;if(mode==='quicklink-entry-hidden')records[0]!.hidden=true;if(mode==='quicklink-entry-deleted')records.shift();return {ok:true as const,value:{records:records.map(({id,revision,name,url,tags,webSearch,hidden})=>({id,revision,name,host:new URL(url).host,...(tags?{tags}:{}),...(webSearch?{webSearch:true as const}:{}),...(hidden?{hidden:true}: {})}))}};},getQuicklink:async(request:{id:string;revision:number})=>({ok:true as const,value:{record:structuredClone(quicklinkRecords.find(record=>record.id===request.id&&record.revision===request.revision)!)}}),openQuicklink:async(request:{id:string;revision:number;query?:string})=>{setRequested(`Observed saved handoff ${++quicklinkOpens}: ${request.query===undefined?'saved identity only':'captured query only'}.`);const record=quicklinkRecords.find(record=>record.id===request.id)!;return {ok:true as const,value:{id:request.id,revision:request.revision,outcome:'dispatched' as const,...(request.query===undefined?{}:{webSearch:{query:request.query,url:buildWebSearchUrl(record.url,record.webSearch!,request.query)}})}};}}:{}),...(mode==='desktop-actions-missing'?{}:{executeApplicationAction:async request=>{
        setRequested(`Observed application action ${++applicationActionRequests}: ${request.actionId} for ${request.commandId}.`);
        if(mode==='desktop-actions-pending')await new Promise(resolve=>setTimeout(resolve,1400));
        if(mode==='desktop-actions-denied')return {ok:false as const,error:{code:'capability-unavailable' as const,message:'synthetic private application action detail',retryable:false}};
        if(mode==='desktop-actions-unknown')throw new Error('synthetic private application action detail');
        return {ok:true as const,value:{outcome:'requested' as const,actionId:mode==='desktop-actions-mismatch'?'not-requested':request.actionId}};
      }}),openLauncherUrl:async request=>{
        setRequested(`Requested URL ${request.url}.`);
        if(mode==='url-pending')await new Promise(resolve=>setTimeout(resolve,600));
        if(mode==='url-unknown')return {ok:false,error:{code:'deadline-exceeded',message:'synthetic private URL detail',retryable:false}};
        if(mode==='url-unavailable' && ++urlRequests===1)return {ok:false,error:{code:'capability-unavailable',message:'synthetic private URL detail',retryable:false}};
        return {ok:true,value:{outcome:'dispatched'}};
      },getLauncherCommands:async request=>{if(mode==='loading')return new Promise(()=>{});if(mode==='error')throw new Error('synthetic fixture error');return {ok:true,value:page(request?.cursor)};},
      ...(mode==='visibility-missing'?{}:{setLauncherHidden:async request=>{
        setRequested(`Observed visibility request ${++visibilityRequests}: ${request.hidden?'hide':'show'} ${request.commandId}.`);
        if(mode==='visibility-pending')await new Promise(resolve=>setTimeout(resolve,1400));
        if(mode==='visibility-unknown')throw new Error('synthetic private visibility detail');
        if(mode==='visibility-denied')return {ok:false as const,error:{code:'capability-unavailable' as const,message:'synthetic private visibility detail',retryable:false}};
        saved.commands.find(command=>command.id===request.commandId)!.hidden=request.hidden;saved.revision++;return {ok:true as const,value:page()};
      }}),
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
  return <ThemeProvider appearance={params.get('theme')==='light'?'light':'dark'}><main className="launcher-fixture"><Launcher api={api} visible={visible} onDismiss={async()=>{if(mode==='desktop-actions-hide-failed')return {ok:false,error:{code:'capability-unavailable',message:'synthetic Hide detail',retryable:false}};if(quicklinkMode||visibilityMode||mode?.startsWith('desktop-actions'))setVisible(false);else if(!mode?.startsWith('url'))setRequested('Requested Hide.');return {ok:true,value:null};}}/>{(quicklinkMode||visibilityMode||mode?.startsWith('desktop-actions'))&&<Button onClick={()=>setVisible(!visible)}>{visible?'Hide fixture window':'Show fixture window'}</Button>}<output aria-live="polite">{requested}</output><p className="lc-muted">Component fixture · command requests are observed, not executed.</p></main></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
