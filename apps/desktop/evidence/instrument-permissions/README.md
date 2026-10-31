# F3-01 Saved permissions — Instrument refresh evidence

Recorded 1 November 2026 on lane branch `codex/f3-01-instrument-permissions`, based on approved
develop `e2b3a5a` (PR88). Task: [F3-01](../../../../docs/implementation/tasks/F3-01.md). This is
supporting presentation evidence only. F3-01-AC02 and F3-01-UI stay pending; no native assistive
technology, supported Debian desktop session or full-task acceptance is claimed or implied.

Historical `../permissions-application-*.png` captures and `../permissions-application.md` are unchanged.

## Before and after

Before: the existing standalone window showed a title row with Refresh/Close, bordered card rows that
truncated the source on one line, and an inline removal review of loose paragraphs.

After: the same window in the selected Instrument settings composition (no sidebar; it does not repeat
the Local data categories):

- Quiet opaque header with a fixed `system` noun tile, “Linuxcast settings”, Refresh and a ghost
  Close carrying the bound `Escape` keycap (`aria-keyshortcuts="Escape"`).
- 28/36 “Saved permissions” page title, lede and a neutral notice: saved decisions are not proof of
  current capability availability.
- Hanging divider rows: closed-vocabulary source tile (`workflow`, `system` for Linuxcast, `command`
  for extensions; the source kind is always repeated in text), operation heading, remembered
  classification (word plus `check`/`stateDenied` glyph shape; colour is neutral), and a two-column
  definition list of Source, Version, Scope and Updated with `divider` rows.
- Long source/version/scope text clamps visually only. The complete text remains in the DOM, the
  tooltip, the Review button's accessible name (`Review removal: <source> · <operation>`) and the
  keyboard-focusable “Complete saved decision” region of the review.
- Deliberate removal review: eyebrow, title, complete Requesting source/Version/Operation (plain words
  plus permission ID)/Declared scope/Current decision, the existing consequence copy, then Keep
  decision (initial focus) and Remove decision. The reviewed row carries `aria-current` with the
  selection surface and rail.
- The controller exposes only fixed receipt strings, so the post-removal receipt stays a neutral
  `role="status"` note, never a success plate. Read failures use the unclassified `unavailable` band
  (“Review current permissions”) because the controller does not pass a classification code.

Unchanged: controller wire and business semantics, opaque per-snapshot selection IDs, compare-delete,
stale/unconfirmed guards, pagination without totals or cross-page search, Escape order (review first,
then window), focus restoration (opener after Keep/Escape, Refresh after removal/staleness, Refresh
initial focus during loading), no URL/hash/query changes and no approval actions.

## Captures

Pinned Node 24.22.1, Bun 1.4.4, Electron 45.0.0 (read-only distribution override, Chromium sandbox on),
Pop!_OS 22.04 amd64, owned private `xvfb-run -a -s '-screen 0 1920x1080x24 -nolisten tcp'`, isolated
HOME/XDG, `DBUS_SESSION_BUS_ADDRESS` and `WAYLAND_DISPLAY` unset, `LINUXCAST_PRIVATE_DISPLAY=1`.
All captures are 1000×720 window captures from the actual production build in
`apps/desktop/tests/permissions.integration.test.ts`; every state has zero axe violations. Content is
synthetic public seed data only.

| File | State | Provenance |
| --- | --- | --- |
| `list-dark.png`, `list-light.png` | Two actual saved decisions (workflow allow, Linuxcast deny) | Actual debugger grant plus public storage seed |
| `review-allow-dark.png`, `review-allow-light.png` | Removal review, Keep decision focused | Actual |
| `list-200-percent-keyboard-focus-light.png` | 200% native zoom, keyboard focus on Review removal, no horizontal overflow | Actual |
| `list-200-percent-forced-colors-reduced-motion.png` | Same at 200% with emulated forced colours and reduced motion | Actual window, emulated media |
| `removed-dark.png`, `removed-light.png` | Neutral removal receipt after a confirmed `removed` reply | Actual |
| `review-deny-dark.png`, `review-deny-light.png` | Deny removal review with its consequence copy | Actual seed after restart |
| `long-source-list-dark.png`, `long-source-list-light.png` | Unbroken long extension source/version and long scope, clamped visually | Public synthetic storage seed |
| `long-source-review-dark.png`, `long-source-review-light.png` | Complete long text in the review region | Public synthetic storage seed |
| `long-source-review-200-percent-keyboard-focus-light.png` | 200% zoom, keyboard focus on the scrollable complete review region | Public synthetic storage seed |
| `empty-dark.png`, `empty-light.png` | Empty page after removing every decision | Actual |
| `unavailable-dark.png`, `unavailable-light.png` | Actual killed fixture storage child: unclassified unavailable band | Actual (owned storage child only) |
| `loading-fixture-dark.png`, `loading-fixture-light.png` | Pending read, Refresh focused and busy | Labelled renderer fixture: the list handler is replaced with a never-settling reply |

Not captured, because the existing fixture has no product path for them: a stale `changed`/`missing`
receipt and an unknown removal outcome in the actual window. Those are covered by the component suite
`packages/permissions/src/ui/saved-permissions.test.tsx` (synthetic typed bridge, jsdom) and the existing
controller and security suites. Observed limitation: the earlier neutral removal receipt stays visible
alongside a later read failure (`unavailable-*.png`) because the controller does not clear it on load;
controller semantics are out of scope for this presentation lane.

Mocks, jsdom and private Xvfb do not establish Debian 13 GNOME/KDE Wayland/X11, Orca or package acceptance.
