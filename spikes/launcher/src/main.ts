import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  nativeTheme,
  protocol,
  screen,
  session,
} from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, extname } from "node:path";
import {
  APP_ID,
  APP_URL,
  DESKTOP_FILE,
  DEFAULT_SHORTCUT,
  capabilities,
  isRequest,
  normalizeShortcut,
  parseCommand,
  parseInstanceData,
  sessionHint,
} from "./contract.ts";
import type { Command, LauncherState, Reply, Shortcut } from "./contract.ts";
import { prepareProfile } from "./profile.ts";
import tokens from "../../../docs/design/tokens.json" with { type: "json" };

app.setName("Linuxcast");
app.setDesktopName(DESKTOP_FILE);
app.enableSandbox();
protocol.registerSchemesAsPrivileged([
  {
    scheme: "linuxcast",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
const hint = sessionHint(process.env);
if (hint !== "unknown") app.commandLine.appendSwitch("ozone-platform", hint);
// Portal behavior is managed by Electron 45; no XWayland or unsandboxed fallback.
let command: Command;
try {
  const entryIndex = process.argv.indexOf(__filename);
  command = parseCommand(
    process.argv.slice(
      entryIndex >= 0 ? entryIndex + 1 : process.defaultApp ? 2 : 1,
    ),
  );
  const profile = prepareProfile(process.env.LINUXCAST_LAUNCHER_PROFILE);
  app.setPath("userData", profile);
  app.setPath("sessionData", profile);
} catch {
  console.error("LAUNCHER_INVALID_STARTUP");
  app.exit(2);
  throw new Error("Launcher startup rejected.");
}
const ownsInstance = app.requestSingleInstanceLock({
  protocolVersion: 1,
  command,
});
if (!ownsInstance) {
  app.exit(0);
} else {
  let window: BrowserWindow | null = null;
  let quitting = false;
  let recording = false;
  let registeredBinding: string | null = null;
  let launcherReady = false;
  let rendererFailed = false;
  let activationPending = false;
  let pendingCommand: Command = command;
  let shortcut: Shortcut = {
    requested: DEFAULT_SHORTCUT,
    effective: null,
    state: "temporarily-unavailable",
    reason: "Shortcut registration is pending.",
  };
  const snapshot = (): LauncherState => {
    const focused = window?.isFocused() ?? false;
    return {
    protocolVersion: 1,
    identity: APP_ID,
    session: hint,
    shortcut,
    capabilities: capabilities(hint, focused, activationPending),
    visible: window?.isVisible() ?? false,
    focused,
    appearance: nativeTheme.shouldUseDarkColors ? "dark" : "light",
    recording,
    };
  };
  const publish = () => {
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send("launcher:state", snapshot());
  };
  const finishRecording = () => {
    recording = false;
    globalShortcut.setSuspended(false);
  };
  const applyCommand = (request: Command) => {
    if (request === "quit") {
      quitting = true;
      app.quit();
      return;
    }
    if (!launcherReady) {
      pendingCommand = request;
      return;
    }
    if (!window || window.isDestroyed()) return;
    if (request === "toggle" && window.isVisible()) {
      activationPending = false;
      window.hide();
      publish();
      return;
    }
    // One normal request. X11 uses the documented restore/show/focus path;
    // Wayland and unknown sessions retain Show without explicit focus/restore.
    if (rendererFailed) {
      window.webContents.reload();
      rendererFailed = false;
    }
    activationPending = hint === "x11";
    if (hint === "x11" && window.isMinimized()) window.restore();
    window.show();
    if (hint === "x11") {
      window.focus();
      // An already-focused window need not emit another focus event for Show.
      if (window.isFocused()) activationPending = false;
    }
    publish();
  };
  const registerShortcut = (requested: string): Shortcut => {
    finishRecording();
    let old: string | null = null;
    try {
      if (registeredBinding && globalShortcut.isRegistered(registeredBinding)) old = registeredBinding;
    } catch { /* A lost backend registration must not be advertised as active. */ }
    registeredBinding = old;
    let registered = old === requested;
    try {
      if (!registered)
        registered =
          globalShortcut.register(requested, () => applyCommand("toggle")) &&
          globalShortcut.isRegistered(requested);
    } catch {
      /* Safe state below; no raw backend diagnostics. */
    }
    if (registered) {
      registeredBinding = requested;
      if (old && old !== requested) globalShortcut.unregister(old);
      shortcut = {
        requested,
        effective: hint === "x11" ? requested : null,
        state: hint === "x11" ? "available" : "permission-required",
        reason:
          hint === "x11"
            ? "Registered by the X11 shortcut backend."
            : "The desktop portal manages consent and the effective binding. Electron does not expose its chosen key; review desktop shortcut settings.",
      };
    } else
      shortcut = {
        requested,
        effective: hint === "x11" ? old : null,
        state: "temporarily-unavailable",
        reason: old
          ? `Requested shortcut unavailable. The previous session binding remains active: ${old}.`
          : "Shortcut unavailable or denied. Choose another key or bind linuxcast --toggle in desktop settings.",
      };
    publish();
    return shortcut;
  };
  const authorize = (
    event: IpcMainInvokeEvent,
    payload: unknown,
    extra?: "accelerator" | "appearance" | "height",
  ) =>
    event.sender === window?.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame?.url === APP_URL &&
    isRequest(payload, extra);
  const invalid = (): Reply<never> => ({
    ok: false,
    error: {
      code: "invalid-request",
      message: "Unsupported launcher request.",
    },
  });
  const denied = (): Reply<never> => ({
    ok: false,
    error: {
      code: "permission-denied",
      message: "This launcher frame is not authorized.",
    },
  });
  const check = (
    event: IpcMainInvokeEvent,
    payload: unknown,
    extra?: "accelerator" | "appearance" | "height",
  ) =>
    authorize(event, payload, extra)
      ? null
      : event.sender !== window?.webContents ||
          event.senderFrame?.url !== APP_URL
        ? denied()
        : invalid();
  ipcMain.handle("launcher:begin-recording", (event, payload: unknown) => {
    const failure = check(event, payload);
    if (failure) return failure;
    if (!window?.isFocused()) return denied();
    recording = true;
    globalShortcut.setSuspended(true);
    publish();
    return { ok: true, value: null };
  });
  ipcMain.handle("launcher:cancel-recording", (event, payload: unknown) => {
    const failure = check(event, payload);
    if (failure) return failure;
    finishRecording();
    publish();
    return { ok: true, value: null };
  });
  ipcMain.handle("launcher:content-height", (event, payload: unknown) => {
    const failure = check(event, payload, "height");
    if (failure) return failure;
    const height = (payload as Record<string, unknown>).height;
    if (
      !Number.isSafeInteger(height) ||
      (height as number) < 120 ||
      (height as number) > 4096
    )
      return invalid();
    if (hint !== "x11" || !window)
      return {
        ok: false,
        error: {
          code: "capability-unavailable",
          message: "The desktop controls this window size.",
        },
      };
    const area = screen.getDisplayMatching(window.getBounds()).workArea;
    const target = Math.max(
      Math.min(320, area.height - 32),
      Math.min(
        Math.ceil((height as number) * window.webContents.getZoomFactor()),
        tokens.layout.launcherMaxHeight,
        area.height - 32,
      ),
    );
    if (window.getContentSize()[1] !== target)
      window.setContentSize(window.getContentSize()[0]!, target);
    return { ok: true, value: null };
  });
  ipcMain.handle(
    "launcher:get-state",
    (event, payload: unknown) =>
      check(event, payload) ?? { ok: true, value: snapshot() },
  );
  ipcMain.handle("launcher:hide", (event, payload: unknown) => {
    const failure = check(event, payload);
    if (failure) return failure;
    window?.hide();
    publish();
    return { ok: true, value: null };
  });
  ipcMain.handle("launcher:quit", (event, payload: unknown) => {
    const failure = check(event, payload);
    if (failure) return failure;
    setImmediate(() => applyCommand("quit"));
    return { ok: true, value: null };
  });
  ipcMain.handle("launcher:set-shortcut", (event, payload: unknown) => {
    const failure = check(event, payload, "accelerator");
    if (failure) return failure;
    try {
      return {
        ok: true,
        value: registerShortcut(
          normalizeShortcut((payload as Record<string, unknown>).accelerator),
        ),
      };
    } catch {
      return invalid();
    }
  });
  ipcMain.handle("launcher:set-appearance", (event, payload: unknown) => {
    const failure = check(event, payload, "appearance");
    if (failure) return failure;
    const appearance = (payload as Record<string, unknown>).appearance;
    if (appearance !== "dark" && appearance !== "light") return invalid();
    nativeTheme.themeSource = appearance;
    publish();
    return { ok: true, value: null };
  });
  app.on("second-instance", (_event, _argv, _directory, data) => {
    try {
      const request = parseInstanceData(data);
      if (app.isReady()) applyCommand(request);
      else void app.whenReady().then(() => applyCommand(request));
    } catch {
      console.error("LAUNCHER_INSTANCE_REQUEST_REJECTED");
    }
  });
  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("activate", () => applyCommand("show"));
  app.on("window-all-closed", () => {
    /* Resident lifecycle: only explicit Quit exits. */
  });
  void app
    .whenReady()
    .then(async () => {
      if (command === "quit") {
        applyCommand("quit");
        return;
      }
      const assets = new Set<string>(
        JSON.parse(
          readFileSync(join(__dirname, "assets.json"), "utf8"),
        ) as string[],
      );
      protocol.handle("linuxcast", async (request) => {
        const url = new URL(request.url);
        const name = url.pathname.slice(1);
        if (
          request.method !== "GET" ||
          url.hostname !== "launcher" ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          !assets.has(name)
        )
          return new Response("Not found", { status: 404 });
        const mime: Record<string, string> = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".woff2": "font/woff2",
          ".woff": "font/woff",
          ".svg": "image/svg+xml",
        };
        return new Response(await readFile(join(__dirname, "renderer", name)), {
          headers: {
            "Content-Type": mime[extname(name)] ?? "application/octet-stream",
            "Content-Security-Policy":
              "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'",
            "X-Content-Type-Options": "nosniff",
          },
        });
      });
      session.defaultSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.on("will-download", (event) =>
        event.preventDefault(),
      );
      session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
        callback({ cancel: !details.url.startsWith("linuxcast://launcher/") }),
      );
      const area = screen.getPrimaryDisplay().workArea;
      const width = Math.min(tokens.layout.launcherWidth, area.width - 32);
      const height = Math.min(
        tokens.layout.launcherMaxHeight,
        area.height - 32,
      );
      window = new BrowserWindow({
        width,
        height,
        ...(hint === "x11"
          ? {
              x: Math.round(area.x + (area.width - width) / 2),
              y: Math.round(area.y + (area.height - height) / 2),
            }
          : {}),
        show: false,
        frame: false,
        resizable: true,
        minWidth: Math.min(360, width),
        minHeight: Math.min(320, height),
        title: "Linuxcast · Launcher feasibility",
        backgroundColor: tokens.themes.dark.surface,
        webPreferences: {
          preload: join(__dirname, "preload.cjs"),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          nodeIntegrationInWorker: false,
          nodeIntegrationInSubFrames: false,
          webSecurity: true,
          webviewTag: false,
          allowRunningInsecureContent: false,
          spellcheck: false,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, url) => {
        if (url !== APP_URL) event.preventDefault();
      });
      window.webContents.on("will-frame-navigate", (event) => {
        if (event.url !== APP_URL) event.preventDefault();
      });
      window.on("close", (event) => {
        if (!quitting) {
          event.preventDefault();
          window?.hide();
          publish();
        }
      });
      window.on("focus", () => {
        activationPending = false;
        publish();
      });
      window.on("blur", () => {
        finishRecording();
        publish();
      });
      window.on("show", publish);
      window.on("hide", () => {
        activationPending = false;
        finishRecording();
        publish();
      });
      window.webContents.on("render-process-gone", () => {
        finishRecording();
        rendererFailed = true;
        console.error("LAUNCHER_RENDERER_UNAVAILABLE");
      });
      nativeTheme.on("updated", () => {
        window?.setBackgroundColor(
          nativeTheme.shouldUseDarkColors
            ? tokens.themes.dark.surface
            : tokens.themes.light.surface,
        );
        publish();
      });
      await window.loadURL(APP_URL);
      // Readiness precedes every global shortcut registration.
      registerShortcut(
        normalizeShortcut(
          process.env.LINUXCAST_LAUNCHER_SHORTCUT ?? DEFAULT_SHORTCUT,
        ),
      );
      launcherReady = true;
      applyCommand(pendingCommand);
    })
    .catch(() => {
      if (!quitting) {
        console.error("LAUNCHER_START_FAILED");
        app.exit(1);
      }
    });
}
