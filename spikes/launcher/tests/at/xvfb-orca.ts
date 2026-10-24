import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const modeArguments = process.argv.slice(2);
if (modeArguments.length > 1 || (modeArguments.length === 1 && modeArguments[0] !== '--activation-help-only')) throw new Error('Unsupported AT mode');

// The real screen reader may install input hooks only on this new display.
// No host display, session bus, profile or accessibility setting is inherited.
const env = Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'LC_ALL'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []));
const child = spawn('xvfb-run', ['--auto-servernum', '--server-args=-screen 0 1600x1200x24 -nolisten tcp', process.execPath, fileURLToPath(new URL('./private-session.ts', import.meta.url)), ...modeArguments],
  { stdio: 'inherit', env: { ...env, LINUXCAST_LAUNCHER_XVFB: '1' } });
process.exitCode = await new Promise<number>((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
