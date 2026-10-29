import {promises as fs,constants} from 'node:fs';
import type {BigIntStats} from 'node:fs';
import type {FileHandle} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename,dirname,join,resolve,isAbsolute} from 'node:path';
import {types} from 'node:util';
import {dictionaryWordSchema} from '../../../contracts/src/dictionary.ts';
import {nativeSpellingEventSchema} from '../../../contracts/src/dictionary-spelling.ts';

export const INSTALLED_DICTIONARY_DISCLOSURE='Installed dictionary base entries only. Affix, forbidden-word and compound flags are not interpreted. Results do not establish spelling correctness; definitions and generated inflections are not included. Copy a selected source word explicitly.';
export const MISSING_DICTIONARY_GUIDANCE='No readable UTF-8 Hunspell language was found. Install the appropriate Hunspell language package using your system package manager, then reload Dictionary. Linuxcast does not download language data.';
const messages={
 'invalid-request':'Choose an installed language and keep the search within 512 characters and 2048 UTF-8 bytes, without control or directional formatting characters.',
 unavailable:'This installed language is not readable. Check its system language package and file permissions, then reload Dictionary.',
 'unsupported-encoding':'This language uses an unsupported encoding. Install a UTF-8 Hunspell language package using your system package manager, then reload Dictionary.',
 malformed:'This installed language has invalid or oversized dictionary data. Reinstall its system language package, then reload Dictionary.',
 changed:'This installed language changed while being read. Reload Dictionary before choosing a word again.',
} as const;
export type InstalledDictionaryErrorCode=keyof typeof messages;
export class InstalledDictionaryError extends Error {
 readonly code:InstalledDictionaryErrorCode;readonly encoding:string|undefined;
 constructor(code:InstalledDictionaryErrorCode,encoding?:string){super(messages[code]);this.name='InstalledDictionaryError';this.code=code;this.encoding=encoding&&/^[A-Za-z0-9_-]{1,32}$/u.test(encoding)?encoding:undefined;}
}
export interface InstalledLanguage {id:string;name:string;state:'available'|'unsupported-encoding'|'invalid'|'unavailable';encoding?:string;message?:string;}
export interface InstalledLanguages {languages:InstalledLanguage[];truncated:boolean;}
export interface InstalledWord {id:string;word:string;}
export interface InstalledSearch {language:InstalledLanguage;snapshotId:string;query:string;words:InstalledWord[];truncated:boolean;}
export interface SpellingResult {correct:boolean;suggestions:string[];truncated:boolean;backend:'hunspell-1.7';}
export interface InstalledSpeller {check(input:{affFd:number;dicFd:number;word:string;signal:AbortSignal}):Promise<SpellingResult>;}
export interface InstalledSpelling extends SpellingResult {language:InstalledLanguage;snapshotId:string;word:string;}
const SYSTEM_ROOTS=['/usr/share/hunspell','/usr/share/myspell/dicts'] as const;
const MAX_LANGUAGES=64,MAX_DIRECTORY_ENTRIES=2048,MAX_AFF_BYTES=1024*1024,MAX_DIC_BYTES=16*1024*1024,MAX_ENTRIES=500000,MAX_LINE_BYTES=8192;
const languageName=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u,languageId=/^language:[a-f0-9]{64}$/u;
const digest=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const fingerprint=(stat:BigIntStats)=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
const sameFile=(a:BigIntStats,b:BigIntStats)=>a.dev===b.dev&&a.ino===b.ino;
interface Root {path:string;handle:FileHandle;stat:BigIntStats;}
interface Candidate {root:Root;name:string;id:string;}
interface OpenFile {handle:FileHandle;stat:BigIntStats;source:string;resolved:string;root:Root;originRoot:Root;}
interface Snapshot {snapshotId:string;words:readonly string[];encoding:'UTF-8';}
interface Summary {encoding:'UTF-8';}
function failure(error:unknown):InstalledDictionaryError{return error instanceof InstalledDictionaryError?error:new InstalledDictionaryError('unavailable');}
async function rootCurrent(root:Root){
 try{const stat=await fs.stat(root.path,{bigint:true});if(!stat.isDirectory()||!sameFile(stat,root.stat)||await fs.realpath(root.path)!==root.path)throw new Error();}
 catch{throw new InstalledDictionaryError('changed');}
}
async function openRoots(paths:readonly string[]):Promise<Root[]>{
 const result:Root[]=[];
 for(const path of paths){let handle:FileHandle|undefined;try{
  // Roots themselves are fixed real directories. Only paired file links are followed.
  if(await fs.realpath(path)!==path)continue;
  handle=await fs.open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const stat=await handle.stat({bigint:true});if(!stat.isDirectory())throw new Error();
  const root={path,handle,stat};await rootCurrent(root);result.push(root);handle=undefined;
 }catch{/* Missing/unreadable roots produce package-manager guidance in the application. */}finally{await handle?.close();}}
 return result;
}
async function discover(roots:Root[]):Promise<{candidates:Candidate[];truncated:boolean}>{
 const found=new Map<string,Candidate>();let truncated=false;
 for(const root of roots){
  let directory:Awaited<ReturnType<typeof fs.opendir>>|undefined;
  try{await rootCurrent(root);directory=await fs.opendir(`/proc/self/fd/${root.handle.fd}`);let count=0;
   for await(const entry of directory){if(++count>MAX_DIRECTORY_ENTRIES){truncated=true;break;}if(!entry.name.endsWith('.aff'))continue;const name=entry.name.slice(0,-4);if(languageName.test(name)&&!found.has(name))found.set(name,{root,name,id:`language:${digest(name)}`});}
   directory=undefined;await rootCurrent(root);
  }catch{/* A root that became unreadable supplies no selectable file authority. */}finally{await directory?.close().catch(()=>{});}
 }
 const sorted=[...found.values()].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);return{candidates:sorted.slice(0,MAX_LANGUAGES),truncated:truncated||sorted.length>MAX_LANGUAGES};
}
async function openFile(candidate:Candidate,extension:'aff'|'dic',roots:Root[]):Promise<OpenFile>{
 const source=join(candidate.root.path,`${candidate.name}.${extension}`);let handle:FileHandle|undefined;
 try{
  await rootCurrent(candidate.root);const resolved=await fs.realpath(source),root=roots.find(root=>dirname(resolved)===root.path),name=basename(resolved);
  if(!root||!name.endsWith(`.${extension}`)||!languageName.test(name.slice(0,-4)))throw new InstalledDictionaryError('unavailable');
  await rootCurrent(root);
  // Pin the approved directory, then refuse a replaced final symlink or FIFO/device.
  const descriptorPath=`/proc/self/fd/${root.handle.fd}/${name}`,expected=await fs.lstat(descriptorPath,{bigint:true}),maximum=extension==='aff'?MAX_AFF_BYTES:MAX_DIC_BYTES;
  if(!expected.isFile())throw new InstalledDictionaryError('unavailable');if(expected.size<1n||expected.size>BigInt(maximum))throw new InstalledDictionaryError('malformed');
  handle=await fs.open(descriptorPath,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const stat=await handle.stat({bigint:true});if(!stat.isFile()||fingerprint(stat)!==fingerprint(expected))throw new InstalledDictionaryError('changed');
  const result={handle,stat,source,resolved,root,originRoot:candidate.root};await fileCurrent(result);handle=undefined;return result;
 }catch(error){throw failure(error);}finally{await handle?.close();}
}
async function fileCurrent(file:OpenFile){
 try{
  await rootCurrent(file.originRoot);await rootCurrent(file.root);const [live,stat,resolved]=await Promise.all([file.handle.stat({bigint:true}),fs.stat(file.source,{bigint:true}),fs.realpath(file.source)]);
  if(!live.isFile()||!stat.isFile()||fingerprint(live)!==fingerprint(file.stat)||fingerprint(stat)!==fingerprint(file.stat)||resolved!==file.resolved)throw new Error();
 }catch{throw new InstalledDictionaryError('changed');}
}
async function read(file:OpenFile):Promise<Buffer>{
 const size=Number(file.stat.size),buffer=Buffer.alloc(size+1);let offset=0;
 while(offset<buffer.length){const result=await file.handle.read(buffer,offset,buffer.length-offset,offset);if(!result.bytesRead)break;offset+=result.bytesRead;}
 if(offset!==size)throw new InstalledDictionaryError('changed');return buffer.subarray(0,offset);
}
function utf8(buffer:Buffer){try{return decoder.decode(buffer);}catch{throw new InstalledDictionaryError('malformed');}}
function lines(text:string,maximum:number){
 const result=text.split('\n');if(result.at(-1)==='')result.pop();if(result.length>maximum)throw new InstalledDictionaryError('malformed');
 return result.map(line=>{const value=line.endsWith('\r')?line.slice(0,-1):line;if(Buffer.byteLength(value)>MAX_LINE_BYTES||/[\p{Cc}\p{Cs}\p{Bidi_Control}]/u.test(value.replaceAll('\t','')))throw new InstalledDictionaryError('malformed');return value;});
}
function encoding(buffer:Buffer):'UTF-8'{
 const ascii=buffer.toString('latin1').replace(/^\u00ef\u00bb\u00bf/u,'');
 const declarations=[...ascii.matchAll(/(?:^|\n)[ \t]*SET[ \t]+([A-Za-z0-9._-]{1,32})[ \t]*(?:#[^\r\n]*)?\r?(?=\n|$)/gu)];
 if(declarations.length!==1)throw new InstalledDictionaryError('malformed');const name=declarations[0]![1]!;
 if(!/^UTF-?8$/iu.test(name))throw new InstalledDictionaryError('unsupported-encoding',name);
 lines(utf8(buffer),65536);return'UTF-8';
}
function wordFromLine(line:string):string{
 let word='';
 for(let i=0;i<line.length;i++){
  const char=line[i]!;if(char==='/'||char===' '||char==='\t')break;
  if(char==='\\'&&(line[i+1]===' '||line[i+1]==='\t'))throw new InstalledDictionaryError('malformed');
  if(char==='\\'&&(line[i+1]==='/'||line[i+1]==='\\')){word+=line[++i];continue;}word+=char;
 }
 if(!word||word.length>256||Array.from(word).length>128||encoder.encode(word).length>512||/[\s\p{White_Space}\p{Cc}\p{Cs}\p{Bidi_Control}]/u.test(word))throw new InstalledDictionaryError('malformed');return word;
}
function countHeader(header:string|undefined):number{if(header===undefined||!/^(?:0|[1-9][0-9]{0,5})$/u.test(header)||Number(header)>MAX_ENTRIES)throw new InstalledDictionaryError('malformed');return Number(header);}
async function header(file:OpenFile){const buffer=Buffer.alloc(Math.min(Number(file.stat.size),32));let offset=0;while(offset<buffer.length){const result=await file.handle.read(buffer,offset,buffer.length-offset,offset);if(!result.bytesRead)break;offset+=result.bytesRead;}const newline=buffer.subarray(0,offset).indexOf(10);if(newline<0&&file.stat.size>BigInt(offset))throw new InstalledDictionaryError('malformed');countHeader(utf8(buffer.subarray(0,newline<0?offset:newline)).replace(/\r$/u,''));}
function parse(aff:Buffer,dic:Buffer):Snapshot{
 const name=encoding(aff),entries=lines(utf8(dic),MAX_ENTRIES+1),header=entries.shift();
 if(countHeader(header)!==entries.length)throw new InstalledDictionaryError('malformed');
 const words=[...new Set(entries.map(wordFromLine))].sort();
 const hash=createHash('sha256').update('linuxcast-installed-headwords-v1\0').update(String(aff.length)).update('\0').update(aff).update('\0').update(dic).digest('hex');
 return{snapshotId:hash,words,encoding:name};
}
function checkedInput(input:unknown):{languageId:string;query:string}{
 if(input===null||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new InstalledDictionaryError('invalid-request');
 const keys=Reflect.ownKeys(input);if(keys.length!==2||!keys.includes('languageId')||!keys.includes('query'))throw new InstalledDictionaryError('invalid-request');
 const language=Object.getOwnPropertyDescriptor(input,'languageId'),query=Object.getOwnPropertyDescriptor(input,'query');
 if(!language||!query||!('value'in language)||!('value'in query)||typeof language.value!=='string'||!languageId.test(language.value)||typeof query.value!=='string'||query.value.length>512||/[\p{Cc}\p{Cs}\p{Bidi_Control}]/u.test(query.value)||encoder.encode(query.value).length>2048)throw new InstalledDictionaryError('invalid-request');
 return{languageId:language.value,query:query.value};
}
const key=(text:string)=>text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'');
function checkedSpellingInput(input:unknown):{languageId:string;word:string;signal:AbortSignal}{
 if(types.isProxy(input)||input===null||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new InstalledDictionaryError('invalid-request');
 const keys=Reflect.ownKeys(input);if(keys.length!==3||!['languageId','word','signal'].every(key=>keys.includes(key)))throw new InstalledDictionaryError('invalid-request');
 const values=Object.fromEntries(keys.map(key=>{const field=Object.getOwnPropertyDescriptor(input,key);if(!field||!('value'in field))throw new InstalledDictionaryError('invalid-request');return[key,field.value];}));
 if(typeof values.languageId!=='string'||!languageId.test(values.languageId)||typeof values.word!=='string'||values.word.length>256||!dictionaryWordSchema.safeParse(values.word).success||types.isProxy(values.signal)||!(values.signal instanceof AbortSignal))throw new InstalledDictionaryError('invalid-request');
 return{languageId:values.languageId,word:values.word,signal:values.signal};
}
function spellingResult(value:unknown,word:string):SpellingResult{
 if(types.isProxy(value)||value===null||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new InstalledDictionaryError('unavailable');
 const keys=Reflect.ownKeys(value);if(keys.length!==4||!['correct','suggestions','truncated','backend'].every(key=>keys.includes(key)))throw new InstalledDictionaryError('unavailable');
 const fields=Object.fromEntries(keys.map(key=>{const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!('value'in field))throw new InstalledDictionaryError('unavailable');return[key,field.value];}));
 const result=nativeSpellingEventSchema.safeParse({protocolVersion:1,kind:'result',word,...fields});if(!result.success||result.data.kind!=='result')throw new InstalledDictionaryError('unavailable');
 return{correct:result.data.correct,suggestions:result.data.suggestions,truncated:result.data.truncated,backend:result.data.backend};
}
/** Node-only installed base-word reader. roots is trusted fixture assembly only;
 * no renderer/IPC caller chooses paths, encodings or filesystem operations. */
export function createInstalledDictionary(options:{roots?:readonly string[];speller?:InstalledSpeller}={}){
 const paths=[...(options.roots??SYSTEM_ROOTS)];if(paths.length>2||paths.some(path=>typeof path!=='string'||!isAbsolute(path)||path.length>4096))throw new InstalledDictionaryError('invalid-request');
 const rootsPaths=[...new Set(paths.map(path=>resolve(path)))];let cache:{identity:string;snapshot:Snapshot}|undefined;
 async function withRoots<T>(run:(roots:Root[])=>Promise<T>):Promise<T>{const roots=await openRoots(rootsPaths);try{return await run(roots);}finally{await Promise.all(roots.map(root=>root.handle.close()));}}
 async function load(candidate:Candidate,roots:Root[],summaries?:Map<string,Summary>):Promise<Snapshot|Summary>{
  let aff:OpenFile|undefined,dic:OpenFile|undefined;
  try{
   aff=await openFile(candidate,'aff',roots);dic=await openFile(candidate,'dic',roots);const identity=`${fingerprint(aff.stat)}|${fingerprint(dic.stat)}`;
   const summary=summaries?.get(identity);if(summary){await Promise.all([fileCurrent(aff),fileCurrent(dic)]);return summary;}
   if(cache?.identity===identity){await Promise.all([fileCurrent(aff),fileCurrent(dic)]);summaries?.set(identity,{encoding:cache.snapshot.encoding});return cache.snapshot;}
   const affBytes=await read(aff);const declared=encoding(affBytes);if(summaries){await header(dic);await Promise.all([fileCurrent(aff),fileCurrent(dic)]);const summary={encoding:declared};summaries.set(identity,summary);return summary;}const dicBytes=await read(dic);const snapshot=parse(affBytes,dicBytes);await Promise.all([fileCurrent(aff),fileCurrent(dic)]);
   cache={identity,snapshot};return snapshot;
  }catch(error){throw failure(error);}finally{await aff?.handle.close();await dic?.handle.close();}
 }
 return{
  async checkSpelling(input:{languageId:string;word:string;signal:AbortSignal}):Promise<InstalledSpelling>{
   const request=checkedSpellingInput(input);if(request.signal.aborted||!options.speller)throw new InstalledDictionaryError('unavailable');
   return withRoots(async roots=>{
    const {candidates}=await discover(roots),candidate=candidates.find(candidate=>candidate.id===request.languageId);if(!candidate)throw new InstalledDictionaryError('unavailable');
    let aff:OpenFile|undefined,dic:OpenFile|undefined;
    try{
     aff=await openFile(candidate,'aff',roots);dic=await openFile(candidate,'dic',roots);
     // Validate and hash the same descriptors handed to the engine. Do not close
     // or reopen the pair between validation, native work and freshness checks.
     const snapshot=parse(await read(aff),await read(dic));await Promise.all([fileCurrent(aff),fileCurrent(dic)]);
     if(request.signal.aborted)throw new InstalledDictionaryError('unavailable');
     const result=spellingResult(await options.speller!.check({affFd:aff.handle.fd,dicFd:dic.handle.fd,word:request.word,signal:request.signal}),request.word);
     await Promise.all([fileCurrent(aff),fileCurrent(dic)]);if(request.signal.aborted)throw new InstalledDictionaryError('unavailable');
     return{language:{id:candidate.id,name:candidate.name,state:'available',encoding:snapshot.encoding},snapshotId:snapshot.snapshotId,word:request.word,...result};
    }catch(error){throw failure(error);}finally{await aff?.handle.close();await dic?.handle.close();}
   });
  },
  async languages():Promise<InstalledLanguages>{return withRoots(async roots=>{const {candidates,truncated}=await discover(roots),summaries=new Map<string,Summary>(),languages:InstalledLanguage[]=[];
   for(const candidate of candidates){try{const snapshot=await load(candidate,roots,summaries);languages.push({id:candidate.id,name:candidate.name,state:'available',encoding:snapshot.encoding});}
    catch(error){const safe=failure(error);languages.push({id:candidate.id,name:candidate.name,state:safe.code==='unsupported-encoding'?'unsupported-encoding':safe.code==='malformed'?'invalid':'unavailable',...(safe.encoding?{encoding:safe.encoding}:{}),message:safe.message});}}
   return{languages,truncated};});},
  async search(input:{languageId:string;query:string}):Promise<InstalledSearch>{const request=checkedInput(input);return withRoots(async roots=>{
   const {candidates}=await discover(roots),candidate=candidates.find(candidate=>candidate.id===request.languageId);if(!candidate)throw new InstalledDictionaryError('unavailable');
   const snapshot=await load(candidate,roots);if(!('words'in snapshot))throw new InstalledDictionaryError('unavailable');
   const query=key(request.query.trim()),matches=snapshot.words.map(word=>({word,key:key(word)})).filter(row=>!query||row.key.includes(query));
   const rank=(value:string)=>value===query?0:value.startsWith(query)?1:2;matches.sort((a,b)=>rank(a.key)-rank(b.key)||(a.word<b.word?-1:a.word>b.word?1:0));
   return{language:{id:candidate.id,name:candidate.name,state:'available',encoding:snapshot.encoding},snapshotId:snapshot.snapshotId,query:request.query,words:matches.slice(0,100).map(row=>({id:`word:${digest(`${candidate.id}\0${snapshot.snapshotId}\0${row.word}`)}`,word:row.word})),truncated:matches.length>100};
  });},
 };
}
