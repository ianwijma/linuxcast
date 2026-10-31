# F1-02 outer Debian lab owner — coordinator contract

This is host-side test infrastructure for the existing reserved v4 lab, never a
production service or general Docker/SSH runner. Implementation and independent
review precede invocation. No native, guest, container-start, namespace, display,
input or audio action is authorized merely by this document existing. Complete
F1-02/native/full97-task/local1.0 acceptance remains pending.

Read the current controller-protocol.md, lab-wrapper-preparation/README.md and
source-build-preparation/README.md. This contract fills their outer reservation,
shutdown, cancellation and recovery ownership requirement. It does not weaken
any guest wrapper, native identity, staging, permit or source-pin check.

## Fixed scope and inputs

The host lab root is the existing private canonical directory
`/home/ian/Projects/ianwijma/linuxcast/.worktrees/private-lab`, owned by the
invoking nonroot UID, mode0700. Reuse `f102-coordinator.lock`: exclusive advisory
lock on its retained regular no-follow single-link owned descriptor. Existing
mode0664 is acceptable only under that exact private0700 parent; do not chmod,
replace, unlink or recreate this shared lock. Verify parent/leaf identity and
path bindings before publication/release. Same-UID malicious host code and a
compromised Docker daemon are outside this test infrastructure trust guarantee.

Docker is exactly `/usr/bin/docker`; container identity is
`674cd884c30e07cdaa12e8d238209adbb1af03fb18e92ea9fa80586d0c7f5098`, name
`linuxcast-native-lab-v4`, image
`sha256:a1805464d68589e26be87a26cf7f8577a0b0dc494c88b1d14cb9cf7f155c4d10`.
Require nonprivileged, read-only container root, cap-drop ALL, no-new-privileges,
no published host ports/devices, and only the exact lab-root read-write bind at
`/lab`. Never create/replace/remove a container or image, alter its configuration,
mount another directory, change host settings or stop any other container.
The sibling `outer-owner-inventory.json` records fresh read-only facts. Its
Config/HostConfig/Mounts digests use SHA256 of JSON with sorted keys, compact
separators and ensure_ascii=true; validate against those exact pinned objects,
including the explicit security assertions above. This inventory is not a permit.
Configuration validation must cover the effective command/entrypoint, user,
network and resource assumptions needed by the implementation; fail on unknown
identity/configuration rather than inventing matching values. The coordinator
supplies reviewed inventory facts; missing facts prevent invocation.

An explicit private read-only owner permit, `f102-owner-permit.json`, must bind
exact container/image/lab identity, reviewed owner source SHA256 and the independently
retained source tree/archive/receipt/Node/guest-wrapper SHA256s. Reject duplicate
keys, unknown keys, unsafe paths, bad bounds, symlinks, replacement, or mutable
permit files. The permit records a trusted coordinator decision; its existence
is not independent review or kernel containment proof. Do not create a permit,
read private SSH key contents, log secret material or synthesize guest provenance.

## Execution and process ownership

Expose one fixed native-wrapper job, with no caller command, shell text, path,
container, identity, timeout or arbitrary Docker/SSH overrides. Its eventual
transport is the existing container-local SSH connection to the guest using only
`/lab/guest-key` and `/lab/known_hosts`, BatchMode/IdentitiesOnly/strict host-key
checking, no agent or forwarding. The only effectful guest command is the fixed
installed `/usr/bin/python3 -I -B /usr/local/libexec/linuxcast-f102-lab/lab_namespace.py`
with its two existing reviewed flags, via fixed noninteractive sudo if required
by the verified guest account. Guest transport/account/executable availability
are prerequisites, not assumptions proven by this contract. Do not add a remote
shell script, install/build/provisioning command or generic execution endpoint.
A fixed non-effectful readiness probe may run within a bounded startup deadline;
never retry the guest wrapper/controller or a failed product input.

