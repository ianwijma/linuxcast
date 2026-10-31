# Instrument foundation — product regression evidence

The shared D1-01 foundation was authored by Claude Opus5.5 at medium effort:
signed sourceb40bce040762c9d4d94433db02a84705736fb8c8. The coordinator integrated
it unchanged as65fe766, then merged develop/PR86 at e268a023. All assigned Opus
source/artifacts remain byte-identical. These captures exercise the existing
production shell with the changed controls, keycaps and state primitives.
They do not demonstrate the later D1-02 renderer or workspace composition update.

Applicable canonical design sections: Tokens, Instrument direction, Controls,
keycaps and line icons, States and motion, Accessibility and Review gate.

On the Pop!_OS22.04 amd64 host, pinned Node24.22.1/Bun1.4.4/Electron45.0.0,
authenticated private Xvfb1920×1080, isolated profiles and synthetic data:

```
env -u DBUS_SESSION_BUS_ADDRESS -u WAYLAND_DISPLAY \
  PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH \
  ELECTRON_OVERRIDE_DIST_PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/linuxcast-emoji-ui/node_modules/electron/dist \
  LINUXCAST_PRIVATE_DISPLAY=1 \
  xvfb-run -a -s '-screen 0 1920x1080x24 -nolisten tcp' \
  node scripts/test-runner/run.ts integration F1-02
```

Both actual production scenarios pass in20.00s: resident shell/security/lifecycle
12.294s and zoom/accessibility6.427s. Sandboxing/context isolation/no Node,
singleton ownership, window hide/reopen/Quit, native viewport/footer bounds at
200% zoom, compact window, last-row keyboard visibility, form tab order and
loading/error focus paths pass. The fixture explicitly injects pending/error
replies and media preferences; it establishes no supported-session or Orca proof.

| Captures | Affected behavior |
| --- | --- |
| [Shell dark](shell-dark.png), [light](shell-light.png) | Existing production list/footer with restyled controls and per-key caps |
| [Zoom dark](shell-zoom-200-dark.png), [light](shell-zoom-200-light.png) | Actual200% Electron zoom; footer and results stay in the native window |
| [Error dark](shell-zoom-200-error-dark.png), [light](shell-zoom-200-error-light.png) | Shape-coded error state and recovery controls at200%; injected unavailable renderer reply |
| [Local data dark](data-settings-dark.png), [light](data-settings-light.png) | Existing settings controls and fields; feature composition remains for its later lane |

All content is synthetic public fixture data. Profiles and any export files use
task-private temporary directories. The host session bus is excluded; no keyring,
provider or input operations are involved.
Nineteen incidental historical PNG recaptures were restored to their exact Git
blobs; these eight files preserve current evidence separately.

Coordinator independently passes26D1-01 token units,27D1-02 behavior units and
30planning-validator tests, full typecheck/lint and55F1-02 security checks13.29s
(including97offline Python fixtures). Opus reports11D1-01 browser checks,11D1-02 browser
checks and the listed downstream component suites in its separate
[component evidence](../../../../packages/ui/src/primitives/evidence/instrument/README.md).
The reported L1-01 pending-fallback fixture failure also occurs twice on baseline
b9fefd2;13later serial cases were not run. It remains explicitly outstanding for
the renderer lane. Do not treat that partial suite as a pass.

Independent Standards/Security-and-Spec review and current-head CI are required
before merge. D1-01-UI, supported Debian/GNOME/KDE Wayland/X11/native AT, complete
renderer/workspace adoption and full local1.0 acceptance remain pending. Historical
criterion acceptance is unchanged. New Row/GroupCaption/GlyphTile APIs introduce
no ViewModel wire field, IPC, permission, provider or persistence behavior.
