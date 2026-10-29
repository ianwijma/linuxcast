import {expect,it,vi} from 'vitest';
import {EMOJI_CHANNELS,canonicalEmojiId,emojiQuerySchema,emojiValueSchema,emojiIdSchema,emojiRowSchema,emojiSearchInputSchema,emojiSearchRequestSchema,emojiSearchReplySchema,emojiCopyInputSchema,emojiCopyReplySchema,emojiReleaseRequestSchema,emojiReleaseReplySchema} from '../src/emoji.ts';
import {emojiToneSchema,emojiMatchesTone,emojiCopyRequestSchema} from '../src/emoji.ts';
const row={id:'emoji:1f469-1f3fd-200d-1f4bb',value:'👩🏽‍💻',name:'woman technologist: medium skin tone',group:'People & Body',subgroup:'person-role',version:'4.0'};
const group={id:row.group,name:row.group,count:2418};
const search={revision:2,searchId:3,datasetVersion:'17.0',query:'coder',group:null,groups:[group],records:[row]};
const copy={outcome:'copied',revision:2,searchId:3,query:'coder',group:null,id:row.id,value:row.value};
it('provides only three named fixed Emoji operations with closed renderer authority',()=>{
 expect(EMOJI_CHANNELS).toEqual({search:'launcher:search-emoji',copy:'launcher:copy-emoji',release:'launcher:release-emoji-search'});
 expect(emojiSearchRequestSchema.parse({protocolVersion:1,revision:2,query:'coder'})).toEqual({protocolVersion:1,revision:2,query:'coder'});
 for(const extra of [{limit:3944},{value:'caller clipboard text'},{path:'/tmp/public'},{sql:'SELECT'},{provider:'hidden'},{revision:0},{revision:Number.MAX_SAFE_INTEGER+1}])expect(emojiSearchInputSchema.safeParse({revision:2,query:'coder',...extra}).success).toBe(false);
 for(const extra of [{value:row.value},{text:'caller clipboard text'},{ids:[row.id]},{permission:true}])expect(emojiCopyInputSchema.safeParse({revision:2,searchId:3,query:'coder',id:row.id,...extra}).success).toBe(false);
 expect(emojiReleaseRequestSchema.safeParse({protocolVersion:1,revision:2,searchId:3,query:'coder'}).success).toBe(false);expect(emojiSearchRequestSchema.safeParse({protocolVersion:2,revision:2,query:'coder'}).success).toBe(false);
});
it('bounds queries before expensive encoding and rejects controls, unpaired surrogates and bidi control',()=>{
 const encode=vi.spyOn(TextEncoder.prototype,'encode');try{expect(emojiQuerySchema.safeParse('x'.repeat(513)).success).toBe(false);for(const value of ['\0','\ud800','\u202e'])expect(emojiQuerySchema.safeParse(value).success).toBe(false);expect(encode).not.toHaveBeenCalled();}finally{encode.mockRestore();}
 for(const value of ['a'.repeat(512),'雪'.repeat(512),'😀'.repeat(256),'co\u0302te','👩🏽‍💻'])expect(emojiQuerySchema.safeParse(value).success).toBe(true);
 for(const value of ['\0','\n','\u0085','\ud800','\udfff','a\u202eb','\u2066'])expect(emojiQuerySchema.safeParse(value).success).toBe(false);
});
it.each(['❤️','👩🏽‍💻','🇦🇺','#️⃣','🏳️‍🌈','🏴\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}'])('preserves exact canonical %s sequences and minimum4-padded IDs',value=>{
 const id=canonicalEmojiId(value);expect(emojiIdSchema.parse(id)).toBe(id);expect(emojiValueSchema.parse(value)).toBe(value);expect(emojiRowSchema.parse({...row,id,value}).value).toBe(value);expect(emojiCopyReplySchema.parse({ok:true,value:{...copy,id,value}})).toEqual({ok:true,value:{...copy,id,value}});
});
it('rejects forged canonical identities, oversized values and unapproved metadata authority',()=>{
 expect(canonicalEmojiId('#️⃣')).toBe('emoji:0023-fe0f-20e3');
 for(const value of [{...row,id:'emoji:1f600'},{...row,value:'👩‍💻'},{...row,keywords:['caller']},{...row,url:'https://example.invalid'},{...row,value:'x'.repeat(129)},{...row,value:'😀'.repeat(33)},{...row,value:'\u202e'},{...row,value:'\ud800'}])expect(emojiRowSchema.safeParse(value).success).toBe(false);
 for(const id of ['emoji:1F600','emoji:23-fe0f-20e3','emoji:1f600/path','emoji:'+'1f600-'.repeat(33)])expect(emojiIdSchema.safeParse(id).success).toBe(false);
});
it('bounds and closes search pages, requiring distinct rows/groups and category membership',()=>{
 expect(emojiSearchReplySchema.parse({ok:true,value:search})).toEqual({ok:true,value:search});
 for(const patch of [{datasetVersion:'latest'},{records:Array.from({length:101},()=>row)},{records:[row,row]},{groups:[group,group]},{groups:[]},{group:'Unknown'},{records:[{...row,group:'Other'}]},{group:row.group,records:[{...row,group:'Other'}]},{query:'x'.repeat(513)},{raw:'SYNTHETIC_PRIVATE'}])expect(emojiSearchReplySchema.safeParse({ok:true,value:{...search,...patch}}).success).toBe(false);
 expect(emojiSearchReplySchema.safeParse({ok:true,value:{...search,records:[]}}).success).toBe(true);
});
it('admits only actual copied/released receipts and rejects optimistic, extra or mismatched Unicode outcomes',()=>{
 expect(emojiCopyReplySchema.parse({ok:true,value:copy})).toEqual({ok:true,value:copy});
 for(const patch of [{outcome:'requested'},{outcome:'pasted'},{value:'👩‍💻'},{id:'emoji:1f600'},{path:'/tmp/public'},{text:'SYNTHETIC_PRIVATE'}])expect(emojiCopyReplySchema.safeParse({ok:true,value:{...copy,...patch}}).success).toBe(false);
 expect(emojiReleaseReplySchema.parse({ok:true,value:{outcome:'released',searchId:3}})).toMatchObject({ok:true});for(const value of [{outcome:'released',searchId:0},{outcome:'released',searchId:3,query:'private'},{outcome:'copied',searchId:3}])expect(emojiReleaseReplySchema.safeParse({ok:true,value}).success).toBe(false);
});

