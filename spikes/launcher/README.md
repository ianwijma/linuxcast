# S0-01 launcher feasibility

A disposable Electron 45 launcher implementing the bounded [S0-01 task](../../docs/implementation/tasks/S0-01.md). This is an implementation and evidence spike, not the production launcher, shared contracts, package, desktop companion or completed Debian desktop matrix.

The host uses the fixed `io.github.ianwijma.Linuxcast` identity before readiness and ships the matching desktop-entry template. It requests the selected global shortcut only after app readiness, reports actual X11 registration or a conflict/denial, retains an existing binding if a replacement fails, and unregisters on Quit. Default `Alt+Space` is requested only through the normal backend; a reserved key never causes desktop preferences to change. The visible recorder operates only while its own control is focused and suspends this application's shortcut handling during recording. Cancellation and focus loss resume it.

Closing/dismissing hides the window and retains one resident process. `--show`, `--toggle`, and `--quit` are parsed as bounded data and routed to the singleton through Electron's single-instance mechanism. There is no shell evaluation, arbitrary command, URL execution, autostart or tray dependency. Explicit Quit exits and releases shortcut grabs. A crashed renderer is reloaded only on explicit reopening.

## Run and validation

Use the repository's exact Node 24.22.1/Bun 1.4.4 development runtimes, frozen dependencies and explicit `bun run setup:electron` installer. The root coordinator owns manifests, lockfile, test maps, dependency inventory and task status.

```sh
bun run typecheck
bun run lint
bun run test:unit -- S0-01
bun run test:integration -- S0-01
spikes/launcher/linuxcast --show
spikes/launcher/linuxcast --toggle
spikes/launcher/linuxcast --quit
```

The wrapper requires Node 24 in PATH and builds the prototype with the pinned esbuild before launch. It is not installed into the user's PATH or desktop. For a manual disposable session, `LINUXCAST_LAUNCHER_PROFILE` may select a private directory beginning with `linuxcast-launcher-` under the system temporary directory. The default is a per-UID temporary profile, completely separate from production Linuxcast data. Symlink, foreign-owned and nonprivate profiles are rejected. `LINUXCAST_LAUNCHER_SHORTCUT` accepts the same bounded shortcut grammar as the recorder; test runs choose a temporary unreserved key. These variables are trusted launch configuration, never renderer inputs. No credentials or user content are required.

The integration suite requires the authorized real GNOME X11 session (`DISPLAY=:1` here), XTest tooling, Electron's working Chromium sandbox, and a local display. It fails if the required session is unavailable; there is no headless fallback or skipped success. Playwright is explicitly configured with `chromiumSandbox: true`; tests assert both the absence of `--no-sandbox` in actual process arguments and the renderer's actual sandbox/context-isolation flags. Normal application launch has no inspector/debugging flags. The packaged client must not depend on this development wrapper or a developer Node runtime.

## Trust and capability boundaries

- Renderer: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, web security enabled, no webviews or Node in workers/subframes. Actual renderer checks see no `require` or `process`.
- Preload: named state, hide, quit, appearance, shortcut/recording and bounded content-height methods only. No generic IPC channel, filesystem, process, URL, credential or external-network method is exposed. Main validates payload version/fields, sending WebContents, exact main frame and exact packaged URL on every call.
- Resources: fixed custom-protocol asset manifest, no arbitrary paths, remote scripts or `unsafe-eval`. CSP denies renderer network, frames, objects and form submission; navigation, new windows, downloads and permissions are denied. Malformed CLI/IPC diagnostics contain only safe fixed messages/codes.
- X11: the current source candidate restores a minimized window, issues one normal `show()` and one explicit `focus()` per Show or toggle-to-visible request. Native focus is still observed through Electron and the compositor; the candidate is **not natively executed or proven**. Bounds are initially requested within the primary work area; content-height updates are validated/clamped to the current work area and canonical maximum. The window manager may adjust placement. This does not prove every X11 desktop/session.
- Native Wayland: the application explicitly selects the native Wayland backend when that session is identified. It never changes to XWayland as a fallback, loops focus/position calls, or enforces always-on-top. Focus and placement remain **component-required** until a supported activation/companion path is validated. Normal desktop opening/activation is the visible fallback. The GNOME 48 or Plasma 6.3 companion must be enabled separately in the full client; this spike neither installs nor enables one.
- Wayland shortcut readback: Electron 45 reports registration, but exposes no portal-selected effective accelerator. The prototype reports the requested key separately and displays “Managed by desktop” plus consent/settings guidance, never inventing the effective binding. Real portal allow/deny/cancel/rebind testing remains outstanding.

