import * as z from 'zod';
import { uiTextSchema as text } from './scalars.ts';
const id = text.min(1);
/** Presentation fields never authorize file access. The broker resolves both
 * opaque IDs against the authenticated principal and rechecks the target.
 */
export const fileReferenceSchema = z.strictObject({ kind: z.literal('file'), grantId: id, entryId: id,
  displayName: text, displayPath: text.optional() });
export const applicationReferenceSchema = z.strictObject({ kind: z.literal('application'), id, displayName: text });
export type FileReference = z.infer<typeof fileReferenceSchema>;
