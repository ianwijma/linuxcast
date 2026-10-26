import { calculatorResultTextSchema,calculatorUnitSchema } from '@linuxcast/contracts';
import type { Calculation } from './types.ts';
/** Only fixed canonical units may accompany numeric output. Main never copies renderer text. */
export function formatCalculationText(result:Extract<Calculation,{ok:true}>):string {
  if(!Number.isFinite(result.value)||!calculatorResultTextSchema.safeParse(result.text).success||(result.unit!==undefined&&!calculatorUnitSchema.safeParse(result.unit).success))throw new Error('Invalid calculator output.');
  return result.unit===undefined?result.text:`${result.text} ${result.unit}`;
}
