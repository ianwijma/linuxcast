import {constants} from 'node:fs';
import type {Stats} from 'node:fs';
import {link,lstat,mkdir,open,rmdir,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {NOTE_MARKDOWN_MAX_BYTES} from '../../../../packages/notes/src/markdown.ts';
export class NoteExportFileError extends Error{
 readonly reason:'exists'|'unavailable';readonly effectOutcome:'not-dispatched'|'unknown';
 constructor(reason:'exists'|'unavailable',effectOutcome:'not-dispatched'|'unknown'){super('Note export unavailable.');this.reason=reason;this.effectOutcome=effectOutcome;}
}
/** Native-dialog authority only. Every ancestor is opened from the last held
 * directory FD with O_NOFOLLOW; later renames never redirect staging/publication. */
export async function saveNoteMarkdown(path:string,text:string,signal:AbortSignal):Promise<void>{
 const parts=path.split('/');if(!path.startsWith('/')||parts.slice(1).some(part=>!part||part==='.'||part==='..'||part.includes('\0'))||parts.length<2||text.length>NOTE_MARKDOWN_MAX_BYTES||new TextEncoder().encode(text).length>NOTE_MARKDOWN_MAX_BYTES)throw new NoteExportFileError('unavailable','not-dispatched');
 const name=parts.pop()!;let parent:Awaited<ReturnType<typeof open>>|undefined,stage:Awaited<ReturnType<typeof open>>|undefined,stageName:string|undefined,file:Awaited<ReturnType<typeof open>>|undefined,creation:Stats|undefined,trustedStage=false,publishing=false;
 try{
  signal.throwIfAborted();parent=await open('/',constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  for(const part of parts.slice(1)){signal.throwIfAborted();const previous=parent;parent=await open(`/proc/self/fd/${previous.fd}/${part}`,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);await previous.close();}
  signal.throwIfAborted();stageName=`.linuxcast-notes-export-${randomUUID()}`;await mkdir(`/proc/self/fd/${parent.fd}/${stageName}`,{mode:0o700});const created=await lstat(`/proc/self/fd/${parent.fd}/${stageName}`);if(!created.isDirectory()||created.uid!==process.getuid!()||(created.mode&0o777)!==0o700)throw new Error('Private export staging unavailable.');creation=created;signal.throwIfAborted();stage=await open(`/proc/self/fd/${parent.fd}/${stageName}`,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);const openedStage=await stage.stat();if(openedStage.uid!==process.getuid!()||(openedStage.mode&0o777)!==0o700||openedStage.dev!==created.dev||openedStage.ino!==created.ino)throw new Error('Export staging changed.');trustedStage=true;
  const location=`/proc/self/fd/${stage.fd}/note.md`;file=await open(location,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  await file.writeFile(text,'utf8');await file.sync();const original=await file.stat(),source=await lstat(location);if(!source.isFile()||source.dev!==original.dev||source.ino!==original.ino||original.uid!==process.getuid!()||(original.mode&0o777)!==0o600)throw new Error('Export source changed.');
  signal.throwIfAborted();publishing=true;await link(location,`/proc/self/fd/${parent.fd}/${name}`);await parent.sync();
 }catch(error){const exists=!!error&&typeof error==='object'&&'code'in error&&error.code==='EEXIST';throw new NoteExportFileError(exists?'exists':'unavailable',exists||!publishing?'not-dispatched':'unknown');}
 finally{
  await file?.close().catch(()=>{});
  if(stage&&trustedStage){const owned=await stage.stat().catch(()=>undefined);await unlink(`/proc/self/fd/${stage.fd}/note.md`).catch(()=>{});await stage.close().catch(()=>{});
   if(parent&&stageName&&owned){const location=`/proc/self/fd/${parent.fd}/${stageName}`,current=await lstat(location).catch(()=>undefined);if(current?.dev===owned.dev&&current.ino===owned.ino)await rmdir(location).catch(()=>{});}}
  else{await stage?.close().catch(()=>{});if(parent&&stageName&&creation){const location=`/proc/self/fd/${parent.fd}/${stageName}`,current=await lstat(location).catch(()=>undefined);if(current?.dev===creation.dev&&current.ino===creation.ino)await rmdir(location).catch(()=>{});}}
  await parent?.close().catch(()=>{});
 }
}
