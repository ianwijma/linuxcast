import * as z from 'zod';
import type { RepositoryContracts } from '../../contracts/src/index.ts';

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const relative = z.string().min(1).max(4096).refine(s => !s.startsWith('/') &&
  !s.includes('\0') && s.split('/').every(p => p !== '' && p !== '.' && p !== '..'));
const absolute = z.string().min(1).max(4096).refine(s => s.startsWith('/') &&
  !s.includes('\0') && (s === '/' || s.slice(1).split('/').every(p => p !== '' && p !== '.' && p !== '..')));
export const rootConfigSchema = z.strictObject({
  id: z.uuid(), path: absolute, includeHidden: z.boolean(),
  excludeGlobs: z.array(z.string().min(1).max(256).refine(s => !['[',']','\\','!','\0'].some(c=>s.includes(c)) && !s.startsWith('/'))).max(64),
  excludedDirectories: z.array(relative).max(128), maxFileBytes: integer.nullable(),
}).refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 8192);
export type RootConfig = z.infer<typeof rootConfigSchema>;
export const entrySchema = z.strictObject({
  path: relative, kind: z.enum(['file', 'directory']), size: integer, modifiedMs: z.number().int().safe(),
  device: z.string().regex(/^\d{1,20}$/u), inode: z.string().regex(/^\d{1,20}$/u),
});
export type IndexEntry = z.infer<typeof entrySchema>;
export const progressSchema = z.strictObject({visited: integer, indexed: integer, excluded: integer,
  denied: integer, vanished: integer, unsupported: integer, watchFailures: integer});
export type ScanProgress = z.infer<typeof progressSchema>;
export const rootStateSchema = z.strictObject({config: rootConfigSchema,
  state: z.enum(['idle', 'scanning', 'ready', 'degraded', 'unavailable']),
  generation: z.uuid().nullable(), progress: progressSchema.nullable()});
export type RootState = z.infer<typeof rootStateSchema>;
export const candidateSchema = entrySchema.extend({rootId: z.uuid(), rootPath: absolute,
  id: z.string().max(4200), generation: z.uuid()});
export type FileCandidate = z.infer<typeof candidateSchema>;
const rootId = z.strictObject({rootId: z.uuid()});
const scan = {rootId: z.uuid(), scanId: z.uuid()};
const ok = z.strictObject({ok: z.literal(true)});
export const fileIndexSchemas = {
  'files.roots.put': {params: z.strictObject({config: rootConfigSchema}), result: rootStateSchema},
  'files.roots.list': {params: z.strictObject({}), result: z.array(rootStateSchema).max(100)},
  'files.roots.remove': {params: rootId, result: ok},
  'files.scan.begin': {params: z.strictObject(scan), result: ok},
  'files.scan.batch': {params: z.strictObject({...scan, entries: z.array(entrySchema).max(256)}), result: ok},
  'files.scan.finish': {params: z.strictObject({...scan, progress: progressSchema}), result: rootStateSchema},
  'files.scan.abort': {params: z.strictObject({...scan, unavailable: z.boolean()}), result: ok},
  'files.scan.prune': {params: rootId, result: z.strictObject({removed: integer.max(512)})},
  'files.search': {params: z.strictObject({query: z.string().max(512), rootId: z.uuid().optional(),
    limit: z.number().int().min(1).max(100)}), result: z.array(candidateSchema).max(100)},
} as const;
export type FileIndexMethod = keyof typeof fileIndexSchemas;
export type FileIndexMethods = {[M in FileIndexMethod]: {
  params: z.infer<(typeof fileIndexSchemas)[M]['params']>;
  result: z.infer<(typeof fileIndexSchemas)[M]['result']>;
}};
export const fileIndexContracts: RepositoryContracts = new Map(Object.entries(fileIndexSchemas));
export const FILE_INDEX_METHODS = Object.keys(fileIndexSchemas) as FileIndexMethod[];
export interface IndexStorage {
  request<M extends FileIndexMethod>(method: M, params: FileIndexMethods[M]['params']): Promise<FileIndexMethods[M]['result']>;
}

export const nativeEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({kind: z.literal('ready'), protocolVersion: z.literal(1), backend: z.literal('linux-openat2-inotify')}),
  z.strictObject({kind: z.literal('configured'), id: z.uuid()}),
  z.strictObject({kind: z.literal('batch'), id: z.uuid(), entries: z.array(entrySchema).max(256), progress: progressSchema}),
  z.strictObject({kind: z.literal('finished'), id: z.uuid(), outcome: z.enum(['complete','cancelled','unavailable']), progress: progressSchema}),
  z.strictObject({kind: z.literal('watch'), id: z.uuid(), dirty: z.boolean(), overflow: z.boolean(), available: z.boolean()}),
  z.strictObject({kind: z.literal('failed'), id: z.uuid(), reason: z.enum(['invalid-request','root-unavailable','unsupported','not-configured'])}),
]);
export type NativeEvent = z.infer<typeof nativeEventSchema>;
