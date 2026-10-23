/** Own isolated Electron UI with explicit synthetic focus states; no desktop acceptance. */
import { _electron as electron, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLauncher, spikeRoot } from "../build.ts";
import { APP_URL, capabilities } from "../src/contract.ts";
import type { LauncherState } from "../src/contract.ts";

if (process.env.LINUXCAST_PRIVATE_UI_DISPLAY !== "1" || !process.env.DISPLAY || !process.env.XAUTHORITY)
  throw new Error("Run this check only through its private xvfb-run invocation.");
const root = mkdtempSync(join(tmpdir(), "linuxcast-activation-ui-"));
const profile = mkdtempSync(join(tmpdir(), "linuxcast-launcher-activation-"));
const evidence = join(spikeRoot, "evidence/activation-help/affected-accessibility");
mkdirSync(evidence, { recursive: true });
for (const name of ["home", "runtime", "config", "data", "cache"])
  mkdirSync(join(root, name), { mode: 0o700 });
const sources = ["build.ts", "src/main.ts", "src/contract.ts", "src/preload.ts", "src/renderer/main.tsx", "src/renderer/App.tsx", "src/renderer/style.css", "resources/index.html", "tests/activation-help-ui.ts", "../../docs/design/tokens.json"];
const sourceHashes = () => Object.fromEntries(sources.map((name) => [name, createHash("sha256").update(readFileSync(join(spikeRoot, name))).digest("hex")]));
const before = sourceHashes();
let application: Awaited<ReturnType<typeof electron.launch>> | null = null;
const views: string[] = [];
const axe: { mode: string; appearance: string; view: string; violations: string[] }[] = [];
const displayModes: { mode: string; zoomFactor: number; forcedColors: boolean; reducedMotion: boolean }[] = [];
let sandboxed = false;
let runtimeVersions: Record<string, string> = {};
let stage = "build";
try {
  const main = await buildLauncher();
  stage = "dependency-resolution";
  const require = createRequire(import.meta.url);
  const executable = require("electron") as string;
  const axeSource = readFileSync(createRequire(require.resolve("@axe-core/playwright")).resolve("axe-core/axe.min.js"), "utf8");
  stage = "electron-launch";
  application = await electron.launch({
    executablePath: executable,
    chromiumSandbox: true,
    args: [main],
    env: {
      PATH: "/usr/bin:/bin", TMPDIR: tmpdir(), LANG: "C.UTF-8", LC_ALL: "C.UTF-8",
      HOME: join(root, "home"), XDG_RUNTIME_DIR: join(root, "runtime"),
      XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"), XDG_CACHE_HOME: join(root, "cache"),
      DISPLAY: process.env.DISPLAY, XAUTHORITY: process.env.XAUTHORITY, XDG_SESSION_TYPE: "x11",
      DBUS_SESSION_BUS_ADDRESS: `unix:path=${join(root, "absent-session-bus")}`,
      NO_AT_BRIDGE: "1", PULSE_SERVER: `unix:${join(root, "absent-audio")}`,
      LINUXCAST_LAUNCHER_PROFILE: profile, LINUXCAST_LAUNCHER_SHORTCUT: "Ctrl+Alt+Shift+F12",
    },
    timeout: 20000,
  });
  runtimeVersions = await application.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node }));
  stage = "renderer-ready";
  const page = await application.firstWindow();
  await page.waitForURL(APP_URL);
  await page.getByRole("textbox", { name: "Search commands" }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  stage = "renderer-sandbox";
  const runtime = await page.evaluate(() => ({
    ...window.linuxcast.runtime, node: typeof (globalThis as Record<string, unknown>).require,
    process: typeof (globalThis as Record<string, unknown>).process,
  }));
  expect(runtime).toEqual({ sandboxed: true, contextIsolated: true, node: "undefined", process: "undefined" });
  sandboxed = true;
  stage = "state-and-axe";
  const reply = await page.evaluate(() => window.linuxcast.getState());
  expect(reply.ok).toBe(true);
  if (!reply.ok) throw new Error("OWN_STATE_UNAVAILABLE");
  const baseline = reply.value;
  await page.evaluate(axeSource);
  const audit = async () => page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
    return result.violations.map((v) => v.id);
  });
  // Inject fixed public protocol fixtures into only our own renderer. This is
  // UI state coverage, never a native focus assertion or companion operation.
  async function publish(state: LauncherState) {
    await application!.evaluate(({ BrowserWindow }, value) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length !== 1) throw new Error("OWN_WINDOW_COUNT");
      windows[0]!.webContents.send("launcher:state", value);
    }, state);
  }
  const capture = async (name: string) => {
    const png = await application!.evaluate(async ({ BrowserWindow }, expectedURL) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length !== 1 || windows[0]!.webContents.getURL() !== expectedURL) throw new Error("OWN_CAPTURE_WINDOW");
      const window = windows[0]!;
      const image = await window.webContents.capturePage();
      const size = image.getSize();
      const content = window.getContentSize();
      if (size.width <= 0 || size.height <= 0 || size.width !== content[0] || size.height !== content[1]) throw new Error("OWN_CAPTURE_SIZE");
      return image.toPNG().toString("base64");
    }, APP_URL);
    writeFileSync(join(evidence, name), Buffer.from(png, "base64"));
  };
  for (const mode of ["standard", "200-percent-high-contrast-reduced-motion"] as const) {
    stage = "display-mode";
    const enhanced = mode !== "standard";
    await application.evaluate(({ BrowserWindow }, zoom) => BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(zoom), enhanced ? 2 : 1);
    await page.emulateMedia({ forcedColors: enhanced ? "active" : "none", reducedMotion: enhanced ? "reduce" : "no-preference" });
    const zoomFactor = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor());
    const media = await page.evaluate(() => ({ forcedColors: matchMedia("(forced-colors: active)").matches, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches }));
    expect(zoomFactor).toBe(enhanced ? 2 : 1);
    expect(media).toEqual({ forcedColors: enhanced, reducedMotion: enhanced });
    displayModes.push({ mode, zoomFactor, ...media });
    for (const appearance of ["dark", "light"] as const) {
    stage = "unconfirmed-state";
    await page.evaluate((value) => window.linuxcast.setAppearance(value), appearance);
    await expect(page.locator("main")).toHaveAttribute("data-theme", appearance);
    const pending = { ...baseline, appearance, visible: true, focused: false, capabilities: capabilities("x11", false, true) };
    await publish(pending);
    const notice = page.getByRole("region", { name: "Unconfirmed activation" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("desktop app switcher");
    expect(await page.locator(".content").evaluate(element => element.scrollTop)).toBe(0);
    stage = "notice-horizontal-overflow";
    expect(await page.locator("main").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await capture(`${mode}-${appearance}-unconfirmed.png`);
    views.push(`${mode}-${appearance}-unconfirmed.png`);
    axe.push({ mode, appearance, view: "unconfirmed", violations: await audit() });
    stage = "help-heading-focus";
    const help = notice.getByRole("button", { name: "View activation help" });
    await help.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Launcher capabilities" })).toBeFocused();
    await expect(page.getByText(/none is connected in this prototype/)).toBeVisible();
    stage = "help-details-focus";
    const details = page.getByRole("region", { name: "Launcher capability details" });
    expect(await details.evaluate(element => element.scrollTop)).toBe(0);
    await details.focus();
    await expect(details).toBeFocused();
    stage = "help-horizontal-overflow";
    expect(await details.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    stage = "help-accessibility-style";
    if (enhanced) {
      const rendering = await details.evaluate(element => {
        const style = getComputedStyle(element);
        return { transitionDuration: style.transitionDuration, animationName: style.animationName,
          outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth) };
      });
      expect(rendering.transitionDuration).toBe("0s");
      expect(rendering.animationName).toBe("none");
      expect(rendering.outlineStyle).not.toBe("none");
      expect(rendering.outlineWidth).toBeGreaterThanOrEqual(2);
    }
    await capture(`${mode}-${appearance}-activation-help.png`);
    views.push(`${mode}-${appearance}-activation-help.png`);
    axe.push({ mode, appearance, view: "help", violations: await audit() });
    stage = "help-end-scroll";
    await page.keyboard.press("End");
    await expect.poll(() => details.evaluate((element) => element.scrollHeight <= element.clientHeight || element.scrollTop > 0), { timeout: 2000 }).toBe(true);
    stage = "escape-search";
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox", { name: "Search commands" })).toBeFocused();
    expect(await page.locator(".content").evaluate(element => element.scrollTop)).toBe(0);
    stage = "focus-recovery";
    await publish({ ...pending, focused: true, capabilities: capabilities("x11", true, false) });
    await expect(notice).toHaveCount(0);
    await publish({ ...pending, capabilities: capabilities("x11", false, false) });
    await expect(notice).toHaveCount(0);
  }
  }
  stage = "source-and-audit";
  expect(sourceHashes()).toEqual(before);
  writeFileSync(join(evidence, "accessibility-audit.json"), JSON.stringify({ views: axe, sourceSha256: before, scope: "OWN_SYNTHETIC_UI_ONLY" }, null, 2) + "\n");
  expect(axe).toEqual(axe.map((view) => ({ ...view, violations: [] })));
} catch {
  // Persist only a fixed operational boundary before owned cleanup; raw errors
  // and private environment/process information never enter the public report.
  writeFileSync(join(evidence, "ui-check.json"), JSON.stringify({
    task: "S0-01", status: "incomplete", stage, sourceSha256: before,
    sourceSigned: false, sourceDirty: true, sourceCommit: null,
    views, axe, displayModes, actualGnomeFocusEstablished: false,
    physicalDesktopMatrixEstablished: false, acceptanceClosure: false,
  }, null, 2) + "\n");
  throw new Error("S001_AFFECTED_UI_INCOMPLETE");
} finally {
  if (application) {
    const ownedProcess = application.process();
    await application.close();
    expect(ownedProcess.exitCode !== null || ownedProcess.signalCode !== null).toBe(true);
  }
  rmSync(profile, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
}
writeFileSync(join(evidence, "ui-check.json"), JSON.stringify({
  task: "S0-01", status: "passed", evidenceKind: "real-sandboxed-electron-ui-with-synthetic-focus-states",
  runtimeVersions, sourceSha256: before, sourceSigned: false, sourceDirty: true, sourceCommit: null, display: "private-Xvfb-X11-no-window-manager", sandboxed,
  views, axe, displayModes, parentSearchScrollRestoredAndChildOpenedAtTop: true, keyboardHelpAndEscapeReturn: true, syntheticFocusRecoveryAndLaterBlur: true,
  actualGnomeFocusEstablished: false, physicalDesktopMatrixEstablished: false,
  companionActivationUsed: false, hostDisplaySettingsClipboardInputUsed: false,
  acceptanceClosure: false, ownApplicationClosed: true, ownProfilesRemoved: true,
}, null, 2) + "\n");
console.log("S001_ACTIVATION_HELP_UI_PASSED");
