import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SecretReferenceRecord } from '@linuxcast/platform-contracts/secrets';
import { StorageOwner } from '../src/owner.ts';
import { foundationMigrations } from '../src/migrations.ts';
import { STORAGE_SCHEMA_VERSION } from '../src/schema-version.ts';
const directories: string[] = [], owners: StorageOwner[] = [];
afterEach(async () => {
  for (const owner of owners.splice(0)) await owner.close();
  for (const path of directories.splice(0)) await rm(path, {recursive:true, force:true});
});
async function open(directory?: string, previous = false) {
  const path = directory ?? await mkdtemp(join(tmpdir(), 'linuxcast-secret-metadata-')); if (!directory) directories.push(path);
  const owner = await StorageOwner.open({dataDirectory:path,applicationBuild:'synthetic-secret-metadata',
    ...(previous ? {migrations:(await foundationMigrations()).slice(0,3)} : {})}); owners.push(owner); return owner;
}
const request = (owner: StorageOwner, method: string, params: unknown) => owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result;
const reference = (): SecretReferenceRecord => ({id:randomUUID(),ownerKind:'provider',ownerId:'synthetic-provider',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'});
it('upgrades schema3 preserving settings and retains only opaque reference metadata across reopen', async () => {
  const old = await open(undefined,true); request(old,'settings.set',{id:'ui.theme',value:'light',expectedRevision:0});
  await old.confirmSuccessfulLaunch(); await old.close();
  const owner = await open(old.directory), record = reference();
  expect(owner.version).toBe(STORAGE_SCHEMA_VERSION);
  expect(request(owner,'settings.get',{id:'ui.theme'})).toMatchObject({value:'light'});
  expect(request(owner,'secretRefs.put',{record})).toEqual(record);
  await owner.confirmSuccessfulLaunch(); await owner.close();
  expect(request(await open(owner.directory),'secretRefs.get',{id:record.id})).toEqual(record);
});
it('binds immutable reference IDs to ownership and rejects stale updates and secret payload fields', async () => {
  const owner = await open(), record = reference(); request(owner,'secretRefs.put',{record});
  for (const invalid of [{...record,ownerId:'other'}, {...record,ownerKind:'backup'}, {...record,createdAt:'2025-01-01T00:00:00.000Z'},
    {...record,plaintext:'synthetic-rejected-value'}, {...record,ciphertext:'synthetic-rejected-blob'}, {...record,blobPath:'/synthetic/path'}])
    expect(() => request(owner,'secretRefs.put',{record:invalid})).toThrow();
  const next = {...record,updatedAt:'2026-01-01T00:00:01.000Z'}; expect(request(owner,'secretRefs.put',{record:next})).toEqual(next);
  expect(() => request(owner,'secretRefs.put',{record})).toThrow('conflict');
  expect(request(owner,'secretRefs.get',{id:record.id})).toEqual(next);
});
it('pages all reference identities without duplicates and deletes only the requested reference', async () => {
  const owner = await open(), records = Array.from({length:3},reference).sort((a,b)=>a.id.localeCompare(b.id));
  for (const record of records) request(owner,'secretRefs.put',{record});
  const first = request(owner,'secretRefs.list',{limit:2}) as {records:SecretReferenceRecord[];nextCursor:string};
  expect(first).toEqual({records:records.slice(0,2),nextCursor:records[1]!.id});
  expect(request(owner,'secretRefs.list',{limit:2,afterId:first.nextCursor})).toEqual({records:records.slice(2),nextCursor:null});
  expect(request(owner,'secretRefs.delete',{id:records[0]!.id})).toBe(true);
  expect(request(owner,'secretRefs.delete',{id:records[0]!.id})).toBe(false);
  expect(request(owner,'secretRefs.get',{id:records[0]!.id})).toBeNull();
  expect(request(owner,'secretRefs.get',{id:records[1]!.id})).toEqual(records[1]);
});
