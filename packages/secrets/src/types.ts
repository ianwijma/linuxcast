import type { SecretReferenceRecord } from '../../platform-contracts/src/secrets.ts';
export type { SecretReferenceRecord } from '../../platform-contracts/src/secrets.ts';
export type SecretOwnerKind = SecretReferenceRecord['ownerKind'];
export interface SecretOwner {ownerKind:SecretOwnerKind;ownerId:string}
/** Metadata only. The coordinator's storage owner implements these calls; no
 * secret text or ciphertext may enter repository requests or the database. */
export interface SecretReferences {
  get(id:string):Promise<SecretReferenceRecord|null>;
  put(record:SecretReferenceRecord):Promise<SecretReferenceRecord>;
  delete(id:string):Promise<boolean>;
  list(params:{afterId?:string;limit:number}):Promise<{records:SecretReferenceRecord[];nextCursor:string|null}>;
}
export interface ElectronSafeStorage {
  isEncryptionAvailable():boolean;
  getSelectedStorageBackend():string;
  encryptString(value:string):Buffer;
  decryptString(value:Buffer):string;
}
export type SecureBackend = 'gnome_libsecret'|'kwallet'|'kwallet5'|'kwallet6';
export type SecretReason = 'locked'|'session-unavailable'|'unavailable'|'insecure-backend'|'encryption-failed'|'storage-failed'|'not-found'|'invalid-request'|'cancelled';
export type SecretStatus = {state:'available';backend:SecureBackend} |
  {state:'unavailable';reason:SecretReason;sessionOnlyAvailable:boolean;remediationAction:'retry-session'|'unlock-keyring'|'configure-keyring'|'retry-storage'|'enter-credential-again'};
export type SecretReference = {id:string;mode:'secure-persistent'|'session-only'};
export type StoreResult = {outcome:'stored';reference:SecretReference} | {outcome:'unavailable';status:Extract<SecretStatus,{state:'unavailable'}>};
