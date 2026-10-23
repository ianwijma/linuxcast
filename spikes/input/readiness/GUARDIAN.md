# Device-free readiness guardian — engineering source and check metadata

This S0-03 increment publishes the bounded guardian/readiness source and
synthetic or owned-process check metadata. F1-01 is integrated; AC01/AC02 remain
pending. There is no product UI, input enablement, permission/service change,
device-open/grab/uinput operation, worker arming or positive capture authority.
The applicable contracts are the S0-03 card, PLAN, security IPC/diagnostics and
privileged-input gate, Linux integration eligibility/lifetime requirements,
testing-release input gate and DESIGN Review gate.

The runtime and tests are byte-identical to the independently reviewed v4 unit
snapshot. Only these publication notes, README clarification and structured
check metadata were updated afterward. A separately authorized, independently
reviewed **private metadata observation completed while the source was
unsigned**; it retained all four denial booleans and the missing-companion
reason. Aggregate values, real rows, private evidence/controllers/capsules,
authentication material, identifiers, generated paths and raw logs are excluded
from this publication. That observation does not establish complete/error-free
hardware inspection, device absence, consent, capture readiness or acceptance.
The original source-unit snapshot remains immutable; its no-live-query scope
describes those unit checks, not an assertion that no later observation occurred.

## Runtime and trust boundary

`guardian.py` is a dedicated ordinary-user parent with one fixed invocation,
`--observe-metadata`. It accepts no principal, environment, path, source, library
or fake-mode options. `guardian_child.py` receives one anonymous channel at a
fixed inherited descriptor and loads only verified readiness source bytes.
`guardian_family.py` owns bounded process cleanup; `readiness.py` implements
private metadata filtering/proposals, and `udev_metadata.py` provides the fixed
lazy libudev adapter. Importing the adapter does not enumerate hardware.

Both initial bootstrap and module loading walk retained directory descriptors
with `O_NOFOLLOW`, hash the opened regular files and recheck leaf/ancestor
identities. Writable-by-other-user source ancestors deny; the shared sticky
temporary ancestor is a narrowly fixed exception. The child executes the exact
already-opened/hash-verified public child bytes through fixed Python `-I -S -B
-c` arguments, avoiding a checked-path reopen. Interpreter/platform/source
binding and private deployment/capture are separate reviewed authorities, not
inferred from a source content match or this publication. Source read-only modes
do not exclude root or the owning user continuously.

The environment must exactly equal `LC_ALL=C.UTF-8`, `LANG=C.UTF-8`,
`PATH=/usr/bin:/bin`. Before metadata work, establish/read back core limits zero
and dumpability zero; reject blocked guard/cancellation signals and SIGCHLD
ignored/auto-reap state. Child stdout/stderr cannot carry raw data: only its
anonymous bounded protocol transports the fixed result. Exceptions are never
formatted into public diagnostics.

## Kernel-authenticated parent and protocol

The parent creates an AF_UNIX `SOCK_SEQPACKET` pair before spawning its child,
closes its duplicate and retains the actual unreaped child plus stable pidfds.
The dedicated single-threaded process has no competing reaper. The child
verifies kind, kernel `SO_PEERCRED` creator PID/UID and `SO_PEERPIDFD` lifetime.
Creator PID must match actual `getppid()` and the non-root real/effective UID.
These are socketpair-creator credentials, never a claim that pre-spawn endpoint
credentials identify the subsequently spawned child. Set SIGKILL PDEATHSIG and
recheck parent/transport/liveness to close the acquisition race. Missing required
kernel facilities deny; no claimed-principal or bare-PID fallback exists.

One exact START version1 packet and one result are each bounded to4096 bytes.
START carries no caller principal, path, generation, token, grant or consent.
Generation1 and a local deadline belong to this invocation. Reject unknown,
truncated or extra packets, ancillary rights and forged fields. The parent
requires kernel SCM_CREDENTIALS matching its unreaped child/UID, stable lifetime
and the result's expected child exit. `SO_PASSCRED` distinguishes an empty extra
packet from EOF. ParentPeer lifetime/transport checks bracket the Catalog;
death/disconnect or invalid packets are terminal and cannot revive through a
same-UID replacement.

