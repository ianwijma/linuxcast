import { expect,it } from 'vitest';
import { formatCalculationText } from '../src/result.ts';
it('formats only finite numeric output and a closed unit, preserving arithmetic text',()=>{
  expect(formatCalculationText({ok:true,value:14,text:'14'})).toBe('14');
  expect(formatCalculationText({ok:true,value:1000,text:'1000',unit:'m'})).toBe('1000 m');
  expect(formatCalculationText({ok:true,value:1.5,text:'1.5',unit:'MiB'})).toBe('1.5 MiB');
  for(const value of [{ok:true,value:Infinity,text:'1'},{ok:true,value:1,text:'arbitrary'},{ok:true,value:1,text:'1',unit:'arbitrary'},{ok:true,value:1,text:'1',unit:null}])expect(()=>formatCalculationText(value as never)).toThrow('Invalid calculator output.');
});
