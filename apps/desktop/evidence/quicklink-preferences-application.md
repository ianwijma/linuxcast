# Saved Quicklink preferences: application evidence

L2-05 bounded unfinished increment, 27 October 2026, on merged PR45/a44bbe6.
Contract f8c29a2; persistence/security bd4faf5; UI 61cd4be/0323aa5 (signed
authors a43b0a7/1f8f77a); production integration 489bec3.

## Behaviour and boundaries

Existing Quicklinks List/Actions supports explicit Pin/Unpin and Hide/Show.
Matching pinned rows precede unpinned rows; all 500 summaries are searched before
the 100-visible cap. Selection stays with a matching saved ID. Hidden rows are
excluded initially; Show hidden Quicklinks is reachable even with no results.
Included hidden rows visibly say Hidden and cannot Open. Reopening resets local
inclusion, without changing durable preferences. Metadata actions perform fresh
Get then full Save with CAS, preserving URL/name/tags/search config/other flag.
They never open a browser, copy, navigate or hide the launcher.

Migration 011 adds checked boolean columns with false defaults. Old records keep
ID/revision/content/times. Repository rejects corrupt flags; absent/false are
semantically equivalent and canonical false projections may be omitted. Owner,
main, preload and UI verify exact receipts. Uncertain writes block further
writes/Open until explicit Reload; no automatic replay or optimistic success.
Main fresh-loads hidden state and rejects literal and web-search Open before
native effects, including forged direct renderer requests.

## Validation

Linux amd64; Node 24.22.1, Bun 1.4.4, Electron 45, SQLite 3.53.4, GIO 2.72.4.
Actual sandboxed production app uses an owned private Xvfb X11 display, private
HOME/profile/XDG directories and a real private registered browser handler.
Only native dialog choices are instrumented. No user display/device/profile,
provider/private content or physical input is accessed.

- `bun run test:unit -- L2-05`: 223 passed, including 156 presentation tests.
- `bun run test:contracts -- L2-05`: 12 passed.
- `bun run test:security -- L2-05`: 32 passed, including exact flag receipts and
  hidden literal/search denial before native dispatch or usage recording.
- `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a bun run test:integration -- L2-05`:
  41 passed, including actual production flow (8.63 seconds). Registered launcher
  → Quicklinks → Pin/Hide → empty recovery → include hidden → denied hidden
  Enter/direct API → Show/Unpin → explicit real native browser argv/empty stdin.
  Search pin ordering, both true flags across complete restart, recovery and
  fresh empty query are verified. Final owner checks exact revisions/content;
  aggregate usage excludes names/labels/URLs/queries.
- Real owner 10→11 migration verifies schema10 consistent snapshot and unchanged
  tagged search definition, then preferences across usage/index clear and reopen.
  Historical schema9→10 test inspects old SQL until the latest migration.
- `bun run test:ui -- L2-05`: 37 Chromium keyboard/axe checks passed, including
  dark/light recovery, unknown/mismatched receipts, pending writes, IME and
  held Enter. Author also passed three focused follow-up keyboard/IME checks.
- `bun run test:integration -- F2-01`: 43 existing storage/recovery checks passed.
- Full typecheck, scoped lint, plan validation and diff checks passed.
- Independent GPT-6.1 SOL/high persistence/security and UI/source/capture review
  clean. Post-publication synchronous query/selection/Back invalidation finding
  fixed by checking current context before constructing the Save promise; three
  regressions verify zero Save/effects. Integrated UI trees match reviewed author.

## Design and affected states

DESIGN.md Shell and navigation, Results and actions, List/Form, States and motion,
Accessibility; canonical tokens and existing shared primitives. Nine component
captures and six actual dark/light affected captures independently inspected.
Actual files: `quicklinks-application-{dark,light}-{preferences-empty,preferences-hidden,preferences-pinned}.png`.
Component files: `packages/builtins/quicklinks/evidence/*preferences*.png`.
Public synthetic example domains, names and labels only. Actual axe passed.

## Explicitly unfinished

This is a reviewed, tested application increment. L2-05 remains in progress.
These private Xvfb/Chromium checks do not establish native GNOME/KDE Wayland/X11,
assistive technology, performance or release acceptance. Native GIO acknowledges
handoff, not page completion/focus. Root saved-link commands/frecency/shortcuts,
full snapshot/context/cursor/snippet/argument/component builders, file/registered
URI targets, browser/open-with, native export and all prerequisite/desktop/release
requirements remain mandatory. Complete agreed local 1.0 scope is unchanged.
