# Actual native helper direct-parent-death verification

S0-03 card, PLAN, security IPC/input/diagnostics, Linux integration lifetime and
recovery, testing-release input gate and DESIGN Review gate apply. F1-01 is
integrated. No product UI or production grant/service/policy change is added.

The existing ten-helper suite tests ordinary same-UID fixture parent death.
This adds one explicit root-only --private-root-parent-death branch to the
existing denial-private executable. Its new support source is cfg(test) only;
production code is unchanged. Missing real root/capabilities/account/helper/
pidfd facilities fail the explicit case, never silently skip or mock root.

A connector connects after actual identity/group/capability drop. A root direct
parent uses production RootPeer and Observer::start_root with the actual fixed
root-owned helper, real credential drop and Ready. External status checks verify
helper UID/GID including saved/filesystem IDs, primary/supplemental groups,
capabilities, NNP and its direct parent, bracketed by retained live helper pidfd.
No process identifiers/actual identity values are exported. No query request or
device/worker operation is sent.

The fixture subreaper retains the helper pidfd and a duplicate parent control
endpoint across root-parent SIGKILL, so EOF cannot explain helper exit. It kills
only the authentic owned root parent via pidfd, then requires actual parent and
adopted helper wait statuses SIGKILL within500ms. Helper status precedes ANY
helper cleanup signal. A normal failure, channel disconnect or six-second helper
alarm cannot pass. The separate connector must still be alive at that boundary.
Independent owned driver/helper/connector cleanup uses stable references and
reaped tracking; no numeric signal is sent after reap.

One actual invocation passes: helper SIGKILL observed after1ms, cleanup verified.
Pinned Debian13 build image on actual host7.1.1-76070101-generic is NOT Debian
VM/generic-kernel or desktop-matrix evidence. The disposable container has no
network/host devices and drops all caps except SETUID/SETGID/KILL, with NNP and
bounded CPU/memory/PIDs. Its create-only fixed /opt helper installation vanishes
with the container; no host path/service/policy changed. Production helper hash
is byte-identical to earlier reviewed b80cc6a4. Source/tests were unsigned at
execution; no full signed-tree rebuild is claimed.

Affected ordinary denial-private regression passes ten helper cases plus its
established independent7s guard. Affected strict clippy and formatting pass.
The unchanged66 guardian suite was not rerun. Exact safe stdout and source/
binary/platform/check bindings are in evidence/root-parent-death-{result,checks}.json.
Old Ready-only records and failed/incomplete outcomes remain immutable.

AC01/AC02 remain pending. This supplies a separate actual helper parent-death
trial and external credential/capability checks. It does NOT externally measure
dumpability or PR_GET_PDEATHSIG, prove device-owning supervisor lock/inactive
integration, positive companion/consent, physical held-key/compositor recovery,
or satisfy the pending manufactured/security rerun. Earlier outer
FAILED_UNRESOLVED is not promoted.

Reproduce with the locked offline Rust1.95 denial-private target and helper in
the pinned image. In a fresh container with the listed restrictions, install the
helper create-only root-owned0555 at its fixed path, then invoke the fixture
branch. The ordinary suite uses the same target with no root-only argument.
No VM, event/uinput node, logind/system bus or desktop access is needed.
