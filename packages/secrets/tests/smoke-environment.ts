import { isAbsolute,join } from 'node:path';
/** Child-process environment only. Never copy the caller's desktop/session,
 * credential, loader or shell variables into this disposable keyring session. */
export function privateSmokeEnvironment(directory:string,sessionBus?:string):NodeJS.ProcessEnv & {HOME:string;GNOME_KEYRING_CONTROL:string} {
  if(!isAbsolute(directory) || (sessionBus!==undefined && !sessionBus.startsWith('unix:')))throw new Error('Invalid private smoke environment.');
  return {PATH:'/usr/bin:/bin',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',HOME:join(directory,'home'),
    XDG_DATA_HOME:join(directory,'data'),XDG_CONFIG_HOME:join(directory,'config'),XDG_CACHE_HOME:join(directory,'cache'),XDG_STATE_HOME:join(directory,'state'),XDG_RUNTIME_DIR:join(directory,'runtime'),
    XDG_CURRENT_DESKTOP:'GNOME',DESKTOP_SESSION:'gnome',GNOME_KEYRING_CONTROL:join(directory,'runtime','keyring'),
    ...(sessionBus===undefined?{}:{DBUS_SESSION_BUS_ADDRESS:sessionBus})};
}
