import test from 'node:test';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { STEPS, SCOPE, runControl, publicResult, pairProof, negativeProof } from './core.mjs';
import { verifySources, loadProduction } from './production.mjs';
import { validateContext } from './control.mjs';
const sourceRoot=process.argv[2];
if (!sourceRoot) throw new Error('FIXTURE_SOURCE_ROOT');
const handle=xid=>{const buffer=Buffer.alloc(4);buffer.writeUInt32LE(xid);return buffer.toString('hex');};
const primary={pid:101,xid:123,handle:handle(123)},aux={pid:101,xid:124,handle:handle(124)};
const negative={rejected:true,helperCommands:0,newReplies:0,traceState:'request-written',originalBindingPreserved:true};
const pair={sameProcess:true,twoManagedTargets:true,distinctResources:true};
function ioFixture(fail) {
  const events=[];
  const action=(name,value)=>async()=>{events.push(name);if(fail===name)throw new Error('synthetic-private-canary');return value;};
  return {events,io:{capturePrimary:action('capture',primary),createAuxiliary:action('auxiliary',aux),verifyPair:action('pair',pair),
    positive:action('positive'),negative:action('negative',negative),quit:action('quit',0),cleanup:action('cleanup')}};
}
test('exact control branch completes only selected control steps and always remains incomplete',async()=>{
  const {io,events}=ioFixture();const result=await runControl(io);
  assert.deepEqual(events,['capture','auxiliary','capture','pair','positive','negative','quit','cleanup']);
  assert.deepEqual(result,{...SCOPE,diagnosticOutcome:'complete',completedSteps:STEPS,failedStage:null});
  assert(!JSON.stringify(result).includes('101'));assert(!JSON.stringify(result).includes(handle(123)));
});
for(const phase of ['capture','auxiliary','pair','positive','negative','quit','cleanup'])test(`actual control branch stops on ${phase} and cleans up once`,async()=>{
  const {io,events}=ioFixture(phase);const result=await runControl(io);
  assert.equal(result.diagnosticOutcome,'failed');assert.equal(events.filter(item=>item==='cleanup').length,1);
  assert(!JSON.stringify(result).includes('synthetic-private'));
  const index=events.indexOf(phase);if(phase!=='cleanup')assert.deepEqual(events.slice(index+1),['cleanup']);
});
for(const change of ['same-xid','other-pid','highbits','invalid-handle','wide-handle','zero-handle','primary-swapped'])test(`invalid ${change} cannot reach native pair metadata`,async()=>{
  const {io,events}=ioFixture();
  if(change==='primary-swapped'){let count=0;io.capturePrimary=async()=>{events.push('capture');return ++count===1?primary:aux;};}
  else io.createAuxiliary=async()=>{events.push('auxiliary');return {...aux,...({'same-xid':primary,'other-pid':{pid:999},highbits:{xid:1<<30},'invalid-handle':{handle:'synthetic-private-canary'},'wide-handle':{handle:'7b00000000000000'},'zero-handle':{xid:0,handle:'00000000'}}[change])};};
  const result=await runControl(io);assert.equal(result.diagnosticOutcome,'failed');assert(!events.includes('pair'));assert(!events.includes('positive'));
});
for(const field of ['helperCommands','newReplies','rejected','originalBindingPreserved','traceState'])test(`negative proof rejects forged ${field}`,()=>{
  assert.throws(()=>negativeProof({...negative,[field]:typeof negative[field]==='number'?true:'private-canary'}));
});
test('strict output rejects private fields, full pass promotion, omitted/reordered steps and forged native scope',()=>{
  const value={...SCOPE,diagnosticOutcome:'complete',completedSteps:STEPS,failedStage:null};
  for(const row of [{...value,pid:101},{...value,private:{value:'private-canary'}},{...value,status:'passed-bounded-native-probe'},
    {...value,physicalDesktopMatrixEstablished:true},{...value,fullAcceptanceEstablished:true},{...value,completedSteps:STEPS.slice(1)},
    {...value,completedSteps:[...STEPS].reverse()},{...value,diagnosticOutcome:'complete',failedStage:'quit-confirmed'}])assert.throws(()=>publicResult(row));
  assert.throws(()=>pairProof({...pair,xid:123}));assert.throws(()=>pairProof({...pair,twoManagedTargets:1}));
  assert.throws(()=>pairProof({'distinctResources|sameProcess':true,twoManagedTargets:true}));
});
test('private guard gets no unknown values and rejects before any native loader',()=>{
  let calls=0;
  assert.throws(()=>validateContext(sourceRoot,{SECRET_CANARY:'synthetic-private-canary',LINUXCAST_S001_BACKEND:'kwin-x11'},(exe,args,options)=>{
    calls++;assert.equal(exe,'/usr/bin/python3');assert.deepEqual(args,['-I',join(sourceRoot,'spikes/launcher/tests/native-session/private.py'),'--driver','kwin-x11']);
    assert.equal(JSON.parse(options.input).SECRET_CANARY,'');assert(!options.input.includes('synthetic-private-canary'));return {status:3,stdout:''};
  }));assert.equal(calls,1);
});
test('authority verifies actual frozen runtime without starting native code',()=>assert.equal(verifySources(sourceRoot),join(sourceRoot,'spikes/launcher/tests/native-session')));
for(const changed of ['source','tokens','desktop','symlink'])test(`source preflight rejects ${changed} before any production extraction/native action`,()=>{
  const root=mkdtempSync(join(tmpdir(),'linuxcast-control-source-fixture-'));
  try {
    const authority=JSON.parse(readFileSync(new URL('./runtime-authority.json',import.meta.url)));
    // Resolve relative inputs against the actual source directory, never cwd.
    const paths=Object.keys(authority.sourceSha256).map(name=>resolve(sourceRoot,'spikes/launcher/tests/native-session',name).slice(sourceRoot.length+1));
    paths.push('docs/design/tokens.json','spikes/launcher/resources/io.github.ianwijma.Linuxcast.desktop');
    for(const name of paths){mkdirSync(dirname(join(root,name)),{recursive:true});copyFileSync(join(sourceRoot,name),join(root,name));}
    const target=join(root,changed==='tokens'?'docs/design/tokens.json':changed==='desktop'?'spikes/launcher/resources/io.github.ianwijma.Linuxcast.desktop':'spikes/launcher/tests/native-session/owned-x11.py');
    if(changed==='symlink'){rmSync(target);symlinkSync(join(sourceRoot,'spikes/launcher/tests/native-session/owned-x11.py'),target);}
    else writeFileSync(target,'synthetic-private-canary');
    assert.throws(()=>verifySources(root));
  }finally{rmSync(root,{recursive:true});}
});
test('actual extracted production positive and swapped-binding negative do not query the auxiliary candidate',async()=>{
  const require=createRequire(join(sourceRoot,'package.json'));const {expect}=require('@playwright/test');const commands=[];
  const empty={count:0,identityMatches:false,nativeBackend:'unsupported',focused:false,hidden:true,geometry:null,workArea:null};
  const own={count:1,identityMatches:true,nativeBackend:'x11',focused:false,hidden:false,geometry:{x:32,y:32,width:720,height:429},workArea:{x:0,y:0,width:1280,height:900}};
  class Child extends EventEmitter {
    exitCode=null;signalCode=null;stdout=new EventEmitter();stdin=new EventEmitter();
    constructor(){super();this.stdin.write=(encoded,done)=>{const command=JSON.parse(encoded);commands.push(command.command);done();
      globalThis.queueMicrotask(()=>this.stdout.emit('data',Buffer.from(JSON.stringify(command.command==='bind'?{bound:true}:{request:command.request,launcher:own,decoy:empty,decoyActivationIssued:false})+'\n')));};}
    kill(){this.signalCode='SIGKILL';globalThis.queueMicrotask(()=>this.emit('close',null));return true;}
  }
  const production=await loadProduction(sourceRoot,expect,()=>new Child());
  const page={url:()=> 'linuxcast://launcher/index.html',evaluate:async()=>({runtime:{sandboxed:true,contextIsolated:true},process:'undefined',require:'undefined'})};
  const win={isDestroyed:()=>false,getNativeWindowHandle:()=>Buffer.from(primary.handle,'hex'),webContents:{isDestroyed:()=>false,getURL:page.url,
    getLastWebPreferences:()=>({sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true})}};
  const app={process:()=>({pid:101,exitCode:null,signalCode:null}),browserWindow:async requested=>{assert.equal(requested,page);return {evaluate:async callback=>callback(win),dispose:async()=>{}};},
    evaluate:async()=>({pid:101,electron:'45.0.0',chrome:'156.0.8078.48',platform:'linux',arch:'x64',ozone:'x11',noSandbox:false})};
  production.api.configure(app,page);assert.equal((await production.api.positive()).launcher.count,1);
  assert.deepEqual(globalThis.structuredClone(await production.api.negative(primary,aux)),negative);
  assert.deepEqual(commands,['bind','observe']);production.api.abort();
});
test('production Python pair fixtures stay synthetic and reject foreign/retired metadata',()=>{
  const child=spawnSync('/usr/bin/python3',['-B',new URL('./pair-fixture.py',import.meta.url).pathname,sourceRoot],{encoding:'utf8',timeout:5000,env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}});
  assert.equal(child.status,0,child.stderr);assert(!child.stdout.includes('synthetic-private'));
});
test('nonzero Quit cannot complete the control or imply lifecycle evidence',async()=>{
  const {io}=ioFixture();io.quit=async()=>1;const result=await runControl(io);
  assert.equal(result.diagnosticOutcome,'failed');assert.equal(result.failedStage,'quit-confirmed');assert.equal(result.selectedLifecycleEstablished,false);
});
test('missing native entry arguments produce fixed unavailable evidence before any session action',()=>{
  const child=spawnSync(process.execPath,[new URL('./control.mjs',import.meta.url).pathname],{encoding:'utf8',timeout:5000,env:{PATH:'/usr/bin:/bin'}});
  assert.equal(child.error,undefined,child.error?.code);
  assert.equal(child.status,3);assert.deepEqual(JSON.parse(child.stdout),{kind:SCOPE.kind,status:'unavailable',reason:'CONTROL_ENTRY_OR_RUNTIME_REJECTED',
    physicalDesktopMatrixEstablished:false,fullAcceptanceEstablished:false});
});

