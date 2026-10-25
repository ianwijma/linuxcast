import { describe,expect,it } from 'vitest';
import { QueryGenerations,rankCommands,preserveSelection } from '../src/index.ts';
import type { SearchCommand } from '../src/index.ts';
const make=(id:string,title:string,patch:Partial<SearchCommand>={}):SearchCommand=>({id,title,aliases:[],keywords:[],enabled:true,usage:null,...patch});
const now=Date.parse('2026-10-25T00:00:00Z');
describe('L1-01 bounded registered command ranking',()=>{
  it('shows registered commands for empty query with local favourites and recent use first',()=>{
    const commands=[make('linuxcast:quit','Quit Linuxcast'),make('linuxcast:hide','Hide Linuxcast',{usage:{pinned:false,useCount:4,lastUsedAt:new Date(now).toISOString(),alias:null}}),make('linuxcast:open-local-data','Local data',{usage:{pinned:true,useCount:0,lastUsedAt:null,alias:null}})];
    expect(rankCommands(commands,'',now).map(x=>x.id)).toEqual(['linuxcast:open-local-data','linuxcast:hide','linuxcast:quit']);
  });
  it('places exact explicit aliases before title/fuzzy matches even with different local ranking',()=>{
    const alias=make('linuxcast:hide','Hide Linuxcast',{aliases:['DATA']}),title=make('linuxcast:open-local-data','Data',{usage:{pinned:true,useCount:50,lastUsedAt:new Date(now).toISOString(),alias:null}});
    expect(rankCommands([title,alias],' data ',now).map(x=>x.id)).toEqual([alias.id,title.id]);
  });
  it('matches saved aliases, title words, keywords and bounded fuzzy title queries without creating commands',()=>{
    const command=make('linuxcast:open-local-data','Local data',{keywords:['privacy','retention'],usage:{useCount:0,lastUsedAt:null,pinned:false,alias:'mine'}});
    for(const query of ['mine','local privacy','lcdt','RETENTION'])expect(rankCommands([command],query,now)).toEqual([command]);expect(rankCommands([command],'https://example.org',now)).toEqual([]);
  });
  it('keeps unavailable rows discoverable but defaults selection to an enabled result',()=>{
    const disabled=make('linuxcast:open-local-data','Local data',{enabled:false}),enabled=make('linuxcast:quit','Quit Linuxcast');
    expect(rankCommands([disabled,enabled],'data',now)).toEqual([disabled]);expect(preserveSelection([disabled,enabled],null)).toBe(enabled.id);expect(preserveSelection([disabled,enabled],disabled.id)).toBe(disabled.id);
  });
  it('preserves selected identity across reordered/late results and clears a vanished selection',()=>{
    const a=make('linuxcast:hide','Hide'),b=make('linuxcast:quit','Quit');expect(preserveSelection([b,a],a.id)).toBe(a.id);expect(preserveSelection([b],a.id)).toBe(b.id);expect(preserveSelection([],a.id)).toBeNull();
  });
  it('resets local usage contribution when count is zero without losing a favourite',()=>{
    const a=make('linuxcast:hide','Hide',{usage:{pinned:false,useCount:0,lastUsedAt:new Date(now).toISOString(),alias:null}}),b=make('linuxcast:quit','Quit',{usage:{pinned:false,useCount:1,lastUsedAt:new Date(now-86400000).toISOString(),alias:null}});
    expect(rankCommands([a,b],'',now)[0]?.id).toBe(b.id);expect(rankCommands([a,{...b,usage:null}],'',now)[0]?.id).toBe(a.id);
  });
  it('bounds results, registry size and query length and rejects duplicate identities',()=>{
    expect(rankCommands(Array.from({length:100},(_,i)=>make(`fixture:${i}`,`Command ${i}`)),'',now)).toHaveLength(20);
    expect(()=>rankCommands(Array.from({length:4102},(_,i)=>make(`fixture:${i}`,`Command ${i}`)),'')).toThrow();expect(()=>rankCommands([],'x'.repeat(513))).toThrow();const command=make('linuxcast:hide','Hide');expect(()=>rankCommands([command,command],'')).toThrow();
  });
  it('cancels old queries and rejects late completion after replacement, hide or disconnect',()=>{
    const generations=new QueryGenerations(),first=generations.begin('data'),second=generations.begin('hide');expect(first.signal.aborted).toBe(true);expect(generations.current(first.generation)).toBe(false);expect(generations.current(second.generation)).toBe(true);generations.cancel();expect(second.signal.aborted).toBe(true);expect(generations.current(second.generation)).toBe(false);
  });
  it('takes the first 20 results per provider and merges bounded application and command results',()=>{
    const commands=Array.from({length:40},(_,i)=>make(`fixture:${i}`,`Fixture ${i}`,{provider:'commands'}));const apps=Array.from({length:60},(_,i)=>make(`application:${i.toString(16).padStart(64,'0')}`,`Fixture App ${i}`,{provider:'applications'}));const result=rankCommands([...commands,...apps],'',now);expect(result).toHaveLength(40);expect(result.filter(value=>value.provider==='applications')).toHaveLength(20);
  });

});

it('L1-01 saved Unicode aliases normalize exact queries without changing authority or usage',()=>{
  const saved=make('linuxcast:hide','Hide Linuxcast',{usage:{alias:'Ｆｏｃｕｓ   Desk',pinned:false,useCount:7,lastUsedAt:new Date(now).toISOString()}}),title=make('linuxcast:quit','Focus desk',{usage:{alias:null,pinned:true,useCount:90,lastUsedAt:new Date(now).toISOString()}});
  const before=structuredClone(saved);expect(rankCommands([title,saved],'  FOCUS desk  ',now).map(value=>value.id)).toEqual([saved.id,title.id]);expect(saved).toEqual(before);expect(rankCommands([{...saved,usage:{...saved.usage!,alias:null}}],'focus desk',now)).toEqual([]);
});

it('L1-02 valid HTTP queries match only an already registered Open URL command without changing its aliases',()=>{
  const url=make('linuxcast:open-url','Open URL',{aliases:['url']}),before=structuredClone(url);
  for(const query of ['https://example.org/','HTTP://例え.example/path?x=public'])expect(rankCommands([url],query,now)).toEqual([url]);
  for(const query of ['example.org','file:///tmp/public','javascript:alert(1)','https://user@example.org/','https://example.org/white space'])expect(rankCommands([url],query,now)).toEqual([]);
  expect(rankCommands([], 'https://example.org/',now)).toEqual([]);expect(url).toEqual(before);
});
it('L1-02 admits five builtins plus4096application identities and rejects4102records',()=>{
  const commands=Array.from({length:4101},(_,i)=>make(`fixture:${i}`,`Fixture ${i}`));expect(rankCommands(commands,'',now)).toHaveLength(20);expect(()=>rankCommands([...commands,make('fixture:extra','Extra')],'',now)).toThrow('limit');
});
