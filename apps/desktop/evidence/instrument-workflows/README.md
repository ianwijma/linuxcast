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
