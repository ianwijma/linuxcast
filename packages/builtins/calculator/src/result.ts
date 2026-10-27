import { calculatorColourValueSchema,calculatorDateTimeValueSchema,calculatorResultTextSchema,calculatorUnitSchema } from '@linuxcast/contracts';
import type { Calculation } from './types.ts';
/** Only fixed canonical units may accompany numeric output. Main never copies renderer text. */
export function formatCalculationText(result:Extract<Calculation,{ok:true}>):string {
  if(result.kind==='date-time'){if(result.value!==undefined||result.unit!==undefined||result.colour!==undefined||!calculatorDateTimeValueSchema.safeParse({dateTime:result.dateTime,text:result.text}).success)throw new Error('Invalid calculator output.');return result.text;}
  if(result.kind==='colour'){if(result.value!==undefined||result.unit!==undefined||result.dateTime!==undefined||!calculatorColourValueSchema.safeParse({colour:result.colour,text:result.text}).success)throw new Error('Invalid calculator output.');return result.text;}
  if(result.colour!==undefined||result.dateTime!==undefined||!Number.isFinite(result.value)||!calculatorResultTextSchema.safeParse(result.text).success||(result.unit!==undefined&&!calculatorUnitSchema.safeParse(result.unit).success))throw new Error('Invalid calculator output.');
  return result.unit===undefined?result.text:`${result.text} ${result.unit}`;
}
