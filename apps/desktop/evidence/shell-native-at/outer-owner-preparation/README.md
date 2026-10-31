# F1-02 outer owner: offline preparation, independent review required

This continuation corrects normal shutdown and independently owns its Python
test fixtures. It remains offline preparation only. The real owner CLI
was never invoked. Docker/image/container inspection, start, stop, kill and exec,
SSH, private-key reads, guest/native/product/controller/observer/Orca execution,
display/bus/device actions, builds, provisioning and lab-directory mutations were
not performed. Native runs in this assignment: **0**, because no native route
was invoked. The owner's runtime result deliberately has **no native-run count**:
uncertain dispatch must never become a claimed zero. All acceptance stays pending.

Checkout: `/home/ian/.t3/worktrees/linuxcast/t3-4b110c33`.
Branch: `codex/f1-02-outer-lab-owner` (renamed from T3's supplied branch).
Exact continuation base: `43a811e29f97ab5846416a678927015dfccebf34`, tree
`5fc4cd9f5ad94cbf21997e9ccf40211474617fbe`. Original prepared base:
`7abb8459f3af028328246d2304a3d85508ed1533`, tree
`ee863d72bffd42c5339f034b52fe1f58a247e92e`. No parent commit was imported/merged.
Only the same two Python files and three files in this evidence directory are owned.
Final commit/tree and actual signing outcome are handed back separately: embedding
the identity of this entire tree in its own contents would be self-referential.
No push, PR, watch, publication, shared routing, contract or task-status change.

For initial43a, configured signing through `/opt/1Password/op-ssh-sign` timed out at
30s (exit124), creating no commit. The explicitly authorized per-command
`git -c commit.gpgsign=false` fallback is used for this preparation. No Git
configuration writes were issued; commit.gpgsign=true, gpg.format=ssh and the
configured signer program remain their original values. A broader complete Git
configuration fingerprint changed during the session for an unattributed reason;
this worker did not revert shared configuration or claim that fingerprint stayed
unchanged. The continuation's bounded signing outcome and final IDs are recorded
in checks and the handoff. Signed release/tag rules remain unchanged.

For this continuation, normal configured signing likewise timed out at30s,
exit124, without creating a commit. The authorized per-command unsigned fallback
is used. The complete Git configuration fingerprint before/after this attempt is
unchanged, as are the three original signing settings; no configuration writes or
release-rule changes were made.

The authoritative updated contract was read directly with
`git show 745bf7f941d0db0255ab91301c5b730097b3f142:apps/desktop/tests/at/outer-owner-protocol.md`.
Its SHA256 is `3ce7f3293602b5539acd12dbad8db5f9ff6134e3e03cdf13d274ee09c174e18a`.
It supersedes the [older local copy](../../../tests/at/outer-owner-protocol.md),
which is deliberately unchanged in this lane. The [inventory](../../../tests/at/outer-owner-inventory.json)
also remains unchanged. No parent contract or source was copied/imported or
weakened. Inventory SHA256 remains pinned in the owner:
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
grace. Within45s, graceful shutdown receives at most11s, shrinking further to
reserve28s for fallback/inspection/reaping. Cleanup inspections are capped at3s,
poweroff transport5s, Docker stop10s (its grace remains8s), kill3s and local
reaping3s. All share the original cleanup deadline. General command clients
retain12s limits, readiness clients8s, combined stdout/stderr
65536bytes, protocol replies4096bytes, retained marker4096bytes and16 journaled
direct identities. Children are retained before fallible bookkeeping; pidfds,
bounded kill/wait and dedicated Linux subreaper adoption establish local absence.
Only the owner's children are inspected through proc; no unrelated host scan.

The first read-only container inspection precedes marker creation and must find
the exact stopped/exited, running=false, PID0, exit0 baseline. A foreign running
container with no valid interrupted lease is refused. There is at most one start
and one dispatch; readiness alone may retry within its original startup deadline.
Shutdown freshly inspects identity/configuration. An already stopped guest
receives no guest or Docker effect. An owned running guest receives the fixed
`/usr/bin/systemctl poweroff --no-block` through the same verified account and
fixed sudo policy. This action rechecks durable may-have-started intent and fresh
pinned identity. A bounded fresh-state poll follows; it does not replay poweroff,
the native wrapper or product input. Only exit0/PID0/running=false plus host-child
absence proves clean shutdown.

An empty acknowledgement is not proof. Two exact fixed255 disconnect messages
are treated only as an uncertain request, requiring the same baseline/absence
proof. Auth/sudo denial, extra/unknown output, failed probes and timeouts stay
failures even if a later inspection finds exit0. Real SSH wording/authority is
unverified; unknown wording fails closed. Only poweroff privately captures bounded
stderr for this classification; the combined65536-byte cap still applies and no
diagnostics enter public output.

If graceful shutdown cannot prove the baseline, fallback freshly checks identity,
stops only the pinned ID, re-inspects, kills only that ID if still running, and
re-inspects even after a failed/unknown kill reply. A forced or nonzero exit remains
a failure even if termination is known; no143-to0 normalization or fallback
success promotion occurs. Results distinguish
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
of guest account/runtime/transport prerequisites, including authority for this
exact poweroff under the updated contract. The reviewed owner hash must bind
this correction; an older permit's narrower decision is insufficient. No current
real permit is supplied or observed here. Duplicate/unknown keys, unsafe
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
code is imported by these probes. The native job remains only the installed Python
wrapper with its two reviewed flags. Fixed poweroff is a separate cleanup-only
action after fresh identity/marker checks, with no CLI action/override. The
wrapper's own immutable receipt, approved
tree, account, namespace, PID1 and controller/native checks remain unchanged.
Provisioning must authorize the exact read probes, wrapper and fixed poweroff;
actual SSH/account/sudo/runtime availability has not been measured here.

## Executed validation and failures

Python3.10.12; Pop!_OS22.04 LTS, Linux x86_64,
kernel7.1.1-76070101-generic. Standard library only; no dependency installation.
[checks.json](checks.json) records commands/counts and [sha256.json](sha256.json)
binds the current two sources and this evidence. The final owned suite passes
82 tests in4.086s (59 existing +23 added). Complete offline AT discovery passes
196 tests (114 non-owned base +82 owned), no skips, in16.181s. The exact existing
Node wrapper's Python payload passed with its18s subprocess deadline:
complete=true/executed=196/nativeRun=false,16.294s wall time. No timeout increase,
skip, dependency install or weakening was used. The parent reports120 base cases;
these were not imported, so its merged count will differ. Python AST/syntax checks
pass; nine current hashes across three inherited
manifests match, and all43 existing AT/evidence files match the prepared base
byte-for-byte. Plan and staged whitespace checks are recorded separately.

Docker/SSH behavior is entirely injected simulation. Ordinary Python fixtures
actually test caller/guardian loss before/after start and dispatch, exact direct
and detached-descendant reaping, post-spawn and post-fork bookkeeping faults,
pidfd allocation failure, independent guardian/caller deadlines, output overflow,
reservation custody and original failure retention. Timers are shortened inside
private Python fixtures only; production limits have no CLI overrides. A separate
fixture guard now uses its own libc subreaper, pidfds, direct/adopted-child proc
reads and ECHILD loop. It never delegates cleanup/discovery to the implementation
under test. PID, pidfd and start identity are retained before gate release and
fallible bookkeeping. Every outcome enters bounded independent kill/reap cleanup.
Its7s operation and2s hard cleanup bounds use private output files with a per-worker
64KiB file-size ceiling, not stdout pipes held open by lost descendants.

Forced-fault regressions patch owner.Children.reap and owner.own_children to
falsely report success in both supervisor and worker. Detached ordinary Python
descendants still have independently verified absence, including when the broken
worker hangs. A post-fork bookkeeping failure never opens the start gate and is
also reaped. Every successful ordinary fixture includes the independent kernel
absence assertion. These observations apply only to the new supervised fixtures.

Initial red probes exposed the inherited signal-mask alarm bug and read-only
preflight's missing pre-marker journal case; both have permanent regressions.
Two early alarm probes, before the fixture supervisor was added, timed out at12s.
Their discarded fixture parents did not retain a final descendant-absence
attestation. That historical absence remains **unverified**; no unrelated-process
scan or broad name-based cleanup was attempted. Subsequent successful supervised
fixtures establish current behavior, not retroactive cleanup of those probes.
An early full172 run took22.139s with long synthetic timers; shortening only
fixture timers brought the final full run within the existing18s Python wrapper
budget. The Node/Vitest shell itself was not run: this worktree has no node_modules.
The identical Python payload and18s deadline were exercised directly as above.
No dependency installation or product build was performed.

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

The parent reports initial-file integration with approvedPR96 at
`1e8623079f7cd46f36a98670f12c193a5a0857ec`; this branch continues only from43a.
Its read-only pinned-image entrypoint copy has SHA256
`a15ac9589c04baf9da95b08e0e79b5cf1d75ab8dc64e06a5e68e4ceb0ad7c8ea`
and ends in exec of the configured GNU timeout/QEMU command. Its ordinary host
timeout+sleep/TERM probe returned-15 (container-style143), with probe children
reaped. This motivates graceful poweroff; it is not actual v4 shutdown proof.
Neither entrypoint inspection nor probe was rerun here. The parent's verification
of152 locked public Cargo cache crates/offline metadata and Electron45 upstream
header checksums is inherited preparation, not a worker build or changed pin.

For the two historical early timeouts, the parent reports a read-only scan for
the exact known deadline invocation:0 readable live matches,3 unreadable same-UID
candidates, no signals. This is not absence/reaping proof and does not resolve
the historical limitation. No broad historical cleanup was attempted.

Coordinator proposals: independently review this exact owner/test tree before
invocation; verify fixed transport/daemon/account/sudo/read-probe/poweroff authority;
prepare real immutable guest receipt/Node/wrapper pins and the explicit permit;
resolve old wrapper approved-tree rejection, ENTRY versus COMBO_BOX and nonroot
PID1 metadata feasibility through separately reviewed changes. No such shared
change, permit, build or provisioning is supplied here. Existing discovery already
finds the new Python tests; the parent owns mapped validation/routing. The existing
18s bound is retained. Leave historical manifests/captures and contracts unchanged.
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
