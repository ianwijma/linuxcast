import {expect,it} from 'vitest';
import {evaluateExpression} from '../src/evaluate.ts';
import {formatCalculationText} from '../src/result.ts';
import {calculatorCopyReplySchema} from '@linuxcast/contracts';
const conversions=[
 ['2024-01-15T12:00[UTC] to America/New_York','2024-01-15T07:00:00-05:00[America/New_York]'],
 ['2024-07-15T12:00[UTC] to America/New_York','2024-07-15T08:00:00-04:00[America/New_York]'],
 ['2024-01-15T12:00[UTC] to Europe/Paris','2024-01-15T13:00:00+01:00[Europe/Paris]'],
 ['2024-07-15T12:00[UTC] to Europe/Paris','2024-07-15T14:00:00+02:00[Europe/Paris]'],
 ['2024-01-15T12:00[UTC] to Asia/Kolkata','2024-01-15T17:30:00+05:30[Asia/Calcutta]'],
 ['2024-01-15T12:00[UTC] to Asia/Kathmandu','2024-01-15T17:45:00+05:45[Asia/Katmandu]'],
 ['2026-10-27T09:00[Australia/Sydney] to UTC','2026-10-26T22:00:00+00:00[UTC]'],
 ['2024-01-15T12:00[UTC] to Australia/Adelaide','2024-01-15T22:30:00+10:30[Australia/Adelaide]'],
 ['2024-07-15T12:00[UTC] to Australia/Adelaide','2024-07-15T21:30:00+09:30[Australia/Adelaide]'],
 ['2024-11-03T01:30-04:00[America/New_York] to UTC','2024-11-03T05:30:00+00:00[UTC]'],
 ['2024-11-03T01:30-05:00[America/New_York] to UTC','2024-11-03T06:30:00+00:00[UTC]'],
 ['2024-04-07T01:45+11:00[Australia/Lord_Howe] to UTC','2024-04-06T14:45:00+00:00[UTC]'],
 ['2024-04-07T01:45+10:30[Australia/Lord_Howe] to UTC','2024-04-06T15:15:00+00:00[UTC]'],
 ['2024-02-29T23:30[UTC] to Etc/GMT-2','2024-03-01T01:30:00+02:00[Etc/GMT-2]'],
 ['2024-01-01T00:00:00.123456789[UTC] to UTC','2024-01-01T00:00:00.123456789+00:00[UTC]'],
 ['2024-01-01T00:00:00.120000000[UTC] to UTC','2024-01-01T00:00:00.12+00:00[UTC]'],
 ['2024-01-01T00:00Z[UTC] to UTC','2024-01-01T00:00:00+00:00[UTC]'],
 [' 2024-01-01T00:00[Etc/UTC]   to   UTC ','2024-01-01T00:00:00+00:00[UTC]'],
 ['0001-01-01T00:00[UTC] to UTC','0001-01-01T00:00:00+00:00[UTC]'],
 ['9999-12-31T23:59:59[UTC] to UTC','9999-12-31T23:59:59+00:00[UTC]'],
 ['1890-01-01T00:00[UTC] to Europe/Paris','1890-01-01T00:09:21+00:09:21[Europe/Paris]'],
 ['1890-01-01T00:09:21+00:09:21[Europe/Paris] to UTC','1890-01-01T00:00:00+00:00[UTC]'],
] as const;
it.each(conversions)('converts a fixed explicit local date/time: %s',(input,text)=>{
 const result=evaluateExpression(input);expect(result).toEqual({ok:true,kind:'date-time',dateTime:'zoned',text});if(!result.ok)throw new Error();expect(formatCalculationText(result)).toBe(text);expect(calculatorCopyReplySchema.safeParse({ok:true,value:{outcome:'copied',dateTime:'zoned',text}}).success).toBe(true);
});
it.each(['2024-03-10T02:30[America/New_York]','2024-03-10T02:30-05:00[America/New_York]','2024-10-06T02:15[Australia/Lord_Howe]','2011-12-30T12:00[Pacific/Apia]'])('refuses nonexistent local clock time without shifting it: %s',local=>{expect(evaluateExpression(`${local} to UTC`)).toMatchObject({ok:false,code:'nonexistent-date-time'});});
it.each(['2024-11-03T01:30[America/New_York]','2024-04-07T01:45[Australia/Lord_Howe]'])('requires an explicit matching offset for repeated clock time: %s',local=>{expect(evaluateExpression(`${local} to UTC`)).toMatchObject({ok:false,code:'ambiguous-date-time'});});
it.each([
 '2024-11-03T01:30-06:00[America/New_York] to UTC','2024-07-01T09:00Z[America/New_York] to UTC',
 '2023-02-29T00:00[UTC] to UTC','2024-02-30T00:00[UTC] to UTC','0000-01-01T00:00[UTC] to UTC',
 '2024-01-01T24:00[UTC] to UTC','2016-12-31T23:59:60[UTC] to UTC','2024-01-01T00:00-00:00[UTC] to UTC',
 '2024-01-01T00:00[UTC] to UTC to Europe/Paris','2024-01-01T00:00[UTC][u-ca=hebrew] to UTC',
 '2024-01-01T00:00:00.1234567890[UTC] to UTC',
 '0001-01-01T00:00[UTC] to Etc/GMT+12','9999-12-31T23:59[UTC] to Etc/GMT-14',
 '1890-01-01T00:09:21+00:09[Europe/Paris] to UTC',
])('refuses invalid/implicit/contradictory calendar structure: %s',input=>{expect(evaluateExpression(input)).toMatchObject({ok:false,code:'invalid-date-time'});});
it.each(['EST','+05:30','Europe/Not_A_Zone','../UTC','http://example.invalid','constructor','UTC;process.exit()'])('rejects unknown, abbreviated or offset-only zones: %s',name=>{expect(evaluateExpression(`2024-01-01T00:00[${name}] to UTC`)).toMatchObject({ok:false,code:'unsupported-time-zone'});expect(evaluateExpression(`2024-01-01T00:00[UTC] to ${name}`)).toMatchObject({ok:false,code:'unsupported-time-zone'});});
it('preserves numeric subtraction and pre-library resource/input bounds with fixed redacted failures',()=>{
 expect(evaluateExpression('2024-1')).toMatchObject({ok:true,value:2023,text:'2023'});expect(evaluateExpression('2024-01-01')).toMatchObject({ok:true,value:2022,text:'2022'});
 for(const input of ['2024-01-01T00:00[UTC] to '+ 'A'.repeat(600),'2024-01-01T00:00[UTC] to UTC\n','2024-01-01T00:00[UTC] to é','2024-01-01T00:00[PRIVATE_ZONE] to UTC']){const result=evaluateExpression(input);expect(result.ok).toBe(false);expect(JSON.stringify(result)).not.toContain('PRIVATE_ZONE');}
});

