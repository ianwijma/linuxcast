# L2-06 local Emoji search keywords presentation

Base PR70/develop `13d8eb6`, isolated `codex/emoji-keywords-ui`. Read with the
[task card](../../../docs/implementation/tasks/L2-06.md),
[increment freeze](KEYWORDS-INCREMENT.md), [PLAN](../../../docs/PLAN.md),
[data](../../../docs/architecture/data.md), [security](../../../docs/architecture/security.md),
[built-ins](../../../docs/product/builtins.md) and
[testing/release](../../../docs/implementation/testing-release.md).
This is a bounded application increment under the approved unfinished sequencing.
Full prerequisites and task/native/release acceptance remain pending.

## Behaviour and ownership

The existing `EmojiFlow` adds explicit **Edit search keywords** to shared Actions,
bound to the currently selected canonical emoji. Existing row Copy/category/favourite
actions and the read-only Ctrl+Enter category shortcut retain their order. No Form
opens automatically. Action IDs are `emoji:keywords`, `emoji:save-keywords` and
`emoji:cancel-keywords`. Form title is **Emoji search keywords**, its single
multiline text field is `keywords`, titled **Search keywords**, with **Save keywords**
and **Cancel**. The coordinator supplies shared multiline Form rendering; this
feature adds no React UI tree, custom CSS or visual language.

The field visibly explains one phrase per line, up to sixteen unique phrases,
each at most64 Unicode scalars and256 UTF-8 bytes. Each line is trimmed, blank lines
are omitted, and remaining phrase text/order is retained exactly. The UI does not
normalize Unicode, fold case, truncate excess phrases or silently deduplicate them.
Controls, bidi formatting, surrogate and Unicode line/paragraph separators,
punctuation-only phrases and duplicates after trimming are rejected. Validation
retains the draft with a safe inline error. Save replaces the selected entry's full
keyword list; empty Save clears it. Cancel/Escape and shared dirty-draft Keep/Discard
write nothing. Enter inside the textarea inserts a line; explicit keyboard Save is
Tab to **Save keywords**, then Enter.

Save binds the revision, issued search handle, query, category, tone, favourites
filter, canonical entry ID and keyword preference revision. Exact ordered keywords
and the next revision must match the receipt. The old handle is released. A first
read-only search uses the captured canonical glyph with the same category, tone and
favourites filters to verify the exact selected row and its ordered saved keywords.
Its handle is released, then a second fresh search restores the original query and
publishes only that handle/results. The visible query never changes to the glyph.
A named Saved/Cleared message requires both reads at the exact receipt revision;
if the row remains in the original results its keywords must agree too. Clearing an
alias that was the only match can therefore confirm Clear and show zero results
for the retained query, without a false unknown error or a fabricated matching row.
Stale/contradictory/failed verification or original reads retain uncertainty; newer
revisions show neutral latest-saved-state guidance. A newer verification followed
by an older original snapshot, or same-revision contradictory arrays, is rejected.
The Grid query/category/tone/density and selected canonical entry are preserved
where that ID still matches. Verification is read only, invisible to selection,
never usable for Copy/favourite authority, and cannot count usage. Timeout, pop,
root/frame/query changes and transport/await gaps release late exact verification
and original handles without a stale toast or query jump.

Save reserves synchronously before status publication. Its actual promise remains
fenced after the five-second caller bound, query/selection/frame changes, Form/Grid
Back, disposal or reopening. Copy, favourite writes and another keyword Form/Save
cannot race that promise. Late success cannot toast, replay or substitute an entry.
Unknown results require settlement and a deliberate later read before another
explicit effect. Failed/missing/unavailable reads keep unknown recovery instead of
claiming that nothing changed. Known no-effect refusals use safe fixed text and
require fresh context before another Save. Root revision/query/selection, hidden
Grid revision/query/selection and Form lifetime guards reject stale intent/results.

Keyword edits, queries, Form lifecycle and validation never call clipboard or
favourite APIs. A separate explicit Copy after custom-keyword search still requests
the selected canonical ID only; no arbitrary clipboard value is introduced.
Persistence and restart behavior belong to main's private revisioned setting.
Closing/Hiding resets drafts/transient Forms without erasing stored keyword data.

Missing keyword metadata/storage/API disables Edit with actionable guidance.
Unavailable metadata also discloses that custom-keyword matching is unavailable;
ordinary public search and explicit Copy remain useful. Old mocks without the new
optional metadata/method retain their existing Grid status and row action order.
The disabled global Actions entry exposes the missing capability. No renderer path,
generic settings, data download or new dataset authority is added.

