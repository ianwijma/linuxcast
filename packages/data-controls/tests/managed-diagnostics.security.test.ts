import { afterEach,expect,it,vi } from 'vitest';
import { mkdtemp,mkdir,readdir,readFile,rm,symlink,writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ManagedDiagnostics } from '../src/managed-diagnostics.ts';
import { LocalDiagnostics } from '../src/diagnostics.ts';
const roots:string[]=[],services:ManagedDiagnostics[]=[];
afterEach(async()=>{try{await Promise.all(services.splice(0).map(service=>service.close()));await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));}finally{vi.useRealTimers();}});
async function fixture(){const root=await mkdtemp(join(tmpdir(),'linuxcast-managed-diagnostics-'));roots.push(root);return root;}
function service(root:string){const instance=new ManagedDiagnostics(root);services.push(instance);return instance;}
it('exports only the selected real metadata category and preserves other data across reset/reopen',async()=>{
  const root=await fixture(),seed=await LocalDiagnostics.open(root);
  await seed.append('tool-diagnostics',{component:'workflow',event:'cancelled',reason:'interrupted'});await seed.close();
  await writeFile(join(root,'keep.txt'),'public unrelated fixture',{mode:0o600});
  const live=service(root);
  expect(await live.export('application-logs')).toMatchObject({format:'linuxcast-diagnostics-json',encrypted:false,data:{category:'application-logs',records:[{component:'main',event:'started'}]}});
  const before=await live.export('tool-diagnostics');
  await live.clear('application-logs');expect(await live.export('application-logs')).toMatchObject({data:{records:[]}});
  expect(await live.export('tool-diagnostics')).toEqual(before);expect(await readFile(join(root,'keep.txt'),'utf8')).toBe('public unrelated fixture');
  await live.close();const reopened=service(root);expect(await reopened.export('tool-diagnostics')).toEqual(before);
  await reopened.clear('tool-diagnostics');expect(await reopened.export('application-logs')).toMatchObject({data:{records:[{component:'main',event:'started'}]}});
});
it('keeps a corrupt category resettable without exporting its raw content or blocking the other category',async()=>{
  const root=await fixture(),seed=await LocalDiagnostics.open(root);
  await seed.append('application-logs',{component:'main',event:'started'});await seed.close();
  const [name]=await readdir(join(root,'diagnostics'));
  await writeFile(join(root,'diagnostics',name!),JSON.stringify({private:'SYNTHETIC_PRIVATE_CANARY'}),{mode:0o600});
  const live=service(root);await expect(live.export('application-logs')).rejects.toThrow('Diagnostics unavailable.');
  expect(await live.export('tool-diagnostics')).toMatchObject({data:{records:[]}});
  await live.clear('application-logs');expect(await live.export('application-logs')).toMatchObject({data:{records:[]}});
});
it('does not write through an unsafe state root or symlink',async()=>{
  const root=await fixture(),target=join(root,'target');await mkdir(target,{mode:0o700});
  await symlink(target,join(root,'link'));
  await expect(service(join(root,'link')).export('application-logs')).rejects.toThrow('Diagnostics unavailable.');
  expect(await readdir(target)).toEqual([]);
  await mkdir(join(root,'public'),{mode:0o755});
  await expect(service(join(root,'public')).clear('application-logs')).rejects.toThrow('Diagnostics unavailable.');
  expect(await readdir(join(root,'public'))).toEqual([]);
});
it('preserves category data on cancellation and settles close during startup before allowing another owner',async()=>{
  const root=await fixture(),live=service(root);
  const before=await live.export('application-logs'),abort=new AbortController();abort.abort();
  await expect(live.clear('application-logs',abort.signal)).rejects.toThrow();
  expect(await live.export('application-logs')).toEqual(before);
  const closing=live.close();expect(live.close()).toBe(closing);await closing;
  await expect(live.export('application-logs')).rejects.toThrow('Diagnostics unavailable.');
  const early=service(join(root,'early'));await early.close();
  await expect(early.clear('application-logs')).rejects.toThrow('Diagnostics unavailable.');
  const replacement=service(join(root,'early'));expect(await replacement.export('application-logs')).toMatchObject({data:{records:[{event:'started'}]}});
});
it('fails a complete oversized export without truncation or deleting stored diagnostics',async()=>{
  const root=await fixture(),live=service(root);await live.export('application-logs');
  for(let index=0;index<6500;index++){
    const id=randomUUID();writeFileSync(join(root,'diagnostics',`tool-diagnostics-${id}.json`),JSON.stringify({schemaVersion:1,id,at:new Date().toISOString(),category:'tool-diagnostics',component:'workflow',event:'completed',durationMs:123}),{mode:0o600});
  }
  await expect(live.export('tool-diagnostics')).rejects.toEqual({reasonCode:'export-too-large'});
  expect((await readdir(join(root,'diagnostics'))).filter(name=>name.startsWith('tool-diagnostics-'))).toHaveLength(6500);
},15000);
it('expires both categories during idle residency after clock advance and cancels maintenance on close',async()=>{
  vi.useFakeTimers({toFake:['Date','setTimeout','clearTimeout']});
  const root=await fixture(),seed=await LocalDiagnostics.open(root);
  await seed.append('tool-diagnostics',{component:'workflow',event:'completed'});await seed.close();
  const live=service(root);await live.export('application-logs');
  vi.setSystemTime(Date.now()+15*86400000);await vi.advanceTimersByTimeAsync(60_000);
  await vi.waitFor(async()=>expect((await readdir(join(root,'diagnostics'))).filter(name=>name.startsWith('application-logs-'))).toEqual([]));
  expect((await readdir(join(root,'diagnostics'))).filter(name=>name.startsWith('tool-diagnostics-'))).toHaveLength(1);
  vi.setSystemTime(Date.now()+16*86400000);await vi.advanceTimersByTimeAsync(60_000);
  await vi.waitFor(async()=>expect(await readdir(join(root,'diagnostics'))).toEqual([]));
  await live.close();expect(vi.getTimerCount()).toBe(0);
});
it('rejects a FIFO record without hanging maintenance, export, reset or shutdown',async()=>{
  const root=await fixture(),live=service(root);await live.export('application-logs');
  execFileSync('mkfifo',['-m','600',join(root,'diagnostics',`tool-diagnostics-${randomUUID()}.json`)]);
  await expect(live.export('tool-diagnostics')).rejects.toThrow('Diagnostics unavailable.');
  await live.clear('tool-diagnostics');expect(await live.export('tool-diagnostics')).toMatchObject({data:{records:[]}});
  await live.close();
},3000);
