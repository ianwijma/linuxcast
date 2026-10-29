import { buildClockLinkUrl,captureClockSnapshot,ClockLinkBuildError } from '@linuxcast/quicklinks/clock';
import { buildPathArgumentUrl,PathArgumentBuildError } from '@linuxcast/quicklinks/path-argument';
import type { IpcMain,IpcMainInvokeEvent } from 'electron';
import {
  QUICKLINK_CHANNELS,quicklinkListRequestSchema,quicklinkGetRequestSchema,quicklinkSaveRequestSchema,quicklinkOpenRequestSchema,
  quicklinkExportFileSchema,quicklinkExportReplySchema,quicklinkListReplySchema,quicklinkRecordReplySchema,quicklinkRemoveReplySchema,quicklinkOpenReplySchema,
} from '@linuxcast/contracts';
import type { QuicklinkExportFile,QuicklinkRecord,QuicklinkSummary,QuicklinkSave,QuicklinkSelection,ShellCommandReply } from '@linuxcast/contracts';
import { StorageRequestError } from '@linuxcast/storage';
import { ApplicationsUnavailable } from '@linuxcast/applications';
import { buildWebSearchUrl,WebSearchBuildError } from '@linuxcast/quicklinks/web-search';

export interface QuicklinkBackend {
  chooseExport?:(record:QuicklinkRecord)=>Promise<string|null>;
  writeExport?:(path:string,value:QuicklinkExportFile,signal:AbortSignal)=>Promise<void>;
  list():Promise<QuicklinkSummary[]>;
  get(selection:QuicklinkSelection):Promise<QuicklinkRecord|null>;
  save(input:QuicklinkSave):Promise<QuicklinkRecord>;
  remove(selection:QuicklinkSelection):Promise<QuicklinkSelection>;
  confirmRemove(record:QuicklinkRecord):Promise<boolean>;
}
export interface QuicklinkGate {
  trusted(event:IpcMainInvokeEvent):boolean;
  active():boolean;
  busy():boolean;
  generation():number;
  revision():number;
  /** Same slot used by launcher effects, Calculator and metadata mutations. */
  acquire():()=>void;
  checkVisibility(event:IpcMainInvokeEvent,revision:number):Promise<Extract<ShellCommandReply,{ok:false}>|undefined>;
  openUrl(url:string):Promise<'dispatched'>;
  recordUse():Promise<void>;
}
const failed=(code:'permission-denied'|'invalid-request'|'cancelled'|'conflict'|'capability-unavailable'|'deadline-exceeded',message:string,reason?:'conflict'|'quicklink-name-conflict'|'quicklink-limit-reached'):Extract<ShellCommandReply,{ok:false}>=>({ok:false,error:{code,message,retryable:false,...(reason?{details:{reason}}:{})}});
const denied=()=>failed('permission-denied','Quicklinks request denied.');
const changed=()=>failed('conflict','This Quicklink changed or was removed. Reload Quicklinks before trying again.','conflict');
const running=()=>failed('cancelled','Another launcher operation is still running. Wait, then reload Quicklinks.');
const unavailable=()=>failed('capability-unavailable','Quicklinks storage is unavailable. Reload Quicklinks to reconnect.');

/** Named trusted-shell operations only. Every external target comes from a
 * fresh, exact owner record; renderer-provided URLs never enter Open. */
