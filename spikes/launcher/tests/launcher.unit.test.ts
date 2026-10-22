import { describe, expect, it } from "vitest";
import { mkdtempSync, chmodSync, rmSync, symlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import {
  APP_ID,
  parseCommand,
  parseInstanceData,
  isRequest,
  normalizeShortcut,
  sessionHint,
  capabilities,
} from "../src/contract.ts";
import type { Command, LauncherState } from "../src/contract.ts";
import { prepareProfile } from "../src/profile.ts";
describe("S0-01 strict launcher data boundaries", () => {
  it("routes only singleton show/toggle/quit data and rejects code paths secrets and extra fields without echo", () => {
    expect(parseCommand([])).toBe("show");
    for (const action of ["show", "toggle", "quit"]) {
      expect(parseCommand([`--${action}`])).toBe(action);
      expect(parseInstanceData({ protocolVersion: 1, command: action })).toBe(
        action,
      );
    }
    for (const args of [
      ["--eval=code"],
      ["--toggle", "--quit"],
      ["https://example.org/"],
      [";echo synthetic"],
      [{}],
      ["private-canary"],
    ])
      expect(() => parseCommand(args)).toThrow(
        "Unsupported launcher command. Use --show, --toggle or --quit.",
      );
    for (const value of [
      null,
      [],
      { protocolVersion: 2, command: "show" },
      { protocolVersion: 1, command: "eval" },
      { protocolVersion: 1, command: "show", secret: "private-canary" },
    ])
      expect(() => parseInstanceData(value)).toThrow(
        "Invalid instance request.",
      );
    expect(isRequest({ protocolVersion: 1 })).toBe(true);
    expect(
      isRequest({ protocolVersion: 1, accelerator: "Ctrl+F12" }, "accelerator"),
    ).toBe(true);
    for (const value of [
      null,
      [],
      { protocolVersion: 2 },
      { protocolVersion: 1, arbitraryChannel: "x" },
      JSON.parse('{"protocolVersion":1,"__proto__":{}}'),
    ])
      expect(isRequest(value)).toBe(false);
  });
  it("requires bounded explicit modifier/key shortcut requests", () => {
    expect(normalizeShortcut("Alt+Ctrl+Shift+F12")).toBe("Ctrl+Alt+Shift+F12");
    expect(normalizeShortcut("Alt+Space")).toBe("Alt+Space");
    for (const value of [
      "F12",
      "Shift+A",
      "Ctrl+Ctrl+A",
      "Ctrl+;",
      "Ctrl+space",
      "Ctrl+F99",
      "Ctrl+",
      "x".repeat(65),
      null,
      {},
    ])
      expect(() => normalizeShortcut(value)).toThrow();
  });
  it("keeps Wayland component requirements distinct from observed X11 focus and unknown sessions", () => {
    expect(
      sessionHint({
        XDG_SESSION_TYPE: "wayland",
        WAYLAND_DISPLAY: "wayland-fixture",
        DISPLAY: ":99",
      }),
    ).toBe("wayland");
    expect(sessionHint({ XDG_SESSION_TYPE: "x11", DISPLAY: ":99" })).toBe(
      "x11",
    );
    expect(sessionHint({ XDG_SESSION_TYPE: "wayland", DISPLAY: ":99" })).toBe(
      "unknown",
    );
    expect(
      capabilities("wayland", true).every(
        (c) => c.state === "component-required" && c.backend === null,
      ),
    ).toBe(true);
    expect(capabilities("x11", false)[0]?.state).toBe(
      "temporarily-unavailable",
    );
    expect(capabilities("x11", true)[0]?.state).toBe("available");
    expect(
      capabilities("unknown", true).every(
        (c) => c.state === "temporarily-unavailable",
      ),
    ).toBe(true);
  });
  it("isolates disposable profiles and rejects nonprivate or symlink targets", () => {
    const dir = mkdtempSync(join(tmpdir(), "linuxcast-launcher-unit-"));
    try {
      expect(prepareProfile(dir)).toBe(dir);
      chmodSync(dir, 0o755);
      expect(() => prepareProfile(dir)).toThrow("not private");
      chmodSync(dir, 0o700);
      const link = `${dir}-link`;
      symlinkSync(dir, link);
      try {
        expect(() => prepareProfile(link)).toThrow();
      } finally {
        rmSync(link);
      }
      expect(() => prepareProfile("/var/tmp/unrelated-profile")).toThrow(
        "Invalid disposable",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("rejects nested profiles whose writable parent could replace the checked directory", () => {
    const parent = mkdtempSync(join(tmpdir(), "linuxcast-launcher-parent-"));
    try {
      chmodSync(parent, 0o777);
      expect(() => prepareProfile(join(parent, "private-child"))).toThrow("Invalid disposable");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

// Exercise the actual production function and state snapshot, type-only stripped.
// Electron is never imported and no native window or display is used here.
function commandFixture(options: { hint?: LauncherState["session"]; visible?: boolean; minimized?: boolean;
  ready?: boolean; destroyed?: boolean; absent?: boolean; rendererFailed?: boolean; focusAccepted?: boolean } = {}) {
  const text = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const snapshotStart = text.indexOf("  const snapshot ="), snapshotEnd = text.indexOf("  const publish =", snapshotStart);
  const commandStart = text.indexOf("  const applyCommand ="), commandEnd = text.indexOf("  const registerShortcut =", commandStart);
  expect(snapshotStart).toBeGreaterThanOrEqual(0); expect(snapshotEnd).toBeGreaterThan(snapshotStart);
  expect(commandStart).toBeGreaterThan(snapshotEnd); expect(commandEnd).toBeGreaterThan(commandStart);
  const program = stripTypeScriptTypes(`${text.slice(snapshotStart, snapshotEnd)}\n${text.slice(commandStart, commandEnd)}\n globalThis.fixtureCommand = applyCommand; globalThis.fixtureSnapshot = snapshot;`);
  const effects: string[] = [], published: LauncherState[] = [];
  let visible = options.visible ?? false, minimized = options.minimized ?? false, focused = false;
  let minimizeQueries = 0;
  const hint = options.hint ?? "x11";
  const window = {
    isDestroyed: () => options.destroyed ?? false,
    isVisible: () => visible,
    isFocused: () => focused,
    isMinimized: () => {
      if (hint !== "x11") throw new Error("NON_X11_RESTORE_QUERY");
      minimizeQueries++; return minimized;
    },
    restore: () => { if (hint !== "x11") throw new Error("NON_X11_RESTORE"); effects.push("restore"); minimized = false; },
    show: () => { effects.push("show"); visible = true; },
    focus: () => { if (hint !== "x11") throw new Error("NON_X11_FOCUS"); effects.push("focus"); focused = options.focusAccepted ?? false; },
    hide: () => { effects.push("hide"); visible = false; focused = false; },
    webContents: { reload: () => effects.push("reload") },
  };
  const context = {
    window: options.absent ? null : window, hint, APP_ID, capabilities,
    quitting: false, launcherReady: options.ready ?? true, rendererFailed: options.rendererFailed ?? false,
    pendingCommand: "show" as Command, recording: false,
    shortcut: { requested: "Ctrl+Space", effective: null, state: "temporarily-unavailable", reason: "Synthetic fixture" },
    nativeTheme: { shouldUseDarkColors: true },
    app: { quit: () => effects.push("quit") },
    publish: () => { effects.push("publish"); published.push(context.fixtureSnapshot!()); },
    fixtureCommand: undefined as undefined | ((request: Command) => void),
    fixtureSnapshot: undefined as undefined | (() => LauncherState),
  };
  runInNewContext(program, context, { timeout: 1000 });
  return { run: (request: Command) => context.fixtureCommand!(request), effects, published, context,
    minimizeQueries: () => minimizeQueries };
}

describe("S0-01 normal X11 command focus candidate, native success unexecuted", () => {
  for (const row of [
    { name: "hidden Show", request: "show", visible: false, minimized: false },
    { name: "hidden toggle", request: "toggle", visible: false, minimized: false },
    { name: "visible Show", request: "show", visible: true, minimized: false },
    { name: "minimized Show", request: "show", visible: false, minimized: true },
    { name: "minimized toggle", request: "toggle", visible: false, minimized: true },
  ] as const) it(`actual command ${row.name} restores if needed, shows once and explicitly focuses once`, () => {
    const fixture = commandFixture(row);
    fixture.run(row.request);
    expect(fixture.effects).toEqual([...(row.minimized ? ["restore"] : []), "show", "focus", "publish"]);
    expect(fixture.minimizeQueries()).toBe(1);
    expect(fixture.published).toHaveLength(1); expect(fixture.published[0]?.visible).toBe(true);
  });

  for (const hint of ["x11", "wayland", "unknown"] as const) it(`actual ${hint} visible toggle only hides, without restore/show/focus`, () => {
    const fixture = commandFixture({ hint, visible: true, minimized: true }); fixture.run("toggle");
    expect(fixture.effects).toEqual(["hide", "publish"]); expect(fixture.minimizeQueries()).toBe(0);
    expect(fixture.published[0]?.visible).toBe(false); expect(fixture.published[0]?.focused).toBe(false);
  });

  for (const hint of ["wayland", "unknown"] as const) it(`actual ${hint} Show and hidden toggle never query minimized state or restore/focus`, () => {
    for (const request of ["show", "toggle"] as const) {
      const fixture = commandFixture({ hint, minimized: true }); fixture.run(request);
      expect(fixture.effects).toEqual(["show", "publish"]); expect(fixture.minimizeQueries()).toBe(0);
      expect(fixture.published[0]?.focused).toBe(false);
    }
  });

  it("actual renderer recovery reloads once before restore/show/focus and clears the failure flag", () => {
    const fixture = commandFixture({ minimized: true, rendererFailed: true }); fixture.run("show");
    expect(fixture.effects).toEqual(["reload", "restore", "show", "focus", "publish"]);
    expect(fixture.context.rendererFailed).toBe(false);
    fixture.run("show");
    expect(fixture.effects).toEqual(["reload", "restore", "show", "focus", "publish", "show", "focus", "publish"]);
  });

  it("actual snapshot keeps X11 focus unavailable when the normal focus call is refused", () => {
    const refused = commandFixture(); refused.run("show");
    expect(refused.effects).toEqual(["show", "focus", "publish"]);
    expect(refused.published[0]?.focused).toBe(false);
    expect(refused.published[0]?.capabilities[0]?.state).toBe("temporarily-unavailable");
    const accepted = commandFixture({ focusAccepted: true }); accepted.run("show");
    expect(accepted.published[0]?.focused).toBe(true);
    expect(accepted.published[0]?.capabilities[0]?.state).toBe("available");
  });

  it("actual quit bypasses readiness and invalid-window paths without show/focus or publication", () => {
    const fixture = commandFixture({ ready: false, absent: true }); fixture.run("quit");
    expect(fixture.effects).toEqual(["quit"]); expect(fixture.context.quitting).toBe(true);
    expect(fixture.published).toEqual([]);
  });

  it("actual not-ready command only updates the pending command", () => {
    const fixture = commandFixture({ ready: false }); fixture.run("toggle");
    expect(fixture.context.pendingCommand).toBe("toggle"); expect(fixture.effects).toEqual([]);
    expect(fixture.minimizeQueries()).toBe(0);
  });

  for (const options of [{ absent: true }, { destroyed: true }]) it("actual absent or destroyed window never receives restore/show/focus", () => {
    const fixture = commandFixture(options); fixture.run("show");
    expect(fixture.effects).toEqual([]); expect(fixture.minimizeQueries()).toBe(0);
  });
});
