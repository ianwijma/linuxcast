import { expect,it,vi } from 'vitest';
import { QUICKLINK_CHANNELS,WEB_SEARCH_TEMPLATE } from '@linuxcast/contracts';
import { createQuicklinkApi } from './quicklinks.ts';
const id='00000000-0000-4000-8000-000000000001',selection={id,revision:1};
const save={expectedRevision:0,name:'Public docs',url:'HTTPS://EXAMPLE.invalid:443/docs'};
const record={...selection,name:save.name,url:'https://example.invalid/docs',createdAt:'2026-10-26T00:00:00.000Z',updatedAt:'2026-10-26T00:00:00.000Z'};
function fixture(){const invoke=vi.fn<(channel:string,payload:unknown)=>Promise<unknown>>();return {invoke,api:createQuicklinkApi({invoke})};}
it('uses strict named requests and canonicalizes Save without conferring URL authority to Open',async()=>{
  const {api,invoke}=fixture();invoke.mockResolvedValue({ok:true,value:{record}});
  expect(await api.saveQuicklink(save)).toEqual({ok:true,value:{record}});expect(invoke).toHaveBeenLastCalledWith(QUICKLINK_CHANNELS.save,{protocolVersion:1,...save,url:record.url});
  invoke.mockResolvedValue({ok:true,value:{...selection,outcome:'dispatched'}});expect(await api.openQuicklink({...selection,launcherRevision:1})).toMatchObject({ok:true});expect(invoke).toHaveBeenLastCalledWith(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision:1});
  invoke.mockClear();for(const request of [{...selection,launcherRevision:1,url:record.url},{...selection,launcherRevision:0},{...selection,launcherRevision:1,argv:[]}])expect(await api.openQuicklink(request as never)).toMatchObject({ok:false});
  for(const url of ['https://example.invalid/{query}','file:///tmp/public','https://user@example.invalid/'])expect(await api.saveQuicklink({...save,url})).toMatchObject({ok:false});expect(invoke).not.toHaveBeenCalled();
});
it('requires get/save identities, version, canonical URL and name receipts without automatic replay',async()=>{
  const {api,invoke}=fixture();
  for(const value of [{...record,id:'00000000-0000-4000-8000-000000000002'},{...record,revision:2}]){invoke.mockResolvedValue({ok:true,value:{record:value}});expect(await api.getQuicklink(selection)).toMatchObject({ok:false});}
  for(const value of [{...record,name:'Other'},{...record,url:'https://other.invalid/'},{...record,revision:2}]){invoke.mockResolvedValue({ok:true,value:{record:value}});expect(await api.saveQuicklink(save)).toMatchObject({ok:false});}
  invoke.mockResolvedValue({ok:true,value:{record:{...record,id:'00000000-0000-4000-8000-000000000002',revision:2}}});expect(await api.saveQuicklink({...save,id,expectedRevision:1})).toMatchObject({ok:false});expect(invoke).toHaveBeenCalledTimes(6);
});
it('validates exact removed/cancelled/dispatched identities and never invents completed effects',async()=>{
  const {api,invoke}=fixture();
  for(const outcome of ['removed','cancelled']){invoke.mockResolvedValue({ok:true,value:{...selection,outcome}});expect(await api.removeQuicklink(selection)).toMatchObject({ok:true});}
  for(const value of [{...selection,outcome:'completed'},{...selection,revision:2,outcome:'removed'}]){invoke.mockResolvedValue({ok:true,value});expect(await api.removeQuicklink(selection)).toMatchObject({ok:false});}
  for(const value of [{...selection,outcome:'completed'},{...selection,revision:2,outcome:'dispatched'}]){invoke.mockResolvedValue({ok:true,value});expect(await api.openQuicklink({...selection,launcherRevision:1})).toMatchObject({ok:false});}
});
it('bounds complete sorted summaries and strips malformed, oversized and private transport failures',async()=>{
  const {api,invoke}=fixture();const summary={...selection,name:record.name,host:'example.invalid'};
  invoke.mockResolvedValue({ok:true,value:{records:[summary]}});expect(await api.listQuicklinks()).toEqual({ok:true,value:{records:[summary]}});
  for(const value of [{ok:true,value:{records:[{...summary,url:record.url}]}},{ok:true,value:{records:[summary,summary]}},{ok:true,value:{records:'x'.repeat(1048577)}}]){invoke.mockResolvedValue(value);expect(await api.listQuicklinks()).toMatchObject({ok:false});}
  invoke.mockRejectedValue(new Error('SYNTHETIC_PRIVATE'));expect(JSON.stringify(await api.listQuicklinks())).not.toContain('SYNTHETIC_PRIVATE');
});
it('requires exact saved configuration rather than accepting a changed component or silently converting a search to a literal',async()=>{
  const {api,invoke}=fixture(),webSearch={queryParameter:'q',template:WEB_SEARCH_TEMPLATE};
  for(const reply of [record,{...record,webSearch:{...webSearch,queryParameter:'other'}}]){invoke.mockResolvedValue({ok:true,value:{record:reply}});expect(await api.saveQuicklink({...save,webSearch})).toMatchObject({ok:false});}
  invoke.mockResolvedValue({ok:true,value:{record:{...record,webSearch}}});expect(await api.saveQuicklink({...save,webSearch})).toMatchObject({ok:true});expect(await api.saveQuicklink(save)).toMatchObject({ok:false});
});
it('validates exact transient query receipts and forbids extra argument echoes for literal opening',async()=>{
  const {api,invoke}=fixture(),query='public & literal',url='https://example.invalid/?q=public+%26+literal',request={...selection,launcherRevision:1,query};
  invoke.mockResolvedValue({ok:true,value:{...selection,outcome:'dispatched',webSearch:{query,url}}});expect(await api.openQuicklink(request)).toMatchObject({ok:true,value:{webSearch:{query,url}}});expect(invoke).toHaveBeenLastCalledWith(QUICKLINK_CHANNELS.open,{protocolVersion:1,...request});
  expect(await api.openQuicklink({...selection,launcherRevision:1})).toMatchObject({ok:false});
  for(const webSearch of [undefined,{query:'different',url}]){invoke.mockResolvedValue({ok:true,value:{...selection,outcome:'dispatched',...(webSearch?{webSearch}:{})}});expect(await api.openQuicklink(request)).toMatchObject({ok:false});}
});

