# S0-02 compositor and selection transport feasibility

This spike follows [S0-02](../../docs/implementation/tasks/S0-02.md), [Linux integration](../../docs/architecture/linux-integration.md), [security](../../docs/architecture/security.md), [overview](../../docs/architecture/overview.md) and [testing/release](../../docs/implementation/testing-release.md). It provides bounded API-shaped fixtures, a real private D-Bus wire exercise, and an authorized host canary. It is not a packaged GNOME extension, KWin script or the production native helper. None is installed or enabled by these tools.

The design [review gate](../../docs/design/DESIGN.md#review-gate) and tokens were read. No Linuxcast product view is added. The brief GTK engineering canary uses fixed public text, does not request focus and does not record the desktop; it is not product UI/accessibility evidence.

## Evidence boundary

On 23 October 2026 (Australia/Sydney), the authorized host is Pop!_OS 22.04 LTS amd64, kernel 7.1.1-76070101-generic, GNOME Shell **42.9**, GJS **1.72.4**, with an actual GDK-X11 display. Read-only session-bus calls obtain only ShellVersion and ownership booleans for `org.kde.KWin` and this spike's named service. Both latter services are absent. Installed GI type metadata exposes the expected method names, but GNOME 42 method presence does not validate GNOME 48 behavior.

[Host evidence](evidence/host-probe.json) records:

- GNOME48 capability: unsupported, `COMPANION_VERSION_MISMATCH`, with a matching-component remediation.
- KWin/companion: absent. No incoming KWin D-Bus server is invented.
- Own GTK/X11 window frame: **280×157 → 360×217**, measured from the canary's own native window after resizing. No other window is enumerated, activated, resized or read; no private title/caption reader is in the native adapter interfaces.
- A fresh private X11 selection reports an ownership event and retrieves the fixed public payload. It is released only if its owner still matches the canary. **The normal CLIPBOARD selection is neither read nor written**, so no user clipboard snapshot or restoration is needed. A newer owner is preserved.
- A separate private D-Bus fixture completes real Gio method exchanges for one pending poll, duplicate-poll rejection, acknowledgement, fresh generation and no replay. This is a native wire exercise, **not a running KWin 6.3 script**.

The host probe exits **3** intentionally: versions, method names, a GTK canary and private D-Bus do not establish supported-target companion acceptance. Debian13/GNOME48 and Plasma6.3 live companion protocols, native Wayland clipboard/data-control negotiation, real helper/script restarts, multi-workspace/multi-monitor/fractional-scale operation and the release session matrix remain outstanding. No mock or X11 result is substituted for those gates.

## Prototype behavior

`model.ts` keeps capability, window and clipboard epochs explicit. Missing/disabled/wrong-version/disconnected companions produce actionable states. Window handles bind to a session, generation and internal registry; reconnect discards handles. Geometry reads fetch the current native rectangle. Placement clamps to the selected work area, rejects invalid values and requires a normal movable/resizable window; maximized/fullscreen cases request review. The returned target is a requested geometry, not an assertion that the compositor already applied it.

`window-adapters.ts` maps the inspected Mutter `get_frame_rect`, `get_work_area_current_monitor`, `move_resize_frame` and `unmanaged` lifecycle, and KWin `frameGeometry`, `clientArea` and `windowRemoved`. Rectangles are copied by explicit fields so GI/Qt boxed-object enumeration is not assumed. The current tests inject synthetic native objects. They do not access user window objects.

Clipboard history is denied until the fixture grants it. Supported formats are an explicit allowlist: UTF-8/plain text, HTML and URI-list at **1 MiB**, PNG at **10 MiB**. Native transfer requests are capped at limit+1 so oversize data is rejected rather than accepted as a silently truncated clip. HTML is not rendered, URI references are not opened and images are not decoded by this spike. Unknown formats, oversize data, missing permission, native failures and Linuxcast-owned feedback loops have distinct outcomes. Owner change, disconnect, revocation, supersession, caller cancellation or a one-second prototype deadline invalidates a transfer; even an underlying provider that ignores cancellation cannot publish a late result. Logs contain no payload bytes.

GNOME's `St.Clipboard.get_content` has no maximum-size parameter in the 48.0 header. The fixture therefore models capped `Meta.Selection.transfer_async` with `Gio.Cancellable`, followed by full completion and a bounded output stream, instead of assuming that an unbounded content callback is safe. The adapter is API-shaped and tested with GI stand-ins; actual GNOME48 callback/cancellation behavior still needs the matching session.

The helper `CommandQueue` allows one authorized script principal, one outstanding `NextCommand`, one unacknowledged command, at most 16 queued commands and 64 retained outcome records. Peer authorization defaults to deny; the owner must supply a predicate derived from trusted D-Bus service ownership and explicit companion enablement. A caller-supplied identity is not that authorization. Commands have bounded lifetimes, expire without replay and cannot select eval/shell/arbitrary D-Bus methods. Duplicate/stale acknowledgements fail. An expired in-flight command remains uncertain until a new generation; a reconnect clears queued and in-flight work.

`kwinLoop` uses only fixed outbound `callDBus` operations: Handshake, NextCommand and Ack. It acknowledges before repolling. Its 1.5-second watchdog stops the loop and requests reload/fresh generation; it never starts a second call after a missing callback. Conservative elapsed-time checks reject late commands before dispatch. A production timer binding must use QTimer's `remainingTime`/relative timing, not a wall clock. The loop does not register an incoming server or install/reload a script itself. The native helper's long-poll reply deadline is at most one second.

Important source finding: **KWin 6.3.6 suppresses the JavaScript callback on a D-Bus error**. A retry based only on callbacks can hang indefinitely or violate the one-pending rule. The helper should return bounded normal replies for expected unavailable/reconnect states, and a missing reply must stop polling until the explicitly enabled script is reloaded. A late callback from a stopped loop cannot resume execution. An ack establishes a transport outcome; it does not prove a window move or paste was consumed by the intended destination.

## Reproduction and checks

Prerequisites are accepted F1-01 Node/Bun dependencies plus the host's GJS, Python3/PyGObject, GTK3 and `dbus-run-session`. No dependency manifest, companion settings, clipboard settings, service or host policy is changed. Restricted tool sandboxes may deny ordinary private Unix sockets or nested child processes; the authorized host checks require a permitted execution context and must not silently skip.

```sh
bun run typecheck
bun run lint
bun run test:integration -- S0-02
# Read-only host/API discovery; exits3 because this is not complete target proof:
node spikes/desktop/probe.ts
# Explicit synthetic own-window/private-selection canary:
node spikes/desktop/probe.ts --synthetic-canary
# Real private-bus fixture; no desktop service is contacted:
dbus-run-session -- python3 spikes/desktop/native/transport-wire.py
```

The coordinator-owned integration mapping includes `spikes/desktop/transport.test.ts` and `spikes/desktop/native.integration.test.ts`. The first has 15 pure/API-shaped checks; the latter has two actual host/private-bus canary checks. The required named command passes all **17 checks**, with no skipped/todo checks; its real output is in [integration-host.log](evidence/integration-host.log). This is fixture/host evidence, not a passing GNOME48/Plasma6.3 companion gate. Lint and typecheck are no-write validation.

`native/transport-wire.py` is deliberately a small fixed private-bus fixture rather than a second production queue implementation. Its messages contain only synthetic command metadata and it never controls a desktop window. The full queue expiry, stale-peer, permission, restart and no-replay semantics are exercised against the TypeScript prototype. Production D-Bus sender validation, packaged component authentication, automatic recovery of an already-enabled component, native file/blob handles and the full protocol remain F0-01/downstream work.

## Source/API review

Primary versioned sources inspected:

- [Mutter48 selection implementation](https://github.com/GNOME/mutter/blob/48.0/src/core/meta-selection.c) and [selection header](https://github.com/GNOME/mutter/blob/48.0/src/meta/meta-selection.h): owner changes, MIME enumeration, transfer byte limit and external cancellation.
- [Shell48 clipboard header](https://github.com/GNOME/gnome-shell/blob/48.0/src/st/st-clipboard.h): GBytes callback and no read-size argument.
- [Mutter48 window header](https://github.com/GNOME/mutter/blob/48.0/src/meta/window.h): frame/work-area rectangles and fixed move/resize calls.
- [KWin6.3.6 workspace](https://github.com/KDE/kwin/blob/v6.3.6/src/scripting/workspace_wrapper.h), [window](https://github.com/KDE/kwin/blob/v6.3.6/src/window.h) and [scripting implementation](https://github.com/KDE/kwin/blob/v6.3.6/src/scripting/scripting.cpp): windowList/activeWindow, frameGeometry, clientArea, QTimer exposure and outbound asynchronous callDBus/error behavior.
- [Qt QTimer](https://doc.qt.io/qt-6/qtimer.html#remainingTime-prop): relative timeout observation. A concrete KWin timer/clock binding is not claimed tested here.

The source inspection is API evidence; no upstream implementation code, private application data, artwork or compatibility SDK was copied into the spike.

## Acceptance mapping and F0-01 inputs

| Criterion | Evidence and remaining gap |
| --- | --- |
| S0-02-AC01 | GNOME and KDE API-shaped fixtures cover clipboard ownership/content boundaries and current window geometry; the authorized X11 canary supplies actual own-window geometry/private-selection events. **Live GNOME48 and Plasma6.3 companion transports remain unverified** and must not be inferred from fixtures. |
| S0-02-AC02 | Missing, wrong-version, disabled, disconnected and restarted companion fixtures provide repair actions; unknown/oversize MIME, cancellation, stale generation, lost D-Bus callback and no-replay cases are covered. Actual host wrong-version/missing-component states are recorded. |
| S0-02-UI | Conditional N/A proposed: no Linuxcast product UI is introduced; the GTK engineering canary is not design/accessibility acceptance. |
| S0-02-PRIVACY | Only public fixture text, own-window rectangles, private selection MIME names, versions/API-presence/controller metadata and command IDs are retained. No user clipboard, private window title, screenshot, browser data or credential is collected. |

F0-01 should freeze component/session/owner generations separately, typed unavailable and MIME/size outcomes, opaque window/blob handles, fixed commands and acknowledgements with explicit uncertainty, one outstanding KWin poll, expiry/no-replay and a recovery path that handles missing callbacks. GNOME bounded reads and KWin's older negotiated `zwlr_data_control_manager_v1` v2 clipboard backend are distinct; this spike does not treat XWayland or a clipboard portal grant as universal history/control authority. Real companions remain opt-in and must be enabled/tested on their supported session before downstream features claim them.
