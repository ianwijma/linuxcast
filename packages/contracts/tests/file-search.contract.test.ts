import { expect,it } from 'vitest';
import { fileSearchQueryRequestSchema,fileSearchQueryReplySchema,fileSearchStateSchema,fileSearchResultSchema } from '../src/file-search.ts';
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
