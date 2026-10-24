# S0-03 device-free denial path: review proposal

Status: proposal only, awaiting coordinator API review. No runtime implementation,
new observation, input access or acceptance completion is included.

## Contract and remaining acceptance

This increment connects the approved kernel-peer context adapter to the same
decision code called by the experimental supervisor, without adding an input
grant. The existing monitor has no authenticated companion and always reports
`canArm=false`. A fresh root logind `LockedHint=false` cannot supply unlocked
proof. No report is converted into an eligible `safety::Context`.

The governing requirements are [S0-03 AC01/AC02](../../docs/implementation/tasks/S0-03.md#acceptance),
[privileged input lifecycle](../../docs/architecture/linux-integration.md#privilege-separation-and-device-lifetime),
[input security gate](../../docs/architecture/security.md#privileged-input-security-gate)
and [testing/release](../../docs/implementation/testing-release.md). In particular,
the supervisor must not delay its 500ms worker watchdog with a context query;
unknown, stale, dead, disconnected or changed context must revoke eligibility.
AC01/AC02 remain pending: neither this source increment nor prior SSH/PTY
observations prove supervisor enforcement on real devices, actual locked/inactive
graphical transitions, physical held-key recovery or compositor modifier state.
The full physical and release gates are preserved.

## Small shared decision API

Add `src/decision.rs`, using the existing `Guard`, `Context`, `Operation` and
lease constants. Move the supervisor's request eligibility/Arm/Renew decisions
and its armed/arming context check into this module. It returns fixed control
outcomes and effects; the supervisor alone translates an effect into existing
worker IPC. The device-free driver calls this exact function, never a copied
implementation. It has no worker descriptor, device import or worker launcher.

Proposed shape (names are internal engineering API, not a frozen product contract):

```text
DecisionState::synthetic_lab(trusted_uid) -> DecisionState
DecisionState::live_denial(trusted_uid, server_connection_generation) -> DecisionState
DecisionState::ingest_parent_observation(validated_observation, now) -> Result
DecisionState::request(operation, request_generation, handshake_state,
                       trusted_fixture_context, worker_ready, now) -> Outcome
DecisionState::check_running(trusted_fixture_context, now) -> RunningCheck
DecisionState::invalidate(fixed_reason) -> void
```

`Outcome` contains the existing fixed reply state/reason and an effect such as
`None`, `Arm`, `Renew`, or `Disarm`. No new effect or wire field permits input.
Only the explicit legacy synthetic constructor may generate Arm/Renew effects,
using the existing fixture eligibility, generation, lease and terminal rules.
The live constructor has a mandatory veto from creation; even a fresh observation
with an otherwise eligible trusted fixture cannot remove it. Its observation
format contains a denial reason, never `Allow`, `Permit`, unlocked or consented.

An Arm/Renew attempt with a live veto terminally disarms that connection;
running/arming checks do the same. Observation updates can refine diagnostics,
but cannot clear terminal state, renew a lease or revive a connection. Unit
tests must also start with an already armed Guard through a private test-only
seam and prove the running check emits Disarm. No production API can transplant
an armed synthetic state into live mode.

The client wire remains unchanged: no client PID, UID, session, helper endpoint,
mode, live epoch or claimed observation. `request.generation` remains the existing
context generation and is not an authentication or server connection identifier.
The accepted connection gets a separate monotonically increasing, nonzero
server-owned generation; overflow fails closed. A new same-UID connection never
inherits the previous state or its helper. No client or root fixture message can
switch a constructed live state into synthetic mode.

`supervisor --synthetic-lab` will explicitly construct the synthetic policy and
call the shared decision functions. Its manufactured-device/root-lab/no-graphical
guards and recovery cases remain unchanged. This does **not** make that entry
point a live-enforced input service. The new device-free driver constructs the
live policy. A later separately reviewed input entry point would consume that
same live policy and helper; this patch must not claim that integration exists.

## Parent-owned helper and IPC

Add `src/denial_observer.rs` and a dedicated internal helper executable. The
parent owns a nonblocking, CLOEXEC `SOCK_SEQPACKET` pair and its direct unreaped
helper child. Bootstrap transfers exactly one duplicated **server-accepted**
AF_UNIX stream plus trusted expected UID and server connection generation over
that private channel. This is parent-to-helper SCM_RIGHTS; client-supplied rights
are never accepted. The parent retains the sole protocol reader, while
`PeerMonitor::bind_connected` only inspects the metadata duplicate. It still
derives SO_PEERCRED/SO_PEERPIDFD itself; no bare-PID authorization fallback.

The helper verifies its expected parent and private bootstrap credentials. Its
expected UID must equal its real UID. For a later root supervisor launcher,
that UID comes only from the existing trusted root bootstrap, with empty
supplementary groups, GID/UID drop and verified empty capabilities before any
libsystemd call. The device-free driver runs entirely as its ordinary real UID.
The helper is not the input worker and has no input-device capabilities.

Fixed helper invocation, no caller-selected path/principal/bus; FD3 is the sole
inherited engineering channel. The trusted launcher uses an exact verified sibling
binary, `env_clear()`, null stdin/stdout, fixed bounded diagnostics, CLOEXEC and
an explicit descriptor allowlist. Before observation the child closes everything
except its private channel, metadata socket and diagnostic descriptor. In
particular it never inherits a lab, worker, listener or evdev/uinput descriptor.
No-core, no-new-privileges and parent-death/race checks are mandatory. The
existing strict empty-environment check precedes library/dlsym/query work.

Private packets have `deny_unknown_fields`, at most 1024 bytes, no ancillary FDs
after bootstrap and no arbitrary strings. A sample contains only version,
parent-issued connection generation, request sequence, native epoch, monotonic
observation/query timing, and one fixed nonempty veto reason derived from the
approved Report. No private IDs or affirmative eligibility fields are needed.
Unsupported capability is a fixed veto, not a fallback or successful sample.

Parent sends one fixed Sample request at a time; helper returns at most one
response, with no queue or replay. The parent does not issue another request
until the previous response has been consumed, and samples no faster than
250ms. Each request has a 300ms parent deadline (250ms query bound plus 50ms
observation scheduling budget); exceeding it terminally vetoes and kills the
owned helper. The safety loop polls at most one bounded packet without waiting
or doing a bus call. Sequence/connection mismatch, malformed packet, extra FDs,
unexpected epoch regression, future/overage timestamps, query duration above
250ms, channel failure or child death terminally veto. An epoch change revokes
the connection; a later old or new sample cannot revive it. Freshness is at
most the existing 1000ms context limit and cannot extend the app lease.

Helper startup/query work stays outside the supervisor watchdog loop; process
spawn and bootstrap must likewise occur before entering that loop or in a
separately bounded launcher state. The proposed patch does not add a helper spawn
inside the existing running worker loop. Killing uses only the owned unreaped
child's operational handle; nonblocking liveness checks and deferred reaping
avoid waiting in the worker watchdog loop. This engineering helper has a fixed
6s hard lifetime; the device-free driver has an independent 7s guard and bounded
cleanup. Extending it into a persistent service is a separate design change.

## Device-free driver and tests

Propose coordinator registration of:

```text
linuxcast-input-spike-denial-probe  src/bin/denial-probe.rs
linuxcast-input-spike-denial-helper src/bin/denial-helper.rs
denial-private (harness=false)      tests/denial-private.rs
```

No additional dependencies. Owned files would be `src/decision.rs`,
`src/denial_observer.rs`, the two binaries, private test, `src/lib.rs`, the small
supervisor call-site refactor, README and safe evidence. No worker, C device
boundary, synthetic-lab, kernel recovery test, shared manifest or registry edit.

The fixed driver owns a private 0700 generated directory and 0600 listener, and
its own post-fork connector. It removes pathnames before observation, retains
kernel-bound peer lifetime, and feeds parent-validated helper samples into the
shared decision state. Its otherwise eligible trusted fixture is clearly
labelled synthetic and cannot override a live veto. It attempts the existing
Handshake/Arm/Renew operations and records only fixed denial/effect booleans,
safe timing and cleanup state. No device FD is available and no worker is
spawned or contacted. A request may be authenticated while an Arm remains
denied; any handshake semantic change must be explicit and preserve legacy
synthetic tests. Public output contains no PID/UID/session, endpoint, raw error
or protocol payload. Invocation/environment/privacy, process and pathname
cleanup retain the reviewed peer wrapper's boundaries, including the explicit
early uncatchable-SIGKILL empty-directory/socket limitation.

Before any live observation, no-device regressions must prove:

1. Legacy synthetic eligible Arm/Renew still produce their existing effects;
   expiry, emergency and recovery source behavior is not silently disabled.
2. The same otherwise eligible fixture plus an actual post-fork accepted peer
   and approved PeerMonitor negative result produces no Arm/Renew effect.
   Private mocked sd-bus/session replies are labelled fixture proof, not live
   logind proof; real kernel credentials/pidfd transport remains exercised.
3. Missing/stale/dead/retained-descendant peer, mid-query death, invalid epoch,
   new same-UID peer, malformed/oversized/trailing data/rights, timeout,
   helper exit and channel disconnect terminally veto without revival.
4. Real helper stall leaves simulated worker-heartbeat/watchdog scheduling
   responsive; fake clock tests cover exact boundary semantics separately.
5. Shared running check revokes a pre-armed test state; worker-send interception
   fails immediately if the live path tries Arm/Renew. A device-free driver
   also proves no worker launch or descriptor bootstrap occurs.
6. Empty environment, empty capabilities/descriptor allowlist, fixed invocation,
   no-core, privacy canaries, cancellation/parent death/7s deadline and descendant
   cleanup are checked with no live bus query or input operation.

After source freeze, independent review and pinned Rust/clippy/fmt checks,
separate coordinator authorization would be required for an actual read-only
SSH/PTY negative observation. It would establish the same decision path denies
using live metadata; it would still not complete AC02 locked/inactive graphical
or actual input enforcement, and would establish no AC01 physical recovery.
