# U1-01 single-note permanent deletion: UI author evidence

Base: integrated PR64 `f6585ed2c14faed6558e4e661995152cd695e986`, isolated
`codex/notes-delete-ui`. Frozen contract: `packages/notes/DELETE-INCREMENT.md`.
Only packages/notes/src, tests, fixtures, evidence and README are author owned.
No shared contract/manifest/task/routing edits, staging or commits. Coordinator's
uncommitted frozen contract and DELETE-INCREMENT.md are excluded from this patch.

This is partial unfinished U1 application evidence. F2-01 is accepted; broader
D1-02/native AT and full U1 dependency acceptance remain pending under the
user-authorized bounded sequencing. Complete local 1.0 scope is unchanged.

## Behaviour and acceptance mapping

| Acceptance | Bounded evidence | Limit |
| --- | --- | --- |
| U1-01-AC01 | Exact confirmation/retained edit/no flush/single request/strict receipt/no replay/lifetime/fresh owner read controller cases preserve earlier recovery fences. | Controller fixtures use synthetic memory, not actual crash/SQLite proof. Coordinator records actual application/storage/restart results separately. |
| U1-01-UI | Real Tiptap readonly tasks/body, keyboard Enter/held Enter/Keep/Escape/Tab, focus return, exact empty selection, other row preservation, pending/refusal/unavailable/unknown/late/null recovery and 200% text scaling. All new captured states have zero axe violations. | Chromium component fixtures on private host; no claim of Debian GNOME/KDE Wayland/X11, native AT/high contrast or supported desktop acceptance. |
| U1-01-PRIVACY | Synthetic public content only; strict content-free deletion selection and receipt; backend failure strings do not enter UI messages; literal React title disclosure; no new network, file or execution authority. | Coordinator owns broker/source/privacy/security and actual application evidence. |
| U1-01-AC02 | No change. | Markdown import/roundtrip/native chooser remains pending. |

Before this increment, Trash was recoverable and had no single-note permanent
delete action. Now only an explicitly confirmed selected trashed revision enters
the named API. Cancel has no effect or flush. Exact receipt clears only that
selection/local state and refreshes the same filter without fallback selection.
The warning explains saved revisions/retained local edits/no undo/backups/no
secure erasure. Unknown outcomes retain local state and fence Close/effects until
a settled fresh read. A missing source after that read is informational, not a
claim that the earlier write succeeded. No bulk Empty Trash or attachments.

Design sections: DESIGN.md Tokens; Results and actions; List, grid, detail and
form; Chat and notes; States and motion; Accessibility; Review gate. Existing
shared host primitives/tokens are reused. React checklist: hooks are unconditional,
controller lifecycle/subscriptions clean up, async callbacks check current
selection/generation/lifetime, list identity remains UUID based, and confirmations
have semantic names/descriptions and Keep-first focus. No new rendering framework.

## Commands and results

All commands run in the isolated UI worktree with
`PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH BUN_TMPDIR=/tmp`.
Platform: Pop!_OS 22.04 LTS, Linux 7.1.1-76070101-generic x86_64, Node24.22.1,
Bun1.4.4, Playwright1.64.1 Chromium headless shell1248, React19.3.1,
Tiptap3.32.0, axe4.14.0. Reduced motion enabled. Standard viewport1120x1000.
No sandbox-disabling browser flag is used.

- Focused author unit selection with existing Vitest config:
  `LINUXCAST_TEST_FILES='["packages/notes/tests/controller.test.ts","packages/notes/tests/export-controller.test.ts","packages/notes/tests/launcher-open.test.ts","packages/notes/tests/markdown.test.ts","packages/notes/tests/delete-controller.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`.
  PASS216 tests across5 files, including23 new adversarial deletion cases.
- New exact browser suite:
  `LINUXCAST_TEST_FILES='["packages/notes/tests/delete.ui.test.ts"]' node node_modules/@playwright/test/cli.js test --config scripts/test-runner/playwright.config.ts --workers=1`.
  PASS10 cases25.2s on final UI source;14 new affected captures, all axe clean.
- Existing Notes/launcher browser regression suite: PASS55 cases1.2m. To keep
  historical captures unchanged, the exact existing two test sources were copied
  under `/tmp/linuxcast-notes-delete-regression/` with only their fixture/fs/evidence
  paths rebased to this worktree and temporary captures. Command:
  `node node_modules/@playwright/test/cli.js test --config /tmp/linuxcast-notes-delete-regression/playwright.config.ts --workers=1`.
- `node node_modules/typescript/bin/tsc --project tsconfig.base.json --noEmit`:
  PASS full project. `node node_modules/eslint/bin/eslint.js packages/notes/src packages/notes/tests/delete-controller.test.ts packages/notes/tests/delete.ui.test.ts packages/notes/fixtures/main.tsx --max-warnings 0`: PASS.

`python3 scripts/validate_plan.py`, scoped ESLint and `git diff --check` also
PASS on the final owned delta. Planning validation is local documentation integrity
only and does not establish future application behaviour.

Initial browser attempt could not listen on127.0.0.1 inside the restricted
sandbox; the authorized elevated local browser test ran without security flags.
An intermediate run found an incorrectly unpinned synthetic other-row fixture;
corrected to test preservation under Pinned only. Another found axe's scrollable
library keyboard-access violation at200%; the existing library now receives a
focusable region during reserved operations. Both findings were fixed and the
complete10-case suite rerun green. These intermediate failures are not hidden.

## Inspected new public captures

All PNGs are real Chromium component captures with the synthetic observer visible.
Historical baseline PNGs are unchanged. Author inspected every image for visible
warning/actions, focus, dark/light legibility, overflow, pending/error guidance,
and absence of private content. At200%, the complete confirmation and both actions
fit the scrollable editor viewport; the library is keyboard reachable.

- `dark-notes-delete-confirmation.png`, `light-notes-delete-confirmation.png`:
  Keep-first focused, exact title, complete destructive disclosure and actions.
- `dark-notes-delete-cancelled.png`, `light-notes-delete-cancelled.png`:
  readonly content preserved and focus returned to Delete permanently.
- `dark-notes-delete-empty.png`, `light-notes-delete-empty.png`:
  exact receipt, empty library/selection, same Trash filter, New note focus.
- `dark-notes-delete-other-row.png`: other pinned trashed row retained without
  selection fallback.
- `dark-notes-delete-pending.png`: readonly source/list preserved, busy delete,
  competing operation/Close refusal, no simulated Save.
- `light-notes-delete-unknown.png`: local state preserved with explicit Reload
  guidance and disabled further effects.
- `light-notes-delete-missing-reloaded.png`: fresh missing-source informational
  outcome, no acknowledged-delete success claim.
- `dark-notes-delete-refused.png`: source retained, safe refusal and recovery.
- `light-notes-delete-unavailable.png`: missing capability shown with reconnect
  instruction, disabled destructive action.
- `light-notes-delete-retained-confirmation.png`: paused local edits named in
  explicit confirmation after a no-effect Keep.
- `light-notes-delete-200-percent.png`: scaled disclosure and actions reachable.

No full task/desktop/native AT/highcontrast/performance/package/release acceptance
is claimed. Actual SQLite cascade, app restart and desktop backend evidence belong
to the coordinator's application lane. Full Markdown roundtrip, bulk Empty Trash,
attachments and remaining complete Notes scope remain required.
