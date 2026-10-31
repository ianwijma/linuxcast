import { createHash } from 'node:crypto';
import { PermissionBroker } from './broker.ts';
import type { Operation } from './broker.ts';
import type { CapabilityBroker } from '../../platform-contracts/src/capabilities.ts';
import { permissionDecisionRecordSchema, principalKeyMaterial } from '../../platform-contracts/src/permissions.ts';
import type { DecisionRecord } from './types.ts';
import { createDecisionStore } from './storage.ts';
import type { PermissionRepositoryClient } from './storage.ts';

export type PermissionAdministrationRepository = PermissionRepositoryClient & {
  request(method:'permissions.inventory',params:{afterId?:string;limit:number}):Promise<{records:DecisionRecord[];nextCursor:string|null}>;
  request(method:'permissions.revokeSelected',params:{record:DecisionRecord}):Promise<'removed'|'changed'|'missing'>;
}
export type RevokeResult = 'removed'|'changed'|'missing'|'unavailable';

/** One main-owned registry for every production broker. UI supplies only an
 * opaque selection to its window owner; it never obtains this controller. */
export class PermissionRegistry {
  #repository: PermissionAdministrationRepository;
  #store: ReturnType<typeof createDecisionStore>;
  #brokers = new Map<PermissionBroker, ()=>void>();
  #blocked = new Set<string>();
  #quarantined = new Set<string>();
  #pending = new Set<Promise<RevokeResult>>();
  #closed = false;
  constructor(repository:PermissionAdministrationRepository) {
    this.#repository=repository;this.#store=createDecisionStore(repository);
  }
  createBroker(options:{capabilities:CapabilityBroker;operations:readonly Operation[];onRevoked?:()=>void}):PermissionBroker {
    if(this.#closed)throw new Error('Permissions unavailable.');
    const broker=new PermissionBroker({...options,store:this.#store,
      canAdmit:key=>!this.#closed&&!this.#blocked.has(key)&&!this.#quarantined.has(key)});
    this.#brokers.set(broker,options.onRevoked??(()=>{}));return broker;
  }
  async release(broker:PermissionBroker):Promise<void> {
    broker.close();await broker.waitForMutations();this.#brokers.delete(broker);
  }
  inventory(afterId?:string) {
    if(this.#closed)throw new Error('Permissions unavailable.');
    return this.#repository.request('permissions.inventory',{limit:50,...(afterId?{afterId}:{})});
  }
  /** Cancels before awaiting storage and waits for all old grant writes and
   * their cleanup. Newly created brokers also consult the shared admission gate. */
  revoke(value:DecisionRecord):Promise<RevokeResult> {
    const record=permissionDecisionRecordSchema.parse(value);
    const key=createHash('sha256').update(principalKeyMaterial(record.principal)).digest('hex');
    if(this.#closed||this.#blocked.has(key)||this.#quarantined.has(key))return Promise.resolve('unavailable');
    this.#blocked.add(key);
    const brokers=[...this.#brokers];
    for(const [broker,notify] of brokers)if(broker.invalidateDecision(record)) {
      try { notify(); } catch { /* Cancellation cannot be vetoed by a UI owner. */ }
    }
    const pending=(async():Promise<RevokeResult>=>{
      try {
        await Promise.all(brokers.map(([broker])=>broker.waitForMutations(record.principal)));
        const result=await this.#repository.request('permissions.revokeSelected',{record});
        if(!['removed','changed','missing'].includes(result))throw new Error();
        return result;
      } catch {this.#quarantined.add(key);return 'unavailable';}
      finally {this.#blocked.delete(key);}
    })();
    this.#pending.add(pending);void pending.finally(()=>{this.#pending.delete(pending);});return pending;
  }
  async close():Promise<void> {
    this.#closed=true;
    await Promise.all([...this.#brokers.keys()].map(broker=>this.release(broker)));
    await Promise.all(this.#pending);
  }
}
