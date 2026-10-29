import {expect,it,vi} from 'vitest';
import {DICTIONARY_SPELLING_CHANNELS as channels,dictionarySpellingRequestSchema,dictionarySpellingReplySchema,dictionarySpellingCopyRequestSchema,dictionarySpellingTextSchema,nativeSpellingRequestSchema,nativeSpellingEventSchema} from '../src/dictionary-spelling.ts';
const request={protocolVersion:1,revision:1,requestId:'00000000-0000-4000-8000-000000000001',languageId:`language:${'a'.repeat(64)}`,word:'cats'},value={revision:request.revision,requestId:request.requestId,languageId:request.languageId,word:request.word,language:{id:request.languageId,name:'en_US',state:'available',encoding:'UTF-8'},checkId:1,snapshotId:'c'.repeat(64),backend:'hunspell-1.7',correct:true,records:[{id:`spelling:${'b'.repeat(64)}`,text:'cats'}],truncated:false};
it('closes three named spelling operations without renderer filesystem, executable or native resource authority',()=>{
 expect(channels).toEqual({check:'launcher:check-dictionary-spelling',copy:'launcher:copy-dictionary-spelling',release:'launcher:release-dictionary-spelling'});expect(dictionarySpellingRequestSchema.parse(request)).toEqual(request);
 for(const patch of [{path:'/usr/share/public.dic'},{affFd:3},{executable:'hunspell'},{timeout:100},{backend:'fallback'},{suggestions:[]},{word:'two words'},{requestId:'old'}])expect(dictionarySpellingRequestSchema.safeParse({...request,...patch}).success).toBe(false);
 const copy={...request,checkId:1,snapshotId:value.snapshotId,id:value.records[0]!.id};expect(dictionarySpellingCopyRequestSchema.parse(copy)).toEqual(copy);expect(dictionarySpellingCopyRequestSchema.safeParse({...copy,text:'caller text'}).success).toBe(false);
});
it('requires recognised results to offer only the exact original word, and bad-word suggestions to have unique bounded identities/text',()=>{
 expect(dictionarySpellingReplySchema.parse({ok:true,value})).toEqual({ok:true,value});
 for(const patch of [{records:[]},{records:[{...value.records[0],text:'other'}]},{truncated:true},{language:{...value.language,state:'unavailable'}},{records:[...value.records,...value.records]},{backend:'guessed'},{private:'SYNTHETIC_PRIVATE'}])expect(dictionarySpellingReplySchema.safeParse({ok:true,value:{...value,...patch}}).success).toBe(false);
 expect(dictionarySpellingReplySchema.safeParse({ok:true,value:{...value,correct:false,records:[],truncated:false}}).success).toBe(true);
 expect(dictionarySpellingReplySchema.safeParse({ok:true,value:{...value,correct:false,records:[{...value.records[0],text:'two words'}]}}).success).toBe(true);
});
it('preserves canonical suggestion spaces and Unicode while bounding input and control characters',()=>{
 const encode=vi.spyOn(TextEncoder.prototype,'encode');try{expect(dictionarySpellingTextSchema.safeParse('x'.repeat(513)).success).toBe(false);expect(encode).not.toHaveBeenCalled();}finally{encode.mockRestore();}
 for(const text of ['two words','café','co\u0302te','雪','😀'.repeat(256)])expect(dictionarySpellingTextSchema.parse(text)).toBe(text);
 for(const text of ['', ' leading','trailing ','two\nwords','\u202e','\ud800','😀'.repeat(257),'x'.repeat(513)])expect(dictionarySpellingTextSchema.safeParse(text).success).toBe(false);
});
it('freezes a one-word native request and exact ready/result/failed events; unsupported is never a bad-word result',()=>{
 expect(nativeSpellingRequestSchema.parse({protocolVersion:1,kind:'check',word:'cats'})).toHaveProperty('word','cats');expect(nativeSpellingRequestSchema.safeParse({protocolVersion:1,kind:'check',word:'cats',path:'/private'}).success).toBe(false);
 for(const event of [{protocolVersion:1,kind:'ready',backend:'hunspell-1.7'},{protocolVersion:1,kind:'failed',code:'unsupported-encoding'},{protocolVersion:1,kind:'result',backend:'hunspell-1.7',word:'cats',correct:true,suggestions:[],truncated:false}])expect(nativeSpellingEventSchema.safeParse(event).success).toBe(true);
 for(const event of [{protocolVersion:1,kind:'ready',backend:'fallback'},{protocolVersion:1,kind:'failed',code:'unavailable',word:'private'},{protocolVersion:1,kind:'result',backend:'hunspell-1.7',word:'cats',correct:true,suggestions:['dogs'],truncated:false}])expect(nativeSpellingEventSchema.safeParse(event).success).toBe(false);
});
