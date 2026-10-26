/** Pure local calculator output; expression/result content is never persisted. */
export type Calculation={ok:true;value:number;text:string}|{ok:false;code:'invalid-expression'|'limit-exceeded'|'domain-error';message:string};
