import { constants } from 'node:fs';
import { link, lstat, mkdir, open, rmdir, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MAX_ENVELOPE_BYTES } from '@linuxcast/contracts';
/** Native-dialog path only. Publish complete JSON exclusively from private staging;
 * neither an existing destination nor an incomplete/cancelled export is replaced. */
export async function saveDataExport(path:string,value:unknown,signal?:AbortSignal):Promise<void> {
  const text=JSON.stringify(value)+'\n';signal?.throwIfAborted();
  if(!isAbsolute(path)||!basename(path)||['.','..'].includes(basename(path))||Buffer.byteLength(text)>MAX_ENVELOPE_BYTES)throw new Error('Export unavailable.');
  const parent=await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  const staging=`/proc/self/fd/${parent.fd}/.linuxcast-export-${randomUUID()}`;
  let stage:Awaited<ReturnType<typeof open>>|undefined;
  try {
    await mkdir(staging,{mode:0o700});stage=await open(staging,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    const location=`/proc/self/fd/${stage.fd}/export.json`;
    const file=await open(location,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try {await file.writeFile(text,'utf8');await file.sync();}finally{await file.close();}
    signal?.throwIfAborted();
    // Hard-link publication is atomic and fails if the user-selected name exists.
    await link(location,`/proc/self/fd/${parent.fd}/${basename(path)}`);await parent.sync();
  } finally {
    if(stage){
      const owned=await stage.stat();
      await unlink(`/proc/self/fd/${stage.fd}/export.json`).catch(()=>{});
      await stage.close();
      const current=await lstat(staging).catch(()=>undefined);
      if(current?.dev===owned.dev&&current.ino===owned.ino)await rmdir(staging).catch(()=>{});
    }
    await parent.close();
  }
}
