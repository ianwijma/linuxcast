# U1-01 — confirmed permanent deletion of one trashed note

Base integrated PR64/develop f6585ed2c14faed6558e4e661995152cd695e986. Full U1 task
card docs/implementation/tasks/U1-01.md and normative data.md, product/builtins.md,
testing-release.md, security.md, DESIGN.md/tokens required. F2-01 accepted; actual
integrated storage/schema017, Notes/Trash/revisions/root search/shared UI reused.
Broader D1/native AT/full U1/dependency acceptance remains unfinished under the
user-approved bounded unfinished-application sequencing. Full local1.0 unchanged.

Coordinator-owned contract, packages/contracts/src/notes.ts:
- optional NotesApi.deletePermanently({id:UUID,expectedRevision:positive}) returns
  strict NotesDeleteReply, success {ok:true,value:{id,deletedRevision:expectedRevision}}.
- Fixed channel notes:delete-permanently, repository notes.deletePermanently;
  no content, SQL, paths, arbitrary ID list or authority accepted.
- Sole owner validates the exact existing trashed revision, deletes that note and
  its retained saved revisions atomically, verifies one row removed, emits exact
  receipt. Missing/stale/nontrashed/corrupt source refuses; never simulated or
  idempotent success. Main preflights same constraints, deadline/frame/readiness,
  shared actual mutation/export/Close/uncertainty/freshGet/no-replay gates; preload
  checks exact receipt. No new migration/dependency/service/retention work.

Owned UI implementation: existing packages/notes/{src,tests,fixtures,evidence,
README.md}. Add Delete permanently only for selected trashed record; no bulk Empty
Trash in this increment. Explicit confirmation reserves copied exact target/revision
synchronously. Keep note focused by default; Escape/Keep/cancel no write or flush.
Disclosure: removes this note, saved revisions and retained local edits; cannot be
undone here; backups may retain content and this is not secure erasure. Existing
trashed editor remains readonly. Confirmation may explicitly discard paused retained
local edits; cancel preserves them. No dirty-draft Save/flush before deletion.

Confirm calls named API once for captured id/revision. Fence navigation/New/Quick/
selectedopen/Save/meta/history/export/filters/Close/lifetime before/after every await;
no retarget, optimistic removal, fallback note, automatic Retry/replay or new UUID.
Exact confirmed receipt clears selected editor/review/local drafts for only that
note and refreshes current filter list. Do not auto-select another row. Invalid or
uncertain receipt retains local state and requires fresh Reload once actual write
settles; settled owner-null may report note no longer exists and clear obsolete
selection, without claiming an unacknowledged deletion succeeded. Known refusal
retains note with recovery. Missing API visibly unavailable; old fixtures optional.
Preserve saved-revision/openSelected/Trash/New/Save/Close fences and source privacy.

UI evidence: meaningful controller captured-target/cancel/noeffect/retainededits/
exactreceipt/unknownlate/reload-null/disposal/competingoperations regressions; actual
Tiptap keyboard and affected dark/light confirmation/cancel/pending/unknown/refused/
unavailable/empty-after-delete states with inspected captures/axe. Coordinator
owns contracts/storage/client/main/preload/routing/registry/testmaps/actual app.
Ask coordinator for shared interface changes, do not modify shared files or commit.
Report exact owned patch/hash manifest, command results, screenshots and limitations.
No further infrastructure/research/proof work. All full U1 acceptance stays pending.
