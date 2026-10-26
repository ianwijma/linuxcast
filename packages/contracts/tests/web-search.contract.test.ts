import { expect,it } from 'vitest';
import { quicklinkSaveSchema,quicklinkRecordSchema,quicklinkSummarySchema,quicklinkSaveRequestSchema,quicklinkOpenRequestSchema,quicklinkOpenReplySchema,quicklinkWebSearchSchema,webSearchQuerySchema,WEB_SEARCH_TEMPLATE,quicklinkListSchema,MAX_ENVELOPE_BYTES } from '../src/index.ts';
const id='00000000-0000-4000-8000-000000000001',config={queryParameter:'q',template:WEB_SEARCH_TEMPLATE},save={expectedRevision:0,name:'Public search',url:'https://example.invalid/search',webSearch:config};
it('keeps literal compatibility and accepts only a fixed named-query component definition',()=>{
  expect(quicklinkSaveSchema.parse(save)).toEqual(save);expect(quicklinkSaveRequestSchema.parse({protocolVersion:1,...save})).toEqual({protocolVersion:1,...save});
  expect(quicklinkSaveSchema.parse({expectedRevision:0,name:'Public literal',url:save.url})).not.toHaveProperty('webSearch');
  for(const webSearch of [{...config,template:'{{context.clipboard}}'},{...config,template:'{{vars.query}}&other=1'},{...config,queryParameter:'q&other'},{...config,queryParameter:''},{...config,queryParameter:'q'.repeat(65)},{...config,url:'https://other.invalid/'},{...config,args:['query']}])expect(quicklinkWebSearchSchema.safeParse(webSearch).success).toBe(false);
  expect(quicklinkSaveSchema.safeParse({...save,url:'https://example.invalid/search?q={{vars.query}}'}).success).toBe(false);
});
it('bounds transient query input while preserving Unicode, spaces and template-like data literally',()=>{
  const query='  Public & x=other #fragment / 路径 {{context.clipboard}}  ';
  expect(webSearchQuerySchema.parse(query)).toBe(query);expect(webSearchQuerySchema.parse('😀'.repeat(512))).toHaveLength(1024);
  for(const input of ['', '   ', 'x'.repeat(2049),'😀'.repeat(513),'a\nb','a\tb','a\ud800'])expect(webSearchQuerySchema.safeParse(input).success).toBe(false);
});
it('extends Open with an optional query value and keeps all target/config/template authority out',()=>{
  const request={protocolVersion:1,id,revision:1,launcherRevision:1};expect(quicklinkOpenRequestSchema.parse(request)).toEqual(request);
  expect(quicklinkOpenRequestSchema.parse({...request,query:'public & other=literal'})).toEqual({...request,query:'public & other=literal'});
  for(const extra of [{url:save.url},{webSearch:config},{template:WEB_SEARCH_TEMPLATE},{queryParameter:'q'},{argv:[]},{queries:['public']}])expect(quicklinkOpenRequestSchema.safeParse({...request,query:'public',...extra}).success).toBe(false);
});
it('keeps full search configuration in records and only a marker in bounded summaries',()=>{
  const record={id,revision:1,name:save.name,url:save.url,webSearch:config,createdAt:'2026-10-26T00:00:00.000Z',updatedAt:'2026-10-26T00:00:00.000Z'};
  expect(quicklinkRecordSchema.parse(record)).toEqual(record);expect(quicklinkSummarySchema.parse({id,revision:1,name:save.name,host:'example.invalid',webSearch:true})).toHaveProperty('webSearch',true);
  expect(quicklinkSummarySchema.safeParse({id,revision:1,name:save.name,host:'example.invalid',webSearch:config}).success).toBe(false);
  const rows=Array.from({length:500},(_,index)=>({id:`00000000-0000-4000-8000-${index.toString(16).padStart(12,'0')}`,revision:Number.MAX_SAFE_INTEGER,name:'😀'.repeat(64),host:'x'.repeat(320),webSearch:true}));
  expect(quicklinkListSchema.parse(rows)).toHaveLength(500);expect(Buffer.byteLength(JSON.stringify(rows))).toBeLessThan(MAX_ENVELOPE_BYTES-4096);
});
it('allows a strict transient exact search receipt and still forbids completed-page claims',()=>{
  const value={id,revision:1,outcome:'dispatched',webSearch:{query:'public & literal',url:'https://example.invalid/search?q=public+%26+literal'}};
  expect(quicklinkOpenReplySchema.parse({ok:true,value})).toEqual({ok:true,value});
  for(const bad of [{...value,outcome:'completed'},{...value,webSearch:{...value.webSearch,history:true}},{...value,webSearch:{...value.webSearch,url:'file:///private'}},{...value,webSearch:{...value.webSearch,query:''}}])expect(quicklinkOpenReplySchema.safeParse({ok:true,value:bad}).success).toBe(false);
});