export function registerQuicklinksIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,backend:QuicklinkBackend,gate:QuicklinkGate):()=>void {
  let disposed=false;
  const alive=()=>!disposed&&gate.active();
  for(const [operation,channel] of Object.entries(QUICKLINK_CHANNELS))ipc.handle(channel,async(event,payload)=>{
    if(!gate.trusted(event))return denied();
    const schema=operation==='list'?quicklinkListRequestSchema:operation==='save'?quicklinkSaveRequestSchema:operation==='open'?quicklinkOpenRequestSchema:quicklinkGetRequestSchema;
    const parsed=schema.safeParse(payload);
    if(!parsed.success)return failed('invalid-request','Invalid Quicklinks request.');
    if(!alive()||gate.busy())return running();
    if(operation==='list'||operation==='get'){
      const generation=gate.generation();
      try{
        const reply=operation==='list'
          ?quicklinkListReplySchema.parse({ok:true,value:{records:await backend.list()}})
          :await (async()=>{const selection=quicklinkGetRequestSchema.parse(payload),record=await backend.get({id:selection.id,revision:selection.revision});
            if(!record||record.id!==selection.id||record.revision!==selection.revision)return changed();
            return quicklinkRecordReplySchema.parse({ok:true,value:{record}});})();
        if(!gate.trusted(event))return denied();
        if(!alive()||gate.busy()||generation!==gate.generation())return running();
        return reply;
      }catch(error){return error instanceof StorageRequestError&&error.reasonCode==='conflict'?changed():unavailable();}
    }
    const release=gate.acquire();
    let attempted=false;
    try{
      const expectedRevision=operation==='open'?quicklinkOpenRequestSchema.parse(payload).launcherRevision:gate.revision();
      const blocked=await gate.checkVisibility(event,expectedRevision);if(blocked)return blocked;
      if(!gate.trusted(event))return denied();
      if(!alive())return running();
      if(expectedRevision!==gate.revision())return changed();
      if(operation==='save'){
        const {protocolVersion,...input}=quicklinkSaveRequestSchema.parse(payload);void protocolVersion;
        attempted=true;const record=await backend.save(input);
        const reply=quicklinkRecordReplySchema.parse({ok:true,value:{record}});
        if(!reply.ok||reply.value.record.revision!==input.expectedRevision+1||input.id!==undefined&&reply.value.record.id!==input.id||reply.value.record.name!==input.name||reply.value.record.url!==input.url||JSON.stringify(reply.value.record.webSearch)!==JSON.stringify(input.webSearch)||JSON.stringify(reply.value.record.pathArgument)!==JSON.stringify(input.pathArgument)||JSON.stringify(reply.value.record.clock)!==JSON.stringify(input.clock)||JSON.stringify(reply.value.record.tags??[])!==JSON.stringify(input.tags??[])||(reply.value.record.pinned??false)!==(input.pinned??false)||(reply.value.record.hidden??false)!==(input.hidden??false))throw new Error('Mismatched save receipt.');
        return reply;
      }
      const selection=quicklinkGetRequestSchema.parse(operation==='open'?{protocolVersion:1,id:(payload as QuicklinkSelection).id,revision:(payload as QuicklinkSelection).revision}:payload);
      const target={id:selection.id,revision:selection.revision},record=await backend.get(target);
      if(!record||record.id!==target.id||record.revision!==target.revision)return changed();
      // Validate the complete stored target even when a backend test port is used.
      const checked=quicklinkRecordReplySchema.parse({ok:true,value:{record}});if(!checked.ok)return unavailable();
      if(operation==='export'){
        if(!backend.chooseExport||!backend.writeExport)return failed('capability-unavailable','Quicklink export is unavailable. Reopen Linuxcast to reconnect.');
        const current=()=>alive()&&gate.trusted(event)&&gate.revision()===expectedRevision;
        if(!current())return running();
        const beforeChoice=await gate.checkVisibility(event,expectedRevision);if(beforeChoice)return beforeChoice;
        if(!current())return running();
        const destination=await backend.chooseExport(checked.value.record);
        if(destination===null)return quicklinkExportReplySchema.parse({ok:true,value:{...target,outcome:'cancelled'}});
        if(!current())return running();
        const blocked=await gate.checkVisibility(event,expectedRevision);if(blocked)return blocked;
        const latest=await backend.get(target);if(!latest)return changed();
        const fresh=quicklinkRecordReplySchema.parse({ok:true,value:{record:latest}});
        if(!current())return running();
        if(!fresh.ok||JSON.stringify(fresh.value.record)!==JSON.stringify(checked.value.record))return changed();
        const again=await gate.checkVisibility(event,expectedRevision);if(again)return again;
        if(!current())return running();
        const value=quicklinkExportFileSchema.parse({format:'linuxcast.quicklinks',formatVersion:1,records:[fresh.value.record]}),controller=new AbortController();
        const watcher=setInterval(()=>{if(!current())controller.abort();},25);
        try{attempted=true;await backend.writeExport(destination,value,controller.signal);if(!current())throw new Error('Unconfirmed export.');}
        finally{clearInterval(watcher);}
        return quicklinkExportReplySchema.parse({ok:true,value:{...target,outcome:'exported'}});
      }
      if(operation==='remove'){
        if(!gate.trusted(event))return denied();
        if(!alive()||gate.revision()!==expectedRevision)return running();
        const beforePrompt=await gate.checkVisibility(event,expectedRevision);if(beforePrompt)return beforePrompt;
        if(!gate.trusted(event))return denied();
        if(!alive()||gate.revision()!==expectedRevision)return running();
        const confirmed=await backend.confirmRemove(checked.value.record);
        if(!confirmed)return quicklinkRemoveReplySchema.parse({ok:true,value:{...target,outcome:'cancelled'}});
        if(!gate.trusted(event))return denied();
        if(!alive())return running();
        const blocked=await gate.checkVisibility(event,expectedRevision);if(blocked)return blocked;
        if(!gate.trusted(event))return denied();
        if(!alive()||gate.revision()!==expectedRevision)return running();
        attempted=true;const receipt=await backend.remove(target);
        if(receipt.id!==target.id||receipt.revision!==target.revision)throw new Error('Mismatched deletion receipt.');
        return quicklinkRemoveReplySchema.parse({ok:true,value:{...receipt,outcome:'removed'}});
      }
      const opening=quicklinkOpenRequestSchema.parse(payload),definition=checked.value.record;
      if(definition.hidden)return failed('permission-denied','Show this Quicklink before opening it. No browser request was sent.');
      let pathArgument:{query:string;url:string}|undefined;
      let clock:{capturedAt:string;timeZone:string;url:string;value:string}|undefined;
      let url=definition.url,webSearch:{query:string;url:string}|undefined;
      if(opening.clock!==undefined&&!definition.clock)return failed('invalid-request','This Quicklink does not accept a clock snapshot. Reload Quicklinks.');
      if(definition.clock){
        if(opening.clock===undefined)return failed('invalid-request','Review the current value before opening this time link.');
        const zone=definition.clock.timeZone==='UTC'?'UTC':Intl.DateTimeFormat().resolvedOptions().timeZone;
        const snapshot=captureClockSnapshot(Date.parse(opening.clock.capturedAt),zone);
        if(snapshot.timeZone!==opening.clock.timeZone)return failed('conflict','The system timezone changed. Review the current value again before opening this time link.','conflict');
        const built=buildClockLinkUrl(definition.url,definition.clock,snapshot);url=built.url;clock={...snapshot,...built};
      }else if(definition.webSearch){
        if(opening.query===undefined)return failed('invalid-request','Enter and review a query before opening this web search.');
        url=buildWebSearchUrl(definition.url,definition.webSearch,opening.query);
        webSearch={query:opening.query,url};
      }else if(definition.pathArgument){if(opening.query===undefined)return failed('invalid-request','Enter and review a path argument before opening this link.');url=buildPathArgumentUrl(definition.url,definition.pathArgument,opening.query);pathArgument={query:opening.query,url};
      }else if(opening.query!==undefined)return failed('invalid-request','A literal Quicklink does not accept an argument. Reload Quicklinks.');
      // Awaiting the owner may have changed sender, registry or visibility.
      const freshBlocked=await gate.checkVisibility(event,expectedRevision);if(freshBlocked)return freshBlocked;
      if(!gate.trusted(event))return denied();
      if(!alive()||gate.revision()!==expectedRevision)return running();
      if(definition.clock&&clock){
        const zone=definition.clock.timeZone==='UTC'?'UTC':Intl.DateTimeFormat().resolvedOptions().timeZone;
        if(captureClockSnapshot(Date.parse(clock.capturedAt),zone).timeZone!==clock.timeZone)return failed('conflict','The system timezone changed. Review the current value again before opening this time link.','conflict');
      }
      attempted=true;const outcome=await gate.openUrl(url);
      const reply=quicklinkOpenReplySchema.parse({ok:true,value:{...target,outcome,...(webSearch?{webSearch}:{}),...(pathArgument?{pathArgument}:{}),...(clock?{clock}:{})}});
      await gate.recordUse();return reply;
    }catch(error){
      if(error instanceof ClockLinkBuildError)return failed('invalid-request','This time link or snapshot is invalid or too large. Review the current value again, or edit the saved link.');
      if(error instanceof PathArgumentBuildError)return failed('invalid-request','This path argument or target is invalid or too large. Use a non-empty argument other than . or .., or edit the saved link.');
      if(error instanceof WebSearchBuildError)return failed('invalid-request','This search target is invalid or too large. Edit the search or shorten the query, then review it again.');
      if(error instanceof StorageRequestError&&error.effectOutcome==='not-dispatched'){
        if(error.reasonCode==='conflict')return changed();
        if(error.reasonCode==='quicklink-name-conflict')return failed('conflict','Another Quicklink uses this name. Choose a different name.','quicklink-name-conflict');
        if(error.reasonCode==='quicklink-limit-reached')return failed('conflict','Quicklinks is full (500 entries). Remove an entry before creating another.','quicklink-limit-reached');
        return unavailable();
      }
      if(error instanceof ApplicationsUnavailable&&error.effectOutcome==='not-dispatched')return failed('capability-unavailable','No web browser is available. Set a default browser, then try Open again.');
      if(attempted&&operation==='export')return failed('deadline-exceeded','The export may have completed. Check the selected file, then reload Quicklinks before exporting again.');
      return attempted?failed('deadline-exceeded','The Quicklink operation outcome is unknown. Check your browser if opening, then reload Quicklinks before trying again.'):unavailable();
    }finally{release();}
  });
  return()=>{disposed=true;for(const channel of Object.values(QUICKLINK_CHANNELS))ipc.removeHandler(channel);};
}
