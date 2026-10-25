import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createStorageClient } from '../../storage/src/client.ts';
/** Actual single-writer child process, real SQLite and IPC; no repository mock. */
export async function openFixtureOwner(dataDirectory:string) {
  const child=fork(new URL('../../storage/src/utility.ts',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc']});
  const ready=new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>{cleanup();child.kill('SIGKILL');reject(new Error('Owner fixture timeout.'));},10_000);
    const cleanup=()=>{clearTimeout(timer);child.off('message',listener);child.off('exit',exited);};
    const listener=(value:unknown)=>{if(value && typeof value==='object' && 'kind' in value && value.kind==='ready'){cleanup();resolve();}};
    const exited=()=>{cleanup();reject(new Error('Owner fixture exited.'));};child.on('message',listener);child.once('exit',exited);
  });
  child.send({kind:'initialize',dataDirectory,applicationBuild:'synthetic-f2-02-controls'});await ready;
  const client=createStorageClient({send:value=>{child.send(value as object);},onMessage:listener=>{child.on('message',listener);return()=>child.off('message',listener);}});
  return {client,child,close:async()=>{client.disconnect();if(child.exitCode!==null || child.signalCode!==null)return;const exited=once(child,'exit');const timer=setTimeout(()=>child.kill('SIGKILL'),2000);child.send({kind:'shutdown'});await exited;clearTimeout(timer);}};
}
export async function killFixtureOwner(child:ChildProcess) {if(child.exitCode!==null || child.signalCode!==null)return;const exited=once(child,'exit');child.kill('SIGKILL');await exited;}
