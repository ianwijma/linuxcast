# Saved web Quicklinks — bounded L2-05 increment

Frozen implementation interface, not acceptance evidence. User-approved small
application increments retain full L2-05/1.0 placeholders, argument snapshots,
typed component builders, file/URI/browser/open-with, tags/pin/hide and native
export. This slice is explicit literal HTTP/HTTPS definitions only. Reject raw
braces/placeholder syntax before canonicalization; never silently encode it into
an executable target. Encoded literal braces remain literal, never interpolated.

Use existing launcher ViewSession/shared List/Form/Actions/tokens, no new window
or renderer system. Registered root `linuxcast:open-quicklinks` opens local UI,
not a simulated main execution. Main registry max7builtins+4096apps=4103;
local quicklinks are not synthetic root commands. Store max500 definitions.
List contains all ordered summaries `{id,revision,name,host}` (unique/sorted UUID
IDs), never URLs or query history; local query projects at most100 matches with
refinement guidance and stable selection. Full target is available in Edit or
Details via get. No action opens on query, selection, create/save or navigation.

Record `{id,revision,name,url,createdAt,updatedAt}`: strict shared schemas,
name trim/no controls/validUnicode/max128 UTF16 units+256UTF8bytes; URL uses the
existing credential-free canonical HTTP/HTTPS gate plus raw-brace rejection.
Create has no ID and expectedRevision0; update has existing ID/positive revision.
Owner generates UUID/time, unique name_key is normalizeQuicklinkName(name),
preserves createdAt, increments revision once, updates only that definition.
Delete is conditional on ID/revision. Clearing command usage preserves entries.
Definitions live in the ordinary private SQLite DB, not encrypted at rest;
portable encrypted backups/export remain their separate required work.

Coordinator migration006 is authoritative. Feature repository owns ONLY
`src/repository.ts`, exported `dispatchQuicklinks(db,method,input)` synchronous,
under existing owner's immediate/result-checked transaction. Method union and
schemas are `QuicklinkStorageMethods`, `QUICKLINK_STORAGE_METHODS` and
quicklinkRepositoryContracts in contracts/quicklinks.ts. list returns summaries;
get returns record/null for exact ID/revision (changed revision conflicts);
save returns exact stored record; remove returns exact `{id,revision}` only after
one deletion. No second connection, startup, IPC, async transaction or native I/O.
Export `QuicklinkRepositoryError` with fixed `reason`:
`conflict | quicklink-name-conflict | quicklink-limit-reached` only, no private SQL,
name or URL. Do not persist normalized queries, visits, arguments or history.

QuicklinkApi's optional named methods: listQuicklinks(), getQuicklink({id,revision}),
saveQuicklink({id?,expectedRevision,name,url}), removeQuicklink({id,revision}),
openQuicklink({id,revision,launcherRevision}). Strict reply schemas are frozen.
Main validates current trusted frame/active state and acquires existing shared
effect/mutation slot. Read replies are fenced around writes. Main confirms Remove
through its existing native dialog using the fresh stored name, revalidates frame
after await, then conditionally removes; cancelled receipt means no deletion.
UI marks Remove destructive; main confirmation remains authoritative.
Open fresh-loads exact stored ID/revision, rechecks current launcher revision,
visibility and sender after awaits, and uses existing OpenURL/GIO only. Request
has no URL/argv/path/credential authority. Only matching `dispatched` ID/revision
receipt records aggregate `linuxcast:open-quicklinks` use; visits/URLs are not
logged or added to command usage. Native receipt does not prove browser success.
UI separately Hide only after exact receipt and unchanged context; Hide failure
retains truthful dispatched state. No replay or queuing on uncertainty.

UI exports `QuicklinksFlow` from src/presentation.ts with
constructor `{session,api,viewId,revision,state,onDismiss}`; `api:QuicklinkApi`,
`session:ViewSession`, `revision` is current root catalogue revision,
`onDismiss:()=>Promise<ShellCommandReply>`. Export `QuicklinksFlowState` with
`metadataUnconfirmed:boolean,openUnconfirmed:boolean`; coordinator retains the
same object across close/Hide/new Flow. Export createQuicklinksFlowState() for
false initial flags. Methods: active getter, owns(viewId), open(fromViewId),
handle(ActionIntent), close(viewId), dispose(). open pushes Listdepth2; create,
edit or optional Detail replace/push a single depth3 frame, never exceed3.
close is called after ViewSession has popped that view; abort presentation and
preserve drafts/selection only in still-open frames. dispose must not pop/root
reset a session it no longer owns. Back from editor uses existing dirty handling.
Root query/selection survive closing flow; nested keyboard Escape/Back stays
with shared host and held-Enter protections.

Primary List Open, secondary Edit/Remove; global New quicklink/Reload/Back even
when empty/no matches. Form name+URL, clear Save/Cancel, inline strict validation,
prefill and draft preservation on failures. Pending disables repeats, not recovery.
Install saved/removed state only after exact ID/version/name/canonical URL receipt;
refresh full summaries after mutation. Target past first100 must be found by local
refinement; no partial list silently replaces complete state.

Back/Hide/query/selection/dispose during pending mutation/open warns it may have
happened, discards late success/dismissal and sets persistent state flags. Unknown
save/delete blocks further mutations/open until explicit complete Reload; unknown
open blocks Open until check-browser/explicit Reload. Automatic reopen/load does
not clear uncertainty. Main keeps slots until actual backend settles; list/get
reject during mutation/effect so premature Reload cannot falsely confirm. No
optimistic row edits or automatic save/delete/open retries. Fixed errors omit data.

Required bounded evidence: real SQLite owner migration5→6/persistence, Unicode
name collisions, stale/missing revisions, capacity/update/delete, no-replay client
identity; main sender/hidden/fresh target/native confirm and unknown boundaries;
shared keyboard/axe/darklight/empty/loading/error/draft/pending states; actual
production root→create→search→Open→real URL marker, edit, confirm/cancel deletion,
Hide/restart/clear preserving definitions, aggregate export excluding URL. Broader
native/AT/session/release acceptance remains pending, never inferred from mocks.
