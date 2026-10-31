# F1-02 outer owner: offline preparation, independent review required

This increment implements host lifecycle preparation only. The real owner CLI
was never invoked. Docker/image/container inspection, start, stop, kill and exec,
SSH, private-key reads, guest/native/product/controller/observer/Orca execution,
display/bus/device actions, builds, provisioning and lab-directory mutations were
not performed. Native runs in this assignment: **0**, because no native route
was invoked. The owner's runtime result deliberately has **no native-run count**:
uncertain dispatch must never become a claimed zero. All acceptance stays pending.

Checkout: `/home/ian/.t3/worktrees/linuxcast/t3-4b110c33`.
Branch: `codex/f1-02-outer-lab-owner` (renamed from T3's supplied branch).
Exact prepared base: `7abb8459f3af028328246d2304a3d85508ed1533`, tree
`ee863d72bffd42c5339f034b52fe1f58a247e92e`.
Only the two new Python files and this new three-file evidence directory are owned.
Final commit/tree and actual signing outcome are handed back separately: embedding
the identity of this entire tree in its own contents would be self-referential.
No push, PR, watch, publication, shared routing, contract or task-status change.

Normal configured SSH signing through `/opt/1Password/op-ssh-sign` timed out at
30s (exit124), creating no commit. The explicitly authorized per-command
`git -c commit.gpgsign=false` fallback is used for this preparation. No Git
configuration writes were issued; commit.gpgsign=true, gpg.format=ssh and the
configured signer program remain their original values. A broader complete Git
configuration fingerprint changed during the session for an unattributed reason;
this worker did not revert shared configuration or claim that fingerprint stayed
unchanged. Final handoff identifies the unsigned commit and exact tree. Signed
release/tag rules are unchanged.

Authority is the unchanged [outer-owner protocol](../../../tests/at/outer-owner-protocol.md)
and [inventory](../../../tests/at/outer-owner-inventory.json). Their frozen scope
is implemented without editing them. Inventory SHA256 is pinned in the owner:
`a7f1095d0ce26fd41f32a51b21b0743dde0a35c024b854c59d609f62ba032b3d`.
Config/HostConfig/Mounts digest calculation matches the protocol's sorted compact
ASCII JSON. Effective command/entrypoint, user, network, published ports, mounts,
device/security flags and resource-field types are checked as well.

## Implemented custody and lifecycle

Import is inert. The closed CLI admits exactly the three review acknowledgements
for owner, wrapper and controller. There are no runtime backend, command, path,
identity or timeout options and no environment-selected test backend. The Python
adapter seams used by tests are not execution options. Run only as a dedicated
single-threaded nonroot process; it owns its direct/adopted children exclusively.

The existing canonical private0700 lab root is opened and retained. The existing
owned single-link regular lock is opened no-follow and exclusively locked; mode
0600 or the coordinator's0664 is allowed only beneath that private0700 root.
Nothing chmods, creates, replaces or unlinks the shared lock. Parent/leaf identity,
mode, ownership and path bindings are rechecked. Fork shares the same locked open
file description: neither process explicitly unlocks it while the other lives.
Same-UID malicious host code and a compromised Docker daemon are outside this
test infrastructure guarantee. Detected replacements are preserved.

A new exclusive0600 marker is fsynced, along with its parent directory, before a
start is possible. It binds the reservation's root/lock identities, container,
image, permit digest and random lease. Start and dispatch intents become durable
before their commands; post-spawn PID/pidfd/journal failure cannot imply zero.
Marker bytes as well as inode binding are retained and checked. Interrupted or
partial writes may leave an unparseable dirty marker; they never authorize a new
run or arbitrary cleanup. Only the fixed owned marker is removed, after proof.

An independent forked guardian holds the reservation and a gated socket lifetime
channel. The caller retains its exact PID/pidfd before opening the start gate.
EOF catches initiating-process loss, including SIGKILL; ordinary cancellation,
job failure and deadlines converge on cleanup. A live caller observing guardian
loss terminates/reaps that exact guardian and adopted descendants, then attempts
the same identity-bound cleanup under its retained reservation. No process-name
sweep occurs. The guardian releases inherited blocked signals, and the hard alarm
remains deliverable during spawn bookkeeping.

Production limits are fixed: startup/readiness120s, single job360s, cleanup45s,
owner600s. The guardian operation alarm reserves45s from600; an independent caller
deadline bounds a noncooperative guardian. Caller fallback has one shared45s
budget for guardian termination/reaping and container cleanup, with a2s guardian
grace. Command clients have12s limits, readiness clients8s, combined stdout/stderr
65536bytes, protocol replies4096bytes, retained marker4096bytes and16 journaled
direct identities. Children are retained before fallible bookkeeping; pidfds,
bounded kill/wait and dedicated Linux subreaper adoption establish local absence.
Only the owner's children are inspected through proc; no unrelated host scan.

The first read-only container inspection precedes marker creation and must find
the exact stopped/exited, running=false, PID0, exit0 baseline. A foreign running
container with no valid interrupted lease is refused. There is at most one start
and one dispatch; readiness alone may retry within its original startup deadline.
Shutdown inspects identity/configuration, stops only the pinned ID, re-inspects,
kills only that ID if still running, and re-inspects again. A forced or nonzero
exit remains a failure even if termination is known. Results distinguish
termination, verified exit0 baseline, host-child absence and reservation cleanup.
Original operation failure is separate from cleanup failure; no raw output,
paths, PIDs, private identities, logs, speech, key or exception text is published.

A valid interrupted marker is recovered before new work. Recovery returns
`recovered`, never a new wrapper dispatch; release/reacquisition is required for
a new attempt. If all owners were lost while local child/descendant accounting
was uncertain, stopping the container does not prove host descendants absent.
That uncertainty persists across repeated recovery and requires explicit
coordinator resolution. A stale file/dead PID is insufficient. Foreign, changed
or malformed markers refuse work. SIGKILL, host outage and power loss cannot run
finalizers; this module does not claim otherwise.

## Coordinator prerequisites and fixed transport

The module never creates a permit. The future owned0400 no-follow single-link
`f102-owner-permit.json` must have **exactly** these keys:

`schema`, `containerId`, `imageId`, `labRoot`, `labDevice`, `labInode`,
`ownerSha256`, `sourceTree`, `archiveSha256`, `receiptSha256`, `nodeSha256`,
`guestWrapperSha256`, `guestAccount`, `guestPrivilege`, `guestPrerequisitesReviewed`.

Schema is integer1. Container/image/root and numeric filesystem identities must
match the retained reservation. Owner SHA256 binds independently reviewed source.
Source tree/archive are fixed to the approved BBBE snapshot below. Other digests
must be independently retained actual preparation facts, not guessed values.
Guest account has no default; privilege is exactly `root` (account root) or
`sudo-noninteractive`. The final boolean must record a real coordinator review
of guest account/runtime/transport prerequisites. Duplicate/unknown keys, unsafe
values, mutable files and changed bytes/bindings are rejected.

Docker is fixed to `/usr/bin/docker`, the local Unix daemon socket and a fixed
absent configuration directory; ambient contexts/credentials are not inherited.
The only exec transport is the pinned container's UID1000:1000 SSH client, using
only `/lab/guest-key` and `/lab/known_hosts`, strict host checking, BatchMode,
IdentitiesOnly, no agent/forwarding/proxy/local command and a closed environment.
The optional sudo prefix is fixed noninteractive sudo, never shell script text.

Readiness uses only fixed read-only guest commands: cat of
`/etc/linuxcast-f102-lab/permit.json`, then SHA256 of the installed wrapper.
The strict existing guest permit schema must match the host-retained tree,
archive, receipt, Node and wrapper pins. Missing or mismatched facts stop before
the wrapper. Installed wrapper digest is checked independently; no guest Python
code is imported by these probes. The effectful job is only the installed Python
wrapper with its two existing reviewed flags. Its own immutable receipt, approved
tree, account, namespace, PID1 and controller/native checks remain unchanged.
Provisioning must authorize these exact read probes as well as the fixed wrapper;
actual SSH/account/sudo/runtime availability has not been measured here.

## Executed validation and failures

Python3.10.12; Pop!_OS22.04 LTS, Linux x86_64,
kernel7.1.1-76070101-generic. Standard library only; no dependency installation.
[checks.json](checks.json) records commands/counts and [sha256.json](sha256.json)
binds the current two sources and this evidence. The final owned suite passes
59 tests in3.268s. Complete offline AT discovery passes173 tests, no skips, in
15.216s. Python AST/syntax checks pass; nine current hashes across three inherited
manifests match, and all43 existing AT/evidence files match the prepared base
byte-for-byte. Plan and staged whitespace checks are recorded separately.

Docker/SSH behavior is entirely injected simulation. Ordinary Python fixtures
actually test caller/guardian loss before/after start and dispatch, exact direct
and detached-descendant reaping, post-spawn and post-fork bookkeeping faults,
pidfd allocation failure, independent guardian/caller deadlines, output overflow,
reservation custody and original failure retention. Timers are shortened inside
private Python fixtures only; production limits have no CLI overrides. A separate
fixture subreaper bounds and reaps the entire synthetic subtree even if a tested
owner implementation fails.

Initial red probes exposed the inherited signal-mask alarm bug and read-only
preflight's missing pre-marker journal case; both have permanent regressions.
Two early alarm probes, before the fixture supervisor was added, timed out at12s.
Their discarded fixture parents did not retain a final descendant-absence
attestation. That historical absence remains **unverified**; no unrelated-process
scan or broad name-based cleanup was attempted. Subsequent successful supervised
fixtures establish current behavior, not retroactive cleanup of those probes.
An early full172 run took22.139s with long synthetic timers; shortening only
fixture timers brought the final full run within the existing18s Python wrapper
budget. The mapped Node/Vitest wrapper itself was not run: this worktree has no
node_modules, and no installation/build was authorized or needed for these files.

## Inherited evidence and handoff gates

The parent, not this worker, freshly observed exact v4 stoppedfalse/PID0/exit0 and
captured the read-only inventory. Approved product revision is
`bbbe8137105c0973e0f8a3a9ad8cca7e73a21937` (merged PR95), tree
`5a85d5251101716b338e820f23f78eef5e162dfb`. Its private archive is121180160bytes,
SHA256 `732f7bcc1aced64225ce13f4ee2ebaf848e623a5d3a3b631f1236d574a8436dc`.
The parent independently verified all2789 blobs/modes and removed its temporary
extraction. These are inherited source-custody facts, not a build receipt or
new worker observation. Signing/signer verification for that product archive is
not newly claimed.

Coordinator proposals: independently review this exact owner/test tree before
invocation; verify actual fixed transport/daemon/account/sudo/read-probe facts;
prepare real immutable guest receipt/Node/wrapper pins and the explicit permit;
resolve old wrapper approved-tree rejection, ENTRY versus COMBO_BOX and nonroot
PID1 metadata feasibility through separately reviewed changes. No such shared
change, permit, build or provisioning is supplied here. Existing discovery already
finds the new Python tests; the parent owns mapped validation and any routing or
timeout decision. Leave historical manifests/captures and contracts unchanged.
Real start, denial, cancellation, guardian/total-owner loss, conservative restart,
stop/kill, guest/container and local descendant cleanup still require actual
bounded integration evidence. The historical early synthetic absence gap above
also remains an explicit handoff limitation.

| Criterion | Contribution | Acceptance |
| --- | --- | --- |
| F1-02-AC01 | Fixed outer identity/configuration around unchanged secure product | Historical accepted evidence unchanged; no new runtime proof |
| F1-02-AC02 | Single-dispatch accounting, cancellation/recovery preparation | Historical singleton/deep-link evidence unchanged |
| F1-02-PRIVACY | Closed environment, bounded parsing and fixed redacted result | Historical status unchanged; real isolation/teardown pending |
| F1-02-UI | No product/UI/token change | Pending supported desktop/native AT evidence |

Applicable design references remain tokens, shell/navigation, states/motion,
accessibility and review gate; no new screenshots or UI claim. F0-01 is accepted,
but F1-02/native/UI/full task, four-session desktop matrix, physical input/audio,
audible delivery, packaging and all97-task complete local1.0 gates stay pending.
