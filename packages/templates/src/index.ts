export type TemplateToken={kind:'literal';value:string}|{kind:'binding';namespace:string;path:readonly string[]};
export type TemplateSnapshot=Readonly<Record<string,unknown>>;
export type TemplateErrorCode='TEMPLATE_SYNTAX'|'TEMPLATE_LIMIT'|'BINDING_NOT_FOUND'|'BINDING_TYPE';
export class TemplateError extends Error {
  readonly code:TemplateErrorCode;
  constructor(code:TemplateErrorCode){
    super(code==='TEMPLATE_SYNTAX'?'Invalid template syntax.':code==='TEMPLATE_LIMIT'?'Template limit exceeded.':code==='BINDING_NOT_FOUND'?'Template binding not found.':'Template binding must be a scalar.');
    this.name='TemplateError';this.code=code;
  }
}
const encoder=new TextEncoder(),MAX_BYTES=8192;
const namespaces=new Set(['input','vars','settings','context','item','error']);
const forbidden=new Set(['__proto__','prototype','constructor']);
function boundedString(value:unknown,invalid:TemplateErrorCode):asserts value is string {
  if(typeof value!=='string')throw new TemplateError(invalid);
  if(value.length>MAX_BYTES)throw new TemplateError('TEMPLATE_LIMIT');
  if(/\p{Cs}/u.test(value))throw new TemplateError(invalid);
  if(encoder.encode(value).length>MAX_BYTES)throw new TemplateError('TEMPLATE_LIMIT');
}
/** Parse syntax only. Escapes become literals and inserted values are never parsed. */
export function parseTemplate(template:string):readonly TemplateToken[] {
  boundedString(template,'TEMPLATE_SYNTAX');
  const tokens:TemplateToken[]=[];let literal='',index=0,bindings=0;
  const flush=()=>{if(literal){tokens.push(Object.freeze({kind:'literal',value:literal}));literal='';}};
  while(index<template.length){
    if(template.startsWith('{{{{',index)){literal+='{{';index+=4;continue;}
    if(template.startsWith('}}}}',index)){literal+='}}';index+=4;continue;}
    if(template.startsWith('{{',index)){
      flush();const end=template.indexOf('}}',index+2);
      if(end===-1)throw new TemplateError('TEMPLATE_SYNTAX');
      const segments=template.slice(index+2,end).split('.'),namespace=segments[0]!;
      if(segments.length>9 || segments.some(segment=>segment.length>64))throw new TemplateError('TEMPLATE_LIMIT');
      if(segments.length<2 || !namespaces.has(namespace) || segments.some(segment=>!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(segment) || forbidden.has(segment)))throw new TemplateError('TEMPLATE_SYNTAX');
      if(++bindings>256)throw new TemplateError('TEMPLATE_LIMIT');
      tokens.push(Object.freeze({kind:'binding',namespace,path:Object.freeze(segments.slice(1))}));index=end+2;continue;
    }
    if(template.startsWith('}}',index))throw new TemplateError('TEMPLATE_SYNTAX');
    literal+=template[index]!;index++;
  }
  flush();return Object.freeze(tokens);
}
function ownValue(value:unknown,key:string):unknown {
  try{
    if(value===null || typeof value!=='object')throw new TemplateError('BINDING_TYPE');
    const prototype=Object.getPrototypeOf(value);
    if(prototype!==null && prototype!==Object.prototype)throw new TemplateError('BINDING_TYPE');
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor)throw new TemplateError('BINDING_NOT_FOUND');
    if(!Object.hasOwn(descriptor,'value'))throw new TemplateError('BINDING_TYPE');
    if(descriptor.value===undefined)throw new TemplateError('BINDING_NOT_FOUND');
    return descriptor.value;
  }catch(error){if(error instanceof TemplateError)throw error;throw new TemplateError('BINDING_TYPE');}
}
function scalar(value:unknown):string {
  if(typeof value==='string'){boundedString(value,'BINDING_TYPE');return value;}
  if(value===null || typeof value==='boolean' || (typeof value==='number' && Number.isFinite(value)))return String(value);
  throw new TemplateError('BINDING_TYPE');
}
/** Resolve each binding once from own data properties. No context provider,
 * transform, recursion or implicit namespace lookup runs during rendering. */
export function renderTemplate(template:string,snapshot:TemplateSnapshot):string {
  const captured=new Map<string,string>(),parts:string[]=[];let bytes=0;
  for(const token of parseTemplate(template)){
    let value:string;
    if(token.kind==='literal')value=token.value;
    else{
      const key=[token.namespace,...token.path].join('.');
      const prior=captured.get(key);
      if(prior!==undefined)value=prior;
      else{
        let resolved:unknown=ownValue(snapshot,token.namespace);
        for(const segment of token.path)resolved=ownValue(resolved,segment);
        value=scalar(resolved);captured.set(key,value);
      }
    }
    bytes+=encoder.encode(value).length;if(bytes>MAX_BYTES)throw new TemplateError('TEMPLATE_LIMIT');parts.push(value);
  }
  return parts.join('');
}
