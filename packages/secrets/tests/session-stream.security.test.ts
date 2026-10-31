import { expect,it } from 'vitest';
import { SecretSessionStream } from '../src/session-stream.ts';
const observed=(sequence:number,patch:object={})=>({schemaVersion:1,sequence,state:'observed',active:true,lockedHint:false,localGraphical:true,ownerMatches:true,...patch});
const encoded=(value:unknown)=>Buffer.from(JSON.stringify(value)+'\n');
function fixture(){let monotonic=100,wall=10_000;const stream=new SecretSessionStream({monotonic:()=>monotonic,wall:()=>wall});return {stream,advance:(mono:number,real=mono)=>{monotonic+=mono;wall+=real;}};}
it('admits only complete eligible fresh frames; partial chunks never renew receipt age',()=>{
  const {stream,advance}=fixture();const frame=encoded(observed(1));
  expect(stream.state()).toBe('unavailable');expect(stream.failed).toBe(false);
  expect(stream.ingest(frame.subarray(0,20))).toEqual([]);expect(stream.state()).toBe('unavailable');
  expect(stream.ingest(frame.subarray(20))).toEqual(['observed-unlocked']);expect(stream.state()).toBe('observed-unlocked');
  advance(2499);expect(stream.state()).toBe('observed-unlocked');
  stream.ingest(encoded(observed(2)).subarray(0,10));advance(1);
  expect(stream.state()).toBe('unavailable');expect(stream.failed).toBe(true);
  expect(stream.ingest(encoded(observed(3)))).toEqual(['unavailable']);
});
it('quarantines buffered observations before ingest after event-loop or suspend gaps',()=>{
  for(const [mono,wall] of [[2500,2500],[0,2500],[2500,0]]){
    const {stream,advance}=fixture();stream.ingest(encoded(observed(1)));advance(mono!,wall!);
    expect(stream.ingest(encoded(observed(2)))).toEqual(['unavailable']);expect(stream.failed).toBe(true);
  }
  const {stream,advance}=fixture();advance(2500);expect(stream.ingest(encoded(observed(1)))).toEqual(['unavailable']);
});
it('fails closed on backwards, throwing and nonfinite clocks, including wall clock',()=>{
  for(const wallClock of [false,true])for(const value of [99,NaN,Infinity,-1]){
    let clock=100;const stream=new SecretSessionStream({monotonic:()=>wallClock?100:clock,wall:()=>wallClock?clock:100});
    stream.ingest(encoded(observed(1)));clock=value;expect(stream.state()).toBe('unavailable');expect(stream.failed).toBe(true);
  }
  const stream=new SecretSessionStream({monotonic:()=>{throw new Error('SYNTHETIC_PRIVATE');},wall:()=>100});
  expect(stream.state()).toBe('unavailable');expect(stream.failed).toBe(true);
});
it('retains denial transitions within a batch without exposing intermediate grants',()=>{
  const {stream}=fixture();
  expect(stream.ingest(Buffer.concat([encoded(observed(1)),encoded(observed(2,{lockedHint:true})),encoded(observed(3,{active:false})),encoded(observed(4))]))).toEqual(['locked','inactive','observed-unlocked']);
  expect(stream.state()).toBe('observed-unlocked');
  expect(stream.ingest(Buffer.concat([encoded(observed(5)),encoded(observed(6,{raw:'SYNTHETIC_PRIVATE'}))]))).toEqual(['unavailable']);
  expect(stream.state()).toBe('unavailable');
});
it('rejects duplicate/escaped/private fields, malformed UTF8, replay and terminal extra data',()=>{
  const frame=encoded(observed(2));
  const duplicate=Buffer.from(frame.toString().replace('"active":true','"active":false,"active":true'));
  const escaped=Buffer.from(frame.toString().replace('"active"','"\\u0061ctive"'));
  const terminal=encoded({schemaVersion:1,sequence:2,state:'unavailable',reason:'transport-lost'});
  for(const bad of [duplicate,escaped,encoded(observed(1)),encoded(observed(0)),encoded(observed(2,{sequence:1.5})),encoded(observed(2,{raw:'SYNTHETIC_PRIVATE'})),encoded(observed(2,{active:1})),Buffer.from([0xff,10]),Buffer.from('{\n'),Buffer.concat([terminal,frame]),Buffer.concat([terminal,Buffer.from('x')])]){
    const {stream}=fixture();stream.ingest(encoded(observed(1)));
    expect(stream.ingest(bad)).toEqual(['unavailable']);expect(stream.failed).toBe(true);
    expect(stream.ingest(encoded(observed(99)))).toEqual(['unavailable']);
  }
});
it('bounds chunks, lines, unterminated data and frame storms before admission',()=>{
  for(const bad of [Buffer.alloc(8193,32),Buffer.from(' '.repeat(512)+'\n'),Buffer.alloc(512,32),Buffer.concat(Array.from({length:65},(_,i)=>encoded(observed(i+1))))]){
    const {stream}=fixture();expect(stream.ingest(bad)).toEqual(['unavailable']);expect(stream.failed).toBe(true);
  }
  const storm=fixture().stream;expect(storm.ingest(Buffer.concat(Array.from({length:32},(_,i)=>encoded(observed(i+1)))))).toEqual(['observed-unlocked']);
  expect(storm.ingest(Buffer.concat(Array.from({length:33},(_,i)=>encoded(observed(i+33)))))).toEqual(['unavailable']);
  const {stream}=fixture();expect(stream.ingest(Buffer.alloc(511,32))).toEqual([]);
  expect(stream.ingest(Buffer.from(' '))).toEqual(['unavailable']);
});
it('healthy heartbeats maintain eligibility, locks recover, identity loss never reopens',()=>{
  const {stream,advance}=fixture();stream.ingest(encoded(observed(1)));
  for(let sequence=2;sequence<=8;sequence++){advance(1000);expect(stream.ingest(encoded(observed(sequence)))).toEqual(['observed-unlocked']);}
  expect(stream.ingest(encoded(observed(9,{lockedHint:true})))).toEqual(['locked']);expect(stream.state()).toBe('locked');
  expect(stream.ingest(encoded(observed(10)))).toEqual(['observed-unlocked']);
  expect(stream.ingest(encoded(observed(11,{ownerMatches:false})))).toEqual(['unavailable']);
  expect(stream.ingest(encoded(observed(12)))).toEqual(['unavailable']);
  expect(new SecretSessionStream().state()).toBe('unavailable');
});

it('does not renew a split observation from the time its final byte arrives',()=>{
  const {stream,advance}=fixture(),frame=encoded(observed(2));stream.ingest(encoded(observed(1)));
  stream.ingest(frame.subarray(0,10));advance(2499);expect(stream.ingest(frame.subarray(10))).toEqual(['observed-unlocked']);
  advance(1);expect(stream.state()).toBe('unavailable');expect(stream.failed).toBe(true);
});
