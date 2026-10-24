import * as z from 'zod';
import { uiTextSchema as text } from './scalars.ts';
import { ContractError, parseContract } from './protocol.ts';
const id = text.min(1);
/** Presentation fields never authorize file access. The broker resolves both
 * opaque IDs against the authenticated principal and rechecks the target.
 */
export const fileReferenceSchema = z.strictObject({ kind: z.literal('file'), grantId: id, entryId: id,
  displayName: text, displayPath: text.optional() });
export const applicationReferenceSchema = z.strictObject({ kind: z.literal('application'), id, displayName: text });
const externalSchemes = new Set(['https:', 'http:', 'mailto:', 'tel:']);
/** URL text is inert data. Opening requires a declared scheme, fresh user intent
 * and broker policy. File URLs use FileRef and a dedicated file broker instead.
 */
export const urlReferenceSchema = z.strictObject({ kind: z.literal('url'), url: text.min(1).refine(value => {
  if (/\s/u.test(value) || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return false;
  try {
    const url = new URL(value);
    return externalSchemes.has(url.protocol) && !url.username && !url.password &&
      (['http:', 'https:'].includes(url.protocol) ? /^https?:\/\//iu.test(value) && Boolean(url.hostname) : Boolean(url.pathname));
  } catch { return false; }
}), displayName: text.optional() });
/** Both IDs are opaque broker handles, not an address, email, lookup query or
 * grant. The contact service resolves the source and record for this principal.
 */
export const contactReferenceSchema = z.strictObject({ kind: z.literal('contact'), sourceId: id, contactId: id, displayName: text });
export const resourceReferenceSchema = z.discriminatedUnion('kind', [fileReferenceSchema, applicationReferenceSchema, urlReferenceSchema, contactReferenceSchema]);
export function parseUrlReference(value: unknown, declaredSchemes: ReadonlySet<string>) {
  const reference = parseContract(urlReferenceSchema, value);
  if (!declaredSchemes.has(new URL(reference.url).protocol)) throw new ContractError('Undeclared URL scheme.');
  return reference;
}
export type FileReference = z.infer<typeof fileReferenceSchema>;
export type UrlReference = z.infer<typeof urlReferenceSchema>;
export type ContactReference = z.infer<typeof contactReferenceSchema>;
