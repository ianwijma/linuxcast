import { expect, it } from 'vitest';
import * as z from 'zod';
import { ContractError, createBrokerEffectRequest } from '../src/index.ts';
const principal = { kind: 'extension', id: 'org.linuxcast.synthetic', version: '1.0.0', integrity: 'a'.repeat(64) };
const context = { schemaVersion: 1, invocationId: 'synthetic-invocation', principal, source: 'explicit-user-action' };
const contract = { id: 'synthetic.write', effect: 'write' as const, externallyCommunicating: true, queryAllowed: false, retrySafe: false, permissionIds: ['synthetic.send'] };
const registry = new Map([[contract.id, { contract, arguments: z.strictObject({ content: z.string().default('Synthetic') }) }]]);
const submission = { schemaVersion: 1, operationId: contract.id, arguments: {} };
it('binds broker-owned principal/invocation and operation class with normalized arguments', () => {
  const request = createBrokerEffectRequest(submission, context, registry);
  expect(request.operation).toEqual(contract); expect(request.context).toEqual(context);
  expect(request.arguments).toEqual({ content: 'Synthetic' });
});
it.each([{ principal: { kind: 'builtin', id: 'forged' } }, { effect: 'read' }, { grants: ['synthetic.send'] },
  { invocationId: 'forged' }, { intentRef: 'forged' }, { schemaVersion: 2 }])('rejects submitted authority/classification fields %#', patch => {
  expect(() => createBrokerEffectRequest({ ...submission, ...patch }, context, registry)).toThrow(ContractError);
});
it('rejects unknown/mismatched operations and invalid arguments', () => {
  expect(() => createBrokerEffectRequest(submission, context, new Map())).toThrow(ContractError);
  expect(() => createBrokerEffectRequest(submission, context, new Map([[contract.id, { contract: { ...contract, id: 'different' }, arguments: z.object({}) }]]))).toThrow(ContractError);
  expect(() => createBrokerEffectRequest({ ...submission, arguments: { execute: 'synthetic' } }, context, registry)).toThrow(ContractError);
});
it('copies JSON content so later caller mutation cannot change the dispatch record', () => {
  const input = { ...submission, arguments: { content: 'Original' } };
  const request = createBrokerEffectRequest(input, context, registry);
  input.arguments.content = 'Changed'; principal.id = 'org.linuxcast.changed';
  expect(request.arguments).toEqual({ content: 'Original' }); expect(request.context.principal.id).toBe('org.linuxcast.synthetic');
  principal.id = 'org.linuxcast.synthetic';
});
