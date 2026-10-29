# U1-01 — confirmed permanent deletion of one trashed note

29 October 2026. User-authorized reviewed/tested unfinished application increment.
Base merged PR65/develop0be9eaba8a9cedcbc1bbeb43e79f519ace2b9dc2; application baseline
PR64/f6585ed2c14faed6558e4e661995152cd695e986 unchanged by PR65. Coordinator
codex/notes-permanent-delete; UI codex/notes-delete-ui. All full U1/D1/native desktop,
AT/performance/package/release acceptance stays pending. No full completion claim.

## Behavior and boundary

Only the selected existing trashed note offers Delete permanently. Explicit
confirmation captures exact UUID/revision, focuses Keep note first and supports
Escape. It explains that the note, saved revisions and retained local edits are
removed without undo here; backups can retain content and this is not secure
erasure. Confirmation cancellation performs no write or draft flush. Archived
trashed notes remain eligible; active/nontrashed records refuse in main and owner.

Confirm calls a strict named API once. The sole SQLite owner validates current
source/trashed state/CAS and transactionally deletes exactly one source with its
existing FK-cascaded saved revisions. Missing/stale/corrupt/nontrashed source and
caller content/path/SQL/additional authority refuse without simulated success.
Main and preload require the exact id/deletedRevision receipt. No new migration,
dependency, service, attachment cleanup or automatic retention machinery.

The UI reserves selection synchronously; history/metadata/export/New/Quick/selected
open/filters/Close/lifetime fences retain target ownership. No optimistic removal,
replacement note, automatic retry/replay or implicit Save. Exact success clears
only the deleted selection and local edits, preserves filters and refreshes the
list. Uncertain delete holds actual main write/Close/export gates through owner
settlement and requires an explicit stable fresh Get to release uncertainty.
An early or stale-generation Get cannot reconcile. A settled fresh null clears
obsolete selection with an informational missing-note result, without claiming
that the unacknowledged deletion succeeded. Main slots do not end at caller timeout.

## Checks and review

Pop!_OS22.04 Linux amd64, pinned Node24.22.1/Bun1.4.4/Electron45/SQLite3.53.4;
owned private Xvfb X11/profile/database, synthetic public content. This is not the
supported Debian13 GNOME/KDE Wayland/X11/native AT/high contrast/release matrix.

- Mapped U1 unit395 PASS/9files; contracts32 PASS/3files; security238 PASS/9files.
- Independent boundary lane205 distinct PASS:178 contract/client/main/preload
  and27 actual owner cases. After type-narrowing fix89main checks PASS again;
  do not add this overlap to205. Owner cases cover saved revisions/source cascade,
  unrelated records/history/query/reopen/privacy, malformed authority/refusal,
  corrupt source preservation and trigger-induced cascade failure rollback.
- Author216 focused units incl23newdelete cases PASS. New10 real Tiptap browser
  cases PASS25.2s;55existing Notes/launcher browser regressions PASS1.2m. Public
  component fixtures are synthetic; all14new captures independently inspected.
- Actual production application-only check PASS38.17s (40.90s totalrunner), not a
  claimed single full mapped integration run. Existing registered launcher/Quick,
  rich task/Save, Pin/Archive/Trash/revision/export, body search/Arrow/exact open,
  Close/Quit/restart/forced private owner+app crash all remain exercised. Then the
  selected rich note enters Trash;600ms confirmation leaves exact source/history
  unchanged; Escape and Keep each preserve them; explicit Delete clears only that
  selected note, keeps Trash filter/emptyselection, preserves the other Quick note
  exactly, and survives nativeClose/reopen/Quit/restart. Reopened sole owner sees
  deletedid null/history conflict, no deleted rootsearch match and preserved other
  rootsearch match. Command-use export excludes both IDs/query/titles/content;
  every Notes window has outbound-request observation. No HTTP/S requests observed.
- The pre-existing native export chooser selection remains instrumented; Notes
  effects, sole owner, export writer, selection, actual --show and deletion are real.
- Final full direct pinnedNode TypeScript and scoped18changedTS/TSX ESLint PASS.
  Render/plan/status/diff checks recorded by coordinator before publication.

Independent backend review closed two findings: delete uncertainty originally
released Close/export fencing after actual settlement, and the smaller deletion
input caused TypeScript rich-mutation union narrowing errors. Delete-specific
uncertainty and separate typed input fixed both; regressions/compiler pass.
Independent final UI/source/actualassertion/14component+4production capture review
CLEAN, no remaining actionable finding. Earlier browser sandbox listen EPERM and
owner socket lock denial required approved execution outside the restricted
sandbox; neither was counted as a pass. Initial application build lacked the new
worktree's Electron SQLite addon; the existing pinned setup:sqlite completed, then
the final actual application check passed. No sandbox-disabling flags used.

UI21-file patch90bdfe8bb0cf793fb037951efcf7bb9323f2fd4034b2e34992a81f5eaf31c161
reconciles every owned hash. Boundary5-file patch
ee307c1243b1a628c70255ac4095f1d4fd26b928510f7fca157affab8871815a reconciles test
and reviewed production hashes. Historical35application PNGs restored baseline;
only four new production images belong to this increment.

## Design and remaining scope

DESIGN.md Shell/navigation, Results/actions, List/detail/forms, Chat/notes,
States/motion, Accessibility, Review gate; shared host buttons/focus/tokens/editor.
Actual images notes-delete-{confirm,empty}-application-{dark,light}.png. Component
captures cover confirmation/cancel/empty/pending/unknown/refused/unavailable/
retainededits/otherrow/200percent and both themes. No private source content.

Empty Trash/bulk deletion, attachments/fullMarkdown import-roundtrip/nativechooser
and full Notes/launcher/remaining1.0 scope stay required. SQLite remains ordinary
unencrypted private storage; deletion is logical and backups may retain content.
Full desktop/session/AT/highcontrast/performance/package/release gates remain open.
Signed publication/current-head CI/configured GitHub review/normal merge precede
integration. No task status or acceptance result is promoted from this increment.
