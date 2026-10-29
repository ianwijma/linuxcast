# L2-06 local Emoji ranking presentation

Base PR72/develop `c881a66`, isolated `codex/emoji-frecency-ui`. Read with the
[task card](../../../docs/implementation/tasks/L2-06.md),
[increment freeze](FRECENCY-INCREMENT.md), [PLAN](../../../docs/PLAN.md),
[data](../../../docs/architecture/data.md), [security](../../../docs/architecture/security.md),
[built-ins](../../../docs/product/builtins.md) and
[testing/release](../../../docs/implementation/testing-release.md).
Existing L1/D1/shared shell/storage is reused under the approved unfinished
sequencing. Full prerequisites, task/native/release acceptance remain pending.

## Shared controls and behavior

`EmojiFlow` adds read-only Actions **Emoji ranking** (`emoji:ranking`) and
**Reset ranking** (`emoji:reset-ranking`); neither changes state on opening.
The shared **Emoji ranking** Form has required enum `tracking`, title **Tracking**,
values `enabled`/`paused`, **Apply ranking** (`emoji:apply-ranking`) and **Cancel**
(`emoji:cancel-ranking`). Applying the already saved state closes without a write.
Cancel/Escape and dirty-draft Keep/Discard write nothing.

Reset opens a separate shared **Reset Emoji ranking** confirmation Form with
required boolean `confirm`, titled **Reset saved ranking counts**, initially false.
Only exact `confirm:true` can invoke `emoji:confirm-reset-ranking` (**Reset ranking**).
The cancel action is `emoji:cancel-reset-ranking`. The confirmation states that
counts and last-used times are removed, the current pause setting/favourites/custom
keywords are kept, and Reset cannot be undone here. From the ranking Form, its
explicit Reset action returns to the Grid context before opening confirmation;
these views do not add another nesting level. Existing Copy/category/favourite row
actions and keyboard order are unchanged. No new shared Form or custom CSS exists.

The UI exposes only aggregate availability, revision, enabled flag and saved-entry
count. It receives no raw usage records, timestamps, paths or query history. Help
explains that ranking stores local aggregate Copy counts/last-used times, and only
confirmed explicit Copy contributes. Pausing retains entries but stops collection
and count-based ranking; favourites still sort. Main also skips Emoji command-use
recording while paused or while the saved pause state cannot be read. Reset affects
per-Emoji ranking entries only; overall built-in command aggregates are retained
and remain governed by Data settings. Query/category/tone/favourites filter/density and selected canonical ID
are retained through Cancel, changes and read-only result refresh where the ID
still matches.

Pause/resume/reset bind the exact issued search revision/handle/query/category/tone/
favourites context and preference revision. Receipts must match the exact next
revision, expected enabled flag and entry count: pause/resume retain count; Reset
retains enabled and requires zero count. No optimistic state is published. A fresh
search confirms all three fields before a named paused/resumed/reset status.
Stale or contradictory reads retain uncertainty; newer revisions show neutral
latest-saved-state guidance. Failure/denial uses fixed safe messages and recovery.

Updates reserve synchronously before publishing busy state and retain their actual
promise through five-second caller expiry, selection/query/root/frame changes,
Back/Hide, disposal and reopening. Copy/favourite/keyword/other ranking actions stay
fenced while actual work remains. Late results cannot claim success or replay.
Unknown updates require a deliberate fresh read after settlement. Failed or
unavailable reads retain uncertainty. A read started while the actual update was
pending remains unable to recover that uncertainty even if its reply arrives after
settlement; it cannot authorize a new effect from an earlier snapshot. Idle stale
Forms visibly disable Apply with Cancel/Reload guidance. Late reads release their
exact owned handles, including timeout/navigation cases.

Confirmed Copy remains known clipboard success for `recorded`, `paused` and
`unavailable` tracking receipts. Unavailable tracking says **Local ranking could not be confirmed**: a private
write may have committed even when its receipt or aggregate update failed. It
adds a warning and tells the
user to inspect/recover local tracking without repeating Copy merely to record it.
Recorded/paused/unavailable receipts trigger only a read-only refresh, which can
reorder results while retaining the selected canonical ID. No automatic Copy or
usage call follows refreshed results. A failed/timed-out/missing refresh preserves
**Copied** plus recovery guidance; it never changes known clipboard success into
clipboard-unknown. Missing optional tracking outcome under explicit new metadata
also preserves known Copy while disclosing unconfirmed tracking. Legacy backends
without ranking metadata/receipts retain their old Copy behavior without an
implicit refresh. Actual clipboard uncertainty before a matching receipt retains
the existing conservative lifetime/deadline rules.

Missing metadata/storage/API visibly disables ranking controls with actionable
guidance. Ordinary public search and explicit Copy remain useful. Old optional-API
fixtures keep existing statuses and row action arrays. The presentation neither
performs persistence nor calculates ranking, records usage, downloads data, invokes
network services or gains generic storage/clipboard authority.

