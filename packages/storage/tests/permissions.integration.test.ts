import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import type { DecisionRecord } from '@linuxcast/platform-contracts/permissions';
import { MAX_ENVELOPE_BYTES } from '../../contracts/src/index.ts';
import { StorageOwner } from '../src/owner.ts';
import { permissionPrincipalKey } from '../src/permissions.ts';
import { foundationMigrations } from '../src/migrations.ts';
import { STORAGE_SCHEMA_VERSION } from '../src/schema-version.ts';
import { storageContracts } from '../src/method-contracts.ts';

const paths: string[] = [], owners: StorageOwner[] = [];
afterEach(async () => {
  for (const owner of owners.splice(0)) await owner.close();
  for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true });
});
async function open(path?: string, initial = false) {
  const directory = path ?? await mkdtemp(join(tmpdir(), 'linuxcast-permission-storage-'));
  if (!path) paths.push(directory);
  const owner = await StorageOwner.open({dataDirectory: directory, applicationBuild: 'synthetic-permission-fixture',
    ...(initial ? {migrations: (await foundationMigrations()).slice(0, 1)} : {})});
  owners.push(owner); return owner;
}
const request = (owner: StorageOwner, method: string, params: unknown) => owner.request({schemaVersion: 1, requestId: randomUUID(), method, params}).result;
function decision(patch: Partial<DecisionRecord> = {}): DecisionRecord {
  return {schemaVersion: 1, id: randomUUID(), principal: {kind: 'builtin', id: 'builtin.fixture'},
    declarationHash: 'a'.repeat(64), permissionId: 'files.read', scope: {kind: 'resource', resourceId: 'fixture-root'},
    decision: 'deny', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...patch};
}
function list(owner: StorageOwner, principalKey: string, limit = 200, afterId?: string) {
  return request(owner, 'permissions.list', {principalKey, limit, ...(afterId ? {afterId} : {})}) as {records: DecisionRecord[]; nextCursor: string | null};
}

it('inventories multiple principals and compare-deletes only the exact selected durable decision', async () => {
  const owner=await open();
  const first=decision(), second=decision({principal:{kind:'workflow',id:randomUUID(),version:'1.0.0',integrity:'b'.repeat(64)}});
  for(const record of [first,second])request(owner,'permissions.put',{record});
  const page=request(owner,'permissions.inventory',{limit:1}) as {records:DecisionRecord[];nextCursor:string};
  const next=request(owner,'permissions.inventory',{limit:1,afterId:page.nextCursor}) as {records:DecisionRecord[];nextCursor:null};
  expect([...page.records,...next.records].map(row=>row.id)).toEqual([first.id,second.id].sort());
  expect(next.nextCursor).toBeNull();
  const newer={...first,decision:'allow' as const,updatedAt:'2026-01-02T00:00:00.000Z'};
  request(owner,'permissions.put',{record:newer});
  expect(request(owner,'permissions.revokeSelected',{record:first})).toBe('changed');
  expect(list(owner,permissionPrincipalKey(first)).records).toEqual([newer]);
  expect(request(owner,'permissions.revokeSelected',{record:newer})).toBe('removed');
  expect(request(owner,'permissions.revokeSelected',{record:newer})).toBe('missing');
  expect(list(owner,permissionPrincipalKey(second)).records).toEqual([second]);
  for(const params of [{limit:101},{limit:0},{limit:1,principalKey:permissionPrincipalKey(first)},{limit:1,afterId:'private-not-a-cursor'}])
    expect(()=>request(owner,'permissions.inventory',params)).toThrow('invalid-request');
});

it('upgrades the retained schema1 database without losing user settings and persists scoped decisions across reopen', async () => {
  const initial = await open(undefined, true);
  request(initial, 'settings.set', {id: 'ui.theme', value: 'dark', expectedRevision: 0});
  await initial.confirmSuccessfulLaunch(); await initial.close();
  const current = await open(initial.directory);
  expect(current.version).toBe(STORAGE_SCHEMA_VERSION);
  expect(request(current, 'settings.get', {id: 'ui.theme'})).toMatchObject({value: 'dark'});
  const record = decision(); expect(request(current, 'permissions.put', {record})).toEqual(record);
  await current.confirmSuccessfulLaunch(); await current.close();
  expect(list(await open(current.directory), permissionPrincipalKey(record)).records).toEqual([record]);
});
it('same-key updates retain identity, reject stale/equivalent-instant conflicts, and never retarget an existing id', async () => {
  const owner = await open(), record = decision(); request(owner, 'permissions.put', {record});
  expect(() => request(owner, 'permissions.put', {record: {...record, updatedAt: '2026-01-01T00:00:00Z', decision: 'allow'}})).toThrow('conflict');
  expect(() => request(owner, 'permissions.put', {record: {...record, scope: {kind: 'resource', resourceId: 'other'}}})).toThrow('conflict');
  const update = {...record, id: randomUUID(), updatedAt: '2026-01-01T00:00:01.000Z', decision: 'allow'};
  expect(request(owner, 'permissions.put', {record: update})).toEqual({...update, id: record.id});
  expect(() => request(owner, 'permissions.put', {record})).toThrow('conflict');
  expect(request(owner, 'permissions.revoke', {id: record.id})).toBe(true);
  expect(request(owner, 'permissions.revoke', {id: record.id})).toBe(false);
  expect(list(owner, permissionPrincipalKey(record)).records).toEqual([]);
});
it('pages only the exact principal identity and declaration/scope records without skipping oversized legal pages', async () => {
  const owner = await open();
  const principal = {kind: 'extension' as const, id: 'a'.repeat(64_000), version: 'b'.repeat(64_000), integrity: 'c'.repeat(64)};
  const records = Array.from({length: 12}, (_, index) => decision({principal, scope: {kind: 'resource', resourceId: `fixture-${index}`}}));
  for (const record of records) request(owner, 'permissions.put', {record});
  const other = decision({principal: {...principal, integrity: 'd'.repeat(64)}}); request(owner, 'permissions.put', {record: other});
  const key = permissionPrincipalKey(records[0]!);
  const first = list(owner, key); expect(first.records.length).toBeGreaterThan(0); expect(first.records.length).toBeLessThan(12);
  expect(Buffer.byteLength(JSON.stringify(first))).toBeLessThan(MAX_ENVELOPE_BYTES - 4096);
  const second = list(owner, key, 200, first.nextCursor!);
  expect(second.nextCursor).toBeNull();
  expect([...first.records, ...second.records].map(r => r.id)).toEqual(records.map(r => r.id).sort());
  expect(list(owner, permissionPrincipalKey(other)).records).toEqual([other]);
});
it('result validation fails inside the transaction so a rejected reply never commits a grant', async () => {
  const owner = await open(), record = decision();
  const original = storageContracts.get('permissions.put')!;
  (storageContracts as Map<string, typeof original>).set('permissions.put', {...original, result: z.never()});
  try { expect(() => request(owner, 'permissions.put', {record})).toThrow(); }
  finally { (storageContracts as Map<string, typeof original>).set('permissions.put', original); }
  expect(list(owner, permissionPrincipalKey(record)).records).toEqual([]);
});
it('rejects scope broadening, once grants and caller-computed authority fields before mutation', async () => {
  const owner = await open(), record = decision();
  for (const invalid of [{...record, scope: {kind: 'global'}}, {...record, decision: 'once'}, {...record, principalKey: '0'.repeat(64)}])
    expect(() => request(owner, 'permissions.put', {record: invalid})).toThrow();
  expect(list(owner, permissionPrincipalKey(record)).records).toEqual([]);
});
