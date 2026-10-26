import { utilityProcess } from 'electron';
import { join } from 'node:path';
import type { WorkflowWorkerStart } from '../../../../packages/contracts/src/workflow-run.ts';
export interface WorkflowChild {send(value:unknown):void;kill():void;exited:Promise<void>}
export type WorkflowFork=(start:WorkflowWorkerStart,onMessage:(value:unknown)=>void,onExit:()=>void)=>WorkflowChild;
/** One fixed packaged entry per run. No renderer-supplied argv/path/environment. */
export function workflowFork(resourcesDirectory:string):WorkflowFork{
  return (start,onMessage,onExit)=>{
    const child=utilityProcess.fork(join(resourcesDirectory,'workflow.cjs'),[],{serviceName:'Linuxcast workflow',stdio:'ignore',env:{}});
    let ended=false;let resolve!:()=>void;const exited=new Promise<void>(done=>{resolve=done;});
    child.on('message',onMessage);
    child.once('exit',()=>{ended=true;resolve();onExit();});
    child.once('spawn',()=>{if(!ended)child.postMessage(start);});
    return {send(value){if(!ended)child.postMessage(value);},kill(){if(!ended)child.kill();},exited};
  };
}
