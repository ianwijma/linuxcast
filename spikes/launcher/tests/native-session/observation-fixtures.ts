/** Pure synthetic hook execution. No display, compositor, bus or native APIs. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { parseObservation } from './protocol.ts';
import type { Observation } from './protocol.ts';
export type SyntheticWindow = { pid: number; primary: unknown; secondary: unknown; width: number; identityReads: number; geometryReads: number; forbidMetadata?: boolean };
export const syntheticWindow = (pid: number, primary: unknown): SyntheticWindow => ({ pid, primary, secondary: '', width: 720, identityReads: 0, geometryReads: 0 });
export function hookFixture(family: 'gnome' | 'kwin', records: SyntheticWindow[]) {
  let tick: (() => void) | undefined;
  let serial = 0;
  let operation = 'observe';
  let activations = 0;
  let result: unknown;
  const contextData = () => ({ request: serial, pid: 101, decoyPid: 202, operation });
  const identity = (record: SyntheticWindow, which: 'primary' | 'secondary') => {
    record.identityReads++;
    if (record.forbidMetadata) throw new Error('SYNTHETIC_FORBIDDEN_METADATA');
    return record[which];
  };
  const geometry = (record: SyntheticWindow) => {
    record.geometryReads++;
    if (record.forbidMetadata) throw new Error('SYNTHETIC_FORBIDDEN_METADATA');
    return { x: 32, y: 32, width: record.width, height: 560 };
  };
  const area = () => ({ x: 0, y: 0, width: 1280, height: 900 });
  const windows = records.map(record => family === 'kwin' ? {
    pid: record.pid,
    get resourceClass() { return identity(record, 'primary'); },
    get desktopFileName() { return identity(record, 'secondary'); },
    get frameGeometry() { return geometry(record); },
    active: false, hidden: false,
    toString: () => 'KWin::XdgToplevelWindow(public-synthetic)',
  } : {
    get_pid: () => record.pid,
    get_gtk_application_id: () => identity(record, 'primary'),
    get_wm_class: () => identity(record, 'secondary'),
    get_client_type: () => 1, has_focus: () => false, is_hidden: () => false,
    get_frame_rect: () => geometry(record), get_work_area_current_monitor: area,
    activate: () => { activations++; },
  });
  const workspace = { windowList: () => windows, clientArea: area };
  Object.defineProperty(workspace, 'activeWindow', { set: () => { activations++; } });
  class Timer {
    interval = 0; singleShot = false;
    timeout = { connect: (callback: () => void) => { tick = callback; } };
    start() { /* The fixture explicitly drives one tick at a time. */ }
    stop() { tick = undefined; }
  }
  const runtime = createContext({ workspace, QTimer: Timer, KWin: { MaximizeArea: 0 }, TextDecoder,
    callDBus: (_service: string, _path: string, _interface: string, method: string, encoded: string, callback: (value: string) => void) => {
      if (method === 'Context') callback(JSON.stringify(contextData()));
      else { result = JSON.parse(encoded); callback('{}'); }
    },
    Gio: { File: { new_for_path: () => ({ query_exists: () => true, load_contents: () => [true, new TextEncoder().encode(JSON.stringify(contextData()))],
      replace_contents: (encoded: string) => { result = JSON.parse(encoded); } }) }, FileCreateFlags: { PRIVATE: 0 } },
    GLib: { getenv: (name: string) => name === 'LINUXCAST_S001_PRIVATE_MATRIX' ? '1' : '/tmp/linuxcast-s001-matrix-fixture',
      path_get_basename: () => 'linuxcast-s001-matrix-fixture', timeout_add: (_priority: number, _interval: number, callback: () => void) => { tick = callback; return 1; },
      PRIORITY_DEFAULT: 0, SOURCE_CONTINUE: true },
    Meta: { WindowClientType: { WAYLAND: 1, X11: 0 } }, Extension: class {},
    global: { get_window_actors: () => windows.map(meta_window => ({ meta_window })), get_current_time: () => 0 },
  });
  const filename = family === 'gnome' ? 'gnome-extension.js' : 'kwin-script.js';
  const source = readFileSync(fileURLToPath(new URL(filename, import.meta.url)), 'utf8');
  runInContext(source.replace(/^import .*;\n/gm, '').replace('export default class LauncherObserver', 'globalThis.LauncherObserver = class LauncherObserver'), runtime, { timeout: 1000 });
  if (family === 'gnome') runInContext('new LauncherObserver().enable()', runtime, { timeout: 1000 });
  return {
    observe(activateDecoy = false): Observation {
      serial++; operation = activateDecoy ? 'activate-decoy' : 'observe'; result = undefined;
      if (!tick) throw new Error('SYNTHETIC_HOOK_STOPPED');
      tick(); return parseObservation(result, serial);
    },
    activations: () => activations,
  };
}
