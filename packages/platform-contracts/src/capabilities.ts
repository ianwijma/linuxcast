import { capabilityStatusSchema, INITIAL_CAPABILITY_IDS, parseContract } from '../../contracts/src/index.ts';
import type { CapabilityStatus } from '../../contracts/src/index.ts';

/** Main owns reports from individually probed adapters. Session names and environment
 * variables never establish availability. All invalidations advance one generation. */
export class CapabilityBroker {
  #generation = 0;
  #states = new Map<string, CapabilityStatus>();
  #listeners = new Set<() => void>();
  constructor(ids: readonly string[] = INITIAL_CAPABILITY_IDS) {
    if (ids.length > 256 || new Set(ids).size !== ids.length || ids.some(id => !/^[a-z][a-zA-Z0-9.-]{0,99}$/u.test(id))) throw new Error('Invalid capability registration.');
    for (const id of ids) this.#states.set(id, this.#unavailable(id));
  }
  get generation(): number { return this.#generation; }
  #unavailable(id: string): CapabilityStatus {
    return {id,state:'temporarily-unavailable',backend:null,reasonCode:'not-probed',remediationAction:'refresh-capability',generation:this.#generation};
  }
  get(id: string): CapabilityStatus { return structuredClone(this.#states.get(id) ?? this.#unavailable(id)); }
  snapshot(): CapabilityStatus[] { return [...this.#states.keys()].map(id => this.get(id)); }
  report(value: Omit<CapabilityStatus, 'generation'>): void {
    const parsed = parseContract(capabilityStatusSchema, {...value,generation:this.#generation + 1});
    if (!this.#states.has(parsed.id) || !Number.isSafeInteger(parsed.generation)) throw new Error('Invalid capability report.');
    this.#generation++;
    this.#states.set(parsed.id, parsed);
    for (const state of this.#states.values()) state.generation = this.#generation;
    this.#notify();
  }
  /** Session/lock/backend changes revoke every old context, even if availability
   * will subsequently probe to the same state. */
  invalidate(): void {
    if (!Number.isSafeInteger(this.#generation + 1)) throw new Error('Capability generation exhausted.');
    this.#generation++;
    for (const id of this.#states.keys()) this.#states.set(id,this.#unavailable(id));
    this.#notify();
  }
  subscribe(listener: () => void): () => void { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  #notify(): void { for (const listener of this.#listeners) { try { listener(); } catch { /* A failed subscriber cannot stop invalidation. */ } } }
}