The local types and provisional host UI inform F0-01/D1. They are not exported as production contracts or completed shared primitives. Search filters only the listed feasibility commands; app/file search, commands/extensions and external effects are not simulated.

## Design and evidence

Applicable [DESIGN.md](../../docs/design/DESIGN.md) sections: Tokens; Shell and navigation; Results and actions; States and motion; Accessibility; Review gate. All roles, typography, spacing, radii, row/header/footer sizes and action-panel width derive from the canonical [tokens](../../docs/design/tokens.json). Host-owned icon-leading rows use neutral selection, visible focus and complete accessible names. The launcher has an opaque fallback, scrollable content, content-driven sizing up to 560 px, a local action panel, layered Escape, keyboard row navigation and an explicit shortcut recorder. Text caret behavior remains native in the search input.

Inter 400/600 and JetBrains Mono 400 load from pinned local Fontsource packages (SIL OFL 1.1; copies in `licenses/`). There are no remote font or image requests. The prompt mark is original simple text, not a proprietary logo.

Executed 2026-10-23 on **Pop!\_OS 22.04 amd64, GNOME Shell 42.9, native X11**, Linux 7.1.1-76070101-generic; development Node 24.22.1/Bun 1.4.4; Electron 45.0.0 with Chromium 156.0.8078.48. [Platform metadata](evidence/platform.json) records actual runtime/sandbox, GPU, scale and installed portal/AT package versions. [Native activation evidence](evidence/x11-activation.json) records only the synthetic windows' result, identity and geometry. These checks are real host evidence and **do not establish Debian 13, GNOME 48, Plasma 6.3 or native Wayland acceptance**.

The scoped unit suite executes eight checks, including explicitly labelled synthetic loading, permission-denied/retry, missing-preload recovery and Wayland component fixtures. The real Electron integration suite executes ten checks. Fixtures never claim successful native operations. Typecheck and lint pass. The acceptance mapping is:

| Criterion     | Verified evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Outstanding scope                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0-01-AC01    | Native X11 WM_CLASS equals the fixed desktop identity. A synthetic decoy becomes active; a real XTest global shortcut reopens the hidden launcher and GNOME reports its X11 window active/focused. Source and deterministic fixtures expose the specified native Wayland component requirement without force-focus/placement fallback.                                                                                                                             | Native Wayland activation and required component/portal behavior have not been exercised. Every required Debian desktop matrix entry remains untested.                                                                                                    |
| S0-01-AC02    | Closing retains the live resident process; `--show` reopens the same PID. UI Quit exits. `--quit` reaches a hidden resident without opening another window. Real shortcut conflict preserves the old key and recovers after the competing synthetic app exits. Renderer crash recovery preserves sandbox flags.                                                                                                                                                    | Repeat the lifecycle checks in the required target matrix.                                                                                                                                                                                                |
| S0-01-UI      | Actual Electron dark/light axe WCAG A/AA checks report zero violations; keyboard navigation, action-panel Escape/focus restoration, nested back navigation, recorder cancellation, filtered-empty states, actual shortcut conflict, and content sizing are exercised. Actual Electron 200% zoom with emulated forced-colors/reduced-motion remains keyboard-operable using synthetic CJK/RTL query text. Unit fixtures cover pending/error/retry/component states. | Actual Debian Orca48 native-focus/generated-presentation/per-label speech-delivery checks pass5/5 on private Xvfb (evidence below). Audible/tactile quality and target-session accessibility remain unverified. Emulated media is not a changed/tested GNOME accessibility setting. |
| S0-01-PRIVACY | All fixture inputs and command labels are public synthetic data; no private windows, clipboard, files or typed streams are read. Screenshots capture only the prototype's own renderer. Foreign-frame requests, invalid private canaries, protocol traversal, external fetch/navigation/popups and notifications are rejected; diagnostics never echo the seeded marker.                                                                                           | Independent review of the final evidence/source remains coordinator-owned.                                                                                                                                                                                |

