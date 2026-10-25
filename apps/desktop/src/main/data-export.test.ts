import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as FsPromises from 'node:fs/promises';
import { saveDataExport } from './data-export.ts';
const injected=vi.hoisted(()=>({failSync:false,abort:undefined as AbortController|undefined}));
vi.mock('node:fs/promises',async original=>{
  const actual=await original<typeof FsPromises>();
  return {...actual,open:async(...args:Parameters<typeof actual.open>)=>{
    const handle=await actual.open(...args);
    if(String(args[0]).endsWith('/export.json')){
      const sync=handle.sync.bind(handle);
      handle.sync=async()=>{if(injected.failSync)throw new Error('Synthetic flush failure.');await sync();injected.abort?.abort();};
    }
    return handle;
  }};
});
const dirs:string[]=[];
afterEach(async()=>{injected.failSync=false;injected.abort=undefined;for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
async function directory(){const dir=await mkdtemp(join(tmpdir(),'linuxcast-export-'));dirs.push(dir);return dir;}
it('writes the complete approved export to a new private file',async()=>{
  const file=join(await directory(),'fixture.json'),value={schemaVersion:1,data:{category:'settings',records:[]}};
  await saveDataExport(file,value);expect(JSON.parse(await readFile(file,'utf8'))).toEqual(value);expect((await stat(file)).mode&0o777).toBe(0o600);
});
it('never replaces existing files or follows a chosen filename symlink',async()=>{
  const dir=await directory(),file=join(dir,'original.json'),link=join(dir,'link.json');await saveDataExport(file,{synthetic:'original'});await symlink(file,link);
  await expect(saveDataExport(file,{synthetic:'replacement'})).rejects.toThrow();await expect(saveDataExport(link,{synthetic:'replacement'})).rejects.toThrow();
  expect(JSON.parse(await readFile(file,'utf8'))).toEqual({synthetic:'original'});
});
it('rejects relative paths, symlinked parent directories and oversized exports',async()=>{
  const dir=await directory(),target=await directory(),link=join(dir,'parent');await symlink(target,link);
  await expect(saveDataExport('relative.json',{})).rejects.toThrow();await expect(saveDataExport(join(link,'file.json'),{})).rejects.toThrow();
  await expect(saveDataExport(join(dir,'large.json'),{synthetic:'x'.repeat(1024*1024)})).rejects.toThrow();
});

it('never publishes partial or cancelled JSON and removes its private staging files',async()=>{
  const dir=await directory(),file=join(dir,'export.json');injected.failSync=true;
  await expect(saveDataExport(file,{synthetic:'fixture'})).rejects.toThrow('Synthetic flush failure.');expect(await readdir(dir)).toEqual([]);
  injected.failSync=false;const abort=new AbortController();injected.abort=abort;
  await expect(saveDataExport(file,{synthetic:'fixture'},abort.signal)).rejects.toThrow();expect(await readdir(dir)).toEqual([]);
  injected.abort=undefined;await saveDataExport(file,{synthetic:'retry'});expect(JSON.parse(await readFile(file,'utf8'))).toEqual({synthetic:'retry'});
});
