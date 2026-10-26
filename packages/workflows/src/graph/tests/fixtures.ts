import { createWorkflowDraft } from '../../registry.ts';
import type { WorkflowDefinition } from '@linuxcast/contracts';
export function workflow():WorkflowDefinition {
  return {...createWorkflowDraft(),name:'Public text workflow',nodes:[
    {id:'keyword',type:'input.keyword',typeVersion:1,config:{keyword:'public',argument:'required',trimQuery:false}},
    {id:'transform',type:'utility.transform',typeVersion:1,config:{operation:'trim',source:{ref:'input#/0'}}},
    {id:'copy',type:'output.clipboard',typeVersion:1,config:{text:{ref:'input#/0'},paste:false,history:'exclude'}},
  ],edges:[
    {id:'first',from:{nodeId:'keyword',port:'out'},to:{nodeId:'transform',port:'in'},order:0},
    {id:'second',from:{nodeId:'transform',port:'out'},to:{nodeId:'copy',port:'in'},order:0},
  ],editor:{positions:{keyword:{x:10,y:-20},transform:{x:100,y:0}},notes:[{id:'note',text:'Public note',x:5,y:4}],viewport:{x:10,y:20,zoom:1.5}}};
}
export function envelope(){return {args:['Public text',null,{kind:'file',grantId:'public-grant',entryId:'public-entry',displayName:'Public fixture'}],vars:{list:['first','second'],nested:{value:3}},context:{runId:'public-run',workflowId:'org.linuxcast.public',workflowVersion:'1.0.0',triggerNodeId:'keyword',invocationTime:'2026-10-27T00:00:00Z',locale:'en-AU',timezone:'Australia/Sydney',callChain:[]}};}