Before start, acquire the exclusive reservation, validate pinned configuration
and freshly require stopped/exited, running=false, PID0 and exit0. A preexisting
running guest without a valid owned interrupted lease is foreign: refuse it.
Create/fsync a new bounded private ownership marker before any start may occur.
Retain marker identity and state for conservative recovery. At most one start
and one native-wrapper dispatch per reservation; record may-have-started and
may-have-dispatched before fallible post-launch bookkeeping. Unknown replies
never justify replay or a successful zero-attempt claim.

Use an independent retained guardian and caller lifetime channel, with a start
gate and retained exact process identities. The guardian keeps the reservation
through cleanup even if the initiating process dies/SIGKILLs. Caller cancellation,
lifetime EOF, job failure, child/guardian loss, deadline and ordinary completion
all converge on bounded cleanup. An initiating process that observes guardian
loss must also attempt the same identity-bound stop and preserve dirty custody.
Every owned local command/transport child is retained, terminated and reaped;
process-name sweeps are forbidden. No ambient credentials, session buses,
displays, input/audio devices or provider endpoints enter child environments.

Use fixed, independently bounded phases: startup/readiness at most120s, one
wrapper transport at most360s (the wrapper has its own300s limit), and outer
cleanup at most45s. The total owner execution budget is600s with an independent
hard bound; cleanup still has its separate bound. No automatic extension, retry
of the wrapper, quota increase or fallback backend. Commands/output parsing have
bounded bytes and wait/reap deadlines; command timeout must not orphan a retained
local Docker/SSH client. Importing the module is inert.

## Cleanup and interruption recovery

After success or any may-have-started failure, stop only the pinned container
with bounded grace, then identity-check and kill only that same container if
needed. Freshly inspect both identity/configuration and stopped/exited,
running=false, PID0, exit0 before claiming clean shutdown. A forced/nonzero exit
is a recorded failure even if subsequent absence is known; preserve first failure
and report termination/absence separately. Reap all retained host children and
confirm descendant absence before deleting owned marker files or releasing a
clean reservation. Unknown Docker state, local child absence, marker custody,
inspection, unlink or fsync failure is incomplete cleanup, never success.

Keep a durable dirty marker until both host-child absence and exact stopped
baseline are proved. Bind replacement/deletion to retained filesystem identities;
never remove another session's same-UID replacement. Do not delete guest disks,
source archives, staging, receipts, keys, logs, historical results or arbitrary
lab paths. A later owner encountering an interrupted valid owned marker must
recover by stopping/verifying the same pinned container before admitting new work;
it cannot infer cleanup from a stale file or dead PID. An unknown/foreign marker
requires explicit coordinator recovery and refuses a new run.

No process can execute finalizers after its own SIGKILL, host crash or power loss.
The live independent guardian handles initiating-process loss. If all owners/host
are lost, the persistent marker plus mandatory fresh recovery prevents the next
run from treating old work as clean; do not claim cleanup occurred during outage.
Missing recovery evidence remains outstanding. A mocked test does not prove a
real Docker/QEMU shutdown, namespace containment or AT execution.

## Output and offline verification

Publish one strict bounded result containing only fixed reason/status enums,
may-have-started/dispatched flags, transport-result validity, owned-child absence,
verified container stop, reservation cleanup and acceptance=pending. Keep first
operation failure separate from cleanup failure. Do not project raw SSH/Docker
stderr, guest logs/AT text, paths, PIDs, keys or private identities. Do not invent
nativeRuns from a wrapper transport; retain the controller's separately validated
run accounting and never convert unavailable evidence into zero execution.

Required offline regressions use injected adapters/private synthetic fixtures,
not real Docker/SSH/guest operations: lock contention and identity replacement;
foreign running container/configuration; permit/custody failures; signal/death
before/after start and dispatch; post-launch bookkeeping failure; guardian/caller
loss; bounded stop/kill/reap failures; first-failure retention; dirty-marker restart
recovery; same-UID marker replacement preservation; unknown state/output bounds;
and success only after fresh baseline plus child absence. At least one ordinary
Python-child fixture should establish actual guardian/caller-lifetime behavior
without any Docker/guest/display/native operation. Record test/platform/source
hashes and acceptance limitations. Actual integration/recovery proof remains a
separate coordinator-owned execution gate after independent review.
