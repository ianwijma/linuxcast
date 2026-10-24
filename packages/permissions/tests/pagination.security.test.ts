import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { DecisionRecord } from '../../platform-contracts/src/permissions.ts';
import { principalKeyMaterial } from '../../platform-contracts/src/permissions.ts';
import { createDecisionStore } from '../src/storage.ts';
import type { PermissionRepositoryClient } from '../src/storage.ts';
const principal={kind:'builtin' as const,id:'file-browser'};
const principalKey=createHash('sha256').update(principalKeyMaterial(principal)).digest('hex');
const record=(index:number):DecisionRecord=>({schemaVersion:1,id:`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`,principal,declarationHash:'a'.repeat(64),permissionId:'files.read',scope:{kind:'resource',resourceId:`file:${index}`},decision:'allow',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'});
const client=(list:(params:{principalKey:string;afterId?:string;limit:number})=>unknown)=>({request:async(method:string,params:unknown)=>{
  if(method==='permissions.list')return list(params as {principalKey:string;afterId?:string;limit:number});
  throw new Error('Unexpected request.');
}} as PermissionRepositoryClient);
describe('F3-01 bounded grant inventory',()=>{
  it('loads all pages in stable order before returning a grant inventory',async()=>{
    const calls:unknown[]=[];const store=createDecisionStore(client(params=>{calls.push(params);return params.afterId?{records:[record(3)],nextCursor:null}:{records:[record(1),record(2)],nextCursor:record(2).id};}));
    expect(await store.list(principalKey)).toEqual([record(1),record(2),record(3)]);expect(calls).toEqual([{principalKey,limit:200},{principalKey,limit:200,afterId:record(2).id}]);
  });
  it('rejects a later page failure instead of returning earlier grants',async()=>{
    const store=createDecisionStore(client(params=>{if(params.afterId)throw new Error('storage unavailable');return {records:[record(1)],nextCursor:record(1).id};}));await expect(store.list(principalKey)).rejects.toThrow();
  });
  it.each(['repeat','wrong-cursor','empty-continuation','wrong-principal','invalid-record'] as const)('rejects %s',async failure=>{
    const store=createDecisionStore(client(params=>{
      if(failure==='repeat')return {records:[record(1)],nextCursor:record(1).id};
      if(failure==='wrong-cursor')return {records:[record(1)],nextCursor:record(2).id};
      if(failure==='empty-continuation')return {records:[],nextCursor:record(1).id};
      if(failure==='wrong-principal')return {records:[{...record(1),principal:{kind:'builtin',id:'different'}}],nextCursor:null};
      return {records:[{...record(1),privateContent:params.principalKey}],nextCursor:null};
    }));await expect(store.list(principalKey)).rejects.toThrow();
  });
  it('rejects an inventory beyond the explicit total bound',async()=>{
    let page=0;const store=createDecisionStore(client(()=>{const records=Array.from({length:200},(_,i)=>record(page*200+i+1));page++;return {records,nextCursor:records.at(-1)!.id};}));await expect(store.list(principalKey)).rejects.toThrow('exceeds limit');expect(page).toBe(51);
  });
});
