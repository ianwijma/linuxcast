# U1-01 — archive/restore application increment

Task docs/implementation/tasks/U1-01.md; base integrated PR59/develop
2aa49e540c8be6ea1fba1e0e85e945975fa88542, after PR57 create/edit,58export,59pin.
Complete local1.0 scope retained, no new infrastructure/research/proof assignment.
F2-01 storage accepted; shared UI reused with full D1/nativeAT acceptance pending.
All four U1 criteria remain pending. This is another bounded application increment.

Coordinator freeze in packages/contracts/src/notes.ts:
- NoteRecord/NoteSummary require archived:boolean alongside pinned:boolean.
  Schema016 old/current records migrate to archived=false, retaining pins/content.
- Named optional NotesApi.setArchived(NoteArchive):Promise<NotesWriteReply>;
  NoteArchive is strict {id,expectedRevision:positive,archived:boolean}. Production
  implements; absent host capability visible unavailable, never simulated success.
  Owner CAS increments revision exactly1, even explicit same-state. Requires existing
  note, retains pinned/draft/saved/createdAt/updatedAt and all saved history.
- list input/result add optional archived:boolean, omitted=false means ACTIVE ONLY;
  true means archived-only. Pinned filter remains orthogonal. Owner SQL applies both
  filters before paging. Main/client/preload/UI compare normalized archived and
  pinnedOnly echoes and every row's archive/pin state. Cursor/order stays updatedAt/
  id; filter/query change resets cursor and generation. Get still reads either state.
- Ordinary draft/Save to archived notes refuses as a known invalid request. Content
  must first be restored; UI marks archived editor readonly with visible guidance.
  Archive stores latest local draft before metadata without Save. Restore does NOT
  flush an archived editor: it changes only confirmed stored metadata, preserving any
  retained local edits for explicit review/Retry/Save, never automatically replaying
  edits retained through uncertainty. Pin on archived records similarly changes only
  metadata without a content flush; retains local edits and archive state.
- Normal writes preserve both pin/archive metadata; Pin preserves archive, Archive
  preserves Pin. Metadata receipts require exact id/revision/requested flag, unchanged
  other flag, stored draft/saved/timestamps. No caller content/SQL/path/authority.

Bounded user flow: Archive note -> after confirmed persistence, row leaves Active
library while selected editor remains with Archived notice and readonly content;
Show archived notes checkbox loads actual owner archived view; select/search stored
archive; Restore note -> archived row leaves archive view, same content/pin restored
and editor editable; turn off archive filter to find restored record. Pinned only
works within either view. No Trash/Delete/import/new services/attachments in scope.
Known refusal/unknown/freshReload/no-replay/missing-capability follow existing recovery.
One admitted metadata intent gates pin/archive/Save/export/New/select/edit/close;
preserve the reviewed queued-intent/postflush ownership protections. Reuse shared
controls/tokens and existing Notes surface. No optimistic archive/removal before ACK.

UI owner manifest_review_sol, GPT-6.1 SOL/high:
.worktrees/linuxcast-text-preview-native, codex/notes-archive-ui. Own only
packages/notes/{src,tests,fixtures,evidence,README.md}. Coordinator copies frozen
contract/freeze UNCOMMITTED; do not edit/stage shared files/manifests/lock/registry.
Coordinator .worktrees/linuxcast-application-controls, codex/notes-archive owns
schema016/storage/client/main/preload/actualapp/tests/status and this freeze.

Before behavior read full U1 card; data.md, product/builtins.md, testing-release.md,
security.md, DESIGN.md/tokens.json. Dependency implementation evidence is PR57/58/59;
full shared UI/nativeAT acceptance still pending, not inferred from status labels.
Tests/captures: meaningful controller exactreceipt/flush/readonly/restore-retainededit/
queuedintent/generation/filter cases; dark/light real Tiptap keyboard/axe, pending,
unknown/retaineddraft, missing/refused states. Root actual SQLite15to16 migration,
CAS/source+pin/history preservation/active-archive filter+paging/reopen/privacy and
production Electron archive/find/restore/export/restart/crash checks. Keep mocks
separate from actual owner/application evidence. FullsupportedDebian/nativeAT/
performance/package/release, remainingNotes flows and Markdownroundtrip stayrequired.
