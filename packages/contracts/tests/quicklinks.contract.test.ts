import { expect,it } from 'vitest';
import { quicklinkTagsSchema,MAX_ENVELOPE_BYTES,MAX_QUICKLINKS,normalizeQuicklinkName,quicklinkNameSchema,quicklinkUrlSchema,quicklinkSaveSchema,quicklinkListSchema,quicklinkSaveRequestSchema,quicklinkGetRequestSchema,quicklinkOpenRequestSchema,quicklinkRecordReplySchema,quicklinkRemoveReplySchema,quicklinkOpenReplySchema,launcherCommandIdSchema,launcherCommandMetadataSchema,MAX_LAUNCHER_COMMANDS,quicklinkExportFileSchema,quicklinkExportReplySchema } from '../src/index.ts';
const id='00000000-0000-4000-8000-000000000001';
const save={expectedRevision:0,name:'Public docs',url:'https://example.invalid/docs'};
it('validates literal credential-free web targets before canonicalizing and rejects unsupported template authority',()=>{
  expect(quicklinkUrlSchema.parse('HTTPS://BÜCHER.example:443/路径?x=%7Bquery%7D')).toBe('https://xn--bcher-kva.example/%E8%B7%AF%E5%BE%84?x=%7Bquery%7D');
  expect(quicklinkUrlSchema.safeParse(`https://${'a'.repeat(320)}/`).success).toBe(true);
  expect(quicklinkUrlSchema.safeParse(`https://${'a'.repeat(321)}/`).success).toBe(false);
  for(const url of ['https://example.invalid/{query}','https://example.invalid/{clipboard}','file:///tmp/public','javascript:alert(1)','https://user@example.invalid/','https://example.invalid/a b','https://example.invalid/%zz'])expect(quicklinkUrlSchema.safeParse(url).success).toBe(false);
});
it('bounds Unicode names and defines deterministic normalized uniqueness without modifying display names',()=>{
  expect(normalizeQuicklinkName('Ｆｏｏ   Desk')).toBe(normalizeQuicklinkName('foo desk'));
  expect(quicklinkNameSchema.parse('Ｆｏｏ   Desk')).toBe('Ｆｏｏ   Desk');
  expect(quicklinkNameSchema.safeParse('😀'.repeat(64)).success).toBe(true);
  for(const name of ['', ' leading','trailing ','a\nb','a\ud800','x'.repeat(129),'界'.repeat(86)])expect(quicklinkNameSchema.safeParse(name).success).toBe(false);
});
it('separates create, exact-version update and selection-only open; renderer never supplies executable targets to Open',()=>{
  expect(quicklinkSaveSchema.parse(save)).toEqual(save);
  expect(quicklinkSaveSchema.safeParse({...save,id,expectedRevision:1}).success).toBe(true);
  for(const input of [{...save,id},{...save,expectedRevision:1},{...save,argv:['public']},{...save,expectedRevision:-1}])expect(quicklinkSaveSchema.safeParse(input).success).toBe(false);
  expect(quicklinkSaveRequestSchema.safeParse({protocolVersion:1,...save}).success).toBe(true);
  expect(quicklinkOpenRequestSchema.safeParse({protocolVersion:1,id,revision:1,launcherRevision:1}).success).toBe(true);
  for(const extra of [{url:save.url},{name:save.name},{argv:[]},{queries:['public']}])expect(quicklinkOpenRequestSchema.safeParse({protocolVersion:1,id,revision:1,launcherRevision:1,...extra}).success).toBe(false);
  expect(quicklinkGetRequestSchema.safeParse({protocolVersion:1,id,revision:0}).success).toBe(false);
  expect(launcherCommandIdSchema.parse('linuxcast:open-quicklinks')).toBe('linuxcast:open-quicklinks');
});
it('keeps the complete 500-summary list inside the envelope without exposing full targets and rejects duplicates or partial overflow',()=>{
  const records=Array.from({length:MAX_QUICKLINKS},(_,i)=>({id:`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`,revision:Number.MAX_SAFE_INTEGER,name:'😀'.repeat(64),host:'x'.repeat(320)}));
  expect(quicklinkListSchema.parse(records)).toHaveLength(500);
  expect(Buffer.byteLength(JSON.stringify({ok:true,value:{records}}))).toBeLessThan(MAX_ENVELOPE_BYTES-4096);
  for(const input of [[...records,records[0]],records.toReversed(),[records[0],records[0]],[{...records[0],url:save.url}]])expect(quicklinkListSchema.safeParse(input).success).toBe(false);
});
it('requires truthful exact receipts and strict durable record timestamps',()=>{
  const value={id,revision:1,name:save.name,url:save.url,createdAt:'2026-10-26T00:00:00.000Z',updatedAt:'2026-10-26T00:00:00.000Z'};
  expect(quicklinkRecordReplySchema.safeParse({ok:true,value:{record:value}}).success).toBe(true);
  expect(quicklinkRecordReplySchema.safeParse({ok:true,value:{record:{...value,updatedAt:'2025-01-01T00:00:00.000Z'}}}).success).toBe(false);
  for(const outcome of ['removed','cancelled'])expect(quicklinkRemoveReplySchema.safeParse({ok:true,value:{id,revision:1,outcome}}).success).toBe(true);
  expect(quicklinkOpenReplySchema.safeParse({ok:true,value:{id,revision:1,outcome:'dispatched'}}).success).toBe(true);
  for(const outcome of ['opened','completed','success'])expect(quicklinkOpenReplySchema.safeParse({ok:true,value:{id,revision:1,outcome}}).success).toBe(false);
});

