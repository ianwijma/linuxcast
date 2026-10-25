import { describe,expect,it,vi } from 'vitest';
import { collectCatalogue,mergePinReply,mergeAliasReply } from '../catalogue.ts';
import type { Catalogue } from '../catalogue.ts';
import type { LauncherCommandsSnapshot,LauncherCommandMetadata } from '@linuxcast/contracts';
export const application=(number:number):LauncherCommandMetadata=>({id:`application:${number.toString(16).padStart(64,'0')}`,provider:'applications',title:`Public Fixture ${number}`,aliases:[],keywords:['synthetic'],enabled:true,usage:null});
const page=(commands:LauncherCommandMetadata[],extra:Partial<LauncherCommandsSnapshot>={})=>({ok:true,value:{revision:1,rankingAvailable:true,applicationState:'available' as const,commands,...extra}});
describe('L1-02 atomic renderer catalogue',()=>{
  it('collects all same-revision pages before returning a complete catalogue',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(page([application(1)],{nextCursor:'1:1'})).mockResolvedValueOnce(page([application(2)],{nextCursor:null}));expect((await collectCatalogue(fetch)).commands.map(value=>value.id)).toEqual([application(1).id,application(2).id]);expect(fetch.mock.calls).toEqual([[undefined],['1:1']]);
  });
  it.each(['duplicate','revision','ranking','application-state','empty-cursor','wrong-offset','update-only','bad-cursor'])('rejects %s instead of accepting a mixed or partial catalogue',async mode=>{
    const first=page([application(1)],{nextCursor:'1:1'});let second=page([application(2)]);
    if(mode==='duplicate')second=page([application(1)]);
    if(mode==='revision')second=page([application(2)],{revision:2});
    if(mode==='ranking')second=page([application(2)],{rankingAvailable:false});
    if(mode==='application-state')second=page([application(2)],{applicationState:'unavailable'});
    if(mode==='empty-cursor')second=page([],{nextCursor:'1:1'});
    if(mode==='wrong-offset')second=page([application(2)],{nextCursor:'1:4'});
    if(mode==='update-only')second=page([application(2)],{updateOnly:true});
    if(mode==='bad-cursor')second=page([application(2)],{nextCursor:'arbitrary'});
    const fetch=vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);await expect(collectCatalogue(fetch)).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('bounds the complete catalogue to 4099 identities',async()=>{
    let start=0;await expect(collectCatalogue(async()=>{const entries=Array.from({length:100},(_,i)=>application(start+i));start+=100;return page(entries,{nextCursor:`1:${start}`});})).rejects.toThrow('limit');
  });
  it('merges an acknowledged pin into a full catalogue without discarding other pages',()=>{
    const commands=Array.from({length:120},(_,i)=>application(i));const current:Catalogue={revision:1,rankingAvailable:true,applicationState:'available',commands};const changed={...commands[110]!,usage:{pinned:true,useCount:0,lastUsedAt:null,alias:null}};
    const merged=mergePinReply(current,{revision:1,rankingAvailable:true,updateOnly:true,nextCursor:null,commands:[changed]},changed.id,true);expect(merged.commands).toHaveLength(120);expect(merged.commands[110]?.usage?.pinned).toBe(true);expect(current.commands[110]?.usage).toBeNull();
    expect(()=>mergePinReply(current,{revision:1,rankingAvailable:true,commands:[changed]},changed.id,true)).toThrow('Incomplete');expect(()=>mergePinReply(current,{revision:2,rankingAvailable:true,updateOnly:true,commands:[changed]},changed.id,true)).toThrow();
  });
});


describe('L1-01 alias acknowledgement integrity',()=>{
  const fixture=()=>{
    const commands=Array.from({length:120},(_,i)=>application(i));
    commands[110]!.usage={alias:'previous',pinned:true,useCount:7,lastUsedAt:'2026-10-25T00:00:00Z'};
    const current:Catalogue={revision:1,rankingAvailable:true,applicationState:'available',commands};
    const target=structuredClone(commands[110]!);target.usage!.alias='new alias';
    const reply:LauncherCommandsSnapshot={revision:1,rankingAvailable:true,applicationState:'available',updateOnly:true,nextCursor:null,commands:[target]};return {current,target,reply};
  };
  it('merges only the target and retains all paged objects and usage/pins',()=>{
    const {current,target,reply}=fixture(),next=mergeAliasReply(current,reply,target.id,'new alias');
    expect(next.commands).toHaveLength(120);expect(next.commands[109]).toBe(current.commands[109]);expect(next.commands[110]!.usage).toEqual({...current.commands[110]!.usage,alias:'new alias'});expect(current.commands[110]!.usage!.alias).toBe('previous');
    target.usage!.alias=null;expect(mergeAliasReply(current,reply,target.id,null).commands[110]!.usage!.alias).toBeNull();
  });
  it.each(['recorded-use','cleared-usage'] as const)('accepts authoritative %s totals while preserving target pin and other pages',mode=>{
    const {current,target,reply}=fixture();
    target.usage!.useCount=mode==='recorded-use'?8:0;
    target.usage!.lastUsedAt=mode==='recorded-use'?'2026-10-25T01:00:00Z':null;
    const merged=mergeAliasReply(current,reply,target.id,'new alias');
    expect(merged.commands[110]!.usage).toEqual(target.usage);expect(merged.commands[110]!.usage!.pinned).toBe(true);expect(merged.commands[109]).toBe(current.commands[109]);expect(current.commands[110]!.usage!.useCount).toBe(7);
  });
  it.each(['revision','full','cursor','extra','id','alias','title','declared-alias','keywords','provider','enabled','pin','ranking','application-state'] as const)('rejects a %s change rather than accepting unrelated metadata',mode=>{
    const {current,target,reply}=fixture();
    if(mode==='revision')reply.revision++;
    if(mode==='full')delete reply.updateOnly;
    if(mode==='cursor')reply.nextCursor='1:1';
    if(mode==='extra')reply.commands.push(application(5));
    if(mode==='id')target.id=application(119).id;
    if(mode==='alias')target.usage!.alias='wrong alias';
    if(mode==='title')target.title='Changed title';
    if(mode==='declared-alias')target.aliases=['new declared alias'];
    if(mode==='keywords')target.keywords=['changed'];
    if(mode==='provider')target.provider='commands';
    if(mode==='enabled')target.enabled=false;
    if(mode==='pin')target.usage!.pinned=false;
    if(mode==='ranking')reply.rankingAvailable=false;
    if(mode==='application-state')reply.applicationState='unavailable';
    expect(()=>mergeAliasReply(current,reply,current.commands[110]!.id,'new alias')).toThrow();
  });
});
