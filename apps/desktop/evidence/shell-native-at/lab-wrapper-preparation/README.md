# F1-02 guest namespace wrapper: offline preparation only

**Actual product/Orca/native runs: ZERO. Namespace/elevation actions: ZERO.**
Independent review of this increment is mandatory before any real invocation.
The existing v4 lab was not started, resumed, connected to or inspected here.
The coordinator reports its fresh state as stopped false/PID0/exit0. This is
inherited context, not a new observation by this worker.

This increment adds only [lab_namespace.py](../../../tests/at/lab_namespace.py),
[test_lab_namespace.py](../../../tests/at/test_lab_namespace.py), and this new
evidence directory. No existing source, captures, pins, protocols, runner mapping,
application code, manifest, task registry/card or progress file was modified.
There is no push, PR, publication, merge or acceptance/status promotion.

Checkout: `/home/ian/.t3/worktrees/linuxcast/t3-a70523b6`.
Branch: `codex/f1-02-namespace-wrapper`.
Base coordinator HEAD: `beb0d716557c80c5c7e8d63a2527d6de61baa141`.
Approved product authority: `cd7bf0e5c086be7d2c1ee2b4e4ae7d895a67a688`,
Git tree `265bfc3b57a2cbd580456ce8004eb00c4cc6434d`.
The existing AT files have no diff from that authority. Its v2 controller was
independently reviewed at41c3260, with earlier safety review at7310cee, through
merged PR80. Those reviews do not cover this wrapper. Final commit/tree and
actual signing status are reported in the handoff; they cannot be embedded
self-referentially in the tree they identify.

The coordinator's later host-only exact2504-blob archive of candidatebeb0d716
(tree6176bdd039c68324538d2f3e60414b7c6ae1edc1,
SHA2563d67f4b7c43d7cee7020a39572accfdc03400853eea7201199d9bf9cffecee9a)
is context only. It awaits F2 recheck and is not a guest build receipt, runtime
inventory or authorized product execution source. The wrapper rejects that tree
under the current approved-tree constant. No F2 changes were copied or executed.

## Implemented boundary

This is guest test infrastructure, never a production-installed service or a
setuid/general administrative runner. Import is inert. Its CLI admits exactly
`--reviewed-wrapper --reviewed-controller` with no abbreviations, command,
path, display, UID, timeout or backend overrides. These acknowledgements record
the caller's decision; they do not manufacture independent review evidence.
The launcher itself must run under packaged `/usr/bin/python3 -I -B` from the
fixed installed location below. No launch command was executed in this work.

A root-owned, read-only permit binds explicit guest preparation to SHA256s of
the exact machine-id bytes, QEMU product UUID bytes, wrapper bytes, Node binary,
source archive and immutable build receipt. The approved Git tree is fixed in
code. Debian13/x86_64, real/effective/saved root launcher identities, QEMU Standard
PC identity, initial guest net/mount/PID/user namespace agreement with PID1,
and absence of any process holding dedicated UID20000 are mandatory. UID20000
must have one nonlogin account, GID20000, home `/nonexistent`, shell
`/usr/sbin/nologin`. The account is a proposed new explicit guest prerequisite;
the historical lab preflight used UID1000 and does not establish it.
A permit is an explicit administrator decision, not cryptographic proof that
an arbitrary QEMU environment is the intended reserved lab. The coordinator's
reservation/baseline and actual guest identity verification remain essential.

The permit's open descriptor also holds an exclusive advisory lock for the whole
invocation. Every preexisting privileged path is walked with no-follow directory
FDs, root-owned ancestors and no group/other write or set-ID bits. Node is exactly
one root-owned immutable ELF64 little-endian AMD64 executable at `node/bin/node`,
with no outside hardlink, symlink or additional runtime-tree entry. Its SHA256
must equal the separately reviewed Node24.22.1 provisioning pin; the wrapper does
not infer a version number from ELF bytes or download/replace the runtime.
The receipt and four controller infrastructure files are checked against the
retained receipt pin before any staged Python import. Root never imports staged
code. Full unchanged `product_staging.validate` runs only after all privilege is
dropped and again through the unchanged controller preflight/postflight.

