# F1-02 — launcher sizing at 200% zoom

31 October 2026. This is bounded production Electron evidence, not supported
Debian desktop, Wayland, screen-reader or release acceptance.

## Behaviour and design

At base `e265dc6`, the renderer reported CSS pixels while the native owner used
them as desktop-independent pixels. The shell also allowed a 560 CSS-pixel view
inside a native window capped at 560 pixels. The new actual Electron regression
failed at zoom 2: the footer was below the viewport and the document scrolled.

The shell now constrains its flex layout to the native viewport, scrolls the
body, and preserves the query/footer. Natural-height reporting includes clipped
body content, observes content changes, caps requests at the existing 4096 limit,
and detects scale changes. Main applies its own current zoom, existing work-area
and 560-pixel bounds, and avoids redundant native resizes. Short searches can
shrink the window; clearing them can grow it again.

The stronger last-result check exposed footer wrapping after a long selection
title changed. Giving the context its available flex width preserves the body
and existing title truncation. Loading/error checks also exposed missing heading
semantics and startup-error focus: those states now have a level-one application
heading, and a failed initial state read focuses Hide without needing an earlier
successful state reply. Hidden-window state still prevents that focus request.

Design: [Shell and navigation](../../../docs/design/DESIGN.md#shell-and-navigation),
[Results and actions](../../../docs/design/DESIGN.md#results-and-actions),
[States and motion](../../../docs/design/DESIGN.md#states-and-motion),
[Accessibility](../../../docs/design/DESIGN.md#accessibility), and
[Review gate](../../../docs/design/DESIGN.md#review-gate). Shared tokens/primitives
remain in use. No dependencies, schema, permission, migration, privileged input
or general renderer API changes.

## Verification

Platform: Pop!_OS 22.04 amd64, kernel 7.1.1-76070101-generic, private Xvfb
21.1.4 display; Node 24.22.1/Bun 1.4.4, Electron 45.0.0 with Chromium
156.0.8078.48 and embedded Node 24.22.0. Frozen dependency install, SQLite addon
rebuild and production build completed. All profiles/HOME/XDG paths are private;
the host session bus is excluded. Only synthetic desktop entries/content appear.

- `node scripts/test-runner/run.ts unit F1-02`: 15 passed, including native
  zoom conversion, upper bounds and duplicate resize suppression.
- `node scripts/test-runner/run.ts security F1-02`: 54 passed.
- `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a node scripts/test-runner/run.ts integration F1-02`:
  both production scenarios passed in 18.79 s (legacy 11.068 s; new 6.533 s).
- `bun run typecheck` and `bun run lint`: passed on the pinned tools.
- New regression: 120 private desktop entries, short query then scale change,
  growth back to the cap, compact width, empty results, positive body height,
  Tab/End reaching the final result, alias form Save/Cancel tab order, Escape
  dismissal and actual secondary-process reopen with query focus restored.
- Seven affected views have zero axe violations. Forced colors, reduced motion
  and fallback color schemes are Chromium media emulation, not OS preference
  integration. Pending/error state replies are injected at the trusted test main
  handler; no backend failure/recovery proof is inferred. Error focus is checked.
- Each capture checks viewport stability across twelve animation frames. Native
  `capturePage` captures the full zoomed surface; the initial CDP captures cropped
  to CSS dimensions and were replaced before publication.

The legacy fixture initially failed because it still expected nine rows and an
older preload surface. It now expects fourteen rows and the exact named methods
already independently enumerated by the existing preload security tests. Existing
launch, action, persistence, denial, navigation and shutdown assertions remain.

Independent SOL 6.1/high Standards and Spec reviews of `566a9b3` found no concrete
blocker and inspected the initial three full native captures. Spec requested
last-result and fallback coverage; the coordinator added it, reproduced/fixed the
additional layout/semantic/focus issues above, and verified the final suite.
Those follow-ups are coordinator-validated; no second independent clean review
of them is claimed.

## Affected captures

- [Dark launcher](shell-zoom-200-dark.png), [light launcher](shell-zoom-200-light.png).
- [Emulated forced colors and reduced motion](shell-zoom-200-forced-colors.png).
- [Dark loading](shell-zoom-200-loading-dark.png), [light loading](shell-zoom-200-loading-light.png).
- [Dark error](shell-zoom-200-error-dark.png), [light error](shell-zoom-200-error-light.png).

F1-02-UI stays **pending**. Native assistive technology, Debian GNOME/KDE
Wayland/X11, OS text/high-contrast preferences, performance and package/release
gates remain outstanding. This change does not establish global shortcuts,
compositor activation, selected-device consent or any input-service authority.
