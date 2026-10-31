import { randomUUID } from 'node:crypto';
import type { ElectronSafeStorage, SecureBackend, SecretStatus } from './types.ts';
const secure = new Set(['gnome_libsecret','kwallet','kwallet5','kwallet6']);
export function unavailable(reason:Extract<SecretStatus,{state:'unavailable'}>['reason']):Extract<SecretStatus,{state:'unavailable'}> {
  return {state:'unavailable',reason,sessionOnlyAvailable:reason!=='locked'&&reason!=='session-unavailable',remediationAction:reason==='session-unavailable'?'retry-session':reason==='locked'?'unlock-keyring':reason==='storage-failed'?'retry-storage':reason==='not-found'?'enter-credential-again':'configure-keyring'};
}
/** Pinned Electron45 synchronous Linux API: its selected backend attests the
 * same OSCrypt implementation used by encrypt/decrypt. The independent async
 * provider chain's availability boolean cannot attest a secure provider.
 * Revisit with explicit backend evidence before upgrading to Electron46. */
export class SafeStorageAdapter {
  #api:ElectronSafeStorage;
  #failed=false;
  constructor(api:ElectronSafeStorage) {this.#api=api;}
  status():SecretStatus {
    if(this.#failed)return unavailable('encryption-failed');
    try {
      const backend=this.#api.getSelectedStorageBackend();
      if(backend==='basic_text')return unavailable('insecure-backend');
      if(!secure.has(backend) || !this.#api.isEncryptionAvailable())return unavailable('unavailable');
      return {state:'available',backend:backend as SecureBackend};
    } catch {return unavailable('unavailable');}
  }
  encrypt(value:string):Buffer {
    if(this.status().state!=='available')throw new Error('Secure encryption unavailable.');
    try {
      const ciphertext=this.#api.encryptString(value);
      // Linux sync keyring ciphertext is v11; v10 is the hardcoded-password path.
      if(!Buffer.isBuffer(ciphertext) || ciphertext.length<4 || ciphertext.length>128*1024 || ciphertext.subarray(0,3).toString('ascii')!=='v11' || this.#api.decryptString(ciphertext)!==value || this.status().state!=='available')throw new Error();
      return Buffer.from(ciphertext);
    } catch {this.#failed=true;throw new Error('Secure encryption failed.');}
  }
  recheck():SecretStatus {
    this.#failed=false;const status=this.status();if(status.state!=='available')return status;
    try {const encrypted=this.encrypt(`linuxcast-keyring-probe:${randomUUID()}`);encrypted.fill(0);return this.status();}
    catch {return unavailable('encryption-failed');}
  }
  decrypt(ciphertext:Buffer):string {
    if(this.status().state!=='available')throw new Error('Secure encryption unavailable.');
    try {
      if(ciphertext.length<4 || ciphertext.length>128*1024 || ciphertext.subarray(0,3).toString('ascii')!=='v11')throw new Error();
      const value=this.#api.decryptString(ciphertext);
      if(!value || Buffer.byteLength(value)>128*1024 || this.status().state!=='available')throw new Error();
      return value;
    } catch {throw new Error('Secure decryption failed.');}
  }
}
