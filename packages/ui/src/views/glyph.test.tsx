// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {iconReferenceSchema} from '../../../contracts/src/views.ts';
import {ViewSession} from './session.ts';
import {ViewRenderer} from './renderer.tsx';
const model=(value:string)=>({protocolVersion:1,viewId:'public-glyph-grid',revision:1,kind:'grid',title:'Public glyph examples',density:'comfortable',search:{placeholder:'Search',query:'',mode:'host'},sections:[{id:'public',items:[{id:'public-glyph',title:'Public Unicode item',icon:{kind:'glyph',value}}]}],images:[]});
/** Static host line icons (header search glyph, footer) are the only SVG; no image/script/frame/link enters the view. */
function hostArtworkOnly(element:Element){expect(element.querySelector('img,script,iframe,a')).toBeNull();for(const svg of element.querySelectorAll('svg'))expect(svg.classList.contains('lc-line-icon')).toBe(true);}
function markup(value:string){const resolveImage=vi.fn(),action=vi.fn(),session=new ViewSession(model(value)),html=renderToStaticMarkup(<ViewRenderer session={session} host={{action,resolveImage}}/>),element=document.createElement('div');element.innerHTML=html;return {session,html,element,resolveImage,action};}
it.each(['e\u0301','❤️','👩🏽‍💻','🇦🇺','#️⃣','🏳️‍🌈','🏴\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}'])('renders %s as exact inert text in the existing host icon primitive',value=>{
 expect(iconReferenceSchema.parse({kind:'glyph',value})).toEqual({kind:'glyph',value});const f=markup(value),icon=f.element.querySelector('.lc-result-icon')!;expect(icon.textContent).toBe(value);expect(icon.getAttribute('aria-hidden')).toBe('true');const cell=f.element.querySelector('[role="gridcell"]')!;expect(cell.querySelector('img,script,svg,iframe')).toBeNull();hostArtworkOnly(f.element);expect(f.resolveImage).not.toHaveBeenCalled();expect(f.action).not.toHaveBeenCalled();expect(cell.getAttribute('title')).toBe('Public Unicode item');expect(cell.closest('[role="row"]')?.parentElement?.closest('[role="rowgroup"]')?.closest('[role="grid"]')?.getAttribute('aria-label')).toBe('Public glyph examples');
});
it('escapes markup-like glyph text instead of resolving images, scripts, links or executable content',()=>{
 for(const value of ['<img src=x onerror=alert(1)>','<script>alert(1)</script>','https://example.invalid/x.svg']){const f=markup(value);expect(f.element.querySelector('.lc-result-icon')?.textContent).toBe(value);expect(f.element.querySelector('[role="gridcell"]')!.querySelector('img,script,svg,iframe,a')).toBeNull();hostArtworkOnly(f.element);expect(f.resolveImage).not.toHaveBeenCalled();expect(f.action).not.toHaveBeenCalled();expect(f.html).not.toContain('<script>');}
});
it('rejects extra glyph authority, byte/scalar overflow, controls, unpaired surrogates and bidi controls',()=>{
 for(const glyph of [{kind:'glyph',value:'😀',url:'https://example.invalid'},{kind:'glyph',value:'😀',onClick:'run'},{kind:'glyph',value:''},...['x'.repeat(129),'雪'.repeat(43),'😀'.repeat(33),'\0','\n','\u0085','\ud800','\udfff','\u202e','\u2066'].map(value=>({kind:'glyph',value}))])expect(iconReferenceSchema.safeParse(glyph).success).toBe(false);
 const f=markup('\u202e');expect(f.session.getSnapshot().error).toBe(true);expect(f.element.querySelector('.lc-result-icon')).toBeNull();expect(f.resolveImage).not.toHaveBeenCalled();
});
it('refuses oversized glyphs before UTF8 allocation and supports the exact scalar/byte boundary',()=>{
 const encode=vi.spyOn(TextEncoder.prototype,'encode');try{expect(iconReferenceSchema.safeParse({kind:'glyph',value:'x'.repeat(129)}).success).toBe(false);for(const value of ['\0','\ud800','\u202e'])expect(iconReferenceSchema.safeParse({kind:'glyph',value}).success).toBe(false);expect(encode).not.toHaveBeenCalled();}finally{encode.mockRestore();}
 expect(iconReferenceSchema.safeParse({kind:'glyph',value:'😀'.repeat(32)}).success).toBe(true);expect(iconReferenceSchema.safeParse({kind:'glyph',value:'雪'.repeat(32)}).success).toBe(true);
});
