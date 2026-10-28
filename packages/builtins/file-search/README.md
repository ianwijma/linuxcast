# Selected-folder metadata search — bounded L2-02 UI

## Explicit readonly text preview (bounded L2-03/L2-02)

Results offer secondary **Preview text** for one selected indexed file. It pushes
an existing shared readonly Text view at depth 3; Details/Browse/Copy remain the
existing primary actions. Details explains how to return to Results for preview.
Only explicit selection/retry sends `{resultId,rootId,generation}` to optional
`previewText`; no path, URI, handler, options or content authority is submitted.
There is no read on typing, selection, Details, appearance changes or reopening.
Supported non-executable UTF-8 .txt/.text/.md/.csv/.json/.log files are bounded to
64 KiB; main/native owns actual source admission and read validation. All content
is literal text, including Markdown/HTML-looking input; no links/scripts/images
are parsed or fetched. Empty text is labelled as an empty file.

Strict reply schema, exact selection identity and original Results query,
selection/options/directory/root/path/index generation fence publication. The
five-second presentation deadline exposes fixed safe failure and manual Retry
without replay; Back remains reachable while loading. Reentrant Back/Close/query/
selection during pending publication dispatches no read. Navigation/source changes
or index removal clear the Text frame and retained content; disposal also removes
it. Escape/Back restores exact Results query/selection/focus. No preview content is
stored, indexed, cached, logged, added to history, copied or opened externally.

Author validation on Linux/headless Chromium with Node 24.22.1 / Bun 1.4.4:
120 focused units (91 File search controller including 36 new preview cases and 29
Copy regressions), 47 Chromium keyboard/axe cases (37 File search including 12 new
preview cases and 10 Copy regressions), full typecheck/scoped ESLint/plan/diff pass.
Checks use explicit `LINUXCAST_TEST_FILES` paths under the existing Vitest and
Playwright runner configs. Eight inspected affected captures in `evidence/`:
dark/light `text-preview-literal`; light `text-preview-empty`,
`text-preview-unavailable`, `text-preview-200-percent`; dark `text-preview-loading`,
`text-preview-error`, `text-preview-invalid`. Old incidental captures are preserved.
Applicable DESIGN sections: Shell/navigation, Results/actions, List/Grid/Detail/
Form, States/motion, Accessibility and Review gate; only shared primitives/tokens.
Independent SOL/high source/capture review found no actionable issue.

Fixtures supply labelled public synthetic text/metadata and observe requests;
they never read source files. Partial L2-03 AC01/AC02/UI/privacy and L2-02 AC02/UI
presentation evidence only. Coordinator owns native source preservation/security
and actual application integration. Native Open remains unavailable/unmerged;
this increment does not carry that code or substitute a pathname fallback.
Full content extraction/opt-in/MIME/recents, multi-file/buffer/open-with/reveal/
mutation/conflict/terminal/media previews/large text, prerequisites and Debian
GNOME/KDE Wayland/X11/native AT/session/package/performance/release gates remain
required. Neither task is complete from these component checks.


`FileSearch({api})` renders the dedicated window through the existing shared
`ViewSession`, `ViewRenderer` and `ThemeProvider`. The main/preload and resident
index service own native folder selection, jobs, SQLite and lifecycle. The UI
receives indexed display metadata and explicitly requested bounded literal text,
uses named `FileSearchApi` methods and never obtains arbitrary path, repository
or generic file-read/open authority.

The Folders overview shows actual root state, indexing/watching/paused activity
and available progress counts. **Choose folder** remains a global action and is
primary for an empty overview. It invokes the native chooser with no renderer
path argument. Cancellation preserves the overview. Selection reads authoritative
state and enters that folder's search view; selecting a folder is not evidence
of a ready index. **Index folder**, **Pause indexing** and **Remove folder** send
only the selected root ID and refresh state after acknowledgement. Removing a
folder affects derived index metadata; original files remain. A cancelled
removal is respected. There is no optimistic indexed/saved success toast.

