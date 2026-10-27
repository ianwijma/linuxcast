import { quicklinkUrlSchema,quicklinkPathArgumentSchema,webSearchQuerySchema } from '@linuxcast/contracts';
import type { QuicklinkPathArgument } from '@linuxcast/contracts';
import { renderTemplate } from '@linuxcast/templates';
export class PathArgumentBuildError extends Error {
  readonly reason:'invalid-definition'|'invalid-query'|'result-too-large';
  constructor(reason:PathArgumentBuildError['reason']){super(reason==='invalid-definition'?'Invalid path argument definition.':reason==='invalid-query'?'Invalid path argument.':'Path argument target exceeds the size limit.');this.name='PathArgumentBuildError';this.reason=reason;}
}
function definition(value:QuicklinkPathArgument):QuicklinkPathArgument{
  try{
    if(!value||typeof value!=='object'||![null,Object.prototype].includes(Object.getPrototypeOf(value)))throw new Error();
    const keys=Reflect.ownKeys(value);if(keys.length!==2||keys.some(key=>key!=='component'&&key!=='template'))throw new Error();
    const component=Object.getOwnPropertyDescriptor(value,'component'),template=Object.getOwnPropertyDescriptor(value,'template');
    if(!component||!template||!Object.hasOwn(component,'value')||!Object.hasOwn(template,'value'))throw new Error();
    return quicklinkPathArgumentSchema.parse({component:component.value,template:template.value});
  }catch{throw new PathArgumentBuildError('invalid-definition');}
}
/** Explicit single-component construction; no recursive rendering or I/O. */
export function buildPathArgumentUrl(baseUrl:string,config:QuicklinkPathArgument,query:string):string{
  if(typeof baseUrl!=='string'||baseUrl.length>8192)throw new PathArgumentBuildError('invalid-definition');
  const base=quicklinkUrlSchema.safeParse(baseUrl),path=definition(config);if(!base.success)throw new PathArgumentBuildError('invalid-definition');
  if(typeof query!=='string'||query.length>2048)throw new PathArgumentBuildError('invalid-query');
  const argument=webSearchQuerySchema.safeParse(query);if(!argument.success||query==='.'||query==='..')throw new PathArgumentBuildError('invalid-query');
  const rendered=renderTemplate(path.template,Object.freeze({vars:Object.freeze({query:argument.data})}));
  const encoded=encodeURIComponent(rendered).replace(/[!'()*]/gu,value=>`%${value.charCodeAt(0).toString(16).toUpperCase()}`),target=new URL(base.data);
  const origin=target.origin,search=target.search,hash=target.hash,pathname=`${target.pathname}${target.pathname.endsWith('/')?'':'/'}${encoded}`;
  target.pathname=pathname;
  if(target.origin!==origin||target.search!==search||target.hash!==hash||target.pathname!==pathname)throw new PathArgumentBuildError('invalid-query');
  const result=target.href;if(result.length>8192||new TextEncoder().encode(result).length>8192)throw new PathArgumentBuildError('result-too-large');
  const checked=quicklinkUrlSchema.safeParse(result);if(!checked.success)throw new PathArgumentBuildError('invalid-definition');return checked.data;
}
