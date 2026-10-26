import type {CalculatorColourFormat} from '@linuxcast/contracts';
import type {Calculation} from './types.ts';

type RGB=[number,number,number];
type Colour={rgb:RGB;alpha:number};
const invalid=():Calculation=>({ok:false,code:'invalid-colour',message:'Use a supported hex, RGB or HSL colour conversion within the component ranges.'});
const atomPattern=/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/u;
function atom(text:string):number|undefined {
  if(!atomPattern.test(text))return undefined;
  const value=Number(text);return Number.isFinite(value)?value:undefined;
}
function component(text:string,maximum:number,percentage:boolean):number|undefined {
  if(text.endsWith('%')!==percentage)return undefined;
  const value=atom(percentage?text.slice(0,-1):text);
  if(value===undefined||value<0||value>maximum)return undefined;
  return value/maximum;
}
const hue=(value:number)=>((value%360)+360)%360;
const clamp=(value:number)=>Math.max(0,Math.min(1,value));

function fromHsl(h:number,s:number,l:number):RGB {
  const chroma=(l<=0.5?2*l:2*(1-l))*s;
  const segment=h/60,secondary=chroma*(1-Math.abs(segment%2-1)),offset=l-chroma/2;
  let rgb:RGB;
  if(segment<1)rgb=[chroma,secondary,0];
  else if(segment<2)rgb=[secondary,chroma,0];
  else if(segment<3)rgb=[0,chroma,secondary];
  else if(segment<4)rgb=[0,secondary,chroma];
  else if(segment<5)rgb=[secondary,0,chroma];
  else rgb=[chroma,0,secondary];
  // Inputs were range-checked; this only contains derived floating-point noise.
  return rgb.map(channel=>clamp(channel+offset)) as RGB;
}
function toHsl([r,g,b]:RGB):[number,number,number] {
  const high=Math.max(r,g,b),low=Math.min(r,g,b),delta=high-low,lightness=(high+low)/2;
  if(delta===0)return [0,0,lightness];
  // Avoid subtracting nearly equal values for colours close to black or white.
  const saturation=delta/(lightness<=0.5?high+low:(1-high)+(1-low));
  const sector=high===r?(g-b)/delta:high===g?(b-r)/delta+2:(r-g)/delta+4;
  return [hue(sector*60),clamp(saturation),lightness];
}
function parseHex(text:string):Colour|undefined {
  if(!/^#[0-9a-f]+$/iu.test(text))return undefined;
  let digits=text.slice(1);
  if(digits.length===3||digits.length===4)digits=[...digits].map(char=>char+char).join('');
  if(digits.length!==6&&digits.length!==8)return undefined;
  const channel=(start:number)=>Number.parseInt(digits.slice(start,start+2),16)/255;
  return {rgb:[channel(0),channel(2),channel(4)],alpha:digits.length===8?channel(6):1};
}
function parseFunction(text:string):Colour|undefined {
  const match=/^(rgb|rgba|hsl|hsla)\(([^()]*)\)$/u.exec(text);
  if(!match)return undefined;
  const body=match[2]!.trim();let parts:string[],alphaText:string|undefined;
  if(body.includes(',')) {
    if(body.includes('/'))return undefined;
    parts=body.split(',').map(part=>part.trim());
    if(parts.length!==3&&parts.length!==4)return undefined;
    alphaText=parts[3];parts=parts.slice(0,3);
  }else {
    const groups=body.split('/');if(groups.length>2)return undefined;
    parts=groups[0]!.trim().split(/ +/u);alphaText=groups[1]?.trim();
    if(parts.length!==3)return undefined;
  }
  const alpha=alphaText===undefined?1:component(alphaText,alphaText.endsWith('%')?100:1,alphaText.endsWith('%'));
  if(alpha===undefined)return undefined;
  if(match[1]==='rgb'||match[1]==='rgba') {
    const percentage=parts[0]!.endsWith('%'),maximum=percentage?100:255;
    const r=component(parts[0]!,maximum,percentage),g=component(parts[1]!,maximum,percentage),b=component(parts[2]!,maximum,percentage);
    return r===undefined||g===undefined||b===undefined?undefined:{rgb:[r,g,b],alpha};
  }
  const textHue=parts[0]!,rawHue=atom(textHue.endsWith('deg')?textHue.slice(0,-3):textHue);
  const s=component(parts[1]!,100,true),l=component(parts[2]!,100,true);
  if(rawHue===undefined||Math.abs(rawHue)>1e9||s===undefined||l===undefined)return undefined;
  return {rgb:fromHsl(hue(rawHue),s,l),alpha};
}
const round=(value:number)=>Number(value.toFixed(6));
const decimal=(value:number)=>String(Object.is(value,-0)?0:value);
function format(colour:Colour,target:CalculatorColourFormat):string {
  if(target==='hex') {
    const byte=(value:number)=>Math.round(clamp(value)*255).toString(16).padStart(2,'0');
    const alpha=byte(colour.alpha);
    return '#'+colour.rgb.map(byte).join('')+(alpha==='ff'?'':alpha);
  }
  const alpha=round(colour.alpha),suffix=alpha===1?'':` / ${decimal(alpha)}`;
  if(target==='rgb')return `rgb(${colour.rgb.map(channel=>decimal(round(channel*255))).join(' ')}${suffix})`;
  const [rawHue,rawSaturation,rawLightness]=toHsl(colour.rgb);
  let h=round(rawHue),s=round(rawSaturation*100);const l=round(rawLightness*100);
  if(h>=360)h=0;
  // Canonicalize after rounding too: quantized black/white/grey has no hue.
  if(l===0||l===100)s=0;
  if(s===0)h=0;
  return `hsl(${decimal(h)} ${decimal(s)}% ${decimal(l)}%${suffix})`;
}

/** Closed local encoded-sRGB conversion, not CSS evaluation. Undefined leaves
 * non-colour expressions to the existing arithmetic/unit evaluator. */
export function evaluateColourExpression(input:string):Calculation|undefined {
  if(typeof input!=='string')return undefined;
  // Attempt detection inspects bounded pieces even when called directly with an
  // oversized string. evaluateExpression already applies its global guards.
  const start=input.slice(0,512).trimStart(),end=input.slice(-512);
  if(!start.startsWith('#')&&!/^(?:rgba?|hsla?) *\(/iu.test(start)&&!/ +to +(hex|rgb|hsl) *$/iu.test(end))return undefined;
  if(input.length>512||new TextEncoder().encode(input).length>512)return {ok:false,code:'limit-exceeded',message:'This expression exceeds the calculator limits.'};
  if(/[^\x20-\x7e]/u.test(input))return invalid();
  const parts=input.trim().split(/ +to +/u);
  if(parts.length!==2)return invalid();
  const source=parts[0]!.trim(),target=parts[1]!.trim();
  if(target!=='hex'&&target!=='rgb'&&target!=='hsl')return invalid();
  const colour=source.startsWith('#')?parseHex(source):parseFunction(source);
  if(!colour)return invalid();
  return {ok:true,kind:'colour',colour:target,text:format(colour,target)};
}
