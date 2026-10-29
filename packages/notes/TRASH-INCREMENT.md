# U1-01 — recoverable Trash/restore application increment

Base integrated PR61/develop f00984e09b08adbccd9c37ca7a5f5d46b2f1c596.
Task docs/implementation/tasks/U1-01.md; read complete card and data.md,
product/builtins.md, testing-release.md, security.md, DESIGN.md/tokens.
F2-01 accepted; broader D1-02/native AT/full U1 acceptance pending. Complete local
1.0 scope unchanged. Small useful application increment, no infra/research/proof.

Coordinator frozen contracts in packages/contracts/src/notes.ts:
- Required trashed:boolean on NoteRecord/Summary; new records/default schema017
  migration trashed=false. Preserve existing archive/pin/content/history/timestamps.
- Optional named setTrashed({id,expectedRevision:positive,trashed:boolean}) returns
  existing strict write reply. Fixed notes:set-trashed channel/storage method. No
  caller content/path/SQL/authority. Requires existing record/CAS revision+1, even
  same-state, exact desired trashed and unchanged archive/pin/draft/saved/timestamps.
- Move to Trash is recoverable metadata, not permanent deletion. Explicit UI
  confirmation required before effect, with Keep note/cancel. No write/flush before
  confirmation. Confirmed intent flushes latest editable local draft without Save
  then metadata. Archived records skip content flush (content writes forbidden),
  preserving retained local edits for later explicit review/Retry/Save.
- Restore from Trash changes only confirmed metadata without content flush or
  replay; preserve archived/pinned flags and retained local edits. If previously
  archived, restored note still requires ordinary Restore note before editing.
- Ordinary draft/Save, Pin and Archive on trashed records refuse as known invalid
  requests in main+owner. Editor title/body/tasks/formatting readonly while trashed.
  New/Quick note may proceed from clean readonly records but retained local edits
  block navigation/New/Close until Restore/review or explicit existing close choice.
- list adds optional trashed:boolean defaultfalse. Normal active and archived views
  exclude Trash. trashed:true queries all trashed records regardless archive flag;
  archived:true+trashed:true is invalid. Both echoes normalized; every row trashed
  matches requested state; archive must match only outside Trash. Pinned filter
  stays orthogonal, even in Trash. SQL filters before paging. Cursor/order same.
  notesQueryRequest uses safeExtend to preserve cross-filter refinement.

Bounded UI flow: Move to Trash -> confirmation -> persist latest draft/metadata ->
row leaves current active/archive view only after ACK; selected editor remains
readonly with Restore from Trash guidance. Show trashed notes native checkbox
loads real owner Trash/search with Pinned only. Archive/Trash checkboxes mutually
exclusive: checking Trash clears Archive; checking Archive clears Trash. Restore
from Trash removes row from Trash view, retains selected editor/source/pin/archive;
visible message explains active versus still archived restoration. Turn off Trash
(and select Archive when appropriate) to find it. Missing API visibly unavailable.
Keep note/Cancel never mutates. No optimistic removal/simulated deletion.

Confirmation reserves exact selected note/intent synchronously, keeps other actions,
editing/navigation/New/Quick/Close from changing its target, and revalidates after
confirmation/flush. Confirmed trash shares existing metadata operation latch,
postflush/generation/exactreceipt/unknown/freshReload/noreplay/export/Close gates.
Preserve reviewed earlier explicit Save→New wait and Pin/Archive ownership fences.
No permanent Delete/Empty Trash/expiry/retention job/revisionrestore/attachments/
Markdownimport/new services/dependencies in this increment; full scope stays required.

UI author manifest_review_sol GPT-6.1 SOL/high, isolated
.worktrees/linuxcast-text-preview-native branch codex/notes-trash-ui. Own only
packages/notes/{src,tests,fixtures,evidence,README.md}. Coordinator copies contract/
freeze UNCOMMITTED; do not edit/stage these/shared manifests/lock/registry/routing.
Coordinator .worktrees/linuxcast-application-controls codex/notes-trash owns
schema017/storage/client/main/preload/actual application integration/status/testmaps.

Evidence: bounded controller confirmation/cancel/latestdraft/noSave/archivedretained/
restore/exactreceipt/otherflags/intentgeneration/latefilter and paging cases; real
Tiptap dark/light affected confirmation/Trash/restore, readonly/pending/unknown/
unavailable/refusal/keyboard/axe screenshots. Keep synthetic fixtures distinct.
Root actual schema16→17 snapshot/defaultfalse/preserved content+pins+archive, CAS/
history/filterpaging/reopen/privacy and production launcher/Quick→Trash/cancel/
confirm/find/restore/export/restart/crash behavior. All4U1criteria remainpending;
Debian GNOME/KDE Wayland/X11/nativeAT/perf/package/release/fullNotes stayrequired.
