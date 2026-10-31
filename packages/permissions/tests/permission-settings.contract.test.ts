import { expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { permissionSettingsListSchema,permissionSettingsRevokeSchema,permissionSettingsStateSchema } from '../../platform-contracts/src/permission-settings.ts';
it('accepts only exact versioned named reads and opaque snapshot-bound removal selections',()=>{
  expect(permissionSettingsListSchema.safeParse({protocolVersion:1}).success).toBe(true);
  expect(permissionSettingsRevokeSchema.safeParse({protocolVersion:1,snapshotId:randomUUID(),selectionId:randomUUID()}).success).toBe(true);
  for(const input of [{protocolVersion:2},{protocolVersion:1,principal:{kind:'builtin',id:'forged'}},{protocolVersion:1,afterId:'not-a-uuid'}])
    expect(permissionSettingsListSchema.safeParse(input).success).toBe(false);
  expect(permissionSettingsRevokeSchema.safeParse({protocolVersion:1,id:randomUUID()}).success).toBe(false);
});
it('refuses duplicate selection authority and unbounded UI pages',()=>{
  const row={selectionId:randomUUID(),sourceKind:'builtin',sourceLabel:'Public source',version:null,permissionId:'clipboard.write',scopeLabel:'Current clipboard',decision:'allow',updatedAt:'2026-01-01T00:00:00.000Z'};
  const state={snapshotId:randomUUID(),appearance:'light',records:[row],nextCursor:null};
  expect(permissionSettingsStateSchema.safeParse(state).success).toBe(true);
  expect(permissionSettingsStateSchema.safeParse({...state,records:[row,row]}).success).toBe(false);
  expect(permissionSettingsStateSchema.safeParse({...state,records:Array.from({length:51},()=>({...row,selectionId:randomUUID()}))}).success).toBe(false);
});
