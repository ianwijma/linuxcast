import {promises as fs,constants} from 'node:fs';
import type {BigIntStats} from 'node:fs';
import type {FileHandle} from 'node:fs/promises';
import {basename,dirname,isAbsolute,join} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzip} from 'node:zlib';

export const STARDICT_DISCLOSURE='Selected local StarDict source: UTF-8 plain meaning and phonetic fields only. Markup, media, resources, locale-encoded fields, tree dictionaries, synonyms and thesaurus expansion are not supported. No data is downloaded and no source content is executed.';
const errors={
 'invalid-request':'Choose a local StarDict .ifo file and use a valid current source entry or a search within 512 characters and 2048 UTF-8 bytes.',
 unavailable:'The selected local dictionary is unreadable or missing paired files. Check its files and permissions, then choose the source again.',
 'unsupported-format':'This source uses an unsupported StarDict format or field. Choose a normal UTF-8 plain-text StarDict source; markup, media, resources, locale encodings, tree dictionaries and synonym expansion are not supported.',
 malformed:'The selected dictionary has invalid or oversized data. Check its source files or choose a smaller supported StarDict source.',
 changed:'The selected dictionary changed while in use. Choose the source again before searching or reading another definition.',
 closed:'This local dictionary source is closed. Choose the source again before searching or reading a definition.',
} as const;
export type StarDictErrorCode=keyof typeof errors;
export class StarDictError extends Error {
 readonly code:StarDictErrorCode;
 constructor(code:StarDictErrorCode){super(errors[code]);this.name='StarDictError';this.code=code;}
}
export interface StarDictMetadata {id:string;name:string;wordCount:number;snapshotId:string;}
export interface StarDictRecord {id:string;word:string;}
export interface StarDictPart {kind:'meaning'|'phonetic';text:string;}
export interface StarDictSource {
 readonly metadata:Readonly<StarDictMetadata>;
 search(input:{query:string}):Promise<{query:string;records:StarDictRecord[];truncated:boolean}>;
 definition(input:{id:string}):Promise<{id:string;word:string;parts:StarDictPart[]}>;
 close():Promise<void>;
}
const MAX_IFO=65536,MAX_INDEX=16*1024*1024,MAX_DICT=64*1024*1024,MAX_COMPRESSED=32*1024*1024,MAX_WORDS=250000,MAX_PARTS=32,MAX_DEFINITION=65536;
const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}),encoder=new TextEncoder();
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const clean=(text:string)=>!/[\p{Cc}\p{Cs}\p{Bidi_Control}]/u.test(text);
const safe=(error:unknown)=>error instanceof StarDictError?error:new StarDictError('unavailable');
const identity=(stat:BigIntStats)=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
interface Directory {path:string;selectedPath:string;handle:FileHandle;stat:BigIntStats;}
interface HeldFile {handle:FileHandle;stat:BigIntStats;logical:string;resolved:string;}
interface Ifo {name:string;wordCount:number;indexSize:number;offsetBytes:4|8;sequence:string|undefined;}
interface Entry extends StarDictRecord {offset:number;size:number;ordinal:number;key:string;}
function decode(buffer:Uint8Array){try{return utf8.decode(buffer);}catch{throw new StarDictError('malformed');}}
function objectValue(input:unknown,key:string):unknown{
 if(input===null||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new StarDictError('invalid-request');
 const keys=Reflect.ownKeys(input),descriptor=Object.getOwnPropertyDescriptor(input,key);if(keys.length!==1||keys[0]!==key||!descriptor||!('value'in descriptor))throw new StarDictError('invalid-request');return descriptor.value;
}
function queryInput(input:unknown):string{const query=objectValue(input,'query');if(typeof query!=='string'||query.length>512||!clean(query)||encoder.encode(query).length>2048)throw new StarDictError('invalid-request');return query;}
function pathInput(input:unknown):string{const path=objectValue(input,'ifoPath');if(typeof path!=='string'||path.length>4096||!isAbsolute(path)||!path.endsWith('.ifo')||basename(path)==='.ifo'||!clean(path)||encoder.encode(path).length>4096)throw new StarDictError('invalid-request');return path;}
async function directoryCurrent(directory:Directory){
 const [resolved,stat]=await Promise.all([fs.realpath(directory.selectedPath),fs.stat(directory.selectedPath,{bigint:true})]);
 if(resolved!==directory.path||!stat.isDirectory()||stat.dev!==directory.stat.dev||stat.ino!==directory.stat.ino)throw new StarDictError('changed');
}
async function heldCurrent(directory:Directory,file:HeldFile){
 const [live,pathStat,resolved]=await Promise.all([file.handle.stat({bigint:true}),fs.stat(file.logical,{bigint:true}),fs.realpath(file.logical)]);
 if(!live.isFile()||!pathStat.isFile()||identity(live)!==identity(file.stat)||identity(pathStat)!==identity(file.stat)||resolved!==file.resolved||dirname(resolved)!==directory.path)throw new StarDictError('changed');
}
async function openDirectory(selectedPath:string):Promise<Directory>{
 let handle:FileHandle|undefined;
 try{const path=await fs.realpath(selectedPath);handle=await fs.open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const stat=await handle.stat({bigint:true});if(!stat.isDirectory())throw new StarDictError('unavailable');const directory={path,selectedPath,handle,stat};await directoryCurrent(directory);handle=undefined;return directory;}
 catch(error){throw safe(error);}finally{await handle?.close();}
}
async function openLeaf(directory:Directory,leaf:string,suffix:string,maximum:number):Promise<HeldFile>{
 let handle:FileHandle|undefined;
 try{await directoryCurrent(directory);const logical=join(directory.path,leaf),resolved=await fs.realpath(logical);if(dirname(resolved)!==directory.path||!basename(resolved).endsWith(suffix))throw new StarDictError('unavailable');
  const descriptorPath=`/proc/self/fd/${directory.handle.fd}/${basename(resolved)}`,expected=await fs.lstat(descriptorPath,{bigint:true});if(!expected.isFile())throw new StarDictError('unavailable');if(expected.size>BigInt(maximum))throw new StarDictError('malformed');
  handle=await fs.open(descriptorPath,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const stat=await handle.stat({bigint:true});if(!stat.isFile()||identity(stat)!==identity(expected))throw new StarDictError('changed');
  const file={handle,stat,logical,resolved};await heldCurrent(directory,file);handle=undefined;return file;
 }catch(error){throw safe(error);}finally{await handle?.close();}
}
async function exists(directory:Directory,leaf:string):Promise<boolean>{try{await fs.lstat(`/proc/self/fd/${directory.handle.fd}/${leaf}`);return true;}catch(error){if(error!==null&&typeof error==='object'&&'code'in error&&error.code==='ENOENT')return false;throw safe(error);}}
async function choosePair(directory:Directory,stem:string,plain:string,compressed:string){
 const [a,b]=await Promise.all([exists(directory,stem+plain),exists(directory,stem+compressed)]);if(a&&b)throw new StarDictError('unsupported-format');if(!a&&!b)throw new StarDictError('unavailable');return{leaf:stem+(a?plain:compressed),suffix:a?plain:compressed,compressed:b};
}
async function read(file:HeldFile):Promise<Buffer>{
 const size=Number(file.stat.size),bytes=Buffer.alloc(size+1);let offset=0;
 while(offset<bytes.length){const next=await file.handle.read(bytes,offset,bytes.length-offset,offset);if(!next.bytesRead)break;offset+=next.bytesRead;}
 if(offset!==size)throw new StarDictError('changed');return bytes.subarray(0,offset);
}
function inflate(bytes:Buffer,maximum:number):Promise<Buffer>{return new Promise((resolve,reject)=>{gunzip(bytes,{maxOutputLength:maximum},(error,value)=>{if(error||value.length>maximum)reject(new StarDictError('malformed'));else resolve(value);});});}
function numberField(value:string|undefined,maximum:number):number{if(value===undefined||!/^(?:0|[1-9][0-9]*)$/u.test(value)||value.length>16)throw new StarDictError('malformed');const number=Number(value);if(!Number.isSafeInteger(number)||number>maximum)throw new StarDictError('malformed');return number;}
function parseIfo(bytes:Buffer):Ifo{
 const text=decode(bytes),lines=text.split(/\r\n|\n|\r/u);if(lines[0]!=="StarDict's dict ifo file")throw new StarDictError('unsupported-format');if(!/[\r\n]$/u.test(text))throw new StarDictError('malformed');
 const options=new Map<string,string>();let first=true;
 for(const line of lines.slice(1)){if(!line.trim())continue;const equal=line.indexOf('='),key=line.slice(0,equal).trim(),value=line.slice(equal+1).trim();if(equal<1||!/^[-_A-Za-z0-9]+$/u.test(key)||!clean(value)||options.has(key)||first&&key!=='version')throw new StarDictError('malformed');options.set(key,value);first=false;}
 const version=options.get('version');if(!['2.4.2','3.0.0'].includes(version??''))throw new StarDictError('unsupported-format');
 const name=options.get('bookname');if(!name||name.length>256||encoder.encode(name).length>1024)throw new StarDictError('malformed');
 const bits=options.get('idxoffsetbits')??'32';if(!['32','64'].includes(bits)||version==='2.4.2'&&bits==='64'||options.get('dicttype'))throw new StarDictError('unsupported-format');
 const sequence=options.get('sametypesequence');if(sequence!==undefined&&(!/^[mty]+$/u.test(sequence)||sequence.length>MAX_PARTS))throw new StarDictError('unsupported-format');
 if(options.has('synwordcount'))numberField(options.get('synwordcount'),MAX_WORDS);
 return{name,wordCount:numberField(options.get('wordcount'),MAX_WORDS),indexSize:numberField(options.get('idxfilesize'),MAX_INDEX),offsetBytes:bits==='64'?8:4,sequence};
}
function asciiFold(bytes:Buffer){return bytes.map(byte=>byte>=65&&byte<=90?byte+32:byte);}
function compareWords(a:Buffer,b:Buffer){return Buffer.compare(asciiFold(a),asciiFold(b))||Buffer.compare(a,b);}
const searchKey=(word:string)=>word.normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'');
function parseIndex(bytes:Buffer,dataLength:number,ifo:Ifo,snapshot:string):Entry[]{
 if(bytes.length!==ifo.indexSize)throw new StarDictError('malformed');const entries:Entry[]=[];let position=0,previous:Buffer|undefined;
 while(position<bytes.length){if(entries.length>=ifo.wordCount||entries.length>=MAX_WORDS)throw new StarDictError('malformed');const end=bytes.indexOf(0,position);if(end<0||end===position||end-position>255||end+1+ifo.offsetBytes+4>bytes.length)throw new StarDictError('malformed');
  const wordBytes=bytes.subarray(position,end),word=decode(wordBytes);if(!word.trim()||!clean(word)||Array.from(word).length>128||previous&&compareWords(previous,wordBytes)>0)throw new StarDictError('malformed');previous=wordBytes;
  position=end+1;const offset=ifo.offsetBytes===8?bytes.readBigUInt64BE(position):BigInt(bytes.readUInt32BE(position));position+=ifo.offsetBytes;const size=bytes.readUInt32BE(position);position+=4;
  if(offset>BigInt(Number.MAX_SAFE_INTEGER)||offset+BigInt(size)>BigInt(dataLength))throw new StarDictError('malformed');const ordinal=entries.length;
  entries.push({id:`entry:${hash(`${snapshot}\0${ordinal}\0${word}\0${offset}\0${size}`)}`,word,offset:Number(offset),size,ordinal,key:searchKey(word)});
 }
 if(entries.length!==ifo.wordCount)throw new StarDictError('malformed');return entries;
}
function definitionParts(bytes:Buffer,sequence:string|undefined):StarDictPart[]{
 if(bytes.length>MAX_DEFINITION+2*MAX_PARTS)throw new StarDictError('malformed');let position=0,total=0;const parts:StarDictPart[]=[];
 const part=(type:string,end:number)=>{if(!'mty'.includes(type)||type.length!==1)throw new StarDictError('unsupported-format');if(parts.length>=MAX_PARTS)throw new StarDictError('malformed');const raw=bytes.subarray(position,end);total+=raw.length;if(total>MAX_DEFINITION)throw new StarDictError('malformed');const text=decode(raw);if(!clean(text.replace(/[\r\n\t]/gu,'')))throw new StarDictError('malformed');parts.push({kind:type==='m'?'meaning':'phonetic',text});};
 if(sequence){for(let i=0;i<sequence.length;i++){const last=i===sequence.length-1,end=last?bytes.length:bytes.indexOf(0,position);if(end<position)throw new StarDictError('malformed');part(sequence[i]!,end);position=end+(last?0:1);}}
 else{while(position<bytes.length){const type=String.fromCharCode(bytes[position++]!);if(!'mty'.includes(type))throw new StarDictError('unsupported-format');const end=bytes.indexOf(0,position);if(end<0)throw new StarDictError('malformed');part(type,end);position=end+1;}}
 if(position!==bytes.length||!parts.length)throw new StarDictError('malformed');return parts;
}
/** Trusted Node assembly passes the native chooser's selected .ifo path. Never
 * expose this path-taking function as renderer filesystem authority. */
export async function openStarDictSource(input:{ifoPath:string}):Promise<StarDictSource>{
 const ifoPath=pathInput(input),directory=await openDirectory(dirname(ifoPath)),held:HeldFile[]=[];let transferred=false;
 try{
  const leaf=basename(ifoPath),stem=leaf.slice(0,-4),ifoFile=await openLeaf(directory,leaf,'.ifo',MAX_IFO);held.push(ifoFile);const ifoBytes=await read(ifoFile),ifo=parseIfo(ifoBytes);
  const indexChoice=await choosePair(directory,stem,'.idx','.idx.gz'),dataChoice=await choosePair(directory,stem,'.dict','.dict.dz');
  const indexFile=await openLeaf(directory,indexChoice.leaf,indexChoice.suffix,indexChoice.compressed?MAX_COMPRESSED:MAX_INDEX);held.push(indexFile);const dataFile=await openLeaf(directory,dataChoice.leaf,dataChoice.suffix,dataChoice.compressed?MAX_COMPRESSED:MAX_DICT);held.push(dataFile);
  const indexRaw=await read(indexFile),dataRaw=await read(dataFile),index=indexChoice.compressed?await inflate(indexRaw,MAX_INDEX):indexRaw;let data=dataChoice.compressed?await inflate(dataRaw,MAX_DICT):dataRaw;
  const digest=createHash('sha256').update('linuxcast-stardict-v1\0');for(const bytes of [ifoBytes,indexRaw,dataRaw])digest.update(String(bytes.length)).update('\0').update(bytes).update('\0');const snapshotId=digest.digest('hex');
  let entries=parseIndex(index,data.length,ifo,snapshotId);const byId=new Map(entries.map(entry=>[entry.id,entry])),metadata=Object.freeze({id:`stardict:${snapshotId}`,name:ifo.name,wordCount:ifo.wordCount,snapshotId});
  await directoryCurrent(directory);await Promise.all(held.map(file=>heldCurrent(directory,file)));let closed=false,changed=false,closing:Promise<void>|undefined;
  const current=async()=>{if(closed)throw new StarDictError('closed');if(changed)throw new StarDictError('changed');try{await directoryCurrent(directory);await Promise.all(held.map(file=>heldCurrent(directory,file)));}catch{if(closed)throw new StarDictError('closed');changed=true;throw new StarDictError('changed');}if(closed)throw new StarDictError('closed');};
  const source:StarDictSource={metadata,
   async search(input){if(closed)throw new StarDictError('closed');const query=queryInput(input);await current();const key=searchKey(query.trim()),exact=query.trim();const rank=(entry:Entry)=>entry.word===exact?0:entry.key===key?1:entry.key.startsWith(key)?2:3;const matches=entries.filter(entry=>!key||entry.key.includes(key));if(key)matches.sort((a,b)=>rank(a)-rank(b)||a.ordinal-b.ordinal);return{query,records:matches.slice(0,100).map(({id,word})=>({id,word})),truncated:matches.length>100};},
   async definition(input){if(closed)throw new StarDictError('closed');const id=objectValue(input,'id');if(typeof id!=='string'||!/^entry:[a-f0-9]{64}$/u.test(id))throw new StarDictError('invalid-request');await current();const entry=byId.get(id);if(!entry)throw new StarDictError('invalid-request');return{id:entry.id,word:entry.word,parts:definitionParts(data.subarray(entry.offset,entry.offset+entry.size),ifo.sequence)};},
   close(){if(closing)return closing;closed=true;entries=[];byId.clear();data=Buffer.alloc(0);closing=(async()=>{await Promise.allSettled([...held.map(file=>file.handle.close()),directory.handle.close()]);})();return closing;},
  };
  transferred=true;return Object.freeze(source);
 }catch(error){throw safe(error);}finally{if(!transferred)await Promise.allSettled([...held.map(file=>file.handle.close()),directory.handle.close()]);}
}
