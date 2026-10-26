import { expect,it,vi } from 'vitest';
import { QUICKLINK_CHANNELS } from '@linuxcast/contracts';
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
