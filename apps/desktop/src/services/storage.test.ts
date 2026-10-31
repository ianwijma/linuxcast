import { afterEach,expect,it,vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { STORAGE_SCHEMA_VERSION } from '@linuxcast/storage';
const utility=vi.hoisted(()=>({fork:vi.fn()}));
vi.mock('electron',()=>({utilityProcess:{fork:utility.fork}}));
import { startStorage } from './storage.ts';
const children:EventEmitter[]=[];
afterEach(()=>{for(const child of children.splice(0))child.emit('exit',0);vi.restoreAllMocks();});
function fixture(){
  const child=Object.assign(new EventEmitter(),{postMessage:vi.fn(),kill:vi.fn(()=>true)});children.push(child);utility.fork.mockReturnValue(child);
  vi.spyOn(console,'error').mockImplementation(()=>{});
  const service=startStorage('/fixed/resources','/fixed/private-data','synthetic-build');
  const ready=()=>child.emit('message',{kind:'ready',protocolVersion:1,schemaVersion:STORAGE_SCHEMA_VERSION});
  return {child,service,ready};
}
it('reports initial readiness and typed owner readiness without duplicate grants',()=>{
  const f=fixture(),states:boolean[]=[];f.service.onReadiness(state=>states.push(state));expect(states).toEqual([false]);
  f.ready();f.ready();expect(states).toEqual([false,true]);expect(f.service.isReady()).toBe(true);
});
it.each(['exit','unavailable'] as const)('invalidates synchronously on owner %s',event=>{
  const f=fixture(),states:boolean[]=[];f.service.onReadiness(state=>states.push(state));f.ready();
  if(event==='exit')f.child.emit('exit',1);else f.child.emit('message',{kind:'unavailable'});
  expect(states).toEqual([false,true,false]);expect(f.service.isReady()).toBe(false);
});
it('denies at shutdown entry and prevents unsubscribed/throwing listeners from vetoing others',async()=>{
  const f=fixture(),states:boolean[]=[];f.service.onReadiness(()=>{throw new Error('SYNTHETIC_PRIVATE_ERROR');});
  const remove=f.service.onReadiness(state=>states.push(state));f.ready();const stopping=f.service.stop();
  expect(f.service.isReady()).toBe(false);expect(states).toEqual([false,true,false]);remove();f.child.emit('exit',0);await stopping;
  expect(states).toEqual([false,true,false]);
});
it('reentrant shutdown cannot send stale readiness to later listeners',async()=>{
  const f=fixture(),states:boolean[]=[];let stopping:Promise<void>|undefined;
  f.service.onReadiness(ready=>{if(ready)stopping=f.service.stop();});f.service.onReadiness(state=>states.push(state));f.ready();
  expect(states).not.toContain(true);expect(f.service.isReady()).toBe(false);f.child.emit('exit',0);await stopping;
});
it('does not notify a listener removed by another callback from the same batch',()=>{
  const f=fixture(),states:boolean[]=[];let remove=()=>{};
  f.service.onReadiness(ready=>{if(ready)remove();});remove=f.service.onReadiness(state=>states.push(state));f.ready();expect(states).toEqual([false]);
});