it('admits only the six tone filters or an omitted All field, rejecting null, own undefined and unsupported authority',()=>{
 for(const tone of ['unmodified','light','medium-light','medium','medium-dark','dark']){
  expect(emojiToneSchema.parse(tone)).toBe(tone);expect(emojiSearchInputSchema.parse({revision:2,query:'coder',tone}).tone).toBe(tone);expect(emojiCopyInputSchema.parse({revision:2,query:'coder',searchId:3,id:row.id,tone}).tone).toBe(tone);
 }
 expect(Object.hasOwn(emojiSearchInputSchema.parse({revision:2,query:'coder'}),'tone')).toBe(false);
 for(const tone of [null,undefined,'all','Light','medium_dark','',0,{},['medium']]){
  for(const schema of [emojiSearchInputSchema,emojiSearchRequestSchema])expect(schema.safeParse({revision:2,query:'coder',tone,...(schema===emojiSearchRequestSchema?{protocolVersion:1}:{})}).success).toBe(false);
  for(const schema of [emojiCopyInputSchema,emojiCopyRequestSchema])expect(schema.safeParse({revision:2,searchId:3,query:'coder',id:row.id,tone,...(schema===emojiCopyRequestSchema?{protocolVersion:1}:{})}).success).toBe(false);
 }
 expect(emojiSearchInputSchema.safeParse({revision:2,query:'coder',skinTone:'medium'}).success).toBe(false);expect(emojiReleaseRequestSchema.safeParse({protocolVersion:1,revision:2,searchId:3,tone:'medium'}).success).toBe(false);
});
it('uses contains-modifier semantics for real mixed sequences and no-modifier semantics for unmodified values',()=>{
 const mixed='🫱🏻‍🫲🏿';expect(emojiMatchesTone(mixed,'light')).toBe(true);expect(emojiMatchesTone(mixed,'dark')).toBe(true);
 for(const tone of ['medium-light','medium','medium-dark','unmodified'] as const)expect(emojiMatchesTone(mixed,tone)).toBe(false);
 for(const value of ['👩‍💻','❤️','🇦🇺','#️⃣'])expect(emojiMatchesTone(value,'unmodified')).toBe(true);
 for(const [tone,modifier] of [['light','🏻'],['medium-light','🏼'],['medium','🏽'],['medium-dark','🏾'],['dark','🏿']] as const){expect(emojiMatchesTone('👍'+modifier,tone)).toBe(true);expect(emojiMatchesTone('👍'+modifier,'unmodified')).toBe(false);}
});
it('rejects row/tone mismatch in successful pages and Copy receipts while preserving canonical mixed sequences',()=>{
 const mixedValue='🫱🏻‍🫲🏿',mixed={...row,id:canonicalEmojiId(mixedValue),value:mixedValue};
 for(const tone of ['light','dark'] as const){expect(emojiSearchReplySchema.parse({ok:true,value:{...search,tone,records:[mixed]}})).toMatchObject({ok:true,value:{tone,records:[{id:mixed.id,value:mixedValue}]}});expect(emojiCopyReplySchema.parse({ok:true,value:{...copy,tone,id:mixed.id,value:mixedValue}})).toMatchObject({ok:true,value:{tone,id:mixed.id,value:mixedValue}});}
 const plainValue='👩‍💻',plain={...row,id:canonicalEmojiId(plainValue),value:plainValue};expect(emojiSearchReplySchema.parse({ok:true,value:{...search,tone:'unmodified',records:[plain]}})).toMatchObject({ok:true,value:{records:[{value:plainValue}]}});
 for(const [tone,record] of [['unmodified',row],['medium',mixed],['light',plain]] as const){expect(emojiSearchReplySchema.safeParse({ok:true,value:{...search,tone,records:[record]}}).success).toBe(false);expect(emojiCopyReplySchema.safeParse({ok:true,value:{...copy,tone,id:record.id,value:record.value}}).success).toBe(false);}
 expect(emojiSearchReplySchema.safeParse({ok:true,value:{...search,tone:'dark',records:[]}}).success).toBe(true);
 for(const tone of [undefined,null,'all']){expect(emojiSearchReplySchema.safeParse({ok:true,value:{...search,tone}}).success).toBe(false);expect(emojiCopyReplySchema.safeParse({ok:true,value:{...copy,tone}}).success).toBe(false);}
 const all=emojiSearchReplySchema.parse({ok:true,value:search});expect(all.ok).toBe(true);if(all.ok)expect(Object.hasOwn(all.value,'tone')).toBe(false);
});
