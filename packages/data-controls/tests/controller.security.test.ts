import { describe,expect,it,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DataControls } from '../src/controller.ts';
import type { DataControlClient } from '../src/controller.ts';
const client=(request:ReturnType<typeof vi.fn>)=>({request} as unknown as DataControlClient);
const deferred=()=>{let resolve!:()=>void;return {promise:new Promise<void>(r=>{resolve=r;}),resolve:()=>resolve()};};
describe('F2-02 data-control coordination',()=>{
  it('awaits selected index stops, bars new jobs, and repeats bounded owner batches',async()=>{
    const id=randomUUID(),other=randomUUID(),stop=deferred(),events:string[]=[];
    const request=vi.fn().mockImplementationOnce(async()=>{events.push('clear');return {category:'file-index',removed:512,complete:false};}).mockResolvedValueOnce({category:'file-index',removed:8,complete:true});
    const controls=new DataControls(client(request));controls.registerIndexJob(id,{stop:async()=>{events.push('stop');await stop.promise;}});const untouched=vi.fn();controls.registerIndexJob(other,{stop:untouched});
    const pending=controls.clear({category:'file-index',ids:[id]});await Promise.resolve();expect(request).not.toHaveBeenCalled();expect(()=>controls.registerIndexJob(randomUUID(),{stop:async()=>{}})).toThrow();stop.resolve();
    expect(await pending).toEqual({outcome:'completed',category:'file-index',removed:520});expect(events).toEqual(['stop','clear']);expect(untouched).not.toHaveBeenCalled();expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.every(call=>JSON.stringify(call[1])===JSON.stringify({category:'file-index',ids:[id]}))).toBe(true);
  });
  it('never clears after a failed stop and retains the registration for explicit retry',async()=>{
    const id=randomUUID(),request=vi.fn(),controls=new DataControls(client(request));controls.registerIndexJob(id,{stop:async()=>{throw new Error('synthetic private error');}});
    expect(await controls.clear({category:'file-index'})).toMatchObject({outcome:'unavailable',reason:'index-stop-failed',mayHaveChanged:false});expect(request).not.toHaveBeenCalled();expect(()=>controls.registerIndexJob(id,{stop:async()=>{}})).toThrow();
  });
  it('cancels before dispatch and between batches without replaying committed work',async()=>{
    const signal=new AbortController(),request=vi.fn(async()=>{signal.abort();return {category:'file-index',removed:512,complete:false};}),controls=new DataControls(client(request));
    expect(await controls.clear({category:'file-index'},{signal:signal.signal})).toMatchObject({outcome:'cancelled',removed:512,mayHaveChanged:true,automaticReplay:false});expect(request).toHaveBeenCalledTimes(1);
    expect(await controls.clear({category:'file-index'},{signal:signal.signal})).toMatchObject({outcome:'cancelled',removed:0,mayHaveChanged:false});expect(request).toHaveBeenCalledTimes(1);
  });
  it('treats empty selection as no action and refuses private categories or concurrent clears',async()=>{
    const wait=deferred(),request=vi.fn(async()=>{await wait.promise;return {category:'command-usage',removed:1,complete:true};}),controls=new DataControls(client(request));
    expect(await controls.clear({category:'file-index',ids:[]})).toMatchObject({outcome:'completed',removed:0});expect(request).not.toHaveBeenCalled();expect(await controls.clear({category:'secretRefs'})).toMatchObject({reason:'invalid-request'});
    const pending=controls.clear({category:'command-usage'});expect(await controls.clear({category:'ai-conversations'})).toMatchObject({reason:'clear-in-progress',mayHaveChanged:false});wait.resolve();expect(await pending).toMatchObject({outcome:'completed'});
  });
  it.each([{category:'command-usage',removed:1,complete:true},{category:'file-index',removed:0,complete:false},{category:'file-index',removed:513,complete:false}])('fails closed on contradictory owner response %#',async result=>{
    const request=vi.fn().mockResolvedValue(result);expect(await new DataControls(client(request)).clear({category:'file-index'})).toMatchObject({outcome:'unavailable',reason:'storage-unavailable',mayHaveChanged:true,automaticReplay:false});expect(request).toHaveBeenCalledTimes(1);
  });
  it('returns an independent allowlisted snapshot and rejects unexpected category/selection/private fields',async()=>{
    const result={category:'settings',records:[{id:'ui.theme',revision:1,value:'dark',modifiedAt:'2026-10-24T00:00:00Z'}]},request=vi.fn().mockResolvedValue(result),controls=new DataControls(client(request));
    const exported=await controls.export({category:'settings',ids:['ui.theme']});expect(exported).toMatchObject({outcome:'exported',encrypted:false});result.records[0]!.value='light';expect(exported).toMatchObject({data:{records:[{value:'dark'}]}});
    expect(await controls.export({category:'settings',ids:['launcher.shortcut']})).toMatchObject({outcome:'unavailable'});request.mockResolvedValue({...result,secret:'synthetic'});expect(await controls.export({category:'settings'})).toMatchObject({outcome:'unavailable'});
    expect(await controls.export({category:'permissions'})).toMatchObject({reason:'invalid-request'});
  });
  it('makes oversized exports actionable and redacts storage errors',async()=>{
    const request=vi.fn().mockRejectedValue({reasonCode:'export-too-large',message:'synthetic private content'}),controls=new DataControls(client(request));
    expect(await controls.export({category:'ai-conversations'})).toEqual({outcome:'unavailable',reason:'export-too-large',remediationAction:'select-smaller-category'});request.mockRejectedValue(new Error('synthetic private content'));expect(await controls.export({category:'settings'})).toEqual({outcome:'unavailable',reason:'storage-unavailable',remediationAction:'retry-storage'});
  });
});
