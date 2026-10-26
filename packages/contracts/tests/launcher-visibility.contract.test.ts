import {expect,it} from 'vitest';
import {launcherVisibilityRequestSchema,launcherCommandMetadataSchema,launcherCommandsReplySchema,isLauncherVisibilityProtected} from '../src/launcher.ts';
const command={id:'linuxcast:calculator',title:'Calculator',aliases:['calc'],keywords:[],enabled:true,usage:null};
it('accepts only registered typed visibility requests and protects recovery commands',()=>{
  for(const hidden of [true,false])expect(launcherVisibilityRequestSchema.safeParse({protocolVersion:1,revision:1,commandId:command.id,hidden}).success).toBe(true);
  for(const commandId of ['linuxcast:hide','linuxcast:quit']){expect(isLauncherVisibilityProtected(commandId)).toBe(true);expect(launcherVisibilityRequestSchema.safeParse({protocolVersion:1,revision:1,commandId,hidden:true}).success).toBe(false);}
  for(const extra of [{query:'private'},{path:'/private'},{method:'execute'},{hidden:'true'},{revision:0},{commandId:'arbitrary:exec'}])expect(launcherVisibilityRequestSchema.safeParse({protocolVersion:1,revision:1,commandId:command.id,hidden:true,...extra}).success).toBe(false);
});
it('preserves old metadata and separately exposes acknowledged hidden state and storage availability',()=>{
  expect(launcherCommandMetadataSchema.parse(command)).toEqual(command);
  expect(launcherCommandsReplySchema.safeParse({ok:true,value:{revision:2,commands:[{...command,hidden:true}],rankingAvailable:true,visibilityAvailable:true,nextCursor:null}}).success).toBe(true);
  expect(launcherCommandMetadataSchema.safeParse({...command,id:'linuxcast:quit',hidden:true}).success).toBe(false);
  for(const extra of [{hidden:'true'},{visibility:'private'},{enabled:false}])expect(launcherCommandMetadataSchema.safeParse({...command,...extra}).success).toBe(false);
});
