import {describe,expect,it} from 'vitest';
import {calculatorResultTextSchema,calculatorUnitSchema} from '@linuxcast/contracts';
import {evaluateExpression} from '../src/evaluate.ts';
import {getUnitCatalogue} from '../src/units.ts';
import {formatCalculationText} from '../src/result.ts';

function success(expression:string) {
  const result=evaluateExpression(expression);expect(result.ok,JSON.stringify(result)).toBe(true);
  if(!result.ok||result.kind==='colour'||result.kind==='date-time')throw new Error('Expected a successful synthetic conversion.');
  expect(Number.isFinite(result.value)).toBe(true);expect(calculatorResultTextSchema.safeParse(result.text).success).toBe(true);
  expect(calculatorUnitSchema.safeParse(result.unit).success).toBe(true);return result;
}
function approximate(expression:string,expected:number) {
  const result=success(expression);
  expect(Math.abs(result.value-expected)).toBeLessThanOrEqual(Math.max(Math.abs(expected)*1e-14,Number.MIN_VALUE));
  return result;
}
function failure(expression:string,code:'invalid-expression'|'limit-exceeded'|'domain-error'|'unsupported-unit'|'incompatible-units') {
  expect(evaluateExpression(expression)).toMatchObject({ok:false,code});
}
// Independent published-definition expectations, not values read from the
// evaluator catalogue. Every canonical unit has an anchored base conversion.
const definitions:[string,string,number][]=[
  ['m','m',1],['km','m',1000],['cm','m',0.01],['mm','m',0.001],['um','m',0.000001],['nm','m',0.000000001],
  ['in','m',0.0254],['ft','m',0.3048],['yd','m',0.9144],['mi','m',1609.344],['nmi','m',1852],
  ['kg','kg',1],['g','kg',0.001],['mg','kg',0.000001],['ug','kg',0.000000001],['t','kg',1000],
  ['lb','kg',0.45359237],['oz','kg',0.028349523125],
  ['s','s',1],['ms','s',0.001],['us','s',0.000001],['ns','s',0.000000001],['min','s',60],['h','s',3600],['d','s',86400],['wk','s',604800],
  ['K','K',1],['degC','K',274.15],['degF','K',255.92777777777778],
  ['rad','rad',1],['deg','rad',0.017453292519943295],['turn','rad',6.283185307179586],
  ['B','bit',8],['kB','bit',8000],['MB','bit',8000000],['GB','bit',8000000000],['TB','bit',8000000000000],
  ['KiB','bit',8192],['MiB','bit',8388608],['GiB','bit',8589934592],['TiB','bit',8796093022208],
  ['bit','bit',1],['kbit','bit',1000],['Mbit','bit',1000000],['Gbit','bit',1000000000],['Tbit','bit',1000000000000],
  ['Kibit','bit',1024],['Mibit','bit',1048576],['Gibit','bit',1073741824],['Tibit','bit',1099511627776],
  ['m2','m2',1],['km2','m2',1000000],['cm2','m2',0.0001],['mm2','m2',0.000001],
  ['in2','m2',0.00064516],['ft2','m2',0.09290304],['yd2','m2',0.83612736],['acre','m2',4046.8564224],['ha','m2',10000],
  ['m3','m3',1],['L','m3',0.001],['mL','m3',0.000001],['uL','m3',0.000000001],
  ['in3','m3',0.000016387064],['ft3','m3',0.028316846592],['US_gal','m3',0.003785411784],
  ['US_qt','m3',0.000946352946],['US_pt','m3',0.000473176473],['US_fl_oz','m3',0.0000295735295625],
  ['imp_gal','m3',0.00454609],['imp_fl_oz','m3',0.0000284130625],
  ['m/s','m/s',1],['km/h','m/s',0.2777777777777778],['mph','m/s',0.44704],['kn','m/s',0.5144444444444445],
  ['J','J',1],['kJ','J',1000],['Wh','J',3600],['kWh','J',3600000],['cal_th','J',4.184],['kcal_th','J',4184],
  ['W','W',1],['kW','W',1000],['MW','W',1000000],['hp_mech','W',745.6998715822702],
  ['Pa','Pa',1],['kPa','Pa',1000],['MPa','Pa',1000000],['bar','Pa',100000],['mbar','Pa',100],['atm','Pa',101325],['psi','Pa',6894.757293168361],
];

