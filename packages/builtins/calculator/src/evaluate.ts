import type {Calculation} from './types.ts';
import {convertUnitValue} from './units.ts';
import {evaluateColourExpression} from './colours.ts';
import {evaluateDateTimeExpression} from './date-times.ts';

type FailureCode=Extract<Calculation,{ok:false}>['code'];
type Token={kind:'number';value:number}|{kind:'name';value:string}|{kind:'+'|'-'|'*'|'/'|'^'|'%'|'('|')'|','|'end'};
const messages:Record<FailureCode,string>={
  'invalid-expression':'Enter a supported mathematical expression.',
  'limit-exceeded':'This expression exceeds the calculator limits.',
  'domain-error':'This calculation has no finite real result.',
  'unsupported-unit':'Use a supported, unambiguous unit identifier.',
  'incompatible-units':'Choose units with the same dimension.',
  'invalid-colour':'Use a supported hex, RGB or HSL colour conversion within the component ranges.',
  'invalid-duration':'Use a supported ISO duration with bounded components and seconds-only fractions.',
  'invalid-duration-result':'The duration produces an invalid date or a missing or repeated local time. Choose another date/duration or use elapsed hours.',
  'invalid-date-time':'Use an explicit valid ISO date/time, matching offset and named zone.',
  'unsupported-time-zone':'Use UTC or a supported IANA area/location time zone.',
  'ambiguous-date-time':'This local time occurs twice. Add its matching UTC offset to choose one occurrence.',
  'nonexistent-date-time':'This local time does not exist. Choose a valid time outside the clock change.',
};
class EvaluationFailure extends Error {
  readonly code:FailureCode;
  constructor(code:FailureCode) {super(messages[code]);this.code=code;}
}
function reject(code:FailureCode):never {throw new EvaluationFailure(code);}
const finite=(value:number):number=>Number.isFinite(value)?value:reject('domain-error');

function tokenize(input:string):Token[] {
  const tokens:Token[]=[];
  for(let offset=0;offset<input.length;) {
    const char=input[offset]!;
    if(char===' ') {offset++;continue;}
    if(tokens.length>=256)reject('limit-exceeded');
    if(/[0-9.]/u.test(char)) {
      const match=/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/u.exec(input.slice(offset));
      if(!match)reject('invalid-expression');
      tokens.push({kind:'number',value:finite(Number(match[0]))});offset+=match[0].length;continue;
    }
    if(/[a-z]/u.test(char)) {
      const name=/^[a-z]+/u.exec(input.slice(offset))![0];
      tokens.push({kind:'name',value:name});offset+=name.length;continue;
    }
    switch(char) {
      case '+':case '-':case '*':case '/':case '^':case '%':case '(':case ')':case ',':tokens.push({kind:char});offset++;break;
      default:reject('invalid-expression');
    }
  }
  tokens.push({kind:'end'});return tokens;
}

/** Recursive descent has a semantic depth budget; loops handle flat arithmetic.
 * No source text is interpreted as JavaScript or as an object/property name. */
