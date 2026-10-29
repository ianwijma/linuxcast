import {quicklinkUrlSchema,webSearchParameterSchema} from '@linuxcast/contracts';
import {renderTemplate} from '@linuxcast/templates';

export interface ClockLink {queryParameter:string;source:'date'|'time'|'timezone';timeZone:'system'|'UTC';}
export interface ClockSnapshot {capturedAt:string;timeZone:string;}
export class ClockLinkBuildError extends Error {
 readonly reason:'invalid-definition'|'invalid-snapshot'|'result-too-large';
 constructor(reason:ClockLinkBuildError['reason']){
  super(reason==='invalid-definition'?'Invalid clock link definition.':reason==='invalid-snapshot'?'Invalid clock snapshot.':'Clock link target exceeds the size limit.');
  this.name='ClockLinkBuildError';this.reason=reason;
 }
}
const instant=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const zoneName=/^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)*$/u;
const templates={date:'{{context.date}}',time:'{{context.time}}',timezone:'{{context.timezone}}'} as const;
function invalid(reason:ClockLinkBuildError['reason']):never {throw new ClockLinkBuildError(reason);}
/** Inspect own data only; transparent Proxies cannot be identified in a browser.
 * Reflective failures are refused. Main's structured-clone boundary owns authority. */
function fields(value:unknown,keys:readonly string[],reason:ClockLinkBuildError['reason']):Record<string,unknown>{
 try{
  if(value===null||typeof value!=='object'||![null,Object.prototype].includes(Object.getPrototypeOf(value)))return invalid(reason);
  const own=Reflect.ownKeys(value);if(own.length!==keys.length||own.some(key=>typeof key!=='string'||!keys.includes(key)))return invalid(reason);
  const result:Record<string,unknown>=Object.create(null) as Record<string,unknown>;
  for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||!Object.hasOwn(descriptor,'value'))return invalid(reason);result[key]=descriptor.value;}
  return result;
 }catch{return invalid(reason);}
}
function canonicalZone(value:unknown):string {
 if(typeof value!=='string'||value.length>128||!zoneName.test(value))return invalid('invalid-snapshot');
 try{
  const zone=new Intl.DateTimeFormat('en-US',{timeZone:value,calendar:'iso8601',numberingSystem:'latn',hourCycle:'h23'}).resolvedOptions().timeZone;
  if(zone.length>128||!zoneName.test(zone))return invalid('invalid-snapshot');return zone;
 }catch{return invalid('invalid-snapshot');}
}
/** Explicit inputs only: no system timezone, current clock or locale acquisition. */
export function captureClockSnapshot(epochMs:number,timeZone:string):Readonly<ClockSnapshot>{
 if(typeof epochMs!=='number'||!Number.isSafeInteger(epochMs))return invalid('invalid-snapshot');
 try{
  const capturedAt=new Date(epochMs).toISOString();if(!instant.test(capturedAt))return invalid('invalid-snapshot');
  return Object.freeze({capturedAt,timeZone:canonicalZone(timeZone)});
 }catch{return invalid('invalid-snapshot');}
}
function snapshot(value:ClockSnapshot):Readonly<ClockSnapshot>{
 const data=fields(value,['capturedAt','timeZone'],'invalid-snapshot');
 if(typeof data.capturedAt!=='string'||data.capturedAt.length!==24||!instant.test(data.capturedAt)||typeof data.timeZone!=='string')return invalid('invalid-snapshot');
 const captured=captureClockSnapshot(Date.parse(data.capturedAt),data.timeZone);
 if(captured.capturedAt!==data.capturedAt||captured.timeZone!==data.timeZone)return invalid('invalid-snapshot');return captured;
}
function definition(value:ClockLink):ClockLink{
 const data=fields(value,['queryParameter','source','timeZone'],'invalid-definition');
 if(typeof data.queryParameter!=='string'||data.queryParameter.length>64||!webSearchParameterSchema.safeParse(data.queryParameter).success
  ||data.source!=='date'&&data.source!=='time'&&data.source!=='timezone'||data.timeZone!=='system'&&data.timeZone!=='UTC')return invalid('invalid-definition');
 return{queryParameter:data.queryParameter,source:data.source,timeZone:data.timeZone};
}
function projections(captured:Readonly<ClockSnapshot>):{date:string;time:string;timezone:string}{
 try{
  // Resolve the offset at THIS instant, including historical offset seconds.
  // ISO serialization then supplies h23/Latin digits and astronomical year0000;
  // Intl's year parts can otherwise conflate 1BCE with 1CE in ISO calendars.
  const formatter=new Intl.DateTimeFormat('en-US',{timeZone:captured.timeZone,calendar:'iso8601',numberingSystem:'latn',hourCycle:'h23',hour:'2-digit',timeZoneName:'longOffset'});
  const offset=formatter.formatToParts(new Date(captured.capturedAt)).find(part=>part.type==='timeZoneName')?.value;
  const match=typeof offset==='string'?/^GMT(?:([+-])(\d{2}):(\d{2})(?::(\d{2}))?)?$/u.exec(offset):null;
  if(!match)return invalid('invalid-snapshot');
  const hours=Number(match[2]??0),minutes=Number(match[3]??0),seconds=Number(match[4]??0);
  if(hours>23||minutes>59||seconds>59)return invalid('invalid-snapshot');
  const shift=(hours*3600+minutes*60+seconds)*1000*(match[1]==='-'?-1:1);
  const local=new Date(Date.parse(captured.capturedAt)+shift).toISOString();if(!instant.test(local))return invalid('invalid-snapshot');
  return{date:local.slice(0,10),time:local.slice(11,19),timezone:captured.timeZone};
 }catch{return invalid('invalid-snapshot');}
}
/** Pure fixed binding → one query component. Review/Open must reuse this snapshot. */
export function buildClockLinkUrl(baseUrl:string,config:ClockLink,value:ClockSnapshot):{url:string;value:string}{
 if(typeof baseUrl!=='string'||baseUrl.length>8192)return invalid('invalid-definition');
 const base=quicklinkUrlSchema.safeParse(baseUrl),clock=definition(config);if(!base.success)return invalid('invalid-definition');
 const captured=snapshot(value);if(clock.timeZone==='UTC'&&captured.timeZone!=='UTC')return invalid('invalid-snapshot');
 const context=Object.freeze(projections(captured)),rendered=renderTemplate(templates[clock.source],Object.freeze({context})),target=new URL(base.data);
 target.searchParams.set(clock.queryParameter,rendered);
 const url=target.href;if(url.length>8192||new TextEncoder().encode(url).length>8192)return invalid('result-too-large');
 const checked=quicklinkUrlSchema.safeParse(url);if(!checked.success)return invalid('invalid-definition');return{url:checked.data,value:rendered};
}
