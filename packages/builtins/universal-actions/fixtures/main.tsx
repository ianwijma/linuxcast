import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@linuxcast/ui';
import { ViewSession,ViewRenderer } from '@linuxcast/ui/views';
import type { ViewHost } from '@linuxcast/ui/views';
import type { FileSearchApi,FileSearchRoot,FileSearchResult,ViewModel } from '@linuxcast/contracts';
import { COPY_INDEXED_PATH,IndexedPathCopy } from '../src/presentation.ts';
import type { IndexedPathContext } from '../src/presentation.ts';
import '@linuxcast/ui/styles.css';
import '@linuxcast/ui/views.css';
import './preview.css';
const params=new URLSearchParams(location.search),mode=params.get('state');
const rootId='11111111-1111-4111-8111-111111111111',generation='22222222-2222-4222-8222-222222222222';
const root:FileSearchRoot={id:rootId,name:'Public files',displayPath:'/public/Files',state:'ready',activity:'paused',generation,progress:null};
const rows:FileSearchResult[]=['report.txt','notes.txt'].map(path=>({id:`${rootId}:${path}`,rootId,generation,path,kind:'file',size:5,modifiedMs:0}));
function Fixture(){
 const [observed,setObserved]=useState('No clipboard request observed.');
 const [connection]=useState(()=>{
  let revision=1,selected=rows[0]!,detail:FileSearchResult|null=null,warning:string|undefined;
  const session=new ViewSession({protocolVersion:1,viewId:'results',revision,kind:'list',title:'Search files',search:{query:'',placeholder:'Search indexed names…',mode:'host'},sections:[{id:'files',items:rows.map(row=>({id:row.id,title:row.path,actions:[{id:'details',title:'Show details',kind:'invoke',effect:'read'}]}))}]},()=>{detail=null;if(copy.invalidate())warning='Copy may have occurred. Check your clipboard before copying again.';publish();});
  const context=(viewId:string,row:FileSearchResult):IndexedPathContext=>({viewId,root,row});
  const current=(ctx:IndexedPathContext)=>{const top=session.getSnapshot().frames.at(-1);return top?.view.viewId===ctx.viewId&&(ctx.viewId==='detail'?detail?.id===ctx.row.id:top.selection===ctx.row.id);};
  const api:Pick<FileSearchApi,'copyPath'>=mode==='missing-api'?{}:{copyPath:async selection=>{
   setObserved(value=>`${value==='No clipboard request observed.'?'':value+'\n'}Requested Copy path for ${selection.resultId}.`);
   if(mode==='pending')await new Promise(resolve=>setTimeout(resolve,700));
   if(mode==='unknown')throw Error('synthetic private detail');
   if(mode==='unavailable')return {ok:false,error:{code:'capability-unavailable',message:'synthetic private detail',retryable:false}};
   const row=rows.find(value=>value.id===selection.resultId)!;
   return {ok:true,value:{outcome:'copied',...selection,path:mode==='mismatch'?'/public/other':`${root.displayPath}/${row.path}`}};
  }};
  const copy=new IndexedPathCopy({api,isCurrent:current,onChange:()=>publish()});
  function publish(){const top=session.getSnapshot().frames.at(-1)!;const row=detail??selected,model=copy.model(context(top.view.viewId,row));const status=model.status??(warning?{kind:'warning' as const,message:warning}:undefined);const view:ViewModel=detail?{protocolVersion:1,viewId:'detail',revision:++revision,kind:'detail',title:'Indexed file details',markdown:'Read-only indexed metadata. Copy path copies the displayed indexed path; it does not open or read the original file.',metadata:[{label:'Relative path',value:detail.path},{label:'Folder',value:root.displayPath},{label:'Index activity',value:'Paused'}],attachments:[],actions:[model.action],loading:model.loading,...(status?{status}:{})}:{protocolVersion:1,viewId:'results',revision:++revision,kind:'list',title:'Search files',search:{query:top.query,placeholder:'Search indexed names…',mode:'host'},sections:[{id:'files',items:rows.map(value=>({id:value.id,title:value.path,subtitle:'Public files · indexed metadata',actions:[{id:'details',title:'Show details',kind:'invoke',effect:'read'},copy.model(context('results',value)).action]}))}],selectedId:selected.id,loading:model.loading,...(status?{status}:{})};session.update(top.view.viewId,{protocolVersion:1,kind:'snapshot',view});}
  const host:ViewHost={selectionChanged:(_viewId,itemId)=>{copy.invalidate();warning=undefined;selected=rows.find(row=>row.id===itemId)!;publish();},queryChanged:()=>{copy.invalidate();warning=undefined;publish();},action:intent=>{const top=session.getSnapshot().frames.at(-1)!;if(intent.viewId!==top.view.viewId||intent.revision!==top.view.revision)return;const row=detail??rows.find(row=>row.id===intent.itemId);if(!row)return;if(intent.actionId===COPY_INDEXED_PATH){warning=undefined;void copy.copy(context(intent.viewId,row));}else if(intent.actionId==='details'&&!detail){copy.invalidate();warning=undefined;detail=row;session.navigate({protocolVersion:1,kind:'push',fromViewId:'results',view:{protocolVersion:1,viewId:'detail',revision:++revision,kind:'detail',title:'Indexed file details',markdown:'Read-only metadata.',metadata:[],attachments:[]}});publish();}}};
  publish();return {session,host};
 });
 return <ThemeProvider appearance={params.get('theme')==='light'?'light':'dark'}><main className="path-copy-fixture"><h1 className="lc-view-announcement">Indexed Copy path fixture</h1><ViewRenderer session={connection.session} host={connection.host}/><output aria-live="polite">{observed}</output><p className="lc-muted">Synthetic component fixture · clipboard requests are observed, not performed. No files are read or opened.</p></main></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
