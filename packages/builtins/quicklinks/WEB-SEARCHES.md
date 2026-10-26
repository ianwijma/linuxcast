# Saved web searches — bounded L2-05 application increment

Implementation interface, not acceptance evidence. Build on merged PR40. Keep
all full 1.0/task requirements; this slice adds a single named query argument
through an explicit typed URL query-component builder. Other named arguments,
context capture/providers, transforms, snippets/cursor, browser/open-with, other
targets, tags/pin/hide/export remain required and explicitly unavailable here.

## Frozen definition and wire extension

Existing literal records/requests remain unchanged. Optional `webSearch` on
QuicklinkSave/Record is strict `{queryParameter,template:'{{vars.query}}'}`.
Parameter: 1..64 ASCII characters, starts with a letter, then letters/digits/
underscore/dot/hyphen. Base `url` remains the existing literal, credential-free
canonical HTTP/HTTPS URL; never store a raw URL containing placeholder syntax.
Summary has only optional `webSearch:true`, not the configuration. Save absence
means literal and removes previous configuration. Owner persists only the
validated definition JSON in migration007 `web_search` (NULL for literal).
Preserve name uniqueness, UUID, creation time, CAS revision and 500-entry limit.

Open still accepts ID/revision/launcherRevision only for literal links. Search
Open additionally requires `query`: nonblank string <=2048 UTF-8 bytes and
UTF-16 units, no controls/lone surrogates; preserve intentional leading/trailing
spaces, case and Unicode. No URL/argv/template/config authority in Open. Main
fresh-loads the exact definition, rejects query for literal or missing query for
search, builds the URL itself and checks sender/visibility after awaited work.
Only explicit Open dispatches. Search success adds strict transient
`value.webSearch:{query,url}` to the ordinary dispatched ID/revision receipt.
Literal success has no webSearch receipt. Preload checks matching query echo
and presence/absence; UI also checks exact preview URL. Never persist query,
expanded target, preview or visit history; usage is the existing aggregate only.

## Pure domain exports (author-owned)

`@linuxcast/templates` exports:

```ts
type TemplateToken =
  | {kind:'literal';value:string}
  | {kind:'binding';namespace:string;path:readonly string[]};
type TemplateSnapshot = Readonly<Record<string, unknown>>;
class TemplateError extends Error {
  readonly code: 'TEMPLATE_SYNTAX'|'TEMPLATE_LIMIT'|'BINDING_NOT_FOUND'|'BINDING_TYPE';
}
function parseTemplate(template:string):readonly TemplateToken[];
function renderTemplate(template:string,snapshot:TemplateSnapshot):string;
```

Implement existing workflow grammar left-to-right: `{{{{` emits literal `{{`,
`}}}}` emits literal `}}`; paired unmatched delimiters fail; single braces are
literal. Bindings are dotted ASCII identifiers, namespace then >=1 path segment.
Namespace allowlist: input/vars/settings/context/item/error. Each segment starts
with letter/underscore then letters/digits/underscore, <=64 characters; path
depth<=8. Reject __proto__/prototype/constructor, expressions, arbitrary calls,
whitespace and implicit namespace lookup. Template <=8192 UTF-8 bytes, <=256
bindings, output <=8192 UTF-8 bytes. Preserve multiline Unicode; reject lone
surrogates. Resolve only own data-property descriptors on plain/null-prototype
objects; never invoke getters or follow inherited/prototype-bearing objects.
Missing/undefined -> BINDING_NOT_FOUND. Only string, finite number, boolean and
null interpolate (null -> 'null'); object/array/function/secret handle ->
BINDING_TYPE. Render captured values once, never recursively parse inserted
braces or fetch dynamic context. No clocks/network/clipboard/provider access.
Errors have fixed safe messages without input/binding/private value text.

`@linuxcast/quicklinks/web-search` exports:

```ts
class WebSearchBuildError extends Error {
  readonly reason:'invalid-definition'|'invalid-query'|'result-too-large';
}
function buildWebSearchUrl(baseUrl:string,config:QuicklinkWebSearch,query:string):string;
```

Validate definition/query with shared schemas. Render the fixed template from a
fresh readonly `{vars:{query}}` snapshot using the shared parser. Construct URL
with WHATWG URL/URLSearchParams.set(config.queryParameter, rendered). Only the
configured parameter is replaced (including duplicates); other decoded query
entries keep their values/order. Scheme/authority/path/fragment cannot change.
Final target must pass quicklinkUrlSchema and <=8192 bytes. Return canonical URL;
no I/O or request/visit storage. Query braces are literal data, never rescanned.

Repository author extends existing repository/tests with optional configuration,
strict summary marker, exact revision and corruption/rollback coverage. No
second connection/async transaction/migration/manifests/lock changes.

## Existing shared UI flow (author-owned)

Extend QuicklinksFlow, keeping its public interface/root routing and persistent
metadata/open uncertainty state. New/Edit shows Name, URL, Type (literal link or
web search), Query parameter. Literal ignores blank parameter; a populated
parameter in literal mode must not silently activate a search. Search saves the
fixed template/config only; unsupported raw placeholders still fail explicitly.
Use all submitted fields in validation and retain drafts on failure/reload.
List labels web searches and keeps complete 500-summary/local100-result bounds.

Primary Open on a search fresh-gets the exact record/config and opens a Query
Form at depth3, no browser call. Review search validates input and computes the
target locally. Replace the same view ID via a higher-revision snapshot with a
Detail containing Query and Target URL as plain metadata, explicit Open search,
Edit query and Cancel. Never render a navigable target link. Edit query restores
the draft Form in that same depth3 frame; no fourth frame or new window. Submit
clears shared dirty state; main input/article focus follows view-kind changes.
Coordinator owns the required shared renderer focus adjustment.

Open search sends captured query only after explicit approval of this preview.
Verify ID/revision/query/canonical URL receipt exactly, then separately Hide
only in unchanged context. Query/selection/Back/Hide/dispose invalidate late
work; persistent unknown Open gates remain across automatic reopen until an
explicit complete Reload. After an uncertain search, show check-browser +
Reload remediation in the query/preview too. Do not retain query after closing
the flow or restart. Keep Remove/native confirmation and literal regressions.

## Evidence required for this increment

Parser delimiter/escaping/scalar/missing/prototype/no-recursion/limit tests;
builder adversarial query/Unicode/braces/duplicate parameters/structure bounds;
actual schema6->7 snapshot/persistence plus literal6upgrade/regressions; owner/
client/preload full config and query receipt identity; main fresh definition,
sender/visibility/known-vs-unknown/no-replay; real shared keyboard/axe/dark/light
Type/argument/preview/invalid/loading/unknown states. Actual production create
search->Query->Review (no marker)->Open->real GIO exact argv/empty stdin, edit,
Hide/restart, usage clear and final owner/export excluding the argument. Keep
GNOME/KDE Wayland/X11/native AT/package/release acceptance pending explicitly.