The supervisor creates exclusive random root-owned directories through anchored
`/run` and cgroup-v2 parent FDs. It does not reuse, chmod or remove preexisting
paths. A gate blocks the retained child until admission to the exact new cgroup
is confirmed. Missing controls, fork/pidfd/admission/setup failure all fail closed.
The child and all descendants are bounded by256tasks,2GiB memory, no swap and
one CPU quota. The cgroup parent must have the real cgroup2 filesystem magic and already expose cpu/memory/pids controls;
the wrapper never enables controllers or changes another cgroup's policy.

The child unshares mount/network/IPC/UTS, **retains the guest PID and user
namespaces**, and makes mount propagation recursively private before any mount.
It creates fresh proc and read-only sysfs mounts after network unshare, rather
than binding the guest's old `/sys` or synthesizing `/sys/class/net`. Only `lo`
exists in the planned new network namespace; fixed ioctls bring it up. No shell,
`ip`, generic command or network forwarding is used. Owned Playwright inspector/
CDP loopback is possible inside this namespace; actual transport is unverified.
The wrapper verifies real namespace identities, the exact `lo` set and IFF_UP
again after UID/capability drop. No host listener is created or exposed.

A fresh tmpfs root has nonrecursive read-only binds for `/usr`, public OS/font
configuration, staging and Node. Staging and Node retain the **same absolute
paths** inside and outside the namespace; receipt-inventoried absolute links
are not relocated or rewritten. `/home/linuxcast/preparation/source` and historic
Node locations are not exposed or assumed current. The rest of guest `/etc`,
`/home`, `/var`, `/run` and old desktop sockets are absent. Fresh minimal account,
NSS, localhost, machine-id and ALSA-null configuration is private to this mount.
No guest settings or inherited machine-id are changed. Private writable mounts
are exactly `/tmp`, `/run`, `/home/at`, `/dev/shm`, plus the exact owned output
bind. All are nosuid/nodev/noexec and bounded. Everything else, including receipt,
source/dependencies/dist, standalone Node, proc/sys and root, is read-only.
The minimal `/dev` contains only null/zero/random/urandom, shm and fd; it has no
input/uinput/snd/DRI/block devices, terminal or inherited display socket.

All inherited FDs above2 are closed in the worker; stdin/out/err go to null.
Only a fixed small environment reaches the controller, with no desktop/session,
Wayland/X11, Pulse/PipeWire, SSH/GPG agent, provider or keyring endpoint inherited.
The unchanged controller constructs its own private buses, display, profiles and
null/dummy speech. Before importing staged code, the worker chroots, empties the
capability bounding/ambient sets, sets no-new-privs, clears supplementary groups,
sets all UID/GID identities to20000, disables dumpability/core dumps, reapplies
parent-death SIGKILL and verifies zero capability sets. No privilege remains for
product/controller; no writable mount can supply a setuid fallback. The fixed
isolated-Python bootstrap admits only the immutable controller sibling directory
and uses the **actual existing CLI**: reviewed-controller, staging, node,
new-evidence and display193. No invented controller argument or preflight bypass
was added. Python bootstrap text is fixed source, not caller-supplied code.

The supervisor has a300s whole budget; one pidfd wait has a275s bound, preserving
the existing controller240s and cleanup6s bounds. No inputs, setup steps or
controller invocation are retried. Teardown has its own8s verification and10s
hard alarm. On every caught failure it closes the gate, kills the exact owned
cgroup and retained child, reaps direct/adopted children and requires ECHILD plus
`cgroup.events populated=0`. Only then are owned output/root/cgroup directories
removed. No process-name sweep, shared `/tmp` cleanup or staging deletion occurs.
Descriptor-relative bounded output deletion does not follow links or chmod
contents; foreign/replaced/unknown types are preserved and fail cleanup. Kernel
mounts/namespaces disappear with the last contained process; the parent holds no
child mount/network namespace FD. A failed kill or earlier setup/controller
failure remains recorded even if later absence is established. Unknown cleanup
is never reported as success and preserves resources for the outer lab owner.

