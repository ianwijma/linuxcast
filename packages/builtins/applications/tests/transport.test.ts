import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { mkdtemp,writeFile,rm,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApplications } from '../src/index.ts';
let directory:string,helperPath:string;const services:ReturnType<typeof createApplications>[]=[],launched:number[]=[];
beforeEach(async()=>{
  directory=await mkdtemp(join(tmpdir(),'linuxcast-application-transport-'));helperPath=join(directory,'fixture-helper');
  vi.stubEnv('XDG_RUNTIME_DIR',directory);vi.stubEnv('XDG_CURRENT_DESKTOP','fixture:normal');
  await writeFile(helperPath,`#!${process.execPath}\n${fixture}`,{mode:0o700});
});
afterEach(async()=>{for(const service of services.splice(0))await service.terminate();for(const pid of launched.splice(0))try{process.kill(pid,'SIGKILL');}catch{/* already ended */}vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});});
function service(){const value=createApplications({helperPath});services.push(value);return value;}
const identity=(desktopId:string)=>({desktopId,fingerprint:'a'.repeat(64)});
async function pid(id:string){for(let n=0;n<100;n++){try{return Number(await readFile(join(directory,id+'.pid'),'utf8'));}catch{await new Promise(resolve=>setTimeout(resolve,10));}}throw new Error('Fixture process did not start.');}
describe('L1-02 private executable transport fixtures (not GIO evidence)',()=>{
  it('collects ordered pages and accepts only a dispatched launch receipt',async()=>{
    const api=service();expect((await api.list()).map(value=>value.desktopId)).toEqual(['a.desktop','b.desktop','c.desktop']);expect(await api.launch(identity('normal.desktop'))).toBe('dispatched');expect(await readFile(join(directory,'invocations'),'utf8')).toBe('list\nlist\nlaunch\n');
  });
  it.each(['duplicate','reverse','cursor','empty','too-many'])('rejects %s catalogue without partial success',async mode=>{
    vi.stubEnv('XDG_CURRENT_DESKTOP',`fixture:${mode}`);await expect(service().list()).rejects.toHaveProperty('reason',mode==='too-many'?'catalogue-too-large':'invalid-reply');
  });
  it.each(['double','truncated','utf8','oversized','wrong-shape','wrong-version','extra','nonzero'])('rejects %s launch acknowledgement with unknown outcome and no replay',async mode=>{
    await expect(service().launch(identity(`${mode}.desktop`))).rejects.toMatchObject({effectOutcome:'unknown'});expect(await readFile(join(directory,'invocations'),'utf8')).toBe('launch\n');
  });
  it.each(['invalid-request','stale-application','unavailable','launch-failed'])('preserves fixed %s native failures and dispatch certainty without replay',async reason=>{
    await expect(service().launch(identity(`${reason}.desktop`))).rejects.toMatchObject({reason,effectOutcome:reason==='launch-failed'?'unknown':'not-dispatched'});expect(await readFile(join(directory,'invocations'),'utf8')).toBe('launch\n');
  });
  it('rejects path, shell and unexpected launch fields before starting a helper',async()=>{
    const api=service();for(const value of [identity('../x.desktop'),{...identity('normal.desktop'),shell:'echo synthetic'},{...identity('normal.desktop'),operation:'list',limit:100}])await expect(api.launch(value)).rejects.toHaveProperty('reason','invalid-request');await expect(readFile(join(directory,'invocations'),'utf8')).rejects.toMatchObject({code:'ENOENT'});
  });
  it('passes only allowlisted desktop variables, excluding credentials and loader/module injection',async()=>{
    vi.stubEnv('XDG_CURRENT_DESKTOP','fixture:environment');vi.stubEnv('SYNTHETIC_PROVIDER_KEY','synthetic');vi.stubEnv('NODE_OPTIONS','--trace-warnings');vi.stubEnv('GIO_EXTRA_MODULES','/synthetic');vi.stubEnv('LD_PRELOAD','/synthetic');
    const rows=await service().list();expect(rows[0]?.description).toBe('private-env-ok');
  });
  it('cancellation kills and waits for its helper without replay',async()=>{
    const api=service(),abort=new AbortController(),pending=api.launch(identity('hang.desktop'),{signal:abort.signal}).catch(error=>error);const child=await pid('hang.desktop');abort.abort();expect(await pending).toMatchObject({reason:'cancelled',effectOutcome:'unknown'});expect(()=>process.kill(child,0)).toThrow();
  });
  it('bounds concurrency and stop drains helpers and prevents later requests',async()=>{
    const api=service(),first=api.launch(identity('hang-one.desktop')).catch(error=>error),second=api.launch(identity('hang-two.desktop')).catch(error=>error);const ids=await Promise.all([pid('hang-one.desktop'),pid('hang-two.desktop')]);await expect(api.list()).rejects.toHaveProperty('reason','busy');await api.stop();expect(await first).toHaveProperty('reason','stopped');expect(await second).toHaveProperty('reason','stopped');for(const id of ids)expect(()=>process.kill(id,0)).toThrow();await expect(api.list()).rejects.toHaveProperty('reason','stopped');
  });
  it('times out a silent helper and reports an uncertain launch without automatic replay',async()=>{
    const api=service(),pending=api.launch(identity('hang.desktop')).catch(error=>error),child=await pid('hang.desktop');expect(await pending).toMatchObject({reason:'deadline-exceeded',effectOutcome:'unknown'});expect(()=>process.kill(child,0)).toThrow();expect(await readFile(join(directory,'invocations'),'utf8')).toBe('launch\n');
  },5000);
  it('does not kill an intentionally launched fixture application after acknowledgement',async()=>{
    const api=service();await api.launch(identity('detached.desktop'));const child=await pid('application');launched.push(child);await api.stop();expect(()=>process.kill(child,0)).not.toThrow();
  });
});
const fixture=String.raw`
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
if(process.argv.length!==3 || process.argv[2]!=='applications')process.exit(2);
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>{
 const q=JSON.parse(input),dir=process.env.XDG_RUNTIME_DIR;fs.appendFileSync(path.join(dir,'invocations'),q.operation+'\n');
 const send=value=>process.stdout.write(JSON.stringify({protocolVersion:1,ok:true,value})+'\n');
 const app=id=>({desktopId:id,title:'Public Fixture',description:'Synthetic application',fingerprint:'a'.repeat(64)});
 if(q.operation==='list'){
  const mode=process.env.XDG_CURRENT_DESKTOP;
  if(mode==='fixture:environment'){const bad=['SYNTHETIC_PROVIDER_KEY','NODE_OPTIONS','GIO_EXTRA_MODULES','LD_PRELOAD','ELECTRON_RUN_AS_NODE'].some(k=>Object.hasOwn(process.env,k));send({applications:[{...app('a.desktop'),description:!bad && process.env.XDG_RUNTIME_DIR?'private-env-ok':'failed'}],nextCursor:null});return;}
  if(mode==='fixture:duplicate')return send({applications:[app('a.desktop'),app('a.desktop')],nextCursor:null});
  if(mode==='fixture:reverse')return send({applications:[app('b.desktop'),app('a.desktop')],nextCursor:null});
  if(mode==='fixture:cursor')return send({applications:[app('a.desktop')],nextCursor:'b.desktop'});
  if(mode==='fixture:empty')return send({applications:[],nextCursor:'a.desktop'});
  if(mode==='fixture:too-many'){const start=q.afterId?Number(q.afterId.slice(1,5))+1:0;const entries=Array.from({length:100},(_,i)=>app('x'+String(start+i).padStart(4,'0')+'.desktop'));return send({applications:entries,nextCursor:entries.at(-1).desktopId});}
  return send(q.afterId?{applications:[app('c.desktop')],nextCursor:null}:{applications:[app('a.desktop'),app('b.desktop')],nextCursor:'b.desktop'});
 }
 const mode=q.desktopId.slice(0,-8);fs.writeFileSync(path.join(dir,q.desktopId+'.pid'),String(process.pid));
 if(['invalid-request','stale-application','unavailable','launch-failed'].includes(mode))return process.stdout.write(JSON.stringify({protocolVersion:1,ok:false,error:mode})+'\n');
 if(mode.startsWith('hang')){setInterval(()=>{},1000);return;}
 if(mode==='double'){send({outcome:'dispatched'});send({outcome:'dispatched'});return;}
 if(mode==='truncated')return process.stdout.write('{"protocolVersion":1');
 if(mode==='utf8')return process.stdout.write(Buffer.from([255,10]));
 if(mode==='oversized')return process.stdout.write('x'.repeat(1024*1024+1));
 if(mode==='wrong-shape')return send({applications:[],nextCursor:null});
 if(mode==='wrong-version')return process.stdout.write(JSON.stringify({protocolVersion:2,ok:true,value:{outcome:'dispatched'}})+'\n');
 if(mode==='extra')return send({outcome:'dispatched',private:'synthetic'});
 if(mode==='nonzero'){send({outcome:'dispatched'});process.exitCode=4;return;}
 if(mode==='detached'){const child=spawn('/bin/sleep',['10'],{detached:true,stdio:'ignore'});fs.writeFileSync(path.join(dir,'application.pid'),String(child.pid));child.unref();}
 send({outcome:'dispatched'});
});
`;
