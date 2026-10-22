# Actual Electron host evidence

23 October 2026; authorized Pop!_OS22.04 / GNOME42.9 X11 host. Electron45.0.0, Chromium156.0.8078.48; exact runtime/kernel/renderer sandbox probe in `runtime.json`.

`node spikes/workflow-ui/tests/private-session.ts` exits0. It proves actual sandboxed Electron keyboard graph editing; loading/empty/error/permission/cancelled/disabled states; dark/light axe; 200% actual Electron zoom with no horizontal overflow; forced colors/reduced motion; native AT-SPI role/focus delivery for three synthetic controls. `native-at.json` records names/roles/focus events from only the test app.

The screenshot files show only this synthetic application. The zoom screenshots use Electron's native window capture because the browser CDP full-page path cropped zoomed output. The top and inspector images show separate scroll positions at200%.

Orca is deliberately not started on the user's display. This is partial S0-06-UI evidence, not a Debian/GNOME48/KDE/Wayland release pass or complete screen-reader proof. See the separate `electron-xvfb-orca/` results.
