// Separate diagnostic: this does not replace the integration acceptance check.
import { _electron as electron, type ElectronApplication } from "@playwright/test";
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { buildLauncher, spikeRoot } from "../build.ts";
import { APP_ID, APP_URL } from "../src/contract.ts";

const shortcut = "Ctrl+Alt+Shift+F12";
const executable = createRequire(import.meta.url)("electron") as string;
type Stage = "decoy-active-before-cli" | "hidden-decoy-active-before-chord" | "after-single-chord" | "final";
type Active = "primary" | "decoy" | "other";
type OwnState = {
  primaryVisible: boolean;
  primaryFocused: boolean;
  decoyVisible: boolean;
  decoyFocused: boolean;
  shortcutRegistered: boolean;
  primaryHideObserved: boolean;
  primaryShowObserved: boolean;
  primaryFocusObserved: boolean;
};
type Observation = OwnState & { stage: Stage; rootActive: Active };
type Tracker = {
  primaryHideObserved: boolean;
  primaryShowObserved: boolean;
  primaryFocusObserved: boolean;
};

async function diagnose() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--wait-hidden"))
    throw new Error("FIXED_DIAGNOSTIC_VARIANT_REQUIRED");
  const waitHidden = args[0] === "--wait-hidden";
  if (process.env.XDG_SESSION_TYPE !== "x11" || !process.env.DISPLAY)
    throw new Error("X11_SESSION_REQUIRED");
  const main = await buildLauncher();
  const profile = mkdtempSync(join(tmpdir(), "linuxcast-launcher-focus-diagnostic-"));
  const observations: Observation[] = [];
  let app: ElectronApplication | undefined;
  let cliExitedSuccessfully = false;
  let oneChordSent = false;
  let wmClassMatched = false;
  let outcome: "focused" | "not-focused" | "diagnostic-error" = "diagnostic-error";
  let cleanupCompleted = false;
  try {
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
    const ids = await app.evaluate(async ({ BrowserWindow }) => {
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
      const tracker: Tracker = {
        primaryHideObserved: false,
        primaryShowObserved: false,
        primaryFocusObserved: false,
      };
      (globalThis as unknown as { linuxcastFocusDiagnostic: Tracker })
        .linuxcastFocusDiagnostic = tracker;
      primary.on("hide", () => { tracker.primaryHideObserved = true; });
      primary.on("show", () => { tracker.primaryShowObserved = true; });
      primary.on("focus", () => { tracker.primaryFocusObserved = true; });
      return {
        primary: primary.getNativeWindowHandle().readUInt32LE(0),
        decoy: decoy.getNativeWindowHandle().readUInt32LE(0),
      };
    });
    // Native IDs stay in memory. Never persist root properties or window titles.
    const rootActive = (): Active => {
      const raw = execFileSync("xprop", ["-root", "_NET_ACTIVE_WINDOW"], {
        encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"],
      });
      const match = raw.match(/window id # (0x[0-9a-f]+)/i);
      const active = match ? Number.parseInt(match[1]!, 16) : 0;
      return active === ids.primary ? "primary" : active === ids.decoy ? "decoy" : "other";
    };
    const ownState = async (): Promise<OwnState> => await app!.evaluate(
      ({ BrowserWindow, globalShortcut }, { ids, shortcut }) => {
        const windows = BrowserWindow.getAllWindows();
        const primary = windows.find((w) => w.getNativeWindowHandle().readUInt32LE(0) === ids.primary)!;
        const decoy = windows.find((w) => w.getNativeWindowHandle().readUInt32LE(0) === ids.decoy)!;
        const tracker = (globalThis as unknown as { linuxcastFocusDiagnostic: Tracker }).linuxcastFocusDiagnostic;
        return {
          primaryVisible: primary.isVisible(), primaryFocused: primary.isFocused(),
          decoyVisible: decoy.isVisible(), decoyFocused: decoy.isFocused(),
          shortcutRegistered: globalShortcut.isRegistered(shortcut),
          primaryHideObserved: tracker.primaryHideObserved,
          primaryShowObserved: tracker.primaryShowObserved,
          primaryFocusObserved: tracker.primaryFocusObserved,
        };
      }, { ids, shortcut },
    );
    const observe = async (stage: Stage) => {
      const state = await ownState();
      observations.push({ stage, ...state, rootActive: rootActive() });
      return state;
    };
    const identity = execFileSync("xprop", ["-id", String(ids.primary), "WM_CLASS"], {
      encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"],
    });
    wmClassMatched = identity.includes(`"${APP_ID}"`);
    if (!wmClassMatched) throw new Error("OWN_IDENTITY_REQUIRED");
    execFileSync("xdotool", ["windowactivate", "--sync", String(ids.decoy)], {
      timeout: 5000, stdio: "ignore",
    });
    if (rootActive() !== "decoy") throw new Error("DECOY_FOCUS_REQUIRED");
    await observe("decoy-active-before-cli");
    const code = await new Promise<number>((resolve, reject) => {
      const child = spawn(executable, [main, "--toggle"], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, LINUXCAST_LAUNCHER_PROFILE: profile },
        stdio: "ignore",
      });
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("CLI_DEADLINE")); }, 10000);
      child.once("error", () => { clearTimeout(timer); reject(new Error("CLI_START_FAILED")); });
      child.once("exit", (status) => { clearTimeout(timer); resolve(status ?? 1); });
    });
    cliExitedSuccessfully = code === 0;
    if (!cliExitedSuccessfully) throw new Error("CLI_EXIT_FAILED");
    if (waitHidden) {
      const deadline = performance.now() + 5000;
      let state = await ownState();
      while ((state.primaryVisible || !state.decoyFocused || rootActive() !== "decoy") && performance.now() < deadline) {
        await delay(100);
        state = await ownState();
      }
      if (state.primaryVisible || !state.decoyFocused || rootActive() !== "decoy")
        throw new Error("HIDDEN_DECOY_ACTIVE_REQUIRED");
      await observe("hidden-decoy-active-before-chord");
    }
    // Preserve the failing test's exact CLI-return -> single-chord ordering.
    // No snapshot, focus wait, modifier cleanup, retry or IPC call goes here.
    execFileSync("xdotool", ["key", "ctrl+alt+shift+F12"], { timeout: 5000, stdio: "ignore" });
    oneChordSent = true;
    let current = await observe("after-single-chord");
    const deadline = performance.now() + 5000;
    while (!current.primaryFocused && performance.now() < deadline) {
      await delay(100);
      current = await ownState();
    }
    current = await observe("final");
    outcome = current.primaryFocused ? "focused" : "not-focused";
  } catch {
    // Private process/command diagnostics must not enter the public artifact.
    outcome = "diagnostic-error";
  } finally {
    if (app) await app.close().then(() => { cleanupCompleted = true; }).catch(() => undefined);
    else cleanupCompleted = true;
    if (cleanupCompleted) rmSync(profile, { recursive: true, force: true });
    const evidence = join(spikeRoot, "evidence/focus-diagnostic", waitHidden ? "hidden-before-chord" : "original-sequence");
    mkdirSync(evidence, { recursive: true });
    writeFileSync(join(evidence, "report.json"), JSON.stringify({
      scope: "Pop!_OS22.04 GNOME42.9 X11 own-window diagnostic only",
      originalSequencePreserved: !waitHidden,
      wmClassMatched, cliExitedSuccessfully, oneChordSent, cleanupCompleted,
      outcome, observations,
      acceptanceEstablished: false,
    }, null, 2) + "\n");
  }
  if (outcome === "diagnostic-error" || !cleanupCompleted) process.exitCode = 2;
}
await diagnose();
