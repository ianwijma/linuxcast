import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { createRequire } from "node:module";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir, release } from "node:os";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { buildLauncher, spikeRoot } from "../build.ts";
import { APP_ID, APP_URL } from "../src/contract.ts";
const require = createRequire(import.meta.url);
const executable = require("electron") as string;
const evidence = join(spikeRoot, "evidence");
let main: string;
let app: ElectronApplication | null = null;
let profile = "";
beforeAll(async () => {
  mkdirSync(evidence, { recursive: true });
  main = await buildLauncher();
}, 30000);
afterEach(async () => {
  if (app) {
    await app.close().catch(() => undefined);
    app = null;
  }
  if (profile) rmSync(profile, { recursive: true, force: true });
});
async function launch(shortcut = "Ctrl+Alt+Shift+F12") {
  if (process.env.XDG_SESSION_TYPE !== "x11" || !process.env.DISPLAY)
    throw new Error(
      "S0-01 real-session suite requires an available X11 desktop; no headless/Wayland success is inferred.",
    );
  profile = mkdtempSync(join(tmpdir(), "linuxcast-launcher-integration-"));
  app = await electron.launch({
    chromiumSandbox: true,
    executablePath: executable,
    args: [main],
    env: {
      ...process.env,
      LINUXCAST_LAUNCHER_PROFILE: profile,
      LINUXCAST_LAUNCHER_SHORTCUT: shortcut,
    },
    timeout: 20000,
  });
  const page = await app.firstWindow();
  await page.waitForURL(APP_URL);
  await page.getByRole("textbox", { name: "Search commands" }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function cli(command: string) {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(executable, [main, command], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: undefined,
        LINUXCAST_LAUNCHER_PROFILE: profile,
      },
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
async function capture(page: Page, name: string) {
  let previous = "";
  let stable = 0;
  await expect
    .poll(
      async () => {
        const bounds = await app!.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.getContentBounds(),
        );
        const current = JSON.stringify(bounds);
        stable = current === previous ? stable + 1 : 0;
        previous = current;
        return stable;
      },
      { interval: 100 },
    )
    .toBeGreaterThanOrEqual(3);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const png = await app!.evaluate(async ({ BrowserWindow }) => {
    const image =
      await BrowserWindow.getAllWindows()[0]!.webContents.capturePage();
    return image.toPNG().toString("base64");
  });
  writeFileSync(join(evidence, name), Buffer.from(png, "base64"));
}
describe("S0-01 GNOME X11 disposable Electron launcher", () => {
  it("starts with strict sandbox identity and effective shortcut", async () => {
    const page = await launch();
    expect(
      await page.evaluate(() => ({
        node: typeof (window as unknown as { require?: unknown }).require,
        process: typeof (window as unknown as { process?: unknown }).process,
        bridge: Object.keys(window.linuxcast).sort(),
        runtime: window.linuxcast.runtime,
      })),
    ).toMatchObject({
      node: "undefined",
      process: "undefined",
      runtime: { sandboxed: true, contextIsolated: true },
    });
    const state = await page.evaluate(() => window.linuxcast.getState());
    expect(state.ok).toBe(true);
    if (state.ok) {
      expect(state.value.identity).toBe(APP_ID);
      expect(state.value.shortcut.effective).toBe("Ctrl+Alt+Shift+F12");
    }
    const metadata = await app!.evaluate(
      async ({ app, BrowserWindow, screen }) => {
        const info = await app.getGPUInfo("basic");
        const devices =
          (
            info as {
              gpuDevice?: {
                vendorId?: number;
                deviceId?: number;
                active?: boolean;
              }[];
            }
          ).gpuDevice ?? [];
        return {
          version: process.versions.electron,
          chrome: process.versions.chrome,
          embeddedNode: process.versions.node,
          name: app.name,
          noSandboxFlag: app.commandLine.hasSwitch("no-sandbox"),
          unsafeSandboxArgument: process.argv.includes("--no-sandbox"),
          focused: BrowserWindow.getAllWindows()[0]!.isFocused(),
          scaleFactor: screen.getPrimaryDisplay().scaleFactor,
          gpu: devices.map((device) => ({
            vendorId: device.vendorId,
            deviceId: device.deviceId,
            active: device.active,
          })),
        };
      },
    );
    expect(metadata.noSandboxFlag).toBe(false);
    expect(metadata.unsafeSandboxArgument).toBe(false);
    writeFileSync(
      join(evidence, "platform.json"),
      JSON.stringify(
        {
          scope: "real Pop!_OS GNOME X11 session only",
          kernel: release(),
          distro: "Pop!_OS 22.04 LTS",
          desktop: "GNOME Shell 42.9",
          backend: "native X11 via Electron",
          packages: execFileSync(
            "dpkg-query",
            [
              "-W",
              "-f=${Package} ${Version}\n",
              "xdg-desktop-portal",
              "xdg-desktop-portal-gnome",
              "at-spi2-core",
              "orca",
            ],
            { encoding: "utf8", timeout: 5000 },
          )
            .trim()
            .split("\n"),
          ...metadata,
          limitations: [
            "Debian13 GNOME48 Wayland untested",
            "Debian13 GNOME X11 untested",
            "Debian13 Plasma6.3 Wayland and X11 untested",
          ],
        },
        null,
        2,
      ) + "\n",
    );
  }, 30000);
});

describe("S0-01 lifecycle, native activation and renderer boundaries", () => {
  it("S0-01-AC02 retains the resident singleton on close and reopens through CLI before explicit Quit exits", async () => {
    const page = await launch();
    const child = app!.process();
    const pid = child.pid;
    await app!.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.close(),
    );
    await expect
      .poll(async () =>
        app!.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.isVisible(),
        ),
      )
      .toBe(false);
    expect(app!.process().exitCode).toBe(null);
    expect(process.kill(pid!, 0)).toBe(true);
    expect(await cli("--show")).toBe(0);
    await expect
      .poll(async () =>
        app!.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.isVisible(),
        ),
      )
      .toBe(true);
    expect(app!.process().pid).toBe(pid);
    await page.getByRole("textbox", { name: "Search commands" }).waitFor();
    const exited = new Promise<void>((resolve) =>
      app!.once("close", () => resolve()),
    );
    await page
      .getByRole("button", { name: "Quit Linuxcast", exact: false })
      .click();
    await exited;
    expect(child.exitCode).toBe(0);
  }, 30000);
  it("validates native WM_CLASS and regains GNOME X11 focus through the registered shortcut from a synthetic decoy", async () => {
    const page = await launch();
    const identities = await app!.evaluate(async ({ BrowserWindow }) => {
      const primary = BrowserWindow.getAllWindows()[0]!;
      const decoy = new BrowserWindow({
        width: 400,
        height: 240,
        title: "Linuxcast synthetic focus destination",
        webPreferences: {
          partition: "synthetic-focus-decoy",
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
        },
      });
      await decoy.loadURL(
        "data:text/html,<title>Synthetic focus destination</title><h1>Linuxcast synthetic focus destination</h1>",
      );
      decoy.show();
      return {
        primary: primary.getNativeWindowHandle().readUInt32LE(0),
        decoy: decoy.getNativeWindowHandle().readUInt32LE(0),
        bounds: primary.getBounds(),
      };
    });
    const identity = execFileSync(
      "xprop",
      ["-id", String(identities.primary), "WM_CLASS"],
      { encoding: "utf8" },
    );
    expect(identity).toContain(`"${APP_ID}"`);
    execFileSync("xdotool", [
      "windowactivate",
      "--sync",
      String(identities.decoy),
    ]);
    expect(
      execFileSync("xprop", ["-root", "_NET_ACTIVE_WINDOW"], {
        encoding: "utf8",
      }).toLowerCase(),
    ).toContain(`0x${identities.decoy.toString(16)}`);
    // Hide via singleton before triggering a real X11 global shortcut. No raw devices or private windows are inspected.
    expect(await cli("--toggle")).toBe(0);
    execFileSync("xdotool", ["key", "ctrl+alt+shift+F12"]);
    await expect
      .poll(async () =>
        app!.evaluate(
          ({ BrowserWindow }, id) =>
            BrowserWindow.getAllWindows()
              .find((w) => w.getNativeWindowHandle().readUInt32LE(0) === id)!
              .isFocused(),
          identities.primary,
        ),
      )
      .toBe(true);
    expect(
      execFileSync("xprop", ["-root", "_NET_ACTIVE_WINDOW"], {
        encoding: "utf8",
      }).toLowerCase(),
    ).toContain(`0x${identities.primary.toString(16)}`);
    writeFileSync(
      join(evidence, "x11-activation.json"),
      JSON.stringify(
        {
          session: "Pop!_OS22.04 GNOME42.9 X11",
          identity: APP_ID,
          wmClassMatched: true,
          shortcut: "Ctrl+Alt+Shift+F12",
          decoyFocusObserved: true,
          shortcutActivationFocused: true,
          placement: identities.bounds,
          nativeWayland:
            "not exercised; matching companion or validated activation path required",
        },
        null,
        2,
      ) + "\n",
    );
    await capture(page, "x11-dark-ready.png");
  }, 30000);
  it("reports a real shortcut conflict preserves the existing key and recovers after release", async () => {
    const page = await launch();
    const blockerProfile = mkdtempSync(
      join(tmpdir(), "linuxcast-launcher-conflict-"),
    );
    const blocker = await electron.launch({
      chromiumSandbox: true,
      executablePath: executable,
      args: [main],
      env: {
        ...process.env,
        LINUXCAST_LAUNCHER_PROFILE: blockerProfile,
        LINUXCAST_LAUNCHER_SHORTCUT: "Ctrl+Alt+Shift+F11",
      },
    });
    try {
      const blockerPage = await blocker.firstWindow();
      await blockerPage
        .getByRole("textbox", { name: "Search commands" })
        .waitFor();
      await expect
        .poll(async () => {
          const reply = await blockerPage.evaluate(() =>
            window.linuxcast.getState(),
          );
          return reply.ok ? reply.value.shortcut.effective : null;
        })
        .toBe("Ctrl+Alt+Shift+F11");
      const blocked = await page.evaluate(() =>
        window.linuxcast.setShortcut("Ctrl+Alt+Shift+F11"),
      );
      expect(blocked.ok).toBe(true);
      if (blocked.ok) {
        expect(blocked.value.state).toBe("temporarily-unavailable");
        expect(blocked.value.effective).toBe("Ctrl+Alt+Shift+F12");
      }
      await capture(page, "x11-shortcut-conflict.png");
      const pageBlocker = await blocker.firstWindow();
      const blockerState = await pageBlocker.evaluate(() =>
        window.linuxcast.getState(),
      );
      expect(blockerState.ok).toBe(true);
      if (blockerState.ok)
        expect(blockerState.value.shortcut.effective).toBe(
          "Ctrl+Alt+Shift+F11",
        );
      await blocker.close();
      const recovered = await page.evaluate(() =>
        window.linuxcast.setShortcut("Ctrl+Alt+Shift+F11"),
      );
      expect(recovered.ok).toBe(true);
      if (recovered.ok) {
        expect(recovered.value.state).toBe("available");
        expect(recovered.value.effective).toBe("Ctrl+Alt+Shift+F11");
      }
      const restored = await page.evaluate(() =>
        window.linuxcast.setShortcut("Ctrl+Alt+Shift+F12"),
      );
      expect(restored.ok).toBe(true);
      if (restored.ok) expect(restored.value.state).toBe("available");
    } finally {
      await blocker.close().catch(() => undefined);
      rmSync(blockerProfile, { recursive: true, force: true });
    }
  }, 30000);
  it("denies foreign renderer frames unknown protocol fields navigation popups network and sensitive permissions", async () => {
    const page = await launch();
    const invalid = await page.evaluate(() =>
      window.linuxcast.setShortcut("private-canary"),
    );
    expect(invalid).toEqual({
      ok: false,
      error: {
        code: "invalid-request",
        message: "Unsupported launcher request.",
      },
    });
    const foreign = await app!.evaluate(
      async ({ BrowserWindow }, preload) => {
        const frame = new BrowserWindow({
          show: false,
          webPreferences: {
            preload,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        });
        await frame.loadURL("linuxcast://launcher/index.html");
        const reply = await frame.webContents.executeJavaScript(
          "window.linuxcast.getState()",
        );
        frame.destroy();
        return reply;
      },
      join(spikeRoot, "dist/preload.cjs"),
    );
    expect(foreign).toEqual({
      ok: false,
      error: {
        code: "permission-denied",
        message: "This launcher frame is not authorized.",
      },
    });
    const status = await page.evaluate(async () => {
      const requests = await Promise.all([
        fetch("https://example.org/")
          .then(() => true)
          .catch(() => false),
        fetch("file:///etc/passwd")
          .then(() => true)
          .catch(() => false),
      ]);
      window.open("https://example.org/");
      return requests;
    });
    expect(status).toEqual([false, false]);
    await page.evaluate(() => {
      window.location.href = "https://example.org/";
    });
    await expect.poll(() => page.url()).toBe(APP_URL);
    expect((await app!.windows()).length).toBe(1);
    expect(await page.evaluate(() => Notification.requestPermission())).toBe(
      "denied",
    );
    const assets = await app!.evaluate(async ({ net }) => {
      const results = [];
      for (const target of [
        "linuxcast://launcher/../../etc/passwd",
        "linuxcast://launcher/%2e%2e/%2e%2e/etc/passwd",
        "linuxcast://other/index.html",
        "linuxcast://launcher/index.html?private-canary",
      ]) {
        try {
          const response = await net.fetch(target);
          results.push(response.status);
        } catch {
          results.push("blocked");
        }
      }
      return results;
    });
    expect(assets.every((code) => code === 404 || code === "blocked")).toBe(
      true,
    );
  }, 30000);
  it("supports keyboard navigation layered Escape action focus and explicit shortcut recorder cancellation", async () => {
    const page = await launch();
    await page.getByRole("textbox", { name: "Search commands" }).focus();
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog", { name: "Launcher actions" }).waitFor();
    await expect
      .poll(async () =>
        page
          .getByRole("button", { name: "Hide launcher", exact: true })
          .last()
          .evaluate((el) => el === document.activeElement),
      )
      .toBe(true);
    await page.keyboard.press("Escape");
    expect(
      await page.getByRole("dialog", { name: "Launcher actions" }).count(),
    ).toBe(0);
    expect(
      await page
        .getByRole("button", { name: "Actions Ctrl K" })
        .evaluate((el) => el === document.activeElement),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Change session shortcut", exact: false })
      .click();
    await page
      .getByRole("button", { name: "Record shortcut", exact: true })
      .click();
    await expect
      .poll(async () =>
        page.getByRole("button", { name: "Listening for a shortcut…" }).count(),
      )
      .toBe(1);
    await page.keyboard.press("Control+Alt+Shift+F10");
    await page
      .getByRole("button", { name: "Apply shortcut", exact: true })
      .waitFor();
    await expect
      .poll(async () =>
        page
          .getByRole("button", { name: "Apply shortcut", exact: true })
          .isEnabled(),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Cancel shortcut change" }).click();
    const state = await page.evaluate(() => window.linuxcast.getState());
    expect(state.ok).toBe(true);
    if (state.ok) {
      expect(state.value.shortcut.effective).toBe("Ctrl+Alt+Shift+F12");
      expect(state.value.recording).toBe(false);
    }
    await capture(page, "x11-shortcut-cancelled.png");
    await page.keyboard.press("Escape");
    await page.getByRole("textbox", { name: "Search commands" }).waitFor();
    await page.keyboard.press("Escape");
    await expect
      .poll(async () =>
        app!.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.isVisible(),
        ),
      )
      .toBe(false);
  }, 30000);
  it("renders dark/light empty capabilities and action states with zero automated AA violations and no external requests", async () => {
    const page = await launch();
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    for (const theme of ["dark", "light"] as const) {
      await page.evaluate(
        (appearance) => window.linuxcast.setAppearance(appearance),
        theme,
      );
      await page.locator(`main[data-theme=${theme}]`).waitFor();
      await page.evaluate(
        readFileSync(
          createRequire(require.resolve("@axe-core/playwright")).resolve(
            "axe-core/axe.min.js",
          ),
          "utf8",
        ),
      );
      const result = await page.evaluate(() =>
        (
          window as unknown as {
            axe: {
              run: (
                context: Document,
                options: unknown,
              ) => Promise<{ violations: unknown[] }>;
            };
          }
        ).axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        }),
      );
      expect(result.violations).toEqual([]);
      await capture(page, `x11-${theme}-ready.png`);
    }
    await page
      .getByRole("textbox", { name: "Search commands" })
      .fill("synthetic-no-results");
    await page.getByRole("heading", { name: "No matching commands" }).waitFor();
    await capture(page, "x11-light-empty.png");
    await page.getByRole("textbox", { name: "Search commands" }).fill("");
    await page
      .getByRole("button", { name: "Launcher capabilities", exact: false })
      .click();
    await capture(page, "x11-light-capabilities.png");
    await page.getByRole("button", { name: "Back to commands" }).click();
    await page.getByRole("button", { name: "Actions Ctrl K" }).click();
    await page.getByRole("dialog", { name: "Launcher actions" }).waitFor();
    await capture(page, "x11-light-actions.png");
    expect(
      requests.every((url) => url.startsWith("linuxcast://launcher/")),
    ).toBe(true);
  }, 30000);
  it("recovers a crashed renderer only on explicit reopening with sandbox settings intact", async () => {
    await launch();
    await app!.evaluate(({ BrowserWindow }) => {
      const primary = BrowserWindow.getAllWindows()[0]!;
      primary.webContents.forcefullyCrashRenderer();
      primary.hide();
    });
    await expect
      .poll(async () =>
        app!.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.webContents.isCrashed(),
        ),
      )
      .toBe(true);
    expect(await cli("--show")).toBe(0);
    await expect
      .poll(async () =>
        app!.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScript(
            '!!window.linuxcast && !!document.querySelector("input")',
          ),
        ),
      )
      .toBe(true);
    expect(
      await app!.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScript(
          "window.linuxcast.runtime",
        ),
      ),
    ).toEqual({ sandboxed: true, contextIsolated: true });
  }, 30000);
});

