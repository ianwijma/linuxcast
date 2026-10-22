import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { release } from 'node:os';
import { Companion } from './model.ts';
import { BUS } from './adapters.ts';

const own = dirname(fileURLToPath(import.meta.url));
const call = (tool: string, args: string[], env = process.env) => spawnSync(tool, args, { env, encoding: 'utf8', timeout: 5000, maxBuffer: 65536 });
const busArgs = ['call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.NameHasOwner'];
const shell = call('/usr/bin/gdbus', ['call', '--session', '--dest', 'org.gnome.Shell', '--object-path', '/org/gnome/Shell', '--method', 'org.freedesktop.DBus.Properties.Get', 'org.gnome.Shell', 'ShellVersion']);
const shellVersion = shell.status === 0 ? shell.stdout.match(/[0-9]+\.[0-9]+(?:\.[0-9]+)?/)?.[0] ?? null : null;
const owner = (name: string) => { const value = call('/usr/bin/gdbus', [...busArgs, name]); return value.status === 0 ? value.stdout.includes('true') : null; };
const companion = new Companion('gnome48', 'host-probe');
const shape = call('/usr/bin/gjs', [join(own, 'native/api-shape.js')], { ...process.env,
  GI_TYPELIB_PATH: '/usr/lib/x86_64-linux-gnu/mutter-10:/usr/lib/gnome-shell',
  LD_LIBRARY_PATH: '/usr/lib/x86_64-linux-gnu/mutter-10:/usr/lib/gnome-shell' });
let apiShape: unknown = null;
try { if (shape.status === 0) apiShape = JSON.parse(shape.stdout); } catch { /* not runtime proof */ }
let synthetic: unknown = { state: 'not-run', reason: 'EXPLICIT_SYNTHETIC_CANARY_OPTION_REQUIRED' };
if (process.argv.slice(2).includes('--synthetic-canary')) {
  const canary = call('/usr/bin/python3', [join(own, 'native/own-canary.py')]);
  try { synthetic = JSON.parse(canary.stdout); } catch { synthetic = { state: 'unavailable', reason: 'SYNTHETIC_WINDOW_PROBE_FAILED' }; }
}
const report = {
  task: 'S0-02', evidenceKind: 'authorized-host-probe; not supported-target companion acceptance',
  platform: { os: readFileSync('/etc/os-release', 'utf8').match(/^PRETTY_NAME="([^"]+)"$/m)?.[1], kernel: release(), architecture: process.arch,
    shellVersion, gjs: call('/usr/bin/gjs', ['--version']).stdout.trim() },
  gnome48: shellVersion ? companion.connect(shellVersion) : { state: 'temporarily-unavailable', reason: 'SHELL_SESSION_BUS_UNAVAILABLE', action: 'Use the authorized graphical session bus' },
  kwinBusOwned: owner('org.kde.KWin'), spikeCompanionBusOwned: owner(BUS.service),
  installedGiApiShapeOnly: apiShape, synthetic,
  limitations: ['No companion was installed or enabled', 'No global clipboard or private window title was read',
    'GNOME48 and Plasma6.3 live companion protocols remain unverified', 'X11 canary is not native Wayland control proof'],
};
console.log(JSON.stringify(report, null, 2));
// Version/name discovery alone never establishes live companion acceptance.
process.exitCode = 3;
