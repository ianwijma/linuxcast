import { quicklinkUrlSchema,quicklinkWebSearchSchema,webSearchQuerySchema } from '@linuxcast/contracts';
import type { QuicklinkWebSearch } from '@linuxcast/contracts';
import { renderTemplate } from '@linuxcast/templates';
export class WebSearchBuildError extends Error {
  readonly reason:'invalid-definition'|'invalid-query'|'result-too-large';
  constructor(reason:WebSearchBuildError['reason']){super(reason==='invalid-definition'?'Invalid web search definition.':reason==='invalid-query'?'Invalid web search query.':'Web search target exceeds the size limit.');this.name='WebSearchBuildError';this.reason=reason;}
}
function definition(value:QuicklinkWebSearch):QuicklinkWebSearch {
  try{
    if(!value || typeof value!=='object' || ![null,Object.prototype].includes(Object.getPrototypeOf(value)))throw new Error();
    const keys=Reflect.ownKeys(value);
    if(keys.length!==2 || keys.some(key=>key!=='queryParameter'&&key!=='template'))throw new Error();
    const parameter=Object.getOwnPropertyDescriptor(value,'queryParameter'),template=Object.getOwnPropertyDescriptor(value,'template');
    if(!parameter || !template || !Object.hasOwn(parameter,'value') || !Object.hasOwn(template,'value'))throw new Error();
    if(typeof parameter.value!=='string' || parameter.value.length>64 || typeof template.value!=='string' || template.value.length!==14)throw new Error();
    const parsed=quicklinkWebSearchSchema.safeParse({queryParameter:parameter.value,template:template.value});
    if(!parsed.success)throw new Error();return parsed.data;
  }catch{throw new WebSearchBuildError('invalid-definition');}
}
/** Pure query-component construction. Expanded queries/targets remain transient. */
export function buildWebSearchUrl(baseUrl:string,config:QuicklinkWebSearch,query:string):string {
  if(typeof baseUrl!=='string' || baseUrl.length>8192)throw new WebSearchBuildError('invalid-definition');
  const base=quicklinkUrlSchema.safeParse(baseUrl),search=definition(config);
  if(!base.success)throw new WebSearchBuildError('invalid-definition');
  if(typeof query!=='string' || query.length>2048)throw new WebSearchBuildError('invalid-query');
  const argument=webSearchQuerySchema.safeParse(query);
  if(!argument.success)throw new WebSearchBuildError('invalid-query');
  const snapshot=Object.freeze({vars:Object.freeze({query:argument.data})});
  const rendered=renderTemplate(search.template,snapshot),target=new URL(base.data);
  target.searchParams.set(search.queryParameter,rendered);
  const result=target.href;
  if(result.length>8192 || new TextEncoder().encode(result).length>8192)throw new WebSearchBuildError('result-too-large');
  const checked=quicklinkUrlSchema.safeParse(result);
  if(!checked.success)throw new WebSearchBuildError('invalid-definition');
  return checked.data;
}
