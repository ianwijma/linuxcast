import { expect,it,vi } from 'vitest';
import { PATH_ARGUMENT_TEMPLATE } from '@linuxcast/contracts';
import type { QuicklinkPathArgument } from '@linuxcast/contracts';
import { buildPathArgumentUrl,PathArgumentBuildError } from '../src/path-argument.ts';
const config={component:'path-segment' as const,template:PATH_ARGUMENT_TEMPLATE};
it('appends exactly one encoded path component while preserving literal authority, old path, query and fragment',()=>{
 const base='https://example.org:8443/base%2Ffixed?before=two%20words&q=literal&q=duplicate#fixed',argument='  Café 東京 😀 /\\?x=1#frag% +!$() {{context.clipboard}}  ',result=buildPathArgumentUrl(base,config,argument),url=new URL(result),original=new URL(base);
 expect(url.origin).toBe(original.origin);expect(url.search).toBe(original.search);expect(url.hash).toBe(original.hash);expect(url.pathname.startsWith('/base%2Ffixed/')).toBe(true);expect(url.pathname.slice('/base%2Ffixed/'.length)).not.toContain('/');expect(decodeURIComponent(url.pathname.slice('/base%2Ffixed/'.length))).toBe(argument);expect(result).toContain('%2F%5C%3Fx%3D1%23frag%25%20%2B%21%24%28%29');
});
it('handles root and trailing separators, canonical bases and percent-looking values without recursive interpretation',()=>{
 expect(buildPathArgumentUrl('HTTPS://例え.example:443/base/',config,'%2e%2e/%2f/..')).toBe('https://xn--r8jz45g.example/base/%252e%252e%2F%252f%2F..');expect(buildPathArgumentUrl('https://example.org/',config,'{{vars.query}}')).toBe('https://example.org/%7B%7Bvars.query%7D%7D');expect(new URL(buildPathArgumentUrl('https://example.org/base?keep=%7Bliteral%7D#part',config,'../other')).pathname).toBe('/base/..%2Fother');
});
it.each(['.','..','',' ','line\nline','line\tline','\u0000','\u007f','\ud800','x'.repeat(2049),'é'.repeat(1025)])('rejects invalid argument %# without silently normalizing it',query=>{
 expect(()=>buildPathArgumentUrl('https://example.org/base',config,query)).toThrowError(expect.objectContaining({reason:'invalid-query',message:'Invalid path argument.'}));
});
it.each(['file:///tmp/public','https://user:pass@example.org/','https://example.org/{query}','https://example.org/\ud800'])('rejects invalid base %# before constructing a target',base=>expect(()=>buildPathArgumentUrl(base,config,'public')).toThrowError(expect.objectContaining({reason:'invalid-definition'})));
it('requires a strict fixed data-only configuration and never calls accessors or mutates the source',()=>{
 const getter=vi.fn(()=> 'path-segment');for(const value of [null,{...config,component:'query'},{...config,template:'{{context.clipboard}}'},{...config,extra:true},Object.create(config),Object.defineProperty({template:PATH_ARGUMENT_TEMPLATE},'component',{get:getter})])expect(()=>buildPathArgumentUrl('https://example.org/',value as QuicklinkPathArgument,'public')).toThrow(PathArgumentBuildError);expect(getter).not.toHaveBeenCalled();const frozen=Object.freeze({...config});expect(buildPathArgumentUrl('https://example.org/',frozen,'first')).toBe('https://example.org/first');expect(buildPathArgumentUrl('https://example.org/',frozen,'second')).toBe('https://example.org/second');expect(frozen).toEqual(config);
});
it('accepts bounded Unicode input and an exact8192-byte result but refuses expansion overflow',()=>{
 expect(decodeURIComponent(new URL(buildPathArgumentUrl('https://example.org/',config,'é'.repeat(1024))).pathname.slice(1))).toBe('é'.repeat(1024));expect(()=>buildPathArgumentUrl('https://example.org/'+'a'.repeat(7000),config,'é'.repeat(1024))).toThrowError(expect.objectContaining({reason:'result-too-large'}));const prefix='https://example.org/';expect(buildPathArgumentUrl(prefix+'a'.repeat(8192-prefix.length-2),config,'x')).toHaveLength(8192);
});
