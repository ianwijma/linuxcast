import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

// No session services autoactivate. Manage a separate real AT bus/registry and
// discovery service explicitly; never load host portals, keyrings or gvfs.
if (process.env.LINUXCAST_LAUNCHER_XVFB !== '1' || !/\/xvfb-run\.[^/]+\/Xauthority$/.test(process.env.XAUTHORITY ?? '')) throw new Error('Disposable xvfb-run entrypoint required');
const modeArguments = process.argv.slice(2);
if (modeArguments.length > 1 || (modeArguments.length === 1 && modeArguments[0] !== '--activation-help-only')) throw new Error('Unsupported AT mode');
const directory = mkdtempSync(resolve(tmpdir(), 'linuxcast-s001-at-bus-'));
mkdirSync(resolve(directory, 'services'));
mkdirSync(resolve(directory, 'at-services'));
mkdirSync(resolve(directory, 'runtime'), { mode: 0o700 });
writeFileSync(resolve(directory, 'bus.conf'), `<busconfig><type>session</type><listen>unix:tmpdir=${directory}</listen><auth>EXTERNAL</auth><servicedir>${directory}/services</servicedir><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>`);
writeFileSync(resolve(directory, 'at.conf'), `<busconfig><type>accessibility</type><listen>unix:path=${directory}/runtime/atspi-bus</listen><auth>EXTERNAL</auth><servicedir>${directory}/at-services</servicedir><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>`);
const env = Object.fromEntries(['PATH', 'DISPLAY', 'XAUTHORITY', 'TMPDIR', 'LANG', 'LC_ALL'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []));
const privateEnv = { ...env, HOME: directory, XDG_CONFIG_HOME: resolve(directory, 'config'), XDG_CACHE_HOME: resolve(directory, 'cache'), XDG_RUNTIME_DIR: resolve(directory, 'runtime'), AT_SPI_BUS_ADDRESS: `unix:path=${directory}/runtime/atspi-bus`, GSETTINGS_BACKEND: 'memory' };
const at = spawn('dbus-daemon', ['--nofork', '--config-file', resolve(directory, 'at.conf'), '--print-address=1'], { stdio: ['ignore', 'pipe', 'ignore'], env: privateEnv });
let registry: ChildProcess | undefined;
try {
  const atAddress = await new Promise<string>((resolve, reject) => {
    at.once('error', reject); at.stdout.once('data', (value: Buffer) => resolve(value.toString().trim()));
    at.once('exit', () => reject(new Error('Private AT bus failed')));
  });
  registry = spawn('/usr/libexec/at-spi2-registryd', [], { stdio: 'ignore', env: { ...privateEnv, AT_SPI_BUS_ADDRESS: atAddress } });
  const child = spawn('dbus-run-session', ['--config-file', resolve(directory, 'bus.conf'), '--', process.execPath, fileURLToPath(new URL('./check.ts', import.meta.url)), ...modeArguments],
    { stdio: 'inherit', env: { ...privateEnv, AT_SPI_BUS_ADDRESS: atAddress, LINUXCAST_LAUNCHER_PRIVATE_AT: '1' } });
  process.exitCode = await new Promise<number>((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
} finally {
  registry?.kill('SIGKILL'); at.kill('SIGKILL');
  rmSync(directory, { recursive: true, force: true });
}
