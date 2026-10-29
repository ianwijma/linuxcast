import {expect,it,vi} from 'vitest';
import {DICTIONARY_CHANNELS,dictionaryQuerySchema,dictionaryWordSchema,dictionaryLanguageIdSchema,dictionaryWordIdSchema,dictionarySnapshotIdSchema,dictionaryLanguageSchema,dictionaryCatalogueSchema,dictionaryBackendSearchSchema,dictionarySearchInputSchema,dictionarySearchRequestSchema,dictionarySearchReplySchema,dictionaryCopyInputSchema,dictionaryCopyReplySchema,dictionaryReleaseRequestSchema,dictionaryReleaseReplySchema} from '../src/dictionary.ts';
const language={id:'language:'+'a'.repeat(64),name:'en_US',state:'available' as const,encoding:'UTF-8'},id='word:'+'b'.repeat(64),snapshotId='c'.repeat(64),record={id,word:'co\u0302te'};
const search={revision:2,searchId:3,query:'co',requestedLanguageId:null,language,languages:[language],languagesTruncated:false,snapshotId,records:[record],truncated:false};
const selection={revision:2,searchId:3,query:'co',languageId:language.id,snapshotId,id},copied={...selection,outcome:'copied',word:record.word};
it('closes exactly three named operations and rejects renderer text, filesystem, source and provider authority',()=>{
 expect(DICTIONARY_CHANNELS).toEqual({search:'launcher:search-dictionary',copy:'launcher:copy-dictionary-word',release:'launcher:release-dictionary-search'});expect(dictionarySearchRequestSchema.parse({protocolVersion:1,revision:2,query:'co'})).toEqual({protocolVersion:1,revision:2,query:'co'});
 for(const patch of [{revision:0},{protocolVersion:2},{path:'/tmp/public.dic'},{words:[record]},{limit:1000},{provider:'hidden'},{sql:'SELECT'}])expect(dictionarySearchRequestSchema.safeParse({protocolVersion:1,revision:2,query:'co',...patch}).success).toBe(false);
 for(const extra of [{word:'caller text'},{value:record.word},{source:'/usr/share/hunspell'},{words:[record]},{encoding:'UTF-8'}])expect(dictionaryCopyInputSchema.safeParse({...selection,...extra}).success).toBe(false);
 expect(dictionaryReleaseRequestSchema.safeParse({protocolVersion:1,revision:2,searchId:3,query:'co'}).success).toBe(false);
});
it('bounds queries before encoding and rejects controls, bidi and unpaired surrogate input',()=>{
 const encode=vi.spyOn(TextEncoder.prototype,'encode');try{for(const value of ['x'.repeat(513),'\0','\ud800','\u202e'])expect(dictionaryQuerySchema.safeParse(value).success).toBe(false);expect(encode).not.toHaveBeenCalled();}finally{encode.mockRestore();}
 for(const value of ['', 'a'.repeat(512),'雪'.repeat(512),'😀'.repeat(256),'co\u0302te','100%_literal'])expect(dictionaryQuerySchema.parse(value)).toBe(value);
 for(const value of ['\n','\u0085','\udfff','a\u2066b'])expect(dictionaryQuerySchema.safeParse(value).success).toBe(false);
});
it.each(['co\u0302te','côte','雪','👩🏽‍💻',"can't",'x'.repeat(128),'😀'.repeat(128)])('preserves exact source Unicode word %s without normalization',word=>{
 expect(dictionaryWordSchema.parse(word)).toBe(word);expect(dictionaryCopyReplySchema.parse({ok:true,value:{...copied,word}})).toMatchObject({ok:true,value:{word}});
});
it('bounds source words before allocation and rejects whitespace/control/bidi/surrogate or excess scalars',()=>{
 const encode=vi.spyOn(TextEncoder.prototype,'encode');try{expect(dictionaryWordSchema.safeParse('x'.repeat(257)).success).toBe(false);expect(encode).not.toHaveBeenCalled();}finally{encode.mockRestore();}
 for(const word of ['', 'two words','word\t','word\n','word\u00a0','\0','\u202e','\ud800','x'.repeat(129),'😀'.repeat(129)])expect(dictionaryWordSchema.safeParse(word).success).toBe(false);
});
it('accepts only bounded opaque lowercase identities rather than paths, basenames or query-derived authority',()=>{
 expect(dictionaryLanguageIdSchema.parse(language.id)).toBe(language.id);expect(dictionaryWordIdSchema.parse(id)).toBe(id);expect(dictionarySnapshotIdSchema.parse(snapshotId)).toBe(snapshotId);
 for(const schema of [dictionaryLanguageIdSchema,dictionaryWordIdSchema,dictionarySnapshotIdSchema])for(const invalid of ['/tmp/source','en_US','../private','A'.repeat(64),'a'.repeat(63),'a'.repeat(65)])expect(schema.safeParse(invalid).success).toBe(false);
});
it('requires exact defined optional language metadata and an omitted or exact requested language',()=>{
 expect(dictionarySearchInputSchema.parse({revision:2,query:'co'})).not.toHaveProperty('languageId');expect(dictionarySearchInputSchema.parse({revision:2,query:'co',languageId:language.id})).toHaveProperty('languageId',language.id);
 for(const languageId of [undefined,null,'en_US'])expect(dictionarySearchInputSchema.safeParse({revision:2,query:'co',languageId}).success).toBe(false);
 for(const patch of [{encoding:undefined},{message:undefined},{encoding:'UTF 8'},{encoding:'x'.repeat(33)},{name:'../en_US'},{name:'en US'},{message:'\u202e'},{message:'x'.repeat(513)},{path:'/tmp/source'}])expect(dictionaryLanguageSchema.safeParse({...language,...patch}).success).toBe(false);
 expect(dictionaryLanguageSchema.parse({...language,message:'Installed base entries only.'})).toHaveProperty('message');
});
it('bounds catalogue metadata and deduplicates language and source word identities/values',()=>{
 const languages=Array.from({length:64},(_,i)=>({...language,id:'language:'+i.toString(16).padStart(64,'0'),name:'language_'+i}));expect(dictionaryCatalogueSchema.parse({languages,truncated:true}).languages).toHaveLength(64);
 for(const catalogue of [{languages:[language,language],truncated:false},{languages:[...languages,language],truncated:false},{languages:[],truncated:false,paths:[]},{languages:[]}])expect(dictionaryCatalogueSchema.safeParse(catalogue).success).toBe(false);
 const backend={language,snapshotId,query:'co',words:[record],truncated:false};expect(dictionaryBackendSearchSchema.parse(backend)).toEqual(backend);for(const words of [[record,record],[record,{id:'word:'+'d'.repeat(64),word:record.word}],Array.from({length:101},()=>record)])expect(dictionaryBackendSearchSchema.safeParse({...backend,words}).success).toBe(false);expect(dictionaryBackendSearchSchema.safeParse({...backend,language:{...language,state:'invalid'}}).success).toBe(false);
});
it('requires available source snapshots and exact selected-language catalogue membership; unavailable data never carries words',()=>{
 expect(dictionarySearchReplySchema.parse({ok:true,value:search})).toEqual({ok:true,value:search});expect(dictionarySearchReplySchema.parse({ok:true,value:{...search,records:[]}})).toMatchObject({ok:true});
 for(const patch of [{requestedLanguageId:'language:'+'d'.repeat(64)},{language:{...language,encoding:'ASCII'}},{snapshotId:null},{languages:[]},{records:[record,record]},{records:[record,{...record,id:'word:'+'d'.repeat(64)}]},{records:Array.from({length:101},()=>record)},{languagesTruncated:'false'},{paths:[]}])expect(dictionarySearchReplySchema.safeParse({ok:true,value:{...search,...patch}}).success).toBe(false);
 for(const state of ['unavailable','invalid','unsupported-encoding'] as const){const unavailable={...language,state};const honest={...search,language:unavailable,languages:[unavailable],snapshotId:null,records:[],truncated:false};expect(dictionarySearchReplySchema.parse({ok:true,value:honest})).toMatchObject({ok:true,value:{records:[]}});for(const patch of [{records:[record]},{snapshotId},{truncated:true}])expect(dictionarySearchReplySchema.safeParse({ok:true,value:{...honest,...patch}}).success).toBe(false);}
 expect(dictionarySearchReplySchema.parse({ok:true,value:{...search,language:null,languages:[],snapshotId:null,records:[]}})).toMatchObject({ok:true,value:{language:null}});
});
it('accepts only actual Copy/release receipts and refuses optimistic outcomes or private extra content',()=>{
 expect(dictionaryCopyReplySchema.parse({ok:true,value:copied})).toEqual({ok:true,value:copied});for(const patch of [{outcome:'requested'},{outcome:'pasted'},{word:'two words'},{value:record.word},{path:'/tmp/source'},{snapshotId:null}])expect(dictionaryCopyReplySchema.safeParse({ok:true,value:{...copied,...patch}}).success).toBe(false);
 expect(dictionaryReleaseReplySchema.parse({ok:true,value:{outcome:'released',searchId:3}})).toMatchObject({ok:true});for(const value of [{outcome:'requested',searchId:3},{outcome:'released',searchId:0},{outcome:'released',searchId:3,word:record.word}])expect(dictionaryReleaseReplySchema.safeParse({ok:true,value}).success).toBe(false);
});
