import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import { isAbsolute } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { SecretSessionStream } from './session-stream.ts';
import type { SecretSessionState } from './session.ts';

type SessionChild=ChildProcessByStdio<Writable,Readable,null>;
/** Trusted main owns the packaged absolute executable path. No caller identity,
 * inherited environment, shell, renderer IPC or automatic restart is accepted. */
export class SecretSessionClient {
  #stream=new SecretSessionStream();
  #child:SessionChild|undefined;
  #listeners=new Set<(state:SecretSessionState)=>void>();
  #lastNotified:SecretSessionState='unavailable';
  #notifying:SecretSessionState|undefined;
  #closed=false;
  #closedPromise:Promise<void>;
  #resolveClosed:()=>void=()=>{};
  #stopPromise:Promise<void>|undefined;
  #expiry:ReturnType<typeof setInterval>|undefined;
  private constructor(helperPath:string){
    this.#closedPromise=new Promise(resolve=>{this.#resolveClosed=resolve;});
    try {
      const child=spawn(helperPath,['credential-session'],{env:{LANG:'C.UTF-8'},stdio:['pipe','pipe','ignore'],shell:false,windowsHide:true});
      this.#child=child;
      child.stdout.on('data',(chunk:Buffer)=>{
        this.#publish(this.#stream.ingest(chunk));
        if(this.#stream.failed)this.#fail();
      });
      child.stdout.once('end',()=>this.#fail());
      child.stdout.on('error',()=>this.#fail());
      child.stdin.on('error',()=>this.#fail());
      child.once('error',()=>this.#fail());
      child.once('close',()=>{
        this.#closed=true;
        if(this.#expiry)clearInterval(this.#expiry);
        this.#stream.invalidate();this.#publish(['unavailable']);this.#resolveClosed();
      });
      this.#expiry=setInterval(()=>{this.state();},100);this.#expiry.unref();
    }catch{
      this.#closed=true;this.#stream.invalidate();this.#resolveClosed();
    }
  }
  static start(helperPath:string):SecretSessionClient {
    if(typeof helperPath!=='string'||!isAbsolute(helperPath)||helperPath.includes('\0')||helperPath.length>4096)throw new Error('Invalid session helper path.');
    return new SecretSessionClient(helperPath);
  }
  state():SecretSessionState {
    const state=this.#stream.state();
    if(this.#stream.failed){this.#fail();return 'unavailable';}
    return this.#notifying??state;
  }
  invalidate():void {this.#fail();}
  canUse():boolean {return this.state()==='observed-unlocked';}
  subscribe(listener:(state:SecretSessionState)=>void):()=>void {
    this.#listeners.add(listener);
    try{listener(this.state());}catch{/* A listener cannot veto other consumers. */}
    return ()=>{this.#listeners.delete(listener);};
  }
  #publish(states:SecretSessionState[]):void {
    for(let state of states){
      if(this.#stream.failed)state='unavailable';
      if(state===this.#lastNotified)continue;
      this.#lastNotified=state;
      const previous=this.#notifying;this.#notifying=state;
      try{
        for(const listener of [...this.#listeners]){
          try{listener(this.#stream.failed?'unavailable':state);}catch{/* Trusted consumers fail independently. */}
        }
      }finally{this.#notifying=previous;}
    }
  }
  #fail():void {
    this.#stream.invalidate();this.#publish(['unavailable']);
    // The lifecycle owner can await stop() and receives any unverified reap.
    // Event handlers never publish raw child errors or reject unhandled promises.
    void this.stop().catch(()=>{});
  }
  /** Quarantines synchronously. Waits for owned-child close (exit plus stdio),
   * escalates only that retained child, and rejects if closure is unverified. */
  stop():Promise<void> {
    this.#stream.invalidate();this.#publish(['unavailable']);
    if(this.#expiry)clearInterval(this.#expiry);
    if(this.#stopPromise)return this.#stopPromise;
    if(this.#closed)return this.#stopPromise=Promise.resolve();
    const child=this.#child;
    this.#stopPromise=new Promise<void>((resolve,reject)=>{
      const signal=(name:NodeJS.Signals)=>{if(!this.#closed){try{child?.kill(name);}catch{/* Deadline remains authoritative. */}}};
      const term=setTimeout(()=>signal('SIGTERM'),100);
      const kill=setTimeout(()=>signal('SIGKILL'),250);
      const limit=setTimeout(()=>{
        clearTimeout(term);clearTimeout(kill);
        reject(new Error('Session helper shutdown unverified.'));
      },1500);
      void this.#closedPromise.then(()=>{clearTimeout(term);clearTimeout(kill);clearTimeout(limit);resolve();});
      try{child?.stdin.end();}catch{/* Escalation still runs. */}
    });
    return this.#stopPromise;
  }
}
