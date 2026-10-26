import { afterEach,describe,expect,it,vi } from 'vitest';
import type { FileSearchApi,FileSearchResult,FileSearchRoot,FileSearchState } from '@linuxcast/contracts';
import { FileSearchController } from '../src/controller.ts';
const rootId='11111111-1111-4111-8111-111111111111',otherId='33333333-3333-4333-8333-333333333333',generation='22222222-2222-4222-8222-222222222222',nextGeneration='44444444-4444-4444-8444-444444444444';
const root:FileSearchRoot={id:rootId,name:'Public documents',displayPath:'/public-fixture/Documents',state:'ready',activity:'paused',generation,progress:{visited:8,indexed:6,excluded:1,denied:1,vanished:0,unsupported:0,watchFailures:0}};
const rows:FileSearchResult[]=['notes/public.txt','reports/public.txt'].map((path,index)=>({id:`${rootId}:${path}`,rootId,generation,path,kind:'file',size:index+1,modifiedMs:1792886400000}));
const controllers:FileSearchController[]=[];
afterEach(()=>{for(const controller of controllers.splice(0))controller.dispose();vi.useRealTimers();});
const settled=()=>new Promise(resolve=>setTimeout(resolve,0));
function setup(overrides:Partial<FileSearchApi>={},roots:FileSearchRoot[]=[structuredClone(root)]){
  const state:FileSearchState={revision:1,appearance:'dark',roots};let listener!:(value:FileSearchState)=>void;const unsubscribe=vi.fn();
  const api:FileSearchApi={getState:vi.fn<FileSearchApi['getState']>(async()=>({ok:true as const,value:structuredClone(state)})),onState:vi.fn<FileSearchApi['onState']>(value=>{listener=value;return unsubscribe;}),chooseFolder:vi.fn<FileSearchApi['chooseFolder']>(async()=>({ok:true as const,value:{outcome:'cancelled' as const}})),startIndex:vi.fn<FileSearchApi['startIndex']>(async()=>({ok:true as const,value:{outcome:'completed' as const}})),pauseIndex:vi.fn<FileSearchApi['pauseIndex']>(async()=>({ok:true as const,value:{outcome:'completed' as const}})),removeFolder:vi.fn<FileSearchApi['removeFolder']>(async()=>({ok:true as const,value:{outcome:'completed' as const}})),search:vi.fn<FileSearchApi['search']>(async request=>({ok:true as const,value:{query:request.query,rootId:request.rootId??null,results:structuredClone(rows)}})),close:vi.fn<FileSearchApi['close']>(async()=>({ok:true as const,value:{outcome:'completed' as const}})),...overrides};
  const controller=new FileSearchController(api);controllers.push(controller);controller.start();return {controller,api,state,unsubscribe,push:()=>{state.revision++;listener(structuredClone(state));},event:(value:FileSearchState)=>listener(value)};
}
function top(controller:FileSearchController){return controller.session.getSnapshot().frames.at(-1)!;}
function invoke(controller:FileSearchController,actionId:string,itemId?:string){if(itemId)controller.session.select(top(controller).view.viewId,itemId);const frame=top(controller);return controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId,...(itemId?{itemId}:{})});}
function items(controller:FileSearchController){const view=top(controller).view;if(view.kind!=='list')throw new Error();return view.sections.flatMap(section=>section.items);}
async function search(f:ReturnType<typeof setup>,query='public'){await invoke(f.controller,'files:search',rootId);f.controller.session.setQuery(top(f.controller).view.viewId,query);f.controller.query(top(f.controller).view.viewId,query);await new Promise(resolve=>setTimeout(resolve,170));}
describe('L2-02 selected-folder presentation',()=>{
  it('shows actual paused root/progress and starts no worker or query during initial load',async()=>{
    const f=setup();await settled();expect(items(f.controller)[0]).toMatchObject({title:root.name,subtitle:root.displayPath,accessories:[{text:expect.stringContaining('Paused')},{text:'6 indexed · 8 visited'}]});expect(f.api.startIndex).not.toHaveBeenCalled();expect(f.api.search).not.toHaveBeenCalled();expect(top(f.controller).view.actions?.[0]?.title).toBe('Choose folder');
  });
  it('keeps the native chooser reachable with no roots and honours cancellation without fabricated success',async()=>{
    const f=setup({},[]);await settled();expect(items(f.controller)).toEqual([]);expect(top(f.controller).view.actions?.[0]).toMatchObject({title:'Choose folder'});await invoke(f.controller,'files:choose');expect(f.api.chooseFolder).toHaveBeenCalledTimes(1);expect(f.api.getState).toHaveBeenCalledTimes(1);expect(f.api.startIndex).not.toHaveBeenCalled();expect(items(f.controller)).toEqual([]);
  });
  it('refreshes after native selection and enters that root while indexing is still incomplete',async()=>{
    const f=setup({},[]);await settled();vi.mocked(f.api.chooseFolder).mockImplementation(async()=>{f.state.roots=[{...root,state:'scanning',activity:'indexing',generation:null,progress:null}];f.state.revision++;return {ok:true,value:{outcome:'selected',rootId}};});await invoke(f.controller,'files:choose');expect(top(f.controller).view).toMatchObject({kind:'list',title:'Search files',sections:[{title:root.name,items:[]}],status:{message:'Indexing is in progress. Results may be incomplete.'}});expect(f.api.getState).toHaveBeenCalledTimes(2);expect(f.api.search).not.toHaveBeenCalled();expect(f.api.startIndex).not.toHaveBeenCalled();
  });
  it('waits for indexing acknowledgement and authoritative state, blocks repeat/stale requests and claims no ready state',async()=>{
    let finish!:(value:Awaited<ReturnType<FileSearchApi['startIndex']>>)=>void;const f=setup({startIndex:vi.fn<FileSearchApi['startIndex']>(()=>new Promise(resolve=>{finish=resolve;}))});await settled();const pending=invoke(f.controller,'files:index',rootId);await invoke(f.controller,'files:index',rootId);await f.controller.refresh();expect(f.api.startIndex).toHaveBeenCalledExactlyOnceWith(rootId);expect(f.api.getState).toHaveBeenCalledTimes(1);f.state.roots[0]!.activity='indexing';f.state.roots[0]!.state='scanning';f.state.revision++;finish({ok:true,value:{outcome:'completed'}});await pending;expect(items(f.controller)[0]!.accessories![0]!.text).toContain('Scanning · Indexing');expect(f.api.getState).toHaveBeenCalledTimes(2);
  });
  it('sends only the selected ID for pause/removal and honours cancelled removal',async()=>{
    const f=setup({},[{...root,activity:'watching'}]);await settled();await invoke(f.controller,'files:pause',rootId);expect(f.api.pauseIndex).toHaveBeenCalledExactlyOnceWith(rootId);vi.mocked(f.api.removeFolder).mockResolvedValue({ok:true,value:{outcome:'cancelled'}});await invoke(f.controller,'files:remove',rootId);expect(f.api.removeFolder).toHaveBeenCalledExactlyOnceWith(rootId);expect(items(f.controller)).toHaveLength(1);expect(f.api.close).not.toHaveBeenCalled();
  });
  it('retains explicit Refresh after an unknown mutation even when a later state event succeeds',async()=>{
    const f=setup({startIndex:vi.fn<FileSearchApi['startIndex']>(async()=>{throw new Error('synthetic private detail');})});await settled();await invoke(f.controller,'files:search',rootId);await invoke(f.controller,'files:index');expect(top(f.controller).view.status?.message).toContain('could not be confirmed');f.push();await invoke(f.controller,'files:index');expect(f.api.startIndex).toHaveBeenCalledTimes(1);expect(top(f.controller).view.actions?.find(value=>value.id==='files:index')?.disabledReason).toContain('Refresh folders');expect(JSON.stringify(top(f.controller).view)).not.toContain('synthetic private');await invoke(f.controller,'files:refresh');await invoke(f.controller,'files:index');expect(f.api.startIndex).toHaveBeenCalledTimes(2);
  });
  it('keeps known denials actionable and never exposes raw backend details',async()=>{
    const f=setup({startIndex:vi.fn<FileSearchApi['startIndex']>(async()=>({ok:false,error:{code:'permission-denied',message:'synthetic private detail',retryable:false}}))});await settled();await invoke(f.controller,'files:index',rootId);expect(top(f.controller).view.status?.message).toContain('Check folder access');expect(JSON.stringify(top(f.controller).view)).not.toContain('synthetic private');
  });
  it('has an instructional empty query, accepts512ASCIIbytes and rejects oversized multibyte queries locally',async()=>{
    const f=setup();await settled();await invoke(f.controller,'files:search',rootId);expect(top(f.controller).view).toMatchObject({empty:{title:'Search selected folders'}});expect(f.api.search).not.toHaveBeenCalled();f.controller.query(top(f.controller).view.viewId,'é'.repeat(257));expect(top(f.controller).view.status?.message).toContain('512 UTF-8 bytes');expect(f.api.search).not.toHaveBeenCalled();f.controller.query(top(f.controller).view.viewId,'x'.repeat(512));await new Promise(resolve=>setTimeout(resolve,170));expect(f.api.search).toHaveBeenCalledExactlyOnceWith({query:'x'.repeat(512),rootId});
  });
  it('debounces queries and ignores late older results without shifting the new selection',async()=>{
    let finish!:(value:Awaited<ReturnType<FileSearchApi['search']>>)=>void;const f=setup({search:vi.fn<FileSearchApi['search']>().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockImplementation(async request=>({ok:true,value:{query:request.query,rootId,results:[rows[1]!]}}))});await settled();await search(f,'old');f.controller.query(top(f.controller).view.viewId,'intermediate');f.controller.query(top(f.controller).view.viewId,'new');await new Promise(resolve=>setTimeout(resolve,170));expect(f.api.search).toHaveBeenCalledTimes(2);expect(items(f.controller).map(row=>row.id)).toEqual([rows[1]!.id]);finish({ok:true,value:{query:'old',rootId,results:[rows[0]!]}});await settled();expect(items(f.controller).map(row=>row.id)).toEqual([rows[1]!.id]);
  });
  it.each(['query','scope','generation','unknown-root','duplicate'] as const)('rejects mismatched %s replies as a safe error',async mode=>{
    const f=setup({search:vi.fn<FileSearchApi['search']>(async request=>({ok:true,value:{query:mode==='query'?'wrong':request.query,rootId:mode==='scope'?null:rootId,results:mode==='duplicate'?[rows[0]!,rows[0]!]:[{...rows[0]!,...(mode==='generation'?{generation:nextGeneration}:{}),...(mode==='unknown-root'?{rootId:otherId,id:`${otherId}:${rows[0]!.path}`}:{})}]}}))});await settled();await search(f);expect(items(f.controller)).toEqual([]);expect(top(f.controller).view.status?.message).toContain('could not be searched');
  });
  it('preserves selected identity across relevant reordered results and ignores unrelated/progress-only events',async()=>{
    const f=setup({},[structuredClone(root),{...root,id:otherId,name:'Public archive'}]);await settled();await search(f);f.controller.session.select(top(f.controller).view.viewId,rows[1]!.id);f.state.roots[0]!.progress!.visited++;f.push();f.state.roots[1]!.activity='indexing';f.push();await new Promise(resolve=>setTimeout(resolve,170));expect(f.api.search).toHaveBeenCalledTimes(1);vi.mocked(f.api.search).mockImplementation(async request=>({ok:true,value:{query:request.query,rootId,results:[rows[1]!,rows[0]!]}}));f.state.roots[0]!.activity='watching';f.push();await new Promise(resolve=>setTimeout(resolve,20));expect(f.api.search).toHaveBeenCalledTimes(2);expect(top(f.controller).selection).toBe(rows[1]!.id);
  });
  it('invalidates derived rows/detail after index clear, shows paused state and never restarts indexing',async()=>{
    const f=setup();await settled();await search(f);await invoke(f.controller,'files:details',rows[0]!.id);expect(top(f.controller).view.kind).toBe('detail');vi.mocked(f.api.search).mockImplementation(async request=>({ok:true,value:{query:request.query,rootId,results:[]}}));f.state.roots[0]!.generation=null;f.state.roots[0]!.state='idle';f.state.roots[0]!.activity='paused';f.push();await settled();expect(top(f.controller).view.kind).toBe('list');expect(items(f.controller)).toEqual([]);expect(top(f.controller).view.status?.message).toContain('paused');expect(f.api.startIndex).not.toHaveBeenCalled();
  });
  it('does not query a removed scope and clears any prior result',async()=>{
    const f=setup();await settled();await search(f);f.state.roots=[];f.push();await settled();expect(items(f.controller)).toEqual([]);expect(top(f.controller).view.status?.message).toContain('removed');expect(f.api.search).toHaveBeenCalledTimes(1);
  });
  it('renders readonly metadata with static Markdown and pops Detail→Results→Folders before named Close',async()=>{
    const path='<script>public</script>.txt',row={...rows[0]!,id:`${rootId}:${path}`,path};const f=setup({search:vi.fn<FileSearchApi['search']>(async request=>({ok:true,value:{query:request.query,rootId,results:[row]}}))});await settled();await search(f);await invoke(f.controller,'files:details',row.id);expect(top(f.controller).view).toMatchObject({kind:'detail',markdown:expect.stringContaining('does not open the file'),metadata:expect.arrayContaining([{label:'Relative path',value:path}]),actions:[{id:'files:copy-path',disabledReason:expect.stringContaining('unavailable')}]});f.controller.session.pop();expect(top(f.controller)).toMatchObject({query:'public'});f.controller.session.pop();expect(top(f.controller).view.title).toBe('Folders');expect(f.api.close).not.toHaveBeenCalled();f.controller.session.pop();await settled();expect(f.api.close).toHaveBeenCalledTimes(1);expect(top(f.controller).view.title).toBe('Folders');
  });
  it('rejects stale actions and disposed replies, unsubscribes without stopping resident jobs',async()=>{
    let finish!:(value:Awaited<ReturnType<FileSearchApi['chooseFolder']>>)=>void;const f=setup({chooseFolder:vi.fn<FileSearchApi['chooseFolder']>(()=>new Promise(resolve=>{finish=resolve;}))});await settled();await f.controller.execute({viewId:'file-search-folders',revision:0,actionId:'files:remove',itemId:rootId});expect(f.api.removeFolder).not.toHaveBeenCalled();const pending=invoke(f.controller,'files:choose');f.controller.dispose();await pending;const snapshot=f.controller.session.getSnapshot();finish({ok:true,value:{outcome:'selected',rootId}});f.push();await settled();expect(f.controller.session.getSnapshot()).toBe(snapshot);expect(f.unsubscribe).toHaveBeenCalledTimes(1);expect(f.api.pauseIndex).not.toHaveBeenCalled();expect(f.api.close).not.toHaveBeenCalled();
  });
  it('does not replace newer state with a stale read or falsely confirm a mutation',async()=>{
    const f=setup({startIndex:vi.fn<FileSearchApi['startIndex']>(async()=>{throw new Error();})});await settled();await invoke(f.controller,'files:index',rootId);const old=structuredClone(f.state);f.state.appearance='light';f.push();vi.mocked(f.api.getState).mockResolvedValue({ok:true,value:old});await f.controller.refresh();expect(f.controller.getAppearance()).toBe('light');expect(top(f.controller).view.actions?.find(action=>action.id==='files:choose')?.disabledReason).toContain('Refresh');
  });
  it('keeps the root usable when closing fails',async()=>{
    const f=setup({close:vi.fn<FileSearchApi['close']>(async()=>{throw new Error('synthetic private detail');})});await settled();f.controller.session.pop();await settled();expect(top(f.controller).view.status?.message).toBe('File search could not close. Try again.');expect(top(f.controller).view.actions?.[0]?.title).toBe('Choose folder');
  });
});

