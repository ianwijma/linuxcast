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

## Coordinator integration and review corrections

Integrated Opus source `a9090c1` on top of approved Saved permissions PR90.
Initial Standards and Security/Spec reviews of `1e4682b` found four P2s; the
correction stacks split previews when scaled minima cannot fit, keeps action DOM
identity/focus across live groups, restores backward list Left and accepts only
exact Ctrl+Home/End grid jumps. Six new browser regressions fail the prior
`5197d94` source and pass the correction (author negative controls). Fresh independent final recheck `3fe2a5e4` of `184d4d74` is clear on both
Standards and Security/Spec axes. It independently passes 28 D1 units, 10 glyph
units, all30 renderer browser cases, six controlled probes and old-source
negative controls, typecheck/scoped lint/plan/whitespace; all8 changed/new captures
were inspected. The four initial findings are closed.

Coordinator current pinned checks: 28 D1 units, 30 Chromium renderer cases
(40.2s), full typecheck/lint/plan and both actual shell Electron flows (25.76s) pass.
The real extension-query-clear test selects public catalogue row119, clears the
query, waits for the authoritative unfiltered snapshot and verifies the retained
selection is visible with input focus and active descendant preserved. It keeps
all existing no-Node/narrow-API/held-Enter/IME/normal-Quit assertions.

With PR90 merged, both permissions/workflow flows (22.54s) and both Local data/
credential flows (14.88s) also pass. One first combined permissions run raced
Refresh against the fixture-owned storage child's SIGKILL exit notification; an
unchanged isolated rerun passed (15.27s). The test now first observes the existing
read-only API's precise unavailable reply, then presses Refresh and asserts the
same rendered error. There is no product-source change, timed sleep, effect replay
or weakened assertion. Credential session/keyring and native dialog selection
remain explicitly synthetic fixtures; no host bus/keyring/provider was accessed.

Author additionally reports 350 downstream browser checks and 10 glyph units;
coordinator current323 L1 units,55 F1 and177 L1 security checks also pass
(1.32s/13.16s/1.59s respectively). Incidental screenshot recaptures were restored; the
new 720/800px 200% text split captures were inspected directly. All native Debian/
GNOME/KDE/Orca, physical-input, full-task and complete local1.0 gates remain pending.
