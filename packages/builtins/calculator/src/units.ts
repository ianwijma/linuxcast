import type {CalculatorUnit} from '@linuxcast/contracts';

type Dimension='length'|'mass'|'duration'|'temperature'|'angle'|'data'|'area'|'volume'|'speed'|'energy'|'power'|'pressure';
type Unit={readonly id:CalculatorUnit;readonly label:string;readonly dimension:Dimension;readonly scale:number};
type Conversion={ok:true;value:number;unit:CalculatorUnit}|{ok:false;code:'unsupported-unit'|'incompatible-units'|'domain-error'};
const inch=0.0254,foot=0.3048,pound=0.45359237,gravity=9.80665;
const usGallon=231*inch**3,imperialGallon=0.00454609;
/** Fixed canonical identifiers only: no aliases, prefix inference or user-defined units. */
const definitions:readonly Unit[]=[
  {id:'m',label:'Metre',dimension:'length',scale:1},
  {id:'km',label:'Kilometre',dimension:'length',scale:1000},
  {id:'cm',label:'Centimetre',dimension:'length',scale:0.01},
  {id:'mm',label:'Millimetre',dimension:'length',scale:0.001},
  {id:'um',label:'Micrometre',dimension:'length',scale:1e-6},
  {id:'nm',label:'Nanometre',dimension:'length',scale:1e-9},
  {id:'in',label:'Inch',dimension:'length',scale:inch},
  {id:'ft',label:'International foot',dimension:'length',scale:foot},
  {id:'yd',label:'Yard',dimension:'length',scale:0.9144},
  {id:'mi',label:'International mile',dimension:'length',scale:1609.344},
  {id:'nmi',label:'Nautical mile',dimension:'length',scale:1852},
  {id:'kg',label:'Kilogram',dimension:'mass',scale:1},
  {id:'g',label:'Gram',dimension:'mass',scale:0.001},
  {id:'mg',label:'Milligram',dimension:'mass',scale:1e-6},
  {id:'ug',label:'Microgram',dimension:'mass',scale:1e-9},
  {id:'t',label:'Metric tonne',dimension:'mass',scale:1000},
  {id:'lb',label:'Avoirdupois pound',dimension:'mass',scale:pound},
  {id:'oz',label:'Avoirdupois ounce',dimension:'mass',scale:pound/16},
  {id:'s',label:'Second',dimension:'duration',scale:1},
  {id:'ms',label:'Millisecond',dimension:'duration',scale:0.001},
  {id:'us',label:'Microsecond',dimension:'duration',scale:1e-6},
  {id:'ns',label:'Nanosecond',dimension:'duration',scale:1e-9},
  {id:'min',label:'Minute',dimension:'duration',scale:60},
  {id:'h',label:'Hour',dimension:'duration',scale:3600},
  {id:'d',label:'Fixed day (86400 seconds)',dimension:'duration',scale:86400},
  {id:'wk',label:'Fixed week (604800 seconds)',dimension:'duration',scale:604800},
  {id:'K',label:'Kelvin (absolute temperature)',dimension:'temperature',scale:1},
  {id:'degC',label:'Degree Celsius (absolute temperature)',dimension:'temperature',scale:1},
  {id:'degF',label:'Degree Fahrenheit (absolute temperature)',dimension:'temperature',scale:5/9},
  {id:'rad',label:'Radian',dimension:'angle',scale:1},
  {id:'deg',label:'Degree (angle)',dimension:'angle',scale:Math.PI/180},
  {id:'turn',label:'Turn',dimension:'angle',scale:2*Math.PI},
  {id:'B',label:'Byte (8 bits)',dimension:'data',scale:8},
  {id:'kB',label:'Kilobyte (decimal)',dimension:'data',scale:8e3},
  {id:'MB',label:'Megabyte (decimal)',dimension:'data',scale:8e6},
  {id:'GB',label:'Gigabyte (decimal)',dimension:'data',scale:8e9},
  {id:'TB',label:'Terabyte (decimal)',dimension:'data',scale:8e12},
  {id:'KiB',label:'Kibibyte (binary)',dimension:'data',scale:8*2**10},
  {id:'MiB',label:'Mebibyte (binary)',dimension:'data',scale:8*2**20},
  {id:'GiB',label:'Gibibyte (binary)',dimension:'data',scale:8*2**30},
  {id:'TiB',label:'Tebibyte (binary)',dimension:'data',scale:8*2**40},
  {id:'bit',label:'Bit',dimension:'data',scale:1},
  {id:'kbit',label:'Kilobit (decimal)',dimension:'data',scale:1e3},
  {id:'Mbit',label:'Megabit (decimal)',dimension:'data',scale:1e6},
  {id:'Gbit',label:'Gigabit (decimal)',dimension:'data',scale:1e9},
  {id:'Tbit',label:'Terabit (decimal)',dimension:'data',scale:1e12},
  {id:'Kibit',label:'Kibibit (binary)',dimension:'data',scale:2**10},
  {id:'Mibit',label:'Mebibit (binary)',dimension:'data',scale:2**20},
  {id:'Gibit',label:'Gibibit (binary)',dimension:'data',scale:2**30},
  {id:'Tibit',label:'Tebibit (binary)',dimension:'data',scale:2**40},
  {id:'m2',label:'Square metre',dimension:'area',scale:1},
  {id:'km2',label:'Square kilometre',dimension:'area',scale:1e6},
  {id:'cm2',label:'Square centimetre',dimension:'area',scale:1e-4},
  {id:'mm2',label:'Square millimetre',dimension:'area',scale:1e-6},
  {id:'in2',label:'Square inch',dimension:'area',scale:inch**2},
  {id:'ft2',label:'Square international foot',dimension:'area',scale:foot**2},
  {id:'yd2',label:'Square yard',dimension:'area',scale:0.9144**2},
  {id:'acre',label:'International acre',dimension:'area',scale:43560*foot**2},
  {id:'ha',label:'Hectare',dimension:'area',scale:10000},
  {id:'m3',label:'Cubic metre',dimension:'volume',scale:1},
  {id:'L',label:'Litre',dimension:'volume',scale:0.001},
  {id:'mL',label:'Millilitre',dimension:'volume',scale:1e-6},
  {id:'uL',label:'Microlitre',dimension:'volume',scale:1e-9},
  {id:'in3',label:'Cubic inch',dimension:'volume',scale:inch**3},
  {id:'ft3',label:'Cubic international foot',dimension:'volume',scale:foot**3},
  {id:'US_gal',label:'US liquid gallon',dimension:'volume',scale:usGallon},
  {id:'US_qt',label:'US liquid quart',dimension:'volume',scale:usGallon/4},
  {id:'US_pt',label:'US liquid pint',dimension:'volume',scale:usGallon/8},
  {id:'US_fl_oz',label:'US fluid ounce',dimension:'volume',scale:usGallon/128},
  {id:'imp_gal',label:'Imperial gallon',dimension:'volume',scale:imperialGallon},
  {id:'imp_fl_oz',label:'Imperial fluid ounce',dimension:'volume',scale:imperialGallon/160},
  {id:'m/s',label:'Metres per second',dimension:'speed',scale:1},
  {id:'km/h',label:'Kilometres per hour',dimension:'speed',scale:1000/3600},
  {id:'mph',label:'Miles per hour',dimension:'speed',scale:1609.344/3600},
  {id:'kn',label:'Knot',dimension:'speed',scale:1852/3600},
  {id:'J',label:'Joule',dimension:'energy',scale:1},
  {id:'kJ',label:'Kilojoule',dimension:'energy',scale:1000},
  {id:'Wh',label:'Watt-hour',dimension:'energy',scale:3600},
  {id:'kWh',label:'Kilowatt-hour',dimension:'energy',scale:3.6e6},
  {id:'cal_th',label:'Thermochemical calorie',dimension:'energy',scale:4.184},
  {id:'kcal_th',label:'Thermochemical kilocalorie',dimension:'energy',scale:4184},
  {id:'W',label:'Watt',dimension:'power',scale:1},
  {id:'kW',label:'Kilowatt',dimension:'power',scale:1000},
  {id:'MW',label:'Megawatt',dimension:'power',scale:1e6},
  {id:'hp_mech',label:'Mechanical horsepower',dimension:'power',scale:550*foot*pound*gravity},
  {id:'Pa',label:'Pascal',dimension:'pressure',scale:1},
  {id:'kPa',label:'Kilopascal',dimension:'pressure',scale:1000},
  {id:'MPa',label:'Megapascal',dimension:'pressure',scale:1e6},
  {id:'bar',label:'Bar',dimension:'pressure',scale:1e5},
  {id:'mbar',label:'Millibar',dimension:'pressure',scale:100},
  {id:'atm',label:'Standard atmosphere',dimension:'pressure',scale:101325},
  {id:'psi',label:'Pound-force per square inch',dimension:'pressure',scale:pound*gravity/inch**2},
];
const units=new Map<string,Readonly<Unit>>(definitions.map(unit=>[unit.id,Object.freeze(unit)]));
const catalogue=Object.freeze(definitions.map(({id,label,dimension})=>Object.freeze({id,label,dimension})));
/** Frozen display metadata; callers cannot mutate the private conversion Map. */
export function getUnitCatalogue():readonly {id:CalculatorUnit;label:string;dimension:string}[] {return catalogue;}

