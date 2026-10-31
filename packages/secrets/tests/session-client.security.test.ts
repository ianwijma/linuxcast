import { afterEach,expect,it } from 'vitest';
import { mkdtemp,writeFile,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SecretSessionClient } from '../src/session-client.ts';
import type { SecretSessionState } from '../src/session.ts';
const roots:string[]=[],clients:SecretSessionClient[]=[];
const observation={schemaVersion:1,sequence:1,state:'observed',active:true,lockedHint:false,localGraphical:true,ownerMatches:true};
const line=JSON.stringify(observation)+'\n';
afterEach(async()=>{await Promise.all(clients.splice(0).map(client=>client.stop()));await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function helper(body:string){const root=await mkdtemp(join(tmpdir(),'linuxcast-session-client-'));roots.push(root);const path=join(root,'observer');await writeFile(path,'#!/usr/bin/python3\n'+body,{mode:0o700});return {path,root};}
function start(path:string){const client=SecretSessionClient.start(path);clients.push(client);return client;}
async function until(check:()=>boolean,timeout=1500){const end=performance.now()+timeout;while(!check()){if(performance.now()>=end)throw new Error('Synthetic session condition timeout.');await new Promise(resolve=>setTimeout(resolve,10));}}
function healthy(){return `import sys,time\nsys.stdout.write(${JSON.stringify(line)});sys.stdout.flush()\nsys.stdin.buffer.read()\n`;}
it('launches fixed argv with a clean environment and waits for stdin-close teardown',async()=>{
  const {path,root}=await helper(`import os,sys,json\nfrom pathlib import Path\nPath(__file__).with_name('launch.json').write_text(json.dumps({'argv':sys.argv[1:],'keys':sorted(os.environ)}))\nsys.stdout.write(${JSON.stringify(line)});sys.stdout.flush()\nsys.stdin.buffer.read()\nPath(__file__).with_name('ended').write_text('yes')\n`);
  const client=start(path);const events:SecretSessionState[]=[];client.subscribe(state=>events.push(state));
  await until(()=>client.canUse());const launch=JSON.parse(await readFile(join(root,'launch.json'),'utf8'));
  expect(launch.argv).toEqual(['credential-session']);expect(launch.keys).toEqual(['LANG']);
  const stop=client.stop();expect(client.canUse()).toBe(false);expect(client.stop()).toBe(stop);await stop;
  expect(await readFile(join(root,'ended'),'utf8')).toBe('yes');expect(events.at(-1)).toBe('unavailable');
});
it('quarantines missing helpers and EOF even after an eligible frame',async()=>{
  const missing=start('/nonexistent-linuxcast-session-helper');await missing.stop();expect(missing.canUse()).toBe(false);
  const {path}=await helper(`import sys,time\nsys.stdout.write(${JSON.stringify(line)});sys.stdout.flush()\ntime.sleep(.1)\n`);
  const client=start(path);await until(()=>client.canUse());await until(()=>!client.canUse());await client.stop();
});
it('rejects the full malicious batch without publishing a transient eligible state',async()=>{
  const invalid=JSON.stringify({...observation,sequence:2,raw:'SYNTHETIC_PRIVATE_CANARY'})+'\n';
  const {path,root}=await helper(`import os,sys\nfrom pathlib import Path\nos.write(1,${JSON.stringify(line+invalid)}.encode())\nsys.stdin.buffer.read()\nPath(__file__).with_name('rejected').write_text('yes')\n`);
  const client=start(path);const states:SecretSessionState[]=[];client.subscribe(state=>states.push(state));
  await until(()=>existsSync(join(root,'rejected')));await client.stop();expect(states).not.toContain('observed-unlocked');expect(client.canUse()).toBe(false);
});
it('notifies lock denial before same-batch unlock; callbacks cannot veto other consumers',async()=>{
  const locked=JSON.stringify({...observation,sequence:2,lockedHint:true})+'\n';
  const unlocked=JSON.stringify({...observation,sequence:3})+'\n';
  const {path}=await helper(`import sys,time,os\nsys.stdout.write(${JSON.stringify(line)});sys.stdout.flush()\ntime.sleep(.15)\nos.write(1,${JSON.stringify(locked+unlocked)}.encode())\nsys.stdin.buffer.read()\n`);
  const client=start(path);const states:SecretSessionState[]=[],admission:boolean[]=[];
  client.subscribe(()=>{throw new Error('SYNTHETIC_PRIVATE_LISTENER');});
  client.subscribe(state=>{states.push(state);admission.push(client.canUse());});
  await until(()=>states.includes('locked')&&states.at(-1)==='observed-unlocked');
  expect(states).toEqual(['unavailable','observed-unlocked','locked','observed-unlocked']);expect(admission).toEqual([false,true,false,true]);
});
it('reentrant shutdown on lock cannot publish a later eligible state',async()=>{
  const batch=JSON.stringify({...observation,sequence:2,lockedHint:true})+'\n'+JSON.stringify({...observation,sequence:3})+'\n';
  const {path}=await helper(`import sys,time,os\nsys.stdout.write(${JSON.stringify(line)});sys.stdout.flush()\ntime.sleep(.15)\nos.write(1,${JSON.stringify(batch)}.encode())\nsys.stdin.buffer.read()\n`);
  const client=start(path);const states:SecretSessionState[]=[];
  client.subscribe(state=>{if(state==='locked')void client.stop();});client.subscribe(state=>states.push(state));
  await until(()=>states.includes('observed-unlocked'));await until(()=>states.at(-1)==='unavailable');await client.stop();
  expect(states.filter(state=>state==='observed-unlocked')).toHaveLength(1);expect(client.canUse()).toBe(false);
});
it('expires a silent eligible helper and waits for its shutdown',async()=>{
  const {path}=await helper(healthy());const client=start(path);await until(()=>client.canUse());
  await until(()=>!client.canUse(),3000);await client.stop();
},5000);
it('escalates a retained helper ignoring EOF and SIGTERM, awaiting actual close',async()=>{
  const {path,root}=await helper(`import os,sys,time,signal\nfrom pathlib import Path\nsignal.signal(signal.SIGTERM,signal.SIG_IGN)\nPath(__file__).with_name('pid').write_text(str(os.getpid()))\nsys.stdout.write(${JSON.stringify(line)});sys.stdout.flush()\nwhile True:time.sleep(.05)\n`);
  const client=start(path);await until(()=>client.canUse());const pid=Number(await readFile(join(root,'pid'),'utf8'));
  const before=performance.now();await client.stop();expect(performance.now()-before).toBeGreaterThanOrEqual(200);
  expect(()=>process.kill(pid,0)).toThrow();expect(client.canUse()).toBe(false);
});
it('rejects relative and NUL paths before starting anything',()=>{
  expect(()=>SecretSessionClient.start('observer')).toThrow('Invalid session helper path.');expect(()=>SecretSessionClient.start('/bad\0path')).toThrow('Invalid session helper path.');
});
