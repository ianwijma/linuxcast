import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp,mkdir,rm,access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { build } from 'esbuild';
import { privateSmokeEnvironment } from './smoke-environment.ts';
const script=fileURLToPath(import.meta.url);
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function stop(child:ChildProcess):Promise<void> {
  if(child.exitCode!==null || child.signalCode!==null)return;
  const exited=once(child,'exit');child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),1000);await exited;clearTimeout(timer);
}
async function inner(directory:string,electron:string,bundle:string):Promise<void> {
  const children:ChildProcess[]=[];
  try {
    // Every storage path and D-Bus address belongs to this disposable session.
    // Never use the host session address, keyring control socket or display.
    if(process.env.HOME!==join(directory,'home') || process.env.XDG_RUNTIME_DIR!==join(directory,'runtime') || !process.env.DBUS_SESSION_BUS_ADDRESS)throw new Error('Non-private smoke environment.');
    const env=privateSmokeEnvironment(directory,process.env.DBUS_SESSION_BUS_ADDRESS);
    const xvfb=spawn('Xvfb',['-displayfd','3','-screen','0','1024x768x24','-nolisten','tcp'],{env,stdio:['ignore','ignore','ignore','pipe']});children.push(xvfb);
    const display=await new Promise<string>((resolve,reject)=>{const pipe=xvfb.stdio[3];let text='';const timer=setTimeout(()=>reject(new Error()),5000);pipe?.on('data',(data:Buffer)=>{text+=data.toString();if(/^\d+\n/u.test(text)){clearTimeout(timer);resolve(`:${Number.parseInt(text,10)}`);}});xvfb.once('error',()=>{clearTimeout(timer);reject(new Error());});});
    const keyring=spawn('gnome-keyring-daemon',['--foreground','--unlock','--components=secrets','--control-directory',env.GNOME_KEYRING_CONTROL],{env:{...env,DISPLAY:display},stdio:['pipe','ignore','ignore']});children.push(keyring);keyring.stdin!.end(randomBytes(32).toString('hex'));
    // Wait only for the owned service socket; no introspection of host secrets.
    let ready=false;for(let attempt=0;attempt<50;attempt++){try{await access(join(env.GNOME_KEYRING_CONTROL,'control'));ready=true;break;}catch{await delay(100);}}
    if(!ready)throw new Error();
    const app=spawn(electron,[bundle,directory],{env:{...env,DISPLAY:display},stdio:['ignore','pipe','ignore']});children.push(app);
    let output='';app.stdout!.on('data',(value:Buffer)=>{if(output.length<8192)output+=value.toString();});
    const timer=setTimeout(()=>app.kill('SIGKILL'),20_000);const [code]=await once(app,'exit');clearTimeout(timer);
    const line=output.split('\n').find(line=>line.startsWith('{"kind":"keyring-smoke"'));
    if(code!==0 || !line){process.stdout.write(JSON.stringify({phase:'electron-exit',code,ready:output.includes('electron-ready'),probe:output.includes('keyring-probe')})+'\n');throw new Error();}const result=JSON.parse(line) as Record<string,unknown>;
    if(result.backend!=='gnome_libsecret' || result.electron!=='45.0.0' || result.roundtrip!==true || result.deleted!==true)throw new Error();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }finally{for(const child of children.reverse())await stop(child);}
}
async function outer(electron:string):Promise<void> {
  const directory=await mkdtemp(join(tmpdir(),'linuxcast-private-keyring-'));
  let child:ChildProcess|undefined;
  try {
    const bundle=join(directory,'smoke.mjs');await build({entryPoints:[fileURLToPath(new URL('./electron-keyring-smoke.ts',import.meta.url))],outfile:bundle,bundle:true,platform:'node',format:'esm',external:['electron']});
    for(const name of ['home','data','config','cache','state','runtime','runtime/keyring','electron-user-data'])await mkdir(join(directory,name),{recursive:true,mode:0o700});
    const env=privateSmokeEnvironment(directory);
    child=spawn('dbus-run-session',['--',process.execPath,script,'--inner',directory,electron,bundle],{env,detached:true,stdio:['ignore','pipe','ignore']});
    let output='';child.stdout!.on('data',(value:Buffer)=>{if(output.length<8192)output+=value.toString();});
    const timer=setTimeout(()=>{try{process.kill(-child!.pid!,'SIGKILL');}catch{/* Already exited. */}},30_000);
    const [code]=await once(child,'exit');clearTimeout(timer);if(code!==0){process.stdout.write(output);throw new Error('Disposable keyring smoke unavailable.');}
    // dbus-run-session and all children share this private process group.
    let alive=true;for(let attempt=0;attempt<20;attempt++){try{process.kill(-child.pid!,0);}catch{alive=false;break;}await delay(50);}
    if(alive)throw new Error('Disposable processes remain.');
    await rm(directory,{recursive:true,force:true});
    process.stdout.write(output.trim()+'\n{"privateEnvironment":true,"processCleanup":true,"fileCleanup":true}\n');
  }finally{
    if(child?.pid)try{process.kill(-child.pid,'SIGKILL');}catch{/* No process group remains. */}
    await rm(directory,{recursive:true,force:true});
  }
}
try {
  if(process.argv[2]==='--inner')await inner(process.argv[3]!,process.argv[4]!,process.argv[5]!);
  else {const electron=process.argv[2];if(!electron)throw new Error('Provide an installed pinned Electron45 binary.');await outer(electron);}
}catch{process.stderr.write('Disposable keyring smoke unavailable; no secure-backend pass claimed.\n');process.exitCode=2;}
