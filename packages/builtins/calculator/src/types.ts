import type { CalculatorUnit,CalculatorColourValue } from '@linuxcast/contracts';
/** Pure local output; numeric text and closed unit are distinct, neither is persisted. */
export type Calculation={ok:true;kind?:'number';value:number;text:string;unit?:CalculatorUnit;colour?:never}|({ok:true;kind:'colour';value?:never}&CalculatorColourValue)|{ok:false;code:'invalid-expression'|'limit-exceeded'|'domain-error'|'unsupported-unit'|'incompatible-units'|'invalid-colour';message:string};
