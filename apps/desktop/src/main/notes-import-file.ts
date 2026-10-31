import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import type {FileHandle} from 'node:fs/promises';
import {NOTE_MARKDOWN_MAX_BYTES} from '../../../../packages/notes/src/markdown.ts';
/** Only a native-chooser path reaches here. Never resolve a renderer-supplied path. */
export async function readNoteMarkdownFile(path:string,signal:AbortSignal):Promise<string>{
 let parent:FileHandle|undefined,file:FileHandle|undefined;
 try{
  if(typeof path!=='string'||!path.startsWith('/')||path.includes('\0')||Buffer.byteLength(path)>4096)throw new Error('Invalid selected file.');
  const parts=path.split('/');if(parts.slice(1).some(part=>!part||part==='.'||part==='..'))throw new Error('Invalid selected file.');
  signal.throwIfAborted();parent=await open('/',constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  for(const part of parts.slice(1,-1)){signal.throwIfAborted();const previous=parent;parent=await open(`/proc/self/fd/${previous.fd}/${part}`,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);await previous.close();}
  signal.throwIfAborted();file=await open(`/proc/self/fd/${parent.fd}/${parts.at(-1)!}`,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const before=await file.stat({bigint:true});if(!before.isFile()||before.size<=0n||before.size>BigInt(NOTE_MARKDOWN_MAX_BYTES))throw new Error('Unsupported selected file.');
  const buffer=Buffer.alloc(NOTE_MARKDOWN_MAX_BYTES+1);let total=0;
  while(total<buffer.length){signal.throwIfAborted();const {bytesRead}=await file.read(buffer,total,Math.min(65536,buffer.length-total),total);if(!bytesRead)break;total+=bytesRead;}
  signal.throwIfAborted();const after=await file.stat({bigint:true});
  if(total!==Number(before.size)||total>NOTE_MARKDOWN_MAX_BYTES||after.size!==before.size||after.mtimeNs!==before.mtimeNs||after.ctimeNs!==before.ctimeNs)throw new Error('Selected file changed.');
  return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,total));
 }finally{await file?.close();await parent?.close();}
}
