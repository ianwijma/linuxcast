import {NOTES_LAUNCHER_CHANNELS,launcherNotesSearchRequestSchema,launcherNotesSearchReplySchema,launcherNoteOpenRequestSchema,launcherNoteOpenReplySchema} from '../../../../packages/contracts/src/notes-launcher.ts';
import type {LauncherNotesApi} from '../../../../packages/contracts/src/notes-launcher.ts';
import {MAX_ENVELOPE_BYTES} from '@linuxcast/contracts';
import type {ShellTransport} from './api.ts';
const failure=(unknown=false)=>({ok:false as const,error:{code:unknown?'deadline-exceeded' as const:'capability-unavailable' as const,message:unknown?'Opening the selected note could not be confirmed. Review Notes, then reload results before trying again.':'Notes search is unavailable. Reload commands or open Notes to reconnect.',retryable:false}});
export function createLauncherNotesApi(transport:Pick<ShellTransport,'invoke'>):LauncherNotesApi{
 return {
  async searchLauncherNotes(input){
   const request=launcherNotesSearchRequestSchema.safeParse({...input,protocolVersion:1});if(!request.success)return failure();
   try{const raw=await transport.invoke(NOTES_LAUNCHER_CHANNELS.search,request.data);if(new TextEncoder().encode(JSON.stringify(raw)).length>MAX_ENVELOPE_BYTES)return failure();const reply=launcherNotesSearchReplySchema.safeParse(raw);return reply.success&&(!reply.data.ok||reply.data.value.revision===request.data.revision&&reply.data.value.query===request.data.query)?reply.data:failure();}catch{return failure();}
  },
  async openLauncherNote(input){
   const request=launcherNoteOpenRequestSchema.safeParse({...input,protocolVersion:1});if(!request.success)return failure();
   try{const raw=await transport.invoke(NOTES_LAUNCHER_CHANNELS.open,request.data);if(new TextEncoder().encode(JSON.stringify(raw)).length>MAX_ENVELOPE_BYTES)return failure(true);const reply=launcherNoteOpenReplySchema.safeParse(raw);return reply.success&&(!reply.data.ok||reply.data.value.selection.id===request.data.selection.id&&reply.data.value.selection.revision===request.data.selection.revision)?reply.data:failure(true);}catch{return failure(true);}
  },
 };
}
