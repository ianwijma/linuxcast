# L2-05: explicit URL path argument

Bounded application increment after merged PR48/64e9fda. Existing root search,
Quicklinks List/Form/argument→Review→Open, sole owner and GIO browser backend.
No new process/dependency/service/research/proof lane. Full1.0 scope unchanged.

## Frozen public contract

QuicklinkSave/Record/SaveRequest gain optional pathArgument config exactly
`{component:'path-segment',template:'{{vars.query}}'}`. It is mutually exclusive
with webSearch. Summary has only optional `pathArgument:true`, mutually exclusive
with `webSearch:true`. Existing literal and named-query config keep their shape.
No new IPC/API method. Open uses existing `{id,revision,launcherRevision,query}`;
success has exact same ID/revision/outcome plus pathArgument:{query,url}, never
webSearch for path links. Literal/search/path receipt kinds must match exactly.
Export includes saved config only; no transient argument/expanded URL/history.

`buildPathArgumentUrl` is exported by @linuxcast/quicklinks/path-argument.
It canonicalizes literal credential-free HTTP(S) base then appends one complete
encoded segment to its pathname (one separator unless base already ends slash).
Origin, base path, query and fragment stay unchanged; /, backslash, percent,
query/fragment markers, shell/template-like text and Unicode remain argument data.
Values use existing bounded webSearchQuerySchema:2048 UTF8 bytes/UTF16 units,
nonblank, no raw controls/lone surrogates, whitespace preserved. Standalone . and
.. are explicitly invalid because browser path normalization would remove them.
Percent-looking input is encoded literally, not decoded. No NFKC/trim of values,
raw interpolation, recursive rendering, context acquisition or hidden network.
Final canonical URL is limited to8192bytes. Error class PathArgumentBuildError
uses fixed reasons invalid-definition/invalid-query/result-too-large.

## Existing UI only

New/Edit Type adds Path argument link (`path`). The existing Query parameter
field is for Web search only and must be blank for literal/path. Preserve
existing5field Form shape and tags/prefs/config CAS. Explain that URL is a base
and one encoded argument is appended. Save supplies pathArgument fixed config,
no webSearch; conversion removes old kind explicitly. List accessory Path argument,
primary read action Enter argument; shown selected row opens an empty Path argument
Form→Review link with plain argument and exact target→explicit Open link. Reuse
existing search-frame state/focus/IME/heldEnter/Cancel/Edit argument/Reload fences.
Keep field IDquery and action IDs if useful; user-facing labels must describe
path argument rather than web search. No argument is taken from root/local query.

Fresh full record checks include path config and summary marker. Every Save,
pin/hide/export/edit preserves current kind, tags and other preference fields.
Metadata/read/native uncertainty, original-context/read-publication/reentrant
fences and explicit Reload remain. No browser/copy/Hide/navigation on save/query/
review/export; hidden path links cannot Open. No success until exact typed receipt.
Old literal/web searches remain fully usable; UI mocks are development only.

## Ownership and evidence

manifest_review_sol owns only quicklinks presentation.ts, fixtures, relevant
presentation/keyboard tests/README/evidence. Root owns contracts, pure builder/
builder tests/package export, migration012/repository/client/main/preload/native
routing, root registry metadata, actual app tests, manifests/locks and task status.
Request shared changes; no overlapping edits or infrastructure/research/proof.

Read docs/PLAN.md, card docs/implementation/tasks/L2-05.md, its normative
architecture/workflows.md/security.md/product/builtins.md/testing-release.md and
DESIGN.md/tokens.json. Existing integrated interfaces support development under
user-authorized unfinished increments; full dependency/native acceptance unwaived.

Meaningful evidence: New/Edit/convert literal↔query↔path, exact CAS/marker/config
receipts, empty explicit argument→preview→deliberate native Open, Unicode and
metachar/dot rejection, query/fragment/authority isolation, unknown/mismatch/
stale/delayed/hidden/original-context recovery and preserved prefs/tags/export,
root ID entry, keyboard/composition/heldEnter/200% and affected dark/light/axe.
Coordinator proves real11→12 snapshot/reopen, actual native browser argv and
export/persistence/privacy; mocks cannot establish that. Report partial AC01/UI/
privacy and all remaining full-task/context/other targets/nativeAT/release gates.