class Parser {
  private readonly tokens:Token[];
  private position=0;
  private operations=0;
  constructor(tokens:Token[]) {this.tokens=tokens;}
  private current():Token {return this.tokens[this.position]!;}
  private take(kind:Token['kind']):boolean {if(this.current().kind!==kind)return false;this.position++;return true;}
  private expect(kind:Token['kind']) {if(!this.take(kind))reject('invalid-expression');}
  private depth(value:number) {if(value>32)reject('limit-exceeded');}
  private operation() {if(++this.operations>256)reject('limit-exceeded');}
  parse():number {const value=this.sum(0);this.expect('end');return value;}
  private sum(depth:number):number {
    let value=this.product(depth);
    for(;;) {
      if(this.take('+')) {this.operation();value=finite(value+this.product(depth));}
      else if(this.take('-')) {this.operation();value=finite(value-this.product(depth));}
      else return value;
    }
  }
  private product(depth:number):number {
    let value=this.unary(depth);
    for(;;) {
      if(this.take('*')) {this.operation();value=finite(value*this.unary(depth));}
      else if(this.take('/')) {
        this.operation();const denominator=this.unary(depth);
        if(denominator===0)reject('domain-error');value=finite(value/denominator);
      }else return value;
    }
  }
  private unary(depth:number):number {
    this.depth(depth);
    if(this.take('+')) {this.operation();return this.unary(depth+1);}
    if(this.take('-')) {this.operation();return finite(-this.unary(depth+1));}
    return this.power(depth);
  }
  private power(depth:number):number {
    const base=this.postfix(depth);
    if(!this.take('^'))return base;
    this.operation();const exponent=this.unary(depth+1);
    if(base===0&&exponent===0)reject('domain-error');
    return finite(Math.pow(base,exponent));
  }
  private postfix(depth:number):number {
    let value=this.primary(depth);
    while(this.take('%')) {this.operation();value=finite(value/100);}
    return value;
  }
  private primary(depth:number):number {
    const token=this.current();
    if(token.kind==='number') {this.position++;return token.value;}
    if(this.take('(')) {const value=this.sum(depth+1);this.expect(')');return value;}
    if(token.kind!=='name')return reject('invalid-expression');
    this.position++;
    if(token.value==='pi')return Math.PI;
    if(token.value==='e')return Math.E;
    switch(token.value) {
      case 'sqrt':case 'abs':case 'floor':case 'ceil':case 'round':case 'min':case 'max':case 'log':case 'ln':case 'exp':case 'sin':case 'cos':case 'tan':break;
      default:return reject('invalid-expression');
    }
    this.expect('(');
    const args:number[]=[];
    // Every supported function requires at least one argument. Argument lists
    // are never unbounded, including for unknown function names.
    args.push(this.sum(depth+1));
    while(this.take(',')) {
      if(args.length>=16)reject('invalid-expression');
      args.push(this.sum(depth+1));
    }
    this.expect(')');this.operation();
    if(token.value==='min')return Math.min(...args);
    if(token.value==='max')return Math.max(...args);
    if(args.length!==1)reject('invalid-expression');
    const value=args[0]!;
    switch(token.value) {
      case 'sqrt':return finite(Math.sqrt(value));
      case 'abs':return Math.abs(value);
      case 'floor':return Math.floor(value);
      case 'ceil':return Math.ceil(value);
      case 'round':return Math.round(value);
      case 'log':if(value<=0)return reject('domain-error');return finite(Math.log10(value));
      case 'ln':if(value<=0)return reject('domain-error');return finite(Math.log(value));
      case 'exp':return finite(Math.exp(value));
      case 'sin':return finite(Math.sin(value));
      case 'cos':return finite(Math.cos(value));
      case 'tan':return finite(Math.tan(value));
      default:return reject('invalid-expression');
    }
  }
}

function format(value:number):string {
  const rounded=value.toPrecision(15);
  let display=Number(rounded);
  if(!Number.isFinite(display)) {
    // Nearest decimal rounding can push Number.MAX_VALUE past the finite range.
    // Move one decimal unit toward zero, retaining fifteen significant digits.
    const [mantissa,exponent]=rounded.split('e');
    const digits=mantissa!.replace('-','').replace('.','');
    const lower=String(Number(digits)-1);
    display=Number(`${value<0?'-':''}${lower[0]}.${lower.slice(1)}e${exponent}`);
  }
  return String(Object.is(display,-0)?0:display);
}

/** Only a single explicit top-level conversion suffix is supported. The scalar
 * remains the existing arithmetic grammar, with its independent fixed bounds. */
function conversion(input:string):{scalar:string;source:string;target:string}|undefined {
  const delimiters=[...input.matchAll(/ +to +/gu)];
  if(delimiters.length===0)return undefined;
  if(delimiters.length!==1)return reject('invalid-expression');
  const delimiter=delimiters[0]!;
  const left=input.slice(0,delimiter.index).trimEnd();
  const separator=left.lastIndexOf(' ');
  if(separator===-1)return reject('invalid-expression');
  const scalar=left.slice(0,separator).trimEnd(),source=left.slice(separator+1),target=input.slice(delimiter.index+delimiter[0].length).trim();
  const identifier=/^[A-Za-z_][A-Za-z0-9_/]*$/u;
  if(!scalar||!identifier.test(source)||!identifier.test(target))return reject('invalid-expression');
  return {scalar,source,target};
}

/** Pure, bounded local calculator. Runtime-invalid input always yields a fixed
 * failure; input text is never executed, persisted, or transmitted. */
export function evaluateExpression(input:string):Calculation {
  try {
    if(typeof input!=='string')return reject('invalid-expression');
    if(input.length>512||new TextEncoder().encode(input).length>512)return reject('limit-exceeded');
    // ASCII space is the sole whitespace. This also rejects controls, DEL,
    // non-ASCII syntax and lone UTF-16 surrogates before tokenization.
    if(/[^\x20-\x7e]/u.test(input))return reject('invalid-expression');
    const dateTime=evaluateDateTimeExpression(input);if(dateTime!==undefined)return dateTime;
    const colour=evaluateColourExpression(input);if(colour!==undefined)return colour;
    const request=conversion(input);
    const scalar=finite(new Parser(tokenize(request?.scalar??input)).parse());
    if(request) {
      const result=convertUnitValue(scalar,request.source,request.target);
      if(!result.ok)return reject(result.code);
      return {ok:true,value:result.value,text:format(result.value),unit:result.unit};
    }
    const value=Object.is(scalar,-0)?0:scalar;
    return {ok:true,value,text:format(value)};
  }catch(error) {
    const code=error instanceof EvaluationFailure?error.code:'invalid-expression';
    return {ok:false,code,message:messages[code]};
  }
}
