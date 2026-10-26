import { describe,expect,it } from 'vitest';
import { QueryGenerations,rankCommands,rankManagedCommands,preserveSelection } from '../src/index.ts';
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
    expect(()=>rankCommands(Array.from({length:5605},(_,i)=>make(`fixture:${i}`,`Command ${i}`)),'')).toThrow();expect(()=>rankCommands([],'x'.repeat(513))).toThrow();const command=make('linuxcast:hide','Hide');expect(()=>rankCommands([command,command],'')).toThrow();
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
it('L1-02 admits eight builtins plus4096application,1000workflow and500saved Quicklink identities and rejects5605records',()=>{
  const commands=Array.from({length:5604},(_,i)=>make(`fixture:${i}`,`Fixture ${i}`));expect(rankCommands(commands,'',now)).toHaveLength(20);expect(()=>rankCommands([...commands,make('fixture:extra','Extra')],'',now)).toThrow('limit');
});


describe('L1-01 hidden root commands and local management projection',()=>{
  it('excludes hidden alias, favourite and high-frecency rows before any matching',()=>{
    const hidden=make('fixture:hidden','Hidden',{hidden:true,aliases:['needle'],usage:{pinned:true,useCount:9999,lastUsedAt:new Date(now).toISOString(),alias:'saved'}});
    const shown=make('fixture:shown','Needle shown');
    for(const query of ['', 'needle','saved','Hidden'])expect(rankCommands([hidden,shown],query,now)).not.toContain(hidden);
    expect(rankCommands([hidden,shown],'needle',now)).toEqual([shown]);
    expect(rankCommands([hidden,{...shown,hidden:false}],'',now)).toEqual([{...shown,hidden:false}]);
    expect(hidden.hidden).toBe(true);
  });
  it('excludes hidden rows before provider caps and never retains a hidden selected ID',()=>{
    const hidden=Array.from({length:30},(_,i)=>make(`fixture:hidden${i}`,`Hidden ${i}`,{hidden:true,usage:{pinned:true,useCount:100,lastUsedAt:new Date(now).toISOString(),alias:null}}));
    const shown=Array.from({length:25},(_,i)=>make(`fixture:shown${i}`,`Shown ${i}`));
    const results=rankCommands([...hidden,...shown],'',now,hidden[29]!.id);expect(results).toEqual(shown.slice(0,20));
    expect(preserveSelection([...hidden,...shown],hidden[0]!.id)).toBe(shown[0]!.id);
    expect(preserveSelection(hidden,hidden[0]!.id)).toBeNull();
    expect(rankCommands([make('linuxcast:open-url','Open URL',{hidden:true})],'https://example.org',now)).toEqual([]);
  });
  it('retains original hidden/unavailable metadata in management without frecency ordering',()=>{
    const hidden=make('fixture:a','Alpha',{hidden:true,enabled:false,usage:{pinned:false,useCount:0,lastUsedAt:null,alias:null}});
    const pinned=make('fixture:z','Zulu',{usage:{pinned:true,useCount:999,lastUsedAt:new Date(now).toISOString(),alias:null}});
    const before=structuredClone([pinned,hidden]);
    expect(rankManagedCommands([pinned,hidden],'')).toEqual([hidden,pinned]);
    expect(rankManagedCommands([pinned,hidden],'')[0]).toBe(hidden);expect([pinned,hidden]).toEqual(before);
    expect(rankManagedCommands([pinned,hidden],'Alpha')).toEqual([hidden]);
  });
  it('uses stable matching/title/id order without URL inference or command execution',()=>{
    const a=make('fixture:a','Same'),b=make('fixture:b','Same'),alias=make('fixture:c','Zulu',{hidden:true,aliases:['same']});
    expect(rankManagedCommands([b,a,alias],'same').map(row=>row.id)).toEqual([alias.id,a.id,b.id]);
    const url=make('linuxcast:open-url','Open URL');expect(rankManagedCommands([url],'https://example.org')).toEqual([]);
    expect(rankManagedCommands([url],'url')).toEqual([url]);
  });
  it('searches all collected rows before the management cap and retains only a matching selected ID',()=>{
    const rows=Array.from({length:150},(_,i)=>make(`fixture:${i}`,`Fixture ${i.toString().padStart(3,'0')}`,{hidden:true,enabled:false}));
    const capped=rankManagedCommands(rows,'Fixture',rows[149]!.id);expect(capped).toHaveLength(100);expect(capped[99]).toBe(rows[149]);
    expect(capped.slice(0,99)).toEqual(rows.slice(0,99));
    expect(rankManagedCommands(rows,'Fixture 149',rows[1]!.id)).toEqual([rows[149]]);
    expect(rankManagedCommands(rows,'no matches',rows[149]!.id)).toEqual([]);
    expect(rankManagedCommands(rows,'')).toEqual(rows.slice(0,100));
  });
  it('uses the existing 5604-registry and 512-query limits for management and rejects duplicate IDs',()=>{
    const rows=Array.from({length:5604},(_,i)=>make(`fixture:${i}`,`Fixture ${i}`));rows[4102]!.title='Later hidden target';rows[4102]!.hidden=true;
    expect(rankManagedCommands(rows,'Later hidden target')).toEqual([rows[4102]]);
    expect(()=>rankManagedCommands([...rows,make('fixture:extra','Extra')],'')).toThrow('limit');
    expect(()=>rankManagedCommands([],'x'.repeat(513))).toThrow('limit');expect(()=>rankManagedCommands([rows[0]!,rows[0]!],'')).toThrow('Duplicate');
  });
});

it('matches a registered saved-link host and tags locally without widening unrelated subtitle search or changing selection identity',()=>{
 const host='public.'+'x'.repeat(121)+'.example.invalid',saved=make('quicklink:00000000-0000-4000-8000-000000000001','Public docs',{subtitle:`Saved Quicklink · ${host} · Open saved entry`,keywords:['quicklink','Work','猫']}),other=make('fixture:other','Other',{subtitle:host}),before=structuredClone(saved);expect(rankCommands([other,saved],`${host} Work 猫`,now)).toEqual([saved]);expect(saved).toEqual(before);expect(rankCommands([saved],'no matching host',now)).toEqual([]);
 const rows=Array.from({length:500},(_,i)=>make(`quicklink:${i}`,`Saved link ${i}`,{subtitle:`Saved Quicklink · host${i}.invalid · Open saved entry`}));expect(rankCommands(rows,'host499.invalid',now,rows[499]!.id)).toEqual([rows[499]]);expect(rankCommands([{...saved,hidden:true}],host,now)).toEqual([]);
});
