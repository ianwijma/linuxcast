# Actual workflow workspace captures — Instrument refresh (W2-01 / W2-03)

Produced by the existing production Electron flows after the Instrument presentation refresh:
`tests/workflow-editor.integration.test.ts`, `tests/workflow-run.integration.test.ts` and
`tests/workflow-launcher.integration.test.ts`. Public synthetic workflow names and text only. The earlier
`../workflow-*-application-*.png` captures are historical and unchanged.

| File | State |
| --- | --- |
| `workflow-editor-application-{dark,light}-saved.png` | Registered launcher → editor; keyboard-built three-node graph explicitly saved (exact receipt notice), Run enabled for the saved version |
| `workflow-editor-application-light-zoom-200.png` | Native `webContents.setZoomFactor(2)`: unchanged projection factor, typed labels between non-overlapping cards (captured with `webContents.capturePage()`) |
| `workflow-run-application-dark-approval.png` | Explicit Run of the saved version; real PermissionBroker clipboard approval pending |
| `workflow-run-application-light-result.png` | After real broker decision: host succeeded with clipboard receipt (clipboard of the owned private Xvfb display, seeded with a public sentinel; no host clipboard) |
| `workflow-launcher-application-dark-open.png` | Saved Keyword opened from launcher without any run |
| `workflow-launcher-application-light-result.png` | Explicit Run from the launcher-opened entry with host result |

Environment: Linux amd64, Node 24.22.1, Bun 1.4.4, Electron 45.0.0 (read-only dist override
`ELECTRON_OVERRIDE_DIST_PATH`), better-sqlite3 rebuilt for this worktree via `bun run setup:sqlite`, owned
private `xvfb-run -a -s "-nolisten tcp …"` X11 display, `LINUXCAST_PRIVATE_DISPLAY=1`, unset
`DBUS_SESSION_BUS_ADDRESS`/`WAYLAND_DISPLAY`, Chromium sandbox on, private HOME/XDG/profile created by each
test. Source: parent 59549f0 plus this branch's owned presentation changes. axe (legacy mode) passes on each
captured state. This is not GNOME/KDE, Wayland, native X11 session or assistive-technology acceptance.

## Coordinator integration on approved PR92

Opus `069669e` (initial `8e3d111`) is integrated unchanged at `7816d71` on
`8de8612`. Current coordinator checks pass:24/37 units,5 contracts,15/2 security,
22/24 Chromium cases (30.2s/17.9s), full typecheck/lint/plan/whitespace.
W2-01 integration passes8 checks in6.99s (editor5.639s); the launcher flow passes
in5.15s (actual4.699s), and the explicit run/approval flow passes in8.35s
(actual7.56s). All6 incidental screenshot recaptures were restored.

The parent-owned version7 migration fixture now seeds legacy columns directly
after closing the sole owner, then upgrades through the actual current18 schema.
The original fixture failed before reaching its migration assertions because it
called today's repository against old columns and expected schema9. All7 fixture
cases pass after the test-only repair; source preservation and recovery-snapshot
assertions remain. Production storage/migrations are unchanged.

Measured UI projection prevents default-card/typed-label overlap at100/200% text
and maps real pointer/keyboard moves back to stored units. Resizing alone writes
nothing. The native zoom test checks every node intersects the canvas and labels
do not overlap; long chains can extend beyond the canvas and remain pannable or
reachable with Fit view. It does not assert whole-card containment. Left/right
ports retain the existing horizontal stored layout and typed compatibility.

All39 new public captures (14 canvas,18 run-panel,7 product) remain author-identical.
The coordinator directly inspected editor/native-zoom and200% component captures.
Initial independent Standards/Security-Spec reviews are active on frozen
`7816d71`; no clean review, publication or further native/task acceptance is inferred.
