# Read-only install metadata host-owner preparation

Implemented personally, without children, on prepared base
`0f82f960d5ce0fb438f4bd119957d8b3585b4ffd`; approved PR110 context
`1f8f954082f9ea803b1e066c7bfd49b1527bbe5a`. HEAD matched that base and the
isolated tree was initially clean. Branch renamed to
`codex/f1-02-install-metadata-owner`. This increment adds only the new host,
its new tests and this evidence directory. Commit, tree, signature-header and
final clean-state identities are reported in the handoff, avoiding a self hash.

The frozen [host protocol](../../../tests/at/install-metadata-owner-protocol.md)
was read in full before code. Also read AGENTS, PLAN, implementation GOAL,
F1-02 and F0-01 cards/registry dependencies and criteria, architecture security,
overview and stack, testing/release, the complete 614-line
[transaction research](../debian-install-transaction-research/README.md),
[collector protocol](../../../tests/at/install-metadata-protocol.md), frozen
[target JSON](../../../tests/at/install-metadata-targets.json), current base
owner, artifact owner, their custody/guardian/public validators, FixtureGuard,
fakes and signal/fault regression tests. Skill-library lookup returned no match.
No parent imports, merges, rebases, resets, pushes, PRs, watches, delegation or
registry/status changes occurred. The independent collector lane was not read,
polled, inspected, run or used as an API-discovery source.

## Implemented boundary

[lab_install_metadata_owner.py](../../../tests/at/lab_install_metadata_owner.py)
is a separate closed host actor, with only the two reviewed acknowledgement
flags. Import performs no source, collector, lab or process probe. It accepts
only the exact 17-key install-metadata permit and six independently checked
source hashes, including the unchanged imported artifact owner. The pinned
container/image, linuxcast account, noninteractive sudo, reservation/marker,
guardian, readiness, exact child ownership, caller-loss handling and poweroff
lifecycle remain the base implementation. No old domain is broadened and no
old module global is changed to accept install metadata.

The lazy adapter resolves only adjacent `install_metadata.py`, from bounded,
no-follow, nonblocking, regular/single-link protected-source reads. It checks
local function origins/types, the closed failures collection, source bytes,
UTF-8/quoted-size bound and all six permit hashes. Each admission, start,
dispatch, received-result validation and final artifact close rechecks source
bytes and identity; a cached module cannot hide replacement. Actual use also
requires protected source ancestors. Private source fixtures explicitly replace
that parent trust profile only for their own temporary directories.

**The actual collector is absent from this prepared base.** Missing or
incompatible source refuses fresh admission before marker/start/dispatch.
There is no alternate import, production stub, caller factory or simulated
successful collector. Valid interrupted recovery uses the retained source/profile
without requiring a collector and runs before fresh-artifact collision checks.
The adapter expects the clarified `source_bytes`, `decode_packet` tuple,
`validate_snapshot` and `FAILURES` API; the coordinator must verify the actual
adjacent implementation and its import assumptions during composition. No API
compatibility or real snapshot-schema composition proof is claimed here.

The artifact subclass reuses the reviewed C FileIO writer and unchanged
retained-root, binding, regular-mode, readback and marker-removal checks.
Its writer acquisition is retained before handled signals are restored. Readers
are owning FileIO objects with tiny acquisition/close sections covering SIGALRM
and cancellation; source readers close explicitly across acquisition interruption.
Byte collection is not signal-masked. C closed-state retirement prevents retry
of ambiguous closes and preserves unrelated descriptors reusing old numbers.
Exclusive creation, short writes, readback, file/root fsync, reopen, exact inode
and byte checks preserve partial/preexisting/replaced files. Nothing adopts,
rewrites or unlinks a failed artifact.

The host independently checks packet domain, exit, complete bounded zlib stream,
canonical snapshot bytes, digest, snapshot domain and counts, then invokes the
pinned codec's independent host schema validator. A single dictionary update
commits metadata, private identity and transport validity together. Guardian and
caller revalidate the snapshot and all summary relationships. Late source,
artifact, guardian or descriptor loss clears the claim and clean reservation,
preserving durable attempts and the first lifecycle operation failure. Public
output contains only the five frozen fields and bounded digest/count metadata;
cleanup describes lifecycle, not installation safety or rollback.

Limits are unchanged: startup120s, job30s, guest-source contract25s, owner600s,
cleanup45s; raw transport65536, packet60000, snapshot2097152 and relay/public4096
bytes. Count bounds are package1..4096, file1..128, directory1..64, handler0..32.
The existing automatic security wrapper retains its 18-second Python timeout.

## Executed validation

Platform: Linux `7.1.1-76070101-generic`, x86_64; pinned PATH
`/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH`;
Node24.22.1, Bun1.4.4, Python3.10.12. Dependencies were absent, so only
`bun install --frozen-lockfile --backend=copyfile --ignore-scripts` ran
(805 packages). No SQLite/Electron setup, lifecycle script, compilation, product
build, downloader/provenance probe or native runtime was executed.

