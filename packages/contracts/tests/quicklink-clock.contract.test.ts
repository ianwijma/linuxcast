import {expect,it} from 'vitest';
import {quicklinkClockSnapshotSchema,quicklinkSaveSchema,quicklinkSaveRequestSchema,quicklinkRecordSchema,quicklinkSummarySchema,quicklinkOpenRequestSchema,quicklinkOpenReplySchema,quicklinkExportFileSchema} from '../src/quicklinks.ts';
const id='00000000-0000-4000-8000-000000000001',selection={id,revision:1};
const clock={queryParameter:'when',source:'date' as const,timeZone:'UTC' as const};
const snapshot={capturedAt:'2026-12-31T23:59:59.123Z',timeZone:'UTC'};
const save={expectedRevision:0,name:'Public day',url:'https://example.invalid/calendar',clock};
const record={...selection,name:save.name,url:save.url,clock,createdAt:snapshot.capturedAt,updatedAt:snapshot.capturedAt};
it('stores only an exclusive typed clock definition, projects an opaque summary and exports configuration without invocation history',()=>{
 expect(quicklinkSaveSchema.parse(save)).toEqual(save);expect(quicklinkSaveRequestSchema.parse({protocolVersion:1,...save})).toEqual({protocolVersion:1,...save});expect(quicklinkRecordSchema.parse(record)).toEqual(record);
 expect(quicklinkSummarySchema.parse({...selection,name:save.name,host:'example.invalid',clock:true})).toMatchObject({clock:true});
 expect(quicklinkExportFileSchema.parse({format:'linuxcast.quicklinks',formatVersion:1,records:[record]})).toMatchObject({records:[{clock}]});
 for(const extra of [{clock:{...clock,capturedAt:snapshot.capturedAt}},{clock:{...clock,source:'clipboard'}},{clock:{...clock,timeZone:'Australia/Sydney'}},{clock:{...clock,queryParameter:'when&other'}},{clock:{...clock,template:'{{context.date}}'}},{clock:null},{webSearch:{queryParameter:'q',template:'{{vars.query}}'}},{pathArgument:{component:'path-segment',template:'{{vars.query}}'}},{snapshot},{value:'2026-12-31'}])expect(quicklinkSaveSchema.safeParse({...save,...extra}).success).toBe(false);
 expect(quicklinkSummarySchema.safeParse({...selection,name:save.name,host:'example.invalid',clock:true,webSearch:true}).success).toBe(false);
});
it('accepts one exact canonical bounded public snapshot and rejects normalized dates, extra authority and mixed invocation kinds',()=>{
 const request={protocolVersion:1,...selection,launcherRevision:1,clock:snapshot};expect(quicklinkOpenRequestSchema.parse(request)).toEqual(request);
 for(const capturedAt of ['2026-02-30T00:00:00.000Z','2026-12-31T23:59:59Z','2026-12-31T23:59:59.123+00:00','+012026-12-31T23:59:59.123Z','2026-12-31T24:00:00.000Z','x'.repeat(100000)])expect(quicklinkClockSnapshotSchema.safeParse({...snapshot,capturedAt}).success).toBe(false);
 for(const patch of [{timeZone:'UTC\n'},{timeZone:'x'.repeat(129)},{timeZone:''},{url:save.url},{epochMs:0}])expect(quicklinkClockSnapshotSchema.safeParse({...snapshot,...patch}).success).toBe(false);
 for(const extra of [{query:'public'},{url:save.url},{argv:[]},{clock:{...snapshot,grant:'open'}}])expect(quicklinkOpenRequestSchema.safeParse({...request,...extra}).success).toBe(false);
});
it('accepts only dispatched, exclusive clock receipts with exact-shaped snapshot and bounded scalar',()=>{
 const value={...selection,outcome:'dispatched',clock:{...snapshot,url:'https://example.invalid/calendar?when=2026-12-31',value:'2026-12-31'}};
 expect(quicklinkOpenReplySchema.parse({ok:true,value})).toEqual({ok:true,value});
 for(const patch of [{outcome:'completed'},{webSearch:{query:'public',url:save.url}},{pathArgument:{query:'public',url:save.url}},{clock:{...value.clock,value:'private\nvalue'}},{clock:{...value.clock,value:'x'.repeat(129)}},{clock:{...value.clock,url:'file:///tmp/private'}}])expect(quicklinkOpenReplySchema.safeParse({ok:true,value:{...value,...patch}}).success).toBe(false);
});
