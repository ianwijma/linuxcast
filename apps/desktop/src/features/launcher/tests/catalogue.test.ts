import { describe,expect,it,vi } from 'vitest';
import { collectCatalogue,mergePinReply,mergeAliasReply,mergeVisibilityCatalogue } from '../catalogue.ts';
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
  it('bounds the complete catalogue to5104 identities',async()=>{
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

it('L1-02 collects4100identities including4builtins without dropping finalpage',async()=>{
  const commands=Array.from({length:4096},(_,i)=>application(i));commands.push(...['linuxcast:open-local-data','linuxcast:hide','linuxcast:quit','linuxcast:open-url'].map(id=>({id:id as LauncherCommandMetadata['id'],title:id,aliases:[],keywords:[],enabled:true,usage:null})));
  const result=await collectCatalogue(async cursor=>{const offset=cursor?Number(cursor.split(':')[1]):0;return page(commands.slice(offset,offset+100),{nextCursor:offset+100<commands.length?`1:${offset+100}`:null});});expect(result.commands).toHaveLength(4100);expect(result.commands.at(-1)!.id).toBe('linuxcast:open-url');
});


describe('L1-01 catalogue visibility boundaries',()=>{
  it.each([true,false])('preserves explicit visibility availability %s across every collected page',async visibilityAvailable=>{
    const result=await collectCatalogue(vi.fn().mockResolvedValueOnce(page([application(1)],{visibilityAvailable,nextCursor:'1:1'})).mockResolvedValueOnce(page([application(2)],{visibilityAvailable})));
    expect(result.visibilityAvailable).toBe(visibilityAvailable);expect(result.commands).toHaveLength(2);
  });
  it.each([[true,false],[true,undefined],[undefined,false],[false,undefined]] as const)('rejects mixed visibility availability %s/%s across pages',async(first,second)=>{
    const fetch=vi.fn().mockResolvedValueOnce(page([application(1)],{visibilityAvailable:first,nextCursor:'1:1'})).mockResolvedValueOnce(page([application(2)],{visibilityAvailable:second}));
    await expect(collectCatalogue(fetch)).rejects.toThrow('Inconsistent');
  });
  it('keeps legacy missing visibility availability absent rather than simulating support',async()=>{
    const result=await collectCatalogue(async()=>page([application(1)]));expect(result).not.toHaveProperty('visibilityAvailable');
  });
  it('preserves visibility through acknowledged pin and alias updates and rejects forged hidden state',()=>{
    const target={...application(1),hidden:true,usage:{alias:'previous',pinned:false,useCount:7,lastUsedAt:null}};
    const current:Catalogue={revision:1,rankingAvailable:true,visibilityAvailable:true,commands:[target]};
    const pin={revision:1,rankingAvailable:true,visibilityAvailable:true,updateOnly:true,commands:[{...target,usage:{...target.usage,pinned:true}}]};
    expect(mergePinReply(current,pin,target.id,true)).toMatchObject({visibilityAvailable:true,commands:[{hidden:true,usage:{pinned:true}}]});
    const full={...pin,updateOnly:false,revision:2};expect(mergePinReply(current,full,target.id,true).visibilityAvailable).toBe(true);
    const alias={...pin,commands:[{...target,usage:{...target.usage,alias:'next'}}]};
    expect(mergeAliasReply(current,alias,target.id,'next')).toMatchObject({visibilityAvailable:true,commands:[{hidden:true,usage:{alias:'next'}}]});
    for(const reply of [pin,full,alias]){
      const forged=structuredClone(reply);forged.commands[0]!.hidden=false;
      expect(()=>reply===alias?mergeAliasReply(current,forged,target.id,'next'):mergePinReply(current,forged,target.id,true)).toThrow();
    }
    for(const visibilityAvailable of [false,undefined]){
      expect(()=>mergePinReply(current,{...pin,visibilityAvailable},target.id,true)).toThrow();
      expect(()=>mergeAliasReply(current,{...alias,visibilityAvailable},target.id,'next')).toThrow();
    }
  });
  it('rejects an unrelated hidden change in a legacy complete pin snapshot',()=>{
    const target={...application(1),usage:{alias:null,pinned:false,useCount:0,lastUsedAt:null}},other={...application(2),hidden:true};
    const current:Catalogue={revision:1,rankingAvailable:true,visibilityAvailable:true,commands:[target,other]};
    expect(()=>mergePinReply(current,{revision:2,rankingAvailable:true,visibilityAvailable:true,commands:[{...target,usage:{...target.usage,pinned:true}},{...other,hidden:false}]},target.id,true)).toThrow();
  });
});

describe('L1-01 fully collected visibility acknowledgement integrity',()=>{
  const fixture=()=>{
    const commands=Array.from({length:120},(_,i)=>application(i));
    commands[90]!.hidden=true;commands[110]!.usage={alias:'saved target',pinned:true,useCount:7,lastUsedAt:'2026-10-25T00:00:00Z'};
    const current:Catalogue={revision:1,rankingAvailable:true,visibilityAvailable:true,applicationState:'available',commands};
    const next=structuredClone(current);next.revision=2;next.commands[110]!.hidden=true;
    return {current,next,id:commands[110]!.id};
  };
  it('merges a later-page target without losing hidden rows, aliases, pins or authoritative use totals',()=>{
    const {current,next,id}=fixture();next.commands[110]!.usage!.useCount=8;next.commands[110]!.usage!.lastUsedAt='2026-10-25T01:00:00Z';
    next.commands[5]!.usage={alias:null,pinned:false,useCount:1,lastUsedAt:'2026-10-25T01:00:00Z'};
    const merged=mergeVisibilityCatalogue(current,next,id,true);expect(merged.commands).toHaveLength(120);expect(merged.commands[90]!.hidden).toBe(true);
    expect(merged.commands[110]).toMatchObject({hidden:true,usage:{alias:'saved target',pinned:true,useCount:8}});expect(merged.commands[5]!.usage!.useCount).toBe(1);
    expect(current.commands[110]!.hidden).toBeUndefined();expect(current.commands[110]!.usage!.useCount).toBe(7);
    const restored=structuredClone(merged);restored.revision=3;restored.commands[110]!.hidden=false;restored.commands[110]!.usage!.useCount=0;restored.commands[110]!.usage!.lastUsedAt=null;
    expect(mergeVisibilityCatalogue(merged,restored,id,false).commands[110]).toMatchObject({hidden:false,usage:{alias:'saved target',pinned:true,useCount:0}});
  });
  it('compares complete registered ID sets rather than page position and treats omitted hidden as false',()=>{
    const {current,next,id}=fixture();next.commands.reverse();expect(mergeVisibilityCatalogue(current,next,id,true)).toBe(next);
    const shown=structuredClone(next);shown.revision=3;delete shown.commands.find(command=>command.id===id)!.hidden;
    expect(mergeVisibilityCatalogue(next,shown,id,false)).toBe(shown);
  });
  it.each(['same-revision','skipped-revision','old-revision','partial','duplicate','new-id','target-id','wrong-hidden','other-hidden','title','aliases','keywords','provider','enabled','pin','alias','other-pin','other-alias','ranking','application-state','visibility','missing-visibility','current-visibility','cursor','update-only','invalid-count'] as const)('rejects %s rather than confirming a different or partial visibility write',mode=>{
    const {current,next,id}=fixture(),target=next.commands[110]!;
    if(mode==='same-revision')next.revision=1;if(mode==='skipped-revision')next.revision=3;if(mode==='old-revision')next.revision=0;
    if(mode==='partial')next.commands=next.commands.slice(0,100);if(mode==='duplicate')next.commands[119]=next.commands[0]!;
    if(mode==='new-id')next.commands[119]=application(500);if(mode==='target-id')target.id=application(501).id;
    if(mode==='wrong-hidden')target.hidden=false;if(mode==='other-hidden')next.commands[90]!.hidden=false;
    if(mode==='title')target.title='Changed';if(mode==='aliases')target.aliases=['forged'];if(mode==='keywords')target.keywords=['forged'];
    if(mode==='provider')target.provider='commands';if(mode==='enabled'){target.enabled=false;target.unavailableReason='Synthetic unavailable';}
    if(mode==='pin')target.usage!.pinned=false;if(mode==='alias')target.usage!.alias='forged';
    if(mode==='other-pin')next.commands[5]!.usage={alias:null,pinned:true,useCount:0,lastUsedAt:null};
    if(mode==='other-alias')next.commands[5]!.usage={alias:'forged',pinned:false,useCount:0,lastUsedAt:null};
    if(mode==='ranking')next.rankingAvailable=false;if(mode==='application-state')next.applicationState='unavailable';
    if(mode==='visibility')next.visibilityAvailable=false;if(mode==='missing-visibility')delete next.visibilityAvailable;if(mode==='current-visibility')current.visibilityAvailable=false;
    if(mode==='cursor')Object.assign(next,{nextCursor:'2:100'});if(mode==='update-only')Object.assign(next,{updateOnly:true});if(mode==='invalid-count')target.usage!.useCount=-1;
    expect(()=>mergeVisibilityCatalogue(current,next,id,true)).toThrow();
  });
  it('never hides protected recovery identities or accepts an unknown requested target',()=>{
    const {current,next}=fixture();
    for(const id of ['linuxcast:hide','linuxcast:quit'] as const){
      const recovery={id,title:id,aliases:[],keywords:[],enabled:true,usage:null};current.commands.push(recovery);next.commands.push({...recovery,hidden:true});
      expect(()=>mergeVisibilityCatalogue(current,next,id,true)).toThrow();next.commands.at(-1)!.hidden=false;
    }
    expect(()=>mergeVisibilityCatalogue(current,next,application(999).id,true)).toThrow();
  });
});
