# Offline first-order install metadata collector and codec

This increment implements only inert guest source construction and an independent
host snapshot validator/codec. It performs no actual capture and supplies no host
owner, CLI, SSH, reservation, permit, publication, installation or provisioning
authority. Scope is exactly
`first-order-routing-controls-only-not-install-admission`.

Prepared base `4284ff0c5ce3397db16b20c8714c26b6e0ef0c66`, approved PR109 context
`ef6630f1125ec37612d94b6f57dadd9a30d65dda`. The initially clean isolated worktree
is `/home/ian/.t3/worktrees/linuxcast/t3-78e5def4`; branch renamed from
`t3/f1-02-offline-collector-codec` to `codex/f1-02-offline-collector-codec`.
Only the two new Python files and this new evidence directory are owned. No
parent import, merge, rebase, reset, existing source/test/owner/runner/interface/
registry/contract/target edit, push, PR, watch or status promotion belongs here.
The final additive commit/tree/signature/clean-state report accompanies handoff.

Read AGENTS, PLAN, GOAL, F1-02 and F0-01 cards and registry dependency/criterion
evidence; security, overview, stack and testing/release contracts; the complete
614-line install-transaction research report (author `5df8747`); the frozen new
install-metadata protocol and targets; current build-facts protocol/schema and
pure status parser; relevant owner source/custody/deadline APIs, FixtureGuard and
the automatic Python test mapping. Read only the permitted public dpkg1.22.22
`options.c`, `triglib.c`, and trigger specification from the original research
scratch as data. The scratch was not changed. No private lab/status/solver/cache/
user content/key/token/credential input was accessed. The local skill catalog
contained no relevant skill; online skill discovery was not used for this
explicitly offline implementation.

## Interface clarification and fixed data

The coordinator's in-session interface clarification changes no wire format,
schema, read set, frozen file or authority. The separately owned future adapter
can call exactly:

- `source_bytes() -> bytes`: fixed UTF-8 guest source; verifies the adjacent
  frozen target JSON on each explicit construction, with a bounded no-follow
  file-object read. No read at import or ordinary module execution.
- `decode_packet(raw: bytes, code: int) -> (packet, snapshot | None,
  canonical_snapshot_bytes | None)`: independent validation, exact canonical
  bytes returned for later coordinator custody; unavailable returns two nulls.
- `validate_snapshot(value) -> value`: independent structural, numeric, content,
  registry, selected-package, namespace, listing and path-relationship checks.
- `FAILURES`: closed tuple of unavailable packet reasons, listed below.

The future adapter hashes returned source bytes and independently counts files,
directories, handlers and packageCount. No owner/public-result schema is defined
here. `source_sha256()` and deterministic `encode_packet()` are convenience pure
codec/source APIs, without execution or publication authority.

| Frozen item | Binding |
| --- | --- |
| Target JSON | 38966 bytes; SHA256 `59e3967d9110c7b451a0ba5181382eef395967bdb4945ef1ceec9561f987f153` |
| Expanded canonical lexical candidate path list | 5983 sorted unique paths; 257735 bytes; SHA256 `a54b64bcd53987a9db18066f859d2f2d9ca02f36284f80e1636cea7a6cba2432` |
| Compressed base64 data | 38504 bytes, fixed observation data only |
| Approved 55-payload inventory | SHA256 `341b9d45b330b0cd8379d7861af72e269a9224c4189bc6ccefd8bad5907acc3a` |
| Explicit activation names | Exactly `ldconfig` |

The source is reviewable as `GUEST_BODY` with explicit fixed constants/data. A
bounded, hash-checked complete-zlib bootstrap executes only those fixed source
bytes; neither snapshot nor target data is executed. Targets independently check
length/count/hash/schema/strict base64/complete EOF/canonical lexical ordering.
Host validation never executes the guest parser and performs no filesystem I/O.

## Collection and validation controls

Existing root-owned regular single-link no-follow frontend, database and trigger
locks are acquired shared/nonblocking in that order, retained through all reads
and final verification, and closed in reverse. No create/truncate/chmod/retry or
same-inode reopen is admitted. Descriptor-relative traversal retains protected
root/ancestors; the fixed read set uses `/usr`, `/var` and `/etc`, requiring no
merged-/usr symlink exception. Arbitrary ancestor/leaf links refuse. Lexical
trigger matching retains `/lib` versus `/usr/lib` distinctions.

Slots exist before opens. Tiny open/retain/close sections mask TERM, INT, HUP
**and ALRM**. Reads, listings, parsing and verification remain interruptible.
Close detaches ownership before the syscall; ambiguous errors are unavailable
and never retried, including after descriptor reuse. An inability to establish a
safe close section leaves custody unknown and cannot publish observation.
The guest uses its 25-second alarm; future 30-second job, 600-second owner,
45-second cleanup and existing 18-second offline wrapper limits are unchanged.

