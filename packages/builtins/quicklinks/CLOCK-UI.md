# L2-05 captured date/time Quicklink presentation

Base PR74/develop `633ca9f`, isolated `codex/quicklink-time-ui`. Read the
[task card](../../../docs/implementation/tasks/L2-05.md), [freeze](CLOCK-INCREMENT.md),
[PLAN](../../../docs/PLAN.md), [workflows](../../../docs/architecture/workflows.md),
[security](../../../docs/architecture/security.md), [built-ins](../../../docs/product/builtins.md),
[testing/release](../../../docs/implementation/testing-release.md),
[DESIGN](../../../docs/design/DESIGN.md) and [tokens](../../../docs/design/tokens.json).
L1-01/F3-01/shared UI/owner/native browser outputs are reused under approved
unfinished sequencing; full dependencies/task/native/release acceptance remain pending.

## Controls and captured value

Existing Quicklinks New/Edit retains exactly five fields: `name`, `url`, `type`,
`queryParameter`, `tags`, with existing **Save quicklink** and **Cancel**. Type adds:

| Value | Label |
| --- | --- |
| clock-date-system | Current date (System timezone) |
| clock-time-system | Current time (System timezone) |
| clock-timezone-system | Timezone name (System timezone) |
| clock-date-utc | Current date (UTC) |
| clock-time-utc | Current time (UTC) |
| clock-timezone-utc | Timezone name (UTC) |

A clock/query link requires a valid query parameter. Literal/path links require
that field empty. Edit prefills source/policy/parameter. All conversions replace
the old kind and preserve tags/flags through exact CAS/record and source-confirmed
summary checks. Pin/Hide/Show keep clock configuration; export still supplies
only the exact saved ID/revision. No saved expanded URL, snapshot or clock history.

Saved clock row `quicklinks:open`, **Review time link**, reads the fresh exact saved
record and opens a shared **Time link** Detail. Navigation/typing/Save do not capture
the clock or invoke a browser. `quicklinks:review-clock`, **Review current value**,
is read-only and captures `Date.now()` once with the explicit UTC or resolved
system timezone. The reviewed **Review time link** Detail displays Name, Source,
Timezone policy, Base URL, Value, Captured at (UTC), Resolved timezone and Target URL.
The pure frozen helper formats the same instant and encodes just the chosen URL
query component; names/URLs/scalars remain inert shared metadata, not active links
or Markdown from source content.

`quicklinks:open-clock`, **Open time link**, is a separate explicit write and primary
Enter after Review. `quicklinks:refresh-clock`, still visibly **Review current value**,
is a secondary read-only action. Distinct initial/refresh IDs let the existing
ViewSession select the new Open primary instead of retaining the initial Review
ID; no shared component/navigation workaround is needed. Repeated-Enter safety
remains intact. Explicit re-Review is the only refresh: advancing across midnight,
waiting, scrolling or Open cannot recapture. Existing Cancel/Back/Reload IDs remain.

Open sends saved ID/revision, launcher revision and the captured instant/zone only.
Main owns the target and current timezone/definition validation. UI requires the
exact receipt ID/revision/snapshot/canonical raw+parsed URL/projected value and no
other dynamic kind before Hide. Dispatch never claims page completion or focus.
Known denial/unavailable/changed-timezone refuses and drops capture with deliberate
Review/Reload guidance. Malformed/mismatched/unknown outcomes drop the captured
target and retain existing no-replay/manual Reload uncertainty; failed Reload
cannot clear it. Successful Reload still requires a new explicit Review. Converted,
missing, hidden or revised sources cannot reuse a captured target.

The existing pending context also binds the immutable captured state. Clock Open
reserves before API invocation and keeps an internal promise in the retained flow
state through caller expiry, query/selection/navigation/Hide/disposal and another
flow instance. While actual work remains, competing actions and manual Reload
stay fenced. Settlement only updates availability; it never opens, saves, captures,
replays or hides a later context. No new IPC/service/provider/timer/framework is
added. The promise is transient controller state, not storage or renderer wire data.
Cancel/Back preserve parent query/stable selection; reopening clears the snapshot.

## Checks and affected captures

