import type { SecretSessionAccess,SecretSessionState } from '../src/session.ts';
/** Synthetic eligible session for storage/keyring tests only. Never production
 * observation, native session acceptance or lock protection evidence. */
export function syntheticSession(initial:SecretSessionState='observed-unlocked') {
  let state=initial;const listeners=new Set<(state:SecretSessionState)=>void>();
  const access:SecretSessionAccess={state:()=>state,subscribe(listener){listeners.add(listener);listener(state);return ()=>{listeners.delete(listener);};}};
  return {access,set(next:SecretSessionState){state=next;for(const listener of listeners)listener(next);},listeners};
}