A controller report is read only after the worker exits and its cgroup is empty.
The fixed envelope, step order/flags and completion restrictions are validated
without root importing staged modules. Only fixed controller status, first
failure, failed step and cleanup booleans enter the wrapper's summary. No raw
AT/Orca content, logs, keys, errors, paths, PIDs or receipt data are projected.
Controller failure survives wrapper cleanup failure in separate fixed fields.
`controllerMayHaveRun` is conservative after gate release, not a native-run
counter or attestation. Reports/output are private and discarded during verified
cleanup; a future coordinator must retain only the reviewed fixed projection.
`outerLabCleanup=outstanding` and `acceptance=pending` are always explicit.

## Coordinator preparation/integration proposals — NOT performed

1. Obtain independent security/spec review of the exact final wrapper/test tree.
   Leave controller, observer, staging, parsers, protocols, pins and historical
   evidence unchanged. Only the coordinator may map these tests in the runner.
2. Reserve the existing v4 lab and validate its baseline through the reviewed
   outer owner. Verify real guest machine identity and package/tool inventories;
   provision the dedicated UID/account and resource controls explicitly. No root
   permit, account, cgroup control, VM or runtime was created in this assignment.
3. Prepare a fresh approved frozen-tree archive and install frozen dependencies
   using the reviewed copy backend. Provision Node24.22.1, Bun1.4.4,
   Rust1.95, exact offline Electron headers, Cargo caches, native rebuild tools,
   package versions/licences and architecture. The historical source path and
   hash-only records do not establish current binaries/cache availability.
4. Place extracted/installed source at **`/opt/linuxcast-f102-lab/staging` before
   building**, owned UID/GID20000 under root-controlled ancestors. Place the
   standalone reviewed Node binary at `/opt/linuxcast-f102-lab/node/bin/node`
   under root-controlled ancestors. Perform the unchanged `product_staging.prepare`
   there as20000 using that Node path. Retain the actual receipt SHA256,
   source tree/archive/signature status and Node SHA256 independently. Do not
   move an existing build/receipt with absolute links to fit this layout. Missing
   resources or unsupported links require preparation/review, never exposure of
   inherited home, online install or a host runtime fallback.
5. Install this wrapper, byte-identical and root-owned read-only, at
   `/usr/local/libexec/linuxcast-f102-lab/lab_namespace.py`. Provision a new
   root-owned read-only `/etc/linuxcast-f102-lab/permit.json` under protected
   ancestors with exactly: `schema=1`, `sourceTree` equal to the code constant,
   `machineIdSha256`, `productUuidSha256`, `archiveSha256`, `receiptSha256`,
   `nodeSha256`, `wrapperSha256`. Hash the actual identity bytes including
   newline, not normalized labels. Do not commit identity/private receipt data.
   The launcher supplies no permit creator or generic privileged provisioning API.
6. Resolve the actual kernel prerequisite before a native attempt: a nonroot,
   capability-free controller must be allowed to stat `/proc/1/ns/net` under the
   unchanged gate. Namespace symlinks have ptrace access checks; ordinary root
   PID1 may make this inaccessible. This was **not measured on the guest**.
   The wrapper deliberately fails on denial and does not synthesize `/proc`,
   retain CAP_SYS_PTRACE or change the controller to fit. If the real guest cannot
   satisfy it, stop for a coordinator-owned reviewed contract/design resolution;
   do not claim that coherent mount planning proves invocation feasibility.
7. Independently verify actual syscall/mount permissions, sysfs network tagging,
   unchanged PID namespace, `lo` up/no route/external listener, inherited-FD and
   Unix/abstract socket isolation, no device access, all read-only mounts, exact
   Node/staging/receipt, sandboxed Electron user-namespace behavior, private Xvfb/
   buses/null speech and CDP/inspector transport. Guest denial, unsupported,
   partial setup, timeout/cancellation and forced child death all need real
   bounded evidence before containment can be called demonstrated. Check that
  256tasks/2GiB/one CPU is sufficient; fail without automatic quota/timeout change.
8. Implement/review the **outer lab owner** finally path separately: even after
   wrapper SIGKILL, host/VM loss, failed cleanup or success, shut down/reap the
   reserved guest, freshly verify baseline/exit/PID0 and release the reservation.
   The guest wrapper cannot run Python finalizers after its own SIGKILL and does
   not solve VM lifecycle or cleanup after supervisor loss. No clean outer-lab
   statement can be inferred from a wrapper summary.

## Offline evidence and acceptance limits

