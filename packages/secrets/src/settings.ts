import { credentialPreferenceSchema,parseCredentialPreference } from '../../platform-contracts/src/credential-preferences.ts';
import type { CredentialPreference } from '../../platform-contracts/src/credential-preferences.ts';
import { credentialSettingsSaveSchema,credentialSettingsRemoveSchema,credentialSettingsPolicySchema,credentialSettingsStateSchema } from '../../platform-contracts/src/credential-settings.ts';
import type { CredentialSettingsState,CredentialSettingsActionReply } from '../../platform-contracts/src/credential-settings.ts';
import { secretReferenceSchema } from '../../platform-contracts/src/secrets.ts';
import type { CredentialRuntime } from './runtime.ts';
import type { SecretReference,SecretReferenceRecord,SecretReferences } from './types.ts';

class SnapshotChanged extends Error {}
const OWNER={ownerKind:'provider',ownerId:'openrouter-default'} as const;
const defaults:CredentialPreference={schemaVersion:1,referenceId:null,clearSessionOnLock:false};
export interface CredentialPreferences {
  read():Promise<{revision:number;value:string}|null>;
  write(expectedRevision:number,value:string):Promise<{revision:number;value:string}>;
}
interface Model {preference:CredentialPreference;preferenceRevision:number;records:SecretReferenceRecord[];reference:SecretReference|undefined;state:CredentialSettingsState}
type Outcome=Extract<CredentialSettingsActionReply,{ok:true}>['value']['outcome'];
const result=(outcome:Outcome):CredentialSettingsActionReply=>({ok:true,value:{outcome}});

/** Main-only fixed-target coordinator. No caller-chosen owner, reference, route,
 * secret readback or generic repository operation is part of the renderer wire.
 * Uncertain persistence is retained for explicit review, never silently replayed. */
