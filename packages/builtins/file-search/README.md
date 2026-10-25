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
query logging are added. Replies must match the current query/scope and contain
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
Its Markdown is static; root name, relative path, kind, byte size and UTC modified
time are plain metadata fields. Filenames cannot create links, markup or file
actions. Opening, previews and other file actions are explicitly unavailable.
Escape/back returns Detail → Results → Folders, preserving query, selected ID and
focus; Escape from Folders calls only the named close API. Failure restores a
usable root with an actionable error.

Pending mutations block repeated actions and refresh races. A lost, malformed or
unknown acknowledgement requires explicit **Refresh folders** before another
mutation; later state events do not clear that gate and no request is replayed.
Known denials show fixed safe remediation. Native chooser interaction has no
short presentation deadline because it waits for human input; disposal still
invalidates its reply. Other IPC presentation work has a five-second bound.
Validated equal-revision appearance changes update the scoped theme while
preserving cached root metadata.

Design references: DESIGN.md Shell and navigation; Results and actions; List,
grid, detail and form; States and motion; Accessibility; Review gate. All product
surfaces use existing host primitives, tokens, fonts and opaque themes. The
feature adds no CSS; `fixtures/preview.css` only lays out the labelled fixture.
Newly entered list views focus their query once, without focus changes on ordinary
snapshot revisions.

## Development evidence and limits

- `tests/controller.test.ts`: 24 focused checks for native-selection outcomes,
  request guards, authoritative state, query limits/generations, stable selection,
  readonly details, index clear, appearance, disposal and explicit recovery.
- `tests/file-search.ui.test.ts`: 12 Chromium keyboard/axe checks for dark/light
  Folders, Results and Details, native chooser cancellation, empty/indexing,
  pending/unknown/unavailable/error states, index clear and cancelled removal.
- `evidence/`: 11 screenshots from the explicitly labelled request-observing
  component fixture. Representative dark Folders/Details/unknown and light Results
  were visually inspected. Fixture paths/names are public generated metadata;
  no user files, content or credentials enter screenshots or diagnostics.
- Verified development runtime: Node 24.22.1 and Bun 1.4.4. Typecheck and lint
  pass. Browser checks require a local fixture server and real Chromium processes.
  These are component checks, not native chooser/indexing or desktop proof.

This increment contributes bounded UI/privacy evidence to L2-02; it does not
complete the task's content-extraction acceptance criteria. MIME/date filters,
full sorting/path navigation, recent files, opt-in content extractors and file
actions remain required future work. The coordinator owns actual service/main/
preload integration and production Electron evidence. Debian GNOME/KDE Wayland/
X11, native assistive technology and the full release matrix remain pending.
The complete local 1.0 scope and outstanding prerequisite acceptance are unchanged.