it('sends canonical tag labels and rejects mismatched tag receipts without replay',async()=>{
 const {api,invoke}=fixture();invoke.mockResolvedValueOnce({ok:true,value:{record:{...record,tags:['Work']}}});expect(await api.saveQuicklink({...save,tags:[' Ｗｏｒｋ ']})).toMatchObject({ok:true,value:{record:{tags:['Work']}}});expect(invoke).toHaveBeenLastCalledWith(QUICKLINK_CHANNELS.save,{protocolVersion:1,...save,url:record.url,tags:['Work']});invoke.mockResolvedValueOnce({ok:true,value:{record:{...record,tags:['Other']}}});expect(await api.saveQuicklink({...save,tags:['Work']})).toMatchObject({ok:false});invoke.mockClear();expect(await api.saveQuicklink({...save,tags:['Work','ｗｏｒｋ']})).toMatchObject({ok:false});expect(invoke).not.toHaveBeenCalled();
});

it('requires exact pin/hide flags while treating false and absent as equivalent ordinary defaults',async()=>{
 const {api,invoke}=fixture();for(const field of ['pinned','hidden'] as const){invoke.mockResolvedValueOnce({ok:true,value:{record}});expect(await api.saveQuicklink({...save,[field]:true})).toMatchObject({ok:false});invoke.mockResolvedValueOnce({ok:true,value:{record:{...record,[field]:true}}});expect(await api.saveQuicklink({...save,[field]:true})).toMatchObject({ok:true});}
 invoke.mockResolvedValueOnce({ok:true,value:{record}});expect(await api.saveQuicklink({...save,pinned:false,hidden:false})).toMatchObject({ok:true});invoke.mockClear();expect(await api.saveQuicklink({...save,pinned:1} as never)).toMatchObject({ok:false});expect(invoke).not.toHaveBeenCalled();
});

it('exports only a strict saved selection and validates exact native outcome receipts without replay',async()=>{
 const {api,invoke}=fixture();for(const outcome of ['exported','cancelled']){invoke.mockResolvedValueOnce({ok:true,value:{...selection,outcome}});expect(await api.exportQuicklink(selection)).toEqual({ok:true,value:{...selection,outcome}});expect(invoke).toHaveBeenLastCalledWith(QUICKLINK_CHANNELS.export,{protocolVersion:1,...selection});}
 for(const value of [{...selection,revision:2,outcome:'exported'},{...selection,id:'00000000-0000-4000-8000-000000000002',outcome:'exported'},{...selection,outcome:'completed'},{...selection,outcome:'exported',path:'/tmp/private'}]){invoke.mockResolvedValueOnce({ok:true,value});expect(await api.exportQuicklink(selection)).toMatchObject({ok:false});}expect(invoke).toHaveBeenCalledTimes(6);invoke.mockClear();for(const extra of [{path:'/tmp/public.json'},{url:record.url},{query:'private'},{grants:[]}])expect(await api.exportQuicklink({...selection,...extra} as never)).toMatchObject({ok:false});expect(invoke).not.toHaveBeenCalled();
});

