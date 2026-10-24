# Actual private-Xvfb host Orca42: incomplete

Executed23 October2026 Australia/Sydney on Pop!_OS22.04 amd64, Linux7.1.1-76070101-generic. Actual Electron45.0.0 / Chromium156.0.8078.48, installed Orca42.0, Node24.22.1. This is a disposable Xvfb display with private session/AT buses and a private dummy/null Speech Dispatcher; it uses no host-display hooks, audible output or global settings.

Reviewed source:5876ffe36f5f0fd86d8ef624fcecfb03e27719c8. Executed checker SHA256:b6da1c7c0735a9c74b94e832cf3b7b62ee2f5c97f03a14b134a36b50625078f6, also recorded in runtime.json.

`node spikes/launcher/tests/at/xvfb-orca.ts` returns exit3. Actual launcher resources/custom protocol/preload run with renderer sandbox and context isolation true, renderer Node absent and no `--no-sandbox`. Actual Orca startup and the distinct Dismiss anchor presentation complete. The observer then sees a new native `Search commands` entry focus event after the fixed native Shift+Tab key. The combined assertion requiring fresh Search presentation and per-label Speech Dispatcher delivery fails its10s deadline. The report does not distinguish which half failed; no claim is made about either one individually. Remaining four controls are unexecuted, not passed or denied.

The safe JSON records selected runtime booleans, allowlisted native labels/roles/focus events and incomplete stage. No raw Orca debug or preferences are retained. No screenshots were taken before failure. Subsequent diagnostic instrumentation records generated and delivered booleans separately, preserving both required assertions; those newer fields are not fabricated into this archived run.

This partial run does not pass S0-01-UI or establish target Debian, GNOME/KDE/Wayland, audible/tactile quality or physical-session evidence. Target Orca48 testing remains pending the coordinator's guest reservation.