- Focused new Python: **67 passed**, no failures/errors/skips (0.782s final
  focused run). Only private synthetic files, public fixture snapshots/codecs,
  fake Lab/transport adapters and ordinary Python child fixtures are used.
- Full automatically discovered Python: **469 passed** (402 existing +67 new),
  10.429s runner /10.541s including discovery; zero failures, errors, skips,
  expected failures or unexpected successes. This excludes the independent
  collector's future tests and says nothing about its composed full-suite time.
- Actual mapped `bun run test:security -- F1-02`: **55 passed**, six files;
  unchanged 18-second Python wrapper includes the new tests automatically.
  Final duration and wrapper time are recorded in `checks.json`.
- Full no-write typecheck/lint, two-file Python AST checks, plan validation,
  whitespace, bounded owned scope and recorded source/evidence hashes are
  recorded in `checks.json` and the manifests after execution.

The 67 new checks cover each permit field and six hashes; cross-domain refusal;
FIFO/no-follow/nonblocking preflight; absent/wrong-origin/incompatible/changed
and same-byte replaced sources; marker/capture binding, artifact collision and
recovery priority; durable intent and one flight; fixed readiness/SSH/sudo/job
arguments; independent wire, canonical digest/count validation; exact private
relay/public shapes, unavailable UUID binding; successful publication and caller
reopen; partial/short/zero/lying writes, read/file/root-fsync and ambiguous-close
faults; replacement and exclusive-create races; writer/source/reader entry,
close, cancellation/SIGALRM and unrelated-FD reuse; atomic pre/post-commit
interruption; first operation versus unknown cleanup; late custody/guardian and
final-close invalidation. Real external dispatch is patched to fail in the new
fixtures if accidentally reached.

Five independently supervised ordinary-process fixtures exercise actual base
fork/SEQPACKET guardian relay and caller checks, unavailable handling, partial
artifact cleanup, guardian final-close failure and caller final pidfd-close
failure. FixtureGuard retains exact pidfds and proves direct/adopted reaping and
ECHILD; no process-name scan, broad kill or foreign signal occurs. These are
ordinary host fixtures, not Docker/SSH or guest/native evidence.

Four actual new-host source copies are mutated privately: trailing-zlib-stream
check, unavailable capture binding, artifact readback, and source identity.
Each intended behavioral test produces exactly one assertion failure, zero
errors and zero skips; original sources remain unchanged and the full current
suite is green. These controls do not pass through missing fixtures or an
unrelated preflight failure. Early development fixture-mode and descriptor-hole
assumptions were corrected; acquisition alarms also exposed destructor
ResourceWarnings, corrected by explicit retained acquisition/close. Final
focused and full runs have no such warning output.

## Acceptance and remaining authority

| Criterion | Contribution and unchanged state |
| --- | --- |
| F0-01 | Accepted dependency and existing criteria read; no reacceptance or contract edit. |
| F1-02-AC01 | Historical passed renderer-hardening state unchanged. Current mapped security runs pass, but the new owner adds no renderer/native acceptance. |
| F1-02-AC02 | Historical passed resident/single-instance/deep-link state unchanged; this increment does not change product UI. |
| F1-02-PRIVACY | Historical passed state unchanged. New evidence contains synthetic public inputs and typed checks/hashes only; no private package/status/config/control bodies, exception text or artifact identity is public. |
| F1-02-UI/native/full task | UI pending and task in-progress. No screenshots or new product state, AT, session or supported Debian desktop acceptance. |
| All97/full local1.0 | Registry, dependencies, criteria and complete scope unchanged. No status promotion or MVP reduction. |

The base's prior actual captures, source reviews, lifecycle/cleanup observations,
platform and privacy evidence are inherited, not newly performed. Historical
uncertainty about older timeout descendants remains unchanged. This increment
creates no real permit, makes no actual capture and performs no lab/guest/root,
package, locale, service, namespace, compiler, build, input/device/audio,
provider, desktop or native operation. It does not access private lab/key,
user data, disks, logs, credentials or environment tokens.

Before any capture, the coordinator must compose the completed real collector
and host, verify every actual API/schema/source-custody relationship, run the
combined focused/full/mapped suites within unchanged limits, obtain independent
reviews of the complete sources and publication/FD boundaries, protect immutable
source ancestry and create a fresh distinct reviewed permit binding all six
actual hashes. Actual first-order metadata remains observation only: helper and
runtime custody, recursive trigger effects, diversions, writer exclusion,
installation/locale/provisioning, build/receipt, containment/native/AT/session/
recovery/release and the full Goal remain outstanding.

The normal configured-signing attempt was bounded to25s and failed immediately
with `1Password: Could not connect to socket. Is the agent running?`; Git wrote
no commit object. The explicitly authorized per-command
`git -c commit.gpgsign=false commit` fallback is used for this additive commit,
which is unsigned. No persistent Git/signing configuration or release-signing
policy changed.
