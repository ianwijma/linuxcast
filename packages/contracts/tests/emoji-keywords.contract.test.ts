import {expect,it} from 'vitest';
import {canonicalEmojiId,emojiKeywordSchema,emojiKeywordListSchema,emojiKeywordEntriesSchema,emojiKeywordSnapshotSchema,parseEmojiKeywordSetting,emojiKeywordsRequestSchema,emojiKeywordsReplySchema,emojiSearchReplySchema} from '../src/emoji.ts';
import {formFieldSchema} from '../src/views.ts';
const row={id:canonicalEmojiId('👩🏽‍💻'),value:'👩🏽‍💻',name:'woman technologist: medium skin tone',group:'People & Body',subgroup:'person-role',version:'4.0'};
const other=canonicalEmojiId('😀'),entries=[{id:row.id,keywords:['public café','team 👩🏽‍💻']}];
const request={protocolVersion:1,revision:2,searchId:3,query:'public café',group:row.group,tone:'medium',favouritesOnly:true,id:row.id,keywords:['public café'],keywordsRevision:4};
const receipt={outcome:'updated',revision:2,searchId:3,query:'public café',group:row.group,tone:'medium',favouritesOnly:true,id:row.id,keywords:['public café'],keywordsRevision:5};
const search={revision:2,searchId:3,datasetVersion:'17.0',query:'public café',group:row.group,groups:[{id:row.group,name:row.group,count:1}],keywords:{available:true,revision:4},records:[{...row,customKeywords:['public café']}]};
it('preserves literal Unicode phrases without normalization or executable interpretation',()=>{
 for(const value of ['public café','cafe\u0301','👩🏽‍💻','🇦🇺','<script>public</script>','a'.repeat(64),'😀'.repeat(64)])expect(emojiKeywordSchema.parse(value)).toBe(value);
 expect(emojiKeywordListSchema.parse([])).toEqual([]);expect(emojiKeywordListSchema.parse(['café','cafe\u0301'])).toEqual(['café','cafe\u0301']);
});
it('refuses controls, bidi, surrogates, separators, whitespace-only/punctuation-only, untrimmed and oversized phrases',()=>{
 for(const value of ['', ' ', '!!!', '\u0301', ' leading','trailing ', '\u00a0public', 'public\nline','public\tline','public\u0000','public\u202e','public\u2066','public\ud800','public\u2028line','public\u2029line','a'.repeat(65),'😀'.repeat(65)])expect(emojiKeywordSchema.safeParse(value).success,value).toBe(false);
 expect(emojiKeywordListSchema.safeParse(['public','public']).success).toBe(false);expect(emojiKeywordListSchema.safeParse(Array.from({length:17},(_,i)=>`public ${i}`)).success).toBe(false);
});
it('requires sorted unique nonempty canonical entries and exact private JSON serialization',()=>{
 expect(parseEmojiKeywordSetting(JSON.stringify(entries))).toEqual(entries);expect(parseEmojiKeywordSetting('[]')).toEqual([]);
 const sorted=[...entries,{id:other,keywords:['public smile']}].sort((a,b)=>a.id<b.id?-1:1);expect(emojiKeywordEntriesSchema.parse(sorted)).toEqual(sorted);
 for(const value of [null,undefined,'null','{}','[ ]',JSON.stringify(entries,null,2),JSON.stringify([{keywords:['public café'],id:row.id}]),JSON.stringify([{...entries[0],extra:'public'}]),JSON.stringify([{id:row.id,keywords:[]}]),JSON.stringify([...entries,...entries]),JSON.stringify([...sorted].reverse()),JSON.stringify([{id:'emoji:23',keywords:['public']}])])expect(parseEmojiKeywordSetting(value)).toBeUndefined();
});
it('bounds full stored snapshots, aggregate bytes, entry count and safe revision',()=>{
 expect(emojiKeywordSnapshotSchema.parse({revision:0,entries:[]})).toEqual({revision:0,entries:[]});
 for(const value of [{revision:-1,entries:[]},{revision:Number.MAX_SAFE_INTEGER,entries:[]},{revision:0,entries:[],path:'/tmp/public'},{revision:0,entries:undefined}])expect(emojiKeywordSnapshotSchema.safeParse(value).success).toBe(false);
 const full=Array.from({length:4096},(_,i)=>({id:`emoji:${(0x10000+i).toString(16)}`,keywords:['public']}));expect(emojiKeywordEntriesSchema.safeParse(full).success).toBe(true);expect(emojiKeywordEntriesSchema.safeParse([...full,{id:'emoji:20000',keywords:['public']}]).success).toBe(false);
 expect(emojiKeywordEntriesSchema.safeParse(full.map(entry=>({...entry,keywords:Array.from({length:16},(_,i)=>`${i} ${'a'.repeat(60)}`)}))).success).toBe(false);expect(parseEmojiKeywordSetting(' '.repeat(524289))).toBeUndefined();
});
it('accepts only the named selected-context write with a complete replacement list including explicit clear',()=>{
 expect(emojiKeywordsRequestSchema.parse(request)).toEqual(request);expect(emojiKeywordsRequestSchema.parse({...request,keywords:[]})).toEqual({...request,keywords:[]});
 for(const patch of [{protocolVersion:2},{keywords:null},{keywords:undefined},{keywordsRevision:undefined},{keywordsRevision:-1},{keywordsRevision:Number.MAX_SAFE_INTEGER},{id:other,value:'😀'},{path:'/tmp/public'},{entries},{settings:'emoji.keywords'},{tone:undefined},{favouritesOnly:undefined}])expect(emojiKeywordsRequestSchema.safeParse({...request,...patch}).success).toBe(false);
});
it('keeps keyword replies closed and explicit, without renderer storage/source authority',()=>{
 expect(emojiKeywordsReplySchema.parse({ok:true,value:receipt})).toEqual({ok:true,value:receipt});
 for(const patch of [{outcome:'saved'},{keywords:undefined},{keywordsRevision:0},{keywordsRevision:undefined},{entries},{value:row.value},{tone:undefined},{favouritesOnly:undefined}])expect(emojiKeywordsReplySchema.safeParse({ok:true,value:{...receipt,...patch}}).success).toBe(false);
});
it('distinguishes unavailable custom matching from a valid empty saved list and supports old mocks without metadata',()=>{
 expect(emojiSearchReplySchema.parse({ok:true,value:search})).toEqual({ok:true,value:search});expect(emojiSearchReplySchema.safeParse({ok:true,value:{...search,records:[{...row,customKeywords:[]}]}}).success).toBe(true);
 const {keywords:_,...old}=search;void _;expect(emojiSearchReplySchema.safeParse({ok:true,value:{...old,records:[row]}}).success).toBe(true);
 expect(emojiSearchReplySchema.safeParse({ok:true,value:{...old,keywords:{available:false},records:[row]}}).success).toBe(true);
 for(const patch of [{keywords:undefined},{keywords:{available:true}},{keywords:{available:false,revision:0}},{keywords:{available:false}},{records:[row]},{records:[{...row,customKeywords:undefined}]},{records:[{...row,customKeywords:['public','public']}]},{keywords:{available:true,revision:4,entries}}])expect(emojiSearchReplySchema.safeParse({ok:true,value:{...search,...patch}}).success).toBe(false);
});
it('adds multiline only to bounded ordinary text fields while retaining closed shared Form fields',()=>{
 const field={kind:'text',id:'public-keywords',title:'Search keywords',required:false,value:'public café\nteam emoji',multiline:true};expect(formFieldSchema.parse(field)).toEqual(field);
 for(const patch of [{multiline:false},{multiline:'true'},{kind:'secret'},{kind:'number',value:1},{rows:100},{value:'a'.repeat(65537)}])expect(formFieldSchema.safeParse({...field,...patch}).success).toBe(false);
});
