# U1-01 — archive, search and restore application increment

29 October 2026. Integrated in PR60 https://github.com/ianwijma/linuxcast/pull/60,
merge b79f9ddbc1f690bdd87920d5a4487319c86b35a2; reviewed signed head
af4b3e3fe3b4e5c2e40744383f5cd4fe85930058, CI40803274853 validate PASS.
No requested/submitted GitHub reviews/comments/threads. Based on PR59/develop
2aa49e540c8be6ea1fba1e0e85e945975fa88542. Coordinator branch codex/notes-archive;
UI author codex/notes-archive-ui. Reviewed, tested unfinished application increment;
full U1-01 and all four acceptance criteria remain pending.

## Behavior and security boundary

Archive note first persists the latest draft without replacing Save, then changes
only archive metadata at the expected revision. The active row disappears only
after owner acknowledgment. The selected note remains visible with Restore
guidance and a read-only title, rich body and task checkboxes. Show archived notes
queries the actual SQLite owner, supports title/body search and combines with
Pinned only. Restore note changes metadata without a content flush, retains pins
and saved/draft content, and makes the selected editor editable again. Pin while
archived also skips content writes. Retained local edits require explicit review;
uncertain operations are never replayed automatically.

Schema016 adds checked archived=false metadata and archive/search indexes. The
existing sole-owner migration snapshot preserves source records and pins. Archive
and Restore use revision CAS, including same-state requests, and preserve draft,
saved version, both timestamps, pin and saved history. New notes are active. The
owner applies archive/pin/query filters before paging. Client, main, preload and UI
validate normalized filter echoes and every row; cursor generations prevent stale
filter/query results from replacing the current view.

Named strict sender/frame/schema IPC accepts only id, expected revision and desired
archive state. Main and owner both refuse ordinary content writes to archived notes.
Metadata receipts verify exact next revision, requested flag, unchanged other flag,
content and timestamps. Existing actual mutation-slot/export/Close/Quit, synchronous
reentry, deadline/uncertainty and explicit fresh-read reconciliation gates apply.
One UI metadata intent blocks competing editing/navigation/actions while awaiting
flush or acknowledgment. No optimistic removal, new permission, dependency,
service, helper, renderer Node/network, or generic IPC is introduced.

## Verification

Host: Pop!_OS22.04 Linux amd64, Node24.22.1/Bun1.4.4/Electron45/SQLite3.53.4.
Private databases and owned Xvfb/profile/Chromium with public synthetic data only.
This is not Debian13 GNOME/KDE Wayland/X11, native AT or release acceptance.

- Actual Notes owner integration: 15 PASS, including schema15→16 snapshot/default
  active migration, exact CAS/source/pin/history preservation, archived content
  refusal, same-state mutation, reopen/restore, >100 archived and archived+pinned
  pagination, search, unknown target and caller-authority rejection.
- `bun run test:security -- U1-01`: 85 PASS after the review fixture correction.
  Exact forged receipt fields, archived write refusal before dispatch, synchronous
  reentry, held actual operation after deadline, Close/Pin/fresh-read/no-replay,
  sender/schema and normalized view/row guards; existing export boundary retained.
- `bun run test:contracts -- U1-01`: 15 PASS.
- `bun run test:integration -- F2-01`: 49 storage regressions PASS.
- Independent coordinator source review clean by file_search_service_sol.
  notes-ipc.ts SHA256
  1b8998b87eb428be011c8f0cdc4c3fef693c35cbd747473f212175b150ed572b.
  Review found a Pinned-only preload fixture missing archived:false; corrected so
  the regression tests the semantic pin guard rather than malformed shape.
- `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a bun run test:integration -- U1-01`:
  16 PASS (15 actual owner tests plus production Electron scenario10.27s). The
  actual registered launcher opens Notes, edits rich tasks/Unicode/literal script
  text, stores a newer local draft before Archive without Save, removes its active
  row, rejects archived Save and task mutation, queries/searches the real archive
  with Pinned only, Unpin/Pin preserves archive/content, then Restore changes only
  archive/revision and enables editing. Both themes pass axe. Existing actual
  Markdown export/no-overwrite/cancellation, native Close/Quit flush/restart,
  forced private owner+app crash after durable draft ACK, exact revision/saved/draft/
  pin/active recovery and command-usage privacy checks remain passing. Only the
  native chooser choice is instrumented; the SQLite owner and export writer are real.
- Independent alias_review_sol reviewed all three exact UI source hashes, the
  actual production scenario and four new actual screenshots clean. The readonly
  slash-menu P2 is fixed: disabled transitions clear/hide the menu and all custom
  mutation entry points require current editability; focused real Tiptap regression
  passes. All 13 new component captures independently inspected clean.
- Final integrated `bun run typecheck`, scoped ESLint and diff checks PASS.
  `bun run test:unit -- U1-01`: 257 PASS, including 85 controller and seven
  export cases. The author's exact source passes 32 real Tiptap Chromium cases
  (23.0s), including the readonly slash regression and prior create/edit/export/
  pin flows. Unknown retained-edit warning fits the visible recovery region.
  Author owned typecheck/lint/plan checks PASS; final plan validation recorded below.
- Exact 21-file owned author patch reconciled to all per-file SHA256 values;
  copied coordinator contract/freeze bytes unchanged. Patch SHA256
  45197c33054f9913f7e4661e3c8360ca98ec442c20121dfe69ec01f5602de874;
  manifest SHA25638560bd8e09a4cd603ade18384a01a2b11b91bdb89f1e69783ceb307581d4fcc.
  Independent alias_review_sol final review clean; no actionable findings remain.
  Current-head CI and configured GitHub review inspection passed before normal
  expected-head merge. Local signatures verify against the exact configured key;
  GitHub unknown_key and absence of signing/approval rules are recorded without
  claiming GitHub verification or bypassing any rule.

## Design and remaining acceptance

DESIGN.md: Shell/navigation, Results/actions, List/detail/form, Chat and notes,
States/motion, Accessibility and Review gate. Existing shared controls and tokens.
Component captures in packages/notes/evidence cover both themes readonly archive,
archive/pinned filter and restored editor; pending; unknown/fresh-read readonly
retained edits/restored Retry; denial/unavailable and 200% Restore reachability.
New actual application captures in this directory are:

- notes-archive-application-dark.png
- notes-archive-application-light.png
- notes-restored-application-dark.png
- notes-restored-application-light.png

Existing actual screenshots regenerate with the current Archive controls. All use
public synthetic note content, no user profile or private data.

Trash/restore, revision restore, attachments, Quick note and the root Notes provider
remain required. Full Markdown import/roundtrip/native chooser interaction, broader
D1-02, supported Debian/session/native AT/high contrast/performance/package/release
acceptance remain pending. Ordinary private SQLite remains unencrypted; edits not
yet durably acknowledged may be lost on forced crash. No full task or Goal claim.