Owned: presentation, two new tests, two new fixture files, this report and eight
new PNGs. Contracts, storage/main/preload/root/suite maps/status/manifests/lockfiles,
existing tests/fixtures/shared UI and historical captures are excluded. No staging
or commits. All status criteria remain pending.

## Validation and affected captures

Platform: Pop!_OS22.04 amd64; Node24.22.1/Bun1.4.4; React19.3.1;
Playwright1.64.1 Chromium/axe4.14.0. Component fixture only, viewport1000x1000,
reduced motion and200% root text scaling in the scaled case. Commands use
`PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH` and
`BUN_TMPDIR=/tmp`.

- Pinned `bun install --frozen-lockfile`: PASS. The initial restricted temporary
  directory EROFS was followed by the authorized elevated install; lock unchanged.
- `LINUXCAST_TEST_FILES='["packages/builtins/emoji/tests/frecency.test.ts","packages/builtins/emoji/tests/presentation.test.ts","packages/builtins/emoji/tests/keywords.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS273 tests/3 files,1.14s total. Tests cover exact state/receipt
  confirmation, explicit Reset, retained filters/selection, no-effect Cancel,
  stale/pending/unknown/denied recovery, post-settlement read requirement, known
  Copy with unavailable/missing tracking and refresh timeout/late handle release.
- `LINUXCAST_TEST_FILES='["packages/builtins/emoji/tests/frecency.ui.test.ts"]' node node_modules/@playwright/test/cli.js test --config scripts/test-runner/playwright.config.ts --workers=1`:
  PASS11 tests,11.4s; eight new captures, zero axe violations each.
  Browser covers actual shared keyboard/dirty/reset paths, reorder/selection,
  paused no-use fixture behavior, missing APIs, known Copy/tracking failure,
  delayed settlement, denial, refresh failure and text scaling.
- Full Node TypeScript, scoped ESLint, plan and all-owned whitespace results are
  recorded in the manifest. Historical captures are not regenerated. The scoped
  browser uses authorized localhost execution and normal browser defaults.

Final wording review changed unavailable tracking to **could not be confirmed**,
preserving known clipboard success when a private write may have committed.
Changed controller file: PASS62 tests,1.03s. Focused browser: PASS1,2.2s,
regenerating only the tracking-unavailable capture; axe0 and visually inspected.
Plan validation passed again. Other captures and prior broad checks are retained.

The initial browser Copy-selection locator omitted the existing Favourite tag in
its accessible name; corrected to match the shared accessible option. Initial new
synthetic update replies incorrectly echoed the request-only action field; fixed
to match the closed frozen reply shape. These were fixture errors. No dependency,
shared UI or production wire change was needed.

All eight new captures were inspected for focus, contrast, disclosure and overflow:

- `frecency-dark-form.png`, `frecency-light-form.png`: shared selector and aggregate
  privacy/pause/reset instructions, Apply/Cancel and visible focus.
- `frecency-dark-reset-confirmation.png`: false-by-default required consent and
  count/pause/kept-preference disclosure.
- `frecency-light-paused-grid.png`: confirmed paused status and canonical selection.
- `frecency-light-unknown.png`, `frecency-dark-pending.png`: honest uncertainty/busy
  states, disabled update and reachable Cancel/Escape; pending inert Form focus.
- `frecency-light-copy-tracking-unavailable.png`: known Copied with separate local
  ranking failure guidance, no invented usage success.
- `frecency-light-200-percent-form.png`: scaled labels/help/selector and reachable
  Apply/Cancel with existing scroll behavior.

Applicable [DESIGN.md](../../../docs/design/DESIGN.md) sections: Tokens;
Shell/navigation; Results/actions; List/grid/detail/form; States/motion;
Accessibility; Review gate. Existing ViewSession/ViewRenderer/ThemeProvider and
semantic tokens are used throughout.

## Acceptance limits

Partial `L2-06-AC01`: no data download/licence path added. Partial `L2-06-AC02`:
canonical Copy receipts and separate tracking status, with existing Unicode Copy
regressions. Partial `L2-06-UI`: relevant shared Form/Grid keyboard/recovery/scaling/
axe states. Partial `L2-06-PRIVACY`: public authored samples, fixed errors and no raw
tracking data or generic storage authority in the renderer.

The fixture explicitly labels simulated aggregates/search/preferences/clipboard
and models a reorder for selection checks; it does not establish the production
ranking formula, durable storage, real clipboard or native restart behavior.
Those application checks belong to coordinator/backend/search lanes. No full task
or criterion is promoted. Native AT/Orca/high contrast, Debian13 GNOME/KDE
Wayland/X11, complete backup coverage, performance, packaging/release and the
complete dictionary/Emoji and local1.0 scope remain required and unchanged.
