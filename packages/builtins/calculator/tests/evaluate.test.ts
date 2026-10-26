import {describe,expect,it} from 'vitest';
import {calculatorResultTextSchema} from '@linuxcast/contracts';
import {evaluateExpression} from '../src/evaluate.ts';

function value(input:string):number {
  const result=evaluateExpression(input);expect(result.ok,JSON.stringify(result)).toBe(true);
  if(!result.ok)throw new Error('Expected a successful synthetic calculation.');
  expect(Number.isFinite(result.value)).toBe(true);expect(calculatorResultTextSchema.safeParse(result.text).success).toBe(true);
  return result.value;
}
function failure(input:unknown,code:'invalid-expression'|'limit-exceeded'|'domain-error') {
  const result=evaluateExpression(input as string);expect(result).toMatchObject({ok:false,code});
  expect(result).toEqual(evaluateExpression(input as string));return result;
}
describe('L2-04 pure bounded calculator evaluator',()=>{
  it.each([
    ['2+3*4',14],['(2+3)*4',20],['10-3-2',5],['24/4/2',3],['2*3/4',1.5],['2+3-4+5',6],
    ['-2^2',-4],['(-2)^2',4],['2^3^2',512],['(2^3)^2',64],['2^-2',0.25],['2^-2^2',0.0625],
    ['-2^-2',-0.25],['2^--2',4],['--2^2',4],['2*-3',-6],['2+-3',-1],['2--3',5],['+(-(+2))',-2],
    ['.5+1.',1.5],['01.50+0002',3.5],['1e3+2E-2',1000.02],['.5e+2',50],['1.e2',100],['1e-999',0],
  ])('evaluates %s with expected arithmetic precedence',(input,expected)=>{expect(value(input)).toBe(expected);});

  it.each([
    ['50%',0.5],['100+20%',100.2],['100*20%',20],['-50%',-0.5],['(25+25)%',0.5],['50%%',0.005],
    ['2^3%',1.0210121257071934],['2%^3',0.000008],['200/50%',400],['2^-50%',0.7071067811865475],
  ])('uses postfix percent as division by 100: %s',(input,expected)=>{expect(value(input)).toBeCloseTo(expected,14);});

  it.each([
    ['pi',3.141592653589793],['e',2.718281828459045],['sqrt(81)',9],['abs(-12.5)',12.5],['floor(-1.2)',-2],
    ['ceil(-1.2)',-1],['round(2.5)',3],['round(-2.5)',-2],['min(3)',3],['min(7,-4,9)',-4],['max(7,-4,9)',9],
    ['log(1000)',3],['ln(e)',1],['exp(0)',1],['sin(pi/2)',1],['cos(0)',1],['tan(0)',0],['tan(pi/4)',1],
    ['max(sqrt(16),min(3,2))+abs(-5)',9],['min(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16)',1],
  ])('evaluates fixed functions and constants: %s',(input,expected)=>{expect(value(input)).toBeCloseTo(expected,14);});

  it.each([
    '1/0','1/-0','0/0','sqrt(-1)','log(0)','log(-10)','ln(0)','ln(-1)','(-2)^0.5','0^0','0^-1',
    'exp(1000)','10^1000','1e309','-1e309','1e308*10','1e308+1e308','1/1e-999','(-1e308)-1e308',
  ])('rejects nonfinite or undefined real calculations: %s',input=>{failure(input,'domain-error');});

  it.each([
    '', ' ', '.', '1..2', '1e', '1e+', '1e--2', '+', '-', '2+', '*2', '()', '(2', '2)', '1,2',
    '2(3)', '(2)(3)', '2pi', 'pi2', '2 e', 'sin 0', 'pi(2)', 'e(2)', 'sqrt()', 'sqrt(1,2)', 'min()',
    'min(1,)', 'max(,1)', 'round(1,2)', 'log(1,10)', 'min(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17)',
    'PI','SIN(0)','banana','unknown(1)','unknown(1/0)','Infinity','NaN','0xff','0b11','0o12','1_000','1n',
    '2**3','2//3','1==1','1<2','true','false','null','undefined','1?2:3', '[1,2]', '{a:1}', '1;2',
    'Math.sin(0)','globalThis.process.exit()','constructor.constructor("return 1")()', 'abs.call(null,1)',
    '(() => 1)()', 'import("node:fs")','process.env','fetch("https://example.invalid")','1/*synthetic*/+2',
    '1\n+2','1\t+2','\0','1\r+2','\u007f','\u0085','\ud800','\udfff','😀','２+３','2×3','2÷3','−2','1\u00a0+2',
  ])('rejects unsupported or adversarial syntax: %j',input=>{failure(input,'invalid-expression');});

  it('rejects invalid runtime types without coercion or invoking user code',()=>{
    const object={toString:()=>{throw new Error('This must not be invoked.');}};
    for(const input of [undefined,null,1,NaN,Infinity,true,[],{},new String('2+2'),object,Symbol('synthetic'),()=>4])failure(input,'invalid-expression');
  });

  it('accepts at most 512 UTF-8 bytes, rejects controls and never trims a huge input',()=>{
    expect(value('1'+' '.repeat(511))).toBe(1);failure('1'+' '.repeat(512),'limit-exceeded');
    failure('界'.repeat(171),'limit-exceeded');failure('界'.repeat(170),'invalid-expression');
    failure('1'.repeat(100_000),'limit-exceeded');failure(' '.repeat(512),'invalid-expression');
  });

  it('enforces token, semantic recursion and argument limits at their boundaries',()=>{
    expect(value('1'+'%'.repeat(255))).toBe(0);failure('1'+'%'.repeat(256),'limit-exceeded');
    expect(value('('.repeat(32)+'1'+')'.repeat(32))).toBe(1);failure('('.repeat(33)+'1'+')'.repeat(33),'limit-exceeded');
    expect(value('-'.repeat(32)+'1')).toBe(1);failure('-'.repeat(33)+'1','limit-exceeded');
    expect(value(Array(33).fill('1').join('^'))).toBe(1);failure(Array(34).fill('1').join('^'),'limit-exceeded');
    expect(value('sqrt('.repeat(32)+'1'+')'.repeat(32))).toBe(1);failure('sqrt('.repeat(33)+'1'+')'.repeat(33),'limit-exceeded');
    expect(value('max(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16)')).toBe(16);
    failure('max(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17)','invalid-expression');
  });

  it('formats finite numeric output to fifteen significant digits with normalized negative zero',()=>{
    const examples=[['1/3','0.333333333333333'],['0.1+0.2','0.3'],['pi','3.14159265358979'],['e','2.71828182845905'],
      ['1e21','1e+21'],['1e-7','1e-7'],['-0','0'],['round(-0.1)','0'],['-1e-999','0'],['5e-324','5e-324'],
      ['9007199254740993','9007199254740990'],['1.7976931348623157e308','1.79769313486231e+308'],['-1.7976931348623157e308','-1.79769313486231e+308']];
    for(const [expression,text] of examples) {
      const result=evaluateExpression(expression!);expect(result).toMatchObject({ok:true,text});
      if(result.ok) {expect(calculatorResultTextSchema.safeParse(result.text).success).toBe(true);expect(Object.is(result.value,-0)).toBe(false);}
    }
    expect(value('9007199254740993')).toBe(9007199254740992);
    expect(value('1.7976931348623157e308')).toBe(Number.MAX_VALUE);
  });

  it('returns fixed error messages without copying expression content',()=>{
    expect(failure('syntheticInvalidName','invalid-expression')).toEqual({ok:false,code:'invalid-expression',message:'Enter a supported mathematical expression.'});
    expect(failure('1/0','domain-error')).toEqual({ok:false,code:'domain-error',message:'This calculation has no finite real result.'});
    expect(failure('1'.repeat(513),'limit-exceeded')).toEqual({ok:false,code:'limit-exceeded',message:'This expression exceeds the calculator limits.'});
  });
});
