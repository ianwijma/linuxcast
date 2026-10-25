# Local data controls — F2-02

This package owns category-specific control policy and local redacted diagnostics;
all database reads/writes remain with the single F2 storage owner. Clear/export
operations use explicit categories and identifiers. Omitted identifiers mean the
whole selected category; an empty selection means none. There is no arbitrary
SQL/table/path dispatcher. Permissions are revoked through the F3 broker, and
credentials are deleted through SecretStore; neither is a portable export field.

`DataControls` accepts the actual typed storage client. Its bounded category
exports are complete snapshots from one owner transaction;
oversize results fail explicitly instead of silently omitting rows. Settings
export has a fixed allowlist, command-usage reset clears count and last-used timestamp while preserving pins/aliases, explicit
conversation deletion includes its revisions, and file-index clear invalidates
in-flight generations while preserving root choices and every source file.
Full streamed encrypted portable backup/restore is F2-03; this package must not
label raw JSON or private pre-migration snapshots as encrypted backups.

`clear(params, {signal?})` returns completed category/count or a fixed failure
with known removed count, possible-change flag and no automatic replay. Register
every main-owned index job with `registerIndexJob(rootId, {stop})` before starting
it. Index clear bars new registrations, awaits selected producer stops, then
repeats the owner's bounded batches until complete. Cancellation between batches
leaves already-cleared data cleared and requires an explicit later retry. A
failed stop prevents deletion. The controller is main-only; it is not renderer
authorization or a replacement for native confirmation. `export(params)` returns
a typed independent JSON snapshot marked `encrypted: false`, or an actionable
size/storage failure without partial content.

## Diagnostics and retention

`LocalDiagnostics` is a main-owned metadata-only service in the trusted XDG state
directory. Records accept fixed component/event/reason enums, a duration, generated
UUID and timestamp; arbitrary messages, errors, IDs, URLs, paths, prompt bodies,
clipboard/key content and credentials are rejected. Two independent categories
are application-logs (14days/20MiB) and tool-diagnostics (30days/100MiB). Each has
an additional10,000-record bound. Files/directories are private0600/0700; only
service-owned fixed filenames are read/deleted, with no-follow and ownership/link
checks. Writes and resets serialize; malformed records fail closed with an
explicit category reset action. Clear of one category preserves the other and
unrelated files. No crash dump or unattended upload is created.

`planRetention` implements the specified oldest-eligible age/count/byte policy.
Pinned clipboard items never expire silently, count against the total byte
budget, and produce an explicit budget-exhausted result when no room remains.
Defaults also describe clipboard history, workflow runs/debug capture and durable
content with no automatic expiry. Pure policy tests do not claim a clipboard,
workflow or notes backend exists: feature adapters must recheck current pin and
revision eligibility during their owner transaction. Diagnostics performs actual
private-file pruning with this policy.

Exports intentionally chosen by the user can include user-authored AI content.
The controls exclude service credentials, secret references, permission grants,
leases and execution checkpoints by schema/category allowlists; they do not
claim to recognize every secret that a user may type into arbitrary prose.
Category export/delete must disclose that local data and retained operational
snapshots are not encrypted by safeStorage, and deletion is not forensic erasure.

## Acceptance still required

Generated metadata fixtures verify privacy, category isolation and retention.
Controller tests cover stop ordering, admission during clear, failed stops,
cancellation between batches, response validation and redacted failures. Actual
child-owner tests verify category isolation, metadata exclusion, multi-transaction
600-row index clear, late-generation rejection and preserved roots/source files.
The producer stop fixture is a trusted job callback, not a native watcher test.

Shared host UI integration and its keyboard, accessibility and affected-state
evidence remain F2-02 acceptance requirements. Typed outcomes do not satisfy
F2-02-UI or transfer it to another task. Full Debian session/backend acceptance
and final application integration remain distinct from these service checks.
