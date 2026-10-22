import {afterAll,beforeAll,expect,test} from 'vitest';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildGuestHarness} from './build.ts';
import {readNativePipe} from './native-pipe.ts';
import type {Handle} from '../protocol.ts';

const root=mkdtempSync(join(tmpdir(),'linuxcast-s002-restart-preparation-'));
let bundle: string;
beforeAll(async()=>{bundle=await buildGuestHarness(join(root,'build'));});
afterAll(()=>rmSync(root,{recursive:true,force:true}));
function start(phase:'crash'|'fresh',old?:Handle) {
  const child=spawn(process.execPath,[join(bundle,'restart-helper.mjs')],{env:{PATH:process.env.PATH,HOME:root,
    LINUXCAST_S002_PRIVATE_GUEST:'1',LINUXCAST_S002_RESULT_DIR:root,LINUXCAST_S002_CANARY_PID:'100',
    LINUXCAST_S002_RESTART_PHASE:phase,LINUXCAST_S002_GENERATION_BASE:String(old?.generation ?? 0),
    ...(old ? {LINUXCAST_S002_OLD_HANDLE:JSON.stringify(old)} : {})},stdio:['pipe','pipe','ignore']});
  const lines=createInterface({input:child.stdout});
  let serial=0;
  const pending=new Map<number,{resolve(reply:Record<string,unknown>):void;reject(error:Error):void}>();
  lines.on('line',line=>{const frame=JSON.parse(line) as {id:number;reply:Record<string,unknown>}; pending.get(frame.id)?.resolve(frame.reply);pending.delete(frame.id);});
  child.once('exit',()=>{for(const waiter of pending.values())waiter.reject(new Error('PRIVATE_HELPER_EXITED'));});
  const call=(method:string,body:Record<string,unknown>)=>new Promise<Record<string,unknown>>((resolve,reject)=>{
    const id=++serial;
    const deadline=setTimeout(()=>reject(new Error('PRIVATE_HELPER_REPLY_TIMEOUT')),1000);
    pending.set(id,{resolve:reply=>{clearTimeout(deadline);resolve(reply);},reject:error=>{clearTimeout(deadline);reject(error);}});
    child.stdin.write(`${JSON.stringify({id,peer:':1.100',method,body:{protocolVersion:1,...body}})}\n`);
  });
  const close=async()=>{
    if(child.exitCode!==null || child.signalCode!==null){lines.close();return;}
    const ended=new Promise<void>(resolve=>child.once('close',()=>resolve()));
    child.stdin.end();await ended;lines.close();
  };
  return {call,close};
}
test('restart preparation leaves an actual queue placement in flight after the initial acknowledged geometry',async()=>{
  const helper=start('crash');
  try {
    const context=await helper.call('CanaryContext',{});
    const handle=context.handle as Handle;
    await helper.call('Handshake',{backend:'kwin6.3'});
    const initial=await helper.call('NextCommand',{generation:handle.generation});
    const geometry=initial.command as {id:string;operation:string};
    expect(geometry.operation).toBe('geometry');
    await helper.call('Ack',{generation:handle.generation,id:geometry.id,outcome:'ok'});
    const next=await helper.call('NextCommand',{generation:handle.generation});
    expect(next.kind).toBe('command');
    expect((next.command as {operation:string}).operation).toBe('place');
    expect(JSON.parse(readFileSync(join(root,'restart-crash-metrics.json'),'utf8')).stage).toBe(1);
  } finally {await helper.close();}
});
test('fresh-process preparation advances generation and isolates stale-instance denial from fresh native work',async()=>{
  const first=start('crash');
  let old:Handle;
  try {old=(await first.call('CanaryContext',{})).handle as Handle;} finally {await first.close();}
  const fresh=start('fresh',old!);
  try {
    const handle=(await fresh.call('CanaryContext',{})).handle as Handle;
    expect(handle.instance).not.toBe(old!.instance);
    expect(handle.generation).toBeGreaterThan(old!.generation);
    await fresh.call('Handshake',{backend:'kwin6.3'});
    const stale=await fresh.call('NextCommand',{generation:handle.generation});
    const command=stale.command as {id:string;handle:Handle};
    expect(command.handle.instance).toBe(old!.instance);
    expect(command.handle.generation).toBe(handle.generation);
    await fresh.call('Ack',{generation:handle.generation,id:command.id,outcome:'denied'});
    const current=await fresh.call('NextCommand',{generation:handle.generation});
    const currentCommand=current.command as {id:string;handle:Handle};
    expect(currentCommand.handle).toEqual(handle);
    await fresh.call('Ack',{generation:handle.generation,id:currentCommand.id,outcome:'ok'});
    const metrics=JSON.parse(readFileSync(join(root,'restart-fresh-metrics.json'),'utf8'));
    expect(metrics.staleGenerationRejected).toBe(true);
    expect(metrics.outcomes).toEqual(['denied','ok']);
    expect(metrics.stage).toBe(2);
  } finally {await fresh.close();}
});

