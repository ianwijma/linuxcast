// No compositor/bus/SSH launcher. This can run only inside a separately
// authorized, guarded private KWin X11 session owned by the reviewed supervisor.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { setTimeout, clearTimeout } from 'node:timers';
import { writeFileSync } from 'node:fs';
import { endianness } from 'node:os';
import { SCOPE, runControl } from './core.mjs';
import { verifySources, loadProduction } from './production.mjs';

const CONTEXT_KEYS = new Set(['HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME','XDG_RUNTIME_DIR','PATH','LANG','LC_ALL','TMPDIR','GSETTINGS_BACKEND',
  'XDG_DATA_DIRS','XDG_CONFIG_DIRS','LINUXCAST_S001_PRIVATE_MATRIX','LINUXCAST_S001_MATRIX_ROOT','LINUXCAST_S001_NODE','LINUXCAST_S001_BACKEND',
  'DBUS_SESSION_BUS_ADDRESS','DISPLAY','XAUTHORITY','WAYLAND_DISPLAY','XDG_SESSION_TYPE','GDK_BACKEND','LIBGL_ALWAYS_SOFTWARE','QT_QUICK_BACKEND','PWD']);
export function validateContext(sourceRoot, environment, execute = spawnSync) {
  const candidate = Object.fromEntries(Object.entries(environment).map(([key,value]) => [key, CONTEXT_KEYS.has(key) ? value : '']));
  const answer = execute('/usr/bin/python3', ['-I', join(sourceRoot,'spikes/launcher/tests/native-session/private.py'),'--driver','kwin-x11'], {
    env: { PATH:'/usr/bin:/bin', LANG:'C.UTF-8', LC_ALL:'C.UTF-8' }, input:JSON.stringify(candidate), encoding:'utf8', timeout:5000, maxBuffer:65536 });
  if (answer.status !== 0 || answer.stdout.trim() !== 'PRIVATE_MATRIX_VERIFIED' || environment.LINUXCAST_S001_BACKEND !== 'kwin-x11') throw new Error('CONTROL_PRIVATE_CONTEXT');
}
export async function main(sourceRoot) {
  const end = performance.now()+180000;
  verifySources(sourceRoot);
  validateContext(sourceRoot,process.env); // Before imports/build/Electron/Xlib.
  const require = createRequire(join(sourceRoot,'package.json'));
  const { _electron, expect } = require('@playwright/test');
  const executable = createRequire(join(sourceRoot,'apps/desktop/package.json'))('electron');
  const { api, protocol } = await loadProduction(sourceRoot,expect);
  let app, child, auxiliary, quitAttempted=false, cleanupAttempted=false;
  const within = async (operation, maximum=8000) => {
    const remaining = Math.min(maximum,end-performance.now());
    if (remaining<=0) throw new Error('CONTROL_DEADLINE');
    let timer;
    try { return await Promise.race([operation(remaining),new Promise((_,reject) => { timer=setTimeout(() => reject(new Error('CONTROL_DEADLINE')),remaining); })]); }
    finally { clearTimeout(timer); }
  };
  const profile = join(process.env.LINUXCAST_S001_MATRIX_ROOT,'linuxcast-launcher-owned-control');
  const cleanup = async () => {
    cleanupAttempted=true; api.abort();
    if (child?.exitCode===null) {
      // No second uncertain Quit. The required outer reviewed supervisor
      // tears down all owned descendants if that one attempt did not finish.
      if (quitAttempted) throw new Error('CONTROL_QUIT_UNCONFIRMED');
      quitAttempted=true;await within(() => app.close(),8000);
    }
  };
  let result;
  try {
    const { buildLauncher } = await import(pathToFileURL(join(sourceRoot,'spikes/launcher/build.ts')).href);
    const entry = await within(() => buildLauncher(),180000);
    app = await within(timeout => _electron.launch({ executablePath:executable,chromiumSandbox:true,
      args:['--ozone-platform=x11',entry], env:{...process.env,TMPDIR:process.env.LINUXCAST_S001_MATRIX_ROOT,
        LINUXCAST_LAUNCHER_PROFILE:profile,LINUXCAST_LAUNCHER_SHORTCUT:'Ctrl+Alt+Shift+F12'},timeout }),60000);
    child = app.process();
    const page = await within(() => app.firstWindow(),60000);
    await within(timeout => page.waitForURL('linuxcast://launcher/index.html',{timeout}),60000);
    await within(timeout => expect(page.getByRole('textbox',{name:'Search commands',exact:true})).toBeVisible({timeout}),60000);
    api.configure(app,page);
    result = await runControl({
      capturePrimary: () => within(() => api.capture(Math.min(end,performance.now()+8000))),
      createAuxiliary: () => within(async () => {
        auxiliary = await app.evaluateHandle(async ({ BrowserWindow }) => {
          const window = new BrowserWindow({show:false,width:320,height:180,title:'Linuxcast fixed auxiliary control',
            webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
          window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
          window.webContents.on('will-navigate',event => event.preventDefault());
          window.showInactive();return window;
        });
        const value = await auxiliary.evaluate(window => {
          if (window.isDestroyed() || window.webContents.isDestroyed()) throw new Error('CONTROL_AUXILIARY');
          const p=window.webContents.getLastWebPreferences();
          if (!p.sandbox || !p.contextIsolation || p.nodeIntegration || !p.webSecurity) throw new Error('CONTROL_AUXILIARY');
          return window.getNativeWindowHandle().toString('hex');
        });
        return {pid:app.process().pid,xid:protocol.parseOwnedX11Handle(value,'linux','x64',endianness()),handle:value};
      }),
      verifyPair: (primary,aux) => within(timeout => {
        const child=spawnSync('/usr/bin/python3',['-I',fileURLToPath(new URL('./pair.py',import.meta.url)),'--source-root',sourceRoot],{
          env:process.env,input:JSON.stringify({pid:primary.pid,primary:primary.xid,auxiliary:aux.xid}),stdio:['pipe','pipe','ignore'],
          encoding:'utf8',maxBuffer:8192,timeout:Math.max(1,Math.floor(timeout)),killSignal:'SIGKILL'});
        if (child.status!==0 || child.signal!==null) throw new Error('CONTROL_PAIR');
        return JSON.parse(child.stdout);
      }),
      positive: () => within(async () => {
        const value=await api.positive();protocol.requireNativeTarget(value.launcher,'kwin-x11');
        if (value.launcher.count!==1 || !protocol.contained(value.launcher) || value.decoy.count!==0 || value.decoyActivationIssued) throw new Error('CONTROL_PRIMARY');
      }),
      negative: (primary,aux) => within(() => api.negative(primary,aux)),
      quit: () => within(async () => {
        quitAttempted=true;
        await app.close();
        if (!child || child.signalCode!==null) throw new Error('CONTROL_QUIT');
        return child.exitCode;
      },15000),
      cleanup,
    });
  } finally {
    if (!cleanupAttempted) await cleanup();
    void auxiliary?.dispose().catch(() => {});
  }
  verifySources(sourceRoot); // No unchanged-source claim if postflight fails.
  writeFileSync(join(process.env.LINUXCAST_S001_MATRIX_ROOT,'owned-control.json'),JSON.stringify(result)+'\n',{flag:'wx',mode:0o600});
  return result;
}
if (process.argv[1]===fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length!==4 || process.argv[2]!=='--source-root') throw new Error('CONTROL_ENTRY');
    const result=await main(process.argv[3]);console.log(JSON.stringify(result));process.exitCode=3;
  } catch {
    // Missing/invalid source or an outer run/cleanup failure does not fabricate
    // a six-step control report. It is fixed unavailable evidence only.
    console.log(JSON.stringify({kind:SCOPE.kind,status:'unavailable',reason:'CONTROL_ENTRY_OR_RUNTIME_REJECTED',
      physicalDesktopMatrixEstablished:false,fullAcceptanceEstablished:false}));process.exitCode=3;
  }
}
