import { describe, expect, it } from "vitest";
import { mkdtempSync, chmodSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseCommand,
  parseInstanceData,
  isRequest,
  normalizeShortcut,
  sessionHint,
  capabilities,
} from "../src/contract.ts";
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
