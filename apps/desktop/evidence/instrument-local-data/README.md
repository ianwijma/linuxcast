# Local data window — Instrument settings composition (F2-02 UI refresh)

Actual production Electron captures written by `apps/desktop/tests/diagnostics.integration.test.ts`
(sandboxed, private Xvfb `-nolisten tcp`, isolated HOME/XDG profile, nonexistent session bus,
synthetic diagnostics records, instrumented native save/confirmation dialog responses). Public
synthetic content only: no secrets, host paths, record bodies or logs. Earlier
`apps/desktop/evidence/diagnostics-application-*.png` and `data-settings-*.png` remain as history of the
previous appearance and are unchanged.

Design references: [DESIGN.md](../../../../docs/design/DESIGN.md) — Instrument direction (hanging
alignment, selection rail, shape-coded states, edge detail), Workspaces/tokens, Results and actions
(Row, GroupCaption), Controls and keycaps, Settings and permissions, States and motion, Accessibility.
Selected proposal: `docs/design/proposals/raycast-refresh/opus/` (Workspace frame, Settings).

| File | State |
| --- | --- |
| `local-data-dark.png`, `local-data-light.png` | Initialized window, opaque themes, initial search focus, Credentials current (rail + `aria-current`); axe 0 violations |
| `local-data-keyboard-navigation-light.png` | Sidebar roving focus (ArrowDown) on Tool diagnostics while Application logs stays current; one sidebar tab stop; exact fixed URL unchanged |
| `local-data-200-percent-focus.png` | Native `setZoomFactor(2)`: narrow reflow, Tab order search → current category → Export → Clear, focused Clear fully inside the window, no horizontal overflow; axe 0 |
| `local-data-busy-captured-light.png` | Pending native save dialog: “Exporting application logs…” band stays above content after filtering to and selecting File index; other actions `aria-disabled`; axe 0 |
| `local-data-cancelled-light.png` | Save dialog cancelled → Cancelled plate (“Application logs: nothing was exported.”), not success |
| `local-data-confirmed-light.png` | Confirmed native clear → Done plate only after the backend `cleared` reply |
| `local-data-error-light.png` | Malformed synthetic diagnostics → fixed main reply in an Error band with `code: internal`; canary text never rendered; axe 0 |
| `local-data-status-focus-light.png` | Error band stuck at the top of the scrolled content; sidebar Settings activation lands the focused category below the measured band, then Tab focuses Export settings fully visible (no status hit). The same run checks busy replacement, the busy band growing in a 640px window, and cancel, with focus staying unobscured |
| `local-data-recovered-light.png` | User-initiated, separately confirmed clear of only Tool diagnostics → Done; nothing replayed |
| `local-data-filtered-empty-light.png` | No matches: sidebar count 0 and filtered-empty plate; previous outcome band still visible; axe 0 |
| `local-data-forced-colors-reduced-motion.png` | Chromium `forcedColors: active` + `reducedMotion: reduce` emulation on the real window (system-colour borders, Highlight rail/outline, transitions 0s) |

Limitations: Chromium/Xvfb evidence only. No Debian 13, GNOME/KDE, Wayland, Orca, native high-contrast
theme or physical native dialog interaction is claimed. The initialization-unavailable/retry and the
credential-open outcomes are covered by synthetic-bridge component tests
(`apps/desktop/src/renderer/data-settings/local-data.test.tsx`), not product captures; opening
Credentials in a product run requires the credential session fixture and was deliberately not added here.
