import { SecretSessionGate, SECRET_SESSION_FRESHNESS_MS, secretSessionFrameSchema } from './session.ts';
import type { SecretSessionFrame, SecretSessionState } from './session.ts';

export interface SecretSessionClock {monotonic:()=>number;wall:()=>number}
const defaultClock:SecretSessionClock={monotonic:()=>performance.now(),wall:()=>Date.now()};
const MAX_CHUNK=8192,MAX_LINE=512,MAX_FRAMES_PER_WINDOW=64;

/** Main-only bounded framing and generation ownership. Wall elapsed time also
 * catches suspend/event-loop gaps on platforms whose monotonic clock pauses.
 * Receipt of a partial line never refreshes admission; a split frame retains
 * its first-byte receipt time, so slow completion cannot renew old evidence. */
export class SecretSessionStream {
  #clock:SecretSessionClock;
  #gate:SecretSessionGate;
  #pending=Buffer.alloc(0);
  #pendingReceipt:{monotonic:number;wall:number}|undefined;
  #lastClock:{monotonic:number;wall:number}|undefined;
  #receipt:{monotonic:number;wall:number}|undefined;
  #sequence=0;
  #failed=false;
  #window=0;
  #framesInWindow=0;
  constructor(clock:SecretSessionClock=defaultClock){
    this.#clock=clock;
    this.#gate=new SecretSessionGate(()=>this.#lastClock?.monotonic??NaN);
    const now=this.#now();if(now)this.#receipt=now;
  }
  get failed():boolean {return this.#failed;}
  #now():{monotonic:number;wall:number}|undefined {
    if(this.#failed)return undefined;
    try {
      const now={monotonic:this.#clock.monotonic(),wall:this.#clock.wall()};
      if(!Number.isFinite(now.monotonic)||!Number.isFinite(now.wall)||now.monotonic<0||now.wall<0||
        (this.#lastClock&&(now.monotonic<this.#lastClock.monotonic||now.wall<this.#lastClock.wall)))throw new Error();
      this.#lastClock=now;return now;
    }catch{this.invalidate();return undefined;}
  }
  #fresh():{monotonic:number;wall:number}|undefined {
    const now=this.#now();
    if(!now||!this.#receipt||now.monotonic-this.#receipt.monotonic>=SECRET_SESSION_FRESHNESS_MS||now.wall-this.#receipt.wall>=SECRET_SESSION_FRESHNESS_MS){
      this.invalidate();return undefined;
    }
    return now;
  }
  state():SecretSessionState {return this.#fresh()?this.#gate.state():'unavailable';}
  invalidate():void {this.#failed=true;this.#pending=Buffer.alloc(0);this.#pendingReceipt=undefined;this.#gate.invalidate();}
  /** Returns denial transitions before the final eligible state. Validate the
   * whole available batch first, so a later bad frame cannot briefly grant use. */
  ingest(chunk:Buffer):SecretSessionState[] {
    const now=this.#fresh();if(!now)return ['unavailable'];
    try {
      if(!Buffer.isBuffer(chunk)||chunk.length>MAX_CHUNK)throw new Error();
      const pendingLength=this.#pending.length,pendingReceipt=this.#pendingReceipt;
      const bytes=Buffer.concat([this.#pending,chunk]);
      let receipt=now;
      const frames:SecretSessionFrame[]=[];
      let offset=0,sequence=this.#sequence,terminal=false;
      for(let newline=bytes.indexOf(10,offset);newline!==-1;newline=bytes.indexOf(10,offset)){
        receipt=offset<pendingLength?pendingReceipt??now:now;
        const line=bytes.subarray(offset,newline);offset=newline+1;
        if(line.length+1>MAX_LINE||terminal)throw new Error();
        const text=new TextDecoder('utf-8',{fatal:true}).decode(line);
        // The fixed native encoder never escapes strings. Refuse escaped or
        // duplicate keys rather than allowing JSON.parse's last-key-wins rule.
        if(text.includes('\\'))throw new Error();
        const keys=[...text.matchAll(/"([A-Za-z][A-Za-z0-9]*)"\s*:/gu)].map(match=>match[1]);
        if(new Set(keys).size!==keys.length)throw new Error();
        const parsed=secretSessionFrameSchema.safeParse(JSON.parse(text));
        if(!parsed.success||parsed.data.sequence<=sequence)throw new Error();
        sequence=parsed.data.sequence;terminal=parsed.data.state==='unavailable';frames.push(parsed.data);
      }
      this.#pending=Buffer.from(bytes.subarray(offset));
      this.#pendingReceipt=this.#pending.length?(offset<pendingLength?pendingReceipt??now:now):undefined;
      if(this.#pending.length>=MAX_LINE||(terminal&&this.#pending.length))throw new Error();
      if(now.monotonic-this.#window>=1000){this.#window=now.monotonic;this.#framesInWindow=0;}
      this.#framesInWindow+=frames.length;if(this.#framesInWindow>MAX_FRAMES_PER_WINDOW)throw new Error();
      if(!frames.length)return [];
      this.#sequence=sequence;
      const transitions:SecretSessionState[]=[];
      let final:SecretSessionState='unavailable';
      for(const frame of frames){
        final=this.#gate.observe(frame);
        if(final==='unavailable'){this.invalidate();return ['unavailable'];}
        if(final!=='observed-unlocked'&&transitions.at(-1)!==final)transitions.push(final);
      }
      this.#receipt=receipt;
      if(!this.#fresh())return ['unavailable'];
      if(final==='observed-unlocked')transitions.push(final);
      return transitions;
    }catch{this.invalidate();return ['unavailable'];}
  }
}
