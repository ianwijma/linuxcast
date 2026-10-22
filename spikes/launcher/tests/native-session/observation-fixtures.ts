/** Pure synthetic hook execution. No display, compositor, bus or native APIs. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { parseObservation } from './protocol.ts';
import type { Observation } from './protocol.ts';
export type SyntheticWindow = { pid: number; primary: unknown; secondary: unknown; width: number; identityReads: number; geometryReads: number; forbidMetadata?: boolean; failGeometry?: boolean };
export const syntheticWindow = (pid: number, primary: unknown): SyntheticWindow => ({ pid, primary, secondary: '', width: 720, identityReads: 0, geometryReads: 0 });
export function hookFixture(family: 'gnome' | 'kwin', records: SyntheticWindow[], options: { nullActors?: boolean; contextOverride?: Record<string, unknown>; failStage?: 'enumerate' | 'activation' | 'publish'; failAllPublication?: boolean; contextMissing?: boolean; rejectedContext?: boolean; contextFailure?: 'file' | 'query' | 'read' | 'decode'; contextRaw?: string; contextValue?: unknown } = {}) {
  let tick: (() => void) | undefined;
  let serial = 0;
  let operation = 'observe';
  let activations = 0;
  let activationAttempts = 0;
  let result: unknown;
  const contextData = () => ({ request: serial, pid: 101, decoyPid: 202, operation, ...options.contextOverride });
  let publishAttempts = 0;
  const checkpoints: string[] = [];
  let nativeEnumerations = 0, fileReads = 0, fileQueries = 0, publicationCalls = 0;
  class Decoder { decode(bytes: Uint8Array) {
    if (options.contextFailure === 'decode') throw new Error('synthetic-private-exception-canary');
    return new TextDecoder().decode(bytes);
  } }
  const identity = (record: SyntheticWindow, which: 'primary' | 'secondary') => {
    record.identityReads++;
    if (record.forbidMetadata) throw new Error('SYNTHETIC_FORBIDDEN_METADATA');
    return record[which];
  };
  const geometry = (record: SyntheticWindow) => {
    record.geometryReads++;
    if (record.forbidMetadata) throw new Error('SYNTHETIC_FORBIDDEN_METADATA');
    if (record.failGeometry) throw new Error('synthetic-private-exception-canary');
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
    activate: () => { activationAttempts++; if (options.failStage === 'activation') throw new Error('synthetic-private-exception-canary'); activations++; },
  });
  const workspace = { windowList: () => windows, clientArea: area };
  Object.defineProperty(workspace, 'activeWindow', { set: () => { activations++; } });
  class Timer {
    interval = 0; singleShot = false;
    timeout = { connect: (callback: () => void) => { tick = callback; } };
    start() { /* The fixture explicitly drives one tick at a time. */ }
    stop() { tick = undefined; }
  }
  const runtime = createContext({ print: (value: string) => { checkpoints.push(value); }, workspace, QTimer: Timer, KWin: { MaximizeArea: 0 }, TextDecoder: Decoder,
    callDBus: (_service: string, _path: string, _interface: string, method: string, encoded: string, callback: (value: string) => void) => {
      if (method === 'Context') callback(JSON.stringify(contextData()));
      else { result = JSON.parse(encoded); callback('{}'); }
    },
    Gio: { File: { new_for_path: (path: string) => {
      if (path.endsWith('/context.json') && options.contextFailure === 'file') throw new Error('synthetic-private-exception-canary');
      return { query_exists: () => { fileQueries++; if (options.contextFailure === 'query') throw new Error('synthetic-private-exception-canary'); return !options.contextMissing; },
        load_contents: () => { fileReads++; if (options.contextFailure === 'read') throw new Error('synthetic-private-exception-canary');
          return [true, new TextEncoder().encode(options.contextRaw ?? JSON.stringify(Object.hasOwn(options, 'contextValue') ? options.contextValue : contextData()))]; },
        replace_contents: (encoded: string) => { publicationCalls++; if (options.failAllPublication || options.failStage === 'publish' && publishAttempts++ === 0) throw new Error('synthetic-private-exception-canary'); result = JSON.parse(encoded); } };
    } }, FileCreateFlags: { PRIVATE: 0 } },
    GLib: { getenv: (name: string) => name === 'LINUXCAST_S001_PRIVATE_MATRIX' ? options.rejectedContext ? '0' : '1' : '/tmp/linuxcast-s001-matrix-fixture',
      path_get_basename: () => 'linuxcast-s001-matrix-fixture', timeout_add: (_priority: number, _interval: number, callback: () => void) => { tick = callback; return 1; },
      source_remove: () => { tick = undefined; }, PRIORITY_DEFAULT: 0, SOURCE_CONTINUE: true },
    Meta: { WindowClientType: { WAYLAND: 1, X11: 0 } }, Extension: class {},
    global: { get_window_actors: () => {
      nativeEnumerations++;
      if (options.failStage === 'enumerate') throw new Error('synthetic-private-exception-canary');
      return [...(options.nullActors ? [{ meta_window: null }, { meta_window: undefined }] : []), ...windows.map(meta_window => ({ meta_window }))];
    }, get_current_time: () => 0 },
  });
  const filename = family === 'gnome' ? 'gnome-extension.js' : 'kwin-script.js';
  const source = readFileSync(fileURLToPath(new URL(filename, import.meta.url)), 'utf8');
  runInContext(source.replace(/^import .*;\n/gm, '').replace('export default class LauncherObserver', 'globalThis.LauncherObserver = class LauncherObserver'), runtime, { timeout: 1000 });
  if (family === 'gnome') runInContext('globalThis.fixtureObserver = new LauncherObserver(); fixtureObserver.enable()', runtime, { timeout: 1000 });
  const reply = (activateDecoy = false): unknown => {
      serial++; operation = activateDecoy ? 'activate-decoy' : 'observe'; result = undefined;
      if (!tick) throw new Error('SYNTHETIC_HOOK_STOPPED');
      tick(); return result;
  };
  return {
    reply,
    checkpoints: () => [...checkpoints],
    nativeEnumerations: () => nativeEnumerations,
    fileReads: () => fileReads,
    fileQueries: () => fileQueries,
    publicationCalls: () => publicationCalls,
    tick() { tick?.(); },
    disable() { if (family === 'gnome') runInContext('fixtureObserver.disable()', runtime); },
    repeatRequest() { result = undefined; tick?.(); return result; },
    removeWindow(pid: number) { const index = records.findIndex(record => record.pid === pid); if (index >= 0) windows.splice(index, 1); },
    activationAttempts: () => activationAttempts,
    observe(activateDecoy = false): Observation { return parseObservation(reply(activateDecoy), serial); },
    activations: () => activations,
  };
}
