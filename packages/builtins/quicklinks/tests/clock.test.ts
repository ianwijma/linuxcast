import {afterEach,expect,it,vi} from 'vitest';
import {ClockLinkBuildError,buildClockLinkUrl,captureClockSnapshot} from '../src/clock.ts';
import type {ClockLink,ClockSnapshot} from '../src/clock.ts';
const base='https://example.invalid/lookup',config:ClockLink={queryParameter:'clock',source:'date',timeZone:'system'};
const capture=(when:string,zone='UTC')=>captureClockSnapshot(Date.parse(when),zone);
const values=(when:string,zone:string)=>{
 const snapshot=capture(when,zone);
 return(['date','time','timezone'] as const).map(source=>buildClockLinkUrl(base,{...config,source},snapshot).value);
};
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});

it.each([
 ['2025-12-31T23:59:59.987Z','UTC','2025-12-31','23:59:59'],
 ['2026-01-01T00:00:00.000Z','UTC','2026-01-01','00:00:00'],
 ['2025-12-31T13:00:00.000Z','Australia/Sydney','2026-01-01','00:00:00'],
 ['2026-01-01T00:30:00.000Z','America/Los_Angeles','2025-12-31','16:30:00'],
 ['2024-02-29T23:59:59.999Z','UTC','2024-02-29','23:59:59'],
 ['2024-03-01T00:00:00.000Z','UTC','2024-03-01','00:00:00'],
 ['2026-01-01T00:00:00.000Z','Asia/Katmandu','2026-01-01','05:45:00'],
 ['1969-12-31T23:59:59.999Z','UTC','1969-12-31','23:59:59'],
])('projects explicit day/year/UTC boundaries %s in %s', (when,zone,date,time)=>{expect(values(when,zone)).toEqual([date,time,zone]);});
it.each([
 ['2026-03-08T06:59:59.000Z','America/New_York','01:59:59'],
 ['2026-03-08T07:00:00.000Z','America/New_York','03:00:00'],
 ['2026-11-01T05:59:59.000Z','America/New_York','01:59:59'],
 ['2026-11-01T06:00:00.000Z','America/New_York','01:00:00'],
 ['2026-10-03T15:59:59.000Z','Australia/Sydney','01:59:59'],
 ['2026-10-03T16:00:00.000Z','Australia/Sydney','03:00:00'],
 ['2026-10-03T15:29:59.000Z','Australia/Lord_Howe','01:59:59'],
 ['2026-10-03T15:30:00.000Z','Australia/Lord_Howe','02:30:00'],
])('projects DST without guessing local-time disambiguation %s in %s',(when,zone,time)=>{expect(values(when,zone)[1]).toBe(time);});
it('retains historical offset seconds and four-digit astronomical years without BCE/CE confusion',()=>{
 expect(values('1900-01-01T00:00:00.000Z','Europe/Paris')).toEqual(['1900-01-01','00:09:21','Europe/Paris']);
 expect(values('0000-01-01T00:00:00.000Z','UTC')).toEqual(['0000-01-01','00:00:00','UTC']);
 expect(values('0001-01-01T00:00:00.000Z','UTC')).toEqual(['0001-01-01','00:00:00','UTC']);
 expect(values('9999-12-31T23:59:59.999Z','UTC')).toEqual(['9999-12-31','23:59:59','UTC']);
 for(const [when,zone] of [['0000-01-01T00:00:00.000Z','America/New_York'],['9999-12-31T23:59:59.999Z','Pacific/Kiritimati']])expect(()=>buildClockLinkUrl(base,config,capture(when!,zone!))).toThrowError(expect.objectContaining({reason:'invalid-snapshot'}));
});
it('returns an immutable captured instant, canonicalizes zone aliases only at capture, and requires exact canonical snapshots at build',()=>{
 const snapshot=captureClockSnapshot(0,'US/Eastern');expect(snapshot).toEqual({capturedAt:'1970-01-01T00:00:00.000Z',timeZone:'America/New_York'});expect(Object.isFrozen(snapshot)).toBe(true);
 expect(()=>{(snapshot as ClockSnapshot).capturedAt='PUBLIC_MUTATION';}).toThrow();
 expect(captureClockSnapshot(-0,'Etc/UTC')).toEqual({capturedAt:'1970-01-01T00:00:00.000Z',timeZone:'UTC'});
 for(const timeZone of ['US/Eastern','america/new_york'])expect(()=>buildClockLinkUrl(base,config,{...snapshot,timeZone})).toThrowError(expect.objectContaining({reason:'invalid-snapshot'}));
 expect(captureClockSnapshot(0,'utc').timeZone).toBe('UTC');
});
it('does not recapture on rendering, elapsed wall time or changes to the ambient system clock',()=>{
 const snapshot=capture('2026-01-01T12:34:56.789Z','Asia/Tokyo');vi.useFakeTimers();vi.setSystemTime(new Date('2040-01-01T00:00:00Z'));
 const now=vi.spyOn(Date,'now').mockImplementation(()=>{throw new Error('No implicit clock');}),network=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw new Error('No network');});
 const before=buildClockLinkUrl(base,{...config,source:'time'},snapshot);vi.setSystemTime(new Date('2050-12-31T23:59:59Z'));expect(buildClockLinkUrl(base,{...config,source:'time'},snapshot)).toEqual(before);expect(before.value).toBe('21:34:56');expect(snapshot.capturedAt).toBe('2026-01-01T12:34:56.789Z');expect(now).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();
});
it('sets exactly one query component, preserving canonical authority/path/hash and unrelated Unicode/duplicate values',()=>{
 const url='HTTPS://例え.example:443/search%2Fpath?before=Caf%C3%A9+%26%3D&clock=old&middle=%7Bliteral%7D&clock=duplicate&after=x&after=y#fixed%2F';
 const snapshot=capture('2026-01-01T00:00:00.000Z','Etc/GMT+1'),result=buildClockLinkUrl(url,{...config,source:'timezone'},snapshot),target=new URL(result.url);
 expect(result.value).toBe('Etc/GMT+1');expect([target.protocol,target.host,target.pathname,target.hash]).toEqual(['https:','xn--r8jz45g.example','/search%2Fpath','#fixed%2F']);
 expect([...target.searchParams]).toEqual([['before','Café &='],['clock','Etc/GMT+1'],['middle','{literal}'],['after','x'],['after','y']]);expect(result.url).toContain('clock=Etc%2FGMT%2B1');expect(target.searchParams.getAll('clock')).toHaveLength(1);
});
it.each(['date','time','timezone'] as const)('uses only the selected fixed context binding for %s and leaves frozen inputs unchanged',source=>{
 const snapshot=capture('2026-01-01T03:04:05.006Z'),definition=Object.freeze({...config,source,timeZone:'UTC' as const}),before=JSON.stringify({definition,snapshot});
 const result=buildClockLinkUrl('https://example.invalid/?literal=%7B%7Bcontext.clipboard%7D%7D',definition,snapshot);
 expect(result.value).toBe(source==='date'?'2026-01-01':source==='time'?'03:04:05':'UTC');expect(new URL(result.url).searchParams.get('literal')).toBe('{{context.clipboard}}');expect(JSON.stringify({definition,snapshot})).toBe(before);
});
it('requires UTC-config snapshots to actually be UTC without silently converting a system capture',()=>{
 const snapshot=capture('2026-01-01T00:00:00.000Z','Asia/Tokyo');for(const source of ['date','time','timezone'] as const)expect(()=>buildClockLinkUrl(base,{...config,source,timeZone:'UTC'},snapshot)).toThrowError(expect.objectContaining({reason:'invalid-snapshot'}));
});
it.each([NaN,Infinity,-Infinity,0.1,Number.MAX_SAFE_INTEGER,-8_640_000_000_000_001,Date.parse('-000001-01-01T00:00:00Z'),Date.parse('+010000-01-01T00:00:00Z'),'0',null,undefined,new Number(0)])('rejects invalid/unrepresentable/non-four-digit epoch %#',epoch=>{
 expect(()=>captureClockSnapshot(epoch as number,'UTC')).toThrowError(expect.objectContaining({name:'ClockLinkBuildError',reason:'invalid-snapshot',message:'Invalid clock snapshot.'}));
});
it.each(['',' ',' UTC','UTC ','America/Not_A_Zone','+01:00','-08:00','UTC\0','UTC\n','UTC\u202e','UTC\ud800','x'.repeat(129),undefined,null,new String('UTC')])('rejects invalid/implicit/non-IANA zone %#',zone=>{expect(()=>captureClockSnapshot(0,zone as string)).toThrowError(expect.objectContaining({reason:'invalid-snapshot'}));});
it.each([
 {capturedAt:'2026-01-01T00:00:00Z',timeZone:'UTC'},
 {capturedAt:'2026-01-01T00:00:00.000+00:00',timeZone:'UTC'},
 {capturedAt:'2026-02-30T00:00:00.000Z',timeZone:'UTC'},
 {capturedAt:'2026-01-01T00:00:60.000Z',timeZone:'UTC'},
 {capturedAt:'2026-01-01T00:00:00.000Z',timeZone:'Etc/UTC'},
 {capturedAt:'2026-01-01T00:00:00.000Z',timeZone:undefined},
 {capturedAt:'2026-01-01T00:00:00.000Z',timeZone:'UTC',extra:true},
 null,new Date(0),[],
])('rejects forged/noncanonical snapshot %#',snapshot=>{expect(()=>buildClockLinkUrl(base,config,snapshot as ClockSnapshot)).toThrowError(expect.objectContaining({reason:'invalid-snapshot'}));});
it.each([
 {...config,source:'{{context.clipboard}}'}, {...config,timeZone:'Asia/Tokyo'}, {...config,queryParameter:'q&inject'}, {...config,queryParameter:'1q'}, {...config,queryParameter:'q'.repeat(65)},
 {...config,queryParameter:undefined}, {...config,source:undefined}, {...config,timeZone:undefined}, {...config,template:'{{vars.query}}'}, {...config,extra:null},null,[],new Date(0),
])('rejects arbitrary templates/components and forged definitions %#',definition=>{expect(()=>buildClockLinkUrl(base,definition as ClockLink,captureClockSnapshot(0,'UTC'))).toThrowError(expect.objectContaining({reason:'invalid-definition'}));});
it.each(['https://user:pass@example.invalid/','file:///tmp/public','javascript:alert(1)','https://example.invalid/{{context.date}}','https://example.invalid/\ud800','https://example.invalid/%bad%',null,{},'https://example.invalid/'+'a'.repeat(8192)])('rejects unsafe bases without coercion %#',url=>{expect(()=>buildClockLinkUrl(url as string,config,captureClockSnapshot(0,'UTC'))).toThrowError(expect.objectContaining({reason:'invalid-definition'}));});
it('rejects accessors, inherited/exotic/symbol fields and reflective failures with content-free errors',()=>{
 const snapshot=captureClockSnapshot(0,'UTC'),getter=vi.fn(()=>{throw new Error('PUBLIC_CONTENT');});
 for(const definition of [Object.defineProperty({...config},'source',{get:getter}),Object.create(config),{...config,[Symbol('PUBLIC_CONTENT')]:true},new Proxy(config,{ownKeys(){throw new Error('PUBLIC_CONTENT');}})])expect(()=>buildClockLinkUrl(base,definition,snapshot)).toThrowError(expect.objectContaining({reason:'invalid-definition',message:'Invalid clock link definition.'}));
 for(const value of [Object.defineProperty({...snapshot},'timeZone',{get:getter}),Object.create(snapshot),{...snapshot,[Symbol('PUBLIC_CONTENT')]:true},new Proxy(snapshot,{getPrototypeOf(){throw new Error('PUBLIC_CONTENT');}})])expect(()=>buildClockLinkUrl(base,config,value)).toThrowError(expect.objectContaining({reason:'invalid-snapshot',message:'Invalid clock snapshot.'}));
 expect(getter).not.toHaveBeenCalled();
 const plain=Object.assign(Object.create(null) as ClockLink,config),captured=Object.assign(Object.create(null) as ClockSnapshot,snapshot);expect(buildClockLinkUrl(base,plain,captured).value).toBe('1970-01-01');
});
it('enforces the final8192-byte URL bound and accepts the exact query-parameter boundary',()=>{
 const snapshot=captureClockSnapshot(0,'UTC'),prefix='https://example.invalid/',suffix='?clock=1970-01-01',url=prefix+'a'.repeat(8192-prefix.length-suffix.length);
 expect(buildClockLinkUrl(url,config,snapshot).url.length).toBe(8192);expect(()=>buildClockLinkUrl(url+'a',config,snapshot)).toThrowError(expect.objectContaining({reason:'result-too-large',message:'Clock link target exceeds the size limit.'}));
 const parameter='a'.repeat(64);expect(new URL(buildClockLinkUrl(base,{...config,queryParameter:parameter},snapshot).url).searchParams.get(parameter)).toBe('1970-01-01');
});
it('fails safely when explicit Intl formatting/canonicalization is unavailable, never guessing a zone or time',()=>{
 const snapshot=captureClockSnapshot(0,'UTC');vi.spyOn(Intl,'DateTimeFormat').mockImplementation(function(){throw new Error('PUBLIC_CONTENT');});
 expect(()=>captureClockSnapshot(0,'UTC')).toThrow(ClockLinkBuildError);expect(()=>buildClockLinkUrl(base,config,snapshot)).toThrowError(expect.objectContaining({reason:'invalid-snapshot',message:'Invalid clock snapshot.'}));
});
