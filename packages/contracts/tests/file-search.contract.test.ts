import { expect,it } from 'vitest';
import { fileSearchQueryRequestSchema,fileSearchQueryReplySchema,fileSearchStateSchema,fileSearchResultSchema,indexedPathCopyRequestSchema,indexedPathCopyReplySchema,fileSearchOptionsSchema,fileSearchOptionsKey,fileSearchMatchesOptions,fileSearchMatchesDirectory,indexedTextPreviewRequestSchema,indexedTextPreviewReplySchema } from '../src/file-search.ts';
const rootId='11111111-1111-4111-8111-111111111111',generation='22222222-2222-4222-8222-222222222222';
const result={id:`${rootId}:public.txt`,rootId,generation,path:'public.txt',kind:'file',size:4,modifiedMs:1};
it('accepts bounded metadata identities and rejects traversal, content and scope confusion',()=>{
  expect(fileSearchResultSchema.safeParse(result).success).toBe(true);
  for(const path of ['/public.txt','../public.txt','a/../public.txt','a//public','a/./public','a\0b'])expect(fileSearchResultSchema.safeParse({...result,path,id:`${rootId}:${path}`}).success).toBe(false);
  expect(fileSearchResultSchema.safeParse({...result,content:'private'}).success).toBe(false);
  for(const results of [[result,result],[{...result,rootId:generation,id:`${generation}:public.txt`}]])expect(fileSearchQueryReplySchema.safeParse({ok:true,value:{query:'public',rootId,results}}).success).toBe(false);
});
it('bounds UTF8 queries and root sets without introducing renderer path authority',()=>{
  expect(fileSearchQueryRequestSchema.safeParse({protocolVersion:1,query:'é'.repeat(256)}).success).toBe(true);
  for(const query of ['é'.repeat(257),'x'.repeat(513)])expect(fileSearchQueryRequestSchema.safeParse({protocolVersion:1,query}).success).toBe(false);
  expect(fileSearchQueryRequestSchema.safeParse({protocolVersion:1,query:'public',path:'/private'}).success).toBe(false);
  const selected={id:rootId,name:'Public',displayPath:'/synthetic/public',state:'idle',activity:'paused',generation:null,progress:null};
  expect(fileSearchStateSchema.safeParse({revision:1,appearance:'dark',roots:[selected]}).success).toBe(true);
  expect(fileSearchStateSchema.safeParse({revision:1,appearance:'dark',roots:[selected,selected]}).success).toBe(false);
});

it('limits copy authority to a single indexed identity and canonical bounded receipt path',()=>{
  const selection={resultId:result.id,rootId,generation};expect(indexedPathCopyRequestSchema.safeParse({...selection,protocolVersion:1}).success).toBe(true);
  for(const payload of [{...selection,protocolVersion:1,path:'/private'},{...selection,protocolVersion:1,text:'private'},[selection]])expect(indexedPathCopyRequestSchema.safeParse(payload).success).toBe(false);
  const reply={ok:true,value:{...selection,outcome:'copied',path:'/synthetic/public/public.txt'}};expect(indexedPathCopyReplySchema.safeParse(reply).success).toBe(true);
  for(const path of ['relative','/a/../b','/a//b','/a/./b','/a\0b','/a\ud800','/'+ 'x'.repeat(8193)])expect(indexedPathCopyReplySchema.safeParse({...reply,value:{...reply.value,path}}).success).toBe(false);
});

it('validates closed options, canonical default identity and inclusive/exclusive UTC epoch bounds',()=>{
  expect(fileSearchOptionsKey()).toBe(fileSearchOptionsKey({sort:'relevance'}));
  expect(fileSearchOptionsSchema.parse({sort:'name',modifiedFromMs:-1,modifiedBeforeMs:0})).toMatchObject({modifiedBeforeMs:0});
  for(const options of [{sort:'injected'},{sort:'name',extra:true},{sort:'name',kind:'symlink'},{sort:'name',modifiedFromMs:0,modifiedBeforeMs:0},{sort:'name',modifiedFromMs:0.5},{sort:'name',modifiedBeforeMs:Number.MAX_SAFE_INTEGER+1}])expect(fileSearchOptionsSchema.safeParse(options).success).toBe(false);
  const options={sort:'name' as const,kind:'file' as const,modifiedFromMs:0,modifiedBeforeMs:1};
  expect(fileSearchMatchesOptions({kind:'file',modifiedMs:0},options)).toBe(true);
  for(const row of [{kind:'directory' as const,modifiedMs:0},{kind:'file' as const,modifiedMs:-1},{kind:'file' as const,modifiedMs:1}])expect(fileSearchMatchesOptions(row,options)).toBe(false);
});

it('bounds indexed directory scope to a selected root and direct relative children',()=>{
  for(const directory of ['', 'Public reports', 'a/b'])expect(fileSearchQueryRequestSchema.safeParse({protocolVersion:1,query:'',rootId,directory}).success).toBe(true);
  for(const directory of ['/private','../private','a/../b','a//b','a/','a\0b'])expect(fileSearchQueryRequestSchema.safeParse({protocolVersion:1,query:'',rootId,directory}).success).toBe(false);
  expect(fileSearchQueryRequestSchema.safeParse({protocolVersion:1,query:'',directory:''}).success).toBe(false);
  expect(fileSearchMatchesDirectory({path:'a/b.txt'},'a')).toBe(true);expect(fileSearchMatchesDirectory({path:'a/b/c.txt'},'a')).toBe(false);expect(fileSearchMatchesDirectory({path:'ab/c.txt'},'a')).toBe(false);expect(fileSearchMatchesDirectory({path:'top.txt'},'')).toBe(true);
  expect(fileSearchQueryReplySchema.safeParse({ok:true,value:{query:'',rootId,directory:'a',results:[result]}}).success).toBe(false);
});

it('keeps text preview explicit identity-only with bounded literal UTF8 replies',()=>{
 const selection={resultId:result.id,rootId,generation},request={...selection,protocolVersion:1};expect(indexedTextPreviewRequestSchema.safeParse(request).success).toBe(true);
 for(const bad of [{...request,path:'/private'},{...request,rootPath:'/private'},{...request,mime:'text/plain'},[request]])expect(indexedTextPreviewRequestSchema.safeParse(bad).success).toBe(false);
 const reply={ok:true,value:{...selection,outcome:'previewed',text:'<script>public</script>'}};expect(indexedTextPreviewReplySchema.safeParse(reply).success).toBe(true);
 for(const text of ['', 'é'.repeat(32768),'a\t\n\rb'])expect(indexedTextPreviewReplySchema.safeParse({...reply,value:{...reply.value,text}}).success).toBe(true);
 for(const text of ['é'.repeat(32769),'a\0b','a\u0001b','\ud800','a\u007fb'])expect(indexedTextPreviewReplySchema.safeParse({...reply,value:{...reply.value,text}}).success).toBe(false);
 expect(indexedTextPreviewReplySchema.safeParse({...reply,value:{...reply.value,path:'/private'}}).success).toBe(false);
});
