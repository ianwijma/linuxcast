import * as z from 'zod';
import { expect, it } from 'vitest';
import { ContractError, parseCommandDescriptor } from '../src/index.ts';

const registry = {
  capabilities: new Set(['synthetic.read']),
  permissions: new Map([['files.read', z.strictObject({ grantId: z.string().min(1), recursive: z.boolean().default(false) })]]),
  visibilityPredicates: new Set(['synthetic.visible']), actionHandlers: new Set(['synthetic.handler']),
};
const command = { protocolVersion: 1, id: 'org.synthetic.fixture:search', title: 'Search synthetic', aliases: ['fixture'],
  source: { kind: 'extension', id: 'org.synthetic.fixture' },
  argumentSchema: { schemaVersion: 1, schema: { type: 'object', properties: {} } }, requiredCapabilities: ['synthetic.read'],
  permissionRequirements: [{ id: 'files.read', scope: { grantId: 'synthetic-grant' } }],
  visibilityPredicateId: 'synthetic.visible', actionHandlerId: 'synthetic.handler' };

it('resolves declarations against broker-owned contract references and returns normalized permission scopes', () => {
  expect(parseCommandDescriptor(command, registry).permissionRequirements).toEqual([
    { id: 'files.read', scope: { grantId: 'synthetic-grant', recursive: false } },
  ]);
});
it.each([
  { ...command, protocolVersion: 2 }, { ...command, id: 'unqualified' },
  { ...command, handler: 'synthetic-executable' }, { ...command, principal: 'root' },
  { ...command, actionHandlerId: 'unregistered' }, { ...command, visibilityPredicateId: 'unregistered' },
  { ...command, requiredCapabilities: ['unregistered'] },
  { ...command, requiredCapabilities: ['synthetic.read', 'synthetic.read'] },
  { ...command, permissionRequirements: [command.permissionRequirements[0], command.permissionRequirements[0]] },
  { ...command, permissionRequirements: [{ id: 'unregistered', scope: {} }] },
  { ...command, permissionRequirements: [{ id: 'files.read', scope: { path: '/synthetic-only' } }] },
  { ...command, argumentSchema: { schemaVersion: 2, schema: {} } },
])('rejects invalid declarations and unknown broker references %#', value => {
  expect(() => parseCommandDescriptor(value, registry)).toThrow(ContractError);
});
