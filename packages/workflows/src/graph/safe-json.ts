import { MAX_ENVELOPE_BYTES,MAX_JSON_DEPTH } from '@linuxcast/contracts';
import type { JsonValue } from '../../../contracts/src/json-value.ts';
import { WorkflowGraphError } from './errors.ts';
import type { WorkflowGraphErrorCode } from './errors.ts';
const encoder=new TextEncoder(),forbidden=new Set(['__proto__','prototype','constructor']);
/** Read descriptors before any schema or stringify operation. Only detached data
 * reaches those APIs; getters, toJSON and inherited fields never run here. */
export function copyPublicJson(value:unknown,code:WorkflowGraphErrorCode='invalid-definition'):JsonValue {
  const ancestors=new WeakSet<object>();let bytes=0;
  const fail:()=>never=()=>{throw new WorkflowGraphError(code);};
  const charge=(count:number)=>{bytes+=count;if(bytes>MAX_ENVELOPE_BYTES)fail();};
  const text=(value:string)=>{if(value.length>MAX_ENVELOPE_BYTES)fail();charge(encoder.encode(JSON.stringify(value)).length);};
  function copy(value:unknown,depth:number):JsonValue {
    if(value===null){charge(4);return null;}
    if(typeof value==='string'){text(value);return value;}
    if(typeof value==='boolean'){charge(value?4:5);return value;}
    if(typeof value==='number'){if(!Number.isFinite(value))fail();charge(String(value).length);return value;}
    if(typeof value!=='object' || depth>=MAX_JSON_DEPTH || ancestors.has(value))return fail();
    const prototype=Object.getPrototypeOf(value),keys=Reflect.ownKeys(value);
    if(keys.some(key=>typeof key!=='string'))fail();
    ancestors.add(value);charge(2);
    try{
      if(Array.isArray(value)){
        if(prototype!==Array.prototype)fail();
        const length=Object.getOwnPropertyDescriptor(value,'length')?.value as unknown;
        if(typeof length!=='number' || length>10000 || keys.length!==length+1)fail();
        const result:JsonValue[]=[];
        for(let index=0;index<length;index++){
          const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
          if(!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor,'value'))fail();
          if(index)charge(1);result.push(copy(descriptor.value,depth+1));
        }
        return result;
      }
      if(prototype!==null && prototype!==Object.prototype)fail();
      const result:Record<string,JsonValue>={};let count=0;
      for(const key of keys){
        if(typeof key!=='string' || forbidden.has(key))fail();
        const descriptor=Object.getOwnPropertyDescriptor(value,key);
        if(!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor,'value'))fail();
        if(count++)charge(1);text(key);charge(1);result[key]=copy(descriptor.value,depth+1);
      }
      if(result.kind==='secret-handle' || (Object.hasOwn(result,'secretHandle') && typeof result.secretHandle==='string'))fail();
      return result;
    }finally{ancestors.delete(value);}
  }
  try{return copy(value,0);}catch(error){if(error instanceof WorkflowGraphError)throw error;throw new WorkflowGraphError(code);}
}
export type DeepReadonly<T>=T extends readonly (infer V)[]?readonly DeepReadonly<V>[]:T extends object?{readonly [K in keyof T]:DeepReadonly<T[K]>}:T;
/** Only call on our detached validated data, never directly on caller objects. */
export function freezeDetached<T>(value:T):DeepReadonly<T> {
  if(value!==null && typeof value==='object'){
    for(const child of Object.values(value))freezeDetached(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
