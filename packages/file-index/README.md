# Selected-root file metadata index (L2-01)

This package indexes names, relative paths and metadata only. No file contents
are read, and no source file is changed or removed. The database is private
plaintext under the existing storage owner's data policy.

## Coordinator integration contract

Migration **003** is reserved by the coordinator. Its SQL is exported as
`FILE_INDEX_SCHEMA_SQL` from `src/repository.ts` for copying into the numbered
storage migration. The storage utility imports that module directly, registers
`fileIndexContracts` from `src/contracts.ts`, adds `FileIndexMethods` to its typed
method surface, and calls `dispatchFileIndex(db, method, params)` with its existing
connection. This module never opens SQLite. No indexer or native helper owns a
second writer. The final numbered migration remains coordinator-owned.

Methods: `files.roots.put/list/remove`, `files.scan.begin/batch/finish/abort/prune`,
and `files.search`. Root changes come only from the trusted built-in selection
flow. They are not renderer, extension or workflow filesystem authority.
Generation IDs are opaque UUIDs. Batches contain at most 256 entries; publication
is one transaction after a completed scan. Cancellation preserves the previous
generation, while inaccessible roots become unavailable. Pruning removes at most
512 obsolete index rows per transaction and never touches source files.

The native `linuxcast-platform index` route is parent-owned, length-prefixed
protocol version 1. Only configure, scan, poll and close commands are accepted;
cancellation is a separate fixed command while a scan is active. Main supplies
the packaged executable, not a caller-controlled executable or shell command.

## Root and watcher policy

Only explicitly selected absolute roots are opened. Directory traversal uses
descriptor-relative Linux `openat2` with no symlink following and no nested mount
crossing, including bind mounts. Select a mounted directory separately to index
it. Supported local filesystem types match storage: ext*, XFS, Btrfs, tmpfs and
overlay. Missing kernel support or other filesystem types are unavailable, not a
fallback to unsafe traversal. Hidden names are excluded unless enabled. Size
limits apply to files. Explicit excluded relative directory prefixes are pruned.

Ignore globs are bounded root-relative patterns: `*` and `?` match within a path
component, `**` crosses components, and `**/` can match zero directories. Bracket
classes, escaping and negation are rejected with invalid configuration. Patterns
are exclusions only; they cannot reinclude a hidden path or excluded mount.

Inotify watches directories before enumeration. Events invalidate the selected
root; a complete reconciliation handles moves, deletion and overflow without
guessing rename identity from event order. Watch exhaustion is explicit degraded
coverage, with periodic reconciliation still active. No successful watch claim
is made when registration fails. A root replacement or removal invalidates the
old root identity. Cancellation and process shutdown release watches and handles.

Search returns FTS candidates with stable root/path identities. The launcher’s
shared scorer owns final ranking. These index records are not file-open grants:
the file operation broker must resolve and revalidate a selected root handle at
use time. A reconciliation snapshot is not an atomic filesystem snapshot.

## Acceptance evidence

On 24 October 2026, ten integration cases pass with the actual compiled Rust
helper and SQLite 3.53.4, Node 24.22.1 and Bun 1.4.4 on the Ubuntu-based amd64
development host. `tests/index.integration.test.ts` creates 100,000 real empty
files in private temporary roots, indexes them, renames 100 and deletes 100,
then compares every indexed file path with fresh directory listings (99,900
files). Fifty FTS queries return current paths. This supports AC01, not the
Debian reference-system latency or physical-machine release target.

AC02 cases exercise an actual chmod-denied subtree alongside readable files,
restored access, hidden/glob/size/directory exclusions, symlink loops, removal
and replacement. Rust tests additionally prove kernel `EXDEV` rejection of the
fixed `/proc` mount relative to `/`; no host directory is enumerated or mount
changed. The native helper's two Rust tests pass, as does Clippy with warnings
denied. Tests also generate more distinct inotify events than the read-only
kernel queue limit, observe actual overflow, and recover through a full scan.
No sysctl is changed. Watch registration failures remain explicit degraded
coverage; a hardware device disconnection is not simulated as a passing run.

Other cases cover cancellation retaining the prior generation, crash-staging
recovery, malformed configuration, generation conflicts, atomic metadata/FTS
rollback, bounded multibyte search replies and derived-only removal. The direct
test adapter calls the repository on one actual SQLite connection with WAL,
FULL and `trusted_schema=OFF`. Coordinator integration separately wires and
validates the existing StorageOwner/client and numbered migration; these direct
repository tests do not claim that transport integration by themselves.

The first seven-case run passed; a later eight-case run passed its assertions
but failed fixture deletion with `ENOTEMPTY`. The exact residual private fixture
was removed, and bounded retries were added to test cleanup. The subsequent
ten-case run passes with cleanup. Fixtures contain public synthetic names and
empty or explicitly synthetic bodies; neither content nor absolute fixture paths
are included in retained diagnostics. These checks support the privacy criterion.

No product UI is added (UI criterion not applicable); L2-02 owns dedicated file
search presentation under DESIGN's list/grid/detail/form rules. Progress/error
types here support that future surface. No desktop, whole-home crawl, content
extraction, physical-machine performance or release matrix evidence is claimed.