export class CredentialSettingsService {
  #runtime:CredentialRuntime;
  #preferences:CredentialPreferences;
  #references:SecretReferences;
  #appearance:()=> 'dark'|'light';
  #sessionReference:SecretReference|undefined;
  #sessionReferences=new Map<string,SecretReference>();
  #policyFloor=false;
  #targetEpoch=0;
  #eligibilityEpoch=0;
  #modelGeneration=0;
  #preferenceRevision=0;
  #reading:Promise<Model>|undefined;
  #mutating=false;
  #uses=new Set<AbortController>();
  #revision=0;
  #fingerprint:string|undefined;
  #active:Promise<CredentialSettingsActionReply>|undefined;
  #closed=false;
  #review=false;
  #listeners=new Set<()=>void>();
  #unsubscribe:()=>void;
  constructor(options:{runtime:CredentialRuntime;preferences:CredentialPreferences;references:SecretReferences;appearance:()=> 'dark'|'light'}) {
    this.#runtime=options.runtime;this.#preferences=options.preferences;this.#references=options.references;this.#appearance=options.appearance;
    this.#unsubscribe=this.#runtime.subscribe(()=>{this.#eligibilityEpoch++;this.#advance();});
  }
  #advance():void {
    this.#revision++;this.#fingerprint=undefined;
    for(const listener of [...this.#listeners]){try{listener();}catch{/* A view cannot veto invalidation. */}}
  }
  onChanged(listener:()=>void):()=>void {if(!this.#closed)this.#listeners.add(listener);return()=>{this.#listeners.delete(listener);};}
  async #inventory():Promise<SecretReferenceRecord[]> {
    const records:SecretReferenceRecord[]=[];let cursor:string|undefined;let count=0;
    for(let page=0;page<=50;page++) {
      const value=await this.#references.list({limit:200,...(cursor?{afterId:cursor}:{})});
      if(value.records.length>200)throw new Error('Invalid credential inventory.');
      let previous=cursor;
      for(const raw of value.records) {
        const record=secretReferenceSchema.parse(raw);if(previous&&record.id<=previous)throw new Error('Invalid credential inventory.');
        previous=record.id;if(++count>10_000)throw new Error('Credential inventory unavailable.');
        if(record.ownerKind===OWNER.ownerKind&&record.ownerId===OWNER.ownerId)records.push(record);
      }
      if(value.nextCursor===null)return records;
      if(!value.records.length||value.nextCursor!==previous)throw new Error('Invalid credential inventory.');cursor=value.nextCursor;
    }
    throw new Error('Credential inventory unavailable.');
  }
  async #load():Promise<Model> {
    if(this.#closed)throw new Error('Credential settings closed.');
    const generation=this.#modelGeneration;
    const store=await this.#runtime.store();if(!store)throw new Error('Credential storage unavailable.');
    const row=await this.#preferences.read(),parsed=row?parseCredentialPreference(row.value):{...defaults};
    if(row&&(!Number.isSafeInteger(row.revision)||row.revision<1))throw new Error('Invalid credential preference.');
    const preference=parsed??{...defaults,clearSessionOnLock:true};
    const invalidPreference=!parsed;
    const records=await this.#inventory();if(this.#closed)throw new Error('Credential settings closed.');
    if(generation!==this.#modelGeneration||(row?.revision??0)<this.#preferenceRevision)throw new SnapshotChanged();
    this.#preferenceRevision=row?.revision??0;
    this.#runtime.setClearSessionOnLock(preference.clearSessionOnLock||this.#policyFloor);
    for(const [id,reference] of this.#sessionReferences)if(!store.hasSessionReference(reference,OWNER))this.#sessionReferences.delete(id);
    if(this.#sessionReference&&!store.hasSessionReference(this.#sessionReference,OWNER))this.#sessionReference=undefined;
    const reference=this.#sessionReference??(preference.referenceId?{id:preference.referenceId,mode:'secure-persistent' as const}:undefined);
    const consistent=this.#sessionReference?preference.referenceId===null&&records.length===0&&this.#sessionReferences.size===1:
      preference.referenceId?records.length===1&&records[0]!.id===preference.referenceId&&this.#sessionReferences.size===0:records.length===0&&this.#sessionReferences.size===0;
    const session=this.#runtime.sessionState(),status=store.status();
    const storage:CredentialSettingsState['storage']=status.state==='available'?'available':
      status.reason==='insecure-backend'?'insecure-backend':status.reason==='encryption-failed'?'encryption-failed':status.reason==='storage-failed'?'storage-failed':'unavailable';
    const stored:CredentialSettingsState['stored']=invalidPreference||!consistent||this.#review?'needs-review':reference?.mode??'none';
    const fingerprint=JSON.stringify([row?.revision??0,row?.value,preference,records.map(record=>record.id),reference,session,storage,stored]);
    if(this.#fingerprint!==undefined&&this.#fingerprint!==fingerprint)this.#revision++;
    this.#fingerprint=fingerprint;
    const state=credentialSettingsStateSchema.parse({revision:this.#revision,appearance:this.#appearance(),provider:'openrouter',session,
      storage:session==='observed-unlocked'?storage:'unavailable',sessionOnlyAvailable:session==='observed-unlocked'&&status.state==='unavailable'&&status.sessionOnlyAvailable||session==='observed-unlocked'&&status.state==='available',
      stored,clearSessionOnLock:preference.clearSessionOnLock||this.#policyFloor,busy:!!this.#active});
    return {preference,preferenceRevision:row?.revision??0,records,reference,state};
  }
  #model():Promise<Model> {
    if(this.#reading)return this.#reading;
    // Coalesce external reads. A stale read never applies policy or publishes
    // metadata; one bounded read-only refresh can cross a completed mutation.
    const reading=this.#load().catch(error=>{
      if(error instanceof SnapshotChanged&&!this.#closed)return this.#load();
      throw error;
    });this.#reading=reading;
    const clear=()=>{if(this.#reading===reading)this.#reading=undefined;};
    void reading.then(clear,clear);return reading;
  }
  async state():Promise<CredentialSettingsState> {return (await this.#model()).state;}
  async #write(model:Model,preference:CredentialPreference):Promise<void> {
    const value=JSON.stringify(credentialPreferenceSchema.parse(preference));
    const saved=await this.#preferences.write(model.preferenceRevision,value);
    if(saved.revision!==model.preferenceRevision+1||saved.value!==value)throw new Error('Credential preference unconfirmed.');
    this.#preferenceRevision=Math.max(this.#preferenceRevision,saved.revision);
  }
  #run(perform:()=>Promise<CredentialSettingsActionReply>):Promise<CredentialSettingsActionReply> {
    if(this.#closed)return Promise.resolve(result('unavailable'));
    if(this.#active)return Promise.resolve({ok:false,error:{code:'conflict'}});
    this.#modelGeneration++;
    const operation=Promise.resolve().then(perform).catch(()=>{this.#review=true;return result('unknown');}).finally(()=>{this.#mutating=false;this.#modelGeneration++;});
    this.#active=operation;
    for(const listener of [...this.#listeners]){try{listener();}catch{/* Views remain independent. */}}
    void operation.then(()=>{if(this.#active===operation)this.#active=undefined;this.#advance();});return operation;
  }
  save(input:unknown,confirm:(replacing:boolean,signal:AbortSignal)=>Promise<boolean>,signal:AbortSignal):Promise<CredentialSettingsActionReply> {
    const parsed=credentialSettingsSaveSchema.safeParse(input);if(!parsed.success)return Promise.resolve({ok:false,error:{code:'invalid-request'}});
    // Consume the wire string only within this operation. No diagnostic/error or
    // returned state contains it; JavaScript copies are not zeroization-proof.
    let value=parsed.data.value;
    return this.#run(async()=>{
      try {
        let model=await this.#load();const epoch=model.state.revision;
        if(epoch!==parsed.data.expectedRevision)return result('stale');
        if(model.state.stored==='needs-review'||model.state.session!=='observed-unlocked'||parsed.data.persistence==='persistent'&&model.state.storage!=='available')return result('unavailable');
        if(signal.aborted||!await confirm(!!model.reference,signal)||signal.aborted||this.#closed)return result('cancelled');
        model=await this.#load();if(model.state.revision!==epoch)return result('stale');
        const store=await this.#runtime.store();if(!store||signal.aborted||this.#closed)return result('cancelled');
        const eligibilityEpoch=this.#eligibilityEpoch;this.#invalidateUses();
        const saved=await store.store(OWNER,value,parsed.data.persistence);value='';
        if(saved.outcome!=='stored')return result('unavailable');
        // Keep newly created references owned even when close/session change
        // arrives during IO. An uncertain pointer write requires explicit review.
        if(signal.aborted||this.#closed||eligibilityEpoch!==this.#eligibilityEpoch||this.#runtime.sessionState()!=='observed-unlocked') {
          const erased=await store.delete(saved.reference,OWNER);if(erased.outcome!=='deleted')this.#review=true;return result(this.#review?'unknown':'cancelled');
        }
        if(saved.reference.mode==='session-only')this.#sessionReferences.set(saved.reference.id,saved.reference);
        await this.#write(model,{...model.preference,referenceId:saved.reference.mode==='secure-persistent'?saved.reference.id:null});
        const old=model.reference;
        if(old){const erased=await store.delete(old,OWNER);if(erased.outcome!=='deleted'){this.#review=true;return result('unknown');}this.#sessionReferences.delete(old.id);}
        this.#sessionReference=saved.reference.mode==='session-only'?saved.reference:undefined;
        const exists=saved.reference.mode!=='session-only'||store.hasSessionReference(saved.reference,OWNER);
        if(signal.aborted||this.#closed||eligibilityEpoch!==this.#eligibilityEpoch||this.#runtime.sessionState()!=='observed-unlocked'||!exists) {
          // A confirmed null pointer and a cleared memory value have no pending
          // credential effect. Retained/persistent results need explicit review.
          if(!exists){this.#sessionReference=undefined;this.#sessionReferences.delete(saved.reference.id);return result('cancelled');}
          this.#review=true;return result('unknown');
        }
        return result('saved');
      }finally{value='';}
    });
  }
  remove(input:unknown,confirm:(signal:AbortSignal)=>Promise<boolean>,signal:AbortSignal):Promise<CredentialSettingsActionReply> {
    const parsed=credentialSettingsRemoveSchema.safeParse(input);if(!parsed.success)return Promise.resolve({ok:false,error:{code:'invalid-request'}});
    return this.#run(async()=>{
      let model=await this.#load();const epoch=model.state.revision;if(epoch!==parsed.data.expectedRevision)return result('stale');
      if(signal.aborted||!await confirm(signal)||signal.aborted||this.#closed)return result('cancelled');
      model=await this.#load();if(model.state.revision!==epoch)return result('stale');
      const store=await this.#runtime.store();if(!store||signal.aborted||this.#closed)return result('cancelled');
      this.#invalidateUses();
      await this.#write(model,{...model.preference,referenceId:null});
      const references:SecretReference[]=model.records.map(record=>({id:record.id,mode:'secure-persistent'}));
      references.push(...this.#sessionReferences.values());
      for(const reference of references)if((await store.delete(reference,OWNER)).outcome!=='deleted'){this.#review=true;return result('unknown');}
      this.#sessionReference=undefined;this.#sessionReferences.clear();this.#review=false;return result('removed');
    });
  }
  setPolicy(input:unknown,signal:AbortSignal):Promise<CredentialSettingsActionReply> {
    const parsed=credentialSettingsPolicySchema.safeParse(input);if(!parsed.success)return Promise.resolve({ok:false,error:{code:'invalid-request'}});
    return this.#run(async()=>{
      const model=await this.#load();if(model.state.revision!==parsed.data.expectedRevision)return result('stale');
      if(this.#closed||signal.aborted)return result('cancelled');
      if(this.#runtime.sessionState()!=='observed-unlocked')return result('unavailable');
      const eligibilityEpoch=this.#eligibilityEpoch;
      const weakening=!parsed.data.clearSessionOnLock&&(model.preference.clearSessionOnLock||this.#policyFloor);
      // Enabling the conservative policy takes effect before the asynchronous
      // write; a failed acknowledgement must never temporarily retain secrets.
      if(parsed.data.clearSessionOnLock||weakening){this.#policyFloor=true;this.#runtime.setClearSessionOnLock(true);}
      await this.#write(model,{...model.preference,clearSessionOnLock:parsed.data.clearSessionOnLock});
      if(signal.aborted||this.#closed||eligibilityEpoch!==this.#eligibilityEpoch||this.#runtime.sessionState()!=='observed-unlocked') {
        if(weakening) {
          // Restore the stronger value once, only after an exact acknowledgement
          // of our own write. This is protective CAS compensation, never a replay
          // of the requested weakening; uncertainty retains the in-memory floor.
          await this.#write({...model,preferenceRevision:model.preferenceRevision+1},{...model.preference,clearSessionOnLock:true});
          this.#policyFloor=false;this.#runtime.setClearSessionOnLock(true);return result('stale');
        }
        this.#review=true;return result('unknown');
      }
      this.#policyFloor=false;this.#runtime.setClearSessionOnLock(parsed.data.clearSessionOnLock);return result('policy-updated');
    });
  }
  recheck():Promise<CredentialSettingsActionReply> {
    return this.#run(async()=>{
      const observation=await this.#runtime.retrySession();if(observation.outcome!=='observing')return result('unavailable');
      const store=await this.#runtime.store();store?.recheckKeyring();return result('refreshing');
    });
  }
  #invalidateUses():void {this.#mutating=true;this.#targetEpoch++;for(const use of [...this.#uses])use.abort();}
  /** Main-only provider seam. A real effect adapter must call fresh immediately
   * before every dispatch, including after any intervening asynchronous work. */
  async use(consumer:(secret:string,signal:AbortSignal,fresh:()=>boolean)=>Promise<void>):Promise<{outcome:'used'|'unavailable'}> {
    if(this.#closed||this.#active)return {outcome:'unavailable'};
    const epoch=this.#targetEpoch,model=await this.#model();
    if(!model.reference||model.state.stored==='needs-review'||model.state.session!=='observed-unlocked'||this.#closed||this.#active||epoch!==this.#targetEpoch)return {outcome:'unavailable'};
    const store=await this.#runtime.store();if(!store||this.#closed||this.#active||epoch!==this.#targetEpoch)return {outcome:'unavailable'};
    const owned=new AbortController();this.#uses.add(owned);
    const fresh=()=>!this.#closed&&!this.#mutating&&!owned.signal.aborted&&epoch===this.#targetEpoch&&this.#runtime.sessionState()==='observed-unlocked';
    try {
      const used=await store.use(model.reference,OWNER,async(value,lease)=>{const signal=AbortSignal.any([lease,owned.signal]);if(fresh()&&!signal.aborted)await consumer(value,signal,()=>fresh()&&!signal.aborted);});
      return {outcome:used.outcome==='used'&&fresh()?'used':'unavailable'};
    }catch{return {outcome:'unavailable'};}finally{this.#uses.delete(owned);}
  }
  async close():Promise<void> {this.#closed=true;this.#invalidateUses();this.#unsubscribe();this.#listeners.clear();await Promise.allSettled([this.#reading,this.#active]);}
}
