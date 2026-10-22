# Debian integration and privileged input contract

Status: proposed implementation, researched against Debian 13 on 2026-10-22. No native integration has been built or exercised in this repository. API availability below is source evidence; successful operation, recovery and latency are release gates. Every permission, degraded state and recovery surface follows [DESIGN.md](../design/DESIGN.md).

## Supported desktop baseline

Target Debian 13 amd64 with GNOME 48 or KDE Plasma 6.3, Wayland preferred and X11 supported. Use distro-provided security updates. Do not require a newer compositor to satisfy the baseline. Debian's release announcement identifies these desktop generations. [Debian 13 release](https://www.debian.org/News/2025/20250809).

Each operation advertises a runtime capability from [overview.md](overview.md). Prefer the least privileged working backend. The UI must show which component or permission is required and keep unrelated features usable. Optional components are bundled, but users explicitly enable them. The product must never imply that enabling an XWayland backend gives control of native Wayland windows.

## Capability matrix

“Companion” means the explicitly enabled GNOME extension or KWin script. “Input service” means the separate explicitly authorized system service defined below. All cells remain implementation/test targets.

| Operation | GNOME 48 Wayland | Plasma 6.3 Wayland | X11 sessions | Fallback |
| --- | --- | --- | --- | --- |
| Global launcher shortcut | GlobalShortcuts portal through Electron | GlobalShortcuts portal through Electron | Electron globalShortcut | User binds `linuxcast --toggle` in desktop settings |
| Exact placement/focus behavior | GNOME companion | KWin companion | Window-manager conventions/Electron, validated per WM | Open normally; explain unavailable positioning control |
| Read current clipboard | Electron clipboard for current selection | Electron clipboard for current selection | Electron clipboard/X11 | Show unavailable state if access fails |
| Clipboard history | GNOME selection companion | KWin `zwlr_data_control_manager_v1` v2 adapter | XFixes selection monitoring | Current clipboard command; history off |
| Controlled paste | RemoteDesktop portal + libei, or authorized input service | RemoteDesktop portal + libei, or authorized input service | XTest | Copy result and ask user to press Paste |
| Automatic typed snippets | Input service plus verified focus/layout eligibility | Input service plus verified focus/layout eligibility | Input service preferred; same eligibility rules | Explicit snippet search and paste/copy |
| Hyper/remapping | Input service | Input service | Input service | Ordinary configurable global shortcuts |
| Window list/resize/placement | GNOME companion | KWin companion | EWMH adapter | App launch/switch actions only where available |
| Screenshot/screen selection | Screenshot/ScreenCast portal as appropriate | Screenshot/ScreenCast portal as appropriate | Portal first; supported X11 capture adapter | Explain missing backend/permission |
| OCR | Local Tesseract after authorized image capture/open | Same | Same | Text/file input; no silent cloud upload |
| App/file search | GIO + selected-root index | Same | Same | Local functionality independent of desktop companion |
| Lock/power/session actions | logind and portal/desktop permissions | Same | Same | Surface denied/unsupported action; no privilege bypass |
| Media actions | MPRIS | MPRIS | MPRIS | No active-player state |