describe("S0-01 actual Electron presentation geometry", () => {
  it("uses compact host rows content sizing and keyboard controls at 200% zoom with emulated high contrast and reduced motion", async () => {
    const page = await launch();
    const row = await page
      .getByRole("button", { name: "Launcher capabilities", exact: true })
      .boundingBox();
    expect(row!.height).toBeGreaterThanOrEqual(40);
    expect(row!.height).toBeLessThanOrEqual(41);
    const geometry = await app!.evaluate(({ BrowserWindow, screen }) => {
      const bounds = BrowserWindow.getAllWindows()[0]!.getBounds();
      const area = screen.getDisplayMatching(bounds).workArea;
      return { bounds, area };
    });
    expect(geometry.bounds.width).toBeLessThanOrEqual(720);
    expect(geometry.bounds.height).toBeLessThanOrEqual(560);
    expect(geometry.bounds.x).toBeGreaterThanOrEqual(geometry.area.x);
    expect(geometry.bounds.y).toBeGreaterThanOrEqual(geometry.area.y);
    expect(geometry.bounds.x + geometry.bounds.width).toBeLessThanOrEqual(
      geometry.area.x + geometry.area.width,
    );
    expect(geometry.bounds.y + geometry.bounds.height).toBeLessThanOrEqual(
      geometry.area.y + geometry.area.height,
    );
    await app!.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(2),
    );
    await page.emulateMedia({
      forcedColors: "active",
      reducedMotion: "reduce",
    });
    await page
      .getByRole("textbox", { name: "Search commands" })
      .fill("例文 · مثال");
    await page.getByRole("heading", { name: "No matching commands" }).waitFor();
    expect(
      await page
        .locator("main")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog", { name: "Launcher actions" }).waitFor();
    const panel = page.getByRole("dialog", { name: "Launcher actions" });
    const panelBounds = await panel.boundingBox();
    const viewport = await page.evaluate(() => ({
      height: innerHeight,
      width: innerWidth,
    }));
    expect(panelBounds!.y).toBeGreaterThanOrEqual(0);
    expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(
      viewport.width,
    );
    expect(panelBounds!.y + panelBounds!.height).toBeLessThanOrEqual(
      viewport.height,
    );
    await panel.getByRole("button", { name: /Close actions/ }).focus();
    await expect
      .poll(() =>
        panel
          .getByRole("button", { name: /Close actions/ })
          .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
      )
      .toBe(true);
    await capture(page, "x11-zoom-200-forced-colors.png");
    await page.keyboard.press("Escape");
    expect(
      await page.getByRole("dialog", { name: "Launcher actions" }).count(),
    ).toBe(0);
  }, 30000);
});

describe("S0-01 hidden resident CLI recovery", () => {
  it("routes explicit --quit to the hidden singleton without showing another window", async () => {
    await launch();
    const child = app!.process();
    await app!.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.close(),
    );
    await expect
      .poll(async () =>
        app!.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.isVisible(),
        ),
      )
      .toBe(false);
    const exited = new Promise<void>((resolve) =>
      app!.once("close", () => resolve()),
    );
    expect(await cli("--quit")).toBe(0);
    await exited;
    expect(child.exitCode).toBe(0);
  }, 30000);
});
