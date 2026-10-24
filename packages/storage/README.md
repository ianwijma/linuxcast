# Storage owner (F2-01)

This package implements the trusted SQLite owner, transactional foundation
repositories, migration snapshots and interruption handling. It contains no UI,
provider calls, keyring implementation or direct renderer interface. The database
and internal snapshots are private **plaintext** files, not encrypted exports.

## Process and trust boundary

Main acquires the application single-instance lock before forking the built
`src/utility.ts` entry with Electron `utilityProcess.fork`. Only main retains that
parent port. Main initializes it once with `{ kind: 'initialize', dataDirectory,
applicationBuild, nativeBinding }`. `nativeBinding` is the trusted packaged path
to the better-sqlite3 addon rebuilt for the pinned Electron; it must never come
from renderer input, an extension or a user-selected path. The loader's default
prebuilt is used only by the Node integration tests.

The build must copy `src/migrations/001-foundation.sql` beside the bundled entry
at `migrations/001-foundation.sql`. Startup responds with `ready` containing
protocol/schema/SQLite versions, owner PID and supported method names, or
`unavailable` with a fixed operational reason and optional opaque snapshot ID.
It does not return raw filesystem, SQLite or content-bearing error messages.
Main must show an actionable storage-unavailable state and keep features closed
until ready; it must not silently create another database.

Before SQLite opens, the owner binds a Linux abstract AF_UNIX address derived
from UID and the canonical private data directory plus fixed database filename.
A competing owner fails closed. The socket accepts no requests and destroys all
connections; repository traffic uses the parent-owned port. Kernel cleanup
releases the lock after SIGKILL without stale PID recovery. This coordinates
trusted application processes; it is not a defense against a malicious process
already running as the same user. No second writer/scheduler connection is
exported. A short read-only schema probe closes before the sole content writer
opens. The owner validates directory/file ownership, 0700/0600 permissions,
non-symlink files and single-link database files. Supported local filesystem
types are ext*, XFS, Btrfs, tmpfs and overlay; others report a local-filesystem
requirement rather than guessing that WAL works on a network mount.

`createStorageClient` is a main-only typed client. It takes a parent-port adapter,
not a database path. Main derives authority and authorizes each feature request;
there is no generic SQL, arbitrary table, secret-value or filesystem API. Preload
must expose only individual approved feature operations. Concurrent calls from
multiple clients are serialized into short synchronous transactions. A queued
cancellation reports not-dispatched. Once a synchronous transaction executes,
its completed response wins; cancellation does not undo it. A lost connection or
response deadline reports an unknown outcome and never automatically replays a
write. Main calls `disconnect` when the child exits. Shutdown closes the owner;
Node test children additionally close on parent IPC disconnect.

## Schema 1 and repositories

Migration number 1 was assigned by the coordinator at
`src/migrations/001-foundation.sql`. It defines integer database/build metadata,
applied migration checksums, revisioned typed settings, command usage aggregates,
conversations and immutable message revisions. Stored AI records validate the
shared contracts. Message revisions have conversation/parent foreign keys,
unique message/branch/revision identities, conversation-scoped branch ownership,
and owner-assigned insertion sequence for stable bounded pagination. Optimistic
writes reject stale revisions; duplicate revision IDs never overwrite content.

Initial settings are `ui.theme`, `launcher.shortcut`, `onboarding.completed` and
`clipboard.historyEnabled`. Unknown settings, including API-key/password keys,
are rejected. An absent clipboard preference does not authorize collection.
Application usage is aggregated without an unbounded event history. The package
does not itself enable shortcuts, collect clipboard data or execute commands.

Other schema domains in `docs/architecture/data.md` receive coordinator-assigned
migrations with their feature repositories; no generic JSON CRUD placeholder
claims to implement notes, indexing, clipboard retention, credentials, workflows,
AI runs/tools, scheduling or portable backups. Search/FTS remains derived data and
future index rebuilding must preserve source content. Credential persistence
belongs to F2-02 and encrypted portable backup/restore belongs to F2-03.

## Durability and recovery

Startup asserts SQLite >=3.51.3 and initializes foreign keys, WAL,
`synchronous=FULL`, a 5,000 ms busy timeout and automatic 1,000-page checkpoints.
SQL migrations are contiguous, checksummed and transactional. Changed applied
SQL and newer schema versions are refused. Feature workers cannot run before
migration and integrity/foreign-key validation succeeds.

Before a migration, available disk space is checked and better-sqlite3's SQLite
online backup API snapshots committed content, including WAL pages. Snapshot
files and checksummed JSON manifests are fsynced in the private backups directory.
A failed required backup stops the upgrade. No active database-file copy is used.
Migration states (`prepared`, `migrating`, `failed`, `awaiting-confirmation`,
`confirmed`) are journaled outside the schema transaction so an interrupted
upgrade remains visible after SQLite rolls back. Migration failure preserves the
database and snapshot and returns a recoverable reason; it never replaces user
content automatically or dumps failing SQL/content to diagnostics.

After a crash before commit, startup requires an explicit retry decision. Main
may initialize with trusted `retryFailedMigration: true` after the user chooses
retry. A crash after commit but before final journal publication is recognized
from schema metadata, applied checksums and integrity checks, so migration SQL is
not run twice. Main sends `{kind:'confirm-launch'}` only after successful
application launch; this keeps the newest three confirmed private snapshots and
retains failed/unconfirmed attempts. A crash before a snapshot manifest is
published may leave a private unreferenced snapshot/temp file; it is never used as
recovery authority or automatically deleted as if it were confirmed history.

This task provides recoverable reporting and explicit retry. A UI-driven restore
is not exposed by these repositories: restoring a compatible snapshot requires
the application closed, verifying its checksum, preserving the failing database
and sidecars, and using SQLite's backup API. Do not overwrite a live database or
claim a package downgrade can downgrade its schema. F2-03 supplies reviewed
backup/restore user flows; corruption is reported without deleting the source.

## Validation and limits

`bun run test:integration -- F2-01` maps to
`tests/storage.integration.test.ts`. Tests use actual SQLite databases and actual
Node child processes for concurrent clients, competing owners, SIGKILL inside a
migration transaction and SIGKILL after commit. Backup tests hold an actual reader
snapshot so committed WAL contents remain outside the main DB file. SQLite
`max_page_count` exercises a real SQLITE_FULL failure; the disk-budget preflight
uses a controlled page-count measurement and is not a physical disk exhaustion
claim. Fixtures contain synthetic content only.

Node tests use the pinned better-sqlite3 prebuilt. Electron integration must
explicitly load the rebuilt packaged addon and assert its `sqlite_version()`;
Node evidence alone does not satisfy the packaged runtime criterion. Full .deb
install/upgrade/restore checks remain packaging/release work. F0-01 acceptance
and task prerequisite integration remain open; implementation here does not mark
F2-01 accepted or complete. There are no user-facing changes in this package;
main's error/recovery presentation requires its own design/accessibility checks.
