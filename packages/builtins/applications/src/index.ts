import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { nativeApplicationSchema,nativeApplicationRequestSchema,nativeApplicationListReplySchema,nativeApplicationLaunchReplySchema,nativeApplicationActionReplySchema,nativeTextPreviewReplySchema } from '@linuxcast/contracts';
import type { NativeApplication,NativeApplicationRequest } from '@linuxcast/contracts';
export type { NativeApplication } from '@linuxcast/contracts';
const MAX_OUTPUT=1024*1024,MAX_INPUT=64*1024,DEADLINE=2500,MAX_CATALOGUE=4096,MAX_HELPERS=2;
export type ApplicationsUnavailableReason='invalid-request'|'unavailable'|'stale-application'|'launch-failed'|'catalogue-too-large'|'invalid-reply'|'cancelled'|'deadline-exceeded'|'busy'|'stopped';
export class ApplicationsUnavailable extends Error {
  readonly reason:ApplicationsUnavailableReason;readonly effectOutcome:'not-dispatched'|'unknown';
  constructor(reason:ApplicationsUnavailableReason,effectOutcome:'not-dispatched'|'unknown'='not-dispatched'){super(`Application operation unavailable: ${reason}.`);this.reason=reason;this.effectOutcome=effectOutcome;}
}
const ENVIRONMENT=['HOME','PATH','XDG_DATA_HOME','XDG_DATA_DIRS','XDG_CONFIG_HOME','XDG_CONFIG_DIRS','XDG_CACHE_HOME','XDG_STATE_HOME','XDG_RUNTIME_DIR','XDG_CURRENT_DESKTOP','XDG_SESSION_DESKTOP','XDG_SESSION_TYPE','DESKTOP_SESSION','DISPLAY','WAYLAND_DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS','LANG','LANGUAGE','LC_ALL','LC_MESSAGES','LC_CTYPE','LC_COLLATE','LC_TIME','LC_NUMERIC','LC_MONETARY'] as const;
function environment():NodeJS.ProcessEnv {
  const env:NodeJS.ProcessEnv={};let bytes=0;
  for(const key of ENVIRONMENT){const value=process.env[key];if(value===undefined)continue;if(value.includes('\0') || Buffer.byteLength(value)>8192)throw new ApplicationsUnavailable('unavailable');bytes+=Buffer.byteLength(key)+Buffer.byteLength(value);if(bytes>64*1024)throw new ApplicationsUnavailable('unavailable');env[key]=value;}
  return env;
}
/** Main supplies the packaged executable. Neither paths nor environment are
 * caller-controlled IPC fields. Each helper handles one operation, never shell. */
