# Read-only install metadata: separate host owner

Coordinator contract frozen before host implementation. This complements the
[collector contract](install-metadata-protocol.md), not installation authority.
The collector implementation is a separate lane. No permit, actual capture,
guest operation, installer, package repair, build or acceptance promotion is
authorized by this preparation increment. Full97/local1.0 remains unchanged.

## Owned paths and dependency boundary

Own only new `lab_install_metadata_owner.py`, `test_lab_install_metadata_owner.py`
and new `evidence/shell-native-at/install-metadata-owner-preparation/`.
Do not edit a current owner, collector, codec, target file, controller, native
wrapper, observer, parser, staging, inventory pin, registry, lockfile or contract.
The coordinator reconciles both implementations before review/publication/use.

Reuse unchanged `lab_owner.py` reservation, pinned container/config, lock/marker,
guardian, retained children, readiness, fixed SSH/sudo and poweroff cleanup.
Reuse the reviewed `lab_build_facts.py` artifact machinery where appropriate,
without changing its domain or accepting its permits for this job. In particular,
pin that imported module's exact bytes: a trusted import is a source dependency,
not an implicit extension of the existing base-owner hash.

The collector adapter is closed, internal and never caller-supplied. Its API is
`source_bytes() -> bytes`, `decode_packet(raw, code) -> (packet, snapshot, raw)`
where the final two values are null for unavailable, `validate_snapshot(value)`
returning a validated snapshot, and closed `FAILURES`. The API-name/tuple-shape
clarification was sent to the collector author during implementation; its wire,
schema, path scope and limits remain the original frozen4284ff0 contract.
Do not execute collector source locally, import a caller path or invent a
successful fallback when the collector is absent. A small private-fixture codec
may support isolated host tests; it is not actual composition or capture proof.

Import is inert and requires no collector file or host/lab probe. Resolve the
real adjacent collector lazily after validating the source closure. Missing,
malformed, wrong-origin, changed or incompatible dependencies fail closed before
new marker/start/dispatch. No sys.path/environment plugin discovery or alternate
module is permitted. The existing code/profile must remain sufficient to recover
valid interrupted ownership before a fresh attempt, including when the capture
artifact already exists; do not turn that artifact into a recovery bypass.

## Closed CLI and permit

The new CLI requires exactly the two acknowledgements
`--reviewed-install-metadata-owner --reviewed-install-metadata-probe`.
No command/path/account/package/backend/timeout/capture-ID argument, abbreviated
flag, environment option or native-wrapper invocation. Existing native,
inventory and build-facts CLI/permit domains remain unchanged and reject this
domain. Do not create any real permit during implementation or review.

The fixed0400 permit is `f102-install-metadata-permit.json`, exactly17 keys:

```text
schema jobKind captureId containerId imageId labRoot labDevice labInode
ownerSha256 artifactOwnerSha256 installMetadataOwnerSha256
installMetadataCollectorSha256 installMetadataTargetsSha256
installMetadataProbeSha256 guestAccount guestPrivilege
installMetadataAuthorityReviewed
```

schema is integer1; jobKind is `install-metadata-only`; captureId is a canonical
UUID4 nonce; container/image/root/device/inode are the existing pinned identities.
Account is exactly `linuxcast`, privilege `sudo-noninteractive`, reviewed flag
true. Six SHA256s bind respectively the unchanged base owner, imported artifact
owner, new host module, adjacent collector module, frozen target JSON and exact
returned guest source bytes. Targets must also match the already frozen
`59e3967d9110c7b451a0ba5181382eef395967bdb4945ef1ceec9561f987f153`.
The probe must be valid UTF-8 with quoted argument at most60000 bytes. Bound all
source reads and reject aliases/nonregular or writable/untrusted inputs according
to the retained protected-source rules. Recheck the complete closure before
start and dispatch, not merely its path names or cached Python module object.

Use the existing marker, bound to this exact permit's bytes. Foreign domains,
malformed/replaced permits or markers refuse. New admission refuses an existing
capture artifact before marker/start; valid interrupted recovery runs first.
At most one start and one metadata dispatch per reservation. Intent is durable
before fallible launch bookkeeping; stale/rejected replies do not erase it.

The only repeating readiness probe remains fixed `/usr/bin/true`. The sole
metadata command is fixed `/usr/bin/python3 -I -B -c <quoted source>` through the
existing fixed linuxcast/noninteractive-sudo SSH route. No collector input,
target list or snapshot value becomes a command. Startup120s, metadata job30s,
guest25s, total owner600s and cleanup45s remain unchanged. Socket output limit
65536, packet60000, snapshot2MiB and guardian/public4096 remain unchanged.
The full offline test wrapper remains18s. Do not borrow build/native permits or
increase a bound to accommodate unavailable input.

## Private artifact and publication

