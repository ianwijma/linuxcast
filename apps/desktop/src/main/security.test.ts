import type { Session, WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { APP_URL } from './assets.ts';
import { restrictContents, restrictSession, securePreferences } from './security.ts';

describe('Electron security enforcement', () => {
  it('requires sandbox and isolation for the sole trusted preload', () => {
    const preferences = securePreferences('/packaged/preload.cjs', {} as Session);
    expect(preferences).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false,
      nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false, webSecurity: true,
      webviewTag: false, allowRunningInsecureContent: false, navigateOnDragDrop: false });
  });
  it('blocks navigation, child windows, frames, webviews and unload vetoes', () => {
    const handlers = new Map<string, (event: { preventDefault(): void }) => void>();
    const open = vi.fn();
    restrictContents({ setWindowOpenHandler: open, on: (name: string, listener: typeof handlers extends Map<string, infer V> ? V : never) => handlers.set(name, listener) } as unknown as WebContents);
    expect(open.mock.calls[0]![0]()).toEqual({ action: 'deny' });
    for (const name of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview', 'will-prevent-unload']) {
      const preventDefault = vi.fn(); handlers.get(name)!({ preventDefault }); expect(preventDefault).toHaveBeenCalledOnce();
    }
  });
  it('denies permission, capture, downloads and requests outside the asset allowlist', () => {
    const permission = vi.fn(), request = vi.fn(), device = vi.fn(), capture = vi.fn(), before = vi.fn(), on = vi.fn();
    restrictSession({ setPermissionCheckHandler: permission, setPermissionRequestHandler: request,
      setDevicePermissionHandler: device, setDisplayMediaRequestHandler: capture, on,
      webRequest: { onBeforeRequest: before } } as unknown as Session, new Set(['index.html']));
    expect(permission.mock.calls[0]![0]()).toBe(false); expect(device.mock.calls[0]![0]()).toBe(false);
    const callback = vi.fn(); request.mock.calls[0]![0](null, 'media', callback); expect(callback).toHaveBeenLastCalledWith(false);
    capture.mock.calls[0]![0]({}, callback); expect(callback).toHaveBeenLastCalledWith({});
    const preventDefault = vi.fn(); on.mock.calls[0]![1]({ preventDefault }); expect(preventDefault).toHaveBeenCalledOnce();
    for (const url of ['https://example.com/private', 'file:///private', 'data:text/html,private', APP_URL + '?private=1']) {
      before.mock.calls[0]![0]({ url, method: 'GET' }, callback); expect(callback).toHaveBeenLastCalledWith({ cancel: true });
    }
    before.mock.calls[0]![0]({ url: APP_URL, method: 'GET' }, callback); expect(callback).toHaveBeenLastCalledWith({ cancel: false });
    before.mock.calls[0]![0]({ url: APP_URL, method: 'POST' }, callback); expect(callback).toHaveBeenLastCalledWith({ cancel: true });
  });
});
