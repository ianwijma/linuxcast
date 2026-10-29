import {spawn} from 'node:child_process';
import {fstatSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {types} from 'node:util';
import {nativeSpellingEventSchema,nativeSpellingRequestSchema} from '../../../contracts/src/dictionary-spelling.ts';
import {parseJson} from '../../../contracts/src/json.ts';
import {InstalledDictionaryError} from './installed.ts';
import type {InstalledSpeller,SpellingResult} from './installed.ts';
const MAX_OUTPUT=65536,MAX_REQUEST=4096,DEADLINE_MS=3000;
const unavailable=()=>new InstalledDictionaryError('unavailable');
function request(input:Parameters<InstalledSpeller['check']>[0]){
 if(types.isProxy(input)||input===null||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new InstalledDictionaryError('invalid-request');
 const keys=Reflect.ownKeys(input);if(keys.length!==4||!['affFd','dicFd','word','signal'].every(key=>keys.includes(key)))throw new InstalledDictionaryError('invalid-request');
 const fields=Object.fromEntries(keys.map(key=>{const field=Object.getOwnPropertyDescriptor(input,key);if(!field||!('value'in field))throw new InstalledDictionaryError('invalid-request');return[key,field.value];}));
 if(!Number.isSafeInteger(fields.affFd)||Number(fields.affFd)<3||!Number.isSafeInteger(fields.dicFd)||Number(fields.dicFd)<3||fields.affFd===fields.dicFd||types.isProxy(fields.signal)||!(fields.signal instanceof AbortSignal)||typeof fields.word!=='string'||fields.word.length>256)throw new InstalledDictionaryError('invalid-request');
 const value=nativeSpellingRequestSchema.safeParse({protocolVersion:1,kind:'check',word:fields.word});if(!value.success)throw new InstalledDictionaryError('invalid-request');
 const bytes=Buffer.from(JSON.stringify(value.data));if(bytes.length+4>MAX_REQUEST)throw new InstalledDictionaryError('invalid-request');
 const frame=Buffer.alloc(bytes.length+4);frame.writeUInt32BE(bytes.length);bytes.copy(frame,4);
 return{frame,word:value.data.word,affFd:Number(fields.affFd),dicFd:Number(fields.dicFd),signal:fields.signal};
}
/** Main-only fixed packaged helper. No paths, argv, environment or native knobs
 * are accepted from the renderer or from per-check input. */
export function createNativeSpeller(executable:string):InstalledSpeller{
 if(typeof executable!=='string'||!isAbsolute(executable)||resolve(executable)!==executable||executable.length>4096||executable.includes('\0'))throw new InstalledDictionaryError('invalid-request');
 return Object.freeze({async check(input:Parameters<InstalledSpeller['check']>[0]){
  const checked=request(input);if(checked.signal.aborted)throw unavailable();
  try{for(const [fd,maximum] of [[checked.affFd,1048576],[checked.dicFd,16777216]] as const){const stat=fstatSync(fd);if(!stat.isFile()||stat.size<1||stat.size>maximum)throw unavailable();}}catch{throw unavailable();}
  return new Promise<SpellingResult>((accept,reject)=>{
   const expires=performance.now()+DEADLINE_MS;
   const child=spawn(executable,['dictionary-spell'],{stdio:['pipe','pipe','pipe',checked.affFd,checked.dicFd],env:{LANG:'C.UTF-8'},shell:false,windowsHide:true});
   let error:InstalledDictionaryError|undefined,result:SpellingResult|undefined,pending=Buffer.alloc(0),total=0,phase:'ready'|'result'|'done'='ready',ended=false;
   const fail=(reason=unavailable())=>{error??=reason;child.kill('SIGKILL');};
   const current=()=>!checked.signal.aborted&&performance.now()<expires;
   const abort=()=>fail(),timer=setTimeout(()=>fail(),DEADLINE_MS);checked.signal.addEventListener('abort',abort,{once:true});if(checked.signal.aborted)fail();
   child.once('error',()=>fail());child.stdin!.on('error',()=>fail());child.stdout!.on('error',()=>fail());child.stderr!.on('error',()=>fail());
   child.stderr!.on('data',(chunk:Buffer)=>{total+=chunk.length;if(total>MAX_OUTPUT||!current())fail();});
   child.stdout!.on('data',(chunk:Buffer)=>{
    if(error)return;total+=chunk.length;if(total>MAX_OUTPUT||!current()){fail();return;}
    try{
     pending=Buffer.concat([pending,chunk]);
     while(pending.length>=4){
      const length=pending.readUInt32BE();if(!length||length>MAX_OUTPUT-4)throw unavailable();if(pending.length<length+4)break;
      const raw:unknown=parseJson(new TextDecoder('utf-8',{fatal:true}).decode(pending.subarray(4,length+4))),parsed=nativeSpellingEventSchema.safeParse(raw);pending=pending.subarray(length+4);
      if(!parsed.success||phase==='done')throw unavailable();const value=parsed.data;
      if(value.kind==='failed'){error=new InstalledDictionaryError(value.code);phase='done';child.stdin!.end();}
      else if(phase==='ready'&&value.kind==='ready'){phase='result';child.stdin!.end(checked.frame);}
      else if(phase==='result'&&value.kind==='result'&&value.word===checked.word){result={backend:value.backend,correct:value.correct,suggestions:value.suggestions,truncated:value.truncated};phase='done';}
      else throw unavailable();
     }
    }catch{fail();}
   });
   child.stdout!.once('end',()=>{ended=true;});
   // Resolve/reject only after actual close: cancellation/deadline cannot release
   // caller-owned descriptors/read slots while the worker is still alive.
   child.once('close',(code,signal)=>{
    clearTimeout(timer);checked.signal.removeEventListener('abort',abort);
    if(!current())error=unavailable();
    if(error){reject(error);return;}
    if(code!==0||signal!==null||!ended||pending.length||phase!=='done'||!result){reject(unavailable());return;}accept(result);
   });
  });
 }});
}
