# L2-06 bounded Emoji application presentation

Base PR66/develop `42afa6ba397f77f079fc057ac2c2f9f3d08d87cc`, isolated
`codex/emoji-ui`. Coordinator freeze: [APPLICATION-INCREMENT.md](APPLICATION-INCREMENT.md).
This UI lane owns only src/presentation.ts, tests/presentation.test.ts,
tests/emoji.ui.test.ts, fixtures/, evidence/ and this UI.md. The data author owns
the production data/search modules, data assets/tests and README. Coordinator owns
contracts, shared renderer glyph support, package manifests/lockfile, routing,
main/preload, registry and actual production evidence. No staging or commits.

The registered **Emoji** command now has an application presentation using the
existing ViewSession/ViewRenderer shared Grid, enum Form and Actions. Main provides
bounded offline Unicode17.0 metadata from the production pinned licensed3944-entry
dataset. The renderer never imports that catalogue. The synthetic fixture contains
ten public samples only, with a visible fake-transport/clipboard disclaimer.

The Grid is titled Emoji. Search and category selection show at most100 matches
and ask users to refine searches. Shared Arrow/Home/End keyboard selection uses
stable canonical IDs, with comfortable/compact density actions. **Choose category**
opens a shared enum Form; Cancel retains query/selection. Only **Copy emoji** calls
the named clipboard API. Search, load, selection, category/density changes, Reload,
Back and cancellation never copy. Successful actual receipt keeps the Grid visible
with a named copied outcome and explicit paste guidance; there is no automatic
insertion or simulated Paste.

Copy reserves its exact search handle/row/query/category/generation synchronously
before publication or async work. Repeated and stale intents cannot queue another
write. Reply validation requires the exact catalogue revision, searchId, query,
group, canonical ID and Unicode value. Known refusal shows safe clipboard/reload
recovery. Missing search/release is visibly unavailable; missing Copy still allows
browsing with disabled Copy and reconnect guidance. Unknown/timed-out/invalid copy
outcomes require deliberate Reload/new search before another explicit Copy. Actual
pending clipboard work remains fenced until the underlying promise settles,
including after query changes, pop or disposal; late success never produces a
success toast or replay. Fresh search is read only.

Every replaced, popped or disposed owned search handle is released, including a
late valid reply and a view closed between raw transport resolution and the await
continuation. Releases are exact, deduplicated, and never release the newer live
handle. Root query/selection, current frame/revision/query, selected item,
generation and lifetime are checked across async boundaries. The coordinator's
broker still owns actual source authority and clipboard-slot lifetime.

Design applies [DESIGN.md](../../../docs/design/DESIGN.md) Tokens, Shell and
navigation, Results and actions, List/grid/detail/form, States and motion,
Accessibility and Review gate, using existing shared Grid token sizing and inert
glyph icons. There is no feature visual system. Fixture-only CSS uses shared tokens
for page padding and the observer; it is not production UI.

## Author checks — 29 October 2026

Environment: Pop!_OS22.04 LTS, Linux7.1.1-76070101-generic x86_64,
Node24.22.1/Bun1.4.4, React19.3.1, Playwright1.64.1 Chromium headless shell1248,
axe4.14.0. Private component browser; reduced motion;1000x850 normal viewport and
200% text scaling. No --no-sandbox or other security-disabling flags.

All commands use
`PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH BUN_TMPDIR=/tmp`
in this worktree.

