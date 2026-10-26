/** Main-only, shared by trusted builtins. Never exposed as a generic renderer API.
 * A second effect is rejected rather than queued behind an uncertain write. */
export type ClipboardWriteOutcome='written'|'unsupported'|'busy';
export function createClipboardWriter(clipboard:{writeText(text:string):Promise<void>;readText():Promise<string>},supported:()=>boolean) {
  let pending=false;
  return async(text:string):Promise<ClipboardWriteOutcome>=>{
    if(pending)return 'busy';
    if(!supported())return 'unsupported';
    pending=true;
    try{await clipboard.writeText(text);if(await clipboard.readText()!==text)throw new Error('Copy could not be confirmed.');return 'written';}
    finally{pending=false;}
  };
}