Artifact name is exactly `f102-install-metadata-<captureId>.json` in the retained
existing lab root. No arbitrary filename/path. Use exclusive no-follow creation,
0400 caller ownership/single-link identity and retained-directory custody. Never
overwrite, truncate, unlink or adopt a partial/replaced/preexisting artifact.

Validate packet domain/exit/schema/complete canonical bytes independently before
publication. The artifact is the complete canonical private snapshot, never a
summary substituted for the bodies. Store its size/SHA256 and verify actual
written bytes through short-write/readback/fsync/close/reopen/guardian handoff.
The caller independently reopens and validates the exact device/inode and raw
bytes, then independently revalidates the snapshot and summary relationships.
Same-byte replacement still fails. No raw content/path/host exception escapes
to public diagnostics or stderr.

Retain ownership interruption-safely at writer and reader acquisition. Preserve
the existing owning-FileIO writer remedy and direct reader retention or a proven
owning-object equivalent; do not reintroduce an interruptible Python setter
handoff. Cover hard alarm as well as cancellation. Never close a known unrelated
reused descriptor or retry an ambiguous close. A later guardian/descriptor/
source/artifact custody failure invalidates a previous observation and prevents
clean reservation release; it does not unlink the artifact or erase known
start/dispatch accounting or the first operation failure.

Update snapshot claim, artifact identity and transportResultValid consistently
in one commit point. Interruption before that point leaves an unclaimed partial
artifact; interruption afterward preserves consistent accounted state. Every
received observed **or unavailable** reply binds the current capture UUID.
Retain the original operation failure alongside a separate cleanup failure.
Verified shutdown/reaping is lifecycle evidence, not installation/rollback proof.

## Compact relay and public result

The private relay has exactly the existing lifecycle fields plus
`installMetadata` and private `artifact` identity (device/inode or null), at most
4096 bytes. Use a separate summary rather than mislabelling this job buildFacts.
Its exact summary fields are:

```text
status firstFailure captureId bytes sha256 packageCount fileCount
directoryCount handlerCount
```

Status is not-received/unavailable/observed. Initial not-received has firstFailure
none and all remaining fields null. Received summaries have the current UUID;
observed has firstFailure none, positive bytes <=2MiB, SHA256, packageCount1..4096,
fileCount1..128, directoryCount1..64, handlerCount0..32 exactly matching the
validated snapshot. Unavailable has a collector-allowlisted non-none failure,
null bytes/digest/counts and null artifact; it cannot complete successfully.
transportResultValid is true only for a consistently received valid summary;
custody invalidation clears the claim and validity while retaining lifecycle
attempt/failure facts. Reject every unexpected key, bool-as-int, mismatched
count/UUID/status, artifact alias or hidden content field.

Public result has exactly `schema`, `jobKind`, `lifecycle`, `installMetadata`,
`acceptance`, at most4096 bytes. Schema is `f102-install-metadata-owner-v1`,
jobKind `install-metadata-only`, acceptance `pending`. No artifact path/identity,
file/registry/control bodies, package names, original status hash or extra raw
diagnostics. Exit0 requires verified completed lifecycle plus a valid observed
snapshot; otherwise exit3. Final close failure invalidates before publication.
Neither this result nor observed snapshot means install-ready or task accepted.

## Validation and actual-use gate

Test only owned private files/adapters and synthetic public metadata. Never run
the real CLI, touch the private lab/key/user-data/disks/logs/permit, Docker/SSH,
guest, root/namespace, installer/compiler/provider/desktop operation or host
package/config database. Independent FixtureGuard may supervise ordinary private
host fixtures only, with exact retained-child reaping/ECHILD and no broad scan.

Cover strict CLI/domain/source closure, missing collector refusal, every permit
field/type/hash, FIFO/no-follow/nonblocking preflight, marker/artifact collision
and recovery ordering; complete packet/schema/public limits, captured counts;
partial/short/lying writes, read/fsync/close errors, same-byte/path replacement,
acquisition/cancel/SIGALRM/reuse gaps, publication consistency, unavailable UUID
binding, guardian loss/final-close invalidation and first-failure retention.
Fault controls must fail behaviorally when their specific guard is removed,
not merely encounter an absent fixture. Preserve existing tests and boundaries.

Pin source/contract/test evidence and distinguish synthetic isolated-host checks
from final collector composition. Automatic Python discovery and mapped F1-02
checks must pass under the unchanged18s bound, with no skips/expected failures.
Independent review of the fully composed sources, immutable source custody,
fresh distinct permit and a coordinator-only actual capture remain required.
No acceptance or execution is promoted by this preparation. Helper/runtime,
recursive effects/diversions/writer exclusion, install/locale/provisioning,
build/receipt, containment/native/AT/session/release and historical timeout-
descendant uncertainty remain outstanding.
