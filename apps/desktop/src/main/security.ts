import type { Session, WebContents, WebPreferences } from 'electron';
import { assetName } from './assets.ts';

export function securePreferences(preload: string, session: Session): WebPreferences {
  return {
    preload, session, sandbox: true, contextIsolation: true,
    nodeIntegration: false, nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false, webSecurity: true,
    webviewTag: false, allowRunningInsecureContent: false,
    spellcheck: false, navigateOnDragDrop: false,
  };
}

export function restrictSession(session: Session, assets: ReadonlySet<string>): void {
  session.setPermissionCheckHandler(() => false);
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setDevicePermissionHandler(() => false);
  session.setDisplayMediaRequestHandler((_request, callback) => callback({}));
  session.on('will-download', event => event.preventDefault());
  session.webRequest.onBeforeRequest((details, callback) => callback({
    cancel: details.method !== 'GET' || assetName(details.url, assets) === undefined,
  }));
}

export function restrictContents(contents: WebContents): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Programmatic loadURL is the only navigation. Renderer navigation never wins.
  contents.on('will-navigate', event => event.preventDefault());
  contents.on('will-frame-navigate', event => event.preventDefault());
  contents.on('will-redirect', event => event.preventDefault());
  contents.on('will-attach-webview', event => event.preventDefault());
  // A compromised page cannot veto explicit Quit or recovery.
  contents.on('will-prevent-unload', event => event.preventDefault());
}
