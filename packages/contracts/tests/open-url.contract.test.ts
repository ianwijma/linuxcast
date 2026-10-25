import { expect,it } from 'vitest';
import { httpUrlSchema,launcherOpenUrlRequestSchema,launcherOpenUrlReplySchema,nativeApplicationRequestSchema } from '../src/index.ts';
it('canonicalizes explicit web addresses without opening or fetching them',()=>{
  for(const [input,canonical] of [['HTTPS://EXAMPLE.invalid:443/路径?public=%24%28literal%29','https://example.invalid/%E8%B7%AF%E5%BE%84?public=%24%28literal%29'],['http://[::1]:8080/path','http://[::1]:8080/path'],['https://bücher.example/','https://xn--bcher-kva.example/'],['https://example.invalid/;$(literal)','https://example.invalid/;$(literal)']])expect(httpUrlSchema.parse(input)).toBe(canonical);
  const boundary='https://example.invalid/'+ 'x'.repeat(8192-'https://example.invalid/'.length);
  expect(httpUrlSchema.parse(boundary)).toHaveLength(8192);expect(httpUrlSchema.safeParse(boundary+'x').success).toBe(false);
  expect(httpUrlSchema.safeParse('https://example.invalid/'+'😀'.repeat(700)).success).toBe(false);
});
it('rejects non-web, credential-bearing, ambiguous and malformed targets',()=>{
  for(const value of ['javascript:alert(1)','file:///etc/passwd','data:text/html,public','mailto:public@example.invalid','linuxcast://launcher/show','https:///example.invalid/','https://user:pass@example.invalid/','https://@example.invalid/','https://example.invalid:65536/','https://example.invalid/a b','https://example.invalid/a\nvalue','https://example.invalid/\\other','https://example.invalid/\ud800','https://example.invalid/%zz','https://example.invalid/%','https://'])expect(httpUrlSchema.safeParse(value).success).toBe(false);
});
it('separates typed URL intent from application identity, query, argv and completed effects',()=>{
  expect(launcherOpenUrlRequestSchema.safeParse({protocolVersion:1,revision:1,url:'https://example.invalid/'}).success).toBe(true);
  expect(nativeApplicationRequestSchema.safeParse({protocolVersion:1,operation:'open-url',url:'https://example.invalid/'}).success).toBe(true);
  for(const extra of [{query:'public'},{desktopId:'public.desktop'},{argv:['public']},{shell:true}]){
    expect(launcherOpenUrlRequestSchema.safeParse({protocolVersion:1,revision:1,url:'https://example.invalid/',...extra}).success).toBe(false);
    expect(nativeApplicationRequestSchema.safeParse({protocolVersion:1,operation:'open-url',url:'https://example.invalid/',...extra}).success).toBe(false);
  }
  expect(launcherOpenUrlReplySchema.safeParse({ok:true,value:{outcome:'dispatched'}}).success).toBe(true);
  expect(launcherOpenUrlReplySchema.safeParse({ok:true,value:{outcome:'completed'}}).success).toBe(false);
});
