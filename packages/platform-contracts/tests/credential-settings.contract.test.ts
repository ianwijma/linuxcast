import { expect,it } from 'vitest';
import { credentialSettingsSaveSchema,credentialSettingsStateSchema,credentialSettingsActionReplySchema } from '../src/credential-settings.ts';
const active={revision:0,appearance:'dark',provider:'openrouter',session:'observed-unlocked',storage:'available',sessionOnlyAvailable:true,stored:'none',clearSessionOnLock:false,busy:false};
it('accepts bounded well-formed credential entry but never accepts extra identity/endpoint fields',()=>{
  const input={protocolVersion:1,expectedRevision:0,persistence:'session-only',value:'synthetic-user-input'};
  expect(credentialSettingsSaveSchema.safeParse(input).success).toBe(true);
  for(const value of ['', 'x'.repeat(65537),'😀'.repeat(16385),'\ud800'])expect(credentialSettingsSaveSchema.safeParse({...input,value}).success).toBe(false);
  for(const extra of [{ownerId:'foreign'},{endpoint:'https://example.invalid'},{secretRef:'private-ref'}])expect(credentialSettingsSaveSchema.safeParse({...input,...extra}).success).toBe(false);
});
it('rejects snapshots containing secrets or contradictory eligibility and bounds revisions',()=>{
  expect(credentialSettingsStateSchema.safeParse(active).success).toBe(true);
  for(const patch of [{value:'SYNTHETIC_PRIVATE_CANARY'},{secretRef:'private-ref'},{session:'locked'},{revision:Number.MAX_SAFE_INTEGER+1}])expect(credentialSettingsStateSchema.safeParse({...active,...patch}).success).toBe(false);
  expect(credentialSettingsStateSchema.safeParse({...active,session:'locked',storage:'unavailable',sessionOnlyAvailable:false,stored:'secure-persistent'}).success).toBe(true);
});
it('permits only fixed action outcomes and fixed error codes, never raw errors or provider-ready claims',()=>{
  expect(credentialSettingsActionReplySchema.safeParse({ok:true,value:{outcome:'saved'}}).success).toBe(true);
  for(const value of [{ok:true,value:{outcome:'ready'}},{ok:false,error:{code:'unavailable',message:'SYNTHETIC_PRIVATE_ERROR'}},{ok:true,value:{outcome:'saved',value:'SYNTHETIC_PRIVATE_CANARY'}}])expect(credentialSettingsActionReplySchema.safeParse(value).success).toBe(false);
});