Search folder enters a scoped **Search files** list. **Search all folders** uses
the same list with no root ID. Outside explicit folder browsing, an empty query
shows instructions rather than invented recent files. Queries debounce for 150 ms and are bounded to 512 UTF-8
bytes before reaching the local main/SQLite search API. No remote requests or
query logging are added. Replies must match the current query/scope/options/directory and contain
only current root generations; malformed, stale, hidden or disposed completions
cannot publish. A newer query cancels prior presentation work even though the
underlying API has no request-cancellation method.

Progress-only or unrelated-root events do not rerun a scoped search. Relevant
root generation/state/activity changes refresh the query. Invalidated generation
metadata disappears immediately, including an open Details view. Stable selected
IDs survive reordered results and are restored when a replacement generation
still contains the same result. Data-controls index clearing leaves roots paused
and clears derived rows without a UI-initiated restart. Saved-root startup pause
and resident jobs are service-owned; closing/disposal of this window does not
call Pause indexing or stop jobs.

The selected result's **Show details** action opens a read-only shared Detail.
Its Markdown is static; root name, relative and indexed absolute path, kind, byte
size and UTC modified time are plain metadata fields. Filenames cannot create links, markup or file
actions. Explicit Copy path is available through the bounded L2-03 integration;
opening, previews and other file actions remain unavailable.
Escape/back returns Detail → Results → Folders, preserving query, selected ID and
focus; Escape from Folders calls only the named close API. Failure restores a
usable root with an actionable error.

Pending mutations block repeated actions and refresh races. A lost, malformed or
unknown acknowledgement requires explicit **Refresh folders** before another
mutation; later state events do not clear that gate and no request is replayed.
Known denials show fixed safe remediation. Native chooser and removal confirmation have no
short presentation deadline because they wait for human input; disposal still
invalidates its reply. Other IPC presentation work has a five-second bound.
Validated equal-revision appearance changes update the scoped theme while
preserving cached root metadata.

Design references: DESIGN.md Shell and navigation; Results and actions; List,
grid, detail and form; States and motion; Accessibility; Review gate. All product
surfaces use existing host primitives, tokens, fonts and opaque themes. The
feature adds no CSS; `fixtures/preview.css` only lays out the labelled fixture.
Newly entered list views focus their query once, without focus changes on ordinary
snapshot revisions.

## Indexed folder navigation

Directory results make **Browse folder** primary, with Show details and Copy path
as separate actions. File results retain Show details as primary. Browsing uses
only current indexed metadata; it never opens, resolves, reads or grants access
to an original directory. A scoped Results list also offers **Browse root folder**
to query the selected root's top-level indexed children explicitly.

Browse replaces the current Results scope in place, clears its query and keeps
applied filters/sort. It sends the selected root ID and indexed relative directory;
an empty directory means that root's direct children. Empty queries send a search
only in this explicit browsing mode. Text searches within a browsed folder match
its direct children, with the same owner-side filters/order before the100-row
limit. The root/folder scope remains visible with empty-result remediation and
paused/unavailable/copy-warning status. Missing metadata does not prove that an
original directory is empty or exists.

**Parent folder** moves one indexed path component up, clears the query and keeps
options. It selects the directory just left if that row is returned. At the root
it is disabled. **Return to search scope** restores the root/all-folders scope,
query and selected ID captured by the first Browse. It keeps the currently
applied options; a missing or newly filtered-out ID uses the owner's first
remaining result, if any. An originally empty search returns to instructions without fake
recent files. Starting a new Results scope resets navigation; no history is
persisted.

Browsing adds no frames. Escape/Back still returns Form/Details → Results →
Folders; it does not act as Parent. Filter Apply/Reset retain the directory.
Every navigation fences prior query/copy presentation. Replies must echo the
exact directory, including the distinction between omitted and empty, and every
row must be an immediate child in the current root generation. Late same-query
responses from another folder cannot publish or carry copy success. Index clear
and root removal preserve the existing freshness/paused/error behavior.

## Metadata filters and deterministic sort

Results offers **Filter and sort**, a read-only shared Form. It is unavailable
from Details, so navigation stays Folders → Results → either Form or Details.
Four fields expose Sort (Relevance, Name A–Z, Newest first, Largest first), Kind
(Any, Files, Folders), and optional inclusive Modified from/through UTC dates.
Dates use the shared native date control with 0001-01-01 through 9999-12-31
bounds. Pure helpers separately reject impossible Gregorian dates, malformed or
extra values, and reversed ranges without locale parsing or normalization.
Years below100 are handled explicitly. Through dates become the next UTC day
exclusive; epoch zero is a valid bound. These are fixed UTC dates, with no local
timezone or daylight-saving adjustment.

