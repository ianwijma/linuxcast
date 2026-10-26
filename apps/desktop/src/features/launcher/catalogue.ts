import { isLauncherVisibilityProtected,launcherCommandMetadataSchema,launcherCommandsReplySchema,launcherCommandsRequestSchema } from '@linuxcast/contracts';
import type { LauncherCommandsSnapshot,LauncherCommandMetadata } from '@linuxcast/contracts';
export const MAX_CATALOGUE=4103,MAX_CATALOGUE_BYTES=16*1024*1024;
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
    if(value.updateOnly || first && (value.revision!==first.revision || value.rankingAvailable!==first.rankingAvailable || value.visibilityAvailable!==first.visibilityAvailable || value.applicationState!==first.applicationState))throw new Error('Inconsistent command catalogue.');
    first??=value;
    for(const command of value.commands){if(ids.has(command.id))throw new Error('Duplicate command identity.');ids.add(command.id);commands.push(command);}
    bytes+=new TextEncoder().encode(JSON.stringify(value)).byteLength;if(commands.length>MAX_CATALOGUE || bytes>MAX_CATALOGUE_BYTES)throw new Error('Command catalogue limit.');
    if(value.nextCursor===undefined || value.nextCursor===null)return {revision:first.revision,rankingAvailable:first.rankingAvailable,...(first.visibilityAvailable===undefined?{}:{visibilityAvailable:first.visibilityAvailable}),...(first.applicationState?{applicationState:first.applicationState}:{}),commands};
    if(!value.commands.length || cursors.has(value.nextCursor))throw new Error('Invalid command cursor.');
    const next=launcherCommandsRequestSchema.parse({protocolVersion:1,cursor:value.nextCursor}).cursor!;
    const [revision,offset]=next.split(':').map(Number);if(revision!==first.revision || offset!==commands.length)throw new Error('Invalid command cursor.');cursors.add(next);cursor=next;
  }
  throw new Error('Command catalogue limit.');
}
export function mergePinReply(current:Catalogue,value:LauncherCommandsSnapshot,commandId:string,pinned:boolean):Catalogue{
  if(value.visibilityAvailable!==current.visibilityAvailable || value.revision<current.revision || value.nextCursor!==undefined && value.nextCursor!==null || value.commands.find(command=>command.id===commandId)?.usage?.pinned!==pinned)throw new Error('Unconfirmed pin.');
  for(const after of value.commands){
    const before=current.commands.find(command=>command.id===after.id);
    if(!before||(after.hidden!==undefined&&typeof after.hidden!=='boolean')||(before.hidden??false)!==(after.hidden??false))throw new Error('Invalid pin visibility.');
  }
  if(value.updateOnly){
    if(value.commands.length!==1 || !current.commands.some(command=>command.id===commandId) || value.revision!==current.revision)throw new Error('Invalid pin update.');
    return {...current,rankingAvailable:value.rankingAvailable,...(value.applicationState?{applicationState:value.applicationState}:{}),commands:current.commands.map(command=>command.id===commandId?value.commands[0]!:command)};
  }
  // Legacy complete replies are permitted only when they really contain the
  // existing full catalogue. A partial pin response cannot silently drop pages.
  if(value.commands.length!==current.commands.length || current.commands.some(command=>!value.commands.some(next=>next.id===command.id)))throw new Error('Incomplete pin snapshot.');
  return {revision:value.revision,rankingAvailable:value.rankingAvailable,...(current.visibilityAvailable===undefined?{}:{visibilityAvailable:current.visibilityAvailable}),...(value.applicationState?{applicationState:value.applicationState}:{}),commands:value.commands};
}
/** Alias acknowledgement is a single metadata update, never a replacement page
 * or authority to change command identity, availability or pinning. Usage totals
 * are authoritative owner values: execution or settings may have changed them
 * since the renderer loaded its catalogue. */
export function mergeAliasReply(current:Catalogue,value:LauncherCommandsSnapshot,commandId:string,alias:string|null):Catalogue{
  const before=current.commands.find(command=>command.id===commandId),after=value.commands[0];
  if(value.visibilityAvailable!==current.visibilityAvailable || !value.updateOnly || value.revision!==current.revision || value.commands.length!==1 || value.nextCursor!=null || !before || !after || after.id!==commandId || after.usage?.alias!==alias || value.rankingAvailable!==current.rankingAvailable || value.applicationState!==undefined && value.applicationState!==current.applicationState)throw new Error('Unconfirmed alias.');
  const {usage:oldUsage,...oldMetadata}=before,{usage:newUsage,...newMetadata}=after;
  if(JSON.stringify(oldMetadata)!==JSON.stringify(newMetadata) || (oldUsage?.pinned??false)!==newUsage?.pinned)throw new Error('Invalid alias update.');
  return {...current,commands:current.commands.map(command=>command.id===commandId?after:command)};
}

/** A visibility receipt is a fully recollected catalogue, never a first page or
 * partial metadata delta. Only the requested visibility may change; use totals
 * can change authoritatively while aliases, pins and descriptors are preserved. */
export function mergeVisibilityCatalogue(current:Catalogue,next:Catalogue,commandId:string,hidden:boolean):Catalogue{
  if(!Number.isSafeInteger(next.revision)||next.revision!==current.revision+1||current.visibilityAvailable!==true||next.visibilityAvailable!==true||
    next.rankingAvailable!==current.rankingAvailable||next.applicationState!==current.applicationState||
    Object.keys(next).some(key=>!['revision','rankingAvailable','visibilityAvailable','applicationState','commands'].includes(key))||
    current.commands.length>MAX_CATALOGUE||next.commands.length!==current.commands.length||isLauncherVisibilityProtected(commandId))throw new Error('Unconfirmed visibility.');
  const before=new Map(current.commands.map(command=>[command.id,launcherCommandMetadataSchema.parse(command)]));
  if(before.size!==current.commands.length||new Set(next.commands.map(command=>command.id)).size!==next.commands.length||!before.has(commandId))throw new Error('Incomplete visibility catalogue.');
  for(const command of next.commands){
    const after=launcherCommandMetadataSchema.parse(command),previous=before.get(after.id);
    if(!previous)throw new Error('Incomplete visibility catalogue.');
    const {usage:oldUsage,hidden:oldHidden,...oldMetadata}=previous,{usage:newUsage,hidden:newHidden,...newMetadata}=after;
    if((newHidden??false)!==(after.id===commandId?hidden:oldHidden??false)||JSON.stringify(oldMetadata)!==JSON.stringify(newMetadata)||
      (oldUsage?.pinned??false)!==(newUsage?.pinned??false)||(oldUsage?.alias??null)!==(newUsage?.alias??null))throw new Error('Invalid visibility update.');
  }
  return next;
}