describe('L2-04 fixed explicit scalar unit conversions',()=>{
  it.each(definitions)('converts 1 %s to %s using a fixed independent definition',(source,target,expected)=>{
    const result=approximate(`1 ${source} to ${target}`,expected);expect(result.unit).toBe(target);
    expect(formatCalculationText(result)).toBe(`${result.text} ${target}`);
  });

  it('provides exactly the canonical catalogue across twelve dimensions, deeply frozen',()=>{
    const catalogue=getUnitCatalogue();expect(catalogue).toHaveLength(92);
    expect(catalogue.map(unit=>unit.id).sort()).toEqual([...calculatorUnitSchema.options].sort());
    expect(definitions.map(([id])=>id).sort()).toEqual([...calculatorUnitSchema.options].sort());
    expect(new Set(catalogue.map(unit=>unit.dimension))).toEqual(new Set(['length','mass','duration','temperature','angle','data','area','volume','speed','energy','power','pressure']));
    expect(Object.isFrozen(catalogue)).toBe(true);
    for(const item of catalogue) {expect(Object.isFrozen(item)).toBe(true);expect(item.label.length).toBeGreaterThan(0);expect(Object.keys(item).sort()).toEqual(['dimension','id','label']);}
    expect(()=>{(catalogue as unknown as {id:string}[])[0]!.id='forged';}).toThrow(TypeError);
    expect(()=>{(catalogue as unknown[]).push({id:'forged'});}).toThrow(TypeError);
    expect(success('1 m to cm')).toMatchObject({value:100,text:'100',unit:'cm'});
  });

  it.each([
    ['(2+3)*4 km to m',20000],['sqrt(81) ft to in',108],['100+20% m to cm',10020],['min(3,2) h to min',120],
    ['pi rad to deg',180],['2^3^2 B to bit',4096],['  1    m   to    cm   ',100],['2^-2 km to m',250],['-2 kg to g',-2000],
    ['1 mi to ft',5280],['1 nmi to m',1852],['1 lb to oz',16],['1 acre to ft2',43560],['1 ha to km2',0.01],
    ['1 US_gal to US_fl_oz',128],['1 imp_gal to imp_fl_oz',160],['1 US_gal to in3',231],['1 imp_gal to L',4.54609],
    ['1 US_qt to US_pt',2],['1 L to mL',1000],['1 cal_th to J',4.184],['1 kcal_th to kJ',4.184],['1 kWh to Wh',1000],
    ['1 kW to W',1000],['1 atm to bar',1.01325],['1 bar to mbar',1000],['1 d to h',24],['1 wk to d',7],['-1 d to s',-86400],
    ['1 turn to deg',360],['1 mph to km/h',1.609344],['1 kn to km/h',1.852],
  ])('keeps scalar arithmetic and same-dimension meaning: %s',(expression,expected)=>{approximate(expression,expected);});

  it.each([
    ['1 B to bit',8],['8 bit to B',1],['1 kB to B',1000],['1 KiB to B',1024],['1 MB to kB',1000],
    ['1 MiB to KiB',1024],['1 MB to MiB',0.95367431640625],['1 MiB to MB',1.048576],['1 kbit to bit',1000],
    ['1 Kibit to bit',1024],['1 KiB to kbit',8.192],['1 GiB to Gibit',8],['1 TiB to Tibit',8],
  ])('distinguishes bits, bytes, decimal and binary prefixes: %s',(expression,expected)=>{approximate(expression,expected);});

  it.each([
    ['32 degF to degC',0,'0'],['0 degC to degF',32,'32'],['273.15 K to degC',0,'0'],['273.15 K to degF',32,'32'],
    ['-273.15 degC to K',0,'0'],['-459.67 degF to K',0,'0'],['0 K to degC',-273.15,'-273.15'],['0 K to degF',-459.67,'-459.67'],
    ['-273.15 degC to degF',-459.67,'-459.67'],['-459.67 degF to degC',-273.15,'-273.15'],['212 degF to degC',100,'100'],
    ['100 degC to degF',212,'212'],['-40 degC to degF',-40,'-40'],['-40 degF to degC',-40,'-40'],
    ['32 degF to K',273.15,'273.15'],['0 degC to K',273.15,'273.15'],
  ])('handles absolute temperatures accurately: %s',(expression,expected,text)=>{
    const result=approximate(expression,expected);expect(result.text).toBe(text);expect(Object.is(result.value,-0)).toBe(false);
  });

  it.each(['-0.000000000000001 K to K','-273.15000000000003 degC to K','-459.6700000000001 degF to K','-1 K to degC','-500 degF to degF','-274 degC to degF'])('rejects a source below absolute zero: %s',expression=>{failure(expression,'domain-error');});

  it('keeps valid values at or just above absolute zero in the physical range',()=>{
    for(const input of ['-273.1499999999999 degC to K','-459.6699999999999 degF to K','5e-324 K to degC','5e-324 K to degF','5e-324 K to K']) {
      const result=success(input),minimum=result.unit==='K'?0:result.unit==='degC'?-273.15:-459.67;expect(result.value).toBeGreaterThanOrEqual(minimum);
    }
  });

  it.each(['C','F','gallon','gal','KB','month','year','kgf','hp','cal','kcal','l','b','kb','mb','M','KM','c','f','kelvin','celsius','nm/h','m2/s2','__proto__','constructor','toString','hasOwnProperty'])('rejects unknown, ambiguous, case-mismatched or prototype names: %s',unit=>{
    failure(`1 ${unit} to m`,'unsupported-unit');failure(`1 m to ${unit}`,'unsupported-unit');
  });

  it.each(['1 m to kg','1 m2 to m','1 m3 to m2','1 h to deg','1 B to J','1 W to Wh','1 Pa to W','1 degC to s','1 m/s to m'])('rejects incompatible dimensions: %s',expression=>{failure(expression,'incompatible-units');});

  it.each(['m to cm','1m to cm','1 m to cm to mm','(1 m to cm)','1 m to (cm)','1 m + 2 m to cm','1 kg*m to kg',
    '1 m/s^2 to m/s','1 m / s to km/h','1 m to cm + 2','1 m to cm;process.exit()','1\tm to cm','1 m TO cm','1 m to cm\n'])('rejects implicit, compound, nested or malformed conversions: %s',expression=>{failure(expression,'invalid-expression');});

  it('computes scale ratios before multiplication and preserves finite extremes and signed zero',()=>{
    expect(success('1e308 km to km')).toMatchObject({value:1e308,text:'1e+308',unit:'km'});
    expect(success('1e308 km to mi').value).toBeGreaterThan(6e307);
    expect(success('1e308 TiB to TiB').value).toBe(1e308);
    expect(success('1e308 degF to degF').value).toBe(1e308);
    expect(success('1e308 degF to K').value).toBeGreaterThan(5e307);
    expect(success('1.7976931348623157e308 km to km').text).toBe('1.79769313486231e+308');
    failure('1e308 km to m','domain-error');failure('1e308 K to degF','domain-error');failure('1/0 m to cm','domain-error');
    expect(success('1e-320 nm to km')).toMatchObject({value:0,text:'0',unit:'km'});
    const zero=success('-0 kg to g');expect(zero).toMatchObject({value:0,text:'0',unit:'g'});expect(Object.is(zero.value,-0)).toBe(false);
  });

  it('keeps the whole expression byte bound and the existing scalar resource budgets',()=>{
    expect(success('1'+' '.repeat(504)+'m to cm').value).toBe(100);failure('1'+' '.repeat(505)+'m to cm','limit-exceeded');
    failure('1'+' '.repeat(503)+'µm to cm','limit-exceeded');failure('1 µm to cm','invalid-expression');
    expect(success('1'+'%'.repeat(255)+' m to cm').value).toBe(0);failure('1'+'%'.repeat(256)+' m to cm','limit-exceeded');
    expect(success('('.repeat(32)+'1'+')'.repeat(32)+' m to cm').value).toBe(100);failure('('.repeat(33)+'1'+')'.repeat(33)+' m to cm','limit-exceeded');
    expect(success('-'.repeat(32)+'1 m to cm').value).toBe(100);failure('-'.repeat(33)+'1 m to cm','limit-exceeded');
  });

  it('preserves the arithmetic-only shape and uses fixed unit errors without raw input',()=>{
    expect(evaluateExpression('2+3')).toEqual({ok:true,value:5,text:'5'});
    expect(evaluateExpression('1 syntheticUnknown to m')).toEqual({ok:false,code:'unsupported-unit',message:'Use a supported, unambiguous unit identifier.'});
    expect(evaluateExpression('1 m to kg')).toEqual({ok:false,code:'incompatible-units',message:'Choose units with the same dimension.'});
  });
});