Only **Apply filters and sort** changes applied options. Editing/opening/cancelling
the Form sends no search, clipboard or remote request. Cancel/Back uses shared
dirty-draft handling and preserves applied results, query and selection. Apply
snapshots the options, invalidates pending copy presentation with its existing
warning, fences prior search generations, pops the Form and immediately requeries
the same text/root. Reset filters and sort preserves query/root and sends the
default omitted-options request; it is disabled when already at defaults. Empty
queries remain instructional outside explicit directory browsing. New Results scopes reset these
ephemeral options; no filter/date/query history is persisted.

The API passes closed sort names, optional kind and inclusive/exclusive UTC bounds
to the sole owner. Filtering and deterministic ordering happen before its100-row
limit. The renderer never filters or sorts an already truncated result set; it
validates the canonical echoed options and every row's kind/date/root generation,
and displays the owner's order. Old same-query replies with different options
cannot publish. Stable selected IDs remain selected when present; only a missing
ID yields the owner's first row. Concise applied summaries are separate from
copy, error, paused and unavailable statuses. Index clearing/root changes still
invalidate metadata and leave worker startup under explicit user control.

The synthetic fixture applies matching/order to its complete public metadata
before its100-row bound and accurately echoes options. This is labelled component
evidence, not proof of actual SQLite behavior. Coordinator owner/integration
checks cover a larger matching dataset and the packaged application separately.

## Development evidence and limits

- `tests/controller.test.ts`: 55 focused checks for native-selection outcomes,
  request guards, authoritative state, query limits/generations, stable selection,
  readonly details, index clear, appearance, disposal and explicit recovery.
- `tests/options.test.ts`: 31 strict UTC/calendar/draft/summary checks, also passing
  under UTC and America/New_York host timezones.
- `tests/file-search.ui.test.ts`: 25 passing Chromium keyboard/axe checks for dark/light
  Folders, Results and Details, native chooser cancellation, empty/indexing,
  pending/unknown/unavailable/error states, index clear and cancelled removal.
- `evidence/`: 21 component screenshots from the explicitly labelled request-observing
  component fixture. Representative dark Folders/Details/unknown and light Results
  were visually inspected. Fixture paths/names are public generated metadata;
  no user files, content or credentials enter screenshots or diagnostics. New dark
  Form/range-error and light filtered-results screenshots were visually inspected.
  All four new dark/light indexed-folder/empty-folder screenshots were inspected.
- Verified development runtime: Node 24.22.1 and Bun 1.4.4. Typecheck and lint
  pass. Browser checks require a local fixture server and real Chromium processes.
  These are component checks, not native chooser/indexing or desktop proof.

All86 controller/options checks and25 File search browser checks pass, preserving
the prior44 controller/19 browser cases and adding directory navigation, exact
scope/stale replies, direct-child search/copy, Parent/Return, options/depth and
empty-folder coverage. Typecheck, scoped lint, plan and diff checks pass. The
fixtures are labelled request observers over public metadata; actual SQLite and
packaged native clipboard/navigation evidence remain coordinator-owned.

This increment contributes bounded UI/privacy evidence to L2-02; it does not
complete the task's content-extraction acceptance criteria. MIME filters,
recent files, opt-in content extractors and remaining file
actions remain required future work. The coordinator owns actual service/main/
preload integration and production Electron evidence. Debian GNOME/KDE Wayland/
X11, native assistive technology and the full release matrix remain pending.
The complete local 1.0 scope and outstanding prerequisite acceptance are unchanged.

## Integrated application evidence

The coordinator mapped L2-02 checks pass on Node24.22.1, Bun1.4.4,
Electron45.0.0, SQLite3.53.4 and Rust1.95: 41 unit checks (26 presentation,
15 service), 9 main/preload security checks, 2 contract checks, 12 Chromium
keyboard/axe checks and 3 real integration checks. Typecheck/lint/plan/diff pass.
The production Electron flow runs in a private Xvfb profile with generated
folders and actual packaged Rust openat2/inotify and sole-owner SQLite. It
verifies registered launcher opening, chooser cancellation/selection, explicit
Index folder, real filename results, arrow navigation/Details, hidden/symlink
exclusion, no content-token search, real rename watching, pause, workspace
close/reopen, full process restart paused, and proactive clearing of visible
results when a paused index is cleared through Local data. Removal cancellation
and confirmation preserve original files; Quit closes an active watcher.

