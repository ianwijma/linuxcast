/** S0-01-local feasibility interfaces. F0-01 owns production contract freeze. */
export const APP_ID = "io.github.ianwijma.Linuxcast";
export const DESKTOP_FILE = `${APP_ID}.desktop`;
export const APP_URL = "linuxcast://launcher/index.html";
export const DEFAULT_SHORTCUT = "Alt+Space";
export type Command = "show" | "toggle" | "quit";
export type SessionKind = "x11" | "wayland" | "unknown";
export type Capability = {
  id: "launcher.activate" | "launcher.position";
  state: "available" | "component-required" | "temporarily-unavailable";
  backend: string | null;
  reason: string;
  remediation: string;
};
export type Shortcut = {
  requested: string;
  effective: string | null;
  state: "available" | "temporarily-unavailable" | "permission-required";
  reason: string;
};
export type LauncherState = {
  protocolVersion: 1;
  identity: typeof APP_ID;
  session: SessionKind;
  shortcut: Shortcut;
  capabilities: Capability[];
  visible: boolean;
  focused: boolean;
  appearance: "dark" | "light";
  recording: boolean;
};
export type Reply<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: {
        code:
          "invalid-request" | "permission-denied" | "capability-unavailable";
        message: string;
      };
    };
export type LauncherAPI = {
  getState: () => Promise<Reply<LauncherState>>;
  reportContentHeight: (height: number) => Promise<Reply<null>>;
  hideLauncher: () => Promise<Reply<null>>;
  beginShortcutRecording: () => Promise<Reply<null>>;
  cancelShortcutRecording: () => Promise<Reply<null>>;
  quit: () => Promise<Reply<null>>;
  setShortcut: (accelerator: string) => Promise<Reply<Shortcut>>;
  setAppearance: (appearance: "dark" | "light") => Promise<Reply<null>>;
  onState: (listener: (state: LauncherState) => void) => () => void;
  runtime: Readonly<{ sandboxed: boolean; contextIsolated: boolean }>;
};
export function parseCommand(args: unknown): Command {
  if (
    !Array.isArray(args) ||
    args.length > 1 ||
    args.some((a) => typeof a !== "string" || a.length > 32)
  )
    throw new Error(
      "Unsupported launcher command. Use --show, --toggle or --quit.",
    );
  if (args.length === 0) return "show";
  const command = args[0];
  if (command === "--show") return "show";
  if (command === "--toggle") return "toggle";
  if (command === "--quit") return "quit";
  throw new Error(
    "Unsupported launcher command. Use --show, --toggle or --quit.",
  );
}
export function parseInstanceData(value: unknown): Command {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid instance request.");
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (k) => !["protocolVersion", "command"].includes(k),
    ) ||
    data.protocolVersion !== 1 ||
    !["show", "toggle", "quit"].includes(data.command as string)
  )
    throw new Error("Invalid instance request.");
  return data.command as Command;
}
export function isRequest(
  value: unknown,
  extra?: "accelerator" | "appearance" | "height",
): value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return false;
  const r = value as Record<string, unknown>;
  return (
    r.protocolVersion === 1 &&
    Object.keys(r).every((k) => k === "protocolVersion" || k === extra)
  );
}
export function normalizeShortcut(value: unknown): string {
  if (typeof value !== "string" || value.length > 64)
    throw new Error(
      "Choose Ctrl, Alt or Super with a letter, number, function key or Space.",
    );
  const parts = value.split("+");
  const key = parts.pop();
  const modifiers = ["Ctrl", "Alt", "Shift", "Super"];
  if (
    !key ||
    !(
      /^[A-Z0-9]$/.test(key) ||
      /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key) ||
      key === "Space"
    ) ||
    !parts.length ||
    !parts.some((m) => ["Ctrl", "Alt", "Super"].includes(m)) ||
    parts.some((m) => !modifiers.includes(m)) ||
    new Set(parts).size !== parts.length
  )
    throw new Error(
      "Choose Ctrl, Alt or Super with a letter, number, function key or Space.",
    );
  return [...modifiers.filter((m) => parts.includes(m)), key].join("+");
}
export function sessionHint(
  environment: Record<string, string | undefined>,
): SessionKind {
  if (environment.XDG_SESSION_TYPE === "wayland" && environment.WAYLAND_DISPLAY)
    return "wayland";
  if (environment.XDG_SESSION_TYPE === "x11" && environment.DISPLAY)
    return "x11";
  return "unknown";
}
export function capabilities(
  session: SessionKind,
  focused: boolean,
): Capability[] {
  if (session === "wayland")
    return [
      {
        id: "launcher.activate",
        state: "component-required",
        backend: null,
        reason:
          "Native Wayland focus needs a validated activation path or desktop companion.",
        remediation:
          "Enable the matching GNOME or KWin companion in the full client; use desktop activation meanwhile.",
      },
      {
        id: "launcher.position",
        state: "component-required",
        backend: null,
        reason: "The compositor chooses native Wayland placement.",
        remediation:
          "Use normal desktop placement; enable the matching companion for controlled placement in the full client.",
      },
    ];
  if (session === "x11")
    return [
      {
        id: "launcher.activate",
        state: focused ? "available" : "temporarily-unavailable",
        backend: "electron-x11",
        reason: focused
          ? "The window manager reported the launcher focused."
          : "Focus has not been observed for this activation.",
        remediation: focused
          ? ""
          : "Activate Linuxcast from the desktop or retry --show. No repeated force-focus is used.",
      },
      {
        id: "launcher.position",
        state: "available",
        backend: "electron-x11",
        reason:
          "Placement requests use the current X11 work area; the window manager may adjust them.",
        remediation:
          "Use normal desktop placement if the window manager overrides the request.",
      },
    ];
  return [
    {
      id: "launcher.activate",
      state: "temporarily-unavailable",
      backend: null,
      reason: "No supported graphical session was identified.",
      remediation: "Open Linuxcast from a supported graphical session.",
    },
    {
      id: "launcher.position",
      state: "temporarily-unavailable",
      backend: null,
      reason: "No supported placement backend was identified.",
      remediation: "Use normal desktop placement in a supported session.",
    },
  ];
}
