# L1-01 / U1-01 — search and open stored Notes from the launcher

Integration update, 29 October 2026: merged [PR64](https://github.com/ianwijma/linuxcast/pull/64) at `f6585ed2c14faed6558e4e661995152cd695e986`. Configured signing is repaired. The original review-time baseline/publication statements below are historical; PR62/63/64 are now all integrated. Validation limits and outstanding full task/desktop/release acceptance remain unchanged.

29 October2026. Reviewed/tested unfinished application increment. Coordinator
codex/notes-launcher-search, UI codex/notes-launcher-ui. Baseline TREE
15d2db5ee706535bd0b9385c596b84013e975887 contains the separate reviewed local Trash
and saved-revision increments atop developf00984e. Neither is signed/integrated yet:
1Password still fails, prepared manual signed-commit request pending. Publish those
first, then this focused increment. No whole task/prerequisite/release completion.

## Resulting behavior

Local root search now merges up to20 active stored Notes matches with the existing
registered commands. Matching uses normalized, edge-trimmed literal title/full-body
substring search in the sole SQLite owner; body matches beyond the displayed excerpt
remain searchable. SQL filters Archive/Trash before ordering pinned, modified time
and stable identity, then applies21-row lookahead. Source records, including the
lookahead, are validated; malformed source content is preserved and refuses results.
Only bounded title/excerpt/pin/draft/time/UUID/revision metadata reaches the launcher.
Empty query includes pinned/recent notes; More opens the existing Notes library.

Notes use a separate shared List section with stable note:UUID row identities and
one Open note action. They never enter generic Execute/pin/alias/hide or full command
catalogue authority. Query generations, nested-view/lifetime fences and current
receipts prevent stale results/late Hide; body-only matches are not title-filtered.
Registered commands retain priority, Notes<=20, total results<=100, and existing
calculator/fallback selection remains stable when Notes arrive. Existing closed
providers currently cap commands/applications at20 each; an initial review claim
of reproduced100command+20Notes overflow was withdrawn. The explicit total budget
is defensive; the real100fallback+lateNotes regression verifies that boundary.

Main issues only the newest successful search choices for the invoking frame and
catalogue/generation. Deliberate selected Open rechecks that issued ID/revision,
fresh parent Notes visibility, current frame and actual active source revision.
The existing Notes workspace reserves navigation, waits admitted Save, flushes the
latest ordinary outgoing draft without Save, and freshly reads exactly the selected
active revision. Same-ID selection still rereads. Paused/blocked/readonly retained
edits, History/confirmations, Quick, export and Close refuse rather than replay.

A strict monotonic ready/requested/finished callback confirms the exact validated
owner Get and successful host selection together; a renderer boolean alone is
insufficient. No fallback note or new UUID is created. Delivered unknown outcomes
hold the real operation slot until callback completion/owner loss and never replay
on READY/reconnect. Source stale/Archive/Trash/unknown states keep local data and
provide explicit Reload/Open Notes guidance. Only confirmed current navigation may
separately Hide the launcher. Quick/export/nativeClose/Quit coordination is retained.

Queries go only to the named local main/owner search, never to providers/network,
usage history or logs. Confirmed use records only the fixed linuxcast:open-notes
aggregate, excluding note UUIDs, titles, bodies and queries. No new migration,
dependency, service, permission, visual system or generic IPC authority.

## Checks and limits

Pop!_OS22.04 Linux amd64; pinned Node24.22.1/Bun1.4.4/Electron45/SQLite3.53.4.
Owned private Xvfb X11/profile/database and public generated content only. This is
not supported Debian13 GNOME/KDE Wayland/X11/native AT or release evidence.

- Union of actual L1-01/U1-01 unit mappings:567 PASS,13 files; contracts:43 PASS,
  five files. New11 closed contract checks, source/controller generations, selected
  identities, cap/recovery and exact navigation/cancellation boundaries included.
- Mapped `bun run test:security -- L1-01`:170 PASS. U1-01:208 PASS. Suites overlap.
  Four new/changed broker/preload test files:96 PASS including47 Notes preload.
  Main search/open23 and host callback14 cases cover stale issued generations,
  wrong sender/frame/selection/echo/order/authority, late source and readonly refusal,
  fresh visibility, held read/open deadlines, READY dedupe, exact owner-read+ACK,
  lifecycle/Quick/export/Close, explicit known refusal versus unknown and no replay.
  The preload exposure assertion was updated to exactly the two new named methods;
  the initial stale-key assertion failure is disclosed, not weakened.
- Union mapped integration:49 PASS across six files, total23.34s. Includes six new
  actual SQLite search-owner cases,23 retained Notes-owner and19 command-owner
  regressions, plus the actual production app scenario. Search-owner coverage:
  >20 filter/order before cap, body match beyond excerpt, literal Unicode/%/_/\,
  trim/internal whitespace,20-vs21 lookahead, source/history/reopen/clear/privacy,
  malformed caller authority and corrupt21st source preservation/refusal.
- Production: actual registered launcher/Quick and retained rich Note/archive/Trash/
  revision/export flows -> two stored body matches -> ArrowDown/Up across distinct
  IDs -> exact selected note in the same one Notes workspace -> prior dirty note
  CAS+1 with its saved version preserved -> actual --show singleton reopen/native
  Close/Quit/restart/private owner+app crash -> exact two-record owner recovery.
  Final usage export excludes both UUIDs, root query, new titles and note content.
  The successful earlier app-only run was22.84s; final source passes the49-test union
  above without claiming that total runtime as this individual app duration.
- First production attempt passed the new selected-open path but failed the old
  reopen helper, which tried filling a hidden inactive launcher. The helper now
  invokes the actual private-profile single-instance --show path and waits for a
  read-only visible ACK. No application behavior is instrumented for this change.
  Existing native export chooser selection remains instrumented, as previously
  documented; SQLite/export writer and selected-note navigation are real.
- Author392 distinct units:391 full/retained plus17 targeted (16 overlap),42 new.
  Seven launcher Chromium cases PASS5.1s; five Notes Chromium cases passed earlier
  on the then-identical Notes sources. Redundant final five had startup SIGSEGV and
  executed none. Initial launcher locator failures and the real unknown/recovery
  action reachability finding were corrected; seven final launcher cases pass.
  The later one-line completion-publication correction passed its17-case focused
  suite and final production/unit union; no post-correction browser pass is claimed.
- Full integrated pinned-Node TypeScript PASS, including final fixtures/tests and
  completion correction. Author later compiler139/startup crashes remain disclosed;
  no crash counts as a passing check. Exact changed-file ESLint and plan checks are
  recorded in the coordinator checkpoint.

## Review and capture identity

Independent backend review alias_review_sol CLEAN after the monotonic-deadline P2
was fixed: every post-await source/open dispatch checks performance.now() expiry,
not only timer-fired state. Controlled clock-jump regressions and stale issued
generation refusal pass. Storage module94bfbfeccc598ee660f756d2478978a27dfced65e0811f6b67f835135e2bdf32;
main search62795a1a1af0fe4553fc888cdcd104556a03d1c6c37452870bf46550f0f8f973;
open24a6370acca2af3be798e2bc785f75c8194f0ed4342ede8c86ecd08eafeca68c.

UI/source/production assertions and12component+4actual affected captures reviewed
independently CLEAN. Final completion reentrancy correction reviewed separately:
success no longer publishes redundantly after releasing navigation ownership; the
new disposal regression verifies exact completion. Owned23-file patch
56afeec4ff8b0435ba5bbcf5941167be61e6624d9889007b5a621b6365ed4a22 and manifest
048ba20ae8e4fb27eeaba4f881a89080e6460d2a7a46535157e920e73304aeaf reconcile every
root file; no shared/baseline changes or deletions. Notes controller
3cb10cbee8ef075a46e37af41625f8f95f477f096325beb80f0774727ba23e9b.

DESIGN Shell/navigation, Results/actions, List/forms, Chat/notes, States/motion,
Accessibility/Review; existing host List/Actions/editor/tokens. Actual images here:
notes-launcher-{results,selected}-application-{dark,light}.png. Component captures
cover title/body results, late pending, stale/unknown recovery actions,200% and
incoming Notes focus/retained edits. Historical images retain baseline bytes.

## Still required

Signed current-head PR/CI/configured-review/normal integration of Trash, revisions,
then this flow. Full provider/ranking/fallback/AI scope, permanent deletion/Empty
Trash, attachments, full Markdown import/roundtrip/native chooser, broader F1/D1,
native AT, Debian desktop matrix, performance/package/release acceptance remain.
Private SQLite is unencrypted; unacknowledged edits may be lost on forced crash.
Complete local1.0/all97/R1-03 scope remains mandatory.