The Clipboard portal is not a blanket clipboard-history API: it extends RemoteDesktop/InputCapture sessions. Do not present its permission as general history authorization. [Clipboard portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Clipboard.html). KWin 6.3.6 source exposes the older `zwlr_data_control_manager_v1` protocol; do not assume newer `ext-data-control` support on this baseline. [KWin data-control source](https://github.com/KDE/kwin/blob/v6.3.6/src/wayland/datacontroldevicemanager_v1.cpp).

## Launcher and desktop identity

Install `io.github.ianwijma.Linuxcast.desktop` and configure Electron with that stable desktop identity. Set the application's Wayland identity consistently with the desktop file. Register global shortcuts after app readiness, handle registration failure and conflicts, and display the effective binding. GNOME 48 adds global-shortcut portal support; Electron documents its portal-based registration path. [GNOME 48 developer notes](https://release.gnome.org/48/developers/), [Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut/), [GlobalShortcuts portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.GlobalShortcuts.html).

Native Wayland does not generally let an ordinary client choose arbitrary screen coordinates, force focus or enforce always-on-top behavior using Electron's usual window methods. Treat companion-provided placement/focus as separate capabilities. Do not make repeatedly calling `setPosition`, `focus` or `setAlwaysOnTop` the fallback. [Electron BrowserWindow limitations](https://github.com/electron/electron/blob/main/docs/api/browser-window.md).

Use one background application instance, with CLI/deep-link requests routed to it through Electron's single-instance flow. CLI input is parsed as data and validated. Tray availability is optional and must not be the only way to recover the launcher. Autostart is an explicit per-user XDG desktop autostart preference. [Autostart specification](https://specifications.freedesktop.org/autostart/latest/).

## GNOME 48 companion

Bundle a GNOME Shell extension targeting Shell 48. Its fixed API exposes capability discovery, current foreground application/window identity, eligible placement/window commands, clipboard ownership/content notifications and lock/session context. It must not expose `eval`, arbitrary GJS, arbitrary D-Bus forwarding or shell commands.

Versioned GNOME sources expose `Meta.Selection` ownership changes and `St.Clipboard` access. Implement a bounded clipboard reader with supported MIME allowlists and feedback-loop suppression. Content retrieval is asynchronous and may race a new clipboard owner; include an ownership generation in every result. [Mutter selection source](https://github.com/GNOME/mutter/blob/48.0/src/core/meta-selection.c), [Shell clipboard API source](https://github.com/GNOME/gnome-shell/blob/48.0/src/st/st-clipboard.h).

Use supported Shell/Mutter window APIs for enumeration, focus and geometry, and return a stable session-scoped window handle rather than a raw object. Reject handles from earlier companion generations. Validate behavior across workspaces, maximized/full-screen windows, multiple monitors and fractional scale. The extension is enabled only through onboarding/user action; incompatibility after a shell update disables its capabilities with a repair action. [Mutter display API](https://github.com/GNOME/mutter/blob/48.0/src/meta/display.h), [GNOME extension development](https://gjs.guide/extensions/development/creating.html).

## Plasma 6.3 companion

Bundle a KWin script using APIs present in 6.3.6: `workspace.windowList()`, `workspace.activeWindow`, `window.frameGeometry`, `window.setMaximize(...)` and `workspace.clientArea(...)`. Fixed commands must clamp rectangles to a valid output/work area and validate the selected window. [Workspace API source](https://github.com/KDE/kwin/blob/v6.3.6/src/scripting/workspace_wrapper.h), [window source](https://github.com/KDE/kwin/blob/v6.3.6/src/window.h).

KWin scripting provides outbound asynchronous `callDBus`; do not invent an incoming D-Bus server inside the script. The unprivileged helper owns a D-Bus service with a bounded `NextCommand` long-poll queue. The script requests one command, executes only a fixed allowlisted operation, acknowledges the command ID/result, then requests the next. Only one request may be outstanding. Commands expire and are never replayed after helper/script restart; reload/reconnect the bundled script and negotiate a fresh generation. The native spike must validate this transport and reconnect behavior on Plasma 6.3. [KWin scripting implementation](https://github.com/KDE/kwin/blob/v6.3.6/src/scripting/scripting.cpp).

Clipboard history uses the Wayland helper's negotiated `zwlr_data_control_manager_v1` v2 binding. Treat absence/revocation as unavailable, cap MIME sizes, cancel stale transfers and exclude Linuxcast-owned clipboard updates from recursive history capture. Protocol access does not guarantee that a clipboard source is safe to store or that the originating application can always be identified.

## X11 integration

Use Electron globalShortcut, XFixes selection notifications, XTest for bounded injection, and EWMH-compatible window enumeration/activation/geometry. Test against both supported desktops' X11 sessions. X11 is a less isolated display environment; Linuxcast's plugin sandbox must still prevent untrusted extensions from accessing its display socket or Xauthority. [Extended Window Manager Hints](https://specifications.freedesktop.org/wm/latest-single/).

Input-service Hyper and typed-trigger semantics remain the same on X11 and Wayland. Do not build a second weaker plugin-accessible raw-key API merely because X11 permits it.

## Application, file and system services

Use GIO application discovery and launch. Honor localized display names, `Hidden`, `NoDisplay`, desktop visibility conditions, `TryExec`, actions and `DBusActivatable`. Do not feed a desktop entry's `Exec` string to a shell; use the platform launch parser/adapter. [Desktop Entry specification](https://xdg.pages.freedesktop.org/xdg-specs/desktop-entry/latest-single/), [GIO launch](https://gnome.pages.gitlab.gnome.org/gtk/gio/method.AppInfo.launch.html).

Index user-selected roots, starting with metadata. Watch for changes and reconcile periodically so missed events do not permanently hide files. Handle deleted/inaccessible/removable roots, symlink loops and cancellation. No background full-home content scan by default. FTS5 retrieves candidates and the shared deterministic scorer ranks them. The storage worker owns index mutation. [SQLite FTS5](https://www.sqlite.org/fts5.html).

Use Screenshot/ScreenCast portals for consented capture, logind for session/power operations, and MPRIS for media controls. Surface their permission outcomes; never turn a denied desktop action into a root shell command. [Screenshot portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Screenshot.html), [ScreenCast portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.ScreenCast.html), [logind API](https://freedesktop.org/software/systemd/man/latest/org.freedesktop.login1.html), [MPRIS](https://wiki.freedesktop.org/www/Specifications/mpris-spec/).

## Privileged input: reason and boundaries

Ordinary Wayland clients cannot universally observe other applications' keystrokes or remap physical keyboards. The approved solution is an optional evdev/uinput service with broad keyboard access, visibly explained before authorization. The service enables Hyper and eligible automatic snippet triggers, but physical key events still do not universally identify committed text, IME state or password fields. This limitation must remain visible in onboarding and per-app settings.

The kernel documents uinput as a way to create input devices from userspace; libevdev provides the device and event synchronization primitives. Existing Linux remappers demonstrate the evdev/uinput pattern, not a security guarantee for this design. [Kernel uinput](https://kernel.org/doc/html/latest/input/uinput.html), [libevdev](https://www.freedesktop.org/software/libevdev/doc/latest/), [keyd](https://github.com/rvaiya/keyd), [Kanata Linux setup](https://github.com/jtroo/kanata/blob/main/docs/setup-linux.md). Espanso's Linux installation differences are useful ecosystem evidence that desktop/session restrictions matter; Linuxcast must validate its own implementation. [Espanso Linux installation](https://espanso.org/docs/install/linux/).

### Installation and explicit authorization

The `.deb` installs `linuxcast-input.service` disabled and stopped. Installation, first launch, model setup and enabling the GNOME/KDE companion do not activate input capture. Do not add users to the `input` group, make `/dev/uinput` broadly writable, or grant capabilities/setuid to Electron or the general helper.

Onboarding shows separate toggles for Hyper and automatic expansion and an explicit keyboard-device picker. Both are off initially. Confirm the selected devices and explain that the service sees physical key activity and can emit keyboard input. An administrative enable action invokes the fixed root-owned `linuxcast-inputctl` through polkit. Cancelled authentication changes nothing. After explicit disable, remove the caller's grant; if no grants remain, stop and disable the service.

The administrative helper accepts only `enable`, `disable`, `status` and a validated opaque request record; no arbitrary executable, shell, environment, path, UID or service name. Resolve the caller UID from trusted polkit/pkexec context, not renderer data. Persist grants under a root-owned configuration directory keyed by authorized UID, selected device fingerprints and allowed features. Load only the fixed `uinput` module if required during explicit setup; the long-running service has no module-loading authority. [Polkit](https://www.freedesktop.org/software/polkit/docs/latest/polkit.8.html), [pkexec](https://www.freedesktop.org/software/polkit/docs/latest/pkexec.1.html).

### Privilege separation and device lifetime

`linuxcast-inputd` is a small root supervisor. It validates the active session and selected udev device identity, opens only selected input devices and uinput, launches the worker, monitors leases and closes/revokes resources. It does not load snippets, expand templates, invoke providers, read the application database or execute user-supplied programs.

`linuxcast-input-engine` runs as the dedicated nonlogin `linuxcast-input` system user with an empty capability set. It receives input/uinput file descriptors over an internal Unix socket using `SCM_RIGHTS`. It implements bounded Rust state machines for forwarding, Hyper and literal trigger matching using libevdev/libxkbcommon. It cannot spawn executable programs or open arbitrary files/network sockets.

**The supervisor must close its copies of handed-off evdev descriptors.** Duplicated descriptors refer to the same evdev client; retaining a copy can retain an `EVIOCGRAB` after worker failure. The worker must be the sole owner of descriptors whose close releases its grabs. The supervisor must not keep “recovery” duplicate descriptors. Recovery means terminating the worker and letting all its descriptors close, not retaining the grab in another process. Validate this with actual kernel/device tests. [libevdev initialization and grab lifecycle](https://www.freedesktop.org/software/libevdev/doc/latest/group__init.html), [uinput device lifecycle](https://www.freedesktop.org/software/libevdev/doc/latest/group__uinput.html).

The supervisor does not call `TakeControl(force)` on logind. `TakeDevice` is tied to a session controller, normally the compositor, so it is not a drop-in way to obtain a second controller for Linuxcast. Root-opened descriptors require the explicit active-seat/lock leases below. [logind API](https://freedesktop.org/software/systemd/man/latest/org.freedesktop.login1.html).

### Device and session eligibility

V1 supports `seat0` and one active local graphical user session. Require a consented UID, active local X11/Wayland session, no greeter/remote/TTY session, known unlocked state, fresh desktop companion/session context and a live authorized client lease. Unknown or stale lock/session state disarms. Logind and companion notifications are asynchronous; release tests must cover transition races, and the product must not claim a mathematically atomic lock boundary.

Only explicitly selected keyboard devices are eligible. Enumerate with udev; require keyboard capability and matching seat, exclude Linuxcast virtual devices, pointer/touch devices and ambiguous mixed devices. The UI chooses opaque IDs. The supervisor resolves its own known device path, opens with `O_NOFOLLOW` and validates character-device identity, `rdev` and capabilities. A caller cannot supply `/dev` paths. New/ambiguous keyboards remain untouched; a previously approved stable fingerprint may reconnect after revalidation. Competing exclusive grabs produce a conflict state and leave the device untouched.

Create one virtual keyboard per physical keyboard with distinct Linuxcast identity and preserve internal/external classification where supported. Do not label every virtual keyboard as internal. Validate media keys, LED state and touchpad disable-while-typing behavior. Never rediscover and capture Linuxcast's own virtual devices.

### Authenticated control protocol

Use a root-owned runtime directory with a per-authorized-UID socket owned by that UID and mode `0600`; parent directories prevent replacement by other users. The service authenticates `SO_PEERCRED`, checks the UID/session grant and never trusts a claimed UID in a message. The client verifies the connected service's root UID. Same-UID malicious processes are outside a complete isolation guarantee; sandboxed extensions cannot reach this socket at all.

Use versioned length-prefixed messages with a 1 MiB maximum frame and strict schemas. Control operations are fixed: handshake/status, renew lease, publish validated built-in input profile, arm/disarm, acknowledge an eligible expansion and a bounded paste operation tied to explicit broker user intent. General workflow/extension key combinations are not inputd operations: `input.shortcut` requires a separately consented RemoteDesktop/libei or supported X11 adapter and is unavailable when neither exists. No generic “send arbitrary events,” executable invocation or raw keyboard-stream subscription is exposed to plugins.

Profiles contain at most 4,096 literal ASCII triggers of at most 64 characters, a fixed remapping configuration and app eligibility rules. Reject duplicate/ambiguous entries according to the snippet specification. Replace a profile atomically. The privileged subsystem receives no snippet bodies or templates. It may emit only recognized trigger ID, single-use nonce and context generation. Raw keystrokes and unmatched text never enter logs, IPC, crash reports or disk.

### Hyper behavior: fixed v1 default

- Caps Lock pressed and released in less than **200 ms**, without another key press, emits one Escape tap. It does not toggle Caps Lock.
- At 200 ms, or immediately before another physical key press is forwarded, promote Caps Lock to **Ctrl+Alt+Shift+Super** held state, using the left-side synthetic modifier keys.
- Releasing a promoted Caps Lock releases only the synthetic modifier contributions and emits no Escape.
- Ignore Caps Lock auto-repeat. Track physical and synthetic modifier references across devices so a real held modifier is never released by ending Hyper.
- If a context/session reset occurs, discard a pending tap. Release synthetic contributions during orderly disarm; do not manufacture Escape after a reconnect or crash.

The threshold uses a monotonic clock and has explicit boundary tests at 199, 200 and 201 ms. A configurable threshold may be added within a validated range later; these are the initial default semantics.

### Automatic snippets, layout and insertion

The worker uses libxkbcommon with a verified current XKB map and synchronized modifier/layout state. The initial raw-key trigger set is ASCII. Compose/dead-key state and IME preedit cannot be inferred universally from raw keycodes; pause matching when such state is known or uncertain. Unicode payloads are inserted through a clipboard paste transaction, not by inventing keycodes for every Unicode character. Unicode trigger support requires a validated committed-text adapter and is not claimed by the raw backend. [libxkbcommon](https://xkbcommon.org/doc/current/index.html), [compose-state documentation](https://xkbcommon.org/doc/current/group__compose.html).

Default eligibility requires a known foreground application/window and verified non-protected editable context where the supported accessibility/desktop adapter can provide it. Known password/protected fields always pause. Unknown focus pauses. A known app with unavailable sensitivity/committed-text information can be separately opted into a clearly described raw-key fallback; this is not a secure-field guarantee. A browser companion may improve context for supported browser content but does not grant universal visibility into native applications.

An eligible match emits a single-use nonce and context generation. The unprivileged broker evaluates the local snippet template and prepares clipboard content. Commit must arrive within 250 ms; intervening physical input, focus/layout/preedit change, lock/session transition, service disconnect or generation mismatch cancels it. A slow template falls back to explicit snippet selection; input processing never waits for a workflow or remote model. Trigger/delimiter deletion semantics belong to the workflow/snippet specification and must be shared fixtures, not independently implemented variants.

For after-delimiter activation, the only permitted held input is one delimiter keydown/up pair for at most 250 ms. Do not forward Enter/Tab and then attempt to undo its effect. On the next physical event, cancel and replay the held delimiter before forwarding that event only if the same eligible target/context remains valid; otherwise drop the held delimiter. Timer expiry follows the same rule. There is no general key queue. Immediate activation deletes only the known keyword; after-delimiter keep/drop behavior follows the shared snippet contract. An asynchronous workflow result requires fresh insertion authorization and cannot reuse the trigger nonce.

Before deletion and before insertion, revalidate the current context. This reduces races but cannot make focus changes atomic with compositor delivery. Test focus changes during each phase and document the remaining limitation. On `SYN_DROPPED`, resynchronize device state with libevdev, clear matching context and do not infer typed text from reconstructed events. [libevdev synchronization](https://www.freedesktop.org/software/libevdev/doc/latest/syn_dropped.html).

For ordinary paste, prefer a consented RemoteDesktop/libei session when available; otherwise the authorized input service can emit a bounded paste shortcut. If neither is available, copy and let the user paste. Portal grant persistence/revocation must be handled explicitly. [RemoteDesktop portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.RemoteDesktop.html), [libei](https://libinput.pages.freedesktop.org/libei/).

Do not assume a Wayland clipboard transfer proves that the intended field consumed a paste: transfers can be requested by other clients and do not identify the requester to the source. Default insertion leaves the inserted content on the clipboard and provides an explicit Restore Previous Clipboard action. Restore only if the current ownership generation is still Linuxcast's matching transaction; never overwrite a newer user copy. Any optional automatic restoration must be labelled best effort and must not use an unconditional timer.

### Leases, disarm and crash recovery

| Mechanism | Required initial value/behavior |
| --- | --- |
| App/session heartbeat | Every 250 ms; lease expires after 1 second |
| Worker heartbeat | Every 100 ms; supervisor kills unresponsive worker after 500 ms |
| systemd watchdog | 2 seconds; service uses `KillMode=control-group` |
| Parent death | Worker installs `PR_SET_PDEATHSIG` and checks the parent-death race |
| Emergency chord | **Left Ctrl + Right Ctrl + Escape**, recognized from physical events before remapping |
| Arm precondition | Virtual devices ready, all relevant physical keys released, valid profile and leases |
| Crash/emergency outcome | Disarmed until explicit user re-enable; supervisor may restart dormant but must not automatically regrab |

The emergency chord immediately disarms and clears pending expansions; it is hardcoded and cannot be overridden by a profile. Orderly disarm releases logically emitted keys, ungrabs devices, destroys virtual devices and closes descriptors. App quit/disconnect, session lock/change, lease expiry, disabled grant or helper mismatch disarms. A process crash relies on descriptor closure/device removal; actual no-stuck-key behavior must be validated with physical keys held during failure.

No unbounded input queue is allowed. Forwarding must remain independent of UI, database, network and IPC response times. Watchdog overload can produce a visible disarm and ordinary keyboard recovery; it must not create an autorestart/regrab loop. After an emergency, explain how to re-enable from settings without requiring the remapped keys.

### Service hardening and update rules

Use Debian 13/systemd 257-compatible hardening: `ProtectSystem=strict`, inaccessible user home, private temporary directory, `NoNewPrivileges=yes`, only `AF_UNIX`/`AF_NETLINK`, bounded tasks/memory, no core dumps and a read-only system except its dedicated runtime path. Saved grants are read-only to the service and changed only by the explicit administrative helper. Initial service limits are `MemoryMax=64M`, `TasksMax=16` and `LimitCORE=0`. Use `DevicePolicy=closed` with input character-device read access and `/dev/uinput` read/write access; the supervisor's validated selected-device allowlist further narrows actual opens. Do not set `PrivateDevices=yes`, which hides the required devices.

The proposed supervisor capability bounding set is `CAP_CHOWN CAP_SETUID CAP_SETGID CAP_KILL`, for socket ownership, dedicated-worker identity and teardown. The worker retains none. Root-owned input device permissions should avoid needing `CAP_DAC_OVERRIDE`; verify this on the supported distro. No `CAP_SYS_ADMIN`, long-running `CAP_SYS_MODULE` or general root shell facility is permitted. Any additional capability needs a documented security review and plan amendment, not a silent broadening. Exact unit/capability interactions are a native-security gate, not a claim already verified. [systemd execution hardening](https://www.freedesktop.org/software/systemd/man/257/systemd.exec.html), [resource/device controls](https://www.freedesktop.org/software/systemd/man/257/systemd.resource-control.html).

Package upgrades stop the service before replacing binaries, preserve grants, and require a new authenticated session and explicit rearm. Removal stops/disables the service. A stale worker or incompatible client never keeps a grab solely because a grant exists on disk.

## Native integration and release gates

Complete the following spikes before dependent features are marked implemented:

1. Launcher identity/global shortcut, focus/placement and portal consent on GNOME 48 and Plasma 6.3 Wayland, then both X11 sessions.
2. GNOME clipboard/window protocol and KWin long-poll command transport, including helper/companion restart and generation invalidation.
3. Clipboard history transfer/cancellation, ownership-loop prevention, portal/libei paste and copy-only fallback.
4. Mandatory bubblewrap execution on stock Debian, including missing/restricted namespace failure states.
5. Input supervisor/worker descriptor ownership, active-seat/lock leases, watchdog disarm and held-key recovery under actual device failure tests.

Input acceptance must cover disabled fresh install; cancelled polkit; enable/disable/reboot/upgrade/remove; wrong UID; stale/remote/TTY/greeter session; fast user switching and lock; USB/Bluetooth hotplug; new and competing-grab devices; self-device loop prevention; media keys and LEDs; Hyper threshold, repeat, both hands and multiple devices; real modifiers held; emergency chord; worker/supervisor/app `SIGKILL`; blocked IPC/CPU load; physical keys held during crash; `SYN_DROPPED`; layout/IME/dead keys; protected and unknown fields; focus changes during deletion/insertion; malformed/oversized messages; no raw key logs; sandboxed plugin denial.

Use native GTK, Qt, Chromium and terminal applications in both supported desktops. Test multiple monitors, fractional scaling, suspend/resume and disconnected keyring/portals/components. Record results per desktop/session and capability. These tests are mandatory before broad keyboard capture ships; source review alone is insufficient.
