# U1-01 Markdown import application increment

Base: merged PR76/develop09de566. Full task docs/implementation/tasks/U1-01.md,
PLAN, normative architecture/data.md, product/builtins.md, architecture/security.md,
implementation/testing-release.md, DESIGN Chat and notes/Forms/States/Accessibility/
Review gate and tokens.json remain binding. F2-01 accepted; D1/native acceptance
remain partial under user-approved smaller unfinished increments. No scope waiver.

Bounded flow: actual registered Notes command -> existing workspace -> explicit
Import Markdown -> native one-file chooser -> bounded read/parse -> readonly title/
body/task review -> Cancel (no source changes or note writes) OR separate Create
imported note -> existing normal notes.write new UUID/expectedRevision0/action draft
-> exact confirmed owner record -> normal edit/Save/export/root search/restart.
No overwrite of selected/outgoing note; preserve its exact saved/draft/flags.

Frozen optional NotesApi.chooseMarkdownImport():Promise<NoteImportReply>.
Named channel notes:choose-markdown-import accepts only {protocolVersion:1};
success is {ok:true,value:{outcome:'cancelled'}} OR
{ok:true,value:{outcome:'ready',content:NoteContent}}. Errors use existing RpcFailure.
No renderer path, Markdown/HTML, source deletion, generic filesystem, permission,
provider/network or new persistence/migration service. Preview is untrusted data,
strictly schema-checked at all boundaries. Main chooses/reads/parses only a selected
regular local file; source path never goes to renderer/log/usage. No automatic URL,
image, attachment or other resource loading; no imported instructions/permissions.

Coordinator owns shared contracts/index/NotesApi, main file-read/import IPC/wiring,
preload, application integration test/evidence, suite map, registry/cards/checkpoint.
UI agent owns only packages/notes/src/{controller.ts,index.tsx,markdown.ts}, new
Markdown import tests/fixture/evidence and narrowly needed shared-notes CSS (request
if needed). No shared manifests/lockfiles or existing unrelated test/capture edits.
No infrastructure/proof/research assignment. Reuse pinned Tiptap Markdown3.32.0
public manager.instance lexer plus parse and closed schema; no new dependency or
private API. Export behavior/12existingroundtrip fixtures remain unchanged.

Parser export importNoteMarkdown(text:string):NoteContent. Byte cap existing
NOTE_MARKDOWN_MAX_BYTES512KiB; no blank/invalid/over-limit/unsupported silent loss.
First H1 supplies title, otherwise 'Imported note' with all body preserved. Preserve
Unicode, literal escaped Markdown/HTML, normalized LF, nested checked/unchecked
tasks and supported text. Remove only the exact Linuxcast export notice at start;
other raw HTML/images/links/tables/unsupported headings/features must be refused
with actionable explanation rather than silently discarded or fetched. Known
editor fonts/colours/layout/undo metadata unsupported and disclosed before Create.
Use maintained lexer to identify syntax, closed output schema/node/depth/64KiB
limits and bounded input. Imported rich text is readonly existing RichNoteEditor,
never innerHTML/iframe. Evidence must test actual export->import text/tasks,
including adversarial literal escaping/code, not only a synthetic happy fixture.

Import starts only idle/synced (dirty/pending/uncertain/metadata/review/close/export
blocked). Reserve controller intent synchronously before awaits/reentrant listeners;
freeze edits/navigation/filter/Save/export/metadata/Quick/selected-open/Close through
chooser+review+creation. Native chooser can wait for user; actual read is bounded,
actual main slot lives until settlement, frame/generation checked after awaits.
Cancel/Escape has no writes and preserves current selection/content/focus.
Separate Create mints one new stable UUID and uses existing normal write/recovery;
never replay on timeout/late/contradictory result. Retain imported text/identity for
manual existing Reload recovery after an uncertain create; no false success.
Repeated/reentrant/held operation must not create duplicates. No retry with a fresh
UUID after uncertain storage. Close/Quit cannot silently lose review/unknown state.

Required evidence: parser text/tasks/roundtrip/HTML/URL/malformed/limits; controller
Cancel/no outgoing flush, review+creation reservation, exact receipt/unknown/no replay,
blocked competing operations, meaningful focus; real Tiptap browser keyboard/axe and
dark/light review/result, pending/error/unavailable/200%; actual sandboxed Electron
private selected-file+sole-owner root Notes/import/Cancel/Create/Save/export/search/
restart with exact unrelated preservation. Native chooser instrumentation labelled;
private Xvfb is not Debian supported-session/nativeAT acceptance. Historical captures
must remain byte-identical; new captures only. Report initial failures honestly.
Map partial U1-01-AC01/AC02/UI/PRIVACY without marking whole task done. Attachments,
full native import chooser/session/AT/performance/package/release remain required.
