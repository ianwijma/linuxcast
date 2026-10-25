import { parseContract } from '../../contracts/src/index.ts';
import { secretReferenceContracts } from '../../platform-contracts/src/secrets.ts';
import type { SecretReferences, SecretReferenceRecord } from './types.ts';
export interface SecretRepositoryClient {
  request(method:'secretRefs.get',params:{id:string}):Promise<SecretReferenceRecord|null>;
  request(method:'secretRefs.put',params:{record:SecretReferenceRecord}):Promise<SecretReferenceRecord>;
  request(method:'secretRefs.delete',params:{id:string}):Promise<boolean>;
  request(method:'secretRefs.list',params:{afterId?:string;limit:number}):Promise<{records:SecretReferenceRecord[];nextCursor:string|null}>;
}
function parsed<T>(method:string,value:unknown):T {return parseContract(secretReferenceContracts.get(method)!.result,value) as T;}
export function createSecretReferences(client:SecretRepositoryClient):SecretReferences {
  return {
    get:async id=>parsed<SecretReferenceRecord|null>('secretRefs.get',await client.request('secretRefs.get',{id})),
    put:async record=>parsed<SecretReferenceRecord>('secretRefs.put',await client.request('secretRefs.put',{record})),
    delete:async id=>parsed<boolean>('secretRefs.delete',await client.request('secretRefs.delete',{id})),
    list:async params=>parsed<{records:SecretReferenceRecord[];nextCursor:string|null}>('secretRefs.list',await client.request('secretRefs.list',params)),
  };
}
