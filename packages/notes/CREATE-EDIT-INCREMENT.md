# Notes create/edit/autosave application increment — U1-01

Coordinator freeze29October2026 fromPR56/developdc4f47e. Task card
docs/implementation/tasks/U1-01.md. Required Tiptap3 OSS, no plaintext substitute.
F2-01 accepted; reviewed D1 sharedprimitives/styles reused under authorized small
unfinishedincrement sequencing. Full D1/nativeAT and all1.0 scope still required.

## Scope and editor

Registered Notes command opens sandboxedresident workspace. Local searchable
notes list (title+body,100/page with explicitLoadmore), Newnote, select/edit title
and Tiptaprichbody,500ms debouncedtransactionaldraft, separateSave (CtrlS),
restartrecoverlatestdraftandlastsaved separately. Use required Tiptap3.32.0 MIT
OSS @tiptap/{core,react,pm,starter-kit,extension-task-list,extension-task-item}.
StarterKit configured headings1/2/3, link:false, underline:false; injectCSS:false
for strictCSP. Allow paragraphs/headings/bold/italic/strike/code/blockquote/
bullet/ordered/tasklists/hardbreak/codeblock/horizontalrule. Closed NotesDocument
version1 schema in contracts is authoritative, <=64KiBtext/256KiBJSON,4096nodes,
16depth. Attachments/images/URLs/customHTML/arbitraryattrs unsupported.
Paste/drop plain text only, bounded, visibly explained; no HTMLparser, media
upload/autoload, linknavigation/network/customplugin execution. Clipboard paste
inserts content but never executes commands. PreserveUnicode/IME/caret/undo.

Accessible formattingtoolbar, taskcheckboxes and actual slash menu (/, keyboard
navigation/selection/Escape; no new suggestiondependency). Use sharedButton/
TextField/theme/tokens/semanticstyles, calmeditor/layout per DESIGN Chat-and-notes.
Feature layout/prosemirror styles allowed only semantic token values. No separate
visualsystem. No need to implement pin/archive/trash/export/revisionsRestore now;
show accurateincrementlimitations, neverbuttonsclaimingunimplemented effects.
Those and rootNotesprovider/Quicknote/Markdownroundtrip remain required next.

## Frozen named API

packages/contracts/src/notes.ts exports NotesApi/NoteRecord/NoteWrite/NoteContent/
NoteDocument/noteDocumentSchema/notePlainText/emptyNoteDocument and strictschemas. noteContentKey(content) provides stable exactcontent comparison independent of objectkey order; use it for receipts/dirty tracking.
list({query,cursor?}) -> {ok:true,value:{query,records:NoteSummary[],nextCursor}};
get(id) -> nullableRecord; write({id,expectedRevision,action:'draft'|'save',content})
-> exactNoteRecord, all replysafeRPCfailureotherwise. Appearanceevents, close()/
onCloseRequested(listenerasyncbool) use same reviewedworkspaceclose pattern.
No genericIPC/SQL/filepaths/secret/network API. Main-onlyrepository exposes
notes.list/get/write. Main-onlynative close waits for currentUIflush; ifunknown/
failed, keepwindowopen and offer Keepediting/Retry/explicitclosewithoutlatest
changes. Earlierpendingwrites mayalreadybestored; closingneverundoes them.

Record: {id UUID,documentVersion:1,revision>=1,draft:{title,document},saved:null|
{title,document},createdAt,updatedAt}. Newnote generateswebcrypto.randomUUID(),
first expectedRevision0 draft write of titleUntitlednote and emptydocument.
OwnerCAS, revision+1, exacttitle/doc receipt; savedchanges ONLY explicitSave,
notdraftautosave. Search/list uses lateststored draft projection. Savednull or
draft!=saved yields hasDraft. Newnotesearchprojection derivesinowner, neverclient.
All localcontent remainsordinaryprivateSQLite, not encrypted atrest/noAI.

UI serializes writes, snapshotcontent beforeAPI, retains edits typed duringwrite,
no olderreceipt overwritesnewerediting. Validate exactid/revision/action/content
and read/list identity/query/cursor before publishing. Debounce latestdraft500ms,
flush onSave/navigation/close. Knownnotacceptederror remainseditable with explicit
retry; conflict/internal/unknown/timeout/mismatch blockwrites until explicit
reconcileReload confirmation (retainlocalcontent for copying/review, never silently
discard newerlocaledits). No replay of uncertainSave/draft or duplicateNew notes.
Busy/state/publication reentry/lateowner/dispose/IME/heldkey guards mandatory.
No persistentlocalStorage/disk/rendererhistory. Successfuldraftmessages calm;
visibleerror/recovery onfailure; explain recovereddraft separately fromsaved.

## Ownership and evidence

manifest_review_sol isolated .worktrees/linuxcast-l1-01 NEWcodex/notes-create-edit-ui
from signedfreeze. Own ONLY packages/notes/src and packages/notes/{tests,fixtures,
evidence,README.md}, optional apps/desktop/src/features/notes/presentation only.
Do not edit sharedcontracts/manifests/lock/migrations/main/preload/routing/registry.
Coordinator owns backend/persistence/schema014/main/preload/assets/registration,
actualproduction/ownercrash/restart/sourceprivacy checks and taskstatus.
Read completecard and normative data/builtins/testing/design/security/tokens;
F2-01 completion and sharedUI evidence are dependencies, not proof fullU1accepted.

UIunit/browserkeyboard+axe and affectedpublic dark/light/loading/empty/error/
conflict/IME/recovery/slash/task/200% captures, inspectactualscreenshots.
Use realTiptap infixtures, labelledmockpersistence (no claimnative/SQLite).
Report partialAC01/UI/privacy with exactsignedcommit/checks/limits promptly.
AC02Markdownroundtrip/fulltask/nativeDebianGNOME/KDEWayland/X11/AT/release remain
pending; no dependency/scope weakening. No infrastructure/research/proofexpansion.

Primary API references: https://tiptap.dev/docs/editor/getting-started/install/react , https://tiptap.dev/docs/editor/extensions/functionality/starterkit , https://tiptap.dev/docs/editor/api/editor . Installed MIT packages pinned3.32.0; inspect bundled types/source if API details differ.