for(const cancellation of ['SIGTERM','SIGINT'] as const) {
  test(`outer ${cancellation} cancellation reaps detached child and grandchild sessions`,async()=>{
    const fixture=mkdtempSync(join(root,'supervision-'));
    const child=spawn('/usr/bin/python3',[new URL('./supervision-canary.py',import.meta.url).pathname,'outer',fixture],
      {env:{PATH:process.env.PATH,HOME:root},stdio:'ignore'});
    const closed=new Promise<void>((resolve,reject)=>{child.once('close',code=>code===0?resolve():reject(new Error('SUPERVISION_CANARY_FAILED')));});
    try {
      const deadline=Date.now()+3000;
      while(!existsSync(join(fixture,'ready'))&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
      expect(existsSync(join(fixture,'ready'))).toBe(true);
      const descendants=JSON.parse(readFileSync(join(fixture,'pids.json'),'utf8')) as number[];
      expect(descendants).toHaveLength(2);
      child.kill(cancellation);
      await closed;
      for(const pid of descendants)expect(()=>process.kill(pid,0)).toThrow();
    } finally {
      if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await closed;}
    }
  },6000);
}

test('native pipe success waits for bytes and binding diagnostics after the direct child exits',async()=>{
  let diagnostic='';
  // A grandchild retains both inherited pipes after the direct child exits.
  const delayed="setTimeout(()=>{process.stdout.write('final-public-bytes');process.stderr.write('public-v2-binding');},120)";
  const program=`const{spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(delayed)}],{stdio:['ignore',1,2]});process.exit(0);`;
  const bytes=await readNativePipe(process.execPath,['-e',program],{PATH:process.env.PATH,HOME:root},100,new AbortController().signal,chunk=>{diagnostic+=chunk.toString();});
  expect(Buffer.from(bytes).toString()).toBe('final-public-bytes');
  expect(diagnostic).toBe('public-v2-binding');
});

test('native pipe cap and cancellation remain immediate when a trusted child keeps its pipes open',async()=>{
  const env={PATH:process.env.PATH,HOME:root};
  const program="process.stdout.write('public-more-than-cap');setInterval(()=>{},10000)";
  const bytes=await readNativePipe(process.execPath,['-e',program],env,6,new AbortController().signal);
  expect(Buffer.from(bytes).toString()).toBe('public');
  const cancellation=new AbortController();
  const pending=readNativePipe(process.execPath,['-e','setInterval(()=>{},10000)'],env,20,cancellation.signal);
  cancellation.abort();
  await expect(pending).rejects.toThrow('CANCELLED');
});

for(const guard of ['valid','real-private-bus','external-home','external-config','external-data','external-cache','external-runtime','dconf','fallback-bus','abstract-bus','outside-bus','backend-override','symlink-config','shared-config','inherited-display']) {
  test(`private inner entry guard ${guard} is checked before settings or native calls`,async()=>{
    const child=spawn('/usr/bin/python3',[new URL('./guard-canary.py',import.meta.url).pathname,guard],{env:{PATH:process.env.PATH},stdio:['ignore','pipe','ignore']});
    let output='';child.stdout.on('data',(chunk:Buffer)=>{output+=chunk.toString();});
    const status=await new Promise<number|null>(resolve=>child.once('close',resolve));
    expect(status).toBe(0);
    const report=JSON.parse(output.trim().split('\n').at(-1)!);
    expect(report.nativeCalls).toBe(0);
    expect(report[['valid','real-private-bus'].includes(guard)?'validPrivateContext':'rejectedBeforeNative']).toBe(true);
  });
}

test('guest eligibility rejects root, non-Debian13 and an active input marker',async()=>{
  const code=`import sys;sys.path.insert(0,${JSON.stringify(new URL('.',import.meta.url).pathname)});from private_context import guest_allowed
release='ID=debian\\nVERSION_ID="13"\\n'
assert guest_allowed(release,1000,False)
assert not guest_allowed(release,0,False)
assert not guest_allowed(release,1000,True)
assert not guest_allowed('ID=ubuntu\\nVERSION_ID="13"\\n',1000,False)
assert not guest_allowed('ID=debian\\nVERSION_ID="12"\\n',1000,False)
print('bounded-platform-guard-passed')`;
  const child=spawn('/usr/bin/python3',['-c',code],{env:{PATH:process.env.PATH},stdio:'ignore'});
  expect(await new Promise<number|null>(resolve=>child.once('close',resolve))).toBe(0);
});
