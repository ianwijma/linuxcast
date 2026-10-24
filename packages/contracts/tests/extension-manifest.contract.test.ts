import { describe, expect, test } from 'vitest';
import * as z from 'zod';
import { ContractError, parseContract } from '../src/protocol.ts';
import { extensionManifestSchema, parseExtensionManifest } from '../src/extension-manifest.ts';
import type { ExtensionManifestRegistry } from '../src/extension-manifest.ts';

const schema = { schemaVersion: 1 as const, schema: { type: 'object' } };
const preference = { id: 'sort', kind: 'enum', title: 'Sort order', required: true,
  options: [{ label: 'Title', value: 'title' }, { label: 'Recent', value: 'recent' }], default: 'title' };
const base = () => ({ manifestVersion: 1, id: 'org.linuxcast.examples.saved-links', version: '1.0.0', name: 'Saved Links',
  description: 'Synthetic package contract fixture', author: { name: 'Linuxcast' }, license: 'GPL-3.0-only',
  minHostVersion: '1.0.0', sdkVersion: '^1.0.0', runtime: 'bundled-node', platforms: ['linux'],
  icon: { light: 'assets/light.png', dark: 'assets/dark.png' },
  commands: [{ id: 'search', title: 'Search', mode: 'view', entry: 'dist/search.js', arguments: [], preferences: [] }],
  preferences: [preference], permissions: [{ id: 'storage.local', reason: 'Save package-owned data' }],
});
const registry = (): ExtensionManifestRegistry => ({
  compatible: (host, sdk) => host === '1.0.0' && sdk === '^1.0.0', validLicense: license => license === 'GPL-3.0-only',
  validJsonSchema: item => item.schema !== null && typeof item.schema === 'object' && !Array.isArray(item.schema) && item.schema.type === 'object',
  permissionScopes: new Map<string, z.ZodType>([
    ['storage.local', z.undefined()], ['background.run', z.undefined()], ['tray.publish', z.undefined()],
    ['network.fetch', z.strictObject({ origins: z.array(z.string()) })],
  ]),
  dependencyTargets: new Map([['runtime', new Set(['bundled-node'])], ['application', new Set(['org.example.Editor'])]]),
  files: new Set(['assets/light.png', 'assets/dark.png', 'dist/search.js', 'skills/example.md', 'assets/context.txt']),
});
const parse = (value: unknown, context = registry()) => parseExtensionManifest(value, context);

