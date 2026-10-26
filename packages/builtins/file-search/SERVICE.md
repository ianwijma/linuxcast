# Selected-folder metadata service (bounded L2-02 increment)

`@linuxcast/file-search/service` exports `createFileSearchService(options)`,
`FileSearchService`, `FileSearchServiceOptions`, and `FileSearchUnavailable`.
Trusted main supplies the sole-owner `IndexStorage`, the existing
`DataControls.registerIndexJob`, and the fixed absolute packaged native executable.
Main gates calls on storage readiness. No repository, executable, or folder-path
argument is exposed to renderers. `addFolder(path)` accepts native-picker output
only and canonicalizes/stat-checks the directory; existing IDs are reused.

The service implements `getState()`, `addFolder(path)`, `startIndex(rootId)`,
`pauseIndex(rootId)`, `removeFolder(rootId)`, `search({query, rootId?, options?})`,
`subscribe(listener)`, `stop()`, and `terminate()`. State omits appearance, which
main adds. Failure reasons are fixed `invalid-request`, `root-unavailable`,
`storage-unavailable`, `index-unavailable`, `busy`, or `stopped`; raw owner, native,
and filesystem exceptions never become service diagnostics.

Selection and mutation admission are serialized. The service caps selected roots
at 100 and active root jobs/watchers at eight. Each job is registered before
`RootIndexer.create` or reconciliation. `startIndex` resolves after admission,
with progress delivered through state notifications; it does not wait for a full
scan. Duplicate starts reuse the current job. Data Controls clear waits for
startup and native shutdown, prevents new job admission while clearing, and leaves
stopped roots paused. Shutdown is idempotent and awaits owned jobs. A rejected stop
retains ownership, registration, and an unavailable state: removal, restart, and
shutdown cannot falsely report successful native closure.

Saved roots start paused after every process restart. Explicit **Index folder**
resumes a scan, then the native inotify/recovery watcher. Paused generations can
still be searched, and the UI must describe them as potentially outdated.
Unavailable native/watcher jobs stop instead of automatically resuming. This
increment has no automatic collection startup or persistence of a running toggle.

Search admits at most two concurrent operations, returns at most 100 results,
and accepts at most 512 UTF-8 query bytes. Main's repository adapter must set a
1,000 ms request deadline. The service also bounds search response time to
1,000 ms and retains a timed-out operation's concurrency slot until it settles.
It validates current selected roots on both sides of the owner search, rejects
changed generations/selections and duplicate/forged candidate identities, and
returns display metadata only. Result IDs and relative paths are never file-open
or file-read authority. State reads retry when newer job updates arrive during
owner reads instead of publishing old owner state under a newer revision.

Optional search options use the shared strict schema: required `sort` is one of
`relevance`, `name`, `modified-desc`, or `size-desc`; optional `kind` is `file` or
`directory`. Optional modified-time bounds are safe integer UTC epoch milliseconds:
`modifiedFromMs` is inclusive, `modifiedBeforeMs` is exclusive, and a supplied pair
must have `from < before`. Epoch zero and negative instants remain valid. Unknown
request/option keys, invalid bounds, and unsupported values fail as fixed
`invalid-request` errors before storage admission.

The service parses and deep-snapshots the complete request before its first await.
It forwards every provided option to the sole-owner `files.search` request with
`limit: 100` and echoes that same validated snapshot, including for empty-query
replies. Omitted options stay omitted from requests and replies; the existing
query/root/result shape is preserved. Caller edits cannot replace an admitted
request's query, root, or nested options. Default relevance is owner policy, not a
new field silently injected into an absent-options reply.

The owner must apply filtering and fixed sorting before limiting the search to
100 rows. This service never filters or sorts an already limited page and always
preserves owner result order. It validates each candidate against the requested
kind and modified-time bounds in addition to the existing selected-root,
generation, identity, and metadata checks. Any mismatching or malformed row
rejects the entire reply as fixed `storage-unavailable`; it is never silently
removed to manufacture a successful filtered result. Options remain metadata
queries, confer no filesystem authority, and add no source-file reads.

Remove waits for job shutdown, removes the selected-root record through the owner,
and prunes derived metadata in batches of at most 512, yielding between batches
and capping the operation at 10,000 batches. It never deletes, modifies, or reads
source-file content. A failed prune reports an unavailable operation; root removal
may already have taken effect. This is not a promise of an atomic filesystem view.

## Evidence and limits

On the Linux amd64 development host, Node 24.22.1, Bun 1.4.4, Rust 1.95.0,
and SQLite 3.53.4:

- `tests/service.test.ts`: 24 controlled tests include the 15 existing admission,
  lifecycle, and validation cases. They cover duplicate starts,
  startup/clear/stop races, failed closure, watcher failure, result identity and
  generation checks, state publication races, bounds, owner failure, and pruning.
  Nine new cases cover all sort forwarding/echo variants, snapshot mutation races,
  invalid/extra options, complete-page rejection for wrong kind/time ranges,
  inclusive/exclusive/zero/negative time boundaries, unchanged absent-options
  behavior, and preservation of owner order. Controlled owner responses establish
  service validation, not SQL filtering/sorting acceptance.
- `tests/service.integration.test.ts`: two tests use the actual sole-owner utility
  process and Rust `linux-openat2-inotify` helper with small private synthetic
  folders. They exercise scan, denied/hidden files, rename/size update, pause,
  reopen, explicit resume, clear, derived-data removal with originals preserved,
  unavailable helper startup, and explicit retry. The sandbox blocks the existing
  owner's abstract Unix lock socket; running this fixture requires that local
  socket permission. No personal folders or content appear in test output.

This slice provides partial L2-02 implementation-step evidence for fixed metadata
filter/sort option handling and preserves synthetic-fixture privacy boundaries.
Coordinator-owned SQL must establish filtering and sorting before LIMIT, and
application integration owns UI/IPC acceptance. The existing two actual native
fixtures retain lifecycle regression coverage without claiming new SQL acceptance.

This slice adds no extractors or source-content reader; content indexing remains
unimplemented. It does not complete L2-02's MIME filters, path navigation, recent
files, opt-in MIME extractors, extraction cancellation, or full
UI/desktop acceptance. These development-host checks establish no Debian 13,
GNOME/KDE Wayland/X11, assistive-technology, native-picker, or packaged Electron
acceptance, and repeat no 100,000-path/performance proof already owned by L2-01.
