import { parseContract,workflowEnvelopeSchema } from '@linuxcast/contracts';
import type { WorkflowDefinition,WorkflowEnvelope } from '@linuxcast/contracts';
import type { JsonValue } from '../../../contracts/src/json-value.ts';
import type { GraphNodeRegistry } from '../registry.ts';
import { validateWorkflow,WorkflowGraphError } from '../graph/index.ts';
import { copyPublicJson,freezeDetached } from '../graph/safe-json.ts';
import type { DeepReadonly } from '../graph/safe-json.ts';
export type RunSnapshot=DeepReadonly<{definition:WorkflowDefinition;configuration:JsonValue;grants:string[]}>;
/** A static public-data model. Grant IDs are captured declarations, not newly
 * approved permissions; no executor, context provider or journal is started. */
export function createRunSnapshot(definition:unknown,configuration:unknown,grants:readonly string[],registry:GraphNodeRegistry):RunSnapshot {
  const validated=validateWorkflow(definition,registry),config=copyPublicJson(configuration),ids=copyPublicJson(grants);
  if(!Array.isArray(ids) || ids.length>1000 || ids.some(id=>typeof id!=='string' || !id || id.length>200 || /[\p{Cc}\p{Cs}]/u.test(id) || new TextEncoder().encode(id).length>200) || new Set(ids).size!==ids.length)throw new WorkflowGraphError('invalid-definition');
  const snapshot=copyPublicJson({definition:validated,configuration:config,grants:ids});
  return freezeDetached(snapshot) as unknown as RunSnapshot;
}
export function forkEnvelope(value:unknown):DeepReadonly<WorkflowEnvelope> {
  try{return freezeDetached(copyPublicJson(parseContract(workflowEnvelopeSchema,copyPublicJson(value)))) as DeepReadonly<WorkflowEnvelope>;}
  catch(error){if(error instanceof WorkflowGraphError)throw error;throw new WorkflowGraphError('invalid-definition');}
}