## V4 positive metadata qualification

The adapter performs the same single input/keyboard enumeration scan. Exact
integer1 from initialized and then current-seat checks is required before
parent/metadata construction. Exact0 excludes only that device, without seat
lookup after initialized0 or downstream device metadata reads after either0.
Every acquired device unrefs exactly once before a common next-entry advance.
Explicit negative, bool or unexpected exposed returns invalidate the whole
snapshot with no counts. No tag filter, errno API, extra filesystem/native query,
clock/uname call, rescan or retry was added.

Zero means **not positively qualified**, including possible internally collapsed
errors. Both [libudev249](https://raw.githubusercontent.com/systemd/systemd/v249/src/libudev/libudev-device.c#L756-L829)
and [libudev257](https://raw.githubusercontent.com/systemd/systemd/v257/src/libudev/libudev-device.c#L751-L820)
can collapse internal current-tag errors to0; initialized can expose0 with errno.
It is not an error-free classification. Other candidates must still pass every
original seat0/transport/keyboard/emergency-chord and virtual/Linuxcast,
pointer/mixed and identity filter. Qualified metadata is not a physical census;
empty candidates never prove no keyboards exist.

All128 inspected entries count toward the cap, including non-event and excluded
entries; reject before inspecting entry129. A bounded private set rejects
repeated raw enumeration paths, including skipped ones. Existing Catalog
returned syspath/devnode/devnum ambiguity checks still run before other pure
filters. Unknown/stale parent state, proposal expiry, fingerprint replacement,
cancellation and a different parent object remain terminal. No device is
selected by the guardian and no token/fingerprint/proposal is published.

The one output uses strict schemaVersion4, fixed outcome/reason/attempted-stage
enums, bounded qualified transport counts and the four false fields:
`canCapture`, `consentEstablished`, `deviceOpenAvailable`, `workerArmAvailable`.
An observed result always reports `AUTHENTICATED_LIVE_COMPANION_UNAVAILABLE`.
Unavailable has no counts. Version/type/duplicate/private fields, wrong child
origin and impossible reason-stage combinations deny. Private observations are
not copied into this source publication, and old-version rows are never promoted.
The17 fixed CHILD_ADAPTER attempted groups contain no device/index, error, value
or argument. They identify an attempted guard only, not a particular failure,
preceding success, exact return or exclusive historical cause.

## Deadlines and owned cleanup

The parent never loads libudev. It uses a2-second query deadline established
before spawn and a5-second total including bootstrap/cleanup after its first
script timestamp. The adapter's1-second elapsed checks are additional guards,
not independent preemption. Interpreter startup requires a separate outer bound;
the reviewed private capture uses8 seconds with2 seconds reserved for cleanup.
No step resets these deadlines and a late reply cannot win over expiry.

The parent is a subreaper with stable owned pidfds. It journals child ownership
before later acquisition can fail, distinguishes live/exit-ready/unknown,
sends TERM with at most250ms grace, then KILL only to verified own descendants,
reaps and verifies family/group absence. Exited leaders cannot hide descendants;
unknown ownership/liveness blocks a clean result. Repeated ordinary cancellation
cannot interrupt cleanup. The child does not spawn. PDEATHSIG covers that fixed
child's parent death, not transitive arbitrary-grandchild or machine-loss cleanup.
Uncatchable startup termination can leave an empty private deployment directory;
there is no claim of guaranteed filesystem cleanup under SIGKILL/machine loss.

The Family ownership pattern derives from reviewed source SHA256
`470c0bee8a6771f8f1634f34308f5ce9e640c2a4a64b83b5b5352ee77edd30c5`.
Its runtime copy remains
`9c0d0618b61a85e2c46bcf3397ebb8a67b7f179438cb5b111f20d2fc3512e7ad`:
fixed FD3 mapping, owned pidfd signals and absolute cleanup/250ms grace are
explicit copied-source differences. There is no runtime import from a private
review capsule. Copy provenance does not replace independent current review.

## Public source/unit verification and provenance

The standard unfiltered suite runs `test_guardian test_readiness
 test_adapter_stages test_per_device` through Python unittest. It passes66
checks with no skips:24 guardian,19 readiness,9 adapter and14 per-device groups.
Author6.587s, coordinator6.582s and independent reviewer6.588s runs use real owned
processes/libc/socketpairs/pidfds with **fully fake libudev**, never actual metadata.
The separate21 private-controller fixtures pass author1.347s, coordinator1.386s
and independent1.372s using random owned temporary files and mocked context/
transport. They test source/ownership/partial acquisition, collisions, fsync,
first-facts-before-decode/cancel, actual-exit/first-failure precedence, strict
output and cleanup. Private controller source/state are not published here.

Production-boundary fixtures exercise creator/child credentials, retained-parent
lifetime, ancillary/extra packets, source-ancestor swaps, exact verified source
execution despite later pathname replacement, deadlines, repeated cancellation,
own escaped descendants and postspawn faults. A review found an earlier
parent-death fixture could signal numeric PIDs after reaping; the corrected
fixture retains stable ownership and reaped tracking. Its same-integer reuse spy
rejects before sending any signal; actual post-fork exception cleanup is bounded.
Those historical tests/source and the finding remain preserved, not retroactively
claimed clean because an earlier suite passed.

V4 fixtures preserve24 unchanged signed-old trace cases; the initialized0/seat0
whole-failure expectations alone are intentionally superseded. Fully positive
1/2/128-row native/signature/argument/text/uname/clock traces remain exact. New
mixed/zero/collapsed-error/negative/unexpected rows,128/129 inspected caps, raw
path/node/rdev duplicates, unchanged pure filters, cleanup-before-advance,
metadata privacy and fixed public false authority are covered. The original
initialized0 test is narrowly updated without replacing/filtering its runner;
all private/scan/string fault assertions remain. No raw typed input or hardware
content enters fixtures.

Initial restricted own-process tests had5 failures/1 error from IPC EPERM; the
identical permitted run passed. An initial new pure-fixture helper used an
unsupported Catalog argument and had4 errors; the fixture-only correction and
original results are retained. These are test-environment/fixture outcomes,
not failed hardware observations repaired into success. Coordinator also records
current TypeScript typecheck and planning validation passes; these do not run the
required native suite. Structured details and exact runtime/test hashes are in
`guardian-checks.json`. Raw logs and private evidence are excluded.

Signed baseline `7e933c57979424fdd51f03b541c8acad75efe331` remains exact for
`readiness.py` and its original `checks.json` (excluded from this new11-file
publication). Adapter, README and test_readiness are three explicit unsigned
deltas from that baseline; all original signed blobs and older guardian/unit
snapshots remain immutable privately. Guardian/runtime/tests were unsigned when
these checks and separate observations ran. Later normal signing cannot change
those execution facts or establish a full signed-tree rebuild.

## Acceptance and remaining work

AC01 and AC02 remain **pending**. This engineering-only change adds no product
UI. Privacy support is source/fixture review with synthetic canaries and fixed
public protocols, not publication of private metadata or new hardware evidence.
No task, criterion, platform-matrix or release completion follows.

The current manufactured-device/security regression is **pending**, requiring a
proper fresh Debian generic-kernel runner and reviewed collector. Earlier14
native scenarios plus mapped2 security tests passed internally, but the retained
outer experiment remains **FAILED_UNRESOLVED**; separate resource cleanup does
not make that wrapper pass. Current checks neither skip nor satisfy this rerun.
Native input code, manufactured guards and their evidence are unchanged.

The root-to-ordinary native input helper's Ready self-readbacks remain distinct
from external PDEATHSIG/dumpability or an actual direct-parent-death trial.
Guardian own-child parent-death fixtures are separate, bounded test evidence;
they do not close that native-helper or physical recovery gate. Device-owning
supervisor live-veto integration, authenticated positive companion/session proof,
locked/inactive graphical transition races, consented selected physical devices,
held-key/compositor modifier recovery and full release security gates remain
outstanding. Pop!_OS22/GNOME42/systemd249 observations do not relabel the Debian13
GNOME48/Plasma6.3 Wayland/X11 target matrix. Keyboard connection is not consent;
no automatic grant, capture, service activation or policy change is added.