See [checks.json](checks.json) and [sha256.json](sha256.json) for this increment's
recorded commands and source hashes. New44unittest cases use only pure validators,
fixed plans, mocked kernel/process/privilege operations and private temporary
files. They cover each parent/setup step, each read-only bind operation, invalid
host/root/UID/identity/Node/staging/receipt/path, no-PID namespace planning, argv/
environment closedness, partial fork/pidfd failure, exact cgroup admission,
missing controls, malformed cleanup state, foreign/replacement paths and no-follow
output deletion, privilege-drop order and denied PID1 namespace metadata.
No setup syscall, namespace command, real child/controller, display, bus, reader,
input/audio, Docker/QEMU/SSH or host settings operation was performed by these
tests. This is **simulation, not kernel/native containment proof**.

| F1 criterion | Preparation contribution | Acceptance limit |
| --- | --- | --- |
| F1-02-AC01 | Read-only pinned inputs, privilege/device/network preparation around unchanged secure controller | Existing accepted evidence unchanged; no new product/security runtime proof |
| F1-02-AC02 | Exactly one owned fixed controller invocation and bounded teardown | No new singleton/deep-link/native operation evidence |
| F1-02-UI | Future isolated execution envelope for reviewed v2 native checkpoints | Pending; actual native/Orca and GNOME48/Plasma6.3 Wayland/X11 remain unexecuted |
| F1-02-PRIVACY | Closed env/FDs/mounts, fixed safe summary, synthetic negative privacy tests | Existing status unchanged; actual isolation and complete teardown need guest evidence |

F0-01 is accepted and foundation sequencing permits this bounded preparation.
D1-01/02 UI/native, F1-02-UI, full F1 task, full desktop matrix, audible/delivery,
input recovery, packaging and complete local1.0 release gates remain pending.
No UI or token change was made. Applicable design references remain shell/
navigation, results/actions, forms, states/motion, accessibility and review gate;
there is no new screenshot evidence for this unexecuted preparation.

Primary technical references: installed Linux headers and mount(2), unshare(2),
prctl(2), pivot_root(2), namespaces(7) manuals were read without invoking namespace actions.
The kernel documents descendant cgroup membership, cgroup.kill and populated
semantics in [cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html),
and mounting sysfs in [sysfs](https://docs.kernel.org/filesystems/sysfs.html).
Kernel/user-namespace and ptrace behavior still require actual guest verification;
source/manual reading is not runtime proof.

## Independent review and coordinator correction

The frozen unsigned9f6f053 increment received separate independent Standards and
Security/Spec reviews. Both independently passed67offline tests and preserved
the exact clean source/index. Security/Spec reported no actionable findings and
passed five additional synthetic boundary probes. Standards found one P2: a signal
after kernel fork but before Python retained its PID could let cleanup skip
ECHILD verification while the gated child had not yet exited.

The coordinator now records the possibility of a child before invoking fork.
After closing the gate, any attempted fork requires bounded reaping through
ECHILD and an empty owned cgroup before resource removal. An unknown child PID
does not authorize a PID-name sweep or removal of unverified resources. A failure
before any fork retains the existing no-unowned-child-reaping behavior.

Two mocked regressions demonstrate the original defect: both fail against
9f6f053 (early removal/no waits and false cleanup success). The corrected source
passes44wrapper tests plus25existing pure protocol/parser/staging tests,69total,
without skips. They create no processes or namespaces. The second regression
keeps an unrecorded child unresolved past the bound and requires preservation.
The complete offline AT discovery suite also passes97tests in12.102s without
skips. Its existing controller fixtures use ordinary private Python stand-ins;
they execute no product, display, reader or namespace operations.
Final independent recheck of this correction remains required before invocation.
Native, namespace and guest runs remain zero; outer ownership and UI/source
refresh prerequisites remain unchanged. These corrections are coordinator-authored
nonUI work; the active Instrument UI lane uses Opus5.5medium separately.

## Commit signing record

Normal configured SSH signing through `/opt/1Password/op-ssh-sign` timed out
after30seconds (exit124) and produced no commit. This preparation uses the user
explicitly authorized per-command `git -c commit.gpgsign=false commit` fallback
and is **unsigned**. Persistent signing configuration, signed/tagged release
requirements and historical signature records remain unchanged. No push or PR.
