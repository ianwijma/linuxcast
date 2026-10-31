import { expect,it } from 'vitest';
import { LAUNCHER_BUILTIN_COMMAND_IDS } from '../../../../../../packages/contracts/src/launcher.ts';
import { collectCatalogue } from '../catalogue.ts';
it('retains the saved-permissions command when all supported source ceilings are populated',async()=>{
  const ids=[
    ...LAUNCHER_BUILTIN_COMMAND_IDS,
    ...Array.from({length:5000},(_,i)=>'application:'+i.toString(16).padStart(64,'0')),
    ...Array.from({length:500},(_,i)=>'quicklink:00000000-0000-4000-8000-'+String(i).padStart(12,'0')),
    ...Array.from({length:100},(_,i)=>'workflow:'+i.toString(16).padStart(64,'0')),
  ];
  const commands=ids.map((id,index)=>({id,title:'Public command '+index,aliases:[],keywords:[],enabled:true,usage:null,...(id.startsWith('quicklink:')?{quicklink:{id:id.slice(10),revision:1}}:{})}));
  const catalogue=await collectCatalogue(async cursor=>{
    const offset=cursor?Number(cursor.split(':')[1]):0,rows=commands.slice(offset,offset+100),next=offset+rows.length;
    return {ok:true,value:{revision:1,rankingAvailable:true,commands:rows,nextCursor:next<commands.length?'1:'+next:null}};
  });
  expect(catalogue.commands.map(row=>row.id)).toEqual(ids);
  expect(catalogue.commands).toHaveLength(5614);
});
