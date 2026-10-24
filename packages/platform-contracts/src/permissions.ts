import * as z from 'zod';
import { effectPrincipalSchema } from '../../contracts/src/index.ts';
export const permissionIds = ['files.read','files.write','network.fetch','network.local','clipboard.read','clipboard.history',
  'clipboard.write','input.paste','input.shortcut','applications.launch','windows.control','ai.generate',
  'notifications.show','background.run','scripts.execute'] as const;
export const permissionIdSchema = z.enum(permissionIds);
const handle = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u);
export const permissionScopeSchema = z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('resource'),resourceId:handle}),
  z.strictObject({kind:z.literal('origin'),origin:z.string().max(2048).refine(value=>{
    try {const url=new URL(value); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password && url.origin===value;} catch{return false;}
  })}),
  z.strictObject({kind:z.literal('application'),applicationId:handle}),
  z.strictObject({kind:z.literal('global')}),
]);
const scopeKinds: Record<z.infer<typeof permissionIdSchema>, z.infer<typeof permissionScopeSchema>['kind']> = {
  'files.read':'resource','files.write':'resource','network.fetch':'origin','network.local':'origin',
  'clipboard.read':'global','clipboard.history':'resource','clipboard.write':'global','input.paste':'application',
  'input.shortcut':'application','applications.launch':'application','windows.control':'application',
  'ai.generate':'global','notifications.show':'global','background.run':'global','scripts.execute':'resource',
};
const requirementShape = {permissionId:permissionIdSchema,scope:permissionScopeSchema};
const compatible = (value:{permissionId:z.infer<typeof permissionIdSchema>;scope:z.infer<typeof permissionScopeSchema>}) => scopeKinds[value.permissionId]===value.scope.kind;
export const permissionRequirementSchema = z.strictObject(requirementShape).refine(compatible);
export const permissionDecisionRecordSchema = z.strictObject({
  schemaVersion:z.literal(1),id:z.uuid(),principal:effectPrincipalSchema,declarationHash:z.string().regex(/^[a-f0-9]{64}$/u),
  ...requirementShape,decision:z.enum(['allow','deny']),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime(),
}).refine(compatible).refine(value=>Date.parse(value.updatedAt)>=Date.parse(value.createdAt));
export const permissionRepositoryContracts = new Map<string,{params:z.ZodType;result:z.ZodType}>([
  ['permissions.list',{params:z.strictObject({principalKey:z.string().regex(/^[a-f0-9]{64}$/u),afterId:z.uuid().optional(),limit:z.number().int().min(1).max(200)}),result:z.strictObject({records:z.array(permissionDecisionRecordSchema).max(200),nextCursor:z.uuid().nullable()})}],
  ['permissions.put',{params:z.strictObject({record:permissionDecisionRecordSchema}),result:permissionDecisionRecordSchema}],
  ['permissions.revoke',{params:z.strictObject({id:z.uuid()}),result:z.boolean()}],
]);
export type PermissionId = z.infer<typeof permissionIdSchema>;
export type PermissionScope = z.infer<typeof permissionScopeSchema>;
export type Requirement = z.infer<typeof permissionRequirementSchema>;
export type DecisionRecord = z.infer<typeof permissionDecisionRecordSchema>;
export type Principal = DecisionRecord['principal'];
/** Stable wire key material; callers hash this exact UTF-8 string with SHA-256. */
export function principalKeyMaterial(principal:Principal):string {
  return JSON.stringify(principal.kind==='builtin' ? {kind:principal.kind,id:principal.id} :
    {kind:principal.kind,id:principal.id,version:principal.version,integrity:principal.integrity});
}
export function scopeKeyMaterial(scope:PermissionScope):string {
  switch(scope.kind) {
    case 'resource': return JSON.stringify({kind:scope.kind,resourceId:scope.resourceId});
    case 'origin': return JSON.stringify({kind:scope.kind,origin:scope.origin});
    case 'application': return JSON.stringify({kind:scope.kind,applicationId:scope.applicationId});
    case 'global': return JSON.stringify({kind:scope.kind});
  }
}
