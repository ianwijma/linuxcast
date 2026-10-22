import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Full Orca input hooks can affect only this new Xvfb display. The child then
// creates fresh session/accessibility buses and memory-only settings/preferences.
const child = spawn('xvfb-run', ['--auto-servernum', '--server-args=-screen 0 1600x1200x24', process.execPath, fileURLToPath(new URL('./private-session.ts', import.meta.url))],
  { stdio: 'inherit', env: { ...process.env, LINUXCAST_ORCA_FULL: '1' } });
process.exitCode = await new Promise<number>((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
