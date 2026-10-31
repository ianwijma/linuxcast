import { SecretStore } from './store.ts';
import { SecretSessionClient } from './session-client.ts';
import type { ElectronSafeStorage,SecretReferences } from './types.ts';
import type { SecretSessionAccess,SecretSessionState } from './session.ts';

export interface OwnedSecretSession extends SecretSessionAccess {invalidate():void;stop():Promise<void>}
export interface CredentialRuntimeOptions {
  helperPath:string;
  dataDirectory:string;
  safeStorage:ElectronSafeStorage;
  references:SecretReferences;
  isStorageReady():boolean;
  clearSessionOnLock?:boolean;
  /** Trusted composition seam, never renderer/package configuration. */
  createSession?:()=>OwnedSecretSession;
}
export type SessionRestart={outcome:'observing'|'unavailable'};

/** Main-owned lifetime for one store and replaceable observed-session generations.
 * Recovery retains the store's explicit session-only values unless lock policy
 * clears them; no old helper event can grant the replacement generation access. */
export class CredentialRuntime {
  #options:CredentialRuntimeOptions;
  #client:OwnedSecretSession|undefined;
  #removeClient:()=>void=()=>{};
  #retiring=new Set<OwnedSecretSession>();
  #stops=new Map<OwnedSecretSession,Promise<void>>();
  #store:SecretStore|null=null;
  #opening:Promise<SecretStore|null>|undefined;
  #restart:Promise<SessionRestart>|undefined;
  #closing:Promise<void>|undefined;
  #closed=false;
  #suspended=false;
  #transition=false;
  #epoch=0;
  #listeners=new Set<(state:SecretSessionState)=>void>();
  #last:SecretSessionState='unavailable';
  #access:SecretSessionAccess={state:()=>this.sessionState(),subscribe:listener=>this.subscribe(listener)};
  constructor(options:CredentialRuntimeOptions){this.#options=options;}
  sessionState():SecretSessionState {
    if(this.#closed||this.#suspended||this.#transition)return 'unavailable';
    try{return this.#options.isStorageReady()?this.#client?.state()??'unavailable':'unavailable';}
    catch{return 'unavailable';}
  }
  subscribe(listener:(state:SecretSessionState)=>void):()=>void {
    if(!this.#closed)this.#listeners.add(listener);
    try{listener(this.sessionState());}catch{/* A consumer cannot veto denial. */}
    return ()=>{this.#listeners.delete(listener);};
  }
  #emit():void {
    const state=this.sessionState();if(state===this.#last)return;this.#last=state;
    for(const listener of [...this.#listeners]){
      try{listener(this.sessionState());}catch{/* Trusted consumers fail independently. */}
    }
  }
  /** Main calls this on storage-owner readiness/loss, including unexpected exit. */
  notifyStorageState():void {this.#emit();}
  #retire():void {
    const client=this.#client;this.#client=undefined;
    try{this.#removeClient();}catch{/* Explicit generation checks also reject late events. */}
    this.#removeClient=()=>{};
    if(client){this.#retiring.add(client);try{client.invalidate();}catch{/* stop still owns the resource. */}}
  }
  async #stopRetired():Promise<void> {
    await Promise.all([...this.#retiring].map(async client=>{
      let stop=this.#stops.get(client);
      if(!stop){stop=Promise.resolve().then(()=>client.stop());this.#stops.set(client,stop);}
      await stop;this.#retiring.delete(client);this.#stops.delete(client);
    }));
  }
  retrySession():Promise<SessionRestart> {
    if(this.#closed||this.#suspended)return Promise.resolve({outcome:'unavailable'});
    if(this.#restart)return this.#restart;
    const epoch=++this.#epoch;this.#transition=true;
    const operation=Promise.resolve().then(async():Promise<SessionRestart>=>{
      try{
        await this.#stopRetired();
        if(this.#closed||this.#suspended||epoch!==this.#epoch)return {outcome:'unavailable'};
        const client=this.#options.createSession?this.#options.createSession():SecretSessionClient.start(this.#options.helperPath);
        if(!client||typeof client.state!=='function'||typeof client.subscribe!=='function'||typeof client.invalidate!=='function'||typeof client.stop!=='function')throw new Error('Session observer unavailable.');
        // Even a synchronously reentrant factory cannot leave an unowned child.
        if(this.#closed||this.#suspended||epoch!==this.#epoch){
          this.#retiring.add(client);client.invalidate();await this.#stopRetired();return {outcome:'unavailable'};
        }
        this.#client=client;
        this.#removeClient=client.subscribe(()=>{if(this.#client===client)this.#emit();});
        this.#transition=false;this.#emit();return {outcome:'observing'};
      }catch{
        this.#transition=false;this.#retire();
        try{await this.#stopRetired();}catch{/* Retain unverified ownership for close. */}
        this.#emit();return {outcome:'unavailable'};
      }
    });
    this.#restart=operation;this.#retire();this.#emit();
    void operation.then(()=>{if(this.#restart===operation)this.#restart=undefined;});
    return operation;
  }
  suspend():void {
    if(this.#closed)return;
    this.#epoch++;this.#suspended=true;this.#transition=true;this.#retire();this.#emit();
  }
  resume():Promise<SessionRestart> {
    if(this.#closed)return Promise.resolve({outcome:'unavailable'});
    this.#suspended=false;this.#transition=true;
    // An in-flight older attempt must drain before a new generation starts.
    return this.#restart?this.#restart.then(()=>this.retrySession()):this.retrySession();
  }
  store():Promise<SecretStore|null> {
    if(this.#closed||this.#suspended)return Promise.resolve(null);
    try{if(!this.#options.isStorageReady()){this.#emit();return Promise.resolve(null);}}
    catch{this.#emit();return Promise.resolve(null);}
    if(this.#store)return Promise.resolve(this.#store);
    if(this.#opening)return this.#opening;
    const operation=Promise.resolve().then(async()=>{
      try{
        if(!this.#client)await this.retrySession();
        if(this.#closed||this.#suspended)return null;
        const store=await SecretStore.open({dataDirectory:this.#options.dataDirectory,safeStorage:this.#options.safeStorage,
          references:this.#options.references,session:this.#access,clearSessionOnLock:this.#options.clearSessionOnLock===true});
        // Retain ownership even if close arrived while the directory opened.
        this.#store=store;return this.#closed?null:store;
      }catch{return null;}
    });
    this.#opening=operation;
    void operation.then(()=>{if(this.#opening===operation)this.#opening=undefined;});
    return operation;
  }
  close():Promise<void> {
    if(this.#closing)return this.#closing;
    this.#closed=true;this.#suspended=true;this.#transition=true;this.#epoch++;
    const opening=this.#opening,restarting=this.#restart;
    // Install before abort callbacks can reenter the owner's shutdown.
    this.#closing=Promise.resolve().then(async()=>{
      // Termination and clearing start independently of slow initialization.
      const early=Promise.allSettled([this.#stopRetired(),this.#store?.close()]);
      await Promise.allSettled([opening,restarting]);
      const results=[...await early,...await Promise.allSettled([this.#stopRetired(),this.#store?.close()])];
      this.#listeners.clear();
      if(results.some(result=>result.status==='rejected'))throw new Error('Credential shutdown unverified.');
    });
    this.#retire();this.#emit();return this.#closing;
  }
}
