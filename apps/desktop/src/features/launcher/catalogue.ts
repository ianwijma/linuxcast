import { launcherCommandsReplySchema,launcherCommandsRequestSchema } from '@linuxcast/contracts';
import type { LauncherCommandsSnapshot,LauncherCommandMetadata } from '@linuxcast/contracts';
export const MAX_CATALOGUE=4102,MAX_CATALOGUE_BYTES=16*1024*1024;
export type Catalogue=Omit<LauncherCommandsSnapshot,'commands'|'nextCursor'|'updateOnly'> & {commands:LauncherCommandMetadata[]};
/** Validate complete pages before any catalogue enters the live view. */
export function parsePage(raw:unknown):LauncherCommandsSnapshot {
  if(new TextEncoder().encode(JSON.stringify(raw)).byteLength>1024*1024)throw new Error('Invalid command page.');
  const reply=launcherCommandsReplySchema.parse(raw);if(!reply.ok)throw new Error('Commands unavailable.');return reply.value;
}
export async function collectCatalogue(fetch:(cursor?:string)=>Promise<unknown>):Promise<Catalogue>{
  let first:LauncherCommandsSnapshot|undefined,cursor:string|undefined,bytes=0;const commands:LauncherCommandMetadata[]=[],ids=new Set<string>(),cursors=new Set<string>();
  for(let page=0;page<MAX_CATALOGUE;page++){
    const value=parsePage(await fetch(cursor));
    if(value.updateOnly || first && (value.revision!==first.revision || value.rankingAvailable!==first.rankingAvailable || value.applicationState!==first.applicationState))throw new Error('Inconsistent command catalogue.');
    first??=value;
    for(const command of value.commands){if(ids.has(command.id))throw new Error('Duplicate command identity.');ids.add(command.id);commands.push(command);}
    bytes+=new TextEncoder().encode(JSON.stringify(value)).byteLength;if(commands.length>MAX_CATALOGUE || bytes>MAX_CATALOGUE_BYTES)throw new Error('Command catalogue limit.');
    if(value.nextCursor===undefined || value.nextCursor===null)return {revision:first.revision,rankingAvailable:first.rankingAvailable,...(first.applicationState?{applicationState:first.applicationState}:{}),commands};
    if(!value.commands.length || cursors.has(value.nextCursor))throw new Error('Invalid command cursor.');
    const next=launcherCommandsRequestSchema.parse({protocolVersion:1,cursor:value.nextCursor}).cursor!;
    const [revision,offset]=next.split(':').map(Number);if(revision!==first.revision || offset!==commands.length)throw new Error('Invalid command cursor.');cursors.add(next);cursor=next;
  }
  throw new Error('Command catalogue limit.');
}
export function mergePinReply(current:Catalogue,value:LauncherCommandsSnapshot,commandId:string,pinned:boolean):Catalogue{
  if(value.revision<current.revision || value.nextCursor!==undefined && value.nextCursor!==null || value.commands.find(command=>command.id===commandId)?.usage?.pinned!==pinned)throw new Error('Unconfirmed pin.');
  if(value.updateOnly){
    if(value.commands.length!==1 || !current.commands.some(command=>command.id===commandId) || value.revision!==current.revision)throw new Error('Invalid pin update.');
    return {...current,rankingAvailable:value.rankingAvailable,...(value.applicationState?{applicationState:value.applicationState}:{}),commands:current.commands.map(command=>command.id===commandId?value.commands[0]!:command)};
  }
  // Legacy complete replies are permitted only when they really contain the
  // existing full catalogue. A partial pin response cannot silently drop pages.
  if(value.commands.length!==current.commands.length || current.commands.some(command=>!value.commands.some(next=>next.id===command.id)))throw new Error('Incomplete pin snapshot.');
  return {revision:value.revision,rankingAvailable:value.rankingAvailable,...(value.applicationState?{applicationState:value.applicationState}:{}),commands:value.commands};
}
/** Alias acknowledgement is a single metadata update, never a replacement page
 * or authority to change command identity, availability or pinning. Usage totals
 * are authoritative owner values: execution or settings may have changed them
 * since the renderer loaded its catalogue. */
export function mergeAliasReply(current:Catalogue,value:LauncherCommandsSnapshot,commandId:string,alias:string|null):Catalogue{
  const before=current.commands.find(command=>command.id===commandId),after=value.commands[0];
  if(!value.updateOnly || value.revision!==current.revision || value.commands.length!==1 || value.nextCursor!=null || !before || !after || after.id!==commandId || after.usage?.alias!==alias || value.rankingAvailable!==current.rankingAvailable || value.applicationState!==undefined && value.applicationState!==current.applicationState)throw new Error('Unconfirmed alias.');
  const {usage:oldUsage,...oldMetadata}=before,{usage:newUsage,...newMetadata}=after;
  if(JSON.stringify(oldMetadata)!==JSON.stringify(newMetadata) || (oldUsage?.pinned??false)!==newUsage?.pinned)throw new Error('Invalid alias update.');
  return {...current,commands:current.commands.map(command=>command.id===commandId?after:command)};
}
