# Unconfirmed launcher activation — bounded S0-01 UI change

The actual GNOME48 X11 explicit-focus attempt remains failed at ordinary CLI
Show: the exact own launcher became visible while the decoy retained focus
(`../native-session/gnome-x11-explicit-focus/report.json`, request15). This change
adds an honest user-facing fallback; it does not establish a new focus fix.

The existing single restore/show/focus request is unchanged. A pending X11
request is cleared by observed focus, a post-request already-focused observation,
or Hide. An unfocused outstanding request exposes the existing component-required
state and a search-view notice. The help action explains desktop app switching or
clicking the window now, and states that no validated GNOME/KWin activation
companion is connected in this prototype. No retry loop, privilege change,
activation bridge, new IPC operation or simulated successful activation is added.
A later ordinary blur after observed focus does not become a component failure;
repeated Show while already focused requires no new focus event. Wayland's
existing capability view is unchanged by this X11-only notice.

The help heading receives focus, Escape returns to search, and the named details
region is keyboard-focusable/scrollable. Styles reuse existing notice/button and
focus-ring primitives and the unchanged design tokens. Applicable DESIGN
sections: shared visual system, keyboard/accessibility, states and motion, and
Review gate. Final affected-state dark/light renderer screenshots are public
prototype text only; they are real sandboxed Electron UI with explicitly
synthetic focus-state messages, not observations of GNOME focus behavior.

## Checks and scope

- Configured S0-01 unit/UI:27/27 (23 production/data/lifecycle-boundary tests,
  four renderer fixture checks). The actual production command/snapshot/event
  definitions are exercised with refused/accepted and repeated-Show/later-blur
  fixtures. Initial new fixture extraction wrongly registered listeners on the
  absent-window fixture; its guard was corrected without changing the app path.
- Strict TypeScript and affected ESLint pass. No dependency/lock/registry changes.
- Private Xvfb, Electron45.0.0/Chromium156.0.8078.48, sandbox/context isolation,
  renderer Node/process absent. One owned app/profile, no host display, settings,
  clipboard or physical input. Keyboard Enter/help, focus transfer, End scrolling,
  Escape/search return and synthetic recovery/later-blur checks pass. Four
  WCAG2A/AA/2.1AA axe audits have zero violations. `ui-check.json` records exact
  unsigned/dirty source hashes (sourceCommit=null) and runtime versions.
- `accessibility-audit.json` is the final fixed-rule-ID audit. The first audit
  failure (`initial-scrollability-failure.json`) found the real keyboard issue
  on the longer help view; the named focusable region fixes it. No audit rules
  were disabled. Initial check-adapter failures are preserved privately: restricted launch
  unavailable; Electron does not support axe's default multi-page Target API;
  and querying the Playwright process accessor after close used a disposed
  dispatcher. The established in-page axe audit and retained own process handle
  fix those harness issues. A keyboard-scroll assertion now waits at most2s for
  the browser's asynchronous scroll update. Preliminary images are retained privately as
  deficient check evidence, not completed runs or GNOME observations.

Reproduce only on a private display:

```
PATH=/tmp/linuxcast-node24:/tmp/linuxcast-bun144/bun-linux-x64:$PATH LINUXCAST_PRIVATE_UI_DISPLAY=1 xvfb-run -a -s '-screen 0 1280x900x24 -nolisten tcp' node spikes/launcher/tests/activation-help-ui.ts
```

The script refuses an absent private-display marker/Xauthority and uses fresh
owned HOME/XDG/profile plus absent private session/audio bus addresses. It sends
controlled public state only to its own renderer. It closes the app and removes
its own profiles. It is not a process-tree/physical desktop acceptance suite.

## Required activation component and remaining acceptance

The exact missing GNOME implementation belongs to P1-02: a bounded authenticated
broker request for the lifetime-bound own launcher handle, enable/version/state
checks, and the companion's fixed activation operation. GNOME Shell48.7's
[Main.activateWindow](https://raw.githubusercontent.com/GNOME/gnome-shell/48.7/js/ui/main.js)
switches workspace if needed and calls Meta window activation with current event
time. An acknowledgement or method return must not claim focus: success still
requires observing the same live launcher as focused. Current S0-02 adapters
provide geometry/place, not this activation operation. There is no arbitrary
GJS/eval/D-Bus forwarding workaround. The KDE path belongs to P1-03 and requires
its own supported script/queue result plus observed focus. These are existing
component obligations, not a new approval gate or a claim they are installed.

This advances the bounded S0-01 UI/error-state behavior and adds meaningful
keyboard/visual/audit evidence. It does not newly close AC01 (the existing
focus-or-component criterion), AC02, target-session AT, native efficacy or the
full desktop/release matrix. Prior52 host checks/Orca48/Wayland evidence retain
their original scope. The next native check is a separately scheduled exact-source
GNOME48 X11 run confirming the visible-unfocused notice and manual desktop
selection recovery while preserving the failed automatic-focus assertion; the
current VM reservation belongs to the independent owned-control lane. Actual
companion activation must be implemented/tested in its owning task before any
reliable automatic-focus claim. No new native test is authorized by this source.
