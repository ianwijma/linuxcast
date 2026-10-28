import {afterEach,expect,it,vi} from 'vitest';
import {RATE_ENDPOINT} from '@linuxcast/contracts';
import type {LauncherApi,LauncherCommandMetadata,RateConfigurationReply} from '@linuxcast/contracts';
import {LauncherController} from '../controller.ts';
const controllers:LauncherController[]=[];
afterEach(()=>{for(const c of controllers.splice(0))c.dispose();});
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
function setup(){
 let revision=1;
 const commands:LauncherCommandMetadata[]=[{id:'linuxcast:currency-conversion',title:'Currency conversion',aliases:[],keywords:['rates'],enabled:true,hidden:false,usage:null}];
 const api:LauncherApi={getLauncherCommands:vi.fn(async()=>({ok:true as const,value:{revision,commands,rankingAvailable:true}})),executeLauncherCommand:vi.fn(),openLauncherUrl:vi.fn(),setLauncherPinned:vi.fn(),setLauncherAlias:vi.fn(),getRateConfiguration:vi.fn(async()=>({ok:true as const,value:{revision:0,source:'disabled' as const,endpoint:RATE_ENDPOINT}})),configureRateSource:vi.fn(),convertRate:vi.fn(),copyRateResult:vi.fn(),clearRateCache:vi.fn()};
 const controller=new LauncherController(api,vi.fn(async()=>({ok:true as const,value:null})));controllers.push(controller);controller.setVisible(true);
 return {controller,api,commands,next:()=>revision++};
}
function top(f:ReturnType<typeof setup>){return f.controller.session.getSnapshot().frames.at(-1)!;}
async function action(f:ReturnType<typeof setup>,actionId:string,values?:Record<string,string>){const frame=top(f);await f.controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId,...(values?{values}:{})});}
async function open(f:ReturnType<typeof setup>){const frame=top(f);f.controller.session.select(frame.view.viewId,'linuxcast:currency-conversion');await f.controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId:'linuxcast:currency-conversion',itemId:'linuxcast:currency-conversion'});await settle();}
it('opens the registered rates Form with a read only, preserving search; typing/help never converts or generically executes',async()=>{
 const f=setup();await settle();f.controller.session.setQuery('linuxcast-launcher','currency');f.controller.query('currency');await settle();await open(f);
 expect(top(f).view).toMatchObject({kind:'form',title:'Currency conversion',fields:[{value:'100'},{value:'USD'},{value:'EUR'}]});expect(f.api.getRateConfiguration).toHaveBeenCalledExactlyOnceWith({revision:1});
 f.controller.query('forged hidden root change');await f.controller.refresh();await action(f,'rates:about');expect(top(f).view.title).toBe('About rates');expect(f.controller.session.getSnapshot().frames).toHaveLength(3);await action(f,'rates:back');await action(f,'rates:cancel');await settle();expect(top(f).query).toBe('currency');expect(top(f).selection).toBe('linuxcast:currency-conversion');expect(f.api.convertRate).not.toHaveBeenCalled();expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();expect(f.api.copyRateResult).not.toHaveBeenCalled();
});
it('Hide removes both owned frames, rejects stale help actions and reloads using the fresh registry',async()=>{
 const f=setup();await settle();await open(f);await action(f,'rates:about');const stale=top(f);f.controller.setVisible(false);expect(f.controller.session.getSnapshot().frames).toHaveLength(1);f.next();f.controller.setVisible(true);await settle();await open(f);await f.controller.execute({viewId:stale.view.viewId,revision:stale.view.revision,actionId:'rates:back'});expect(top(f).view.title).toBe('Currency conversion');expect(f.api.getRateConfiguration).toHaveBeenLastCalledWith({revision:2});expect(f.api.convertRate).not.toHaveBeenCalled();
});
it.each(['hidden','disabled'] as const)('never opens a %s registered rates command',async kind=>{
 const f=setup();await settle();if(kind==='hidden')f.commands[0]!.hidden=true;else {f.commands[0]!.enabled=false;f.commands[0]!.unavailableReason='Synthetic unavailable source.';}await f.controller.refresh();await open(f);expect(top(f).view.kind).toBe('list');expect(f.api.getRateConfiguration).not.toHaveBeenCalled();expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
});
it('rejects extra root authority and represents missing preload capability without simulated success',async()=>{
 const f=setup();delete f.api.getRateConfiguration;await settle();const frame=top(f);await f.controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId:'linuxcast:currency-conversion',itemId:'linuxcast:currency-conversion',values:{endpoint:'https://private.test'}});expect(top(f).view.kind).toBe('list');await open(f);expect(top(f).view.status?.message).toContain('unavailable');expect(f.api.convertRate).not.toHaveBeenCalled();expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
});
it('retains unknown source mutation across Hide and automatic reload until deliberate Reload configuration',async()=>{
 const f=setup();let resolve!:(value:RateConfigurationReply)=>void;f.api.configureRateSource=vi.fn(()=>new Promise<RateConfigurationReply>(done=>{resolve=done;}));await settle();await open(f);await action(f,'rates:configure');const pending=action(f,'rates:save-source',{source:'frankfurter'});await settle();expect(f.api.configureRateSource).toHaveBeenCalledOnce();f.controller.setVisible(false);await pending;f.next();f.controller.setVisible(true);await settle();await open(f);expect(top(f).view.status?.message).toContain('may have occurred');resolve({ok:true,value:{revision:1,source:'frankfurter',endpoint:RATE_ENDPOINT}});await settle();expect(top(f).view.status?.message).toContain('may have occurred');await action(f,'rates:reload');expect(top(f).view.status?.message).toContain('No action was replayed');expect(f.api.configureRateSource).toHaveBeenCalledOnce();expect(f.api.convertRate).not.toHaveBeenCalled();
});
