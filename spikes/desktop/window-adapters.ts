import { DesktopError } from './model.ts';
import type { NativeWindow, Rect } from './model.ts';

/** Native APIs inspected at Mutter48.0 and KWin6.3.6. No title/caption reader is
 * part of these interfaces. Callers may register only their known canary window. */
export interface MetaWindow {
  get_frame_rect(): Rect;
  get_work_area_current_monitor(): Rect;
  move_resize_frame(userOperation: boolean, x: number, y: number, width: number, height: number): void;
  is_fullscreen(): boolean;
  get_maximized(): number;
  connect(signal: 'unmanaged', callback: () => void): number;
  disconnect(signal: number): void;
}

function rectangle(value: Rect): Rect { return { x: value.x, y: value.y, width: value.width, height: value.height }; }

export function gnomeWindow(window: MetaWindow): NativeWindow & { dispose(): void } {
  let alive = true;
  const unmanaged = window.connect('unmanaged', () => { alive = false; });
  return {
    geometry: () => rectangle(window.get_frame_rect()),
    workArea: () => rectangle(window.get_work_area_current_monitor()),
    place: rect => window.move_resize_frame(true, Math.round(rect.x), Math.round(rect.y), Math.floor(rect.width), Math.floor(rect.height)),
    alive: () => alive,
    state: () => window.is_fullscreen() ? 'fullscreen' : window.get_maximized() ? 'maximized' : 'normal',
    dispose: () => { if (alive) window.disconnect(unmanaged); alive = false; },
  };
}

export interface KwinWindow { frameGeometry: Rect; fullScreen: boolean; maximizeMode: number; moveable: boolean; resizeable: boolean }
export interface KwinWorkspace {
  clientArea(option: number, window: KwinWindow): Rect;
  windowRemoved: { connect(callback: (window: KwinWindow) => void): void; disconnect(callback: (window: KwinWindow) => void): void };
}

export function kwinWindow(window: KwinWindow, workspace: KwinWorkspace, maximizeArea: number): NativeWindow & { dispose(): void } {
  let alive = true;
  const removed = (value: KwinWindow) => { if (value === window) alive = false; };
  workspace.windowRemoved.connect(removed);
  return {
    geometry: () => rectangle(window.frameGeometry), workArea: () => rectangle(workspace.clientArea(maximizeArea, window)),
    place: rect => {
      if (!window.moveable || !window.resizeable) throw new DesktopError('WINDOW_GEOMETRY_DENIED', 'Choose a movable, resizable window');
      window.frameGeometry = { ...rect };
    }, alive: () => alive,
    state: () => window.fullScreen ? 'fullscreen' : window.maximizeMode ? 'maximized' : 'normal',
    dispose: () => { workspace.windowRemoved.disconnect(removed); alive = false; },
  };
}
