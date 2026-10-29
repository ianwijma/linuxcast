# U1-01 — pin/unpin and Pinned filter application increment

Task card docs/implementation/tasks/U1-01.md. Base integrated PR58/develop
b945289012c53a05a71193f9650df5a12ce06dfc, after PR57 create/edit/recovery.
F2-01 accepted; existing shared host UI reused under approved unfinished-increment
sequencing. Full D1/nativeAT and every full U1 acceptance criterion remain pending.
No new infrastructure, research or proof assignment. Complete 1.0 scope retained.

Coordinator contract freeze (packages/contracts/src/notes.ts):
- NoteRecord and NoteSummary now require pinned:boolean. Real old records migrate
  to false; all synthetic fixture records/summaries explicitly include false.
- NotesApi.setPinned?(input:NotePin):Promise<NotesWriteReply> is named and optional
  for genuinely older/disconnected fixture hosts only. Production implements it;
  absence is visible/unavailable, never simulated success.
- NotePin is strict {id:UUID,expectedRevision:positive revision,pinned:boolean}.
  No toggle verb/caller document/SQL/path. Owner CAS increments revision by exactly
  one even for explicit same-state admission. Existing record required; no creation.
  Draft/saved/createdAt/updatedAt and saved-revision history stay exactly unchanged.
- list({query,pinnedOnly?:boolean,cursor?}) and its response include optional
  pinnedOnly echo, normalized omitted=false. Existing updatedAt/id ordering/paging
  stays; pinnedOnly=true filters actual owner records, not a loaded-page subset.
  Main/client/UI verify echo and every pinned-only row's pinned=true. Changing
  search/filter resets cursor and query generation. Selection stays by UUID.
- Normal draft/Save must preserve current pinned state. Main/preload/controller
  verify metadata receipts, just as content/id/revision receipts; forged/missing
  state is not trusted. Pin success requires exact requested pinned, new revision
  and unchanged draft/saved/timestamps. Pin unknown uses existing explicit fresh
  Get/Reload reconciliation and no automatic replay. Source stays local/private.

Bounded UI: selected note Pin note/Unpin note, textual pinned row accessory and
shared labelled Pinned only filter. Flush newest local draft without Save before
pinning, then use current record revision and explicit desired state. Freeze note
mutation/Save/export/New/selection and refuse Close while pin request is pending;
share one admitted promise for double/held activation. Show pending, known refusal,
conflict/unknown recovery and unavailable truthfully. Pin is never optimistic.
Unpin in Pinned view removes it on actual refreshed list while keeping the selected
editor/local draft safe. Native Close/Quit respect pending metadata operation.

UI owner manifest_review_sol in .worktrees/linuxcast-text-preview-native branch
codex/notes-pin-ui: only packages/notes/{src,tests,fixtures,evidence,README.md}.
Coordinator in .worktrees/linuxcast-application-controls branch codex/notes-pin owns
shared contract/migration015/storage/client/main/preload/appintegration/registry/
manifests/test maps and this freeze. No manifests/lock/new dependencies needed.
Coordinator copies frozen shared contract to UI worktree; agent must not stage or
modify it, or unrelated previous work. Full typed/rendered editor retained.

Read full normative data.md, product/builtins.md, testing-release.md, security.md,
DESIGN.md/tokens.json before behavior. Reuse existing host primitives/tokens and
Notes surface. Evidence: focused controller receipt/race/flush tests, dark/light
real Tiptap keyboard/axe/filter/pending/unknown captures; root actual SQLite
migration14to15/CAS/pin-filter/query-paging/preserved-content/reopen/privacy and
production Electron pin/filtered-find/unpin/restart plus existing export/recovery.
Full native AT/supported Debian sessions/performance/package/release and remaining
archive/trash/restore/revisionrestore/attachments/import/Quicknote/rootprovider stay
required; this increment does not claim them or mark the task done.
