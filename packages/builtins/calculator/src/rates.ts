import {rateAmountSchema,rateSnapshotSchema,ratePairSchema,frankfurterRateResponseSchema,rateTimestampSchema,calculatorResultTextSchema} from '@linuxcast/contracts';
import type {RateSnapshot} from '@linuxcast/contracts';
import {evaluateExpression} from './evaluate.ts';
const DAY=86400000;
/** Provider payloads are data. No amount/expression is part of a provider request. */
export function parseFrankfurterRate(payload:unknown,pair:{base:string;quote:string},now:string):RateSnapshot{
 ratePairSchema.parse(pair);rateTimestampSchema.parse(now);const value=frankfurterRateResponseSchema.parse(payload);
 if(value.base!==pair.base||value.quote!==pair.quote||value.date>now.slice(0,10))throw new Error('Invalid rate response.');
 return rateSnapshotSchema.parse({provider:'frankfurter',base:value.base,quote:value.quote,rate:value.rate,asOfDate:value.date,fetchedAt:now});
}
/** A display estimate, using the existing bounded numeric formatter; never accounting math. */
export function calculateRateText(amount:string,snapshot:RateSnapshot):string{
 rateAmountSchema.parse(amount);rateSnapshotSchema.parse(snapshot);
 const result=evaluateExpression(`(${amount}) * ${snapshot.rate}`);
 if(!result.ok||result.kind==='colour'||result.kind==='date-time'||result.unit!==undefined||!calculatorResultTextSchema.safeParse(result.text).success)throw new Error('Invalid conversion result.');
 return result.text;
}
/** Daily reference data is labelled stale after96h, or a cached fetch after24h.
 * A clock rollback is stale too; it never makes cached data look newer. */
export function isRateStale(snapshot:RateSnapshot,now:string):boolean{
 rateSnapshotSchema.parse(snapshot);rateTimestampSchema.parse(now);
 const current=Date.parse(now),fetched=Date.parse(snapshot.fetchedAt),published=Date.parse(`${snapshot.asOfDate}T00:00:00Z`);
 return current<fetched||current<published||current-fetched>DAY||current-published>4*DAY;
}
