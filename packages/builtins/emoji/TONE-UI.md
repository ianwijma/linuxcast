# L2-06 — bounded Skin tone selector UI

Base PR67/develop `981d4b24f3684f26f3d17293f604283eb2f63221`, isolated
`codex/emoji-tone-ui`. Coordinator owns contracts/main/preload/routing/status and
actual application evidence; data author owns source search. This lane changes
only presentation/tests/fixtures, this report and eight new `*tone*.png` captures.
No staging/commits or shared-file edits. Historical19 captures remain byte-identical.

**Choose skin tone** opens the shared **Skin tone** enum Form. Options are All
tones, Unmodified, Light, Medium-light, Medium, Medium-dark and Dark. The disclosure
explains containment: Unmodified has no skin-tone modifier; other choices select
source sequences containing that modifier. Mixed-tone sequences can match more
than one filter. No Unicode variants are synthesized or full catalogue imported
by the renderer.

Apply retains query/category/density and the selected ID when still present,
releases the old search handle, then performs a read-only search. All omits the
wire key entirely; it never sends null/all/own-undefined. Exact tone presence/value
is required in search and Copy receipts, including a mixed sequence valid under
both Light and Dark. A wrong echo never becomes success. The active filter appears
in status and the Grid section, including empty/loading/unknown states. A failed
read permits deliberate filter recovery using retained category metadata.

Cancel/Escape preserve the active filter, query and selection. Dirty Form Escape
uses the existing shared discard confirmation; discarding the unsent Form leaves
the active filter unchanged. No selection/load/filter/Reload/cancel automatically
copies. Existing pending actual-copy/no-queue, unknown recovery, root/frame/query/
selection/generation/lifetime, late-release and no-replay fences remain. Tone Form
has the same nested depth as category, is covered by owns/closed, and pop/dispose/
reopen clears the tone filter. There is no persistence or new authority.

Design applies DESIGN.md Tokens, Shell/navigation, Results/actions,
List/grid/detail/form, States/motion, Accessibility and Review gate. The existing
shared enum Form, Actions, Grid/glyph/token sizing and keyboard/focus/discard paths
are reused. Fixture additions are six public canonical examples only, including
mixed Light/Dark handshake; they are labelled synthetic and are not production data.

## Author commands and results — 29 October 2026

Prefix: `PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH BUN_TMPDIR=/tmp`.

- `LINUXCAST_TEST_FILES='["packages/builtins/emoji/tests/presentation.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS75 tests, including30 new tone regressions for all choices, exact source
  sequences/echoes, mixed containment, retained context, Cancel/no-op Apply,
  failed-read recovery, unknown/pending/noqueue, stale/invalid Form intents,
  late query/pop/disposal handle release and reopen reset.
- `LINUXCAST_TEST_FILES='["packages/builtins/emoji/tests/emoji.ui.test.ts"]' node node_modules/@playwright/test/cli.js test --config scripts/test-runner/playwright.config.ts --workers=1`:
  PASS18 cases23.2s (12 existing +6 new tone). After the final failed-read guard
  adjustment, the same command with
  `--grep 'skin tone|mixed tone|pending tone|unknown tone'` PASS6 cases9.0s.
  All captured states have zero axe violations. The capture helper still runs axe
  for old cases but writes only names containing tone, preserving historical PNGs.
- Scoped ESLint and `git diff --check`: PASS. Full direct-Node TypeScript results
  are reported in the exact handoff manifest; an intermediate full check found
  only coordinator-owned optional-tone refinement parameter typing errors, reported
  to the coordinator without modifying the shared contract.

One initial new test used a fake duplicate searchId for old/new replies, correctly
triggering the existing protection against releasing a newer live handle. The
fixture now issues distinct identities, and the full75-test suite is green.

Platform: Pop!_OS22.04 amd64, Linux7.1.1-76070101-generic, Node24.22.1/Bun1.4.4,
React19.3.1, Playwright1.64.1 Chromium headless shell1248/axe4.14.0; private component
browser with reduced motion,1000x850 normal viewport and200% text scaling. No
sandbox-disabling flags or desktop/session/AT acceptance claim.

## Inspected new captures and acceptance limits

Author inspected all eight real shared-renderer component captures for public-only
content, labels/focus, active filter, overflow, actionable status and scaled controls:

- `dark-emoji-tone-form.png`, `light-emoji-tone-form.png`: shared enum, focused
  initial choice, containment disclosure and Apply/Cancel.
- `dark-emoji-tone-applied.png`, `light-emoji-tone-applied.png`: retained query,
  category, compact density and exact Medium selection, no implicit copy.
- `light-emoji-tone-empty.png`: Unmodified mixed-sequence empty state and recovery.
- `dark-emoji-tone-pending.png`: active Medium/loading, no source or clipboard effect.
- `light-emoji-tone-unknown.png`: retained exact tone/record, explicit recovery.
- `light-emoji-tone-200-percent.png`: complete shared Form disclosure/actions
  reachable at200%, with focus and scroll bounds checked.

Partial L2-06-AC02 support: canonical tone metadata/selection and exact tone-bound
Copy receipts are exercised; fixtures simulate transport/clipboard. Coordinator
owns real production clipboard/search integration. Partial UI: dark/light/shared
keyboard/category/density/cancel/empty/pending/unknown/scaled states and axe. Partial
PRIVACY: public fixtures, bounded enum-only requests, inert glyphs and no implicit
copy/new authority. AC01 dictionary evidence is unchanged.

All full L2-06 criteria remain pending. Dictionary, favourites/frecency, custom
keywords, native paste, full prerequisite/native AT/Orca/high contrast/target
Debian13 GNOME/KDE Wayland/X11/performance/package/release and complete local1.0
scope remain required. This per-open selector is a bounded unfinished application
increment, not complete task acceptance.
