# Instrument foundation — product regression evidence

The shared D1-01 foundation was authored by Claude Opus5.5 at medium effort:
signed sourceb40bce040762c9d4d94433db02a84705736fb8c8 plus signed correction
ecfd891d234e667d4cffd692caede7191e0f59c4, integrated unchanged as6868fae.
All assigned Opus source/artifacts and authorized consumer tests remain
byte-identical. These captures exercise the existing
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

On the corrected source, both actual production scenarios pass in18.81s:
resident shell/security/lifecycle10.988s and zoom/accessibility6.482s. The earlier
pre-correction20.00s result remains historical evidence. Sandboxing/context isolation/no Node,
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
| [Credential empty dark](credentials-empty-dark.png), [light](credentials-empty-light.png) | Real credential window with synthetic session observer and denied-keyring adapter |
| [Credential session](credentials-session-light.png), [locked](credentials-locked-light.png), [200%](credentials-200-light.png) | Confirmed session-only fixture metadata, denied session and scaled controls; no saved-key readback |

Mapped F2-02 actual credential and diagnostic scenarios also pass2/2 in11.63s
(5.452s+5.368s) on the corrected source. They use an explicitly synthetic session
observer, denied-keyring adapter and instrumented native confirmations. They do
not prove actual Linux session observation, keyring storage or provider dispatch.

All content is synthetic public fixture data. Profiles and any export files use
task-private temporary directories. The host session bus is excluded; no keyring,
provider or input operations are involved.
Twenty-nine incidental historical PNG recaptures were restored to their exact Git
blobs; these thirteen files preserve current evidence separately.

Coordinator independently passes134D1-01 token units,28D1-02 behavior units,
52F2-02 UI units and33planning-validator tests. This includes107shared token
schema fixtures (20valid,87invalid). Opus reports12D1-01 browser checks,11D1-02 browser
checks and the listed downstream component suites in its separate
[component evidence](../../../../packages/ui/src/primitives/evidence/instrument/README.md).
The reported L1-01 pending-fallback fixture failure also occurs twice on baseline
b9fefd2;13later serial cases were not run. It remains explicitly outstanding for
the renderer lane. Do not treat that partial suite as a pass.

Current coordinator typecheck/lint/plan/whitespace and55F1-02 security checks
also pass (13.25s, including97offline Python checks). There are no remaining
coordinator test processes for this checkpoint.

Independent Standards/Security-and-Spec review and current-head CI are required
before merge. D1-01-UI, supported Debian/GNOME/KDE Wayland/X11/native AT, complete
renderer/workspace adoption and full local1.0 acceptance remain pending. Historical
criterion acceptance is unchanged. New Row/GroupCaption/GlyphTile APIs introduce
no ViewModel wire field, IPC, permission, provider or persistence behavior.

Initial independent reviews found four P2 defects, all corrected by Opus:
own-property shortcut lookup through validated action data;480px/200% trailing
row containment; exact Python/TypeScript schema parity; and truthful unclassified
legacy unavailability. New regressions fail against originalb40. The coordinator
ratifies the additive unclassified `unavailable` StatePlate kind and its canonical
table entry; unsupported/denied classification now requires an explicit reason.
This adds no serialized capability state or effect authority. Fresh final
independent recheck of the correction remains required.