Native chooser/confirmation choices alone are instrumented, including after
restart. These checks do not establish native dialog, compositor, assistive
technology or installed-package acceptance. The actual dark/light Details
screenshots in evidence/application-*.png were inspected. The existing actual
application/URL/alias/pin/data/restart regression also passes, alongside 108
launcher unit checks and 36 launcher main/preload security checks. The latest
application flow completed in4.89seconds and existing regression in6.93seconds;
these synthetic smoke durations are not a performance acceptance claim.

Independent GPT-6.1 SOL/high review covered service, UI, main/preload and lifecycle.
Resolved findings include stale-window Close, paused-index clear publication,
and native removal confirmation waiting longer than five seconds; two fake-time
regressions verify ten-second waits followed by cancellation or confirmation.
Unknown backend mutations still require explicit Refresh; no automatic replay.

## Selected-result Copy path integration (L2-03)

The Results list has Copy path after Show details; Details makes Copy path
primary. Both use the shared `IndexedPathCopy` presentation from universal-actions,
with exact current view/selection/root/generation checks and a main-derived
indexed path receipt. Rendering, query/selection and Details opening never copy.
The strict named API submits result identity only. Missing clipboard access is
visible and actionable. Pending navigation/selection changes warn that copying
may have occurred; late replies cannot show success for a different result.
Main's metadata identity confers no file-open/read authority. Copying uses the
index location without asserting that the source exists. Actual copy/restart/
clear evidence and full remaining scope are in ../universal-actions/README.md.
The full L2-02 content/MIME/recent-file acceptance remains
unfinished alongside broader native/AT/package/release prerequisites.

## Integrated owner and application evidence (26 October 2026)

Coordinator integration `2b34229` applies fixed SQL ordering and bound kind/date
constraints before LIMIT100 in the sole SQLite owner. Name uses deterministic
SQLite NOCASE (ASCII folding), then raw name/path/root ties; it does not claim
locale-aware collation. A130-row synthetic metadata fixture checks pre-limit
ordering/filtering, root/current generation scope, epoch0/negative bounds and
closed-option rejection. Main/preload reject options/row mismatch and fence stale
same-query pages before Copy path admission.

PASS:99mapped units,4contracts,20security,7integration;17shared Form/session units
and39affected Chromium keyboard/axe checks. Full typecheck and lint pass.
The actual production Electron45/private-Xvfb flow (8.56s smoke, not a performance
gate) exercises invalid/corrected UTC dates across live appearance changes,
actual kind/date/newest results, explicit native Copy path, directory filtering,
Reset preserving query and existing watch/clear/removal/restart safety. Only
native chooser/confirmation choices are instrumented. Four inspected application
Form/results dark/light captures are `evidence/application-*-filter*.png`.

The shared host preserves extension empty-result instructions and corrected
validation across unrelated appearance/status revisions. New host values/errors
still block submission; secure picker/credential/current-view guards remain.
Independent GPT-6.1 SOL/high final source review is clean. All content/MIME/path
navigation/recent-file, native/session/AT, dependency and release gaps above
remain required; no complete L2-02 claim is made.

## Integrated directory application evidence

Coordinator `ba092e3` verifies production Electron navigation over actual Rust/SQLite
indexed public sources: direct children, child search/native Copy path, nested and
empty folders, Parent/root/Return and original query restoration. Existing watch,
pause/restart, clear and original-preserving removal still pass. Only native
chooser/confirmation choices are instrumented. Two inspected application dark/light
captures are `evidence/application-*-directory.png`; axe passes.

Integrated PASS:117units/5contracts/22security/8integration/35browser, fulltypecheck/lint.
The11.48s private-Xvfb smoke is not performance or native desktop/AT/release evidence.
Independent SOLhigh review clean. Full MIME/recents/extractor and release gaps remain.
