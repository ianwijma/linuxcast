import {afterEach,expect,it,vi} from 'vitest';
import {promises as fs,existsSync,readFileSync,fstatSync} from 'node:fs';
import type {FileHandle} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNativeSpeller} from '../src/native-spelling.ts';
// Actual controlled child processes with authored protocol replies. These are
// synthetic transport fixtures, not the native Hunspell/containment module.
const directories:string[]=[],handles:FileHandle[]=[],controllers:AbortController[]=[],pending:Promise<unknown>[]=[];
afterEach(async()=>{controllers.splice(0).forEach(value=>value.abort());await Promise.allSettled(pending.splice(0));await Promise.all(handles.splice(0).map(handle=>handle.close()));await Promise.all(directories.splice(0).map(path=>fs.rm(path,{recursive:true,force:true})));vi.restoreAllMocks();});
const prelude=`const fs=require('node:fs');
const frame=value=>{const bytes=Buffer.from(JSON.stringify(value)),head=Buffer.alloc(4);head.writeUInt32BE(bytes.length);return Buffer.concat([head,bytes]);};
const send=value=>process.stdout.write(frame(value));
const ready={protocolVersion:1,kind:'ready',backend:'hunspell-1.7'};
const result=word=>({protocolVersion:1,kind:'result',backend:'hunspell-1.7',word,correct:false,suggestions:['café au lait','cafe\\u0301'],truncated:false});
`;
async function fixture(body:string,initial='send(ready);'){
 const directory=await fs.mkdtemp(join(tmpdir(),'linuxcast-spelling-transport-'));directories.push(directory);const affPath=join(directory,'public.aff'),dicPath=join(directory,'public.dic'),executable=join(directory,'worker.cjs'),marker=join(directory,'marker');await fs.writeFile(affPath,'SET UTF-8\n# PUBLIC_AFFIX\n');await fs.writeFile(dicPath,'1\nPUBLIC_WORD\n');const aff=await fs.open(affPath,'r'),dic=await fs.open(dicPath,'r');handles.push(aff,dic);
 const script=`#!${process.execPath}\n${prelude}\nconst marker=${JSON.stringify(marker)};\n${initial}\nconst chunks=[];process.stdin.on('data',value=>chunks.push(value));process.stdin.on('end',()=>{const bytes=Buffer.concat(chunks);let request;try{if(bytes.length<4||bytes.readUInt32BE()!==bytes.length-4||bytes.length>4096)throw Error();request=JSON.parse(bytes.subarray(4));}catch{process.exit(8);}const word=request.word;${body}\n});\n`;await fs.writeFile(executable,script,{mode:0o700});const controller=new AbortController();controllers.push(controller);const input={affFd:aff.fd,dicFd:dic.fd,word:'public',signal:controller.signal},speller=createNativeSpeller(executable);return{directory,aff,dic,executable,marker,controller,input,speller,check:(patch:Record<string,unknown>={})=>{const operation=speller.check({...input,...patch} as never);pending.push(operation);void operation.catch(()=>{});return operation;}};
}
it('uses fixed mode/FD3/4/sanitized environment, sends one bounded check plus EOF, and preserves literal Unicode phrases',async()=>{
 const f=await fixture(`if(JSON.stringify(process.argv.slice(2))!==JSON.stringify(['dictionary-spell'])||JSON.stringify(Object.keys(process.env))!==JSON.stringify(['LANG'])||process.env.LANG!=='C.UTF-8'||!fs.readFileSync(3,'utf8').includes('PUBLIC_AFFIX')||!fs.readFileSync(4,'utf8').includes('PUBLIC_WORD')||JSON.stringify(Object.keys(request).sort())!==JSON.stringify(['kind','protocolVersion','word'])||request.kind!=='check'||request.protocolVersion!==1)process.exit(9);send(result(word));`);
 expect(await f.check({word:'cafe\u0301'})).toEqual({backend:'hunspell-1.7',correct:false,suggestions:['café au lait','cafe\u0301'],truncated:false});expect(fstatSync(f.aff.fd).isFile()).toBe(true);expect(fstatSync(f.dic.fd).isFile()).toBe(true);
});
it('preserves an exact recognised input without invented suggestions',async()=>{const f=await fixture(`send({...result(word),correct:true,suggestions:[]});`);expect(await f.check({word:'😀'.repeat(128)})).toEqual({backend:'hunspell-1.7',correct:true,suggestions:[],truncated:false});});
it.each(['unsupported-encoding','changed','malformed','unavailable','invalid-request'])('returns safe explicit failed %s only after actual worker close',async code=>{
 const f=await fixture('',`send({protocolVersion:1,kind:'failed',code:${JSON.stringify(code)}});process.exitCode=1;process.stdin.resume();`);await expect(f.check()).rejects.toMatchObject({code});
});
it('does not resolve an accepted result until actual clean process/stream close',async()=>{
 const f=await fixture(`send(result(word));fs.writeFileSync(marker,String(process.pid));setTimeout(()=>process.exit(0),150);`);let settled=false;const operation=f.check().finally(()=>{settled=true;});await vi.waitFor(()=>expect(existsSync(f.marker)).toBe(true));expect(settled).toBe(false);await operation;expect(settled).toBe(true);
});
it.each([
 ['wrong word',`send(result('other'));`],['wrong backend',`send({...result(word),backend:'other'});`],['wrong version',`send({...result(word),protocolVersion:2});`],['duplicate result',`send(result(word));send(result(word));`],['extra ready',`send(result(word));send(ready);`],['extra partial header',`send(result(word));process.stdout.write(Buffer.from([0]));`],['bad JSON',`process.stdout.write(Buffer.from([0,0,0,1,123]));`],['invalid UTF8',`process.stdout.write(Buffer.from([0,0,0,2,0xc0,0xaf]));`],['incomplete frame',`process.stdout.write(Buffer.from([0,0,0,10,123]));`],['zero frame',`process.stdout.write(Buffer.alloc(4));`],['oversized declared frame',`process.stdout.write(Buffer.from([0,1,0,0]));`],['private extra',`send({...result(word),path:'/PUBLIC_PRIVATE_PATH'});`],['duplicate suggestions',`send({...result(word),suggestions:['public','public']});`],['oversized suggestions',`send({...result(word),suggestions:['a'.repeat(257)]});`],['control suggestion',`send({...result(word),suggestions:['two\\nlines']});`],['bidi suggestion',`send({...result(word),suggestions:['two\\u202elines']});`],['nonzero exit',`send(result(word));process.exitCode=7;`],['missing terminal',``],['stderr overflow',`process.stderr.write('PUBLIC_PRIVATE_STDERR'.repeat(4000));send(result(word));`],
])('refuses %s protocol/exit outcome without returning private output',async(_,body)=>{const f=await fixture(body);const error=await f.check().catch(error=>error);expect(error).toMatchObject({name:'InstalledDictionaryError',code:'unavailable'});expect(String(error)).not.toContain('PUBLIC_PRIVATE');});
it.each(['word','correct'])('refuses raw duplicate %s fields even when the final value would pass the schema',async key=>{
 const f=await fixture(`const json=JSON.stringify(result(word)),duplicate=json.replace('"${key}":','"${key}":'+JSON.stringify(${key==='word'?"'forged'":"true"})+',"${key}":');const bytes=Buffer.from(duplicate),head=Buffer.alloc(4);head.writeUInt32BE(bytes.length);process.stdout.write(Buffer.concat([head,bytes]));`);
 await expect(f.check()).rejects.toMatchObject({code:'unavailable'});
});
it('refuses result-before-ready and duplicate ready ordering',async()=>{
 for(const initial of [`send(result('public'));`,`send(ready);send(ready);`]){const f=await fixture(`send(result(word));`,initial);await expect(f.check()).rejects.toMatchObject({code:'unavailable'});}
});
it('accepts split frame chunks without dropping bytes or releasing early',async()=>{const f=await fixture(`const replyBytes=frame(result(word));process.stdout.write(replyBytes.subarray(0,2));setTimeout(()=>process.stdout.write(replyBytes.subarray(2,7)),10);setTimeout(()=>process.stdout.write(replyBytes.subarray(7)),20);`);expect(await f.check()).toMatchObject({correct:false,suggestions:['café au lait','cafe\u0301']});});
it('kills a pending actual worker on Abort and rejects only once that process has closed',async()=>{
 const f=await fixture(`fs.writeFileSync(marker,String(process.pid));setInterval(()=>{},1000);`),operation=f.check();await vi.waitFor(()=>expect(existsSync(f.marker)).toBe(true));const pid=Number(readFileSync(f.marker,'utf8'));f.controller.abort();await expect(operation).rejects.toMatchObject({code:'unavailable'});expect(()=>process.kill(pid,0)).toThrow();expect(fstatSync(f.aff.fd).isFile()).toBe(true);
});
it('kills a nonresponding actual worker at the fixed three-second deadline and waits for close',async()=>{
 const f=await fixture(`fs.writeFileSync(marker,String(process.pid));setInterval(()=>{},1000);`),operation=f.check();await vi.waitFor(()=>expect(existsSync(f.marker)).toBe(true));const pid=Number(readFileSync(f.marker,'utf8'));await expect(operation).rejects.toMatchObject({code:'unavailable'});expect(()=>process.kill(pid,0)).toThrow();
});
it('checks monotonic deadline on result delivery even before timer callback runs',async()=>{
 const clock=vi.spyOn(performance,'now').mockReturnValue(0),f=await fixture(`fs.writeFileSync(marker,String(process.pid));setTimeout(()=>send(result(word)),150);`),operation=f.check();await vi.waitFor(()=>expect(existsSync(f.marker)).toBe(true));clock.mockReturnValue(3001);await expect(operation).rejects.toMatchObject({code:'unavailable'});
});
it('refuses malformed caller authority, invalid descriptors and pre-aborted input without spawning',async()=>{
 const f=await fixture(`fs.writeFileSync(marker,'spawned');send(result(word));`),getter=vi.fn(()=>f.aff.fd);for(const input of [{...f.input,word:'two words'},{...f.input,word:'x'.repeat(257)},{...f.input,word:'public\u202e'},{...f.input,word:'public\ud800'},{...f.input,affFd:0},{...f.input,dicFd:f.aff.fd},{...f.input,path:f.executable},{...f.input,signal:undefined},Object.defineProperty({...f.input},'affFd',{get:getter}),new Proxy(f.input,{getPrototypeOf(){getter();return Object.prototype;}})])await expect(f.speller.check(input as never)).rejects.toMatchObject({code:'invalid-request'});expect(getter).not.toHaveBeenCalled();
 f.controller.abort();await expect(f.check()).rejects.toMatchObject({code:'unavailable'});expect(existsSync(f.marker)).toBe(false);for(const executable of ['worker','/tmp/../public-worker','/tmp/public\0worker'])expect(()=>createNativeSpeller(executable)).toThrow();
});
it('maps missing executable and closed/nonregular source FDs to fixed refusal without native path details',async()=>{
 const f=await fixture(`send(result(word));`),missing=createNativeSpeller(join(f.directory,'PUBLIC_PRIVATE_MISSING'));const result=await missing.check(f.input).catch(error=>error);expect(result).toMatchObject({code:'unavailable'});expect(String(result)).not.toContain('PUBLIC_PRIVATE_MISSING');await f.dic.close();await expect(f.check()).rejects.toMatchObject({code:'unavailable'});const directory=await fs.open(f.directory,'r');handles.push(directory);await expect(f.check({dicFd:directory.fd})).rejects.toMatchObject({code:'unavailable'});
});
