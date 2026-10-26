import { expect,it,vi } from 'vitest';
import * as z from 'zod';
import { validateWorkflow,WorkflowGraphError } from '../index.ts';
import { createWorkflowDraft,EDITOR_NODE_REGISTRY } from '../../registry.ts';
import type { GraphNodeRegistry } from '../../registry.ts';
import type { WorkflowDefinition } from '@linuxcast/contracts';
import { workflow } from './fixtures.ts';
const validate=(value:unknown)=>validateWorkflow(value,EDITOR_NODE_REGISTRY);
const rejected=(value:unknown,code:string)=>expect(()=>validate(value)).toThrowError(expect.objectContaining({code}));
it('returns a detached validated definition and preserves inert layout without freezing live edits',()=>{
  const original=workflow(),before=structuredClone(original),result=validate(original);
  expect(result).toEqual(before);expect(result).not.toBe(original);expect(result.nodes[1]!.config).not.toBe(original.nodes[1]!.config);
  result.nodes[1]!.config.operation='upper';result.editor.positions.keyword!.x=900;
  expect(original).toEqual(before);expect(Object.isFrozen(result)).toBe(false);
  expect(validate(createWorkflowDraft()).nodes).toEqual([]);
  const disconnected=workflow();disconnected.edges=[];expect(validate(disconnected).edges).toEqual([]);
});
it.each([{schemaVersion:2},{id:'invalid'},{execute:'public'},{defaults:{runTimeoutMs:0,maxConcurrentNodes:1,maxNodeExecutions:1}}])('rejects invalid structural definitions %#',patch=>rejected({...workflow(),...patch},'invalid-definition'));
it.each(['unknown','duplicate','version','config'])('rejects %s node declarations with a fixed error',mode=>{
  const value=workflow();
  if(mode==='unknown')value.nodes[1]!.type='unknown.type';
  if(mode==='duplicate')value.nodes[1]!.id=value.nodes[0]!.id;
  if(mode==='version')(value.nodes[1] as unknown as {typeVersion:number}).typeVersion=2;
  if(mode==='config')value.nodes[1]!.config={operation:'eval',source:{ref:'input#/0'}};
  // An unsupported version fails the authoritative structural schema first.
  rejected(value,mode==='version'?'invalid-definition':'invalid-node');
});
it.each(['dangling','source-port','duplicate-id','duplicate-order','trigger-target'])('rejects %s connections',mode=>{
  const value=workflow(),edge=value.edges[0]!;
  if(mode==='dangling')edge.to.nodeId='missing';
  if(mode==='source-port')edge.from.port='missing';
  if(mode==='duplicate-id')value.edges.push({...edge,order:1});
  if(mode==='duplicate-order')value.edges.push({...edge,id:'other'});
  if(mode==='trigger-target')edge.to.nodeId='keyword';
  rejected(value,'invalid-edge');
});
it('rejects self/ordinary cycles even through disabled or disconnected nodes',()=>{
  for(const disabled of [false,true]){
    const value=workflow();value.nodes[1]!.disabled=disabled;value.edges.push({id:'back',from:{nodeId:'copy',port:'out'},to:{nodeId:'transform',port:'in'},order:0});rejected(value,'cycle');
  }
  const self=workflow();self.edges=[{id:'self',from:{nodeId:'transform',port:'out'},to:{nodeId:'transform',port:'in'},order:0}];rejected(self,'cycle');
});
it('requires exact port kinds while json input accepts every supported source kind',()=>{
  for(const kind of ['text','number','boolean','json'] as const){
    const registry=new Map(EDITOR_NODE_REGISTRY),value=workflow(),base=registry.get('utility.transform')!;
    registry.set('utility.transform',{...base,outputKinds:()=>new Map([['out',kind]])});
    if(kind==='text')expect(validateWorkflow(value,registry)).toEqual(value);
    else expect(()=>validateWorkflow(value,registry)).toThrowError(expect.objectContaining({code:'type-mismatch'}));
    registry.set('output.clipboard',{...registry.get('output.clipboard')!,inputKind:'json'});
    expect(validateWorkflow(value,registry)).toEqual(value);
  }
});
it('rejects inconsistent registry ports and sanitizes callback/schema errors',()=>{
  for(const patch of [{outputKinds:()=>new Map([['other','text' as const]])},{outputPorts:()=>{throw new Error('public callback detail');}},{outputKinds:()=>new Map([['out','invented']])}]){
    const registry=new Map(EDITOR_NODE_REGISTRY);registry.set('utility.transform',{...registry.get('utility.transform')!,...patch} as never);
    expect(()=>validateWorkflow(workflow(),registry)).toThrowError(expect.objectContaining({code:'invalid-node',message:'Invalid workflow node.'}));
  }
});
function callFixture(length:number):{definition:WorkflowDefinition;registry:GraphNodeRegistry}{
  const registration={typeVersion:1 as const,inputKind:'text' as const,config:z.strictObject({references:z.array(z.string())}),outputPorts:()=>new Set(['out','error']),outputKinds:()=>new Map([['out','text' as const],['error','text' as const]]),subgraphReferences:(config:unknown)=>(config as {references:string[]}).references};
  const definition=createWorkflowDraft(),makeNode=(id:string,references:string[])=>({id,type:'public.call',typeVersion:1 as const,config:{references}});
  definition.nodes=[makeNode('root',length?['child0']:[])];definition.subgraphs={};
  for(let n=0;n<length;n++)definition.subgraphs[`child${n}`]={nodes:[makeNode('entry',n+1<length?[`child${n+1}`]:[])],edges:[],entryNodeId:'entry',exits:{return:{nodeId:'entry',port:'out'},error:{nodeId:'entry',port:'error'}}};
  return {definition,registry:new Map([['public.call',registration]])};
}
it('validates explicit entry/exits and the16-level nonrecursive named call bound',()=>{
  const accepted=callFixture(16);expect(validateWorkflow(accepted.definition,accepted.registry).subgraphs).toHaveProperty('child15');
  const tooDeep=callFixture(17);expect(()=>validateWorkflow(tooDeep.definition,tooDeep.registry)).toThrowError(expect.objectContaining({code:'invalid-subgraph'}));
  for(const mode of ['missing','recursive','unreachable-recursive','entry','exit','incoming','disconnected']){
    const {definition,registry}=callFixture(2),child=definition.subgraphs!.child0!;
    if(mode==='missing')definition.nodes[0]!.config.references=['absent'];
    if(mode==='recursive')definition.subgraphs!.child1!.nodes[0]!.config.references=['child0'];
    if(mode==='unreachable-recursive'){definition.nodes[0]!.config.references=[];child.nodes[0]!.config.references=['child0'];}
    if(mode==='entry')child.entryNodeId='missing';
    if(mode==='exit')child.exits.error.port='absent';
    if(mode==='incoming'||mode==='disconnected'){
      child.nodes.push({...child.nodes[0]!,id:'other',config:{references:[]}});
      if(mode==='incoming')child.edges.push({id:'incoming',from:{nodeId:'other',port:'out'},to:{nodeId:'entry',port:'in'},order:0});
    }
    expect(()=>validateWorkflow(definition,registry)).toThrowError(expect.objectContaining({code:'invalid-subgraph'}));
  }
});
it('enforces global node and edge caps across subgraphs without silently dropping records',()=>{
  const nodes=callFixture(1),child=nodes.definition.subgraphs!.child0!,prototype=child.nodes[0]!;
  child.nodes=Array.from({length:1000},(_,n)=>({...prototype,id:`n${n}`}));child.entryNodeId='n0';child.exits={return:{nodeId:'n0',port:'out'},error:{nodeId:'n0',port:'error'}};
  expect(()=>validateWorkflow(nodes.definition,nodes.registry)).toThrowError(expect.objectContaining({code:'invalid-definition'}));
  const edges=callFixture(1);for(const graph of [edges.definition,edges.definition.subgraphs!.child0!]){
    graph.nodes.push({...graph.nodes[0]!,id:'other'});graph.edges=Array.from({length:2001},(_,n)=>({id:`edge${n}`,from:{nodeId:graph.nodes[0]!.id,port:'out'},to:{nodeId:'other',port:'in' as const},order:n}));
  }
  expect(()=>validateWorkflow(edges.definition,edges.registry)).toThrowError(expect.objectContaining({code:'invalid-definition'}));
});
it('guards raw getters, custom prototypes, symbols, hidden/prototype keys and cycles before schemas',()=>{
  const getter=vi.fn(()=>{throw new Error('must not run');});
  for(const value of [Object.defineProperty(workflow(),'nodes',{get:getter}),{...workflow(),editor:Object.create({positions:{},notes:[]})},{...workflow(),extra:Symbol('public')},{...workflow(),extra:JSON.parse('{"constructor":"public"}')},Object.defineProperty(workflow(),'hidden',{value:'public'})])expect(()=>validate(value)).toThrow(WorkflowGraphError);
  const cyclic=workflow() as unknown as Record<string,unknown>;cyclic.extra=cyclic;expect(()=>validate(cyclic)).toThrow(WorkflowGraphError);
  expect(getter).not.toHaveBeenCalled();
});
it('guards registry-normalized defaults and reports no private values in failures',()=>{
  const getter=vi.fn(()=> 'public'),registry=new Map(EDITOR_NODE_REGISTRY);
  registry.set('utility.transform',{...registry.get('utility.transform')!,config:z.unknown().transform(()=>Object.defineProperty({},'value',{get:getter,enumerable:true}))});
  expect(()=>validateWorkflow(workflow(),registry)).toThrowError(expect.objectContaining({code:'invalid-node',message:'Invalid workflow node.'}));expect(getter).not.toHaveBeenCalled();
  expect(()=>validate({...workflow(),name:'public',extra:'public-canary'})).toThrowError('Invalid workflow definition.');
});
