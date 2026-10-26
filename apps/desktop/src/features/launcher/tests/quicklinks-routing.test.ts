import { afterEach,expect,it,vi } from 'vitest';
import type { LauncherApi,QuicklinkApi,QuicklinkOpenReply } from '@linuxcast/contracts';
import { LauncherController } from '../controller.ts';
const controllers:LauncherController[]=[];afterEach(()=>{for(const controller of controllers.splice(0))controller.dispose();});
const settle=()=>new Promise(resolve=>setTimeout(resolve,0)),id='00000000-0000-4000-8000-000000000001';
function setup(){let revision=1;
  const api:LauncherApi&Required<QuicklinkApi>={getLauncherCommands:vi.fn(async()=>({ok:true as const,value:{revision,rankingAvailable:true,commands:[{id:'linuxcast:open-quicklinks' as const,title:'Quicklinks',aliases:[],keywords:[],enabled:true,usage:null}]}})),executeLauncherCommand:vi.fn(),setLauncherPinned:vi.fn(),setLauncherAlias:vi.fn(),openLauncherUrl:vi.fn(),
    listQuicklinks:vi.fn(async()=>({ok:true as const,value:{records:[{id,revision:1,name:'Public docs',host:'example.invalid'}]}})),getQuicklink:vi.fn(),saveQuicklink:vi.fn(),removeQuicklink:vi.fn(),openQuicklink:vi.fn(async()=>({ok:true as const,value:{id,revision:1,outcome:'dispatched' as const}}))};
  const dismiss=vi.fn(async()=>({ok:true as const,value:null})),controller=new LauncherController(api,dismiss);controllers.push(controller);controller.setVisible(true);return {api,dismiss,controller,nextRevision:()=>{revision++;}};
}
function top(f:ReturnType<typeof setup>){return f.controller.session.getSnapshot().frames.at(-1)!;}
async function invoke(f:ReturnType<typeof setup>,actionId:string,itemId?:string){const frame=top(f);return f.controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId,...(itemId?{itemId}:{})});}
async function open(f:ReturnType<typeof setup>){const frame=top(f);f.controller.session.select(frame.view.viewId,'linuxcast:open-quicklinks');await invoke(f,'linuxcast:open-quicklinks','linuxcast:open-quicklinks');await settle();}
it('routes registered Quicklinks into the existing List/Form without generic execution or implicit browser effects',async()=>{
  const f=setup();await settle();f.controller.query('saved root query');await settle();f.controller.query('Quicklinks');await settle();await open(f);expect(top(f).view).toMatchObject({kind:'list',title:'Quicklinks'});expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();expect(f.api.openQuicklink).not.toHaveBeenCalled();
  const list=top(f);f.controller.session.setQuery(list.view.viewId,'example.invalid');await settle();expect(top(f).view.kind).toBe('list');expect(top(f).view.kind==='list'&&top(f).query).toBe('example.invalid');await invoke(f,'quicklinks:new');expect(f.controller.session.getSnapshot().frames).toHaveLength(3);expect(top(f).view).toMatchObject({kind:'form',title:'New quicklink'});
  f.controller.setVisible(false);expect(f.controller.session.getSnapshot().frames).toHaveLength(1);f.controller.setVisible(true);await settle();expect(top(f).query).toBe('Quicklinks');expect(f.api.saveQuicklink).not.toHaveBeenCalled();expect(f.api.openQuicklink).not.toHaveBeenCalled();
});
it('retains unknown Open across Hide/reopen and rejects a late receipt until explicit complete Reload',async()=>{
  const f=setup();await settle();await open(f);let finish!:(reply:QuicklinkOpenReply)=>void;vi.mocked(f.api.openQuicklink).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  f.controller.session.select(top(f).view.viewId,id);const pending=invoke(f,'quicklinks:open',id);f.controller.setVisible(false);await pending;expect(f.controller.session.getSnapshot().frames).toHaveLength(1);f.nextRevision();f.controller.setVisible(true);await settle();await open(f);
  finish({ok:true,value:{id,revision:1,outcome:'dispatched'}});await settle();expect(f.dismiss).not.toHaveBeenCalled();expect(top(f).view.status?.message).toContain('unknown');f.controller.session.select(top(f).view.viewId,id);await invoke(f,'quicklinks:open',id);expect(f.api.openQuicklink).toHaveBeenCalledTimes(1);
  await invoke(f,'quicklinks:reload');await invoke(f,'quicklinks:open',id);expect(f.api.openQuicklink).toHaveBeenLastCalledWith({id,revision:1,launcherRevision:2});expect(f.dismiss).toHaveBeenCalledTimes(1);
});
it('Back preserves root selection and query and never handles an action from a closed Quicklinks frame',async()=>{
  const f=setup();await settle();f.controller.query('Quicklinks');await settle();await open(f);const frame=top(f);await invoke(f,'quicklinks:back');await settle();expect(f.controller.session.getSnapshot().frames).toHaveLength(1);expect(top(f).selection).toBe('linuxcast:open-quicklinks');expect(top(f).query).toBe('Quicklinks');
  await f.controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId:'quicklinks:open',itemId:id});expect(f.api.openQuicklink).not.toHaveBeenCalled();
});