Original status is bounded at 8MiB/4096 records/128KiB stanza/16KiB physical and
selected field. Discarded field values are not accumulated; their names/presence
still enforce duplicate/continuation/syntax rules. Package/Status are mandatory;
legitimate partial states retain missing fields, other states require actual
Architecture/Version, and Multi-Arch crossfields are checked. Case-insensitive
pending fields count records once. Only original status digest/size/counts and
the fixed four plus derived handler identity fields are exported. No raw status
or complete package list is exported.

File/explicit registry parsers accept dpkg1.22.22's one-path/one-package-option
and one-package-option-per-line formats, strict `PKG[:arch]`, default, `/await`
and `/noawait`. Unknown options, malformed or duplicate interests refuse even
when unmatched. Prefix/ancestor matching uses all frozen paths lexically.
At most 32 first-order handlers are derived. Namespace uses actual status
Architecture/Multi-Arch and info format (absent/0 legacy; 1 enables qualified
Multi-Arch:same control names); ambiguous or unknowable qualified namespace
refuses. Only derived `.triggers` and `.postinst` controls are read, with explicit
absence and no fallback to another package/control namespace. No full info
listing, glob or arbitrary selector is present.

Unincorp must exist and be empty; updates must be empty. Optional files, absent
config directory, nonempty configs/diversions/statoverride and broken/held package
facts remain truthful observations. Config basenames `[A-Za-z0-9_-]+` select at
most 32 bounded regular files; ignored entries contribute metadata only. Complete
bounded listings are repeated after an explicit directory-offset rewind. All
retained bytes, full metadata, descriptor/path bindings and absences are checked
again before success, including a final metadata/absence pass after rereads.

Files export exactly six keys, directories four, entry records three, metadata
nine; snapshot has the frozen nine keys and packet the distinct seven keys.
Host validation rederives handlers, selected-package keys/relationships, control
namespace and exact file set, accepted config set and complete listing/file
presence/metadata relationships. Original status bytes are intentionally absent;
its original-byte hash/count attestations cannot be replayed from selected
fields alone. This is an observation codec, never install admission.

Bounds remain 128 captured files, 64 retained/listed directories, 256 retained
FDs, 2MiB raw exported bytes, 2MiB canonical snapshot, 60000-byte packet and quoted
source argument; unchanged later transport cap 65536. Each cap may independently
refuse. Strict base64, duplicate-key/nonfinite/nonnative-integer rejection,
canonical packet/snapshot JSON, exact SHA/length, bounded complete zlib EOF with
no trailer/second stream, and exit0-observed/exit3-unavailable mapping are checked.
Old build-facts/native domains are distinct. No exception/path text or stderr is
emitted by the guest.

Closed unavailable reasons: `identity`, `os`, `package-lock`, `packages`,
`package-state`, `routing`, `configuration`, `handlers`, `custody`, `bounds`,
`deadline`, `output`. No fine-reason extension was needed. OS exceptions map to
the actual phase; explicit custody/bound/cancellation guards retain their family.
`none` is reserved for an observed packet, not an unavailable reason.

## Synthetic validation and behavioral controls

All new fixtures are public synthetic content under freshly owned private
roots. Injected identity/syscall adapters map the guest root to those roots;
default guest System is never invoked on the host. Source/bootstrap compilation
uses `__name__ = test_definitions`; controls are bytes, never interpreters.
No new test child is needed. Kernel POSIX shared-lock lifetime/contention is
tested against OFD write locks on independently retained private fixture FDs;
probe FDs remain open until collection has closed all locks, avoiding an
accidental same-process POSIX-lock release. Independent fixture ownership cleans
FDs left uncertain by injected pre-close errors, and verifies reused unrelated
FDs survive. Signal handlers/timers/masks are restored. Existing full-suite child
fixtures retain their unchanged FixtureGuard/pidfd/reap/ECHILD controls.

Coverage includes inert import/module execution, target tampering/source size,
status whitespace/case/duplicates/continuations/large discarded values/partial
states/holds/pending/original hash, exact registry grammar/options/qualifiers/
duplicates/prefix/ancestor/merged-/usr distinctions, config accepted/ignored and
nonempty policy facts, namespace/presence/absence, deterministic codec/domain and
host relationship mutations, integer/file/directory/count/expansion/source/output
caps, all three real locks, late creation/replacement/content/entry/stat mutation,
short reads/EOF/rewinds, every open handoff and close position, cancellation,
all four handled signals, a real short hard alarm, close error and FD reuse.

Six in-memory guest mutations expose omitted locks, verification, original hash,
qualified namespace, required Unincorp and File-handler selection. They produce
the specific wrong behavior under otherwise valid fixtures, without on-disk
source mutation or historical artifact changes. Independent host controls reject
forged selected identities and routing/namespace/listing/body relationships.
Initial bring-up exposed fixture mode defaults and an unrealistic exception
inside the syscall-return adapter; fixtures were corrected to explicit protected
modes and actual pending signals at open handoffs. Final controls must have no
fixture errors or unrelated-guard reds; executed results follow below.

