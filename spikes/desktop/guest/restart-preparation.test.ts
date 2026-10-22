import {afterAll,beforeAll,expect,test} from 'vitest';
import {spawn,execFileSync} from 'node:child_process';
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
function startProcess(file:'restart-helper.mjs'|'queue-helper.mjs',extraEnv:Record<string,string>) {
  const child=spawn(process.execPath,[join(bundle,file)],{env:{PATH:process.env.PATH,HOME:root,
    LINUXCAST_S002_PRIVATE_GUEST:'1',LINUXCAST_S002_RESULT_DIR:root,LINUXCAST_S002_CANARY_PID:'100',...extraEnv},stdio:['pipe','pipe','ignore']});
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
function start(phase:'crash'|'fresh',old?:Handle) {
  return startProcess('restart-helper.mjs',{LINUXCAST_S002_RESTART_PHASE:phase,
    LINUXCAST_S002_GENERATION_BASE:String(old?.generation ?? 0),
    ...(old ? {LINUXCAST_S002_OLD_HANDLE:JSON.stringify(old)} : {})});
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

test('native failure diagnostics export only bounded synthetic configure records',()=>{
  const result=execFileSync('/usr/bin/python3',['-c',String.raw`
import json, pathlib, runpy, sys, tempfile
sys.path.insert(0,sys.argv[1])
probe=runpy.run_path(str(pathlib.Path(sys.argv[1])/'run-session.py'))['canary_progress']
entry=dict(width=280,height=160,clientWidth=280,clientHeight=160,maximized=False,fullscreen=False,iconified=False,resizable=True)
with tempfile.TemporaryDirectory(dir=sys.argv[2]) as directory:
    root=pathlib.Path(directory)
    file=root/'private-canary.log'
    assert probe(root) is None
    valid={'ownConfigureEvents':[entry]}
    file.write_text('unstructured private diagnostic must never escape\n'+json.dumps(valid)+'\n')
    assert probe(root)==valid
    invalid=[{'ownConfigureEvents':[dict(entry,caption='private')]},
             {'ownConfigureEvents':[dict(entry,width=True)]},
             {'ownConfigureEvents':[dict(entry,clientHeight=16385)]},
             {'ownConfigureEvents':[entry]*9},
             {'ownConfigureEvents':[entry],'error':'private'}]
    for value in invalid:
        file.write_text(json.dumps(value)+'\n')
        assert probe(root) is None
    file.write_text('x'*20000+'\n'+json.dumps(valid)+'\n')
    assert probe(root)==valid
print('bounded-own-configure-schema-passed')
`,new URL('.',import.meta.url).pathname,root],{encoding:'utf8',timeout:5000,maxBuffer:16384});
  expect(result.trim()).toBe('bounded-own-configure-schema-passed');
});

test('debugger filtering retains fixed categories and rejects raw frame details',()=>{
  const result=execFileSync('/usr/bin/python3',['-c',String.raw`
import pathlib,runpy,sys
module=runpy.run_path(str(pathlib.Path(sys.argv[1])/'debugger_filter.py'))
assert module['module_category']('/private/location/libQt6Qml.so.6')=='QT_QML'
assert module['module_category']('/private/libkwin.so.6.3.6')=='KWIN'
assert module['module_category']('/private/application-name')=='UNKNOWN'
assert module['function_category']('KWin::Window::moveResize(private args)')=='KWIN_MOVE_RESIZE'
assert module['function_category']('unrecognized private function 0x1234')=='UNKNOWN'
for prefix, category in [('QPainter::','QT_PAINTER'),('QRasterPaintEngine::','QT_RASTER_PAINT_ENGINE'),
                         ('QPaintEngine::','QT_PAINT_ENGINE'),('QImage::','QT_IMAGE'),('QRegion::','QT_REGION'),
                         ('QBackingStore::','QT_BACKING_STORE'),('QOpenGLContext::','QT_OPENGL_CONTEXT'),
                         ('QPlatformWindow::','QT_PLATFORM_WINDOW'),('QSpanData::','QT_RASTER_DATA')]:
    assert module['function_category'](prefix+'privateMethod(private arguments)')==category

parse=module['parse_report']
valid={'signal':'SIGSEGV','frames':[{'module':'KWIN','function':'KWIN_MOVE_RESIZE'}],'inspectionFailed':False}
assert parse(valid)==valid
for value in [dict(valid,raw='private'),dict(valid,signal='private signal'),dict(valid,inspectionFailed=0),
              dict(valid,frames=valid['frames']*17),
              dict(valid,frames=[{'module':'KWIN','function':'UNKNOWN','address':'0x1234'}]),
              dict(valid,frames=[{'module':'/private/library','function':'UNKNOWN'}]),
              dict(valid,frames=[{'module':'KWIN','function':'private(args)'}])]:
    assert parse(value) is None
print('bounded-debugger-filter-passed')
`,new URL('.',import.meta.url).pathname],{encoding:'utf8',timeout:5000,maxBuffer:16384});
  expect(result.trim()).toBe('bounded-debugger-filter-passed');
});


async function exerciseQueueFixture(control:boolean) {
  const helper=startProcess('queue-helper.mjs',control ? {LINUXCAST_S002_READ_ONLY_CONTROL:'1'} : {});
  try {
    const context=await helper.call('CanaryContext',{});
    const handle=context.handle as Handle;
    await helper.call('Handshake',{backend:'kwin6.3'});
    const operations:string[]=[];
    for(let slot=0;slot<3;slot++) {
      const frame=await helper.call('NextCommand',{generation:handle.generation});
      const command=frame.command as {id:string;operation:string;rect?:unknown};
      operations.push(command.operation);
      if(!control && slot===1) expect(command.rect).toEqual({x:32,y:32,width:400,height:240});
      await helper.call('Ack',{generation:handle.generation,id:command.id,outcome:'ok'});
    }
    return {helper,handle,operations};
  } catch(error) {await helper.close();throw error;}
}
const fixtureInitial={x:0,y:0,width:327,height:197};
const fixtureTarget={x:32,y:32,width:400,height:240};
function fixtureObservation(control:boolean) {
  return {reason:'COMPANION_RESTARTED',action:'Reload the explicit test script',
    observations:control ? [fixtureInitial,fixtureInitial,fixtureInitial] : [fixtureInitial,fixtureTarget],
    requested:control ? null : fixtureTarget,nativePlacementAttempted:!control};
}
test('read-only queue control retains three command/ack slots and cannot report ordinary acceptance',async()=>{
  const {helper,handle,operations}=await exerciseQueueFixture(true);
  try {
    expect(operations).toEqual(['geometry','geometry','geometry']);
    const terminal=await helper.call('NextCommand',{generation:handle.generation});
    expect(terminal).toEqual({kind:'reconnect',reason:'CANARY_COMPLETED'});
    const body=fixtureObservation(true);
    const result=await helper.call('CanaryObservation',body);
    expect(result).toMatchObject({kind:'diagnostic',state:'diagnostic',diagnosticStatus:'READ_ONLY_CONTROL_COMPLETE',
      nativePlacementAttempted:false,placementAcceptanceEstablished:false,clipboardAcceptanceEstablished:false,
      nativeGeometryStable:true,pollingStopped:true,transportAckCount:3,outcomes:['ok','ok','ok']});
  } finally {await helper.close();}
});
test('ordinary queue fixture retains exact placement and fails a wrong observed target',async()=>{
  const {helper,handle,operations}=await exerciseQueueFixture(false);
  try {
    expect(operations).toEqual(['geometry','place','geometry']);
    await helper.call('NextCommand',{generation:handle.generation});
    const body=fixtureObservation(false);
    const result=await helper.call('CanaryObservation',body);
    expect(result).toMatchObject({kind:'observed',state:'passed',nativePlacementAttempted:true,targetApplied:true,transportAckCount:3});
    const wrong=await helper.call('CanaryObservation',{...body,observations:[fixtureInitial,{...fixtureTarget,width:399}]});
    expect(wrong).toMatchObject({state:'failed',targetApplied:false});
  } finally {await helper.close();}
});
test('control fixture rejects premature stop, native placement and geometry drift as diagnostic failure',async()=>{
  const {helper,handle}=await exerciseQueueFixture(true);
  try {
    const body=fixtureObservation(true);
    expect(await helper.call('CanaryObservation',body)).toMatchObject({state:'diagnostic',diagnosticStatus:'READ_ONLY_CONTROL_FAILED',pollingStopped:false});
    await helper.call('NextCommand',{generation:handle.generation});
    expect(await helper.call('CanaryObservation',{...body,nativePlacementAttempted:true})).toMatchObject({diagnosticStatus:'READ_ONLY_CONTROL_FAILED',nativePlacementAttempted:true});
    expect(await helper.call('CanaryObservation',{...body,observations:[fixtureInitial,fixtureInitial,fixtureTarget]})).toMatchObject({diagnosticStatus:'READ_ONLY_CONTROL_FAILED',nativeGeometryStable:false});
    expect(await helper.call('CanaryObservation',{...body,nativePlacementAttempted:'false'})).toEqual({kind:'error',reason:'INVALID_PRIVATE_GUEST_REQUEST'});
  } finally {await helper.close();}
});

test('post-stop fixture waits the same bounded quiet interval without control calls and fails drift or exit',()=>{
  const result=execFileSync('/usr/bin/python3',['-c',String.raw`
import pathlib,runpy,sys,copy
module=runpy.run_path(str(pathlib.Path(sys.argv[1])/'post_stop.py'))
observe=module['observe_post_stop'];counts=module['METHOD_COUNTS']
valid=dict(authenticatedRequests=dict(counts),replies=dict(counts),nodeExited=False)
class Clock:
    now=0.0
    def read(self): return self.now
    def pause(self,seconds): self.now+=seconds
class Child:
    def __init__(self,poll): self.poll=poll
for scenario in ('quiet','traffic','process','node','initial-invalid','empty'):
    clock=Clock()
    def wire():
        value=copy.deepcopy(valid)
        if scenario=='traffic' and clock.now>=1: value['authenticatedRequests']['NextCommand']+=1
        if scenario=='node' and clock.now>=1: value['nodeExited']=True
        if scenario=='initial-invalid': value['replies']['Ack']=2
        return value
    children=[Child(lambda:1 if scenario=='process' and clock.now>=1 else None) for _ in range(3)]
    result=observe([] if scenario=='empty' else children,wire,clock.read,clock.pause)
    assert result['seconds']==5.0
    if scenario=='quiet':
        assert result['completed'] and result['allOwnProcessesAlive'] and result['controlTrafficStable']
        assert 5<=clock.now<=5.001
    else:
        assert not result['completed'] and clock.now<5
        if scenario=='process': assert not result['allOwnProcessesAlive']
        if scenario in ('traffic','node'): assert not result['controlTrafficStable']
print('bounded-post-stop-fixture-passed')
`,new URL('.',import.meta.url).pathname],{encoding:'utf8',timeout:5000,maxBuffer:16384});
  expect(result.trim()).toBe('bounded-post-stop-fixture-passed');
});
test('read-only control flags reject other backends and restart before any native call',()=>{
  const result=execFileSync('/usr/bin/python3',['-c',String.raw`
import pathlib,runpy,sys
from unittest.mock import patch
sys.path.insert(0,sys.argv[1])
module=runpy.run_path(str(pathlib.Path(sys.argv[1])/'run-session.py'))
main=module['main'];context=module['_context']
for backend,extra in [('gnome-wayland',[]),('gnome-x11',[]),('kwin-x11',[]),('kwin-wayland',['--restart-scenario'])]:
    with patch.object(context,'guest_allowed',return_value=True),patch.object(sys,'argv',['run-session.py',backend,'--private-guest','--read-only-control',*extra]),patch('subprocess.Popen',side_effect=AssertionError('NATIVE_CALL_FORBIDDEN')):
        assert main()==3
print('bounded-read-only-flag-guard-passed')
`,new URL('.',import.meta.url).pathname],{encoding:'utf8',timeout:5000,maxBuffer:16384});
  expect(result.trim().endsWith('bounded-read-only-flag-guard-passed')).toBe(true);
});
