import { afterEach,expect,it,vi } from 'vitest';
import type { CalculatorCopyReply,LauncherApi } from '@linuxcast/contracts';
import { LauncherController } from '../controller.ts';
const controllers:LauncherController[]=[];
afterEach(()=>{for(const controller of controllers.splice(0))controller.dispose();});
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
function setup(copyCalculatorResult:NonNullable<LauncherApi['copyCalculatorResult']>=vi.fn<NonNullable<LauncherApi['copyCalculatorResult']>>(async()=>({ok:true,value:{outcome:'copied',text:'6'}}))){
  let revision=1;
  const api:LauncherApi={copyCalculatorResult,getLauncherCommands:vi.fn<LauncherApi['getLauncherCommands']>(async()=>({ok:true,value:{revision,rankingAvailable:true,commands:[{id:'linuxcast:calculator',title:'Calculator',aliases:['calc'],keywords:['math'],enabled:true,usage:null}]}})),executeLauncherCommand:vi.fn(),openLauncherUrl:vi.fn(),setLauncherPinned:vi.fn(),setLauncherAlias:vi.fn()};
  const controller=new LauncherController(api,vi.fn(async()=>({ok:true as const,value:null})));controllers.push(controller);controller.setVisible(true);
  return {api,controller,nextRevision:()=>{revision++;}};
}
function top(f:ReturnType<typeof setup>){return f.controller.session.getSnapshot().frames.at(-1)!;}
async function open(f:ReturnType<typeof setup>){const frame=top(f);f.controller.session.select(frame.view.viewId,'linuxcast:calculator');await f.controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId:'linuxcast:calculator',itemId:'linuxcast:calculator'});}
async function evaluate(f:ReturnType<typeof setup>){const frame=top(f);await f.controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId:'calculator:evaluate',values:{expression:'3+3'}});}
function copy(f:ReturnType<typeof setup>){const frame=top(f);return f.controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId:'calculator:copy'});}
it('routes an explicitly selected Calculator into local views and sends no expression until Copy result',async()=>{
  const f=setup();await settle();await open(f);expect(top(f).view).toMatchObject({kind:'form',title:'Calculator'});await evaluate(f);expect(top(f).view).toMatchObject({kind:'detail',title:'Calculation',metadata:[{label:'Expression',value:'3+3'},{label:'Result',value:'6'}]});
  expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();expect(f.api.copyCalculatorResult).not.toHaveBeenCalled();expect(f.api.getLauncherCommands).toHaveBeenCalledTimes(1);
  await copy(f);expect(f.api.copyCalculatorResult).toHaveBeenCalledExactlyOnceWith({revision:1,expression:'3+3'});
});
it('clears both calculator frames on Hide, ignores late copy receipts and reopens with a fresh registry revision',async()=>{
  let finish!:(reply:CalculatorCopyReply)=>void;const writer=vi.fn<NonNullable<LauncherApi['copyCalculatorResult']>>().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({ok:true,value:{outcome:'copied',text:'6'}});
  const f=setup(writer);await settle();await open(f);await evaluate(f);const pending=copy(f);f.controller.setVisible(false);await pending;expect(f.controller.session.getSnapshot().frames).toHaveLength(1);
  f.nextRevision();f.controller.setVisible(true);await settle();await open(f);expect(top(f).view).toMatchObject({kind:'form',fields:[{id:'expression',value:''}]});
  finish({ok:true,value:{outcome:'copied',text:'6'}});await settle();expect(top(f).view.kind).toBe('form');expect(top(f).view.status?.message??'').not.toContain('copied');
  await evaluate(f);await copy(f);expect(writer).toHaveBeenLastCalledWith({revision:2,expression:'3+3'});
});

it('clears Form-only unit help on Hide and rejects its stale action after reopen',async()=>{
  const f=setup();await settle();await open(f);const form=top(f);
  await f.controller.execute({viewId:form.view.viewId,revision:form.view.revision,actionId:'calculator:units'});
  const help=top(f);expect(help.view).toMatchObject({kind:'detail',title:'Supported units'});expect(f.controller.session.getSnapshot().frames).toHaveLength(3);
  f.controller.setVisible(false);expect(f.controller.session.getSnapshot().frames).toHaveLength(1);
  f.nextRevision();f.controller.setVisible(true);await settle();await open(f);
  await f.controller.execute({viewId:help.view.viewId,revision:help.view.revision,actionId:'calculator:edit'});
  expect(top(f).view).toMatchObject({kind:'form',fields:[{id:'expression',value:''}]});expect(f.api.copyCalculatorResult).not.toHaveBeenCalled();
});