it('validates path configuration and exact transient argument receipts without accepting a literal argument echo or dual kinds',async()=>{
 const {api,invoke}=fixture(),pathArgument={component:'path-segment' as const,template:WEB_SEARCH_TEMPLATE},query='public / 路径',url='https://example.invalid/docs/public%20%2F%20%E8%B7%AF%E5%BE%84';invoke.mockResolvedValueOnce({ok:true,value:{record:{...record,pathArgument}}});expect(await api.saveQuicklink({...save,pathArgument})).toMatchObject({ok:true});invoke.mockResolvedValueOnce({ok:true,value:{record}});expect(await api.saveQuicklink({...save,pathArgument})).toMatchObject({ok:false});invoke.mockResolvedValue({ok:true,value:{...selection,outcome:'dispatched',pathArgument:{query,url}}});expect(await api.openQuicklink({...selection,launcherRevision:1,query})).toMatchObject({ok:true,value:{pathArgument:{query,url}}});expect(await api.openQuicklink({...selection,launcherRevision:1})).toMatchObject({ok:false});expect(await api.openQuicklink({...selection,launcherRevision:1,query:'other'})).toMatchObject({ok:false});invoke.mockResolvedValueOnce({ok:true,value:{...selection,outcome:'dispatched',pathArgument:{query,url},webSearch:{query,url}}});expect(await api.openQuicklink({...selection,launcherRevision:1,query})).toMatchObject({ok:false});
});

it('passes a strict public clock snapshot and validates exact matching receipt kinds without replay',async()=>{
 const {api,invoke}=fixture(),clock={capturedAt:'2026-12-31T23:59:59.123Z',timeZone:'UTC'},receipt={...clock,url:'https://example.invalid/docs?when=23%3A59%3A59',value:'23:59:59'},request={...selection,launcherRevision:1,clock};
 invoke.mockResolvedValue({ok:true,value:{...selection,outcome:'dispatched',clock:receipt}});expect(await api.openQuicklink(request)).toMatchObject({ok:true});expect(invoke).toHaveBeenLastCalledWith(QUICKLINK_CHANNELS.open,{protocolVersion:1,...request});expect(await api.openQuicklink({...selection,launcherRevision:1})).toMatchObject({ok:false});expect(await api.openQuicklink({...selection,launcherRevision:1,query:'public'})).toMatchObject({ok:false});
 for(const patch of [{clock:undefined},{clock:{...receipt,capturedAt:'2027-01-01T00:00:00.000Z'}},{clock:{...receipt,timeZone:'Australia/Sydney'}},{clock:receipt,webSearch:{query:'public',url:record.url}},{clock:{...receipt,value:'private\nvalue'}}]){invoke.mockResolvedValueOnce({ok:true,value:{...selection,outcome:'dispatched',...patch}});const before=invoke.mock.calls.length;expect(await api.openQuicklink(request)).toMatchObject({ok:false});expect(invoke).toHaveBeenCalledTimes(before+1);}
 invoke.mockClear();for(const patch of [{query:'public'},{clock:{...clock,url:record.url}},{url:record.url}])expect(await api.openQuicklink({...request,...patch} as never)).toMatchObject({ok:false});expect(invoke).not.toHaveBeenCalled();
});
it('requires exact saved clock configuration and its removal when converting to a literal',async()=>{
 const {api,invoke}=fixture(),clock={queryParameter:'when',source:'date' as const,timeZone:'system' as const};
 for(const received of [record,{...record,clock:{...clock,timeZone:'UTC'}}]){invoke.mockResolvedValueOnce({ok:true,value:{record:received}});expect(await api.saveQuicklink({...save,clock})).toMatchObject({ok:false});}
 invoke.mockResolvedValue({ok:true,value:{record:{...record,clock}}});expect(await api.saveQuicklink({...save,clock})).toMatchObject({ok:true});expect(await api.saveQuicklink(save)).toMatchObject({ok:false});
});
