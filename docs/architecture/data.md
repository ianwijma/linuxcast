# Data, retention, migrations and scheduling

Status: proposed persistence contract for implementation. Research snapshot: 2026-10-22. Storage/error/export settings follow [DESIGN.md](../design/DESIGN.md). Values labelled defaults below are selected product defaults, not measured platform facts.

## Filesystem layout and ownership

Follow the XDG base-directory specification and the actual environment values; do not hardcode `~/.config` when `XDG_CONFIG_HOME` is set. Create private directories with mode `0700` and ordinary private files with mode `0600`. [XDG specification](https://specifications.freedesktop.org/basedir/0.8/).

| Location | Contents |
| --- | --- |
| `$XDG_CONFIG_HOME/linuxcast/` | Small versioned bootstrap preferences, UI/autostart choices; no plaintext credentials |
| `$XDG_DATA_HOME/linuxcast/linuxcast.db` | User content, definitions, permissions and operational records |
| `$XDG_DATA_HOME/linuxcast/blobs/` | Content-addressed note attachments, approved clipboard images and saved artifacts |
| `$XDG_DATA_HOME/linuxcast/secrets/` | OS-keyring-protected encrypted secret blobs; SQLite stores opaque references |
| `$XDG_DATA_HOME/linuxcast/extensions/` | Immutable validated extension versions and isolated per-extension data |
| `$XDG_DATA_HOME/linuxcast/models/` | Explicitly downloaded verified model assets and provenance manifests |
| `$XDG_DATA_HOME/linuxcast/backups/` | Consistent pre-migration snapshots and explicitly configured local backups |
| `$XDG_CACHE_HOME/linuxcast/` | Rebuildable thumbnails, extraction cache and temporary download staging |
| `$XDG_STATE_HOME/linuxcast/` | Redacted bounded logs and crash/recovery metadata |
| `$XDG_RUNTIME_DIR/linuxcast/` | Per-session unprivileged locks/handles; never durable content |

Use the specified XDG fallback locations when variables are absent. Validate private runtime-directory ownership before use. The privileged input service has separate root-owned state/runtime directories and never opens these content directories. Private permissions do not imply data encryption; document that notes, history and the database remain ordinary local files.

## SQLite ownership and transactions

One trusted storage utility process owns the database connection and all writes. Main, renderer, workflow worker and extension hosts use typed repository requests. Do not add a second background scheduler/indexer that writes SQLite independently.

Initialize foreign keys enabled, WAL journaling and a 5,000 ms busy timeout. Choose `synchronous=FULL` for durable user content/run checkpoints initially; change only with measured evidence and an explicit durability decision. Keep transactions short and avoid awaiting network/filesystem work while a transaction is open. Large indexing batches yield between bounded transactions so interactive writes remain responsive.

The packaged SQLite runtime must be at least 3.51.3, which includes the documented WAL-reset fix; assert `sqlite_version()` in the packaged smoke test rather than assuming the Node addon bundles a suitable version. Store the database on a local filesystem: WAL is not a supported network-filesystem configuration. Keep automatic checkpoints enabled and monitor WAL growth. These choices follow the upstream WAL/durability documentation. [SQLite WAL](https://www.sqlite.org/wal.html), [synchronous pragma](https://www.sqlite.org/pragma.html#pragma_synchronous).

Use SQL migrations and typed repositories. Keep integer schema version and application build metadata. SQLite FTS5 indexes are derived data; rebuilding search must not delete source notes, snippets or files. [SQLite FTS5](https://www.sqlite.org/fts5.html).

Use stable UUIDs for user-created entities, stable namespaced IDs for built-in commands and installation identity plus content hash for extensions. Persist timestamps as UTC instants; calendar/schedule definitions also preserve IANA timezone and original local-time semantics. Never infer timezone solely from a formatted timestamp string.

## Schema domains

The initial schema may split tables further, but these ownership and key constraints are required.

| Domain | Records and constraints |
| --- | --- |
| Settings | Versioned typed values, platform preferences and onboarding completion; secret references only |
| Command usage | Stable command ID, usage aggregate, last use and user pin/alias; bounded event history |
| Applications/files | App IDs, selected roots, metadata, index generations and FTS candidates; rebuildable |
| Clipboard | Item ID, creation/expiry, MIME, blob reference, optional reliable source, ownership/hash dedupe |
| Snippets/quicklinks | Stable ID, name, trigger/arguments/template, enabled/app rules, version; no execution from imported text |
| Notes | Structured Tiptap document version, plain-text search projection, attachments, modified time and revisions |
| Calendar/contacts | Local collections, events/contact records, ICS UID/recurrence ID, remote account references, ETags and sync state |
| Extensions/grants | Installed identity/version/hash, declared permissions, actual grants, per-extension preference/state namespace |
| Workflows | Versioned graph, node configuration, declared effects and saved revisions |
| Automation schedules | Definition, IANA timezone, enabled flag, next occurrence, missed-run policy and definition revision |
| Runs/steps | Immutable run ID, occurrence key, state transitions, input/output references, cancellation and effect outcome |
| AI/projects/skills | Conversations, configured model/provider reference, project context selections, skill metadata and tool grants |
| Migrations/backups | Applied schema versions, snapshot metadata, checksums and completion state |

Store attachments in content-addressed blobs with reference records and size/MIME metadata. Resolve blobs through opaque handles. A blob is garbage-collected only after no live/revision/export transaction references it; use a grace period and a reconciliation pass after crashes. Never delete arbitrary source files merely because their index record was removed.

## Retention and privacy defaults

| Data | Initial default | User control |
| --- | --- | --- |
| Clipboard collection | Off until enabled; pause while locked; PRIMARY selection collection off | Enable/pause, available source exclusions, clear all, per-item delete/pin |
| Clipboard history | Seven days, at most 1,000 unpinned items and 100 MiB total; evict oldest eligible items | Duration/count/size; pinned items remain visible against the total budget and require explicit management when budget is exhausted |
| Clipboard item size | Text up to 1 MiB; image up to 10 MiB; unsupported/oversized MIME skipped | Show skipped reason; no hidden disk growth |
| Notes/snippets/workflows/local calendar | Retain until explicit deletion | Export, delete, restore from backup; revisions can be pruned explicitly |
| Note revisions | Last 50 revisions per note, coalesced at most once per minute during active edits | Restore a revision; delete note and its retained revisions |
| AI conversations | Retain until explicit deletion | History off for a conversation, export and delete |
| Workflow run metadata | 30 days or 10,000 runs, whichever limit is reached first | Per-workflow retention; clear history |
| Workflow step content | Metadata only by default; explicit debug capture expires after 24 hours, 64 KiB per step and 50 MiB total | Opt in per run; secrets always redacted |
| Tool diagnostic traces | Redacted metadata, 30 days, 100 MiB total | Clear/export diagnostics explicitly |
| Application logs | 14 days, 20 MiB total, rotating | Clear/export; no content bodies/raw keys/credentials |
| Audio/OCR temporary input | Delete on completion/cancellation/recovery cleanup | Explicit Save result/input only |
| Models | Retain verified downloaded assets until removed | Show size/license and remove independently |
| Pre-migration backups | Keep the latest three successful private plaintext snapshots | Show size/location and explicit deletion; clearly distinguish from encrypted portable backups |
| Scheduled portable backups | Disabled initially; keep five successful encrypted backups per schedule | User-selected destination, cadence and retention; skip on battery by default |

Pinned clipboard items must not silently defeat the total storage budget. If pinned content fills the limit, stop adding history, preserve existing items and offer management. File-list clipboard entries store approved paths/metadata, not copies of arbitrary referenced files. History deduplication must include MIME/content identity and cannot turn an old sensitive item into a permanent pinned item.

Retention applies to active storage. Backups can still contain previously retained data until those backups are removed. Deletion is logical removal and blob cleanup, not a claim of forensic erasure on SSDs or snapshots. State this in export/delete settings without claiming the OS supplies universal secure deletion.

## Secrets

Persist credentials only through the OS-backed `safeStorage` path described in [security.md](security.md). The broker owns decrypt/use operations; all other processes receive opaque IDs or the result of an authorized request. Linux `basic_text`, unavailable keyring or a failed encryption roundtrip disables persistent credential storage. Session-only setup remains available. Do not put a key in SQLite because keyring setup failed.

Provider/model settings can be persisted separately from the credential: provider ID, model ID, endpoint and capability metadata contain no API key. CalDAV/CardDAV and browser pairing secrets use the same secret-reference service. Portable backups and exports never contain provider/account credentials, backup passphrases or permission grants; restored integrations require reauthentication/reapproval.

## Migrations and recovery

1. Obtain the single-instance/data-owner lock and validate database/schema metadata before starting feature workers.
2. Create a consistent SQLite backup using its backup API, with a manifest and checksum. Do not copy a live `.db` file while ignoring WAL contents. [SQLite backup API](https://www.sqlite.org/backup.html).
3. Check disk availability. A failed required backup stops migration with a recoverable error; do not proceed after silently discarding the backup requirement.
4. Apply ordered migrations transactionally where SQLite supports it. A migration needing a nontransactional step must define its own idempotent journal/recovery sequence before merge.
5. Validate invariants and update schema metadata only after success. Keep the prior snapshot until a successful launch is confirmed.
6. On failure, preserve the failing database and diagnostics. Offer retry or restore of the compatible snapshot with the app closed; do not overwrite user content automatically.

Internal pre-migration snapshots remain private plaintext local files. They include database contents, potentially clipboard history, and require an explicit plaintext label in settings. They are operational recovery artifacts, not the portable export format.

### Encrypted portable backups and scheduled exports

Full portable backup defaults to `.linuxcast-backup.age`: a versioned ZIP payload encrypted using the standard age passphrase format through the reviewed Rust `age` crate. The ZIP contains a manifest, JSON records and referenced blobs with size/checksum metadata. Use the library's format/KDF/authentication implementation; never design a custom cipher or cryptographic envelope. [rage project](https://github.com/str4d/rage), [age crate](https://docs.rs/age/latest/age/).

V1 payloads use ZIP `STORE` entries, at most 50,000 entries, 1 GiB per blob and 10 GiB total payload; reject over-limit exports before publishing and over-limit restores before activation. No source content is silently omitted to fit a limit. Export from a consistent SQLite snapshot; stage only in private directories, never the shared destination. Set the library's encryption scrypt work factor to 18 and maximum accepted decryption work factor to 20 using its public APIs. Run the backup worker with a 1.5 GiB memory ceiling and cancellation/deadline monitoring; reject more expensive imported headers with an actionable compatibility error. These are selected resource/security defaults to validate in F2-03, not a custom KDF. [age recipient API](https://docs.rs/age/latest/age/scrypt/struct.Recipient.html), [age identity API](https://docs.rs/age/latest/age/scrypt/struct.Identity.html).

Require at least 12 Unicode characters in a user-provided passphrase, confirm it before first export, accept spaces without silent trimming/normalization and cap encoded length at 1,024 bytes. Offer a generated strong passphrase and explain that Linuxcast cannot recover a forgotten one. A passphrase is session-only unless the user explicitly chooses to retain it in the secure SecretStore. A locked/unavailable/insecure keyring must not result in plaintext passphrase persistence. The minimum is a selected usability rule, not a claim that every 12-character phrase is strong.

Portable full backups include durable user content and definitions by default. Clipboard history is an explicit optional category. Never include provider/account credentials, secret blobs, backup passphrases, permission grants, active leases or running-state checkpoints. Caches and downloaded models are excluded. Installed package identities/preferences can be recorded, but restoration never installs executable packages or enables background/input triggers without review. Simple user-selected snippets/quicklinks JSON exports remain available as explicitly labelled plaintext interoperability files.

Scheduled export is disabled initially. Setup requires a user-selected destination directory, explicit secure retention of the backup passphrase, and one cadence: daily, weekly or monthly. Initial choices are 03:00 local time, Sunday for weekly and day 1 for monthly; the user may select another valid time/day. Persist the IANA timezone. Keep the latest five successful backups for that schedule, skip on battery by default and show the next run and last result. The resident scheduler's missed-run/coalescing/DST rules below apply. No logged-out/cloud execution or wake-from-suspend claim is added.

If the keyring is missing/locked, destination is unavailable or battery policy blocks the run, record a skipped/actionable outcome without falling back to plaintext. Never silently change destination. After all prerequisites return, the next eligible coalesced occurrence runs once. Keep existing successful backups until a new file has been fully encrypted, flushed and atomically renamed; only then prune files recorded as belonging to that schedule. Never remove unrelated files from the destination.

For restore, authenticated decryption must finish successfully into a private staging area before any live state changes. Bound file sizes, expansion ratios, entry counts and passphrase KDF work; reject unsupported recipient/plugin forms rather than executing age plugins. Validate paths, checksums, schema versions and references after decryption. A wrong passphrase, truncated/tampered file or unsupported version changes nothing. Show category/conflict review, preserve stable IDs under the chosen merge policy and make a fresh snapshot before full restore. Delete staging on success/failure/cancel and clean orphaned staging after a crash; do not claim forensic erasure.

Corruption handling preserves the original file and attempts read-only diagnostics. Rebuild only derived indexes/caches when source records are sound. Never “repair” by deleting the database that holds notes or workflow definitions. Tests require migrations from every retained schema fixture, interrupted migration, full disk, corrupt index, corrupt source data, import traversal and restore rollback.

## Durable scheduler semantics

The resident desktop application owns scheduling. Closing/hiding the launcher keeps the app resident; explicit Quit, logout, sleep and power-off pause execution. V1 does not wake the computer or run as a separate logged-out daemon. Autostart is an independent opt-in preference. The privileged input service must never become a general scheduling/workflow service.

Persist each schedule's definition, IANA timezone, definition revision, enabled state, next UTC occurrence and missed-run policy. Initial missed-run policy is **run the latest missed occurrence once on resume**, marking older missed occurrences skipped. Offer **skip missed occurrences** as the other initial option. Do not replay a backlog of external actions after a long shutdown.

For local wall-clock schedules, skip nonexistent DST times and execute only the first occurrence of a repeated wall-clock time. Record the resolved UTC instant and offset. Recalculate future occurrences after a timezone/schedule edit without duplicating already-recorded occurrence keys. Display the next run in local time with timezone information.

Enqueue inside a database transaction with a unique constraint on `(schedule_id, definition_revision, scheduled_occurrence_utc)`. Initial per-automation concurrency is one. An already-running automation coalesces eligible pending occurrences according to its missed-run policy instead of creating unbounded simultaneous runs. Manual Run has a distinct invocation ID and does not consume a scheduled occurrence.

Persist state transitions: `queued → running → succeeded|failed|cancelled|interrupted`. Each step records `pending → prepared → dispatched → completed|failed|unknown`. Write the prepared/dispatched checkpoint before an external effect. A crash after dispatch but before completion leaves an unknown effect outcome; mark the run interrupted and require review. Do not claim exactly-once execution or blindly retry a send/write/payment/other non-idempotent action. Built-in read-only/idempotent nodes may declare bounded retry policies and idempotency keys where the external service supports them.

On startup, expire former process leases, inspect unfinished runs and recover only safe checkpoints. Never resume a background job using stale provider/tool/file grants. Disabled/deleted automation cancels queued work and requests cancellation of running steps; an already-completed external effect is not undone by cancellation. UI must show this distinction.

Scheduling tests cover suspend/resume, system-clock jump, DST transitions, timezone change, process crash at every step transition, duplicate startup, missed days, long-running overlap, revoked grants and unknown external outcomes.

## Calendar, contacts and local processing

Local events/contacts work without a remote account. ICS import/export preserves UID, recurrence identifiers, timezone information and supported exception semantics. CalDAV/CardDAV use account-scoped credentials, ETags/conditional updates and explicit conflict records. Do not overwrite a newer remote object after a failed `If-Match`; show a conflict-resolution action.

Bound document size, property length, attachment references and recurrence expansion. Initial calendar queries expand only the requested range, capped at 10,000 generated occurrences per query. Remote attachments are not fetched automatically. Unsupported properties should be preserved when safe for round-trip export or clearly reported, not silently converted into executable links.

Local OCR/dictation jobs receive scoped input handles, have resource/deadline limits and support cancellation. Store only a user-selected saved result by default. A model manifest includes source URL, version, license, SHA-256, byte size and compatible runner version; partial downloads stay in staging and are removed/retried safely. No silent cloud fallback when the model is absent or hardware is too slow.

## Data acceptance gate

Prove private-directory/file permissions, unavailable/basic-text keyring behavior, secret-free exports/logs, retention limits including pinned clipboard items, WAL-safe backup, failed migration recovery, archive validation, blob reconciliation, calendar conflict handling and scheduler crash/DST semantics. Portable-backup tests require age/rage interoperability, wrong passphrase, tampering/truncation, oversized KDF parameters, archive traversal/expansion, full disk, cancellation, interrupted publish, locked keyring, unavailable destination, battery skip, five-file retention and restoration with permissions/triggers disabled. Performance tests must include simultaneous indexing, note edits and workflow checkpoints so the single writer does not stall interaction. No test here has yet been run; these are completion criteria for implementation.
