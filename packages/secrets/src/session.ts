import * as z from 'zod';

export const SECRET_SESSION_HEARTBEAT_MS=1000;
export const SECRET_SESSION_FRESHNESS_MS=2500;
const common={schemaVersion:z.literal(1),sequence:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)};
/** Fixed main/helper protocol. Session identifiers, PIDs, usernames, bus names,
 * object paths, raw errors and credentials never leave the native adapter. */
export const secretSessionFrameSchema=z.discriminatedUnion('state',[
  z.strictObject({...common,state:z.literal('observed'),active:z.boolean(),lockedHint:z.boolean(),localGraphical:z.boolean(),ownerMatches:z.boolean()}),
  z.strictObject({...common,state:z.literal('unavailable'),reason:z.enum(['unavailable','denied','invalid-session','invalid-response','peer-changed','transport-lost'])}),
]);
export type SecretSessionFrame=z.infer<typeof secretSessionFrameSchema>;
export type SecretSessionState='observed-unlocked'|'locked'|'inactive'|'unavailable';
/** Trusted main-owned observation; every state() call must recheck freshness. */
export interface SecretSessionAccess {state():SecretSessionState;subscribe(listener:(state:SecretSessionState)=>void):()=>void}

/** Admission uses receipt age on a monotonic clock, never a helper timestamp.
 * A fresh logind hint is an asynchronous observation, not an atomic physical
 * screen-lock guarantee or permission to issue a provider request. */
export class SecretSessionGate {
  #clock:()=>number;
  #last:number|undefined;
  #observedAt:number|undefined;
  #lastClock:number|undefined;
  #state:SecretSessionState='unavailable';
  #failed=false;
  constructor(clock:()=>number=()=>performance.now()){this.#clock=clock;}
  #now():number|undefined {
    let now:number;
    try{now=this.#clock();}catch{this.invalidate();return undefined;}
    if(!Number.isFinite(now)||now<0||(this.#lastClock!==undefined&&now<this.#lastClock)){
      this.invalidate();return undefined;
    }
    this.#lastClock=now;return now;
  }
  observe(value:unknown):SecretSessionState {
    if(this.#failed)return 'unavailable';
    const parsed=secretSessionFrameSchema.safeParse(value),now=this.#now();
    if(!parsed.success||now===undefined||(this.#last!==undefined&&parsed.data.sequence<=this.#last)){
      this.invalidate();return 'unavailable';
    }
    const frame=parsed.data;this.#last=frame.sequence;
    if(frame.state==='unavailable'){this.invalidate();return 'unavailable';}
    this.#observedAt=now;
    this.#state=!frame.ownerMatches||!frame.localGraphical?'unavailable':frame.lockedHint?'locked':!frame.active?'inactive':'observed-unlocked';
    return this.#state;
  }
  state():SecretSessionState {
    const now=this.#now();
    if(this.#failed||now===undefined||this.#observedAt===undefined||now-this.#observedAt>=SECRET_SESSION_FRESHNESS_MS)return 'unavailable';
    return this.#state;
  }
  canUse():boolean {return this.state()==='observed-unlocked';}
  /** A failed stream cannot reopen this gate; a trusted owner must create a
   * fresh adapter/gate generation, so queued stale frames cannot regain access. */
  invalidate():void {this.#failed=true;this.#state='unavailable';this.#observedAt=undefined;}
}
