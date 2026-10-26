import * as z from 'zod';
import { rpcFailureSchema } from './protocol.ts';
/** Main recomputes all result text. Units are closed identifiers, never arbitrary clipboard content. */
export const calculatorUnitSchema=z.enum(["m","km","cm","mm","um","nm","in","ft","yd","mi","nmi","kg","g","mg","ug","t","lb","oz","s","ms","us","ns","min","h","d","wk","K","degC","degF","rad","deg","turn","B","kB","MB","GB","TB","KiB","MiB","GiB","TiB","bit","kbit","Mbit","Gbit","Tbit","Kibit","Mibit","Gibit","Tibit","m2","km2","cm2","mm2","in2","ft2","yd2","acre","ha","m3","L","mL","uL","in3","ft3","US_gal","US_qt","US_pt","US_fl_oz","imp_gal","imp_fl_oz","m/s","km/h","mph","kn","J","kJ","Wh","kWh","cal_th","kcal_th","W","kW","MW","hp_mech","Pa","kPa","MPa","bar","mbar","atm","psi"]);
export type CalculatorUnit=z.infer<typeof calculatorUnitSchema>;
export const calculatorExpressionSchema=z.string().min(1).max(512).refine(value=>value.trim().length>0 && new TextEncoder().encode(value).length<=512 && !/[\p{Cc}\p{Cs}]/u.test(value));
export const calculatorCopyRequestSchema=z.strictObject({protocolVersion:z.literal(1),revision:z.number().int().positive().safe(),expression:calculatorExpressionSchema});
export const calculatorResultTextSchema=z.string().min(1).max(64).regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?$/u).refine(value=>Number.isFinite(Number(value)));
export const calculatorCopyReplySchema=z.discriminatedUnion('ok',[
  z.strictObject({ok:z.literal(true),value:z.strictObject({outcome:z.literal('copied'),text:calculatorResultTextSchema,unit:calculatorUnitSchema.optional()})}),
  z.strictObject({ok:z.literal(false),error:rpcFailureSchema}),
]);
export type CalculatorCopyReply=z.infer<typeof calculatorCopyReplySchema>;
