# U1-01 — review and restore a saved revision as a draft

Dependency baseline: PR61/develop f00984e plus exact reviewed/tested Trash snapshot
/tmp/linuxcast-notes-trash-reviewed-root.patch SHA256
ee0f508ee18c54424fef7957e480d2c3fc9c6b9ed03997861972e4a2a2b57d6a.
Trash is not signed/integrated yet (1Password buffer error, readiness question pending).
Original Trash worktree remains frozen; this isolated follow-on does not publish or
claim its acceptance. Local baseline TREE (not a commit) in
/tmp/linuxcast-notes-revision-baseline-tree captures its exact source for diffs.
No unsigned commit. Integrate Trash first once signing returns, then this increment.

Task docs/implementation/tasks/U1-01.md. Read complete task and normative data.md
(retain last50 revisions/coalesce per minute), product/builtins.md, testing-release,
security.md, DESIGN.md/tokens (Shell/List/form/Chat notes/States/Accessibility/Review).
F2-01 accepted; D1/native AT/full U1 pending. Keep complete local1.0 scope.

Concrete flow: selected note -> Saved revisions -> owner-backed last50 metadata
(newest revision first) -> select one -> read-only rich title/body/task preview ->
explicit Restore as draft confirmation/Keep current draft -> restored content becomes
latest draft, current saved version stays unchanged until explicit Save. Opening/
preview/cancel never restores or Saves. No imported content, new editor grammar,
backup service, dependency, migration, research or proof scope.

Coordinator frozen notes.ts API (all optional only for genuine missing-capability UI):
- history({id,expectedRevision}) -> NoteHistoryReply {id,currentRevision,revisions}
  summary entries {revision,createdAt,title}, <=50, strictly revision descending,
  all revision <= currentRevision. Whole body content is not returned in the list.
- getRevision({id,expectedRevision,revision}) -> NoteRevisionReadReply
  {id,currentRevision,savedRevision:{revision,createdAt,content:NoteContent}}.
  This fetches exactly one validated closed rich document, within existing bytecaps.
- restoreRevision(same strict selection, no content) -> NotesWriteReply. Requires
  existing active, nontrashed note at exact expectedRevision and stored saved revision.
  Owner derives source, increments current revision1 and updates draft/search/modified
  timestamp. Keeps current saved version/pin/archive/trash/creation time/history.
  No new saved history entry until separate Save. Same-content Restore still CAS+1.
- Main and owner both refuse restore to archived/trashed notes. History/preview may
  be read for readonly notes, but UI explains restore from Trash/Archive first.
- Read responses must match exact id/currentRevision and selected revision. Restore
  receipt exact next revision/draft selected preview, saved unchanged and metadata
  preserved; no caller content/path/SQL. Same actual write/export/Close/deadline/
  uncertainty/freshGet/no replay as current Notes mutations. Missing/pruned/coalesced
  saved revision or stale current revision refuses without substitution.

History interaction reserves exact selected context synchronously, preserves earlier
admitted Save before any new flush/selection, and freezes competing edit/nav/New/
Quick/metadata/export/Close until closed or restored. Normal editable pending draft
may flush without Save before loading history. Paused/retained edits after recovery,
readonly content and blocked/uncertain state must never be replayed implicitly by
opening history: keep local edits, require existing recovery when blocked; for
paused or readonly data skip content flush. Confirmation clearly warns restored draft
replaces latest draft/retained local edits; Cancel keeps them unchanged. Successful
explicit Restore may replace those edits after confirmation; never automatic replay.
Preview reads have generation/lifetime guards so late old previews cannot replace
newer selection. Confirmation captures exact preview/content/id/revision; all states
retain existing error/reload recovery. Unknown restore may already be stored; retain
local content, close history and explicitly fresh Reload before another write.

Reuse existing rich editor for readonly preview and shared host controls/tokens.
Preview must include checked task state/literal Unicode safely, with unique accessible
labels/IDs if alongside current editor. No generic HTML/Markdown execution or raw
export serializer relocation; its existing contract is main-owned. History closing
restores focus and preserves current editor state. No permanent deletion, prune UI,
attachments, root provider, import/Markdownroundtrip or new service in this increment.

Worktrees/ownership:
- coordinator .worktrees/linuxcast-notes-revision-restore branch
  codex/notes-revision-restore: shared contracts/storage/main/preload/actualapp/status.
- UI manifest_review_sol GPT-6.1 SOL/high .worktrees/linuxcast-notes-revision-ui
  branch codex/notes-revision-ui: ONLY packages/notes/{src,tests,fixtures,evidence,README.md}.
  Reviewed Trash snapshot is uncommitted baseline, not your changes; shared contract/
  freeze copied UNCOMMITTED, do not edit/stage sharedfiles/manifests/lock/status.
  Stage only owned paths; produce delta with git diff <baselineTREE> --binary --
  ownedpaths (not HEAD). Keep frozen Trash tests/screenshots unless a current change
  requires updated affected evidence; prior Trash increment must stay separable.

Evidence: meaningful controller history/previews/noeffects/cancel/restore/receipt/
queuedSave/late generations/readonly/retained/unknown/disposal cases; bounded rich
browser dark/light history/list/preview/confirmation/result/loading/error/missing,
keyboard/axe captures. Root actual owner50-retention/coalescing/clockrollback/
source/pruned/stale/CAS/search/reopen/privacy and production choose retained version
-> explicit Restore draft -> separate saved unchanged -> export/close/restart/crash.
Synthetic fixtures are not native desktop/owner evidence. All4U1criteria remain
pending; full Debian GNOME/KDE Wayland/X11/AT/performance/package/release retained.
