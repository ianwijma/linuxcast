import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button,ThemeProvider } from '@linuxcast/ui';
import type { FileSearchApi,FileSearchRoot,FileSearchState } from '@linuxcast/contracts';
import '@linuxcast/ui/styles.css';
import { FileSearch } from '../src/index.tsx';
import './preview.css';
const rootId='11111111-1111-4111-8111-111111111111',generation='22222222-2222-4222-8222-222222222222';
const params=new URLSearchParams(location.search),mode=params.get('state');
const root:FileSearchRoot={id:rootId,name:'Public documents',displayPath:'/public-fixture/Documents',state:'ready',activity:'paused',generation,progress:{visited:8,indexed:6,excluded:1,denied:1,vanished:0,unsupported:0,watchFailures:0}};
function Fixture(){
  const [requested,setRequested]=useState('No request observed.');
  const [connection]=useState(()=>{
    const state:FileSearchState={revision:1,appearance:params.get('theme')==='light'?'light':'dark',roots:mode==='empty'?[]:[{...structuredClone(root),...(mode==='unavailable'?{state:'unavailable',activity:'unavailable'}:{})}]};
    const listeners=new Set<(value:FileSearchState)=>void>();
    const publish=()=>{state.revision++;for(const listener of listeners)listener(structuredClone(state));};
    const api:FileSearchApi={
      getState:async()=>{if(mode==='loading')return new Promise(()=>{});if(mode==='error')throw new Error('synthetic private detail');return {ok:true,value:structuredClone(state)};},
      onState:listener=>{listeners.add(listener);return ()=>{listeners.delete(listener);};},
      chooseFolder:async()=>{setRequested('Requested native folder chooser.');if(mode==='choose-cancelled')return {ok:true,value:{outcome:'cancelled'}};if(!state.roots.length)state.roots.push({...structuredClone(root),state:'idle',activity:'paused',generation:null,progress:null});publish();return {ok:true,value:{outcome:'selected',rootId}};},
      startIndex:async id=>{setRequested(`Requested index for ${id}.`);if(mode==='mutation-unknown')throw new Error('synthetic private detail');if(mode==='mutation-pending')await new Promise(resolve=>setTimeout(resolve,600));const found=state.roots.find(value=>value.id===id)!;found.activity='indexing';found.state='scanning';publish();return {ok:true,value:{outcome:'completed'}};},
      pauseIndex:async id=>{setRequested(`Requested pause for ${id}.`);state.roots.find(value=>value.id===id)!.activity='paused';publish();return {ok:true,value:{outcome:'completed'}};},
      removeFolder:async id=>{setRequested(`Requested metadata removal for ${id}.`);if(mode==='remove-cancelled')return {ok:true,value:{outcome:'cancelled'}};state.roots=state.roots.filter(value=>value.id!==id);publish();return {ok:true,value:{outcome:'completed'}};},
      search:async request=>{setRequested(`Requested local search: ${request.query}.`);if(mode==='search-error')throw new Error('synthetic private detail');if(mode==='search-loading')await new Promise(resolve=>setTimeout(resolve,600));const available=state.roots.some(value=>value.generation===generation);const paths=mode==='no-matches'?[]:['projects/public-notes.txt','reports/public-notes-summary.txt'];return {ok:true,value:{query:request.query,rootId:request.rootId??null,results:available?paths.map((path,index)=>({id:`${rootId}:${path}`,rootId,generation,path,kind:'file' as const,size:120+index,modifiedMs:1792886400000})):[]}};},
      close:async()=>{setRequested('Requested Close file search.');return {ok:true,value:{outcome:'completed'}};},
    };
    return {api,clear:()=>{for(const value of state.roots){value.activity='paused';value.state='idle';value.generation=null;value.progress=null;}publish();}};
  });
  return <ThemeProvider appearance={params.get('theme')==='light'?'light':'dark'}><div className="file-search-fixture"><FileSearch api={connection.api}/><aside aria-label="Fixture observations"><output aria-live="polite">{requested}</output><p className="lc-muted">Component fixture · public metadata only; requests are observed, not performed.</p><Button onClick={connection.clear}>Simulate index clear</Button></aside></div></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