Owned files: presentation, small keyword-draft helper, two new tests, two new
fixture files, this report and eight new keyword PNGs. Contracts, shared Form,
storage/main/preload/routing, manifests/lockfiles/task status and historical
tests/fixtures/PNGs remain coordinator-owned or unchanged. No staging or commits.

## Validation and captures

Pop!_OS22.04 amd64; Node24.22.1/Bun1.4.4; React19.3.1;
Playwright1.64.1 Chromium/axe4.14.0. Synthetic component fixture, viewport1000x1000,
reduced motion and200% root text scaling for the scaled case. Use
`PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH` and
`BUN_TMPDIR=/tmp`. The coordinator completed the pinned frozen install in this lane.

- `LINUXCAST_TEST_FILES='["packages/builtins/emoji/tests/keywords.test.ts","packages/builtins/emoji/tests/presentation.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS211 cases across two files,890ms total:89 new cases and122 unchanged existing
  Emoji presentation cases. Includes validation limits/order/Unicode, replacement/
  clear, exact receipts, source-confirmed refresh, unknown/denial, synchronous
  reservation, fake-clock expiry, stale parent/frame/selection, pending reopen,
  safe unavailable reads, visible idle-Form invalidation, canonical verification/original refresh lifetimes, alias-only Clear and separate canonical Copy after custom search.
- `LINUXCAST_TEST_FILES='["packages/builtins/emoji/tests/keywords.ui.test.ts"]' node node_modules/@playwright/test/cli.js test --config scripts/test-runner/playwright.config.ts --workers=1`:
  PASS10 cases8.6s on the exact final source. Eight new captures,
  zero axe violations each. The suite asserts multiline Enter without Save, explicit
  keyboard Save, dirty Keep/Discard, unknown recovery, inert pending focus/Escape,
  delayed settlement fences, clear, unavailable metadata/API, denial and200% actions.
- Full Node TypeScript, scoped ESLint, plan validation and all-owned whitespace:
  PASS. All historical package PNGs remain byte-identical to HEAD. Exact hashes
  and tested shared dependencies are recorded in the frozen manifest. Historical captures
  are not regenerated. Localhost/browser execution uses the authorized scoped runner
  escalation and normal browser defaults.

Browser checks identified shared Form focus loss after native disabling of the
submit control. The coordinator fixed shared recovery for body/disabled focus: pending
forms receive inert container focus, keeping Escape reachable without putting a
held Enter on Cancel; settled state recovers an enabled field. These shared changes
are tested dependencies and excluded from this owned patch. Keyword Form setup
also has a regression ensuring Save is enabled for a valid initial issued context.

Affected capture set, each checked with axe and visually inspected at freeze:

- `keyword-dark-form.png`, `keyword-light-form.png`: focused shared textarea,
  normalization/limits disclosure, Save and Cancel.
- `keyword-dark-saved-grid.png`, `keyword-light-saved-grid.png`: fresh confirmed
  status, canonical selected glyph and unchanged Copy/category/favourite behavior.
- `keyword-light-validation.png`: retained duplicate draft and inline remediation.
- `keyword-light-unknown.png`: explicit uncertainty, disabled Save and recovery.
- `keyword-dark-pending.png`: honest pending save and reachable safe navigation.
- `keyword-light-200-percent-form.png`: scaled field/help and reachable actions after scrolling; the field label and earlier
  text remain reachable by scrolling back.

Applicable [DESIGN.md](../../../docs/design/DESIGN.md) sections: Tokens;
Shell/navigation; Results/actions; List/grid/detail/form; States/motion;
Accessibility; Review gate. Existing ViewSession/ViewRenderer/ThemeProvider,
shared Form and semantic tokens are reused. Source-like phrases remain text in a
textarea and are never rendered as links, HTML or instructions.

## Acceptance limits

Partial `L2-06-AC01`: no dictionary/Emoji dataset download or new data licence path.
Partial `L2-06-AC02`: existing canonical Copy regression and separate selected Copy
after synthetic custom search; no native clipboard/paste claim. Partial
`L2-06-UI`: shared keyboard/Form/Grid, validation/busy/recovery/scaling/axe states.
Partial `L2-06-PRIVACY`: manually authored public phrases and samples, fixed safe
errors, metadata-only named calls, inert text and no fixture external requests.

The fixture labels its sixteen public examples, authored phrases and simulated
search/preference/save/clipboard replies. It proves no durable setting, restart,
real clipboard or native desktop operation. Those application checks are
coordinator-owned. All full criteria remain pending, including complete dictionary/
Emoji scope, full prerequisites, encrypted complete backups, native AT/Orca/high
contrast, Debian13 GNOME/KDE Wayland/X11, performance and packaging/release gates.
The complete agreed local1.0 scope is unchanged.
