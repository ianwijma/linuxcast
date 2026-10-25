import { describe,expect,it,vi } from 'vitest';
import { collectCatalogue,mergePinReply } from '../catalogue.ts';
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