it('L2-02 accepts same-revision appearance changes without replacing cached roots',async()=>{
  const f=setup();await settled();f.event({...structuredClone(f.state),appearance:'light',roots:[]});expect(f.controller.getAppearance()).toBe('light');expect(items(f.controller)).toHaveLength(1);expect(items(f.controller)[0]!.title).toBe(root.name);expect(f.api.startIndex).not.toHaveBeenCalled();
});

it('L2-02 retains selected stable ID when a new generation replaces invalidated metadata',async()=>{
  const f=setup();await settled();await search(f);f.controller.session.select(top(f.controller).view.viewId,rows[1]!.id);vi.mocked(f.api.search).mockImplementation(async request=>({ok:true,value:{query:request.query,rootId,results:[rows[0]!,rows[1]!].map(row=>({...row,generation:nextGeneration}))}}));f.state.roots[0]!.generation=nextGeneration;f.push();expect(items(f.controller)).toEqual([]);await new Promise(resolve=>setTimeout(resolve,20));expect(top(f.controller).selection).toBe(rows[1]!.id);
});
it('L2-02 Search all folders omits rootId and sends only the bounded local query',async()=>{
  const f=setup();await settled();await invoke(f.controller,'files:all');f.controller.query(top(f.controller).view.viewId,'public');await new Promise(resolve=>setTimeout(resolve,170));expect(f.api.search).toHaveBeenCalledExactlyOnceWith({query:'public'});expect(items(f.controller)).toHaveLength(2);expect(top(f.controller).view.kind==='list' && top(f.controller).view.title).toBe('Search files');
});

