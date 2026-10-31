import { expect,it } from 'vitest';
import { SecretSessionGate,SECRET_SESSION_FRESHNESS_MS,secretSessionFrameSchema } from '../src/session.ts';
const observed=(sequence:number,patch:object={})=>({schemaVersion:1,sequence,state:'observed',active:true,lockedHint:false,localGraphical:true,ownerMatches:true,...patch});
it('never admits an unknown or stale session and requires fresh ordered observations',()=>{
  let clock=100;const gate=new SecretSessionGate(()=>clock);
  expect(gate.canUse()).toBe(false);expect(gate.observe(observed(1))).toBe('observed-unlocked');expect(gate.canUse()).toBe(true);
  clock+=SECRET_SESSION_FRESHNESS_MS-1;expect(gate.canUse()).toBe(true);
  clock++;expect(gate.canUse()).toBe(false);
  expect(gate.observe(observed(2))).toBe('observed-unlocked');expect(gate.canUse()).toBe(true);
});
it('pauses on lock/inactivity or ineligible ownership/session and observes real recovery only in the same healthy generation',()=>{
  const gate=new SecretSessionGate(()=>100);
  expect(gate.observe(observed(1,{lockedHint:true}))).toBe('locked');expect(gate.canUse()).toBe(false);
  expect(gate.observe(observed(2,{active:false}))).toBe('inactive');expect(gate.canUse()).toBe(false);
  expect(gate.observe(observed(3,{ownerMatches:false}))).toBe('unavailable');expect(gate.canUse()).toBe(false);
  expect(gate.observe(observed(4,{localGraphical:false}))).toBe('unavailable');expect(gate.canUse()).toBe(false);
  expect(gate.observe(observed(5))).toBe('observed-unlocked');expect(gate.canUse()).toBe(true);
});
it('quarantines malformed, duplicate, reordered, private-field and failed transport frames until a new gate exists',()=>{
  for(const invalid of [observed(1),observed(0),observed(2,{raw:'SYNTHETIC_PRIVATE_CANARY'}),observed(2,{active:'true'}),{schemaVersion:1,sequence:2,state:'unavailable',reason:'transport-lost'},null]){
    const gate=new SecretSessionGate(()=>100);gate.observe(observed(1));
    expect(gate.observe(invalid)).toBe('unavailable');expect(gate.canUse()).toBe(false);
    expect(gate.observe(observed(3))).toBe('unavailable');expect(gate.canUse()).toBe(false);
  }
});
it('fails closed for clock regression/nonfinite time and rejects unbounded protocol sequences',()=>{
  for(const time of [99,NaN,Infinity,-1]){
    let clock=100;const gate=new SecretSessionGate(()=>clock);gate.observe(observed(1));clock=time;
    expect(gate.canUse()).toBe(false);clock=101;expect(gate.observe(observed(2))).toBe('unavailable');
  }
  expect(secretSessionFrameSchema.safeParse(observed(Number.MAX_SAFE_INTEGER+1)).success).toBe(false);
  const gate=new SecretSessionGate(()=>100);gate.observe(observed(1));gate.invalidate();expect(gate.canUse()).toBe(false);
  expect(new SecretSessionGate(()=>{throw new Error('SYNTHETIC_PRIVATE_CLOCK_ERROR');}).canUse()).toBe(false);
});