Screenshots, all from the synthetic Electron app: [dark](evidence/x11-dark-ready.png), [light](evidence/x11-light-ready.png), [real shortcut conflict](evidence/x11-shortcut-conflict.png), [filtered empty](evidence/x11-light-empty.png), [capability diagnostics](evidence/x11-light-capabilities.png), [actions](evidence/x11-light-actions.png), [recorder cancellation](evidence/x11-shortcut-cancelled.png), [200% zoom / emulated accessibility media](evidence/x11-zoom-200-forced-colors.png). These are inspected evidence, not pixel-diff baselines or private desktop captures.

## Target matrix and remaining gates

The [native-session harness](tests/native-session/README.md) runs the actual launcher on isolated Debian GNOME48/KWin6.3 Wayland/X11 after independent review and a coordinator VM reservation. Its42 guard/schema/backend/provenance/cleanup preparation checks pass without starting a compositor. A bounded actual GNOME48 native Wayland run now passes identity/backend, strict sandbox, ordinary-show component requirement and resident/explicit-Quit assertions. [Final own-renderer/CDP dark-search and light-capability evidence](evidence/native-session/gnome-wayland/README.md) matches the intended states; initial screenshot defects are preserved separately. Physical/session, portal-consent and broader release gates remain outstanding.

| Required target                     | Current evidence                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| Debian 13 amd64, GNOME 48 Wayland   | Isolated software-compositor native probe passes; ordinary show remains unfocused and exposes the component requirement. Actual own-renderer dark/light pixels recorded; physical/session matrix and portal consent/effective binding remain outstanding. |
| Debian 13 amd64, GNOME X11          | Prior13b established initial identity/geometry before missing a post-Close reply. Reviewed unsigned2111 startup run retains module/enable/local-context/poll markers, but no validated request or matching initial reply; typed info unavailable. Earlier398c failure remains preserved; cause and resident/native-hidden gate remain open. |
| Debian 13 amd64, Plasma 6.3 Wayland | Signed7c decoy-only rerun passes bounded native identity/backend/lifecycle and ordinary-show focus; controlled placement, portal consent and physical/full-session gates remain pending. Earlier identity failures are preserved. |
| Debian 13 amd64, KDE X11            | Latest13b diagnostic finds two launcher-PID candidates and refuses identity/geometry inspection; exact-target selection remains open. |

No companion, portal, input service, keyboard device, GNOME setting, autostart entry or user shortcut preference is installed/enabled/changed. The test shortcut grabs last only for the disposable application processes. No claim covers multimonitor/fractional scale, suspend/lock/logout, packaging installation or production command routing. The coordinator must keep missing checks outstanding and obtain independent review before integration.

