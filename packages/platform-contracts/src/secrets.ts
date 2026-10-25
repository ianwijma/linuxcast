import * as z from 'zod';
/** Main-owned metadata only. Secret values and encrypted blobs are not repository data. */
export const secretReferenceSchema = z.strictObject({
  id: z.uuid(), ownerKind: z.enum(['provider', 'account', 'browser-pairing', 'backup']),
  ownerId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).refine(record => Date.parse(record.updatedAt) >= Date.parse(record.createdAt));
export type SecretReferenceRecord = z.infer<typeof secretReferenceSchema>;
export const secretReferenceContracts = new Map<string, {params:z.ZodType;result:z.ZodType}>([
  ['secretRefs.get', {params:z.strictObject({id:z.uuid()}), result:secretReferenceSchema.nullable()}],
  ['secretRefs.put', {params:z.strictObject({record:secretReferenceSchema}), result:secretReferenceSchema}],
  ['secretRefs.delete', {params:z.strictObject({id:z.uuid()}), result:z.boolean()}],
  ['secretRefs.list', {params:z.strictObject({afterId:z.uuid().optional(),limit:z.number().int().min(1).max(200)}),
    result:z.strictObject({records:z.array(secretReferenceSchema).max(200),nextCursor:z.uuid().nullable()})}],
]);