export function createApplications({helperPath}:{helperPath:string}) {
  if(!isAbsolute(helperPath) || helperPath.includes('\0'))throw new ApplicationsUnavailable('unavailable');
  const active=new Set<{cancel:(reason:ApplicationsUnavailableReason,force?:boolean)=>void;done:Promise<void>}>();let stopped=false;
  async function request(input:NativeApplicationRequest,signal?:AbortSignal):Promise<unknown>{
    let normalized:NativeApplicationRequest;try{normalized=nativeApplicationRequestSchema.parse(input);}catch{throw new ApplicationsUnavailable('invalid-request');}
    if(stopped)throw new ApplicationsUnavailable('stopped');if(signal?.aborted)throw new ApplicationsUnavailable('cancelled');if(active.size>=MAX_HELPERS)throw new ApplicationsUnavailable('busy');
    const wire=JSON.stringify(normalized)+'\n';if(Buffer.byteLength(wire)>MAX_INPUT)throw new ApplicationsUnavailable('invalid-request');
    const env=environment();const outcome=normalized.operation==='launch' || normalized.operation==='open-url' || normalized.operation==='launch-action'?'unknown':'not-dispatched';
    return new Promise((resolve,reject)=>{
      const child=spawn(helperPath,['applications'],{stdio:['pipe','pipe','ignore'],env,shell:false});
      let failure:ApplicationsUnavailableReason|undefined,bytes=0,ended=false;const chunks:Buffer[]=[];
      let killed:ReturnType<typeof setTimeout>|undefined;
      const done=new Promise<void>(finish=>child.once('close',()=>finish()));
      const cancel=(reason:ApplicationsUnavailableReason,force=false)=>{
        failure??=reason;if(ended)return;
        if(force)child.kill('SIGKILL');else{child.kill('SIGTERM');killed??=setTimeout(()=>child.kill('SIGKILL'),100);}
        child.stdin.destroy();child.stdout.destroy();
      };
      const handle={cancel,done};active.add(handle);
      const abort=()=>cancel('cancelled');signal?.addEventListener('abort',abort,{once:true});
      const deadline=setTimeout(()=>cancel('deadline-exceeded',true),DEADLINE);
      child.once('error',()=>{failure??='unavailable';});child.stdin.on('error',()=>cancel('unavailable'));
      child.stdout.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>MAX_OUTPUT){cancel('invalid-reply',true);return;}chunks.push(chunk);});
      child.once('close',(code,exitSignal)=>{
        ended=true;clearTimeout(deadline);clearTimeout(killed);signal?.removeEventListener('abort',abort);active.delete(handle);
        if(failure || code!==0 || exitSignal){reject(new ApplicationsUnavailable(failure??'unavailable',outcome));return;}
        try{
          const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
          if(!text.endsWith('\n') || text.slice(0,-1).includes('\n') || !text.trim())throw new Error();
          resolve(JSON.parse(text));
        }catch{reject(new ApplicationsUnavailable('invalid-reply',outcome));}
      });
      if(signal?.aborted)abort();else child.stdin.end(wire);
    });
  }
  return {
    async list(options:{signal?:AbortSignal}={}):Promise<NativeApplication[]>{
      const result:NativeApplication[]=[];let afterId:string|undefined;
      for(let page=0;page<42;page++){
        const raw=await request({protocolVersion:1,operation:'list',limit:100,...(afterId?{afterId}:{})},options.signal);
        const parsed=nativeApplicationListReplySchema.safeParse(raw);if(!parsed.success)throw new ApplicationsUnavailable('invalid-reply');const reply=parsed.data;
        if(!reply.ok)throw new ApplicationsUnavailable(reply.error);
        let previous=afterId;
        for(const application of reply.value.applications){if(previous!==undefined && Buffer.compare(Buffer.from(application.desktopId),Buffer.from(previous))<=0)throw new ApplicationsUnavailable('invalid-reply');previous=application.desktopId;result.push(application);if(result.length>MAX_CATALOGUE)throw new ApplicationsUnavailable('catalogue-too-large');}
        const cursor=reply.value.nextCursor;if(cursor===null)return result;
        if(!reply.value.applications.length || cursor!==previous || cursor===afterId)throw new ApplicationsUnavailable('invalid-reply');afterId=cursor;
      }
      throw new ApplicationsUnavailable('catalogue-too-large');
    },
    async launch(application:Pick<NativeApplication,'desktopId'|'fingerprint'>,options:{signal?:AbortSignal}={}):Promise<'dispatched'>{
      let identity:Pick<NativeApplication,'desktopId'|'fingerprint'>;try{identity=nativeApplicationSchema.pick({desktopId:true,fingerprint:true}).parse(application);}catch{throw new ApplicationsUnavailable('invalid-request');}
      const raw=await request({protocolVersion:1,operation:'launch',...identity},options.signal);
      const parsed=nativeApplicationLaunchReplySchema.safeParse(raw);if(!parsed.success)throw new ApplicationsUnavailable('invalid-reply','unknown');if(!parsed.data.ok)throw new ApplicationsUnavailable(parsed.data.error,['invalid-request','stale-application','unavailable'].includes(parsed.data.error)?'not-dispatched':'unknown');return parsed.data.value.outcome;
    },
    async launchAction(application:Pick<NativeApplication,'desktopId'|'fingerprint'>&{actionId:string},options:{signal?:AbortSignal}={}):Promise<{outcome:'requested';actionId:string}>{
      let input:Extract<NativeApplicationRequest,{operation:'launch-action'}>;
      try{input=nativeApplicationRequestSchema.parse({...application,protocolVersion:1,operation:'launch-action'}) as typeof input;
        if(Object.keys(application).some(key=>!['desktopId','fingerprint','actionId'].includes(key)))throw new Error();
      }catch{throw new ApplicationsUnavailable('invalid-request');}
      const raw=await request(input,options.signal),parsed=nativeApplicationActionReplySchema.safeParse(raw);
      if(!parsed.success)throw new ApplicationsUnavailable('invalid-reply','unknown');
      if(!parsed.data.ok){const reason=parsed.data.error;throw new ApplicationsUnavailable(reason==='catalogue-too-large'?'invalid-reply':reason,['invalid-request','stale-application','unavailable'].includes(reason)?'not-dispatched':'unknown');}
      if(parsed.data.value.actionId!==input.actionId)throw new ApplicationsUnavailable('invalid-reply','unknown');
      return parsed.data.value;
    },
    async openUrl(url:string,options:{signal?:AbortSignal}={}):Promise<'dispatched'>{
      const raw=await request({protocolVersion:1,operation:'open-url',url},options.signal);
      const parsed=nativeApplicationLaunchReplySchema.safeParse(raw);
      if(!parsed.success)throw new ApplicationsUnavailable('invalid-reply','unknown');
      if(!parsed.data.ok){
        const reason=parsed.data.error;
        if(reason==='invalid-request' || reason==='unavailable')throw new ApplicationsUnavailable(reason,'not-dispatched');
        throw new ApplicationsUnavailable(reason==='launch-failed'?reason:'invalid-reply','unknown');
      }
      return parsed.data.value.outcome;
    },
    async previewText(input:Omit<Extract<NativeApplicationRequest,{operation:'preview-text'}>,'protocolVersion'|'operation'>,options:{signal?:AbortSignal}={}):Promise<string>{
      if(Object.keys(input).some(key=>!['rootPath','relativePath','size','modifiedMs'].includes(key)))throw new ApplicationsUnavailable('invalid-request');
      const raw=await request({...input,protocolVersion:1,operation:'preview-text'},options.signal);
      const parsed=nativeTextPreviewReplySchema.safeParse(raw);
      if(!parsed.success)throw new ApplicationsUnavailable('invalid-reply');
      if(!parsed.data.ok)throw new ApplicationsUnavailable(parsed.data.error);
      return parsed.data.value.text;
    },
    async stop(){stopped=true;const pending=[...active];pending.forEach(handle=>handle.cancel('stopped'));await Promise.all(pending.map(handle=>handle.done));},
    async terminate(){stopped=true;const pending=[...active];pending.forEach(handle=>handle.cancel('stopped',true));await Promise.all(pending.map(handle=>handle.done));},
  };
}
