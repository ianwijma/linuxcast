import * as z from 'zod';
import type { SecretSessionAccess,SecretSessionState } from './session.ts';
import { constants } from 'node:fs';
import { mkdir, open, unlink, link, readdir } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { secretReferenceSchema } from '../../platform-contracts/src/secrets.ts';
import { SafeStorageAdapter, unavailable } from './safe-storage.ts';
import type { ElectronSafeStorage, SecretReferences, SecretOwner, SecretReference, SecretReferenceRecord, SecretStatus, StoreResult } from './types.ts';
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;
const encryptedEnvelopeSchema=z.strictObject({schemaVersion:z.literal(1),referenceId:z.uuid(),ownerKind:z.enum(['provider','account','browser-pairing','backup']),ownerId:z.string().max(200),valueBase64:z.string().max(88_000)});
type UseResult={outcome:'used'}|{outcome:'unavailable';status:Extract<SecretStatus,{state:'unavailable'}>};
type DeleteResult={outcome:'deleted'}|{outcome:'unavailable';status:Extract<SecretStatus,{state:'unavailable'}>};
const ownerKinds=new Set(['provider','account','browser-pairing','backup']);
function validOwner(value:SecretOwner):boolean {return ownerKinds.has(value.ownerKind) && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(value.ownerId);}
function sameOwner(a:SecretOwner,b:SecretOwner):boolean {return a.ownerKind===b.ownerKind && a.ownerId===b.ownerId;}
function validRecord(value:SecretReferenceRecord,id:string,owner:SecretOwner):boolean {return secretReferenceSchema.safeParse(value).success && value.id===id && uuid.test(id) && sameOwner(value,owner);}
/** Main-only service. Consumers receive credentials only within a trusted use
 * callback, whose return value is deliberately discarded. No get/decrypt wire
 * endpoint or renderer-facing plaintext response exists. */
