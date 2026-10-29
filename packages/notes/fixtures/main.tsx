import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { Notes } from '../src/index.tsx';
import { noteContentKey, notePlainText } from '@linuxcast/contracts';
import type { NoteRecord, NotesApi } from '@linuxcast/contracts';
import sharedStyles from '@linuxcast/ui/styles.css?url';
import noteStyles from '../src/styles.css?url';
import fixtureStyles from './fixture.css?url';
for(const href of [sharedStyles,noteStyles,fixtureStyles]){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
const id='11111111-1111-4111-8111-111111111111',time='2026-10-29T00:00:00.000Z';
function Fixture(){
 const [observed,setObserved]=useState('No write observed.');const [api]=useState(()=>{const parameters=new URLSearchParams(location.search),mode=parameters.get('state');let writes=0;const content={title:'Public field notes',document:{type:'doc' as const,content:[
 {type:'heading',attrs:{level:2},content:[{type:'text',text:'A small local notebook'}]},
 {type:'paragraph',content:[{type:'text',text:'Public sample · Unicode 日本語 🪶. No remote content.'}]},
 {type:'taskList',content:[{type:'taskItem',attrs:{checked:false},content:[{type:'paragraph',content:[{type:'text',text:'Review the public checklist'}]}]}]},
 ]}};
 const records:NoteRecord[]=mode==='empty'?[]:[{id,documentVersion:1,revision:1,draft:content,saved:structuredClone(content),createdAt:time,updatedAt:time}];
 if(mode==='recovered')records[0]!.draft={...structuredClone(content),title:'Public recovered draft'};
 const api:NotesApi={getAppearance:async()=>parameters.get('theme')==='light'?'light':'dark',onAppearance:()=>()=>{},onCloseRequested:listener=>{Object.assign(window,{requestNotesClose:listener});return()=>{};},close:async()=>{setObserved('Observed close request.');},
 list:async({query,cursor})=>{if(mode==='loading')return new Promise(()=>{});if(mode==='list-error')throw new Error('private fixture failure');return{ok:true,value:{query,records:cursor?[]:records.filter(row=>`${row.draft.title} ${notePlainText(row.draft.document)}`.toLowerCase().includes(query.toLowerCase())).map(row=>({id:row.id,revision:row.revision,title:row.draft.title,excerpt:notePlainText(row.draft.document).slice(0,200),hasDraft:!row.saved||noteContentKey(row.draft)!==noteContentKey(row.saved),updatedAt:row.updatedAt})),nextCursor:null}};},
 get:async requested=>({ok:true,value:structuredClone(records.find(row=>row.id===requested)??null)}),
 write:async input=>{setObserved(`Observed ${input.action} ${++writes}.`);if(mode==='pending')await new Promise(resolve=>setTimeout(resolve,1500));if(mode==='unknown')throw new Error('private fixture failure');if(mode==='conflict')return{ok:false,error:{code:'conflict',message:'private fixture failure',retryable:false}};if(mode==='denied')return{ok:false,error:{code:'capability-unavailable',message:'private fixture failure',retryable:false}};
 const before=records.find(row=>row.id===input.id);const record:NoteRecord={id:input.id,documentVersion:1,revision:input.expectedRevision+1,draft:structuredClone(input.content),saved:input.action==='save'?structuredClone(input.content):before?.saved??null,createdAt:before?.createdAt??time,updatedAt:time};if(before)records[records.indexOf(before)]=record;else records.push(record);return {ok:true,value:record};},};return api;});
 return <><Notes api={api}/><div role="complementary" aria-label="Fixture request observer" className="notes-fixture-observer"><output>{observed}</output> · Component fixture: synthetic in-memory persistence; no SQLite, native close or filesystem effects.</div></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
