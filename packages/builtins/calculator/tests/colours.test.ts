import {describe,expect,it} from 'vitest';
import {calculatorColourValueSchema} from '@linuxcast/contracts';
import type {CalculatorColourFormat} from '@linuxcast/contracts';
import {evaluateColourExpression} from '../src/colours.ts';
import {evaluateExpression} from '../src/evaluate.ts';
import {formatCalculationText} from '../src/result.ts';

function colour(expression:string,target:CalculatorColourFormat,text:string) {
  const result=evaluateExpression(expression);
  expect(result).toEqual({ok:true,kind:'colour',colour:target,text});
  expect(evaluateColourExpression(expression)).toEqual(result);
  if(!result.ok||result.kind!=='colour')throw new Error('Expected a synthetic colour result.');
  expect(calculatorColourValueSchema.safeParse({colour:result.colour,text:result.text}).success).toBe(true);
  expect(formatCalculationText(result)).toBe(text);expect(result).not.toHaveProperty('value');expect(result).not.toHaveProperty('unit');
}
function invalid(expression:string) {
  expect(evaluateExpression(expression)).toEqual({ok:false,code:'invalid-colour',message:'Use a supported hex, RGB or HSL colour conversion within the component ranges.'});
}
describe('L2-04 pure bounded encoded-sRGB colour conversions',()=>{
  it.each([
    ['#f00 to rgb','rgb(255 0 0)'],['#0f0 to rgb','rgb(0 255 0)'],['#00f to rgb','rgb(0 0 255)'],
    ['#ff0 to rgb','rgb(255 255 0)'],['#0ff to rgb','rgb(0 255 255)'],['#f0f to rgb','rgb(255 0 255)'],
    ['#000 to rgb','rgb(0 0 0)'],['#fff to rgb','rgb(255 255 255)'],['#808080 to rgb','rgb(128 128 128)'],
    ['#663399 to rgb','rgb(102 51 153)'],['#AbCdEf to rgb','rgb(171 205 239)'],
    ['#abcd to rgb','rgb(170 187 204 / 0.866667)'],['#10203080 to rgb','rgb(16 32 48 / 0.501961)'],
    ['#ff000000 to rgb','rgb(255 0 0 / 0)'],['#abcdefFF to rgb','rgb(171 205 239)'],
  ])('decodes fixed hex fixtures: %s',(expression,text)=>{colour(expression,'rgb',text);});

  it.each([
    ['#f00 to hsl','hsl(0 100% 50%)'],['#0f0 to hsl','hsl(120 100% 50%)'],['#00f to hsl','hsl(240 100% 50%)'],
    ['#ff0 to hsl','hsl(60 100% 50%)'],['#0ff to hsl','hsl(180 100% 50%)'],['#f0f to hsl','hsl(300 100% 50%)'],
    ['#000 to hsl','hsl(0 0% 0%)'],['#fff to hsl','hsl(0 0% 100%)'],['#808080 to hsl','hsl(0 0% 50.196078%)'],
    ['#663399 to hsl','hsl(270 50% 40%)'],['#33669980 to hsl','hsl(210 50% 40% / 0.501961)'],
    ['#abcdef to hsl','hsl(210 68% 80.392157%)'],
  ])('computes independent HSL primary, secondary, grey and nontrivial fixtures: %s',(expression,text)=>{colour(expression,'hsl',text);});

  it.each([
    ['hsl(0 100% 50%) to rgb','rgb(255 0 0)'],['hsl(60, 100%, 50%) to rgb','rgb(255 255 0)'],
    ['hsl(120 100% 50%) to rgb','rgb(0 255 0)'],['hsl(180 100% 50%) to rgb','rgb(0 255 255)'],
    ['hsl(240,100%,50%) to rgb','rgb(0 0 255)'],['hsl(300 100% 50%) to rgb','rgb(255 0 255)'],
    ['hsl(210 50% 40%) to rgb','rgb(51 102 153)'],['hsla(270,60%,70%,25%) to rgb','rgb(178.5 132.6 224.4 / 0.25)'],
    ['hsl(30 100% 25% / .5) to rgb','rgb(127.5 63.75 0 / 0.5)'],['hsl(200 0% 50%) to rgb','rgb(127.5 127.5 127.5)'],
    ['hsl(-120deg 100% 50%) to rgb','rgb(0 0 255)'],['hsl(+7.2e2deg 100% 50%) to rgb','rgb(255 0 0)'],
  ])('converts HSL using encoded sRGB: %s',(expression,text)=>{colour(expression,'rgb',text);});

  it.each([
    ['#AbC to hex','#aabbcc'],['#aBcF to hex','#aabbcc'],['#ABCDEFff to hex','#abcdef'],['#0000 to hex','#00000000'],
    ['rgba(255,0,128,0.5) to hex','#ff008080'],['rgb(0.5 1.5 254.5) to hex','#0102ff'],
    ['rgb(10% 20% 30% / 25%) to hex','#1a334d40'],['hsl(210 50% 40%) to hex','#336699'],
    ['hsl(270 60% 70%) to hex','#b385e0'],['hsl(30 100% 25% / .5) to hex','#80400080'],
    ['rgb(255 0 0 / 0) to hex','#ff000000'],['rgb(0 0 0 / 0.999) to hex','#000000'],
    ['rgb(0 0 0 / 0.998) to hex','#000000fe'],['rgb(0 0 0 / 0.001) to hex','#00000000'],
    ['rgb(0 0 0 / 0.002) to hex','#00000001'],
  ])('quantizes hex RGB and alpha channels to the nearest byte: %s',(expression,text)=>{colour(expression,'hex',text);});

  it.each([
    ['rgb(10%, 20%, 30%, 50%) to rgb','rgb(25.5 51 76.5 / 0.5)'],
    ['rgba(+2.55e2,0.,.5,1e-1) to rgb','rgb(255 0 0.5 / 0.1)'],
    ['rgba(1 2 3) to rgb','rgb(1 2 3)'],['rgb(1,2,3,1) to rgb','rgb(1 2 3)'],
    ['rgb(1.12345678 2.500000 3.000000 / 0.12345678) to rgb','rgb(1.123457 2.5 3 / 0.123457)'],
    ['rgb(-0 +0 0.0000004 / -0) to rgb','rgb(0 0 0 / 0)'],
    ['rgb(1 2 3 / 0.9999996) to rgb','rgb(1 2 3)'],
    ['rgb(1 2 3 / 0.0000004) to rgb','rgb(1 2 3 / 0)'],
    ['  rgb(1 2 3)   to   rgb   ','rgb(1 2 3)'],
  ])('canonicalizes functional decimals, aliases and alpha: %s',(expression,text)=>{colour(expression,'rgb',text);});

  it.each([
    ['hsl(360 100% 50%) to hsl','hsl(0 100% 50%)'],['hsl(-360 100% 50%) to hsl','hsl(0 100% 50%)'],
    ['hsl(-30 100% 50%) to hsl','hsl(330 100% 50%)'],['hsl(390deg 100% 50%) to hsl','hsl(30 100% 50%)'],
    ['hsl(1e9 100% 50%) to hsl','hsl(280 100% 50%)'],['hsl(-1e9 100% 50%) to hsl','hsl(80 100% 50%)'],
    ['hsl(359.9999996 100% 50%) to hsl','hsl(0 100% 50%)'],
    ['hsl(170 0% 50%) to hsl','hsl(0 0% 50%)'],['hsla(170,100%,0%,1) to hsl','hsl(0 0% 0%)'],
    ['hsl(170 100% 100%) to hsl','hsl(0 0% 100%)'],['hsl(170 0.0000004% 50%) to hsl','hsl(0 0% 50%)'],
    ['hsl(170 100% 0.0000004%) to hsl','hsl(0 0% 0%)'],['hsl(170 100% 99.9999996%) to hsl','hsl(0 0% 100%)'],
    ['hsl(-0 100% 50% / 0.500000) to hsl','hsl(0 100% 50% / 0.5)'],
    ['rgb(0.0000000000000000000000001 0 0) to hsl','hsl(0 0% 0%)'],
  ])('wraps hue and normalizes achromatic output before and after rounding: %s',(expression,text)=>{colour(expression,'hsl',text);});

  it.each([
    '#12 to hex','#12345 to rgb','#1234567 to hsl','#123456789 to hex','#ggg to rgb','# abc to hex',
    '#abc','#abc to HEX','#abc to rgba','#abc to rgb to hex','#abc to rgb extra','#abc to rgb;process.exit()',
    'rgb(1 2 3)','rgb(1 2 3) to RGB','RGB(1 2 3) to rgb','rgb (1 2 3) to rgb','rgb() to hex',
    'rgb(1,2) to hex','rgba(1,2,3,4,5) to hex','rgb(1 2 3 .5) to hex','rgb(1,2,3 / .5) to hex',
    'rgb(1 2 3, .5) to hex','rgb(1 2 3 / .5 / .5) to hex','rgb(1 2 3 /) to hex','rgb(1,2,3,) to hex',
    'rgb(256 0 0) to hex','rgb(-0.00001 0 0) to rgb','rgb(0 101% 0) to rgb','rgb(0% 0% 100.000001%) to hex',
    'rgb(0% 0 0%) to rgb','rgb(0 0% 0) to hex','rgb(NaN 0 0) to hex','rgb(Infinity 0 0) to rgb',
    'rgb(1e999 0 0) to rgb','rgb(1_0 0 0) to rgb','rgb(0xff 0 0) to rgb','rgb(1+2 0 0) to rgb',
    'rgb(0 0 0 / 1.000001) to hex','rgb(0 0 0 / -0.1) to hex','rgb(0 0 0 / 101%) to rgb',
    'rgb(0 0 0 / 1e999) to rgb','rgb(var(--x) 0 0) to rgb','rgb(calc(1 + 2) 0 0) to rgb',
    'hsl(0 100 50%) to rgb','hsl(0 100% 50) to rgb','hsl(0% 100% 50%) to rgb','hsl(1rad 100% 50%) to rgb',
    'hsl(1turn 100% 50%) to rgb','hsl(1e9deg 101% 0%) to hsl','hsl(1000000001 100% 50%) to hsl',
    'hsl(-1000000001 100% 50%) to rgb','hsl(Infinity 100% 50%) to hex','hsl(0 -1% 50%) to hex',
    'hsl(0 50% -1%) to hex','hsl(0 50% 101%) to hex','hsl(0 50% 50% / 1.1) to hex',
    'red to hex','currentColor to rgb','transparent to hsl','color(display-p3 1 0 0) to hex',
    'url(https://example.invalid) to rgb','globalThis.process.exit() to rgb','({}) to hsl',
    'constructor.constructor("return 1")() to rgb','1 m to hex','rgb(0 0 0) to rgb /*synthetic*/',
  ])('rejects unsupported, malformed, out-of-range or hostile colour attempts: %s',expression=>{invalid(expression);});

  it('leaves ordinary words, arithmetic and unit conversions to their existing evaluator',()=>{
    for(const expression of ['red','rgb','rgba','hsl','hex','ordinary words','2+3','sqrt(81)','1 m to cm','1 m to unknown'])expect(evaluateColourExpression(expression)).toBeUndefined();
    expect(evaluateExpression('2+3')).toEqual({ok:true,value:5,text:'5'});
    expect(evaluateExpression('1 m to cm')).toEqual({ok:true,value:100,text:'100',unit:'cm'});
    expect(evaluateExpression('ordinary words')).toMatchObject({ok:false,code:'invalid-expression'});
    expect(evaluateColourExpression(null as unknown as string)).toBeUndefined();
  });

  it('uses the existing byte/ASCII guards and bounds its independently exported helper',()=>{
    const expression='#000 to hex';colour(expression+' '.repeat(512-expression.length),'hex','#000000');
    expect(evaluateExpression(expression+' '.repeat(513-expression.length))).toMatchObject({ok:false,code:'limit-exceeded'});
    expect(evaluateColourExpression('#'+'0'.repeat(100_000)+' to hex')).toMatchObject({ok:false,code:'limit-exceeded'});
    expect(evaluateExpression('#000 to hex'+'界'.repeat(168))).toMatchObject({ok:false,code:'limit-exceeded'});
    for(const expression of ['rgb(0\t0 0) to hex','#000 to hex\n','#000\0 to hex','#000 to hex\ud800','rgb(２ 0 0) to hex'])expect(evaluateExpression(expression)).toMatchObject({ok:false,code:'invalid-expression'});
    invalid('rgb('+','.repeat(400)+') to hex');invalid('hsl('+ '1'.repeat(450)+' 0% 0%) to rgb');
  });
});