export class SecretStore {
  #adapter:SafeStorageAdapter;
  #references:SecretReferences;
  #directory:FileHandle;
  #session=new Map<string,{owner:SecretOwner;value:Buffer}>();
  #busy=new Set<string>();
  #leases=new Map<string,Set<AbortController>>();
  #locked=false;
  #sessionAccess:SecretSessionAccess;
  #sessionDenied=true;
  #sessionSubscriptionFailed=false;
  #clearSessionOnLock:boolean;
  #unsubscribeSession:()=>void=()=>{};
  #closed=false;
  #epoch=0;
  #storageReady=true;
  #reconciling=false;
  #sessionBytes=0;
  #writes=new Set<Promise<StoreResult>>();
  #uses=new Set<Promise<UseResult>>();
  #deletions=new Set<Promise<DeleteResult>>();
  #reconciliation:Promise<{outcome:'reconciled';removed:number}|{outcome:'unavailable'}>|undefined;
  #closePromise:Promise<void>|undefined;
  private constructor(directory:FileHandle,adapter:SafeStorageAdapter,references:SecretReferences,session:SecretSessionAccess,clearSessionOnLock:boolean) {
    this.#directory=directory;this.#adapter=adapter;this.#references=references;this.#sessionAccess=session;this.#clearSessionOnLock=clearSessionOnLock;
    try {
      const unsubscribe=session.subscribe(state=>this.#observeSession(state));
      if(typeof unsubscribe!=='function')throw new Error();
      this.#unsubscribeSession=unsubscribe;this.#readSession();
    }catch{this.#sessionSubscriptionFailed=true;this.#observeSession('unavailable');}
  }
  #observeSession(state:SecretSessionState):void {
    const denied=this.#closed||this.#sessionSubscriptionFailed||state!=='observed-unlocked';
    if(denied&&this.#clearSessionOnLock)this.#clearSession();
    if(denied===this.#sessionDenied)return;
    this.#sessionDenied=denied;this.#epoch++;
    for(const leases of this.#leases.values())for(const lease of leases)lease.abort();
  }
  #readSession():SecretSessionState {
    let state:SecretSessionState='unavailable';
    if(!this.#closed&&!this.#sessionSubscriptionFailed){try{state=this.#sessionAccess.state();}catch{/* Unknown observation denies. */}}
    this.#observeSession(state);return state;
  }
  #blocked():Extract<SecretStatus,{state:'unavailable'}>|undefined {
    if(this.#closed)return {...unavailable('unavailable'),sessionOnlyAvailable:false};
    const state=this.#readSession();
    if(this.#locked||state==='locked')return unavailable('locked');
    if(this.#sessionDenied)return unavailable('session-unavailable');
    return undefined;
  }
  #failure(reason:Extract<SecretStatus,{state:'unavailable'}>['reason']):Extract<SecretStatus,{state:'unavailable'}> {
    // Every operation result reflects current session denial, including errors
    // that settle after IO; an old generic status cannot offer session entry.
    return this.#blocked()??unavailable(reason);
  }
  static async open(options:{dataDirectory:string;safeStorage:ElectronSafeStorage;references:SecretReferences;session:SecretSessionAccess;clearSessionOnLock?:boolean}):Promise<SecretStore> {
    if(!options.session||typeof options.session.state!=='function'||typeof options.session.subscribe!=='function')throw new Error('Session observation unavailable.');
    if(!isAbsolute(options.dataDirectory))throw new Error('Invalid private data directory.');
    const directory=join(options.dataDirectory,'secrets');
    await mkdir(directory,{mode:0o700}).catch((error:unknown)=>{if(!(error && typeof error==='object' && 'code' in error && error.code==='EEXIST'))throw new Error('Secret storage unavailable.');});
    const handle=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    const stat=await handle.stat();
    if(!stat.isDirectory() || stat.uid!==process.getuid?.() || (stat.mode&0o777)!==0o700) {await handle.close();throw new Error('Secret directory is not private.');}
    const store=new SecretStore(handle,new SafeStorageAdapter(options.safeStorage),options.references,options.session,options.clearSessionOnLock===true);
    await store.reconcile();return store;
  }
  status():SecretStatus {return this.#blocked()??(!this.#storageReady?unavailable('storage-failed'):this.#adapter.status());}
  recheckKeyring():SecretStatus {return this.#blocked()??(!this.#storageReady?unavailable('storage-failed'):this.#adapter.recheck());}
  reconcile():Promise<{outcome:'reconciled';removed:number}|{outcome:'unavailable'}> {
    if(this.#reconciliation)return this.#reconciliation;
    const operation=this.#reconcile();this.#reconciliation=operation;
    void operation.finally(()=>{if(this.#reconciliation===operation)this.#reconciliation=undefined;});
    return operation;
  }
  async #reconcile():Promise<{outcome:'reconciled';removed:number}|{outcome:'unavailable'}> {
    if(this.#closed || this.#reconciling || this.#writes.size || this.#busy.size)return {outcome:'unavailable'};
    this.#reconciling=true;
    try {
      const ids=new Set<string>();let cursor:string|undefined;
      for(let page=0;page<=50;page++) {
        const result=await this.#references.list({limit:200,...(cursor?{afterId:cursor}:{})});
        if(result.records.length>200)throw new Error();
        let previous=cursor;
        for(const input of result.records) {const record=secretReferenceSchema.parse(input);if(ids.has(record.id) || (previous && record.id<=previous))throw new Error();ids.add(record.id);previous=record.id;}
        if(ids.size>10_000)throw new Error();
        if(result.nextCursor===null)break;
        if(!result.records.length || result.nextCursor!==previous || page===50)throw new Error();
        cursor=result.nextCursor;
      }
      const names=await readdir(`/proc/self/fd/${this.#directory.fd}`);if(names.length>20_000)throw new Error();
      const blob=/^([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\.blob$/u;
      const temporary=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\.blob\.[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\.tmp$/u;
      let removed=0;for(const name of names) {const match=blob.exec(name);if((match && !ids.has(match[1]!)) || temporary.test(name)){await unlink(`/proc/self/fd/${this.#directory.fd}/${name}`);removed++;}}
      if(removed)await this.#directory.sync();this.#storageReady=true;return {outcome:'reconciled',removed};
    } catch {this.#storageReady=false;return {outcome:'unavailable'};}
    finally {this.#reconciling=false;}
  }
  #path(id:string):string {if(!uuid.test(id))throw new Error('Invalid secret reference.');return `/proc/self/fd/${this.#directory.fd}/${id}.blob`;}
  #fresh(epoch:number):boolean {return !this.#blocked() && epoch===this.#epoch;}
  store(owner:SecretOwner,value:string,persistence:'persistent'|'session-only'):Promise<StoreResult> {
    const operation=this.#store({...owner},value,persistence);this.#writes.add(operation);
    void operation.then(()=>{this.#writes.delete(operation);},()=>{this.#writes.delete(operation);});return operation;
  }
  async #store(owner:SecretOwner,value:string,persistence:'persistent'|'session-only'):Promise<StoreResult> {
    if(!validOwner(owner) || typeof value!=='string' || !value || Buffer.byteLength(value)>64*1024 || Buffer.from(value,'utf8').toString('utf8')!==value || !['persistent','session-only'].includes(persistence))return {outcome:'unavailable',status:this.#failure('invalid-request')};
    const blocked=this.#blocked();if(blocked)return {outcome:'unavailable',status:blocked};
    const id=randomUUID();const epoch=this.#epoch;
    if(persistence==='session-only') {
      if(this.#session.size>=256 || this.#sessionBytes+Buffer.byteLength(value)>1024*1024)return {outcome:'unavailable',status:this.#failure('storage-failed')};
      const bytes=Buffer.from(value);this.#session.set(id,{owner:{...owner},value:bytes});this.#sessionBytes+=bytes.length;
      return {outcome:'stored',reference:{id,mode:'session-only'}};
    }
    const status=this.status();if(this.#reconciling)return {outcome:'unavailable',status:this.#failure('storage-failed')};if(status.state!=='available')return {outcome:'unavailable',status};
    let ciphertext:Buffer;
    try {ciphertext=this.#adapter.encrypt(JSON.stringify({schemaVersion:1,referenceId:id,...owner,valueBase64:Buffer.from(value,'utf8').toString('base64')}));}catch{return {outcome:'unavailable',status:this.#failure('encryption-failed')};}
    const filename=this.#path(id);const staging=`${filename}.${randomUUID()}.tmp`;
    let published=false;
    try {
      const file=await open(staging,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      try {await file.writeFile(ciphertext);await file.sync();}finally{await file.close();}
      if(!this.#fresh(epoch) || this.status().state!=='available')throw new Error();
      await link(staging,filename);published=true;await unlink(staging);await this.#directory.sync();
      const now=new Date().toISOString();const record:SecretReferenceRecord={id,...owner,createdAt:now,updatedAt:now};
      const stored=await this.#references.put(record);
      if(!validRecord(stored,id,owner) || !this.#fresh(epoch))throw new Error();
      return {outcome:'stored',reference:{id,mode:'secure-persistent'}};
    } catch {
      // A failed/uncertain metadata write is never reported as secure success.
      // Delete the encrypted blob first; a retained opaque reference then fails
      // closed instead of leaving an orphan usable credential.
      if(published)await unlink(filename).catch(()=>{});
      await unlink(staging).catch(()=>{});
      await this.#references.delete(id).catch(()=>{});
      return {outcome:'unavailable',status:this.#failure(this.#fresh(epoch)?'storage-failed':'cancelled')};
    } finally {ciphertext.fill(0);}
  }
  use(reference:SecretReference,owner:SecretOwner,consumer:(secret:string,signal:AbortSignal)=>Promise<void>):Promise<UseResult> {
    const operation=this.#use(reference,owner,consumer);this.#uses.add(operation);
    void operation.then(()=>{this.#uses.delete(operation);},()=>{this.#uses.delete(operation);});return operation;
  }
  async #use(reference:SecretReference,owner:SecretOwner,consumer:(secret:string,signal:AbortSignal)=>Promise<void>):Promise<UseResult> {
    if(!uuid.test(reference.id) || !validOwner(owner) || !['session-only','secure-persistent'].includes(reference.mode))return {outcome:'unavailable',status:this.#failure('invalid-request')};
    const blocked=this.#blocked();if(blocked)return {outcome:'unavailable',status:blocked};
    if(this.#busy.has(reference.id))return {outcome:'unavailable',status:this.#failure('unavailable')};
    reference={...reference};owner={...owner};
    if([...this.#leases.values()].reduce((sum,leases)=>sum+leases.size,0)>=128)return {outcome:'unavailable',status:this.#failure('unavailable')};
    const epoch=this.#epoch;const controller=new AbortController();const leases=this.#leases.get(reference.id)??new Set();leases.add(controller);this.#leases.set(reference.id,leases);
    try {
      let value:string;
      if(reference.mode==='session-only') {
        const session=this.#session.get(reference.id);if(!session || !sameOwner(session.owner,owner))return {outcome:'unavailable',status:this.#failure('not-found')};
        value=session.value.toString('utf8');
      } else {
        const status=this.status();if(status.state!=='available')return {outcome:'unavailable',status};
        const record=await this.#references.get(reference.id);
        if(!record || !validRecord(record,reference.id,owner))return {outcome:'unavailable',status:this.#failure('not-found')};
        if(!this.#fresh(epoch) || controller.signal.aborted || this.#busy.has(reference.id))return {outcome:'unavailable',status:this.#failure('cancelled')};
        const file=await open(this.#path(reference.id),constants.O_RDONLY|constants.O_NOFOLLOW);
        let ciphertext:Buffer;
        try {
          const stat=await file.stat();if(!stat.isFile() || stat.uid!==process.getuid?.() || (stat.mode&0o777)!==0o600 || stat.size>128*1024 || stat.nlink!==1)throw new Error();
          ciphertext=await file.readFile();
        }finally{await file.close();}
        try {
          if(!this.#fresh(epoch) || controller.signal.aborted || this.#busy.has(reference.id))return {outcome:'unavailable',status:this.#failure('cancelled')};
          const envelope=encryptedEnvelopeSchema.parse(JSON.parse(this.#adapter.decrypt(ciphertext)));
          if(envelope.referenceId!==reference.id || !sameOwner(envelope,owner))throw new Error();
          const decoded=Buffer.from(envelope.valueBase64,'base64');
          try {if(!decoded.length || decoded.length>64*1024 || decoded.toString('base64')!==envelope.valueBase64)throw new Error();value=decoded.toString('utf8');if(Buffer.from(value,'utf8').compare(decoded)!==0)throw new Error();}
          finally {decoded.fill(0);}
        }finally{ciphertext.fill(0);}
      }
      if(!this.#fresh(epoch) || controller.signal.aborted || this.#busy.has(reference.id))return {outcome:'unavailable',status:this.#failure('cancelled')};
      await consumer(value,controller.signal);
      return this.#fresh(epoch) && !controller.signal.aborted?{outcome:'used'}:{outcome:'unavailable',status:this.#failure('cancelled')};
    } catch {return {outcome:'unavailable',status:this.#failure('unavailable')};}
    finally {leases.delete(controller);if(!leases.size)this.#leases.delete(reference.id);}
  }
  delete(reference:SecretReference,owner:SecretOwner):Promise<DeleteResult> {
    const operation=this.#delete(reference,owner);this.#deletions.add(operation);
    void operation.then(()=>{this.#deletions.delete(operation);},()=>{this.#deletions.delete(operation);});return operation;
  }
  async #delete(reference:SecretReference,owner:SecretOwner):Promise<DeleteResult> {
    if(this.#closed || !uuid.test(reference.id) || !validOwner(owner) || this.#busy.has(reference.id))return {outcome:'unavailable',status:this.#failure('invalid-request')};
    reference={...reference};owner={...owner};
    this.#busy.add(reference.id);
    try {
      const session=this.#session.get(reference.id);
      if(reference.mode==='session-only') {
        if(!session || !sameOwner(session.owner,owner))return {outcome:'unavailable',status:this.#failure('not-found')};
        for(const lease of this.#leases.get(reference.id)??[])lease.abort();
        this.#sessionBytes-=session.value.length;session.value.fill(0);this.#session.delete(reference.id);return {outcome:'deleted'};
      }
      if(reference.mode!=='secure-persistent')return {outcome:'unavailable',status:this.#failure('invalid-request')};
      const record=await this.#references.get(reference.id);if(!record || !validRecord(record,reference.id,owner))return {outcome:'unavailable',status:this.#failure('not-found')};
      for(const lease of this.#leases.get(reference.id)??[])lease.abort();
      await unlink(this.#path(reference.id)).catch((error:unknown)=>{if(!(error && typeof error==='object' && 'code' in error && error.code==='ENOENT'))throw new Error();});
      await this.#directory.sync();await this.#references.delete(reference.id);return {outcome:'deleted'};
    } catch {return {outcome:'unavailable',status:this.#failure('storage-failed')};}
    finally {this.#busy.delete(reference.id);}
  }
  /** Main-only policy and metadata; never a renderer-facing secret read. */
  setClearSessionOnLock(value:boolean):void {
    this.#clearSessionOnLock=value;this.#readSession();
  }
  hasSessionReference(reference:SecretReference,owner:SecretOwner):boolean {
    this.#readSession();const entry=this.#session.get(reference.id);
    return !this.#closed&&reference.mode==='session-only'&&!!entry&&sameOwner(entry.owner,owner);
  }
  setLocked(locked:boolean,options:{clearSession?:boolean}={}):void {
    if(locked && options.clearSession)this.#clearSession();
    if(this.#locked===locked)return;this.#locked=locked;this.#epoch++;
    for(const leases of this.#leases.values())for(const lease of leases)lease.abort();
  }
  #clearSession():void {for(const entry of this.#session.values())entry.value.fill(0);this.#session.clear();this.#sessionBytes=0;}
  close():Promise<void> {
    if(this.#closePromise)return this.#closePromise;
    this.#closed=true;this.#epoch++;
    // Install the coalesced promise before abort callbacks can reenter close.
    this.#closePromise=Promise.resolve().then(async()=>{
      await Promise.allSettled([...this.#writes,...this.#uses,...this.#deletions,...(this.#reconciliation?[this.#reconciliation]:[])]);
      await this.#directory.close();
    });
    try{this.#unsubscribeSession();}catch{/* Local teardown still proceeds. */}
    this.#clearSession();for(const leases of this.#leases.values())for(const lease of leases)lease.abort();
    return this.#closePromise;
  }
}
