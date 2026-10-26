import { afterEach,expect,it,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { WorkflowDefinition,WorkflowRunStep } from '@linuxcast/contracts';
import { workflow } from '../../graph/tests/fixtures.ts';
import { runTextWorkflow,validateTextWorkflow,WorkflowRunError } from '../index.ts';
import type { TextWorkflowOptions } from '../index.ts';
const definition=()=>({...workflow(),permissions:[{id:'clipboard.write',reason:'Public explicit copy'}]});
function harness(value:WorkflowDefinition=definition(),patch:Partial<TextWorkflowOptions>={}){
  const steps:WorkflowRunStep[]=[],values:string[]=[],copyText=vi.fn(async()=>{}),abort=new AbortController();
  const options:TextWorkflowOptions={definition:value,triggerNodeId:'keyword',input:'  Public text  ',context:{runId:randomUUID(),workflowId:value.id,workflowVersion:value.version,triggerNodeId:'keyword',invocationTime:'2026-10-27T00:00:00Z',locale:'en-AU',timezone:'UTC',callChain:[]},signal:abort.signal,createActivationId:randomUUID,onStep:async step=>{steps.push(structuredClone(step));},onValue:text=>{values.push(text);},copyText,...patch};
  return {options,steps,values,copyText,abort};
}
function deferred<T=void>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function until(check:()=>boolean){for(let n=0;n<100&&!check();n++)await Promise.resolve();expect(check()).toBe(true);}
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('executes actual fixed text nodes, awaits metadata and emits only metadata to the journal',async()=>{
  const h=harness(),result=await runTextWorkflow(h.options);
  expect(result).toEqual({state:'succeeded',output:'Public text',effectOutcome:'completed',requiresReview:false});
  expect(h.values).toEqual(['  Public text  ','Public text','Public text']);
  expect(h.steps.map(step=>[step.nodeId,step.state])).toEqual([['keyword','running'],['keyword','succeeded'],['transform','running'],['transform','succeeded'],['copy','running'],['copy','succeeded']]);
  expect(h.steps.every(step=>Object.keys(step).every(key=>['activationId','nodeId','nodeType','state','durationMs'].includes(key)))).toBe(true);
  expect(h.copyText).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({nodeId:'copy',text:'Public text'}),expect.any(AbortSignal));
  expect(new Set(h.steps.map(step=>step.activationId)).size).toBe(3);
});
it('does no work before running metadata acknowledgement and does not publish success before terminal acknowledgement',async()=>{
  const start=deferred(),finish=deferred(),h=harness();
  h.options.onStep=async step=>{h.steps.push(step);if(step.nodeId==='keyword')await(step.state==='running'?start.promise:finish.promise);};
  const pending=runTextWorkflow(h.options);await until(()=>h.steps.length===1);expect(h.values).toEqual([]);expect(h.copyText).not.toHaveBeenCalled();
  start.resolve();await until(()=>h.steps.length===2);expect(h.values).toEqual([]);finish.resolve();expect((await pending).state).toBe('succeeded');
});
it('runs FIFO fanout in edge order with independent branch values and no implicit join',async()=>{
  const value=definition();value.nodes.push({...value.nodes[1]!,id:'upper',config:{operation:'upper',source:{ref:'input#/0'}}});
  value.nodes[1]!.config.operation='lower';value.edges=[{id:'upper-edge',from:{nodeId:'keyword',port:'out'},to:{nodeId:'upper',port:'in'},order:7},{id:'lower-edge',from:{nodeId:'keyword',port:'out'},to:{nodeId:'transform',port:'in'},order:1},...value.edges.slice(1),{id:'upper-copy',from:{nodeId:'upper',port:'out'},to:{nodeId:'copy',port:'in'},order:0}];
  const h=harness(value,{input:'MiXeD'});expect((await runTextWorkflow(h.options)).state).toBe('succeeded');
  expect(h.steps.filter(step=>step.state==='running').map(step=>step.nodeId)).toEqual(['keyword','transform','upper','copy','copy']);
  expect(h.copyText.mock.calls.map(call=>(call as unknown as [{text:string}])[0].text)).toEqual(['mixed','MIXED']);
});
it('captures definitions/context/callbacks before awaits so live edits cannot change effects',async()=>{
  const value=definition(),gate=deferred(),h=harness(value);h.options.onStep=async()=>gate.promise;
  const pending=runTextWorkflow(h.options);await Promise.resolve();value.nodes[1]!.config.operation='upper';h.options.input='REPLACED';h.options.context.locale='tr';h.options.copyText=async()=>{throw new Error('must not replace closure');};gate.resolve();
  expect(await pending).toMatchObject({state:'succeeded',output:'Public text'});expect(h.copyText).toHaveBeenCalledTimes(1);
});
it('disabled nodes block their entire stream and do not request clipboard permission',async()=>{
  const value=definition();value.nodes[1]!.disabled=true;value.permissions=[];
  const h=harness(value);expect(await runTextWorkflow(h.options)).toMatchObject({state:'succeeded',effectOutcome:'not-dispatched'});expect(h.copyText).not.toHaveBeenCalled();expect(h.steps.map(step=>step.nodeId)).toEqual(['keyword','keyword']);
});
it.each([['upper','tr','istanbul','İSTANBUL'],['lower','tr','I İ','ı i'],['title','en',"hÉLLO don't STOP 東京","Héllo Don't Stop 東京"],['normalize','en','Cafe\u0301','Café'],['trim','en',' \npublic\t ','public']])('performs Unicode %s with explicit locale %s',async(operation,language,input,expected)=>{
  const value=definition();value.nodes[1]!.config={operation,locale:language,source:{ref:'input#/0'}};const h=harness(value,{input});
  expect(await runTextWorkflow(h.options)).toMatchObject({state:'succeeded',output:expected});expect(h.copyText).toHaveBeenCalledWith(expect.objectContaining({text:expected}),expect.any(AbortSignal));
});
it.each([['required',true,'  ','failed'],['required',false,'  ','succeeded'],['optional',false,'','succeeded'],['none',false,'argument','failed'],['none',true,'  ','succeeded']])('honours Keyword %s argument/trim=%s',async(argument,trimQuery,input,state)=>{
  const value=definition();value.nodes[0]!.config={keyword:'public',argument,trimQuery};const h=harness(value,{input});expect((await runTextWorkflow(h.options)).state).toBe(state);
  if(state==='failed')expect(h.copyText).not.toHaveBeenCalled();
});
it.each(['binding','settings','subgraph','route','modifier','locale','undeclared','entry','node-id'])('rejects %s configuration before any effect',async mode=>{
  const value=definition();
  if(mode==='binding')value.nodes[1]!.config.source={literal:'public'};
  if(mode==='settings')value.settings=[{id:'public',title:'Public',required:false,kind:'text'}];
  if(mode==='subgraph')value.subgraphs={public:{nodes:[],edges:[],entryNodeId:'none',exits:{return:{nodeId:'none',port:'out'},error:{nodeId:'none',port:'out'}}}};
  if(mode==='route')value.nodes[1]!.onError='route';
  if(mode==='modifier')value.edges[0]!.activation={modifiers:['Ctrl']};
  if(mode==='locale')value.nodes[1]!.config.locale='not_a_locale';
  if(mode==='undeclared')value.permissions=[];
  if(mode==='entry')value.nodes[0]!.disabled=true;
  if(mode==='node-id')value.nodes[2]!.id='x'.repeat(201);
  const h=harness(value);expect((await runTextWorkflow(h.options)).state).toBe('failed');expect(h.copyText).not.toHaveBeenCalled();expect(h.steps).toEqual([]);
});
it('validates graph cycles/getters before effects and detaches the validation result',()=>{
  const value=definition(),parsed=validateTextWorkflow(value,'keyword');parsed.name='Changed';expect(value.name).not.toBe('Changed');
  value.edges.push({id:'cycle',from:{nodeId:'copy',port:'out'},to:{nodeId:'transform',port:'in'},order:0});expect(()=>validateTextWorkflow(value,'keyword')).toThrowError(expect.objectContaining({code:'invalid-workflow'}));
  const getter=vi.fn(()=>definition().nodes);expect(()=>validateTextWorkflow(Object.defineProperty(definition(),'nodes',{get:getter}),'keyword')).toThrow(WorkflowRunError);expect(getter).not.toHaveBeenCalled();
});
it('enforces activation/queued fanout bounds without calling Copy beyond the cap',async()=>{
  const value=definition();value.defaults.maxNodeExecutions=2;const h=harness(value);
  expect(await runTextWorkflow(h.options)).toMatchObject({state:'failed',errorCode:'limit-exceeded',effectOutcome:'not-dispatched'});expect(h.copyText).not.toHaveBeenCalled();expect(h.steps.filter(step=>step.state==='running')).toHaveLength(2);
});
it('validates16KiB input and64KiB output without truncating or replacing malformed Unicode',async()=>{
  for(const input of ['x'.repeat(16385),'é'.repeat(8193),'\ud800']){
    const h=harness(undefined,{input});expect(await runTextWorkflow(h.options)).toMatchObject({errorCode:'invalid-input',effectOutcome:'not-dispatched'});expect(h.steps).toEqual([]);
  }
  const value=definition();value.nodes[1]!.config.operation='upper';const h=harness(value,{input:'public'});
  vi.spyOn(String.prototype,'toLocaleUpperCase').mockReturnValue('x'.repeat(65537));expect(await runTextWorkflow(h.options)).toMatchObject({errorCode:'limit-exceeded',effectOutcome:'not-dispatched'});expect(h.copyText).not.toHaveBeenCalled();
});
it.each([['permission-denied','not-dispatched'],['unavailable','not-dispatched'],['unknown-outcome','unknown']])('preserves fixed host %s certainty and never retries',async(code,effectOutcome)=>{
  const h=harness(undefined,{copyText:vi.fn(async()=>{throw new WorkflowRunError(code as 'permission-denied',effectOutcome as 'unknown');})});
  expect(await runTextWorkflow(h.options)).toMatchObject({state:'failed',errorCode:code,effectOutcome,requiresReview:effectOutcome==='unknown'});expect(h.options.copyText).toHaveBeenCalledTimes(1);expect(h.steps.at(-1)?.state).toBe('failed');
});
it('treats an unclassified copy loss as unknown and omits raw error/cause/value from errors',async()=>{
  const h=harness(undefined,{copyText:vi.fn(async()=>{throw new Error('public fixture raw detail');})});
  expect(await runTextWorkflow(h.options)).toMatchObject({state:'failed',errorCode:'unknown-outcome',effectOutcome:'unknown',requiresReview:true});
  const error=new WorkflowRunError('unknown-outcome','unknown');expect(error.message).toBe('Workflow effect outcome is unknown.');expect(error).not.toHaveProperty('cause');expect(h.options.copyText).toHaveBeenCalledTimes(1);
});
it('reports pre-effect journal loss without Copy and post-effect terminal loss as unknown',async()=>{
  for(const state of ['running','succeeded'] as const){
    const h=harness();h.options.onStep=async step=>{h.steps.push(step);if(step.nodeId==='copy'&&step.state===state)throw new Error('public journal fixture');};
    expect(await runTextWorkflow(h.options)).toMatchObject({state:'failed',errorCode:'storage-unavailable',effectOutcome:state==='running'?'not-dispatched':'unknown',requiresReview:state!=='running'});expect(h.copyText).toHaveBeenCalledTimes(state==='running'?0:1);
  }
});
it('cancels before admission without steps or effects',async()=>{
  const h=harness();h.abort.abort();expect(await runTextWorkflow(h.options)).toEqual({state:'cancelled',errorCode:'cancelled',effectOutcome:'not-dispatched',requiresReview:false});expect(h.steps).toEqual([]);expect(h.copyText).not.toHaveBeenCalled();
});
it('aborts an approval/copy wait, retains uncertainty, consumes late settlement and never publishes late success',async()=>{
  const gate=deferred(),copyText=vi.fn(async(_request:unknown,signal:AbortSignal)=>{expect(signal.aborted).toBe(false);await gate.promise;}),h=harness(undefined,{copyText});
  const pending=runTextWorkflow(h.options);await until(()=>copyText.mock.calls.length===1);const before=h.values.slice();h.abort.abort();
  const result=await pending;expect(result).toMatchObject({state:'cancelled',errorCode:'cancelled',effectOutcome:'unknown',requiresReview:true});expect(copyText.mock.calls[0]![1].aborted).toBe(true);const count=h.steps.length;gate.resolve();await Promise.resolve();await Promise.resolve();expect(h.values).toEqual(before);expect(h.steps).toHaveLength(count);expect(result.effectOutcome).toBe('unknown');expect(copyText).toHaveBeenCalledTimes(1);
});
it.each(['run','node'])('enforces %s deadline including an uncooperative copy wait',async mode=>{
  vi.useFakeTimers();const gate=deferred(),h=harness(undefined,{copyText:vi.fn(async()=>gate.promise)}),value=h.options.definition as WorkflowDefinition;
  if(mode==='run')value.defaults.runTimeoutMs=30;else value.nodes[2]!.timeoutMs=30;
  const pending=runTextWorkflow(h.options);await until(()=>vi.mocked(h.options.copyText).mock.calls.length===1);await vi.advanceTimersByTimeAsync(31);
  expect(await pending).toMatchObject({state:'failed',errorCode:'deadline-exceeded',effectOutcome:'unknown',requiresReview:true});gate.resolve();
});
it('bounds cancellation terminal cleanup and reports journal uncertainty without replay',async()=>{
  vi.useFakeTimers();const gate=deferred(),h=harness(undefined,{copyText:vi.fn(async()=>gate.promise)});
  h.options.onStep=async step=>{h.steps.push(step);if(step.state==='cancelled')await new Promise<void>(()=>{});};
  const pending=runTextWorkflow(h.options);await until(()=>vi.mocked(h.options.copyText).mock.calls.length===1);h.abort.abort();await vi.advanceTimersByTimeAsync(1001);
  expect(await pending).toMatchObject({state:'failed',errorCode:'storage-unavailable',effectOutcome:'unknown',requiresReview:true});expect(h.options.copyText).toHaveBeenCalledTimes(1);gate.resolve();
});
