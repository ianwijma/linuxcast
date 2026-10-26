import { expect,it,vi } from 'vitest';
import { WEB_SEARCH_TEMPLATE } from '@linuxcast/contracts';
import type { QuicklinkWebSearch } from '@linuxcast/contracts';
import { buildWebSearchUrl,WebSearchBuildError } from '../src/web-search.ts';
const config={queryParameter:'q',template:WEB_SEARCH_TEMPLATE};
it('sets exactly the configured query component while preserving authority/path/hash and other decoded query entries',()=>{
  const result=buildWebSearchUrl('https://example.org:8443/search%2Fpath?before=two%20words&q=old&middle=%26%3D&q=duplicate&after=last#fixed',config,'  Café 東京 😀 &x=1#evil /?%+{{context.clipboard}}  '),url=new URL(result);
  expect([url.protocol,url.host,url.pathname,url.hash]).toEqual(['https:','example.org:8443','/search%2Fpath','#fixed']);
  expect([...url.searchParams]).toEqual([['before','two words'],['q','  Café 東京 😀 &x=1#evil /?%+{{context.clipboard}}  '],['middle','&='],['after','last']]);
  expect(url.searchParams.getAll('q')).toHaveLength(1);
  expect(result).toContain('q=++Caf%C3%A9+%E6%9D%B1%E4%BA%AC+%F0%9F%98%80+%26x%3D1%23evil+%2F%3F%25%2B%7B%7Bcontext.clipboard%7D%7D++');
});
it('canonicalizes literal bases and appends a new parameter without reinterpreting query braces or shell-looking text',()=>{
  expect(buildWebSearchUrl('HTTPS://例え.example:443/lookup?keep=%7Bliteral%7D#part',{queryParameter:'Search.Query-1',template:WEB_SEARCH_TEMPLATE},'$(echo public); {{vars.query}}')).toBe('https://xn--r8jz45g.example/lookup?keep=%7Bliteral%7D&Search.Query-1=%24%28echo+public%29%3B+%7B%7Bvars.query%7D%7D#part');
});
it('captures fresh query values per call without mutating a frozen configuration',()=>{
  const frozen=Object.freeze({...config});
  expect(new URL(buildWebSearchUrl('https://example.org/',frozen,'first')).searchParams.get('q')).toBe('first');
  expect(new URL(buildWebSearchUrl('https://example.org/',frozen,'second')).searchParams.get('q')).toBe('second');
  expect(frozen).toEqual(config);
});
it.each(['',' ','\t','line\nline','\u0000','\u007f','\ud800','x'.repeat(2049),'é'.repeat(1025)])('rejects invalid query %# before any target can be used',query=>{
  expect(()=>buildWebSearchUrl('https://example.org/',config,query)).toThrowError(expect.objectContaining({reason:'invalid-query',message:'Invalid web search query.'}));
});
it.each(['https://user:pass@example.org/','file:///tmp/public','javascript:alert(1)','https://example.org/{{vars.query}}','https://example.org/\ud800'])('rejects invalid literal base %#',base=>{
  expect(()=>buildWebSearchUrl(base,config,'public')).toThrowError(expect.objectContaining({reason:'invalid-definition'}));
});
it.each([{queryParameter:'q',template:'{{context.clipboard}}'},{queryParameter:'q&extra',template:WEB_SEARCH_TEMPLATE},{queryParameter:'1query',template:WEB_SEARCH_TEMPLATE},{queryParameter:'x'.repeat(65),template:WEB_SEARCH_TEMPLATE},{...config,extra:'public'},null])('rejects forged definitions %#',value=>{
  expect(()=>buildWebSearchUrl('https://example.org/',value as QuicklinkWebSearch,'public')).toThrowError(expect.objectContaining({reason:'invalid-definition'}));
});
it('never invokes configuration accessors or follows inherited fields',()=>{
  const getter=vi.fn(()=> 'q');
  for(const value of [Object.defineProperty({template:WEB_SEARCH_TEMPLATE},'queryParameter',{get:getter}),Object.create(config)])expect(()=>buildWebSearchUrl('https://example.org/',value,'public')).toThrow(WebSearchBuildError);
  expect(getter).not.toHaveBeenCalled();
});
it('accepts query boundaries and rejects expansion beyond the8192-byte target limit',()=>{
  expect(new URL(buildWebSearchUrl('https://example.org/',config,'é'.repeat(1024))).searchParams.get('q')).toBe('é'.repeat(1024));
  const base='https://example.org/'+ 'a'.repeat(7000);
  expect(()=>buildWebSearchUrl(base,config,'é'.repeat(1024))).toThrowError(expect.objectContaining({reason:'result-too-large',message:'Web search target exceeds the size limit.'}));
  const prefix='https://example.org/?q=';
  expect(buildWebSearchUrl('https://example.org/'+ 'a'.repeat(8192-prefix.length-1),config,'x').length).toBe(8192);
});
