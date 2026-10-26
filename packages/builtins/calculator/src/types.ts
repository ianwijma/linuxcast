import type { CalculatorUnit } from '@linuxcast/contracts';
/** Pure local output; numeric text and closed unit are distinct, neither is persisted. */
export type Calculation={ok:true;value:number;text:string;unit?:CalculatorUnit}|{ok:false;code:'invalid-expression'|'limit-exceeded'|'domain-error'|'unsupported-unit'|'incompatible-units';message:string};
