import { parseContract,parseWorkflowDefinition,workflowDefinitionSchema } from '@linuxcast/contracts';
import type { WorkflowDefinition,WorkflowNodeContract } from '@linuxcast/contracts';
import type { GraphNodeRegistry,WorkflowPortKind } from '../registry.ts';
import { WorkflowGraphError } from './errors.ts';
import { copyPublicJson } from './safe-json.ts';
export { WorkflowGraphError } from './errors.ts';
export type { WorkflowGraphErrorCode } from './errors.ts';
type Graph=Pick<WorkflowDefinition,'nodes'|'edges'>;
type Subgraph=NonNullable<WorkflowDefinition['subgraphs']>[string];
const kinds=new Set<WorkflowPortKind>(['text','number','boolean','json']);
/** Static validation only. Registry declarations never execute a workflow or
 * grant authority. Graph layout remains inert and the caller is never mutated. */
export function validateWorkflow(value:unknown,registry:GraphNodeRegistry):WorkflowDefinition {
  try{
    const input=parseContract(workflowDefinitionSchema,copyPublicJson(value));
    const children=Object.entries(input.subgraphs??{}),graphs:[string|null,Graph][]=[[null,input],...children];
    if(graphs.reduce((total,[,graph])=>total+graph.nodes.length,0)>1000 || graphs.reduce((total,[,graph])=>total+graph.edges.length,0)>4000 || new Set(input.settings.map(setting=>setting.id)).size!==input.settings.length || new Set(input.permissions.map(permission=>permission.id)).size!==input.permissions.length)throw new WorkflowGraphError('invalid-definition');
    const guarded=new Map<string,WorkflowNodeContract>(),calls=new Map<string|null,Set<string>>();
    for(const [name,graph] of graphs){
      const nodes=new Map<string,{input:WorkflowPortKind|null;outputs:ReadonlyMap<string,WorkflowPortKind>}>(),targets=new Map<string,string[]>(),indegree=new Map<string,number>(),references=new Set<string>();
      for(const node of graph.nodes){
        try{
          const registration=registry.get(node.type);
          if(!registration || registration.typeVersion!==node.typeVersion || nodes.has(node.id) || (registration.inputKind!==null && !kinds.has(registration.inputKind)))throw new WorkflowGraphError('invalid-node');
          const config=parseContract(registration.config,node.config),safeConfig=copyPublicJson(config,'invalid-node');
          if(safeConfig===null || typeof safeConfig!=='object' || Array.isArray(safeConfig))throw new WorkflowGraphError('invalid-node');
          const ports=registration.outputPorts(safeConfig),outputs=registration.outputKinds(safeConfig);
          if(ports.size>10000 || outputs.size!==ports.size)throw new WorkflowGraphError('invalid-node');
          let count=0;
          for(const port of ports){if(++count>10000 || typeof port!=='string' || !port || !kinds.has(outputs.get(port)!))throw new WorkflowGraphError('invalid-node');}
          nodes.set(node.id,{input:registration.inputKind,outputs});targets.set(node.id,[]);indegree.set(node.id,0);
          if(registration.subgraphReferences){
            const refs=copyPublicJson(registration.subgraphReferences(safeConfig),'invalid-subgraph');
            if(!Array.isArray(refs))throw new WorkflowGraphError('invalid-subgraph');
            for(const reference of refs){if(typeof reference!=='string' || !Object.hasOwn(input.subgraphs??{},reference))throw new WorkflowGraphError('invalid-subgraph');references.add(reference);}
          }
          guarded.set(node.type,{typeVersion:registration.typeVersion,config:registration.config.transform(result=>copyPublicJson(result,'invalid-node')),outputPorts:registration.outputPorts});
        }catch(error){if(error instanceof WorkflowGraphError)throw error;throw new WorkflowGraphError('invalid-node');}
      }
      const edgeIds=new Set<string>(),orders=new Set<string>();
      for(const edge of graph.edges){
        const source=nodes.get(edge.from.nodeId),target=nodes.get(edge.to.nodeId),order=JSON.stringify([edge.from.nodeId,edge.from.port,edge.order]);
        if(edgeIds.has(edge.id) || orders.has(order) || !source?.outputs.has(edge.from.port) || !target || target.input===null)throw new WorkflowGraphError('invalid-edge');
        if(target.input!=='json' && source.outputs.get(edge.from.port)!==target.input)throw new WorkflowGraphError('type-mismatch');
        edgeIds.add(edge.id);orders.add(order);targets.get(edge.from.nodeId)!.push(edge.to.nodeId);indegree.set(edge.to.nodeId,indegree.get(edge.to.nodeId)!+1);
      }
      const entryIndegree=new Map(indegree),queue=[...indegree].filter(([,degree])=>degree===0).map(([id])=>id);let visited=0;
      for(let index=0;index<queue.length;index++){
        const id=queue[index]!;visited++;
        for(const target of targets.get(id)!){const degree=indegree.get(target)!-1;indegree.set(target,degree);if(degree===0)queue.push(target);}
      }
      if(visited!==nodes.size)throw new WorkflowGraphError('cycle');
      if(name!==null){
        const child=graph as Subgraph;
        if(!nodes.has(child.entryNodeId) || entryIndegree.get(child.entryNodeId)!==0 || Object.values(child.exits).some(exit=>!nodes.get(exit.nodeId)?.outputs.has(exit.port)))throw new WorkflowGraphError('invalid-subgraph');
        const reachable=new Set([child.entryNodeId]),pending=[child.entryNodeId];
        for(let index=0;index<pending.length;index++)for(const target of targets.get(pending[index]!)!){if(!reachable.has(target)){reachable.add(target);pending.push(target);}}
        if(reachable.size!==nodes.size)throw new WorkflowGraphError('invalid-subgraph');
      }
      calls.set(name,references);
    }
    // Longest call path, including disconnected subgraphs: a raw recursion is
    // invalid even when the editor currently has no path to that subgraph.
    const degree=new Map<string|null,number>([...calls.keys()].map(name=>[name,0])),depth=new Map<string|null,number>([...calls.keys()].map(name=>[name,name===null?0:1]));
    for(const refs of calls.values())for(const ref of refs)degree.set(ref,degree.get(ref)!+1);
    const queue=[...degree].filter(([,count])=>count===0).map(([name])=>name);
    for(let index=0;index<queue.length;index++){
      const name=queue[index]!;
      for(const reference of calls.get(name)!){
        const next=Math.max(depth.get(reference)!,depth.get(name)!+1);if(next>16)throw new WorkflowGraphError('invalid-subgraph');depth.set(reference,next);
        const count=degree.get(reference)!-1;degree.set(reference,count);if(count===0)queue.push(reference);
      }
    }
    if(queue.length!==calls.size)throw new WorkflowGraphError('invalid-subgraph');
    // The existing contract remains authoritative for complete structural and
    // registry/config normalization. A second descriptor copy detaches defaults.
    return copyPublicJson(parseWorkflowDefinition(input,guarded)) as unknown as WorkflowDefinition;
  }catch(error){if(error instanceof WorkflowGraphError)throw error;throw new WorkflowGraphError('invalid-definition');}
}
