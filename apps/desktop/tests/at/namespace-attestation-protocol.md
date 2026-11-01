# F1-02 namespace attestation across privilege drop

Coordinator contract for an offline, independently reviewed preparation. It
supersedes only the old wrapper's requirement that UID20000 dereference PID1's
namespace links after dropping privilege. It does not waive namespace identity,
network isolation, initial-user-namespace identity or any native execution gate.
No guest invocation, provisioning or permit creation follows from this file.

## Measured problem and invariant

The first actual inventory, recorded in
`evidence/shell-native-at/inventory-actual-20261101/README.md`, observed that a
capability-free UID20000 child can inspect its own net/PID namespace metadata,
but both PID1 links are denied. The current wrapper and product controller each
dereference those links. Do not retain CAP_SYS_PTRACE, change PID1 permissions,
create a fake proc view, remove the controller check or fall back to normal
guest networking. The outcome must remain fail-closed on missing identity proof.

Keep the same trusted root wrapper, fixed namespaces (NEWNS/NEWNET/NEWIPC/NEWUTS,
no NEWPID/NEWUSER), proc/sysfs views, root-owned immutable staging/Node/receipt,
UID/GID20000 and empty groups/capabilities, no-new-privileges, cgroup/deadline/
parent-lifetime/cleanup rules. This is test infrastructure, not a production
privileged input service. Product/Orca/UI/full-task acceptance stays pending.

## Root observation and nonprivileged proof

Before any fork/unshare, root opens only the fixed PID1 namespace entries
net/mnt/pid/user and verifies its own membership equals them by device AND inode.
Validate actual nsfs/type (NS_GET_NSTYPE or equivalent fixed kernel checks), not
inode alone or a caller string. Retain namespace handles in the root parent
through child termination, preventing identifier reuse. Partial setup/descriptor
failure closes retained ownership through existing cleanup and never runs a
controller. The child closes every inherited outside/namespace handle before
setup, exactly as before. No namespace handle reaches untrusted code.

The root setup worker records its isolated namespace identities after successful
unshare and real proc setup. Before dropping privilege, verify net/mnt differ
from the initial pair, pid/user stay equal, and both UID/GID maps are the initial
identity map (one triple `0 0 4294967295`). The latter also prevents a nonroot
user namespace's apparent UID0 from serving as the attestation authority.
Verify this map again after drop and in the controller; no fake or bind-mounted
mapping files. Root compromise remains outside the documented trust guarantee.

Create one bounded anonymous root-owned memfd containing a strict versioned
proof of the initial/isolated namespace pairs and exact subject PID/start ticks
(read from fixed proc metadata, unchanged by exec). It is data only, not a
namespace/socket/directory handle or an executable program. Use a closed key set,
bounded positive integers and maximum4096 bytes; never include identity files,
paths, account names, exception text or private process details in public output.
Handle short/zero writes and all creation/ownership/sealing/dup/close failures.
Require F_SEAL_WRITE/GROW/SHRINK/SEAL, root UID/GID ownership, anonymous regular
single-object custody and mode0400. Hand off a read-only descriptor at fixedFD3;
no CLI/environment descriptor/path override. Verify seals/access/type/size and
identity before and after reading. All other nonstandard descriptors close.

The wrapper's nonprivileged verification checks its own current namespace pairs,
UID/GID maps, capabilities, groups, no-new-privileges and original isolation
invariants against root's in-memory observations. It must not dereference PID1
after drop. The exact pinned controller alone receives sealedFD3 across exec.
No general product/observer/reader child may inherit it.

Before any native/display/bus/reader/product child, the controller consumes FD3,
checks the kernel descriptor authority/seals/immutable bytes and closed schema,
initial maps, its exact PID/start ticks, current own namespace identities and
required equality/inequality relationships. It closes FD3 on success AND every
failure, before stage receipt validation or starting any native work. Absent,
mutable, user-owned, wrong-subject, wrong-namespace, malformed, oversized or
unreadable proof is a prerequisite failure. No direct-proc or caller-label
fallback. Current loopback-only/sysfs/device/OS/receipt checks remain mandatory.

Root is already trusted to construct this environment; this handoff preserves
that authority across exec without exposing a privileged namespace descriptor.
Neither a mocked proof nor an internal label establishes actual containment.

## Ownership, validation and remaining gates

Implementation owns `lab_namespace.py`, `test_lab_namespace.py`,
`product_controller.py`, `test_controller_failures.py`, and new
`evidence/shell-native-at/namespace-attestation-preparation/` only. Coordinator
owns this contract, runner mapping, all existing source pins/receipts/manifests,
old wrapper/controller evidence and source-tree reconciliation. Request required
shared pin changes; do not silently refresh historical records. No dependency,
timeout, native event/parser/driver, product or acceptance changes.

Offline regressions must prove denied PID1 metadata after drop is compatible
only with valid root proof; same network/new PID/new user/mount mismatch remain
rejected. Cover preflight mismatches/unreadable/type/descriptor/partial failures;
root-handle retention and child closure; fixed FD consumption with every
ownership/seal/mode/access/size/schema/subject/map/namespace/read/close fault;
no child/staging import on failure; no capability or descriptor leakage; and
unchanged controller/cleanup/receipt gates. Use synthetic syscall adapters,
AST/data tests and ordinary unprivileged memfds only. Never execute real drop,
unshare/mount/chroot, Docker/SSH/guest CLI, native/display/bus/input/audio actions
on the host. Keep complete mapped Python tests below the unchanged18s bound,
without skips, weakening assertions, early clocks or production deadline changes.

Independent Standards and Security/Spec review precedes installation or actual
guest use. Actual source/archive/build/receipt/wrapper pins, UID20000 provisioning,
namespace/mount feasibility and supported native/session/AT gates remain pending.

Primary kernel API references consulted on 2November2026 Sydney:

- https://man7.org/linux/man-pages/man7/namespaces.7.html
- https://man7.org/linux/man-pages/man2/NS_GET_NSTYPE.2const.html
- https://man7.org/linux/man-pages/man7/user_namespaces.7.html
- https://man7.org/linux/man-pages/man2/memfd_create.2.html