function minimum(unit:CalculatorUnit):number {return unit==='degC'?-273.15:unit==='degF'?-459.67:0;}
function temperature(value:number,source:CalculatorUnit,target:CalculatorUnit):number {
  if(source===target)return value;
  if(value===minimum(source))return minimum(target);
  switch(source) {
    case 'degC':return target==='K'?value+273.15:value*1.8+32;
    case 'degF':return target==='K'?(value+459.67)/1.8:(value-32)/1.8;
    default:return target==='degC'?value-273.15:(value-273.15)*1.8+32;
  }
}
/** All identifiers are resolved through a private own-key Map. No unit text is
 * interpreted as code, a property name, a prefix, or dimensional algebra. */
export function convertUnitValue(value:number,sourceId:string,targetId:string):Conversion {
  const source=units.get(sourceId),target=units.get(targetId);
  if(!source||!target)return {ok:false,code:'unsupported-unit'};
  if(source.dimension!==target.dimension)return {ok:false,code:'incompatible-units'};
  if(!Number.isFinite(value))return {ok:false,code:'domain-error'};
  let result:number;
  if(source.dimension==='temperature') {
    // Validate the user's source scale before affine arithmetic. Exact boundary
    // pairs and a lower clamp avoid false below-zero values from binary64 error.
    if(value<minimum(source.id))return {ok:false,code:'domain-error'};
    result=Math.max(minimum(target.id),temperature(value,source.id,target.id));
  }else result=value*(source.scale/target.scale);
  if(!Number.isFinite(result))return {ok:false,code:'domain-error'};
  return {ok:true,value:Object.is(result,-0)?0:result,unit:target.id};
}