it.each([
 ['2024-03-09T12:00[America/New_York] + P1D to America/New_York','2024-03-10T12:00:00-04:00[America/New_York]'],
 ['2024-03-09T12:00[America/New_York] + PT24H to America/New_York','2024-03-10T13:00:00-04:00[America/New_York]'],
 ['2024-11-02T12:00[America/New_York] + P1D to America/New_York','2024-11-03T12:00:00-05:00[America/New_York]'],
 ['2024-11-02T12:00[America/New_York] + PT24H to America/New_York','2024-11-03T11:00:00-05:00[America/New_York]'],
 ['2024-03-10T12:00[America/New_York] - P1D to America/New_York','2024-03-09T12:00:00-05:00[America/New_York]'],
 ['2024-03-10T12:00[America/New_York] - PT24H to America/New_York','2024-03-09T11:00:00-05:00[America/New_York]'],
 ['2024-11-03T12:00[America/New_York] - P1D to America/New_York','2024-11-02T12:00:00-04:00[America/New_York]'],
 ['2024-11-03T12:00[America/New_York] - PT24H to America/New_York','2024-11-02T13:00:00-04:00[America/New_York]'],
 ['2024-03-09T12:00[America/New_York] + P1DT1H to UTC','2024-03-10T17:00:00+00:00[UTC]'],
 ['2024-03-10T12:00[America/New_York] - P1DT1H to UTC','2024-03-09T16:00:00+00:00[UTC]'],
 ['2024-10-05T12:00[Australia/Lord_Howe] + P1D to Australia/Lord_Howe','2024-10-06T12:00:00+11:00[Australia/Lord_Howe]'],
 ['2024-10-05T12:00[Australia/Lord_Howe] + PT24H to Australia/Lord_Howe','2024-10-06T12:30:00+11:00[Australia/Lord_Howe]'],
 ['2024-03-10T01:30[America/New_York] + PT1H to America/New_York','2024-03-10T03:30:00-04:00[America/New_York]'],
 ['2024-11-03T00:30[America/New_York] + PT2H to America/New_York','2024-11-03T01:30:00-05:00[America/New_York]'],
 ['2024-11-03T01:30-04:00[America/New_York] + P0D to UTC','2024-11-03T05:30:00+00:00[UTC]'],
 ['2024-11-03T01:30-05:00[America/New_York] - PT0S to UTC','2024-11-03T06:30:00+00:00[UTC]'],
 ['2024-11-03T01:30-04:00[America/New_York] + PT1H to America/New_York','2024-11-03T01:30:00-05:00[America/New_York]'],
 ['2024-02-28T12:00[UTC] + P1D to UTC','2024-02-29T12:00:00+00:00[UTC]'],
 ['2024-02-29T12:00[UTC] + P13M to UTC','2025-03-29T12:00:00+00:00[UTC]'],
 ['2023-02-28T12:00[UTC] + P1Y to UTC','2024-02-28T12:00:00+00:00[UTC]'],
 ['2024-01-15T12:00[UTC] + P1M to UTC','2024-02-15T12:00:00+00:00[UTC]'],
 ['2024-01-31T12:00[UTC] + P0M to UTC','2024-01-31T12:00:00+00:00[UTC]'],
 ['2024-01-01T00:00[UTC] + P1Y2M1W3DT4H5M6.123456789S to UTC','2025-03-11T04:05:06.123456789+00:00[UTC]'],
 ['2024-02-29T23:59:59.123456789[UTC] + PT0.000000001S to UTC','2024-02-29T23:59:59.12345679+00:00[UTC]'],
 ['2024-01-01T00:00[UTC] - PT0.000000001S to UTC','2023-12-31T23:59:59.999999999+00:00[UTC]'],
 ['2024-01-01T00:00[UTC] + PT90M to UTC','2024-01-01T01:30:00+00:00[UTC]'],
 ['2024-01-01T00:00[UTC] + P1W to UTC','2024-01-08T00:00:00+00:00[UTC]'],
 ['1890-01-01T00:00[UTC] + PT0.000000001S to Europe/Paris','1890-01-01T00:09:21.000000001+00:09:21[Europe/Paris]'],
 ['2024-01-01T00:00[UTC] + PT999999S to UTC','2024-01-12T13:46:39+00:00[UTC]'],
 ['2024-01-01T00:00[UTC] - PT999999S to UTC','2023-12-20T10:13:21+00:00[UTC]'],
])('applies bounded calendar fields then exact elapsed time: %s',(input,text)=>{const result=evaluateExpression(input);expect(result).toEqual({ok:true,kind:'date-time',dateTime:'zoned',text});if(!result.ok)throw new Error();expect(formatCalculationText(result)).toBe(text);});
it.each([
 '2024-01-31T12:00[UTC] + P1M to UTC',
 '2024-02-29T12:00[UTC] + P1Y to UTC',
 '2024-03-31T12:00[UTC] - P1M to UTC',
 '2024-03-09T02:30[America/New_York] + P1D to UTC',
 '2024-11-02T01:30[America/New_York] + P1D to UTC',
 '2024-11-02T01:30-04:00[America/New_York] + P1D to UTC',
 '2011-12-29T12:00[Pacific/Apia] + P1D to UTC',
 '9999-12-31T00:00[UTC] + P1D to UTC',
 '0001-01-01T00:00[UTC] - P1Y to UTC',
 '9999-12-31T23:59:59.999999999[UTC] + PT0.000000001S to UTC',
 '0001-01-01T00:00[UTC] - PT0.000000001S to UTC',
 '2024-01-01T00:00[UTC] + P999999Y to UTC',
 '2024-01-01T00:00[UTC] + P999999M to UTC',
 '2024-01-01T00:00[UTC] + P999999W to UTC',
])('refuses invalid or missing/repeated calendar results without shifting/clamping: %s',input=>{expect(evaluateExpression(input)).toMatchObject({ok:false,code:'invalid-duration-result'});});
it.each(['P','PT','P1DT','P01D','P1000000D','PT1000000H','PT1000000S','P1.5D','PT1.5H','PT1.5M','PT.5S','PT1,5S','PT1e3S','P-1D','-P1D','P1D1D','P1M1Y','P1D2W','PT1S1M','PT1.0000000001S','P1Q','p1d','1d','PNaND','PInfinityD'])('rejects malformed/over-limit duration atom: %s',duration=>{const input=`2024-01-01T00:00[UTC] + ${duration} to UTC`,result=evaluateExpression(input);expect(result).toMatchObject({ok:false,code:'invalid-duration'});if(result.ok)throw new Error();expect(result.message).not.toContain(duration);});
it.each([
 ['2024-11-03T01:30[America/New_York] + P1D to UTC','ambiguous-date-time'],
 ['2024-03-10T02:30[America/New_York] + P1D to UTC','nonexistent-date-time'],
 ['2024-11-03T01:30-06:00[America/New_York] + P1D to UTC','invalid-date-time'],
 ['2024-01-01T00:00[UTC] + P1D to EST','unsupported-time-zone'],
 ['2024-01-01T00:00[UTC]+P1D to UTC','invalid-date-time'],
 ['2024-01-01T00:00[UTC] + P1D + P1D to UTC','invalid-date-time'],
])('retains strict source and one-operation grammar: %s',(input,code)=>{expect(evaluateExpression(input)).toMatchObject({ok:false,code});});
