import { syntheticSession } from './session-fixture.ts';
/** Actual Electron main/keyring smoke, bundled by run-keyring-smoke.ts. No
 * credential values or errors are emitted; reference persistence is tested
 * separately against the real storage owner. */
import { app,safeStorage } from 'electron';
import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { SecretStore } from '../src/store.ts';
import type { SecretReferenceRecord,SecretReferences } from '../src/types.ts';
const directory=process.argv.at(-1)!;
app.setPath('userData',join(directory,'electron-user-data'));
app.setName('linuxcast-secret-smoke');
app.commandLine.appendSwitch('disable-gpu');
let store:SecretStore|undefined;
void (async()=>{try {
  await app.whenReady();
  process.stdout.write('{"phase":"electron-ready"}\n');
  const records=new Map<string,SecretReferenceRecord>();
  const references:SecretReferences={get:async id=>records.get(id)??null,put:async record=>{records.set(record.id,record);return record;},delete:async id=>records.delete(id),list:async()=>({records:[...records.values()],nextCursor:null})};
  store=await SecretStore.open({session:syntheticSession().access,dataDirectory:directory,safeStorage,references});
  const status=store.recheckKeyring();process.stdout.write(JSON.stringify({phase:'keyring-probe',state:status.state,...(status.state==='available'?{backend:status.backend}:{reason:status.reason})})+'\n');if(status.state!=='available')throw new Error();
  const generated=randomBytes(32).toString('hex');const owner={ownerKind:'provider' as const,ownerId:'disposable-smoke'};
  const result=await store.store(owner,generated,'persistent');if(result.outcome!=='stored')throw new Error();
  await store.close();store=await SecretStore.open({session:syntheticSession().access,dataDirectory:directory,safeStorage,references});
  let roundtrip=false;const used=await store.use(result.reference,owner,async value=>{roundtrip=value===generated;});
  const deleted=await store.delete(result.reference,owner);await store.close();
  const clean=(await readdir(join(directory,'secrets'))).length===0 && records.size===0;
  if(used.outcome!=='used' || !roundtrip || deleted.outcome!=='deleted' || !clean)throw new Error();
  process.stdout.write(`${JSON.stringify({kind:'keyring-smoke',electron:process.versions.electron,backend:status.backend,securePersistent:true,roundtrip:true,deleted:true,referenceRepository:'memory-fixture'})}\n`);
  app.exit(0);
} catch {await store?.close().catch(()=>{});process.stdout.write('{"kind":"keyring-smoke","outcome":"unavailable"}\n');app.exit(2);}})();
