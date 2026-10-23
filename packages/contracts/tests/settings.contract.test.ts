import * as z from 'zod';
import { expect, it } from 'vitest';
import { ContractError, parseContract, parsePermissionRequest, settingDefinitionSchema, fileReferenceSchema, applicationReferenceSchema } from '../src/index.ts';
const base = { id: 'synthetic-setting', title: 'Synthetic setting', required: true };
it.each([
  { kind: 'text', default: 'Synthetic', validation: { min: 1, max: 20 } },
  { kind: 'secret' }, { kind: 'number', default: 3, validation: { min: 0, max: 5 } },
  { kind: 'boolean', default: false }, { kind: 'enum', default: 'a', options: [{ label: 'Synthetic', value: 'a' }] },
  { kind: 'file' }, { kind: 'directory' }, { kind: 'application' },
])('accepts typed $kind settings', value => { expect(parseContract(settingDefinitionSchema, { ...base, ...value })).toEqual({ ...base, ...value }); });
it.each([
  { kind: 'text', default: 1 }, { kind: 'secret', default: 'synthetic-private-canary' },
  { kind: 'number', default: Infinity }, { kind: 'number', default: 6, validation: { max: 5 } },
  { kind: 'text', default: 'abc', validation: { max: 2 } },
  { kind: 'text', validation: { min: 3, max: 2 } }, { kind: 'number', validation: { min: 5, max: 1 } },
  { kind: 'enum', default: 'absent', options: [{ label: 'Synthetic', value: 'a' }] },
  { kind: 'enum', options: [{ label: 'Synthetic', value: 'a' }, { label: 'Duplicate', value: 'a' }] },
  { kind: 'file', default: '/synthetic-only' }, { kind: 'directory', default: '/synthetic-only' },
  { kind: 'application', default: 'synthetic.desktop' }, { kind: 'boolean', default: false, execute: 'synthetic-code' },
])('rejects invalid defaults/validation or activation fields %#', value => {
  try { parseContract(settingDefinitionSchema, { ...base, ...value }); expect.fail('Expected rejection.'); }
  catch (error) { expect(error).toBeInstanceOf(ContractError); expect(String(error)).not.toContain('synthetic-private-canary'); }
});
it('validates declared permission scope using the host schema and preserves normalization', () => {
  const scopes = new Map([['url.open', z.strictObject({ schemes: z.array(z.literal('https')).default(['https']) })]]);
  const request = { id: 'url.open', reason: 'Open a synthetic link.', scope: {} };
  expect(parsePermissionRequest(request, scopes).scope).toEqual({ schemes: ['https'] });
  expect(() => parsePermissionRequest({ ...request, id: 'unknown' }, scopes)).toThrow(ContractError);
  expect(() => parsePermissionRequest({ ...request, scope: { schemes: ['file'] } }, scopes)).toThrow(ContractError);
  expect(() => parsePermissionRequest({ ...request, granted: true }, scopes)).toThrow(ContractError);
});
it('represents files and applications by explicit kinds and opaque broker references', () => {
  const file = { kind: 'file', grantId: 'synthetic-grant', entryId: 'synthetic-entry', displayName: 'Synthetic', displayPath: '/synthetic-display-only' };
  expect(parseContract(fileReferenceSchema, file)).toEqual(file);
  expect(() => parseContract(fileReferenceSchema, { path: '/synthetic-only' })).toThrow(ContractError);
  expect(() => parseContract(fileReferenceSchema, { ...file, granted: true })).toThrow(ContractError);
  expect(parseContract(applicationReferenceSchema, { kind: 'application', id: 'synthetic.desktop', displayName: 'Synthetic' })).toHaveProperty('kind', 'application');
});

it('accepts an explicitly registered scopeless permission without inventing a grant', () => {
  const request = { id: 'storage.local', reason: 'Store synthetic preferences.' };
  expect(parsePermissionRequest(request, new Map([['storage.local', z.undefined()]]))).toEqual(request);
});

it('bounds rendered setting text using the same UTF-8 field limit as views', () => {
  expect(() => parseContract(settingDefinitionSchema, { ...base, title: 'é'.repeat(32768), kind: 'text' })).not.toThrow();
  expect(() => parseContract(settingDefinitionSchema, { ...base, title: 'é'.repeat(32769), kind: 'text' })).toThrow(ContractError);
});

it('lets each registered permission validate scalar or array JSON scopes', () => {
  const scopes = new Map<string, z.ZodType>([['synthetic.scalar', z.literal('synthetic')], ['synthetic.array', z.array(z.string()).min(1)]]);
  expect(parsePermissionRequest({ id: 'synthetic.scalar', reason: 'Synthetic', scope: 'synthetic' }, scopes).scope).toBe('synthetic');
  expect(parsePermissionRequest({ id: 'synthetic.array', reason: 'Synthetic', scope: ['synthetic'] }, scopes).scope).toEqual(['synthetic']);
  expect(() => parsePermissionRequest({ id: 'synthetic.scalar', reason: 'Synthetic', scope: 'foreign' }, scopes)).toThrow(ContractError);
  expect(() => parsePermissionRequest({ id: 'synthetic.array', reason: 'Synthetic', scope: [] }, scopes)).toThrow(ContractError);
});
