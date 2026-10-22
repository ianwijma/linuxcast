# S0-01 native session probe — prepared, not executed

This task-owned harness is an offline preparation increment. It has **no GNOME48/KWin6.3 target execution evidence** and closes no desktop/session acceptance gate. It needs independent source review and an explicit coordinator VM reservation after S0-02 releases its reservation. Do not run it on the user's desktop.

Relevant contract: [S0-01 card](../../../../docs/implementation/tasks/S0-01.md), [Linux integration](../../../../docs/architecture/linux-integration.md#launcher-and-desktop-identity), [security](../../../../docs/architecture/security.md), [testing/release](../../../../docs/implementation/testing-release.md), and DESIGN Shell/navigation, Accessibility and Review gate with canonical tokens. It builds the unchanged actual launcher, including its main/custom protocol/preload/renderer, rather than a replacement UI or simulated native backend. F1-01 is the accepted prerequisite. All formats here are provisional private spike diagnostics, not F0 contracts or a production companion.

## Prepared command and prerequisites

After review and reservation only:

```sh
node spikes/launcher/tests/native-session/build.ts
python3 spikes/launcher/tests/native-session/run-session.py gnome-wayland --private-guest
python3 spikes/launcher/tests/native-session/run-session.py gnome-x11 --private-guest
python3 spikes/launcher/tests/native-session/run-session.py kwin-wayland --private-guest
python3 spikes/launcher/tests/native-session/run-session.py kwin-x11 --private-guest
```

Run each backend separately, never concurrently with input/device or other graphical experiments. The entry refuses root, missing explicit consent flag, a non-Debian13 target, or an enabled input-lab marker. It creates its own HOME/XDG/private runtime, private session D-Bus with no activation services and private keyfile GSettings. X11 uses new Xvfb/Xauthority; native Wayland has no inherited DISPLAY/Xauthority and starts only the software/headless GNOME or virtual KWin backend. No host display, session credentials, settings, desktop entry, portal, service or physical device is used. Private desktop metadata is identity-only (`Exec=/usr/bin/false`), never a shell launch route or host installation.

Required guest packages/runtimes: pinned Node24.22.1/Bun1.4.4/frozen project dependencies and explicit Electron45 setup; Debian GNOME48/Shell/Mutter and KWin6.3.6; GJS; Python3/gi/GTK3; gsettings/gdbus/D-Bus; Xvfb/xauth/xdotool for X11; working Mesa software rendering and Electron's actual Chromium sandbox. No extra JavaScript dependency or manifest change is needed. Package absence or failed startup is unavailable, not a pass. This private bus deliberately does not activate a desktop portal: shortcut-service absence is recorded as unsupported, never user consent or an effective portal binding.

## Observations and actions

The GNOME48 extension and KWin6.3 script inspect only exact driver-supplied launcher/decoy PIDs, then require the fixed native app identity before reading focus/geometry/work area. They never read window titles, captions, content, clipboard, key streams, unrelated window geometry, or unrelated application identity. They may activate only the matched fixed public GTK decoy for explicit challenge setup. They never activate, raise, move, resize or force-focus the launcher. The driver then tests the application's ordinary `show()`/singleton CLI path and records actual compositor observations.

GNOME uses `Meta.Window.get_client_type()`. KWin's scripted `Window` does not expose the effects API's `waylandClient` property; this diagnostic instead reads the already matched QObject's native metaobject class through Qt's wrapper string and discards the address/object-name portion. Exact `KWin::XdgToplevelWindow` means Wayland; exact `KWin::X11Window` means X11; every unknown class fails the backend gate. This is a pinned implementation-detail probe, not an invented public KWin API. It must be confirmed by actual target execution. Native backend evidence is independent of Electron's requested Ozone flag, which is checked separately; an XWayland window fails the native Wayland gate.

The prepared flow requires:

1. Actual renderer sandbox/context isolation/web security, absent renderer Node, Electron45 and the expected Ozone setting.
2. Matched native identity/backend and actual initial geometry/work area. X11 must fit the work area; Wayland reports compositor-selected placement with the existing actionable component requirement.
3. Native hidden state after window Close while the same process remains resident.
4. A matched fixed decoy focused as explicit setup, followed by ordinary CLI `--show`, one launcher window and retained PID. X11 must regain native focus. Wayland records actual native focus or verifies the visible actionable activation/placement component requirement.
5. Actual registered X11 shortcut activation using one fixed XTest key on the private display, or accurately reported Wayland shortcut/portal state with no invented effective key/consent proof.
6. Singleton toggle/hide/reopen, explicit UI Quit, native window disappearance, a fresh launch, hidden CLI Quit and native disappearance.
7. Dark launcher/light capability screenshots from only the launcher's renderer. No screenshot or identity is captured from the decoy or compositor desktop.

The outer process-local supervisor is copied unchanged from reviewed S0-02 sourceb066f4a. Its SHA256 is `0d26ee0a9e4f581bb53be2dd59576cd82976e66f3403e1fae3a1113d225c45bb` and is included in the source manifest. Local subreaper adoption, pidfd/ancestry checks, repeated-cancellation protection, concurrent SIGTERM and bounded SIGKILL/reaping cover detached child sessions. A SIGKILL of this outer owner itself remains outside its cooperative-cancellation claim. Temporary profiles and raw compositor output are discarded; no raw compositor output is retained. Successful cleanup is required before a complete probe result is recorded.

## Evidence and remaining scope

Future actual runs write bounded safe `evidence/native-session/<backend>/report.json`, source manifest, and app-only dark/light screenshots. Reports distinguish native focus outcomes, placement, lifecycle, shortcut/portal availability and cleanup. A failed phase is incomplete; missing native evidence cannot silently pass. The manifest identifies the actual launcher, host tokens, hooks and cleanup source. Both private entry stages verify fixed allowlisted source/output hashes before compositor execution; a changed generated hook fails preflight. Reports always retain `physicalDesktopMatrixEstablished:false`: isolated software compositor API proof is separate from physical GPU/session/monitor, portal consent, lock/suspend and broad release acceptance. Earlier host-X11 and private-Xvfb/Orca evidence remain separate.

Offline preparation checks: `preparation.test.ts` exercises the entry guard, independent native backend/identity rejection (including XWayland mismatch), stale/arbitrary/unsafe observation denial, exact actual-source manifest generation/tampered-output rejection, and harmless real detached-child/grandchild SIGTERM/SIGINT teardown. These six checks passed on the host without launching any compositor or window. Strict root typecheck/lint and Python AST checks pass. The coordinator owns the shared test map and task/criterion status; suggested integration mapping is this test file.

Primary source/API evidence (reviewed22 October2026 UTC): [Mutter48 window APIs](https://github.com/GNOME/mutter/blob/48.0/src/meta/window.h), [KWin6.3.6 Window properties](https://github.com/KDE/kwin/blob/v6.3.6/src/window.h), [KWin workspace](https://github.com/KDE/kwin/blob/v6.3.6/src/scripting/workspace_wrapper.h), [native Wayland class](https://github.com/KDE/kwin/blob/v6.3.6/src/xdgshellwindow.h), [native X11 class](https://github.com/KDE/kwin/blob/v6.3.6/src/x11window.h), [Qt6.8.2 object wrapper](https://github.com/qt/qtdeclarative/blob/v6.8.2/src/qml/jsruntime/qv4qobjectwrapper.cpp), [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window), [Electron app/single-instance lifecycle](https://www.electronjs.org/docs/latest/api/app). API/source availability is not successful target runtime evidence.
