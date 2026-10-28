import * as z from 'zod';
import {rpcFailureSchema} from './protocol.ts';
import {calculatorResultTextSchema} from './calculator.ts';
/** Named native endpoint only. Enabling it is separate from invoking a conversion. */
export const RATE_ENDPOINT='https://api.frankfurter.dev' as const;
export const rateSourceSchema=z.enum(['disabled','frankfurter']);
export const rateCurrencySchema=z.string().regex(/^[A-Z]{3}$/u);
export const rateAmountSchema=z.string().max(36).regex(/^-?(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,18})?$/u);
export const rateDateSchema=z.string().regex(/^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/u).refine(value=>{
 const year=Number(value.slice(0,4)),month=Number(value.slice(5,7)),day=Number(value.slice(8,10));
 const days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];return year>0&&day<=days[month-1]!;
});
export const rateTimestampSchema=z.iso.datetime();
export const frankfurterRateResponseSchema=z.strictObject({date:rateDateSchema,base:rateCurrencySchema,quote:rateCurrencySchema,rate:z.number().finite().positive()});
const revision=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1),registryRevision=revision.min(1);
export const rateConfigurationSchema=z.strictObject({revision,source:rateSourceSchema,endpoint:z.literal(RATE_ENDPOINT)});
export const ratePairSchema=z.strictObject({base:rateCurrencySchema,quote:rateCurrencySchema}).refine(value=>value.base!==value.quote);
export const rateSnapshotSchema=z.strictObject({provider:z.literal('frankfurter'),base:rateCurrencySchema,quote:rateCurrencySchema,rate:z.number().finite().positive(),asOfDate:rateDateSchema,fetchedAt:z.iso.datetime()}).refine(value=>value.base!==value.quote);
export const rateQuoteSchema=z.strictObject({id:z.uuid(),configurationRevision:revision,amount:rateAmountSchema,base:rateCurrencySchema,quote:rateCurrencySchema,text:calculatorResultTextSchema,provider:z.literal('frankfurter'),endpoint:z.literal(RATE_ENDPOINT),asOfDate:rateDateSchema,fetchedAt:z.iso.datetime(),connection:z.enum(['online','offline']),stale:z.boolean(),expiresAt:z.iso.datetime()}).refine(value=>value.base!==value.quote);
export type RateConfiguration=z.infer<typeof rateConfigurationSchema>;
export type RateSnapshot=z.infer<typeof rateSnapshotSchema>;
export type RateQuote=z.infer<typeof rateQuoteSchema>;
export const RATE_CHANNELS={configuration:'rates:configuration',configure:'rates:configure',convert:'rates:convert',copy:'rates:copy',clearCache:'rates:clear-cache'} as const;
export const rateConfigurationRequestSchema=z.strictObject({protocolVersion:z.literal(1),revision:registryRevision});
export const rateConfigureRequestSchema=rateConfigurationRequestSchema.extend({expectedRevision:revision,source:rateSourceSchema});
export const rateConvertRequestSchema=rateConfigurationRequestSchema.extend({configurationRevision:revision,amount:rateAmountSchema,base:rateCurrencySchema,quote:rateCurrencySchema}).refine(value=>value.base!==value.quote);
export const rateCopyRequestSchema=rateConfigurationRequestSchema.extend({quoteId:z.uuid()});
export const rateClearRequestSchema=rateConfigurationRequestSchema.extend({configurationRevision:revision});
const failed=z.strictObject({ok:z.literal(false),error:rpcFailureSchema});
export const rateConfigurationReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:rateConfigurationSchema}),failed]);
export const rateConvertReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:rateQuoteSchema}),failed]);
export const rateCopyReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.strictObject({outcome:z.literal('copied'),quoteId:z.uuid(),text:calculatorResultTextSchema,currency:rateCurrencySchema})}),failed]);
export const rateClearReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.strictObject({outcome:z.literal('cleared')})}),failed]);
export type RateConfigurationReply=z.infer<typeof rateConfigurationReplySchema>;
export type RateConvertReply=z.infer<typeof rateConvertReplySchema>;
export type RateCopyReply=z.infer<typeof rateCopyReplySchema>;
export type RateClearReply=z.infer<typeof rateClearReplySchema>;
export interface RateConversionApi {
 getRateConfiguration(request:{revision:number}):Promise<RateConfigurationReply>;
 configureRateSource(request:{revision:number;expectedRevision:number;source:'disabled'|'frankfurter'}):Promise<RateConfigurationReply>;
 convertRate(request:{revision:number;configurationRevision:number;amount:string;base:string;quote:string}):Promise<RateConvertReply>;
 copyRateResult(request:{revision:number;quoteId:string}):Promise<RateCopyReply>;
 clearRateCache(request:{revision:number;configurationRevision:number}):Promise<RateClearReply>;
}
