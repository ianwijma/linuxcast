import { quicklinkListSchema,launcherCommandMetadataSchema } from '@linuxcast/contracts';
import type { LauncherCommandMetadata } from '@linuxcast/contracts';
/** Read-only registry projection. It never carries a target URL or executes a link. */
export function compileQuicklinkCommands(value:unknown,browserAvailable:boolean):Omit<LauncherCommandMetadata,'usage'>[]{
  return quicklinkListSchema.parse(value).filter(record=>!record.hidden).map(record=>{
    const {usage:_usage,...metadata}=launcherCommandMetadataSchema.parse({id:`quicklink:${record.id}`,quicklink:{id:record.id,revision:record.revision},provider:'commands',title:record.name,subtitle:`Saved ${record.webSearch?'web search':'Quicklink'} · ${record.host} · Open saved entry`,aliases:[],keywords:['quicklink','bookmark',...(record.tags??[])],enabled:browserAvailable,...(!browserAvailable?{unavailableReason:'Browser opening is unavailable. Open Quicklinks to review saved links.'}:{}),usage:null});
    void _usage;return metadata;
  });
}
