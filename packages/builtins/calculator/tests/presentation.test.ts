import { afterEach,describe,expect,it,vi } from 'vitest';
import { ViewSession } from '@linuxcast/ui/views';
import type { LauncherApi,ViewModel } from '@linuxcast/contracts';
import { CalculatorFlow } from '../src/presentation.ts';
const root:ViewModel={protocolVersion:1,viewId:'root',revision:1,kind:'list',title:'Search commands',search:{query:'calculator',placeholder:'Search commands…',mode:'host'},sections:[{id:'commands',items:[{id:'calculator',title:'Calculator',actions:[{id:'open',title:'Open Calculator',kind:'invoke',effect:'read'}]}]}]};
const flows:CalculatorFlow[]=[];
afterEach(()=>{for(const flow of flows.splice(0))flow.dispose();vi.useRealTimers();});
function setup(api:Pick<LauncherApi,'copyCalculatorResult'>={copyCalculatorResult:vi.fn<NonNullable<LauncherApi['copyCalculatorResult']>>(async()=>({ok:true,value:{outcome:'copied',text:'20'}}))}){
  const session=new ViewSession(root,id=>{flow?.closed(id);});const flow=new CalculatorFlow({session,api,viewId:'test-calculator',revision:7});flows.push(flow);flow.open('root');return {flow,session,api};
}
function top(f:ReturnType<typeof setup>){return f.session.getSnapshot().frames.at(-1)!;}
function act(f:ReturnType<typeof setup>,actionId:string,values?:Record<string,string>){const frame=top(f);return f.flow.handle({viewId:frame.view.viewId,revision:frame.view.revision,actionId,...(values?{values}:{})});}
const evaluate=(f:ReturnType<typeof setup>,expression='(2 + 3) * 4')=>act(f,'calculator:evaluate',{expression});
describe('L2-04 Calculator shared presentation',()=>{
  it('opens only a labelled shared Form and preserves root query/selection without any IPC',()=>{
    const f=setup();expect(f.flow.active).toBe(true);expect(top(f).view).toMatchObject({kind:'form',title:'Calculator',fields:[{id:'expression',title:'Expression',value:''}],actions:[{title:'Evaluate',effect:'read'},{title:'Cancel'}]});expect(f.session.getSnapshot().frames[0]).toMatchObject({query:'calculator',selection:'calculator'});expect(f.api.copyCalculatorResult).not.toHaveBeenCalled();f.flow.open('root');expect(f.session.getSnapshot().frames).toHaveLength(2);
  });
  it('evaluates only on submit and renders static readonly metadata with approximation/percent semantics',async()=>{
    const f=setup();await evaluate(f);expect(top(f).view).toMatchObject({kind:'detail',title:'Calculation',metadata:[{label:'Expression',value:'(2 + 3) * 4'},{label:'Result',value:'20'}],attachments:[],actions:[{title:'Copy result',effect:'write'},{title:'Edit expression',effect:'read'}]});const view=top(f).view;if(view.kind!=='detail')throw new Error();expect(view.markdown).toContain('15 significant digits');expect(view.markdown).toContain('divides the preceding value by 100');expect(f.api.copyCalculatorResult).not.toHaveBeenCalled();
  });
  it.each(['2 +','unknown(2)','<img src=x onerror=alert(1)>'])('retains invalid expression %j with fixed safe inline error and no result/copy',async expression=>{
    const f=setup();await evaluate(f,expression);expect(top(f).view).toMatchObject({kind:'form',fields:[{value:expression,error:'Enter a supported arithmetic expression.'}]});expect(f.api.copyCalculatorResult).not.toHaveBeenCalled();
  });
  it.each(['1 / 0','sqrt(-1)'])('retains domain error %j without a nonfinite display result',async expression=>{
    const f=setup();await evaluate(f,expression);expect(top(f).view).toMatchObject({kind:'form',fields:[{value:expression,error:'This expression has no finite real result. Check divisions and function inputs.'}]});expect(f.api.copyCalculatorResult).not.toHaveBeenCalled();
  });
  it.each(['x'.repeat(513),'é'.repeat(257),'2\n+3','2\ud800'])('bounds invalid input locally before evaluator/IPC',async expression=>{
    const f=setup();await evaluate(f,expression);expect(top(f).view).toMatchObject({kind:'form',fields:[{value:expression,error:'Use a non-empty expression up to 512 UTF-8 bytes without control characters.'}]});expect(f.api.copyCalculatorResult).not.toHaveBeenCalled();
  });
  it('rejects stale/root/selected/extra value action shapes without evaluating or copying',async()=>{
    const f=setup(),frame=top(f);const base={viewId:frame.view.viewId,revision:frame.view.revision,actionId:'calculator:evaluate',values:{expression:'2+3'}};
    for(const intent of [{...base,revision:0},{...base,viewId:'root'},{...base,itemId:'calculator'},{...base,values:{expression:'2+3',extra:'private'}},{...base,values:{expression:3}},{...base,unknown:'private'}])await f.flow.handle(intent as never);
    expect(top(f).view.kind).toBe('form');expect(f.api.copyCalculatorResult).not.toHaveBeenCalled();
  });
  it('Edit and Escape return Result→Form→root with the submitted draft and stable root state',async()=>{
    const f=setup();await evaluate(f);await act(f,'calculator:edit');expect(top(f).view).toMatchObject({kind:'form',fields:[{value:'(2 + 3) * 4'}]});await evaluate(f);f.session.pop();expect(top(f).view.kind).toBe('form');f.session.pop();expect(f.flow.active).toBe(false);expect(top(f)).toMatchObject({query:'calculator',selection:'calculator'});expect(f.flow.closed('unrelated')).toBe(false);expect(f.flow.owns('test-calculator-result')).toBe(true);
  });
  it('copies only on explicit action with registry revision/expression and validates the exact receipt',async()=>{
    const f=setup();await evaluate(f);await act(f,'calculator:copy');expect(f.api.copyCalculatorResult).toHaveBeenCalledExactlyOnceWith({revision:7,expression:'(2 + 3) * 4'});expect(top(f).view.status).toEqual({kind:'info',message:'Result copied.'});expect(f.session.getSnapshot().frames).toHaveLength(3);
  });
  it('missing copy API disables Copy with remediation while local evaluation remains usable',async()=>{
    const f=setup({});await evaluate(f,'10%');expect(top(f).view).toMatchObject({metadata:[{label:'Expression',value:'10%'},{label:'Result',value:'0.1'}],actions:[{disabledReason:expect.stringContaining('Reopen Linuxcast')},{title:'Edit expression'}]});await act(f,'calculator:copy');await act(f,'calculator:edit');await evaluate(f,'sqrt(16)');expect(top(f).view.kind).toBe('detail');
  });
  it('blocks duplicate copy and extra result arguments while awaiting acknowledgement',async()=>{
    let finish!:(reply:Awaited<ReturnType<NonNullable<LauncherApi['copyCalculatorResult']>>>)=>void;const copy=vi.fn<NonNullable<LauncherApi['copyCalculatorResult']>>(()=>new Promise(resolve=>{finish=resolve;}));const f=setup({copyCalculatorResult:copy});await evaluate(f);const pending=act(f,'calculator:copy');await act(f,'calculator:copy');await act(f,'calculator:copy',{expression:'9+9'});expect(copy).toHaveBeenCalledTimes(1);expect(top(f).view).toMatchObject({loading:true,actions:[{disabledReason:expect.any(String)},{title:'Edit expression'}]});finish({ok:true,value:{outcome:'copied',text:'20'}});await pending;expect(top(f).view.status?.message).toBe('Result copied.');
  });
  it.each(['capability-unavailable','invalid-request','permission-denied'] as const)('shows safe actionable known %s failure and permits only manual retry',async code=>{
    const copy=vi.fn<NonNullable<LauncherApi['copyCalculatorResult']>>().mockResolvedValueOnce({ok:false,error:{code,message:'synthetic private detail',retryable:false}}).mockResolvedValueOnce({ok:true,value:{outcome:'copied',text:'20'}});const f=setup({copyCalculatorResult:copy});await evaluate(f);await act(f,'calculator:copy');expect(top(f).view.status?.message).toContain('Check clipboard access');expect(JSON.stringify(top(f).view)).not.toContain('synthetic private');expect(copy).toHaveBeenCalledTimes(1);await act(f,'calculator:copy');expect(copy).toHaveBeenCalledTimes(2);expect(top(f).view.status?.message).toBe('Result copied.');
  });
  it.each(['internal','deadline-exceeded','rejection','mismatch','malformed'] as const)('shows %s outcome as unknown and never automatically replays a copy',async mode=>{
    const copy=vi.fn<NonNullable<LauncherApi['copyCalculatorResult']>>(async()=>{if(mode==='rejection')throw new Error('synthetic private detail');if(mode==='mismatch')return {ok:true,value:{outcome:'copied',text:'999'}};if(mode==='malformed')return {ok:true,value:{outcome:'completed',text:'20'}} as never;return {ok:false,error:{code:mode,message:'synthetic private detail',retryable:false}};});const f=setup({copyCalculatorResult:copy});await evaluate(f);await act(f,'calculator:copy');expect(top(f).view.status?.message).toBe('The copy outcome is unknown. Check your clipboard before choosing Copy result again.');expect(copy).toHaveBeenCalledTimes(1);await act(f,'calculator:edit');await evaluate(f);expect(copy).toHaveBeenCalledTimes(1);
  });
  it('bounds a lost copy receipt to five seconds and requires an explicit next copy',async()=>{
    vi.useFakeTimers();const copy=vi.fn<NonNullable<LauncherApi['copyCalculatorResult']>>(()=>new Promise(()=>{}));const f=setup({copyCalculatorResult:copy});await evaluate(f);const pending=act(f,'calculator:copy');await vi.advanceTimersByTimeAsync(5000);await pending;expect(top(f).view.status?.message).toContain('Check your clipboard');expect(copy).toHaveBeenCalledTimes(1);
  });
  it.each(['edit','escape','dispose'] as const)('invalidates pending receipt after %s; back warns copying may have occurred',async mode=>{
    let finish!:(reply:Awaited<ReturnType<NonNullable<LauncherApi['copyCalculatorResult']>>>)=>void;const copy=vi.fn<NonNullable<LauncherApi['copyCalculatorResult']>>(()=>new Promise(resolve=>{finish=resolve;}));const f=setup({copyCalculatorResult:copy});await evaluate(f);const pending=act(f,'calculator:copy');if(mode==='edit')await act(f,'calculator:edit');if(mode==='escape')f.session.pop();if(mode==='dispose')f.flow.dispose();await pending;const before=f.session.getSnapshot();finish({ok:true,value:{outcome:'copied',text:'20'}});await Promise.resolve();expect(f.session.getSnapshot()).toBe(before);expect(copy).toHaveBeenCalledTimes(1);if(mode!=='dispose')expect(top(f).view.status?.message).toBe('Copy may have occurred. Check your clipboard before copying again.');else expect(f.flow.active).toBe(false);
  });
  it('ignores hidden result actions and obsolete evaluation revisions after returning to the form',async()=>{
    const f=setup(),form=top(f);await evaluate(f);const detail=top(f);await f.flow.handle({viewId:form.view.viewId,revision:form.view.revision,actionId:'calculator:evaluate',values:{expression:'9+9'}});f.session.pop();await f.flow.handle({viewId:detail.view.viewId,revision:detail.view.revision,actionId:'calculator:copy'});expect(f.api.copyCalculatorResult).not.toHaveBeenCalled();expect(top(f).view).toMatchObject({fields:[{value:'(2 + 3) * 4'}]});
  });
});