- `LINUXCAST_TEST_FILES='["packages/builtins/emoji/tests/presentation.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS45 focused tests. Captured IDs/receipts, malformed/bounded input, category
  cancel/density, denial/unavailable, no automatic effects, synchronous reservation,
  stale query/root/selection, late/timeout/disposal, release and no replay/queueing.
- `LINUXCAST_TEST_FILES='["packages/builtins/emoji/tests/emoji.ui.test.ts"]' node node_modules/@playwright/test/cli.js test --config scripts/test-runner/playwright.config.ts --workers=1`:
  PASS12 shared Grid/Form keyboard/browser cases14.1s on the final source, with19
  new public captures and zero axe violations in every captured state. Existing historical captures are untouched.
- `node node_modules/typescript/bin/tsc --project tsconfig.base.json --noEmit`:
  PASS full project.
- `node node_modules/eslint/bin/eslint.js packages/builtins/emoji/src/presentation.ts packages/builtins/emoji/tests/presentation.test.ts packages/builtins/emoji/tests/emoji.ui.test.ts packages/builtins/emoji/fixtures --max-warnings 0`:
  PASS scoped lint.

`python3 scripts/validate_plan.py`, final scoped lint and `git diff --check` also
PASS. Planning validation establishes local documentation integrity only.

Initial tests could not resolve the newly registered workspace package until the
coordinator installed its frozen manifest/links. Early assertions were corrected
for the shared enum placeholder, the fixture's extra status observers, array
matching and a root option initially hidden by the root query. These were fixture
assertion defects. A final lifecycle review found the transport/await release gap;
it was fixed with a dedicated45th regression and the complete focused suites rerun.
No service outage or unsupported desktop success is inferred from these checks.

## Inspected affected captures and acceptance

The author inspected all19 PNGs below for focus, labels, overflow, dark/light
legibility, actionable status and public-only content. All are real shared renderer
component captures with the visible synthetic observer. Scrollable Grid rows may
extend below the shell; shared keyboard End scrolls the exact final option into
view at200%. The selected cell and category Form actions remain reachable.

| New evidence | Observed state |
| --- | --- |
| evidence/dark-emoji-grid.png, evidence/light-emoji-grid.png | Offline100cap disclosure, shared neutral selected glyph Grid |
| evidence/dark-emoji-copied.png, evidence/light-emoji-copied.png | Exact ZWJ/modifier sample selection, explicit confirmed Copy, no insertion |
| evidence/dark-emoji-category.png, evidence/light-emoji-category.png | Shared enum category Form with focus, Apply and Cancel |
| evidence/dark-emoji-category-compact.png, evidence/light-emoji-category-compact.png | Category filtering and shared compact density, retained exact selection |
| evidence/dark-emoji-copy-pending.png | One outstanding request, Copy disabled, no optimistic success |
| evidence/light-emoji-copy-unknown.png | Exact local state retained, explicit Reload/new-search recovery |
| evidence/dark-emoji-copy-denied.png, evidence/dark-emoji-copy-unsupported.png | Safe explicit refusal and clipboard fallback guidance |
| evidence/dark-emoji-loading.png | Bounded loading with no Copy |
| evidence/light-emoji-empty.png | Empty search/category guidance |
| evidence/light-emoji-unavailable.png | Missing search capability with reconnect guidance |
| evidence/dark-emoji-search-error.png | Failed local read with deliberate reload/new-search recovery |
| evidence/light-emoji-copy-unavailable.png | Browsing works; Copy visibly unavailable |
| evidence/light-emoji-200-percent-grid.png | Exact last option/selection/focus and footer reachable after keyboard End |
| evidence/light-emoji-200-percent-category.png | Scaled category/focus/Apply/Cancel remain reachable |

| Criterion | Bounded support | Remaining limit |
| --- | --- | --- |
| L2-06-AC01 | No UI dataset download path or remote authority is introduced. | Dictionary discovery/licensing is outside this slice; data author/coordinator own full offline data/license evidence. |
| L2-06-AC02 | Unicode ZWJ/modifier/VS16/flag metadata preserved and exact receipt tested; explicit Copy/paste fallback wording. | Fixture clipboard replies are simulated. Coordinator owns actual registered command, canonical clipboard writer/readback and production session evidence. |
| L2-06-UI | Shared Grid/Form/Actions, dark/light/keyboard/category/density/loading/empty/error/pending/unknown/unavailable/scaled states and axe checked. | Native AT/Orca, high contrast, supported Debian13 GNOME/KDE Wayland/X11 remain pending. |
| L2-06-PRIVACY | Ten public fixture samples only, no secret diagnostic text, inert hostile search, no remote request or implicit copy; strict content-free copy request. | Coordinator owns broker/main/source privacy and actual application evidence. |

All full task criteria remain pending. Dictionary, favourites/frecency, custom
keywords, tone picker, explicit paste, full L1/D1 prerequisites, native AT/desktop,
performance/package/release and complete local1.0 scope remain required. This is a
bounded unfinished application increment, not complete L2-06 acceptance.
