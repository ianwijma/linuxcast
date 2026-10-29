# L1-01 / U1-01 — launcher Notes search and exact open

Task cards docs/implementation/tasks/{L1-01,U1-01}.md; complete local1.0 scope remains.
Normative overview.md, product/builtins.md (root search and Notes), data.md,
security.md, testing-release.md, DESIGN.md/tokens Shell/navigation, Results/actions,
List/forms, Chat/notes, States, Accessibility/Review. F2-01 accepted; existing shell
and shared UI are integrated, broader F1/D1/nativeAT/desktop/fullL1/U1 remain pending.
User authorized reviewed/tested unfinished app increments. No acceptance inferred.

Baseline TREE15d2db5ee706535bd0b9385c596b84013e975887 captures exact reviewed local
Trash+saved-revision increments atop signed developf00984e. Neither follow-on signed
or integrated yet due configured1Password buffererror. Keep original worktrees
frozen. No unsigned commit, signing-config changes, unrelated proof/infrastructure.
This increment merges after those two; diff against baseline TREE, never HEAD.

Concrete journey: root local title/body query -> at most20 real active Notes results
-> stable keyboard selection -> deliberate Open -> exact selected note in existing
Notes workspace. No automatic create, Save, restore, export, remote query or generic
Execute. Existing outgoing editable draft flushes without Save; previously admitted
Save settles first. Paused/blocked/retained readonly edits refuse navigation with
useful guidance; never implicit replay. History/confirmation/export/Close/Quick/new
operation blocks selected open. Same-ID target still revalidates expected revision.
Incoming get after outgoing flush must match exact id/revision and active/notTrash.
On stale/missing/refused/unknown preserve current/local state, offer explicit Reload/
retry; never select an arbitrary fallback note, never replay after READY/reconnect.

Frozen packages/contracts/src/notes-launcher.ts:
- query <=512 UTF16 units/2048UTF8 bytes, no controls/lone surrogates; local owner only.
- notes.searchRoot({query}) -> {query,records<=20,hasMore}. Records id/revision/title/
  excerpt<=1024bytes/pinned/hasDraft/updatedAt, no full body/saved/history/path/SQL.
  Actual source title+full plain-body projection match trimmed-query NFKC lowercase escaped literal
  substring (%,_,backslash literal). Active/nontrashed only. Pinned then modified
  descending/id descending before LIMIT21. Validate actual source records before
  projection; corruption refuses/preserves source. Empty query lists recent/pinned.
- searchLauncherNotes({revision:catalogueRevision,query}) -> same +catalogue revision.
  Strict echo/query/identity/limits; only newest admitted read publishes issued IDs.
- openLauncherNote({revision:catalogueRevision,selection:{id,revision:noteRevision}})
  -> {outcome:'opened',selection}. Strict exact receipt. Separate named operation,
  synthetic root item id note:UUID never enters generic Execute/pin/alias/hide/usage.
  Parent Notes availability/visibility fresh at search/open, revalidated after await.
- NotesApi.onOpenNoteRequested(handler(selection)->Promise<boolean>) optional only
  missing-capability fixture. Production includes. Subscribe/unsubscribe and one
  monotonic attempt callback via ready/requested/finished closed schemas. Coordinator
  main observes exact validated owner Get before accepting opened=true. Delivered
  timeout cannot replay; outstanding actual callback retains slot until completion
  or owner closed. Quick/export/nativeClose/Quit serialized. No window recreation to
  evade uncertain old operation. Main source check and current invoking frame hold.

Root UI adds a separate Notes group to existing ViewModel/shared List. Do not put
notes in full command catalogue or grant generic preference/execution authority.
Merge <=100 total; Notes<=20. Owner search supplies full-body match, so do not filter
body-only results through title-only fuzzy ranking. Exact aliases/registered commands
retain priority; pinned/recent note order comes owner. Late provider must preserve
selected stable item/primary action (including calculator/fallback intent). Abort/
generation/lifetime fences for query/Reload/nested view/disposal; clear stale rows on
query change, block old-note execution while refreshing. No autoHide on stale result.
A successful deliberate open may separately Hide only after exact current receipt.
Unavailable/loading/error/empty/more guidance distinct; more goes existing Notes
workspace, never pretends all notes fit root20. Hide Notes suppresses provider.
Query/source content must not enter command-use export/logs/persistent history;
only fixed aggregate linuxcast:open-notes use on confirmed navigation. Public data.

Ownership/worktrees:
- coordinator .worktrees/linuxcast-notes-launcher-search codex/notes-launcher-search:
  shared contracts/indexes/IPC/preloads/repository registration/client/testmap/status/
  actual production evidence. Frozen API copies are not UI owned. No new migration,
  dependency/lockfile, service, settings or visual system.
- manifest_review_sol SOL6.1/high .worktrees/linuxcast-notes-launcher-ui branch
  codex/notes-launcher-ui: ONLY apps/desktop/src/features/launcher/{controller.ts,
  tests,fixtures,evidence,README.md} and packages/notes/{src,tests,fixtures,evidence,
  README.md}. Implement both presentation halves as this one bounded user journey.
- storage module author owns ONLY packages/storage/src/notes-root-search.ts and
  packages/storage/tests/notes-root-search.integration.test.ts in coordinator checkout.
  Main/contract/registration/migration/shared files remain coordinator-owned.

Evidence: focused real controller/async/keyboard/axe and light/dark affected states;
actual SQLite >20/page/filter/fullbody/literalUnicode/hidden-source/pinned/reopen/
corruption/privacy; main/preload strict/frame/stale/held deadline/no-replay/visibility
and true exact owner-read observation; real isolated production root title/body query
-> arrows/Enter exact selected Notes -> prior draft preserved/no Save -> fresh edit/
restart, stale/Archive/Trash refusal where appropriate. No headless fixture counts
as Debian GNOME/KDE Wayland/X11/nativeAT/performance/release acceptance. Full current
L1/U1/D1 and remaining1.0 tasks stay pending without their complete evidence.

Package delta using temporary index initialized to baselineTREE and only owned paths,
then git diff --cached --binary baselineTREE. Include new files and preserve all
baseline additions/images. Send patch+per-fileSHA256 manifest; no commit/sign/push.