it.each(['cancelled','completed'] as const)('L2-02 waits for held native removal confirmation before a %s receipt',async outcome=>{
  let finish!:(value:Awaited<ReturnType<FileSearchApi['removeFolder']>>)=>void;
  const f=setup({removeFolder:vi.fn<FileSearchApi['removeFolder']>(()=>new Promise(resolve=>{finish=resolve;}))});await settled();vi.useFakeTimers();
  const pending=invoke(f.controller,'files:remove',rootId);await vi.advanceTimersByTimeAsync(10000);
  expect(top(f.controller).view.status?.message).toBe('Waiting for the folder request…');expect(f.api.getState).toHaveBeenCalledTimes(1);
  if(outcome==='completed'){f.state.roots=[];f.state.revision++;}
  finish({ok:true,value:{outcome}});await pending;expect(items(f.controller)).toHaveLength(outcome==='completed'?0:1);
  expect(top(f.controller).view.status?.message).not.toContain('could not be confirmed');expect(f.api.removeFolder).toHaveBeenCalledTimes(1);
});

it('offers explicit single-result Copy path from list and Detail without copying during search/navigation',async()=>{
  const copyPath=vi.fn<NonNullable<FileSearchApi['copyPath']>>(async selection=>({ok:true,value:{...selection,outcome:'copied',path:root.displayPath+'/'+rows[0]!.path}}));
  const f=setup({copyPath});await settled();await search(f);expect(copyPath).not.toHaveBeenCalled();
  expect(items(f.controller)[0]!.actions?.find(action=>action.id==='files:copy-path')?.disabledReason).toBeUndefined();
  await invoke(f.controller,'files:copy-path',rows[0]!.id);expect(copyPath).toHaveBeenCalledExactlyOnceWith({resultId:rows[0]!.id,rootId,generation});expect(top(f.controller).view.status?.message).toBe('Path copied.');
  await invoke(f.controller,'files:details',rows[0]!.id);expect(copyPath).toHaveBeenCalledTimes(1);expect(top(f.controller).view).toMatchObject({kind:'detail',actions:[{id:'files:copy-path',title:'Copy path'}]});expect(top(f.controller).view.actions?.[0]?.disabledReason).toBeUndefined();
  await invoke(f.controller,'files:copy-path');expect(copyPath).toHaveBeenCalledTimes(2);expect(top(f.controller).view.status?.message).toBe('Path copied.');
});
it('rejects stale, unselected and value-bearing Copy path intents before sending IPC',async()=>{
  const copyPath=vi.fn<NonNullable<FileSearchApi['copyPath']>>();const f=setup({copyPath});await settled();await search(f);const frame=top(f.controller);
  for(const intent of [{viewId:frame.view.viewId,revision:frame.view.revision-1,actionId:'files:copy-path',itemId:rows[0]!.id},{viewId:frame.view.viewId,revision:frame.view.revision,actionId:'files:copy-path',itemId:rows[1]!.id},{viewId:frame.view.viewId,revision:frame.view.revision,actionId:'files:copy-path',itemId:rows[0]!.id,values:{path:'/private'}}])await f.controller.execute(intent);
  expect(copyPath).not.toHaveBeenCalled();
});
it('warns on pending Back, ignores late receipt and preserves warning through unrelated folder-state refresh',async()=>{
  let finish!:(value:Awaited<ReturnType<NonNullable<FileSearchApi['copyPath']>>>)=>void;
  const copyPath=vi.fn<NonNullable<FileSearchApi['copyPath']>>(()=>new Promise(resolve=>{finish=resolve;}));const f=setup({copyPath});await settled();await search(f);await invoke(f.controller,'files:details',rows[0]!.id);
  const pending=invoke(f.controller,'files:copy-path');expect(copyPath).toHaveBeenCalledOnce();f.controller.session.pop();await pending;
  expect(top(f.controller).view.status?.message).toContain('Copy may have occurred');f.push();expect(top(f.controller).view.status?.message).toContain('Copy may have occurred');
  finish({ok:true,value:{outcome:'copied',resultId:rows[0]!.id,rootId,generation,path:root.displayPath+'/'+rows[0]!.path}});await settled();expect(top(f.controller).view.status?.message).not.toBe('Path copied.');
});
it('does not assign an old copy receipt to the newly selected result',async()=>{
  let finish!:(value:Awaited<ReturnType<NonNullable<FileSearchApi['copyPath']>>>)=>void;
  const copyPath=vi.fn<NonNullable<FileSearchApi['copyPath']>>(()=>new Promise(resolve=>{finish=resolve;}));const f=setup({copyPath});await settled();await search(f);const pending=invoke(f.controller,'files:copy-path',rows[0]!.id);
  f.controller.session.select(top(f.controller).view.viewId,rows[1]!.id);f.controller.host.selectionChanged?.(top(f.controller).view.viewId,rows[1]!.id);
  finish({ok:true,value:{outcome:'copied',resultId:rows[0]!.id,rootId,generation,path:root.displayPath+'/'+rows[0]!.path}});await pending;expect(top(f.controller).selection).toBe(rows[1]!.id);expect(top(f.controller).view.status?.message).toContain('Copy may have occurred');
});

it('immediately publishes uncertainty when pending List copy returns to Folders without a state event',async()=>{
  let finish!:(value:Awaited<ReturnType<NonNullable<FileSearchApi['copyPath']>>>)=>void;
  const copyPath=vi.fn<NonNullable<FileSearchApi['copyPath']>>(()=>new Promise(resolve=>{finish=resolve;}));const f=setup({copyPath});await settled();await search(f);const pending=invoke(f.controller,'files:copy-path',rows[0]!.id);
  f.controller.session.pop();await pending;expect(top(f.controller).view.title).toBe('Folders');expect(top(f.controller).view.status?.message).toContain('Copy may have occurred');
  finish({ok:true,value:{outcome:'copied',resultId:rows[0]!.id,rootId,generation,path:root.displayPath+'/'+rows[0]!.path}});await settled();expect(top(f.controller).view.status?.message).toContain('Copy may have occurred');
});
