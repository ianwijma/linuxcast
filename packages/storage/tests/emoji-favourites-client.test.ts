import {expect,it} from 'vitest';
import {createStorageClient} from '../src/client.ts';
import {canonicalEmojiId} from '../../contracts/src/emoji.ts';
const value=JSON.stringify([canonicalEmojiId('👩🏽‍💻')]),params={id:'emoji.favourites' as const,expectedRevision:4,value},saved={id:'emoji.favourites',revision:5,value,modifiedAt:'2026-10-29T00:00:00.000Z'};
// Synthetic utility-process transport, deliberately distinct from the real owner tests.
function fixture(){let receive:(value:unknown)=>void=()=>{};const sent:unknown[]=[],client=createStorageClient({send:value=>sent.push(value),onMessage:listener=>{receive=listener;return()=>{};}});const reply=(result:unknown)=>{const envelope=sent[0] as {request:{requestId:string;method:string}};receive({kind:'response',response:{schemaVersion:1,requestId:envelope.request.requestId,method:envelope.request.method,outcome:'completed',result}});};return{client,sent,reply};}
it('accepts only the exact favourite settings acknowledgement and distinguishes an absent read',async()=>{
 const f=fixture(),pending=f.client.request('settings.set',params);f.reply(saved);expect(await pending).toEqual(saved);expect(f.sent).toHaveLength(1);expect(f.sent[0]).toMatchObject({request:{method:'settings.set',params}});f.client.disconnect();const read=fixture(),missing=read.client.request('settings.get',{id:'emoji.favourites'});read.reply(null);expect(await missing).toBeNull();read.client.disconnect();
});
it.each(['id','value','revision','noncanonical','extra','null'] as const)('rejects forged favourite settings %s receipts as unknown without replay',async mode=>{
 const f=fixture(),pending=f.client.request('settings.set',params);f.reply(mode==='null'?null:{...saved,...(mode==='id'?{id:'ui.theme',value:'dark'}:mode==='value'?{value:'[]'}:mode==='revision'?{revision:6}:mode==='noncanonical'?{value:'[ ]'}:{query:'SYNTHETIC_PRIVATE_QUERY'})});await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(f.sent).toHaveLength(1);await expect(f.client.request('settings.set',params)).rejects.toMatchObject({effectOutcome:'not-dispatched',automaticReplay:false});expect(f.sent).toHaveLength(1);f.client.disconnect();
});
it('refuses malformed or wrong-identity favourite reads instead of treating them as empty preferences',async()=>{
 for(const result of [{...saved,value:'[ ]'},{...saved,id:'ui.theme',value:'dark'},{...saved,value:JSON.stringify([canonicalEmojiId('😀'),canonicalEmojiId('😀')])}]){const f=fixture(),pending=f.client.request('settings.get',{id:'emoji.favourites'});f.reply(result);await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(f.sent).toHaveLength(1);f.client.disconnect();}
});
