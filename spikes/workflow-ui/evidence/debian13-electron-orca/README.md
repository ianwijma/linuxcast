# Actual Debian13 Electron and Orca evidence

Executed 22 October 2026 UTC (23 October Australia/Sydney), in a disposable Debian13 amd64 guest on QEMU TCG. Kernel `6.12.113+deb13-cloud-amd64`; Electron45.0.0 / Chromium156.0.8078.48; Orca48.1-1+deb13u2; AT-SPI2.56.2-1+deb13u2; Python pyatspi2.46.1-1; Speech Dispatcher0.12.0-5; Xvfb21.1.16-1.3+deb13u4. This uses actual guest kernel namespaces and the Chromium renderer sandbox; there is no `--no-sandbox` fallback. The VM has no host session/device mounts.

Source: c34ecd6 plus the task-owned startup-marker, bounded cold-start deadline and supplementary capture cleanup fixes. Executed `tests/electron-check.ts` SHA256: `a5940859228e7e0c6d9c5b33128623af194bcc86e467fb417542837086af3f96`. Node24.22.1 and Bun1.4.4 execute the harness. A frozen dependency install and explicit `bun run setup:electron` succeeded. The initial installation exhausted the guest's987MiB `/tmp` tmpfs; only this task's files/cache were moved to its guest-home directory, with a private disk-backed `TMPDIR`. The first5s cold-start attempt timed out under emulation; the final initial-load deadline is bounded60s. No acceptance assertion was skipped.

Final command, from the separate guest checkout:

```sh
PATH=/tmp/linuxcast-node24:/tmp/linuxcast-bun144/bun-linux-x64:$PATH \
TMPDIR=/home/debian/linuxcast-workflow-tmp \
node spikes/workflow-ui/tests/xvfb-orca.ts
```

The command exits0. `runtime.json` records actual sandbox/context-isolation preferences and the sandboxed-preload booleans, no renderer Node, keyboard add/configure/connect/remove, dark/light axe with zero violations, affected fixture states, real Electron200% zoom without horizontal overflow, forced colors and reduced motion. Screenshots contain only synthetic application content; the verified200% inspector capture uses native Electron window capture. A supplementary capture after scrolling to the top repeatedly returned the previous compositor frame on Xvfb; that duplicate was removed, not represented as a second scene.

`native-at.json` proves real AT-SPI roles and focus-event delivery for `Node label`, `Apply configuration`, and `Move node down`. `orca.json` separately proves that the actual installed Orca process starts its AT-SPI event loop, sends generated speech to actual private Speech Dispatcher, and generates each of those three presentations anew after native Tab/Shift+Tab input on only the disposable Xvfb display. No generator was substituted for the screen-reader process.

All buses, profile/preferences, runtime directories, accessibility discovery and speech sockets are private. GSettings uses an in-memory backend. The observer refuses unexpected application PIDs before traversing content and records only allowlisted fixture labels/roles/events. Speech uses `sd_dummy` and explicit ALSA `null`; braille is disabled. No raw Orca debug, SSH keys, VM disks or private application content is committed. Process cleanup was verified after the run.

This is actual Electron/native-AT/Orca generated-presentation evidence on Debian13 Xvfb. It is not audible/tactile quality assurance or a GNOME/KDE/Wayland desktop-matrix claim. The older hostOrca42 incomplete result remains preserved in `../electron-xvfb-orca/`; it is not rewritten as a pass. Acceptance status and release checks remain coordinator-owned.
