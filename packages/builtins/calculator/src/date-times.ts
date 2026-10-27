import {Temporal} from '@js-temporal/polyfill';
import {calculatorDateTimeTextSchema} from '@linuxcast/contracts';
import type {Calculation} from './types.ts';
type FailureCode='invalid-date-time'|'unsupported-time-zone'|'ambiguous-date-time'|'nonexistent-date-time';
const messages:Record<FailureCode,string>={
  'invalid-date-time':'Use an explicit valid ISO date/time, matching offset and named zone.',
  'unsupported-time-zone':'Use UTC or a supported IANA area/location time zone.',
  'ambiguous-date-time':'This local time occurs twice. Add its matching UTC offset to choose one occurrence.',
  'nonexistent-date-time':'This local time does not exist. Choose a valid time outside the clock change.',
};
const fail=(code:FailureCode):Calculation=>({ok:false,code,message:messages[code]});
const zoneSyntax=/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/u;
/** Resolve only local ICU data; no abbreviation, offset-only zone, network or ambient clock. */
function zone(value:string):string|null{
  if(value.length>128||!zoneSyntax.test(value))return null;
  try{const result=new Intl.DateTimeFormat('en-US',{timeZone:value}).resolvedOptions().timeZone;return zoneSyntax.test(result)?result:null;}catch{return null;}
}
const expression=/^ *([0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]{1,9})?)?)(Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?)?\[([^\]]+)\] +to +([^ ]+) *$/u;
/** One fixed zoned conversion, called only after the evaluator's 512-byte/ASCII bounds. */
export function evaluateDateTimeExpression(input:string):Calculation|undefined{
  if(!/^ *[0-9]{4}-[^ ]*T/u.test(input))return undefined;
  const match=expression.exec(input);if(!match||match[1]!.startsWith('0000-'))return fail('invalid-date-time');
  const sourceZone=zone(match[3]!),targetZone=zone(match[4]!);if(!sourceZone||!targetZone)return fail('unsupported-time-zone');
  const offset=match[2]==='Z'?'+00:00':match[2];if(offset==='-00:00'||offset==='-00:00:00')return fail('invalid-date-time');
  try{
    const local=Temporal.PlainDateTime.from(match[1]!,{overflow:'reject'});
    let resolved:Temporal.ZonedDateTime|undefined;
    try{resolved=local.toZonedDateTime(sourceZone,{disambiguation:'reject'});}catch{
      const earlier=local.toZonedDateTime(sourceZone,{disambiguation:'earlier'}),later=local.toZonedDateTime(sourceZone,{disambiguation:'later'});
      if(!earlier.toPlainDateTime().equals(local)||!later.toPlainDateTime().equals(local))return fail('nonexistent-date-time');
      if(offset===undefined)return fail('ambiguous-date-time');
    }
    // Z means a supplied zero offset here, never Temporal's offset-override form.
    if(offset!==undefined){
      resolved=Temporal.ZonedDateTime.from({calendar:'iso8601',year:local.year,month:local.month,day:local.day,hour:local.hour,minute:local.minute,second:local.second,millisecond:local.millisecond,microsecond:local.microsecond,nanosecond:local.nanosecond,timeZone:sourceZone,offset},{overflow:'reject',offset:'reject',disambiguation:'reject'});
      // The fields form disables legacy minute-rounded string matching, even
      // when fold candidates differ only in seconds. Assert the exact offset.
      const [hours,minutes,seconds=0]=offset.slice(1).split(':').map(Number),supplied=(offset[0]==='-'?-1:1)*(hours!*3600+minutes!*60+seconds)*1e9;
      if(resolved.offsetNanoseconds!==supplied)return fail('invalid-date-time');
    }
    if(!resolved)return fail('invalid-date-time');
    const target=resolved.withTimeZone(targetZone);
    // ZonedDateTime.toString rounds offsets to minutes. Preserve exact local
    // fields and offset seconds, so parsing this result preserves the instant.
    const text=`${target.toPlainDateTime().toString({calendarName:'never'})}${target.offset}[${target.timeZoneId}]`;
    if(!calculatorDateTimeTextSchema.safeParse(text).success)return fail('invalid-date-time');
    return {ok:true,kind:'date-time',dateTime:'zoned',text};
  }catch{return fail('invalid-date-time');}
}