## Acceptance and remaining coordinator work

| Gate | Contribution and unchanged limit |
| --- | --- |
| F0-01 dependency | Accepted dependency and criterion evidence read; unchanged. |
| F1-02-AC01 / AC02 | Historical renderer security and resident-instance evidence unchanged. This increment adds observation/codec security fixtures, not product/desktop acceptance. |
| F1-02-PRIVACY | New fixture data is synthetic/public; future captured bodies remain private. No actual status/handler/config capture is committed or read here. Historical passed state unchanged. |
| F1-02-UI/native/full task | Still pending/in-progress. No UI changes, screenshots or native acceptance claimed. |
| All 97 tasks / full local 1.0 | Registry, dependencies, criteria, native/session/AT/recovery/release scope unchanged and incomplete. |

Independent two-axis review and the coordinator's separate closed host owner,
permit, reviewed source/dependency hashes, fixed transport and private artifact
custody integration remain prerequisites to any actual capture. This lane grants
none of them. Full helper/runtime/NSS/ldconfig/manpath/sourced-code closure,
recursive activations, diversion effects, independent writer exclusion, capacity,
actual package install/locale/provision/build/receipt/containment/native desktop/
AT/recovery/release remain unproved. Actual prior guest facts/cleanup and the
historical unknown timeout-descendant absence are inherited without new probing
or stronger claims. No shared contract change was necessary.

## Executed results

Platform: Linux amd64 workspace; pinned PATH prefix
`/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools`, Node **24.22.1**, Bun
**1.4.4**, Python **3.10.12**. No host OS/package metadata was probed; this is not
Debian desktop execution. Missing JS dependencies were prepared with exactly
`bun install --frozen-lockfile --backend=copyfile --ignore-scripts`; no lifecycle,
SQLite rebuild, Electron override or addon/runtime loading was requested. Bun
reported 805 installed packages; tracked manifests/lockfiles remain byte-identical.

| Executed command/check | Result |
| --- | --- |
| `python3 -B -m unittest discover -s apps/desktop/tests/at -p test_install_metadata.py` | **50 passed**, 4.262s, no errors/failures/skips. |
| `python3 -B` with the existing wrapper's exact automatic `test_*.py` discovery/completion predicate | **452 passed**, 13.274s, complete true, nativeRun false, no skips/expected failures; see [discovery output](python-discovery.txt). Earlier 451-case checkpoint passed 13.717s before adding the two-variant host mutation method. |
| `bun run test:security -- F1-02` | **55 mapped checks passed**, total15.05s; Python wrapper13944ms under unchanged18000ms cap, with current452-case automatic discovery. Final output in [mapped output](mapped-security.txt). |
| `bun run typecheck` | Passed, no diagnostics. |
| `bun run lint` | Passed, zero warnings. |
| `python3 scripts/validate_plan.py` | Passed: 279 sources, 57 features, 97 tasks, 135 Markdown files, 7 SVG assets. Local integrity only. |
| AST/compile inspection | Both new Python files and fixed guest definitions compile; no owner import, subprocess/socket/ctypes/request dependency in the new source; import/module-execution I/O guard passes. |
| Frozen/source hashes | [Bindings](source-sha256.json): eight shared inputs match exact prepared-base Git blobs; new source/test hashes recorded. Frozen target file and expanded-list hashes/counts unchanged. |
| Whitespace/scope | Passed staged whitespace and exact six-added-file scope checks; recorded hashes match and eight shared inputs match exact base; no existing tracked edits. |

Fixed guest source: **48778 bytes**, **48812 quoted argument bytes**, SHA256
`db709aca20e72f58507500f6e6277d0b9564717f992fd69fb8ccaaf22c5edae2`.
Reviewable expanded fixed program is 61250 bytes; its executable bootstrap uses
bounded decompression and exact length/hash/EOF checks. Source bytes are returned
only, never dispatched. Host source/dependency hashing by the separate owner is
still required; this evidence hash file is not a permit or source pin.

Additional host mutations omit actual selected-identity and registry-derived
handler validation separately. Current host rejects each forged snapshot while
the specific mutated host accepts it, with all other guards intact. Combined
with six guest mutations, eight bounded in-memory variants establish behavioral
sensitivity without changing original source/artifacts. No historical snapshot
capture, tests, assertions or timeout were rewritten.

Configured signing was attempted once with `timeout 25s git commit`; it failed
immediately with `1Password: Could not connect to socket. Is the agent running?`
and `fatal: failed to write commit object`. HEAD stayed at the exact prepared
base. The user-authorized per-command `git -c commit.gpgsign=false` fallback is
used for the one additive commit. Its signature header is honestly absent; no
persistent Git signing setting is changed and no publication is performed.
