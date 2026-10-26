import { expect,it,vi } from 'vitest';
import { createRunSnapshot,forkEnvelope } from '../index.ts';
import { EDITOR_NODE_REGISTRY } from '../../registry.ts';
import { WorkflowGraphError } from '../../graph/index.ts';
import { workflow,envelope } from '../../graph/tests/fixtures.ts';
const snapshot=(configuration:unknown={},grants:readonly string[]=[])=>createRunSnapshot(workflow(),configuration,grants,EDITOR_NODE_REGISTRY);
it('captures detached deeply frozen definitions/configuration/grants and ignores later live edits',()=>{
  const definition=workflow(),configuration={public:{list:['first'],enabled:true},nullable:null},grants=['public-grant'],result=createRunSnapshot(definition,configuration,grants,EDITOR_NODE_REGISTRY);
  definition.nodes[1]!.config.operation='upper';definition.editor.positions.keyword!.x=300;configuration.public.list.push('second');grants.push('later-grant');
  expect(result.definition.nodes[1]!.config.operation).toBe('trim');expect(result.definition.editor.positions.keyword!.x).toBe(10);expect(result.configuration).toEqual({public:{list:['first'],enabled:true},nullable:null});expect(result.grants).toEqual(['public-grant']);
  expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.definition.nodes[1]!.config)).toBe(true);expect(Object.isFrozen(result.configuration)).toBe(true);expect(Object.isFrozen(result.grants)).toBe(true);
  expect(()=>Reflect.set(result.definition.nodes[1]!.config,'operation','lower')).not.toThrow();expect(Reflect.set(result.definition.nodes[1]!.config,'operation','lower')).toBe(false);
});
it('forks independent frozen branch envelopes preserving typed args, null, vars and original context',()=>{
  const original=envelope(),first=forkEnvelope(original),second=forkEnvelope(original);
  expect(first).toEqual(original);expect(second).toEqual(original);expect(first).not.toBe(second);expect(first.args[2]).not.toBe(second.args[2]);expect(first.vars.nested).not.toBe(second.vars.nested);
  original.args[0]='changed';original.vars.list.push('third');original.context.callChain.push('other' as never);
  expect(first.args[0]).toBe('Public text');expect(second.vars.list).toEqual(['first','second']);expect(first.context.callChain).toEqual([]);
  expect(Object.isFrozen(first.args[2])).toBe(true);expect(Reflect.set(first.vars.nested as object,'value',7)).toBe(false);expect(second.vars.nested).toEqual({value:3});
});
it('preserves shared source values as detached data without maintaining mutable aliases',()=>{
  const shared={value:'public'},result=snapshot({first:shared,second:shared});
  shared.value='changed';expect(result.configuration).toEqual({first:{value:'public'},second:{value:'public'}});
  const configuration=result.configuration as {first:object;second:object};expect(configuration.first).not.toBe(configuration.second);
});
it.each([new Date(0),()=>1,NaN,Infinity,1n,undefined,new Map(),{kind:'secret-handle',handleId:'public-handle'},JSON.parse('{"nested":{"__proto__":"public"}}')])('rejects unsafe configuration %# with fixed safe errors',configuration=>{
  expect(()=>createRunSnapshot(workflow(),configuration,[],EDITOR_NODE_REGISTRY)).toThrowError(expect.objectContaining({code:'invalid-definition',message:'Invalid workflow definition.'}));
});
it('never invokes configuration/envelope getters or coerces a secret handle',()=>{
  const getter=vi.fn(()=> 'public'),toJSON=vi.fn(()=>({value:'public'}));
  for(const configuration of [Object.defineProperty({},'value',{get:getter,enumerable:true}),{toJSON},Object.create({value:'public'}),{[Symbol('public')]:'value'}])expect(()=>snapshot(configuration)).toThrow(WorkflowGraphError);
  expect(()=>forkEnvelope(Object.defineProperty(envelope(),'args',{get:getter}))).toThrow(WorkflowGraphError);
  expect(getter).not.toHaveBeenCalled();expect(toJSON).not.toHaveBeenCalled();
});
it('bounds public JSON array/depth/UTF8/aggregate size and rejects sparse or extended arrays',()=>{
  expect(snapshot({list:Array(10000).fill(null)}).configuration).toHaveProperty('list');
  const sparse=Array(2),extended=Object.assign(['public'],{extra:'public'}),getter=vi.fn(()=> 'public'),withGetter=Object.defineProperty(['public'],'0',{get:getter});
  let deep:unknown={};for(let n=0;n<65;n++)deep={nested:deep};
  const cyclic:Record<string,unknown>={};cyclic.self=cyclic;
  for(const configuration of [Array(10001).fill(null),sparse,extended,withGetter,deep,cyclic,'é'.repeat(524288)])expect(()=>snapshot(configuration)).toThrow(WorkflowGraphError);
  const large=workflow();large.description='a'.repeat(65536);
  expect(()=>createRunSnapshot(large,{value:'b'.repeat(1000000)},[],EDITOR_NODE_REGISTRY)).toThrow(WorkflowGraphError);
  expect(getter).not.toHaveBeenCalled();
});
it.each([[''],['same','same'],['public\nvalue'],['\ud800'],['é'.repeat(101)],['x'.repeat(201)],Array.from({length:1001},(_,n)=>`grant${n}`)].map(grants=>({grants})))('rejects invalid or excessive grants %#',({grants})=>{
  expect(()=>snapshot({},grants)).toThrowError(expect.objectContaining({code:'invalid-definition'}));
});
it('accepts the approved grant count/UTF8 bound as immutable captured identifiers only',()=>{
  expect(snapshot({},Array.from({length:1000},(_,n)=>`public-grant${n}`)).grants).toHaveLength(1000);
  expect(snapshot({},['é'.repeat(100)]).grants[0]).toBe('é'.repeat(100));
});
it.each([{args:['public'],vars:{},context:{}},{...envelope(),context:{...envelope().context,callChain:Array(17).fill('public')}},{...envelope(),context:{...envelope().context,principal:'builtin'}},{...envelope(),args:[{kind:'secret-handle',handleId:'public'}]}])('rejects invalid envelope/context/secret values %#',value=>{
  expect(()=>forkEnvelope(value)).toThrowError(expect.objectContaining({code:'invalid-definition',message:'Invalid workflow definition.'}));
});