test('actual control Quit and cleanup retain the child and never query a closed dispatcher',async()=>{
  const text=readFileSync(new URL('./control.mjs',import.meta.url),'utf8');
  const cleanupBegin=text.indexOf('const cleanup = async () => {'),cleanupEnd=text.indexOf('  let result;',cleanupBegin);
  const quitBegin=text.indexOf('quit: () => within(async () => {'),quitEnd=text.indexOf('      cleanup,',quitBegin);
  assert(cleanupBegin>=0 && cleanupEnd>cleanupBegin && quitBegin>=0 && quitEnd>quitBegin);
  for(const mode of ['quit-then-cleanup','cleanup-only','unconfirmed-quit']){
    let closes=0,aborts=0;
    const child={exitCode:null,signalCode:null};
    const app={process(){assert.fail('CLOSED_DISPATCHER_ACCESS');},async close(){closes++;if(mode!=='unconfirmed-quit')child.exitCode=0;}};
    const context={app,child,api:{abort(){aborts++;}},within:async operation=>operation(),quitAttempted:false,cleanupAttempted:false};
    runInNewContext(text.slice(cleanupBegin,cleanupEnd)+'\nglobalThis.cleanup=cleanup; globalThis.quit=({'+text.slice(quitBegin,quitEnd)+'}).quit;',context);
    if(mode!=='cleanup-only')await context.quit();
    if(mode==='unconfirmed-quit')await assert.rejects(context.cleanup(),/CONTROL_QUIT_UNCONFIRMED/);
    else await context.cleanup();
    assert.equal(closes,1);assert.equal(aborts,1);assert.equal(context.quitAttempted,true);assert.equal(context.cleanupAttempted,true);
  }
});
