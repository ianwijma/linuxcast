# Instrument renderer in the production shell (D1-02)

Actual Electron 45.0.0 captures of the bundled production shell, produced by the
F1-02 flows `apps/desktop/tests/{shell,shell-accessibility}.integration.test.ts` on a
private Xvfb display (isolated HOME/XDG profile, synthetic desktop entries and storage,
nonexistent session bus, Chromium sandbox on). Pinned Node 24.22.1/Bun 1.4.4.
This is renderer/private-Xvfb proof only, not Debian 13, GNOME/KDE Wayland/X11 or
native screen-reader acceptance. Earlier files in `../` are historical.

| Files | State |
| --- | --- |
| `shell-{dark,light}.png` | Root launcher: status band, Instrument rows/tiles, footer status line |
| `command-visibility-{dark,light}.png`, `alias-{dark,light}.png`, `open-url-{dark,light}.png`, `application-action-{dark,light}.png` | Management list, alias and URL Forms, declared application actions |
| `shell-zoom-200-{dark,light}.png` | Native 200% zoom: rows grow, footer labels hide visually, keycaps remain |
| `shell-zoom-200-actions-{dark,light}.png`, `shell-zoom-200-actions-compact-dark.png` | Action panel at 200% in 720×560 and 600×400 windows; header/filter visible, list scrolls |
| `shell-zoom-200-forced-colors.png` | Forced colours with reduced motion |
| `shell-zoom-200-loading-{dark,light}.png`, `shell-zoom-200-error-{dark,light}.png` | Fixed renderer-state fixtures for pending and failed shell state (not backend proof) |

Data-settings captures from the same flow are intentionally not kept here: Local data
is refreshed by its own reserved lane.
