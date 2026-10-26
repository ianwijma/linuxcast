import { expect,it } from 'vitest';
import { applicationActionsSchema,nativeApplicationRequestSchema,nativeApplicationActionReplySchema,launcherApplicationActionRequestSchema,launcherApplicationActionReplySchema,launcherCommandMetadataSchema } from '../src/index.ts';
it('bounds original declared action metadata and refuses partial unavailable/duplicate/unsafe lists',()=>{
  const action={id:'NewWindow',title:'New window'};
  expect(applicationActionsSchema.parse({available:true,actions:[action]})).toEqual({available:true,actions:[action]});
  for(const actions of [{available:false,actions:[action]},{available:true,actions:[action,action]},{available:true,actions:Array.from({length:17},(_,i)=>({id:`Action${i}`,title:'Public action'}))},{available:true,actions:[{...action,id:'../private'}]},{available:true,actions:[{...action,title:'private\ntext'}]},{available:true,actions:[{...action,title:'😀'.repeat(33)}]}])expect(applicationActionsSchema.safeParse(actions).success).toBe(false);
  const base={id:'linuxcast:hide',title:'Hide Linuxcast',aliases:[],keywords:[],enabled:true,usage:null,applicationActions:{available:true,actions:[action]}};
  expect(launcherCommandMetadataSchema.safeParse(base).success).toBe(false);expect(launcherCommandMetadataSchema.safeParse({...base,id:`application:${'a'.repeat(64)}`}).success).toBe(true);
});
it('keeps action identity requests strict and receipts truthful requests rather than completed target operations',()=>{
  const native={protocolVersion:1,operation:'launch-action',desktopId:'public.desktop',fingerprint:'a'.repeat(64),actionId:'NewWindow'},launcher={protocolVersion:1,revision:1,commandId:`application:${'b'.repeat(64)}`,actionId:'NewWindow'};
  expect(nativeApplicationRequestSchema.safeParse(native).success).toBe(true);expect(launcherApplicationActionRequestSchema.safeParse(launcher).success).toBe(true);
  for(const value of [{...native,argv:[]},{...native,actionId:'x'.repeat(65)},{...native,fingerprint:'wrong'}])expect(nativeApplicationRequestSchema.safeParse(value).success).toBe(false);
  for(const value of [{...launcher,commandId:'linuxcast:quit'},{...launcher,revision:0},{...launcher,path:'/private'},{...launcher,actionId:'action;sh'}])expect(launcherApplicationActionRequestSchema.safeParse(value).success).toBe(false);
  expect(nativeApplicationActionReplySchema.safeParse({protocolVersion:1,ok:true,value:{outcome:'requested',actionId:'NewWindow'}}).success).toBe(true);
  for(const outcome of ['completed','dispatched'])expect(launcherApplicationActionReplySchema.safeParse({ok:true,value:{outcome,actionId:'NewWindow'}}).success).toBe(false);
});
