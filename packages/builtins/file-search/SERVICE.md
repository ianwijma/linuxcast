# Selected-folder metadata service (bounded L2-02 increment)

`@linuxcast/file-search/service` exports `createFileSearchService(options)`,
`FileSearchService`, `FileSearchServiceOptions`, and `FileSearchUnavailable`.
Trusted main supplies the sole-owner `IndexStorage`, the existing
`DataControls.registerIndexJob`, and the fixed absolute packaged native executable.
Main gates calls on storage readiness. No repository, executable, or folder-path
argument is exposed to renderers. `addFolder(path)` accepts native-picker output
only and canonicalizes/stat-checks the directory; existing IDs are reused.

The service implements `getState()`, `addFolder(path)`, `startIndex(rootId)`,
`pauseIndex(rootId)`, `removeFolder(rootId)`, `search({query, rootId?})`,
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

Remove waits for job shutdown, removes the selected-root record through the owner,
and prunes derived metadata in batches of at most 512, yielding between batches
and capping the operation at 10,000 batches. It never deletes, modifies, or reads
source-file content. A failed prune reports an unavailable operation; root removal
may already have taken effect. This is not a promise of an atomic filesystem view.

## Evidence and limits

On the Linux amd64 development host, Node 24.22.1, Bun 1.4.4, Rust 1.95.0,
and SQLite 3.53.4:

- `tests/service.test.ts`: 15 controlled tests cover admission, duplicate starts,
  startup/clear/stop races, failed closure, watcher failure, result identity and
  generation checks, state publication races, bounds, owner failure, and pruning.
- `tests/service.integration.test.ts`: two tests use the actual sole-owner utility
  process and Rust `linux-openat2-inotify` helper with small private synthetic
  folders. They exercise scan, denied/hidden files, rename/size update, pause,
  reopen, explicit resume, clear, derived-data removal with originals preserved,
  unavailable helper startup, and explicit retry. The sandbox blocks the existing
  owner's abstract Unix lock socket; running this fixture requires that local
  socket permission. No personal folders or content appear in test output.

This slice adds no extractors or source-content reader; content indexing remains
unimplemented. It does not complete L2-02's dedicated filters/sorting/path
navigation, recent files, opt-in MIME extractors, extraction cancellation, or full
UI/desktop acceptance. These development-host checks establish no Debian 13,
GNOME/KDE Wayland/X11, assistive-technology, native-picker, or packaged Electron
acceptance, and repeat no 100,000-path/performance proof already owned by L2-01.