Primary API references: [Electron app identity/lifecycle](https://www.electronjs.org/docs/latest/api/app), [global shortcuts and portal limitations](https://www.electronjs.org/docs/latest/api/global-shortcut), [BrowserWindow Wayland limitations](https://www.electronjs.org/docs/latest/api/browser-window), [custom protocol](https://www.electronjs.org/docs/latest/api/protocol), [security checklist](https://www.electronjs.org/docs/latest/tutorial/security), [Playwright Electron launch sandbox option](https://playwright.dev/docs/api/class-electron#electron-launch-option-chromium-sandbox). Source APIs do not substitute for the unexecuted desktop gates.

Coordinator review closed two recovery/security findings: disposable profiles now require an immediate private child of the canonical temporary directory, preventing a shared ancestor from replacing the profile; failed shortcut replacement reports the previous binding only after verifying that it is still registered. The nested-profile regression and real competing-Electron/lost-registration regression pass. Independent delta review reran all eight unit checks and strict typecheck without findings. The real-host integration suite passes ten checks; target-desktop and screen-reader limitations above remain open.

The final UI review also reproduced loss of keyboard focus when Ctrl+K closed its action panel. Closing now uses the same focus-restoration path as Escape; the real Electron regression verifies toggle-close, restored focus, reopen and Escape. Final ten integration checks pass and an independent reviewer found no remaining delta findings.

## Actual screen-reader evidence

`node spikes/launcher/tests/at/xvfb-orca.ts` builds the unchanged launcher and tests its real custom-protocol renderer/preload under a private Xvfb display, private session/AT buses and actual Orca/private dummy Speech Dispatcher. It checks native role/focus delivery and fresh presentation for search, action-panel focus/restoration and shortcut controls, while retaining the strict Electron sandbox. [Harness scope and evidence](evidence/at/README.md) distinguish these assertions from fixtures, audible QA and native compositor integration.

After independent source review, an authorized private-Xvfb run on the host's **Orca42 remains incomplete (exit3)**. Actual Electron sandbox checks, Orca startup/Dismiss anchor presentation and the first native Search role/focus check pass. The fresh Search presentation/per-label speech-delivery check misses its10s deadline, so the other four control checks were not executed. [Archived host evidence](evidence/at/host-orca42/README.md) records that exact boundary; it cannot pass S0-01-UI. The later reserved **Debian13/Orca48.1 run passes exit0**: all five exact native focus/event roles, freshly generated presentations and per-label private Speech Dispatcher deliveries pass. [Target evidence](evidence/at/debian-orca48/README.md) records source hashes, runtime/package versions, inspected dark/light app-only screenshots and verified cleanup/release. Initial Debian setup/role-check failures remain archived. No global accessibility settings, host display hooks or desktop installation are used. This establishes actual screen-reader generation/delivery on Electron/private Xvfb, with dummy/null speech output; audible/tactile quality, native compositor integration and every target desktop/session matrix entry remain unverified. The coordinator retains acceptance ownership.

## X11 singleton focus candidate — source only

Applicable design sections remain Shell and navigation, Accessibility and Review gate; canonical tokens and renderer layout are unchanged. The reviewed readiness attempt's ordinary Show made the launcher visible but left the synthetic decoy focused. Its strict X11 focus predicate failed and remains unchanged. This new candidate is **native UNEXECUTED** and does not change task/criterion status.

Only explicit `x11` sessions restore when minimized before the existing one Show, then call focus once immediately after Show. User Show and toggle-to-visible use this normal command path; visible-toggle still only hides, Quit still quits, unready commands queue, absent/destroyed windows do nothing, and renderer recovery still reloads once. Wayland/unknown sessions never receive minimized-state queries, restore or explicit focus. There are no loops, timers, `app.focus`, observer activation, new waits or retries. Published capabilities continue to use actual `isFocused()`; a refused focus call remains unavailable and a native failure.

Primary pinned Electron45 documentation shows conditional restore and explicit focus in its [single-instance example](https://raw.githubusercontent.com/electron/electron/v45.0.0/docs/api/app.md). However, [BaseWindow documentation](https://raw.githubusercontent.com/electron/electron/v45.0.0/docs/api/base-window.md) already describes Show as focusing, and [NativeWindowViews source](https://raw.githubusercontent.com/electron/electron/v45.0.0/shell/browser/native_window_views.cc) calls widget activation inside Show as well as Focus. The extra explicit call may be redundant; neither a cause nor a successful native fix is established.

Deterministic tests execute type-only-stripped exact production `applyCommand` and state-snapshot functions with synthetic window spies/traps. They cover hidden/visible/minimized commands, conditional restore→Show→focus order, exactly one call per request, hide/quit/unready/destroyed/null boundaries, one-time reload recovery, no Wayland/unknown explicit activation, and published focus/capability remaining unavailable when focus is refused. These tests are not Electron/compositor evidence. Actual reviewed GNOME/KDE X11 focus/lifecycle, global shortcut and explicit Quit checks plus affected-state/accessibility review remain required under a separately authorized native run.

Source-only verification: configured Node24.22.1/Vitest launcher unit21/21, UI fixtures3/3 and native preparation178/178 pass together202/202 (6.18s) on Pop!_OS22.04 amd64. Strict TypeScript, affected-source lint, planning validator and diff checks pass. No actual host/guest Electron, GNOME/KWin, screenshot or screen-reader run exercised this candidate; those results remain UNEXECUTED.

### Separate X11 lifecycle diagnostic (source only)

The full native probe still requires ordinary Show focus and actual global
shortcut focus on X11; its predicates and first failed outcomes are unchanged.
The signed explicit-focus candidate852f3ab did not establish a fix in its one
reviewed GNOME48.7 X11 run. Exact failed evidence and source scope are preserved
in `evidence/native-session/gnome-x11-explicit-focus/`.

The explicit `run-session.py <x11-backend> --private-guest --probe-mode lifecycle-only`
mode is a separate diagnostic. It verifies initial native identity/backend,
sandbox/context isolation/no renderer Node, dark search and light capabilities,
UI Quit with exit0 and native absence, then one fresh launch with the same
strict identity/backend gates, resident Close with a live process and native
hidden window, and hidden CLI Quit with exit0/native absence. The first launch
and fresh launch share the existing launcher implementation; no application
behaviour changes are made by this increment.

The mode performs no ordinary Show, decoy activation or global chord, and carries
exact skipped checks `ordinary-show-native-focus` and
`actual-x11-global-shortcut`. It never claims activation or shortcut success.
Even when these selected lifecycle checks complete, its status is `incomplete`
and exit code3, with `diagnosticOutcome=complete` and bounded phase proofs;
a failed selected phase is terminal and records `diagnosticOutcome=failed`.
Unknown observer, identity, render, process, cancellation or cleanup failures
cannot be caught as an ordinary focus failure and continued. The full default
mode and historical reports without a mode remain full probes. Wayland is
rejected for this diagnostic and its full probe is unchanged.

All original startup45/checker180/outer240-second budgets, native8/12-second
observation bounds, private guards, source authority and descendant cleanup
remain in force. A later collector must explicitly pin this diagnostic mode;
no collector snapshot or native run for it has been prepared or authorized.
Source-only synthetic branch/schema fixtures do not establish Debian lifecycle,
shortcut, target-session accessibility, portal, physical or complete UI proof.
Relevant design sections remain Shell/navigation, Accessibility and Review gate.

Local source verification: configured Node24.22.1/Vitest4.1.12 checks257/257
passed (21 launcher unit, three UI fixtures, 233 native preparation), plus strict
TypeScript, ESLint, Python AST, plan validation and whitespace checks. Platform:
Pop!_OS22.04 amd64/Bun1.4.4. Private Unix socket fixtures required local sandbox
permission; no compositor, Electron UI or guest was run for this increment.


### KWin X11 lifecycle exact-target observer — source only

Only `kwin-x11` with `--probe-mode lifecycle-only` selects this new passive
observer. Full probes, GNOME and Wayland keep their existing observer paths and
strict focus/identity predicates. This candidate is native **UNEXECUTED**. It
makes no acceptance or desktop capability claim; selected lifecycle completion
still means `incomplete`, exit3, with ordinary Show focus and global shortcut
explicitly skipped.

The driver obtains the BrowserWindow associated with its validated Playwright
page rather than selecting a window by PID or list position. Pinned Electron45
[BaseWindow ABI documentation](https://raw.githubusercontent.com/electron/electron/v45.0.0/docs/api/base-window.md)
and [native implementation](https://raw.githubusercontent.com/electron/electron/v45.0.0/shell/browser/api/electron_api_base_window.cc)
identify the Linux handle as an unsigned long; the amd64 little-endian eight
bytes are checked in full against the X11 protocol XID range, without truncation.
The private binding combines this XID with the supervised Electron process,
launch generation, random channel nonce, exact app ID and explicit X11 backend.
These private fields never appear in public reports. Page association is checked
again around each sample; a changed handle is terminal, not a new binding.

A fixed Python helper validates the disposable Debian/user/private-display
context before loading the fixed system Xlib. It checks an own-process ancestry
chain and pidfd, exact `_NET_WM_PID`, then the two exact `WM_CLASS` strings before
reading only the bound window's frame properties. It uses typed, bounded Xlib
properties: format32 values use C-long storage on LP64; frame extents, current
desktop, viewport, work area and active-window comparison have explicit type,
length and numeric bounds. A foreign PID prevents its class/geometry reads.
There is no foreign-window class/title/content query, activation, clipboard
access, root event subscription, keyboard mask or input synthesis. The fixed
root EWMH client list is used only to establish membership/absence of the bound
target; other entries' metadata are never inspected.

Only own-window property/structure notifications are selected. Identity mutation,
destruction while live, process death, BadWindow, malformed properties or channel
errors terminate the diagnostic; no replacement window or reused XID is adopted.
After actual supervised exit0, the old target must be BadWindow and absent from
the EWMH list before native absence is reported. Two same-PID windows therefore
can coexist while the primary target's public count remains one. Reports label
that count `exact-target`, with observer kind `private-x11-ewmh-exact-owned-target`,
frame geometry `ewmh-frame`, and decoy `not-created`; the count is never a claim
that the process owns only one native window.

All helper capture, private-channel and native queries share the original
8-second observation budget; the existing predicate/startup/checker/outer bounds,
two-launch lifecycle branch, source guards and descendant supervisor remain in
force. No dependencies, application behavior, activation retries or independent
wait window are added. Canonical renderer tokens and Shell/navigation,
Accessibility and Review gate design requirements remain applicable.

Synthetic fixtures execute the production capture/channel/observation functions,
ctypes property/geometry/event decoder and immutable target state. They cover two
own-PID candidates, page swaps, foreign metadata traps, class mismatches,
full-width/high-bit ABI rejection, process/event lifetime changes, BadWindow,
retired/reused targets, property lengths/types, bounded pipe framing, strict
public provenance and private-field rejection. They are source preparation,
not Xlib/compositor evidence. A later independently reviewed native control must
create one fixed synthetic auxiliary BrowserWindow in the same Electron process,
prove the page-bound primary remains selected, and prove a deliberately swapped
binding is rejected. That control and the actual KWin6.3.6 X11 two-launch
lifecycle run require separate source/authority review before execution. Full
focus/shortcut, target accessibility, physical desktop and complete S0-01 gates
remain pending.


Local source verification for this increment: configured Node24.22.1/Vitest4.1.12
passed365/365 checks (21 launcher unit, three UI fixtures, 341 native preparation)
in12.46s. Strict TypeScript, affected-source ESLint, five Python AST checks,
planning validation and the source-only native build pass on Pop!_OS22.04 amd64
with Bun1.4.4. The rebuilt manifest declares25 runtime inputs plus canonical
tokens and the fixed desktop entry. The initial preparation run had one fixture
dispatch failure (315 passed/one failed); correcting that fixture and adding the
remaining property/publication cases produced the final pass. No desktop,
Electron UI, display, guest or physical-device check ran for this increment.


Independent review then found a numeric-PID reuse gap in the new source-only
helper: ancestry was checked before opening the retained pidfd. The follow-up
opens that handle first, requires it alive before and after the bounded UID/ancestry
walk, and closes it on every validation failure. A replacement process encountered
through numeric `/proc` paths cannot revive the retained original handle. Five
additional fixtures execute production `ProcessLease` through `Target.bind`,
including replacement during ancestry, and require denial before any native
window PID/class/geometry query. Affected preparation346/346 pass in12.99s;
strict TypeScript, affected lint and Python AST checks pass. The prior365-check
snapshot remains immutable and native efficacy remains UNEXECUTED.
