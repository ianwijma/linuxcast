import { MAX_LAUNCHER_COMMANDS } from '../../contracts/src/launcher.ts';
import { httpUrlSchema } from '@linuxcast/contracts';
/** Pure local ranking. Entries come only from the trusted command registry;
 * matching a name or alias never creates an executable command. */
export interface SearchCommand {
  id:string;hidden?:boolean|undefined;provider?:'commands'|'applications'|undefined;title:string;aliases:readonly string[];keywords:readonly string[];enabled:boolean;
  usage:{useCount:number;lastUsedAt:string|null;pinned:boolean;alias:string|null}|null;
}
export const MAX_QUERY_LENGTH=512;
export const MAX_COMMANDS=MAX_LAUNCHER_COMMANDS;
export const MAX_COMMAND_RESULTS=20;
const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('en-US').trim().replace(/\s+/gu,' ');
function subsequence(query:string,text:string):boolean {let cursor=0;for(const character of text)if(character===query[cursor])cursor++;return cursor===query.length;}
function match(command:SearchCommand,query:string,urlQuery:boolean):number|null {
  if(!query)return 0;
  if(urlQuery && command.id==='linuxcast:open-url')return 0;
  const aliases=[...command.aliases,...(command.usage?.alias?[command.usage.alias]:[])].map(normalize);
  if(aliases.includes(query))return 0;
  const title=normalize(command.title),keywords=command.keywords.map(normalize);
  if(title===query)return 1;
  if(title.startsWith(query))return 2;
  if(title.includes(query))return 3;
  if(query.split(' ').every(token=>[title,...keywords,...aliases].some(value=>value.includes(token))))return 4;
  return subsequence(query,title)?5:null;
}
function frecency(command:SearchCommand,now:number):number {
  const usage=command.usage;if(!usage || usage.useCount===0 || !usage.lastUsedAt)return 0;
  const at=Date.parse(usage.lastUsedAt);if(!Number.isFinite(at))return 0;
  const age=Math.max(0,now-at)/86_400_000;
  return Math.log2(1+usage.useCount)/(1+age/7);
}
export function rankCommands<T extends SearchCommand>(commands:readonly T[],query:string,now=Date.now(),selectedId:string|null=null):T[] {
  if(query.length>MAX_QUERY_LENGTH || commands.length>MAX_COMMANDS || !Number.isFinite(now))throw new Error('Search limit exceeded.');
  if(new Set(commands.map(command=>command.id)).size!==commands.length)throw new Error('Duplicate command identity.');
  const normalized=normalize(query),urlQuery=httpUrlSchema.safeParse(query).success;
  const ranked=commands.filter(command=>!command.hidden).map((command,index)=>({command,index,tier:match(command,normalized,urlQuery)})).filter((entry):entry is {command:T;index:number;tier:number}=>entry.tier!==null)
    .sort((a,b)=>a.tier-b.tier || Number(Boolean(b.command.usage?.pinned))-Number(Boolean(a.command.usage?.pinned)) || frecency(b.command,now)-frecency(a.command,now) || (!normalized?a.index-b.index:a.command.title.localeCompare(b.command.title,'en')) || a.command.id.localeCompare(b.command.id,'en'))
    .map(entry=>entry.command);
  const counts=new Map<string,number>();
  const providerOf=(command:T)=>command.provider??(command.id.startsWith('application:')?'applications':'commands');
  const projected=ranked.filter(command=>{const provider=providerOf(command);const count=counts.get(provider)??0;if(count>=MAX_COMMAND_RESULTS)return false;counts.set(provider,count+1);return true;}).slice(0,100);
  const selected=selectedId?ranked.find(command=>command.id===selectedId):undefined;
  if(selected && !projected.some(command=>command.id===selected.id)){
    // Preserve a still-matching selection without exceeding the provider cap.
    const index=projected.findLastIndex(command=>providerOf(command)===providerOf(selected));
    if(index>=0)projected[index]=selected;
  }
  const positions=new Map(ranked.map((command,index)=>[command.id,index]));
  return projected.sort((a,b)=>positions.get(a.id)!-positions.get(b.id)!);
}
/** Management projection only: retains original hidden/unavailable metadata and
 * never infers an Open URL result or creates execution authority. */
export function rankManagedCommands<T extends SearchCommand>(commands:readonly T[],query:string,selectedId:string|null=null):T[] {
  if(query.length>MAX_QUERY_LENGTH||commands.length>MAX_COMMANDS)throw new Error('Search limit exceeded.');
  if(new Set(commands.map(command=>command.id)).size!==commands.length)throw new Error('Duplicate command identity.');
  const normalized=normalize(query);
  const ranked=commands.map(command=>({command,tier:match(command,normalized,false)}))
    .filter((entry):entry is {command:T;tier:number}=>entry.tier!==null)
    .sort((a,b)=>a.tier-b.tier||a.command.title.localeCompare(b.command.title,'en')||a.command.id.localeCompare(b.command.id,'en'))
    .map(entry=>entry.command);
  const projected=ranked.slice(0,100),selected=selectedId?ranked.find(command=>command.id===selectedId):undefined;
  if(selected&&!projected.some(command=>command.id===selected.id))projected[projected.length-1]=selected;
  const positions=new Map(ranked.map((command,index)=>[command.id,index]));
  return projected.sort((a,b)=>positions.get(a.id)!-positions.get(b.id)!);
}
export function preserveSelection(commands:readonly SearchCommand[],selectedId:string|null):string|null {
  const shown=commands.filter(command=>!command.hidden);
  return shown.some(command=>command.id===selectedId)?selectedId:shown.find(command=>command.enabled)?.id??shown[0]?.id??null;
}
/** A query generation is local state, not execution authority. Cancellation
 * invalidates older completions even when an asynchronous producer ignores it. */
export class QueryGenerations {
  #generation=0;#controller:AbortController|null=null;
  begin(query:string) {
    if(query.length>MAX_QUERY_LENGTH)throw new Error('Search limit exceeded.');
    this.#controller?.abort();const controller=new AbortController();this.#controller=controller;
    return {generation:++this.#generation,query,signal:controller.signal};
  }
  current(generation:number):boolean{return generation===this.#generation && this.#controller!==null && !this.#controller.signal.aborted;}
  cancel(){this.#controller?.abort();this.#controller=null;}
}
