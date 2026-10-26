import { fileSearchResultSchema,fileSearchRootSchema,indexedPathTextSchema } from '@linuxcast/contracts';
import type { FileSearchResult,FileSearchRoot } from '@linuxcast/contracts';
/** Indexed display path only. This does not open, resolve, stat or grant file access. */
export function formatIndexedPath(root:FileSearchRoot,row:FileSearchResult):string {
  if(!fileSearchRootSchema.safeParse(root).success||!fileSearchResultSchema.safeParse(row).success||root.id!==row.rootId||root.generation!==row.generation||!indexedPathTextSchema.safeParse(root.displayPath).success)throw new Error('Indexed path unavailable.');
  const path=(root.displayPath==='/'?'':root.displayPath)+'/'+row.path;
  if(!indexedPathTextSchema.safeParse(path).success)throw new Error('Indexed path unavailable.');
  return path;
}