it('canonicalizes bounded saved tags, rejects ambiguous/control/delimiter input and keeps500 summaries bounded',()=>{
 expect(quicklinkTagsSchema.parse(['  Ｗｏｒｋ  ','猫','two words'])).toEqual(['Work','猫','two words']);
 for(const tags of [[''],['\nlabel'],['a,b'],['\ud800'],['x'.repeat(33)],['猫'.repeat(22)],['Work','ｗｏｒｋ'],Array.from({length:9},(_,i)=>`tag${i}`)])expect(quicklinkTagsSchema.safeParse(tags).success).toBe(false);
 expect(quicklinkSaveSchema.parse({...save,tags:[' Work ']})).toEqual({...save,tags:['Work']});
 const tags=Array.from({length:8},(_,i)=>'😀'.repeat(15)+i),records=Array.from({length:MAX_QUICKLINKS},(_,i)=>({id:`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`,revision:1,name:'😀'.repeat(64),host:'x'.repeat(320),tags}));expect(quicklinkListSchema.parse(records)).toHaveLength(500);expect(Buffer.byteLength(JSON.stringify({ok:true,value:{records}}))).toBeLessThan(MAX_ENVELOPE_BYTES-4096);
});

it('accepts only boolean presentation preferences, with absent and false as ordinary defaults',()=>{
 for(const pinned of [undefined,false,true])for(const hidden of [undefined,false,true]){const prefs={...(pinned===undefined?{}:{pinned}),...(hidden===undefined?{}:{hidden})};expect(quicklinkSaveSchema.parse({...save,...prefs})).toEqual({...save,...prefs});}
 for(const patch of [{pinned:1},{hidden:'true'},{hidden:null},{pinned:{grant:'open'}}])expect(quicklinkSaveSchema.safeParse({...save,...patch}).success).toBe(false);
});

it('binds read-only launcher entries to exact saved selections without accepting executable targets',()=>{
 const value={id:`quicklink:${id}`,quicklink:{id,revision:7},title:'Public saved link',aliases:[],keywords:['Work'],enabled:true,usage:null};expect(launcherCommandMetadataSchema.parse(value)).toEqual(value);expect(MAX_LAUNCHER_COMMANDS).toBe(5604);
 for(const patch of [{quicklink:undefined},{quicklink:{id:'00000000-0000-4000-8000-000000000002',revision:7}},{quicklink:{id,revision:0}},{quicklink:{id,revision:7,url:save.url}},{id:'linuxcast:open-quicklinks'},{applicationActions:{available:true,actions:[]}}])expect(launcherCommandMetadataSchema.safeParse({...value,...patch}).success).toBe(false);
 for(const commandId of ['quicklink:not-a-uuid','quicklink:../../public','quicklink:'+id+'x'])expect(launcherCommandIdSchema.safeParse(commandId).success).toBe(false);
});

it('exports one versioned saved definition without accepting queries, grants or false completion receipts',()=>{
 const record={id,revision:1,name:save.name,url:save.url,createdAt:'2026-10-27T00:00:00.000Z',updatedAt:'2026-10-27T00:00:00.000Z'},file={format:'linuxcast.quicklinks',formatVersion:1,records:[record]};expect(quicklinkExportFileSchema.parse(file)).toEqual(file);
 for(const patch of [{format:'other'},{formatVersion:2},{records:[]},{records:[record,record]},{query:'private'},{grants:[]}])expect(quicklinkExportFileSchema.safeParse({...file,...patch}).success).toBe(false);
 for(const outcome of ['exported','cancelled'])expect(quicklinkExportReplySchema.safeParse({ok:true,value:{id,revision:1,outcome}}).success).toBe(true);for(const outcome of ['completed','dispatched','opened'])expect(quicklinkExportReplySchema.safeParse({ok:true,value:{id,revision:1,outcome}}).success).toBe(false);
});
