# Selected-folder metadata search — bounded L2-02 UI

`FileSearch({api})` renders the dedicated window through the existing shared
`ViewSession`, `ViewRenderer` and `ThemeProvider`. The main/preload and resident
index service own native folder selection, jobs, SQLite and lifecycle. The UI
receives display metadata, uses named `FileSearchApi` methods and never obtains
file-read, file-open, arbitrary path or repository authority.

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
the same list with no root ID. An empty query shows instructions rather than
invented recent files. Queries debounce for 150 ms and are bounded to 512 UTF-8
bytes before reaching the local main/SQLite search API. No remote requests or
query logging are added. Replies must match the current query/scope/options and contain
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
queries remain instructional and send no search. New Results scopes reset these
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

- `tests/controller.test.ts`: 44 focused checks for native-selection outcomes,
  request guards, authoritative state, query limits/generations, stable selection,
  readonly details, index clear, appearance, disposal and explicit recovery.
- `tests/options.test.ts`: 31 strict UTC/calendar/draft/summary checks, also passing
  under UTC and America/New_York host timezones.
- `tests/file-search.ui.test.ts`: 19 passing Chromium keyboard/axe checks for dark/light
  Folders, Results and Details, native chooser cancellation, empty/indexing,
  pending/unknown/unavailable/error states, index clear and cancelled removal.
- `evidence/`: 17 component screenshots from the explicitly labelled request-observing
  component fixture. Representative dark Folders/Details/unknown and light Results
  were visually inspected. Fixture paths/names are public generated metadata;
  no user files, content or credentials enter screenshots or diagnostics. New dark
  Form/range-error and light filtered-results screenshots were visually inspected.
- Verified development runtime: Node 24.22.1 and Bun 1.4.4. Typecheck and lint
  pass. Browser checks require a local fixture server and real Chromium processes.
  These are component checks, not native chooser/indexing or desktop proof.

After coordinator shared-renderer fix `d04566f`, all19 File search browser cases
and10 Copy path browser regressions pass. Nonempty extension queries now preserve
the supplied empty-result description, including the applied filter/sort summary.
The retained regression verifies the summary after index clear and unsent-Form
cancellation, alongside paused-state remediation. All75 controller/options checks,
typecheck, scoped lint, plan and diff checks also pass. These remain component
checks; actual SQLite ordering/filtering and native clipboard evidence belong to
the coordinator's integration checks.

This increment contributes bounded UI/privacy evidence to L2-02; it does not
complete the task's content-extraction acceptance criteria. MIME filters,
path navigation, recent files, opt-in content extractors and remaining file
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
The full L2-02 content/MIME/path-navigation/recent-file acceptance remains
unfinished alongside broader native/AT/package/release prerequisites.
