# U1-01 bounded Empty Trash application increment

Base PR75/developa8ad162. Read complete task card U1-01, PLAN, data/security,
product builtins, testing-release, DESIGN chat-and-notes/tokens. F2-01 accepted;
existing Notes/shared UI used under user-approved unfinished D1/native sequencing.
Full task/prerequisite/nativeAT/session/release acceptance remains pending.

Goal: in existing Notes Show trashed notes, choose Empty Trash → review the
current whole-Trash count → default Keep/cancel → separately confirm permanent
logical deletion of that exact unchanged set and its retained saved revisions.
This includes pinned/archived trashed notes and notes outside current search,
pinned filters and pagination. Active and archived NON-trashed notes remain exact.
No attachments/backend/migration/provider/framework/research/proof expansion.
Backups may retain content; never claim secure erasure or Undo after success.

Coordinator owns contracts, storage/client/main/preload/routing/status/actual app
integration. No new dependency/table/migration. Frozen additive optional NotesApi:

- trashSnapshot():Promise<NotesTrashSnapshotReply>, named read, no args.
- emptyTrash({expectedCount,expectedFingerprint}):Promise<NotesEmptyTrashReply>.
- strict success snapshot {count:nonnegativeSafeInt,fingerprint:lowercaseSHA256hex}.
- strict success empty {deletedCount:positiveSafeInt,fingerprint:lowercaseSHA256hex}.
- request count positive. Empty0 is visible no-op, never false successful deletion.
- failure shapes use existing safe RPC errors. Exact count/fingerprint receipt
  required, no optimistic deletion or automatic retry. No renderer IDs/filters/
  SQL/paths/content can widen or change the deletion scope.

Sole owner computes deterministic SHA256 over domain-prefixed ordered UUID/revision
pairs for ALL trashed rows (stream, not one100-row list page). The digest is public
basis data, not permission authority. Mutation recomputes exact count/fingerprint
inside existing immediate transaction; additions/removals/revisions/restores cause
known conflict before any deletion. Single SQLdelete trashed=1 cascades saved
revisions; validate affected count/receipt before commit. No content/history export.
Existing individual delete remains available. Main narrowly validates trusted
Notes owner/frame/ready/Close/export gates and reserves actual shared write slot.
Before dispatch reads current basis; owner transaction remains authoritative.
After an unknown actual batch operation, mutations/Close/export remain blocked
until actual settlement AND a new deliberate fresh trashSnapshot reconciliation.
An overlapping read or ordinary noteGet/list cannot clear that global uncertainty.
No generic service or permission/proof token system is introduced.

UI lane owns existing packages/notes/src/controller.ts and index.tsx, existing
fixture only as needed (or new empty-trash fixture), NEW focused controller/browser
tests, NEW empty-trash-*.png and concise evidence report only. No shared/barrel/
manifest/contracts/storage/main/preload/status/historical PNG edits or authorcommit.
Reuse shared Button/TextField, current notes-recovery/alertdialog/focus restoration.
Existing notes workspace lives in packages/notes; task's apps/features path has no
implementation to replace. No new visual system or arbitrary layout tokens.

Button visible in Show trashed notes; preparing read is explicit and has no write,
flush/Save/export. Require idle/no pending/uncertain/dirty local draft before prepare;
disabled reason explains awaiting current autosave/recovery. Do not discard edits
or silently flush on Cancel. Capture scope/basis and selected context for confirmation;
block competing mutations/navigation/filter/edit/Close/export/Quick-note/open while
preparing/confirming/deleting. Read0 shows Trash empty. All filters still apply only
to library display, never deletion scope. Confirmation names ALLcount and scope,
warns irreversible logical deletion/saved revisions/backups, defaultfocus Keepnotes;
Escape/Keep cancel with no effect. Separate destructive click/Enter dispatches once;
held/composing Enter cannot confirm twice. Exact confirmed receipt only then clears
selected trashed source; preserve selected active source/content and other records.
Reload current filtered list without selecting a different note by position.

Pending actual call retains slot through caller deadline/navigation/disposal;
settlement cannot report late success/replay/hide/close another context. Unknown
message says Trash may already be emptied, never asserts it survived; preserve
view until explicit Reload Trash aftersettlement. Reload Trash obtains fresh whole
basis and reconciles selected stored source (Getnull may clear obsolete trashed
selection with no retained dirty edits), never repeats deletion. Failed/overlapping
reconcile retains uncertainty. Known conflict/refusal requires new Review/confirmation.
Keep existing single-note recovery/history/Close/QuickNote/export behavior intact.

Focused checks should cover actual new flow and safety: count beyond100pagination,
filter-independent scope, pinned/archivedTrash vs active preservation, cancel,
CASset-change/receipt mismatch, exact single dispatch, pending/unknown/recovery,
selection/Close/autosave races, keyboard/defaultKeep/escape, dark/light/200%/axe.
Use a small set of meaningful regressions; no duplicated matrices or new test
infrastructure. Component mocks are labelled; parent owns actual owner/Electron
checks. Freeze owned patch/hashes, map partial U1 criteria and explicit remaining
limits; no full completion claim. Keep report concise. Merge reviewed increment
promptly after applicable checks/reviews. Full1.0 scope/security remain unchanged.