test('normative native package example parses without enabling automatic work', () => {
  const result = parse(base());
  expect(result.commands[0]!.disabledByDefault).toBe(false);
  expect(result.runtime).toBe('bundled-node');
  expect(result).not.toHaveProperty('grants');
});
test.each(['id', 'version', 'manifestVersion', 'runtime', 'platforms'])('rejects invalid %s without coercion', field => {
  const values = { id: 'NOT.A.PACKAGE', version: '01.0.0', manifestVersion: 2, runtime: 'host-node', platforms: ['linux', 'darwin'] };
  expect(() => parse({ ...base(), [field]: values[field as keyof typeof values] })).toThrow(ContractError);
});
test.each(['../escape.js', '/tmp/entry.js', 'dist//entry.js', 'dist/./entry.js', 'dist/../entry.js', 'dist\\entry.js', 'dist/entry.node', 'https://example.com/entry.js', 'dist/entry.js\0'])('rejects non-bundled or unnormalized entry %s', entry => {
  const data = base(); data.commands[0]!.entry = entry;
  expect(() => parse(data)).toThrow(ContractError);
});
test('requires referenced package files before accepting declarations', () => {
  const context = registry(); context.files = new Set(['dist/search.js']);
  expect(() => parse(base(), context)).toThrow(ContractError);
});
test('background declarations remain disabled and require explicit requested permission', () => {
  const data = base();
  const command = { ...data.commands[0], background: { intervalSeconds: 60, timeoutMs: 30000 } };
  expect(() => parse({ ...data, commands: [command] })).toThrow(ContractError);
  const permissions = [...data.permissions, { id: 'background.run', reason: 'Refresh on an enabled schedule' }];
  expect(parse({ ...data, commands: [command], permissions }).commands[0]!.disabledByDefault).toBe(true);
  for (const background of [{ intervalSeconds: 59, timeoutMs: 30000 }, { intervalSeconds: 60, timeoutMs: 30001 }]) {
    expect(() => parse({ ...data, commands: [{ ...command, background }], permissions })).toThrow(ContractError);
  }
  expect(() => parse({ ...data, commands: [{ ...command, disabledByDefault: false }], permissions })).toThrow(ContractError);
});
test('tray declares its permission and does not imply background execution', () => {
  const data = base(); data.commands[0]!.mode = 'tray';
  expect(() => parse(data)).toThrow(ContractError);
  data.permissions.push({ id: 'tray.publish', reason: 'Show package tray data' });
  expect(parse(data).commands[0]!.background).toBeUndefined();
});
test('duplicate declaration IDs and incompatible preference overrides reject', () => {
  const data = base(); data.commands.push(data.commands[0]!);
  expect(() => parse(data)).toThrow(ContractError);
  data.commands.pop();
  for (const override of [{ id: 'sort', kind: 'number', title: 'Sort order', required: true, default: 1 }, { ...preference, options: [{ label: 'New', value: 'new' }], default: 'new' }]) {
    expect(() => parse({ ...data, commands: [{ ...data.commands[0], preferences: [override] }] })).toThrow(ContractError);
  }
  expect(parse({ ...data, commands: [{ ...data.commands[0], preferences: [{ ...preference, default: 'recent' }] }] }).commands[0]!.preferences[0]).toMatchObject({ default: 'recent' });
});
test('secret and file defaults cannot create credentials or grants', () => {
  for (const kind of ['secret', 'file', 'directory', 'application']) {
    expect(() => parse({ ...base(), preferences: [{ id: 'unsafe', title: 'Unsafe', kind, required: true, default: '/private' }] })).toThrow(ContractError);
  }
});
test('host compatibility, schema and license checks are mandatory and safe on failure', () => {
  for (const key of ['compatible', 'validLicense'] as const) {
    const context = registry(); context[key] = () => false;
    expect(() => parse(base(), context)).toThrow(ContractError);
    context[key] = () => { throw new Error('private callback failure'); };
    expect(() => parse(base(), context)).toThrow('Invalid extension package contract.');
  }
  const data = { ...base(), tools: [{ id: 'find', entry: 'dist/search.js', description: 'Find', inputSchema: schema, outputSchema: schema, effect: 'read' }] };
  expect(parse(data).tools).toHaveLength(1);
  const context = registry(); context.validJsonSchema = () => false;
  expect(() => parse(data, context)).toThrow(ContractError);
});
test('all optional contributions are inert data and referenced runtime targets are host-owned', () => {
  const data = { ...base(), tools: [{ id: 'find', entry: 'dist/search.js', description: 'Find', inputSchema: schema, outputSchema: schema, effect: 'read' }],
    workflowNodes: [{ id: 'find', title: 'Find', description: '', configSchema: schema, inputSchema: schema, outputSchema: schema, effects: ['read'], handlerId: 'find' }],
    skills: [{ id: 'guide', description: 'Package guidance', path: 'skills/example.md', resources: ['assets/context.txt'] }],
    dependencies: [{ id: 'node', kind: 'runtime', target: 'bundled-node', reason: 'Run packaged server' }],
    mcp: [{ id: 'local', transport: 'stdio', runtimeDependencyId: 'node', entry: 'dist/search.js', arguments: [], permissionIds: [] }],
  };
  expect(parse(data).mcp).toHaveLength(1);
  expect(() => parse({ ...data, dependencies: [] })).toThrow(ContractError);
  expect(() => parse({ ...data, dependencies: [{ ...data.dependencies[0], target: '/bin/sh' }] })).toThrow(ContractError);
  expect(() => parse({ ...data, mcp: [{ ...data.mcp[0], autoConnect: true }] })).toThrow(ContractError);
});
test('model contribution has capabilities but no credential or automatic selection', () => {
  const capabilities = { text: true, imageInput: false, fileInputMimeTypes: [], toolCalls: false,
    structuredOutput: 'none', reasoningControls: [], contextTokens: null, outputTokens: null,
    tokenUsage: 'unavailable', cancellation: 'local-only' };
  const model = { id: 'local', title: 'Local', baseUrl: 'http://localhost:8080/v1', modelId: 'fixture', protocol: 'openai-chat-completions', credentialMode: 'none', capabilities };
  expect(parse({ ...base(), modelContributions: [model] }).modelContributions).toHaveLength(1);
  expect(() => parse({ ...base(), modelContributions: [{ ...model, apiKey: 'synthetic-disallowed' }] })).toThrow(ContractError);
  expect(() => parse({ ...base(), modelContributions: [{ ...model, selected: true }] })).toThrow(ContractError);
  expect(() => parse({ ...base(), modelContributions: [{ ...model, baseUrl: 'https://user:password@example.com' }] })).toThrow(ContractError);
});
test('remote MCP explicitly references its declared network permission', () => {
  const connection = { id: 'remote', transport: 'remote', url: 'https://example.com/mcp', permissionIds: ['network.fetch'] };
  const data = { ...base(), mcp: [connection], permissions: [...base().permissions,
    { id: 'network.fetch', reason: 'Connect to declared MCP endpoint', scope: { origins: ['https://example.com'] } }] };
  expect(parse(data).mcp).toHaveLength(1);
  for (const permissionIds of [[], ['storage.local']]) {
    expect(() => parse({ ...data, mcp: [{ ...connection, permissionIds }] })).toThrow(ContractError);
  }
  expect(() => parse({ ...data, permissions: base().permissions })).toThrow(ContractError);
});
test('remote metadata cannot contain credentials or execution fields', () => {
  for (const field of ['scripts', 'install', 'grants', 'renderer', 'css', 'providerKey']) expect(() => parse({ ...base(), [field]: 'untrusted' })).toThrow(ContractError);
  expect(() => parse({ ...base(), homepage: 'https://user:password@example.com' })).toThrow(ContractError);
  expect(() => parse({ ...base(), homepage: 'javascript:alert(1)' })).toThrow(ContractError);
});
test('permissions use only host registered scopes and preserve normalization', () => {
  const data = { ...base(), permissions: [{ id: 'network.fetch', reason: 'Fetch approved endpoint', scope: {} }] };
  const context = registry(); context.permissionScopes = new Map([['network.fetch', z.strictObject({ origins: z.array(z.string()).default(['https://example.com']) })]]);
  expect(parse(data, context).permissions[0]!.scope).toEqual({ origins: ['https://example.com'] });
  expect(() => parse({ ...data, permissions: [{ id: 'anything', reason: 'Request all' }] })).toThrow(ContractError);
});
test('oversized manifest fails with a safe typed error', () => {
  const data = { ...base(), commands: [], skills: Array.from({ length: 100 }, (_, n) => ({ id: `s${n}`, description: 'x'.repeat(64000), path: 'skills/example.md' })) };
  expect(() => parseContract(extensionManifestSchema, data)).toThrow(ContractError);
});

describe('pure contract boundary', () => {
  test('does not mutate a submitted declaration or interpret skill instructions', () => {
    const data = base(); const before = structuredClone(data);
    parse(data);
    expect(data).toEqual(before);
  });
});
