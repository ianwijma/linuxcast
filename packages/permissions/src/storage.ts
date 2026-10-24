import { createHash } from 'node:crypto';
import { parseContract } from '../../contracts/src/index.ts';
import { permissionRepositoryContracts, principalKeyMaterial } from '../../platform-contracts/src/permissions.ts';
import type { DecisionRecord } from '../../platform-contracts/src/permissions.ts';
import type { DecisionStore } from './types.ts';

/** Structural subset implemented by F2's validated main-only StorageClient. */
export interface PermissionRepositoryClient {
  request(method:'permissions.list',params:{principalKey:string;afterId?:string;limit:number}):Promise<{records:DecisionRecord[];nextCursor:string|null}>;
  request(method:'permissions.put',params:{record:DecisionRecord}):Promise<DecisionRecord>;
  request(method:'permissions.revoke',params:{id:string}):Promise<boolean>;
}
const key=(record:DecisionRecord)=>createHash('sha256').update(principalKeyMaterial(record.principal)).digest('hex');
function validated<T>(method:string,value:unknown):T {
  return parseContract(permissionRepositoryContracts.get(method)!.result,value) as T;
}
/** No records escape until the entire bounded principal inventory validates.
 * Any failed page, cursor regression, duplicate or substituted principal fails
 * closed; a successful prefix cannot become a partial grant cache. */
export function createDecisionStore(client:PermissionRepositoryClient):DecisionStore {
  return {
    async list(principalKey:string) {
      const records:DecisionRecord[]=[];
      let afterId:string|undefined;
      let inventoryBytes=0;
      for(let page=0;page<=10_000;page++) {
        const params={principalKey,limit:200,...(afterId?{afterId}:{})};
        parseContract(permissionRepositoryContracts.get('permissions.list')!.params,params);
        const result=validated<{records:DecisionRecord[];nextCursor:string|null}>('permissions.list',await client.request('permissions.list',params));
        let previous=afterId;
        for(const record of result.records) {
          inventoryBytes+=Buffer.byteLength(JSON.stringify(record));
          if(inventoryBytes>16*1024*1024)throw new Error('Permission inventory exceeds byte limit.');
          if(key(record)!==principalKey || (previous!==undefined && record.id<=previous)) throw new Error('Invalid permission page.');
          previous=record.id;
          records.push(record);
          if(records.length>10_000) throw new Error('Permission inventory exceeds limit.');
        }
        if(result.nextCursor===null)return structuredClone(records);
        if(result.records.length===0 || result.nextCursor!==previous)throw new Error('Invalid permission cursor.');
        afterId=result.nextCursor;
      }
      throw new Error('Permission inventory exceeds limit.');
    },
    async put(record) {return validated<DecisionRecord>('permissions.put',await client.request('permissions.put',{record}));},
    async revoke(id) {return validated<boolean>('permissions.revoke',await client.request('permissions.revoke',{id}));},
  };
}
