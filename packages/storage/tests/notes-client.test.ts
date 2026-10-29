import {expect,it} from 'vitest';
import {createStorageClient} from '../src/client.ts';
import {emptyNoteDocument} from '../../contracts/src/notes.ts';

const id='11111111-1111-4111-8111-111111111111',otherId='22222222-2222-4222-8222-222222222222',time='2026-10-29T00:00:00.000Z';
const content={title:'Public saved source',document:emptyNoteDocument()};
const selection={id,expectedRevision:4,revision:1};
const history={id,currentRevision:4,revisions:[{revision:1,createdAt:time,title:content.title}]};
const preview={id,currentRevision:4,savedRevision:{revision:1,createdAt:time,content}};
const restored={id,documentVersion:1,revision:5,pinned:true,archived:false,trashed:false,draft:content,saved:content,createdAt:time,updatedAt:time};
function fixture(){
 let receive:(value:unknown)=>void=()=>{};
 const sent:unknown[]=[],client=createStorageClient({send:value=>sent.push(value),onMessage:listener=>{receive=listener;return()=>{};}});
 const reply=(result:unknown)=>{const envelope=sent[0] as {request:{requestId:string;method:string}};receive({kind:'response',response:{schemaVersion:1,requestId:envelope.request.requestId,method:envelope.request.method,outcome:'completed',result}});};
 return {client,sent,reply};
}
it('accepts exact history, selected preview and active restore receipts without extra transport writes',async()=>{
 for(const method of ['notes.history','notes.getRevision','notes.restoreRevision'] as const){
  const f=fixture(),params=method==='notes.history'?{id,expectedRevision:4}:selection,result=method==='notes.history'?history:method==='notes.getRevision'?preview:restored;
  const pending=f.client.request(method,params);f.reply(result);expect(await pending).toEqual(result);
  expect(f.sent).toHaveLength(1);expect(f.sent[0]).toMatchObject({request:{method,params}});f.client.disconnect();
 }
});
it.each(['id','currentRevision'] as const)('rejects a forged history %s even when the reply schema is valid',async field=>{
 const f=fixture(),pending=f.client.request('notes.history',{id,expectedRevision:4});f.reply({...history,...(field==='id'?{id:otherId}:{currentRevision:5})});
 await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(f.sent).toHaveLength(1);f.client.disconnect();
});
it.each(['id','currentRevision','selectedRevision'] as const)('rejects a forged selected preview %s with no replay',async field=>{
 const f=fixture(),pending=f.client.request('notes.getRevision',selection);f.reply({...preview,...(field==='id'?{id:otherId}:field==='currentRevision'?{currentRevision:5}:{savedRevision:{...preview.savedRevision,revision:2}})});
 await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(f.sent).toHaveLength(1);f.client.disconnect();
});
it.each(['id','revision','archived','trashed'] as const)('rejects forged Restore %s instead of acknowledging or replaying a possibly committed mutation',async field=>{
 const f=fixture(),pending=f.client.request('notes.restoreRevision',selection);f.reply({...restored,...(field==='id'?{id:otherId}:field==='revision'?{revision:6}:field==='archived'?{archived:true}:{trashed:true})});
 await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(f.sent).toHaveLength(1);
 await expect(f.client.request('notes.restoreRevision',selection)).rejects.toMatchObject({effectOutcome:'not-dispatched',automaticReplay:false});expect(f.sent).toHaveLength(1);f.client.disconnect();
});
it('rejects malformed history and unsafe preview bodies at the actual response schema boundary',async()=>{
 for(const result of [{...history,revisions:[{revision:2,createdAt:time,title:'Public'},{revision:3,createdAt:time,title:'Public'}]},{...history,revisions:[{...history.revisions[0],content}] }]){
  const f=fixture(),pending=f.client.request('notes.history',{id,expectedRevision:4});f.reply(result);await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(f.sent).toHaveLength(1);f.client.disconnect();
 }
 const f=fixture(),pending=f.client.request('notes.getRevision',selection);f.reply({...preview,savedRevision:{...preview.savedRevision,content:{...content,document:{type:'doc',content:[{type:'image',attrs:{src:'https://example.invalid'}}]}}}});
 await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(f.sent).toHaveLength(1);f.client.disconnect();
});

it('accepts only the exact permanent-delete receipt and sends one named mutation',async()=>{
 const f=fixture(),params={id,expectedRevision:4},result={id,deletedRevision:4};
 const pending=f.client.request('notes.deletePermanently',params);f.reply(result);expect(await pending).toEqual(result);
 expect(f.sent).toHaveLength(1);expect(f.sent[0]).toMatchObject({request:{method:'notes.deletePermanently',params}});f.client.disconnect();
});
it.each(['id','deletedRevision','extra','null'] as const)('treats a forged permanent-delete %s receipt as unknown without replay',async mode=>{
 const f=fixture(),pending=f.client.request('notes.deletePermanently',{id,expectedRevision:4});
 f.reply(mode==='null'?null:{id,deletedRevision:4,...(mode==='id'?{id:otherId}:mode==='deletedRevision'?{deletedRevision:5}:mode==='extra'?{content:'SYNTHETIC_PRIVATE'}:{})});
 await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(f.sent).toHaveLength(1);
 await expect(f.client.request('notes.deletePermanently',{id,expectedRevision:4})).rejects.toMatchObject({effectOutcome:'not-dispatched',automaticReplay:false});expect(f.sent).toHaveLength(1);f.client.disconnect();
});
