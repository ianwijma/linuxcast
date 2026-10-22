# Launcher actual screen-reader harness and evidence

The task-owned harness is `../../tests/at/xvfb-orca.ts`. Source5876ffe received independent coordinator review before the authorized private-Xvfb host run below. The current guest remains reserved for native input work; no guest graphical session or accessibility process has been started. Source/evidence review and a coordinator reservation remain required for target execution.

```sh
node spikes/launcher/tests/at/xvfb-orca.ts
```

Prerequisites: the frozen repository dependencies and explicit Electron setup, Node24, Xvfb/xauth, xdotool, dbus-daemon/dbus-run-session, AT-SPI registry, Python pyatspi/gi/dbus, Orca and Speech Dispatcher with `sd_dummy`/ALSA null support. A target run should record Debian13 and exact package/runtime versions. A slow or unavailable runtime fails; no skip or headless-browser result becomes screen-reader success.

The command creates a new Xvfb display without inherited host display/session credentials, then independent session and accessibility buses, a real registry, in-memory accessibility discovery, private HOME/preferences and memory-only GSettings. It builds and launches the unchanged actual launcher main/custom protocol/preload/resources with `chromiumSandbox:true`. Its temporary shortcut exists only on this display. It never installs a desktop entry, changes desktop accessibility settings, opens physical input or observes other applications.

The intended assertions are actual renderer sandbox/context-isolation and no renderer Node; actual AT-SPI roles and fresh focus events; actual Orca startup; and newly generated presentation plus Speech Dispatcher delivery after fixed native keys for five controls: Search commands, Hide launcher in the actions panel, restored Actions control, Record shortcut, and Cancel shortcut change. The observer refuses unexpected application PIDs before traversing content. Only known public labels, roles, focus sequence counters and booleans are retained. A distinct Dismiss anchor is processed before search/recorder tests so delayed earlier utterances cannot satisfy them.

Speech uses a private server with only `sd_dummy` and explicit ALSA `null`; braille is disabled. Raw Orca debug and preferences are temporary and deleted. Screenshots use only the synthetic launcher's window. The harness writes selected runtime metadata, five native/presentation checks and safe summary JSON under `results/`; incomplete assertions or cleanup produce a nonzero exit and explicit incomplete/cleanup-failed report.

**Current host result: incomplete, exit3.** [Preserved Orca42 evidence](host-orca42/README.md) records actual Electron sandbox success, Orca startup and Dismiss anchor presentation, and native Search entry focus/event success. The combined fresh Search presentation/per-label Speech Dispatcher delivery check did not pass within10s; the remaining four controls were not executed. This cannot pass S0-01-UI. Per-focus generated/delivery booleans were subsequently split for clearer future diagnostics without changing either assertion; that instrumentation update is not represented as part of the archived run. Target Debian/Orca48 execution is pending the guest reservation.

Even a passing run establishes generated screen-reader presentation on actual Electron/Xvfb, not audible/tactile quality, native GNOME/KDE/Wayland integration or the four-session desktop matrix. Existing eight unit/fixture and ten actual-host integration checks remain separate evidence. The coordinator owns S0-01-UI acceptance and all outstanding target-session gates.