Platform: Pop!_OS22.04 amd64, pinned Node24.22.1/Bun1.4.4,
React19.3.1/Playwright1.64.1 Chromium/axe4.14.0. New fixture only: authored public
example.invalid data, fixed fake Date.now, in-memory definitions and simulated
handoff/export receipts. Browser system-zone case explicitly uses Australia/Sydney.
This is component evidence, not real clock/native/browser/owner/session proof.

- Frozen pinned install: PASS805 packages; initial restricted temporary-directory
  EROFS followed by authorized scoped install. Existing shared package export/helper
  copies are coordinator integration inputs, not owned edits.
- `LINUXCAST_TEST_FILES='["packages/builtins/quicklinks/tests/clock-presentation.test.ts","packages/builtins/quicklinks/tests/presentation.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`: PASS306 (55 new/251 existing),1.67s.
  Covers all six choices, strict fields, conversion/prefs/export, exact receipt and
  summaries, encoding/timezone, capture once/midnight, explicit refresh, safe failure,
  hidden/kind/source changes, Cancel, actual-slot lifetime/newflow and no replay.
- `LINUXCAST_TEST_FILES='["packages/builtins/quicklinks/tests/clock.ui.test.ts"]' node node_modules/@playwright/test/cli.js test --config scripts/test-runner/playwright.config.ts --workers=1`:
  PASS11 cases,8.9s. Shared keyboard/Form/Detail, explicit
  Review/Open and source values, fake midnight advance, system-zone encoding,
  configuration-only Save, unknown/unavailable/pending/Cancel/missing API and200%.
- Full direct pinned Node TypeScript, scoped ESLint, plan/owned whitespace results
  are recorded in the manifest. Existing fixture/tests/PNG files are unchanged.

Initial browser checks found the retained shared primary action identity; the
separate refresh ID and a focused controller regression fix it. A pending test
was corrected to wait for actual shared Detail Loading text instead of a nonexistent
aria-busy marker. A dirty-cancel test now changes the field after the rejected
submit, matching the shared Form's accepted-draft lifecycle. These fixture corrections
required no shared UI change or production timing workaround.

Eight NEW public captures are inspected for shared tokens, keyboard focus, exact
metadata/disclosures, readable text/overflow and axe0:

- `clock-dark-editor.png`, `clock-light-editor.png`: existing five-field editor and
  explicit saved Type/parameter, unchanged shared controls.
- `clock-dark-ready.png`: read-only pre-capture Detail; no value or browser effect.
- `clock-light-reviewed.png`: exact captured value/instant/zone/URL and Open footer.
- `clock-dark-unknown.png`, `clock-light-unavailable.png`: honest recovery without
  false dispatch/completion or a stale captured target.
- `clock-dark-pending.png`: loading and actual request fence, reachable Cancel/Back.
- `clock-light-200-percent-review.png`: scaled readable metadata and reachable actions.

Applicable DESIGN sections: Tokens; Shell/navigation; Results/actions;
List/grid/detail/form; States/motion; Accessibility; Review gate. Uses existing
ViewSession/ViewRenderer/ThemeProvider/Detail/Form/actions/tokens only.

## Acceptance and ownership limits

Partial `L2-05-AC01`: one bounded encoded query component with exact snapshot/URL
receipt and immutable source configuration; renderer target is never authority.
Partial `L2-05-AC02`: fixed typed date/time/timezone binding with explicit invalid/
missing-source handling, not complete recursive/cursor/snippet/context support.
Partial `L2-05-UI`: affected shared keyboard/themed/pending/recovery/200%/axe states.
Additional `L2-05-PRIVACY` regression evidence uses only public fake-clock examples
and excludes runtime snapshots from saves/exports. No criterion status is changed;
prior privacy evidence remains passed, other full criteria remain pending.

This patch owns presentation, two new tests, two new fixture files, this report and
eight NEW PNGs only. Frozen helper/contracts/package export/note are excluded.
Coordinator owns main/preload/storage/root routing/actual app evidence/status.
Existing tests/fixtures/historical PNGs are untouched. No staging or author commit.

Real native argv dispatch, persistent configuration/restart, actual timezone/source
change refusals and owner/export/usage privacy are coordinator-owned acceptance
inputs. Native AT/Orca/high contrast, Debian13 GNOME/KDE Wayland/X11, dependencies,
performance, complete placeholders/context/targets/browser selection, packaging and
release gates remain required. No full task or complete local1.0 scope is reduced.
