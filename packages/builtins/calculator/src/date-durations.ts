/** Bounded ISO atoms only; calendar and elapsed fields stay deliberately separate. */
const integer='(0|[1-9][0-9]{0,5})';
const duration=new RegExp(`^P(?:${integer}Y)?(?:${integer}M)?(?:${integer}W)?(?:${integer}D)?(?:T(?:${integer}H)?(?:${integer}M)?(?:${integer}(?:\\.([0-9]{1,9}))?S)?)?$`,'u');
export function parseDateDuration(input:string,direction:1|-1){
  const match=duration.exec(input);
  if(!match||match.slice(1).every(value=>value===undefined)||(input.includes('T')&&match.slice(5,8).every(value=>value===undefined)))return null;
  const value=(index:number)=>Number(match[index]??0)*direction,fraction=(match[8]??'').padEnd(9,'0');
  return {calendar:{years:value(1),months:value(2),weeks:value(3),days:value(4)},elapsed:{hours:value(5),minutes:value(6),seconds:value(7),milliseconds:Number(fraction.slice(0,3))*direction,microseconds:Number(fraction.slice(3,6))*direction,nanoseconds:Number(fraction.slice(6,9))*direction}};
}
