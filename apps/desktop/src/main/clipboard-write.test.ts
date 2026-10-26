import { expect,it,vi } from 'vitest';
import { createClipboardWriter } from './clipboard-write.ts';
it('shares one native effect slot and never queues another builtin behind a pending write',async()=>{
  let finish!:()=>void;const clipboard={writeText:vi.fn< (text:string)=>Promise<void> >(()=>new Promise(resolve=>{finish=resolve;})),readText:vi.fn(async()=>'calculator result')};
  const copy=createClipboardWriter(clipboard,()=>true),first=copy('calculator result');
  expect(await copy('/synthetic/file.txt')).toBe('busy');expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith('calculator result');expect(clipboard.readText).not.toHaveBeenCalled();
  finish();expect(await first).toBe('written');clipboard.writeText.mockResolvedValue();clipboard.readText.mockResolvedValue('/synthetic/file.txt');expect(await copy('/synthetic/file.txt')).toBe('written');
});
it('declares unsupported without touching native clipboard and requires real readback',async()=>{
  const clipboard={writeText:vi.fn(async()=>{}),readText:vi.fn(async()=>'newer content')};expect(await createClipboardWriter(clipboard,()=>false)('fixture')).toBe('unsupported');expect(clipboard.writeText).not.toHaveBeenCalled();
  const copy=createClipboardWriter(clipboard,()=>true);await expect(copy('fixture')).rejects.toThrow('Copy could not be confirmed.');clipboard.readText.mockResolvedValue('fixture');expect(await copy('fixture')).toBe('written');
});
it('retains the slot until a native failure settles and releases it without replay',async()=>{
  let reject!:(error:Error)=>void;const clipboard={writeText:vi.fn< (text:string)=>Promise<void> >(()=>new Promise((_resolve,no)=>{reject=no;})),readText:vi.fn(async()=>'fixture')};
  const copy=createClipboardWriter(clipboard,()=>true),pending=copy('fixture');expect(await copy('second')).toBe('busy');reject(new Error('native failure'));await expect(pending).rejects.toThrow();expect(clipboard.writeText).toHaveBeenCalledTimes(1);clipboard.writeText.mockResolvedValue();expect(await copy('fixture')).toBe('written');
});
