import { expect,it,vi } from 'vitest';
import { parseTemplate,renderTemplate,TemplateError } from '../src/index.ts';

it('parses bounded dotted bindings and left-to-right brace escapes into immutable tokens',()=>{
  const tokens=parseTemplate('A {{{{vars.query}}}}: {{vars.customer.name}} {single}');
  expect(tokens).toEqual([{kind:'literal',value:'A {{vars.query}}: '},{kind:'binding',namespace:'vars',path:['customer','name']},{kind:'literal',value:' {single}'}]);
  expect(Object.isFrozen(tokens)).toBe(true);expect(Object.isFrozen(tokens[1])).toBe(true);
  expect(tokens[1]?.kind==='binding'&&Object.isFrozen(tokens[1].path)).toBe(true);
  expect(parseTemplate('')).toEqual([]);
});
it('renders own scalar snapshot values, multiline Unicode, null and all explicit namespaces',()=>{
  const snapshot={input:{value:'first\n第二行 😀'},vars:{value:12.5},settings:{value:false},context:{value:null},item:{value:0},error:{value:''}};
  expect(renderTemplate('{{input.value}}|{{vars.value}}|{{settings.value}}|{{context.value}}|{{item.value}}|{{error.value}}',snapshot)).toBe('first\n第二行 😀|12.5|false|null|0|');
  const nested=Object.assign(Object.create(null),{name:'Null prototype'}),root=Object.assign(Object.create(null),{vars:nested});
  expect(renderTemplate('{{vars.name}}',root)).toBe('Null prototype');
});
it('never recursively parses captured braces or changes a frozen snapshot',()=>{
  const snapshot=Object.freeze({vars:Object.freeze({query:'{{context.clipboard}} {{{{x}}}}'})});
  expect(renderTemplate('{{vars.query}} / {{vars.query}}',snapshot)).toBe('{{context.clipboard}} {{{{x}}}} / {{context.clipboard}} {{{{x}}}}');
  expect(snapshot.vars.query).toBe('{{context.clipboard}} {{{{x}}}}');
});
it.each(['{{','}}','{{vars.x}','{vars.x}}','{{}}','{{query}}','{{unknown.x}}','{{ vars.x}}','{{vars.x }}','{{vars.x + 1}}','{{vars.x()}}','{{vars["x"]}}','{{vars..x}}','{{vars.1x}}','{{vars.é}}','{{vars.__proto__}}','{{vars.prototype.x}}','{{vars.constructor}}','{{vars.x}}}}','{{vars.x.{{vars.y}}}}'])('rejects malformed or unsupported syntax %j',template=>{
  expect(()=>parseTemplate(template)).toThrowError(expect.objectContaining({code:'TEMPLATE_SYNTAX',message:'Invalid template syntax.'}));
});
it.each([{}, {vars:{}},{vars:{missing:undefined}}])('rejects missing/undefined values without private binding details',snapshot=>{
  expect(()=>renderTemplate('{{vars.missing}}',snapshot)).toThrowError(expect.objectContaining({code:'BINDING_NOT_FOUND',message:'Template binding not found.'}));
});
it.each([[],{},()=>{},Symbol('public'),1n,Infinity,NaN,new Date(0),{kind:'secret',id:'public'}])('rejects nonscalar captured values %#',value=>{
  expect(()=>renderTemplate('{{vars.value}}',{vars:{value}})).toThrowError(expect.objectContaining({code:'BINDING_TYPE'}));
});
it('never invokes getters, follows inheritance or coerces objects',()=>{
  const getter=vi.fn(()=>{throw new Error('must not run');}),coercion=vi.fn(()=> 'must not coerce');
  for(const snapshot of [Object.defineProperty({},'vars',{get:getter}),{vars:Object.defineProperty({},'value',{get:getter})},Object.create({vars:{value:'inherited'}}),{vars:Object.create({value:'inherited'})},{vars:{value:{toString:coercion}}}])expect(()=>renderTemplate('{{vars.value}}',snapshot)).toThrowError(expect.objectContaining({code:'BINDING_TYPE'}));
  expect(getter).not.toHaveBeenCalled();expect(coercion).not.toHaveBeenCalled();
  expect(()=>renderTemplate('{{vars.toString}}',{vars:{}})).toThrowError(expect.objectContaining({code:'BINDING_NOT_FOUND'}));
});
it('converts failed descriptor/prototype reflection to a fixed error',()=>{
  const bad=new Proxy({},{getPrototypeOf(){throw new Error('public trap detail');}});
  expect(()=>renderTemplate('{{vars.value}}',bad)).toThrowError(expect.objectContaining({code:'BINDING_TYPE',message:'Template binding must be a scalar.'}));
});
it('bounds UTF8 template/output bytes, binding count, path depth and segment length',()=>{
  expect(renderTemplate('é'.repeat(4096),{})).toHaveLength(4096);
  for(const template of ['é'.repeat(4097),'x'.repeat(8193),'{{vars.x}}'.repeat(257)])expect(()=>parseTemplate(template)).toThrowError(expect.objectContaining({code:'TEMPLATE_LIMIT'}));
  expect(renderTemplate('{{vars.x}}'.repeat(256),{vars:{x:'a'}})).toBe('a'.repeat(256));
  expect(renderTemplate('{{vars.x}}',{vars:{x:'😀'.repeat(2048)}})).toBe('😀'.repeat(2048));
  expect(()=>renderTemplate('{{vars.x}}{{vars.x}}',{vars:{x:'😀'.repeat(2048)}})).toThrowError(expect.objectContaining({code:'TEMPLATE_LIMIT'}));
  expect(parseTemplate(`{{vars.${'a'.repeat(64)}}}`)).toHaveLength(1);
  expect(parseTemplate('{{vars.a.b.c.d.e.f.g.h}}')).toHaveLength(1);
  for(const template of [`{{vars.${'a'.repeat(65)}}}`,'{{vars.a.b.c.d.e.f.g.h.i}}'])expect(()=>parseTemplate(template)).toThrowError(expect.objectContaining({code:'TEMPLATE_LIMIT'}));
});
it('rejects lone surrogates and invalid runtime inputs with fixed safe errors',()=>{
  for(const input of ['\ud800','\udfff',null,23])expect(()=>parseTemplate(input as string)).toThrow(TemplateError);
  expect(()=>renderTemplate('{{vars.x}}',{vars:{x:'\ud800'}})).toThrowError(expect.objectContaining({code:'BINDING_TYPE'}));
});
