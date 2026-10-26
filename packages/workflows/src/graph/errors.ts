export type WorkflowGraphErrorCode='invalid-definition'|'invalid-node'|'invalid-edge'|'cycle'|'type-mismatch'|'invalid-subgraph';
export class WorkflowGraphError extends Error {
  readonly code:WorkflowGraphErrorCode;
  constructor(code:WorkflowGraphErrorCode){
    super(code==='invalid-definition'?'Invalid workflow definition.':code==='invalid-node'?'Invalid workflow node.':code==='invalid-edge'?'Invalid workflow connection.':code==='cycle'?'Workflow connections contain a cycle.':code==='type-mismatch'?'Workflow connection types do not match.':'Invalid workflow subgraph.');
    this.name='WorkflowGraphError';this.code=code;
  }
}
