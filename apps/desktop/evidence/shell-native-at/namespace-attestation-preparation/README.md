# F1-02 namespace attestation — offline prerequisite preparation

The initial author evidence below is historical at96b42643/00e2617. Both
independent initial reviews found an FD3 cleanup handoff gap; the coordinator
correction and current source hashes are recorded in
[coordinator-custody-correction.md](coordinator-custody-correction.md).
Final independent recheck remains pending; no actual native execution follows.

Prepared 2 November 2026 Sydney in
`/home/ian/.t3/worktrees/linuxcast/t3-456ef112`, branch
`codex/f1-02-namespace-proof`, exact assigned base
`bd5873823d4ca4a6919e4ad3eace9aa6610feef7`.
The base includes approved PR100 at `69decac2bd695de53d24e5595770b2e546d362be`
and the coordinator-frozen
[attestation contract](../../../tests/at/namespace-attestation-protocol.md).
Commit/HEAD/tree identifiers are reported separately in the final handoff to
avoid self-reference. This increment is preparation only, with no acceptance,
task, dependency, runner, routing or full97/local1.0 scope change.

## Implemented boundary

Only `lab_namespace.py`, `test_lab_namespace.py`, `product_controller.py`,
`test_controller_failures.py` and this new directory change. The root wrapper
checks fixed PID1 net/mount/PID/user handles against its own device/inode pairs,
nsfs magic and NS_GET_NSTYPE before forking. The parent retains the four PID1
references through child-lifetime verification; the child closes all inherited
outside handles before setup. No NEWPID/NEWUSER or capability relaxation is added.

After unshare, real proc setup and chroot, the worker verifies isolated net/mount
inequality, PID/user equality and the initial identity UID/GID maps. It creates a
bounded anonymous root-owned0400 fully sealed memfd containing exactly schema,
initial/isolated pairs and subject PID/start ticks. Short writes are completed;
zero/error IO and descriptor/cleanup failures refuse execution. A read-only FD3
is allocated without overwriting any existing descriptor. It stays close-on-exec
until the fixed controller exec. All other nonstandard handles close.

After privilege drop, the wrapper compares its own namespace pairs against root
memory, checks maps and descriptor authority, then preserves the original empty
groups/capabilities/bounding/ambient, NNP, loopback/sysfs/devices, immutable
staging/Node/receipt, parent-death, cgroup and deadline gates. It never reads PID1
metadata after drop. Root never imports staging code.

The controller independently verifies FD3 ownership/mode/type/anonymity/access,
all four seals, bounded immutable bytes, closed schema, subject, maps, own current
namespace pairs and relationships. Metadata/access/seals/identity are rechecked
after reading. FD3 is noninheritable during verification and closed on success
or failure before staging imports/validation or session/native construction.
Missing proof has no fallback. Invalid CLI, early deadline construction and
close faults also stop execution. Root namespace IDs gain no public report field.

Both modules anchor maps and subject metadata to genuine proc root inode1,
PROC_SUPER_MAGIC and equal statx mount IDs. Fabricated files and individually
bind-mounted proc files cannot supply apparent initial identity maps. These
fixed reads are bounded; missing statx mount-ID support fails closed. The two
implementations are self-contained, so the root trust boundary does not import
any staged helper. Existing controller native protocol, Enter guards, native
accounting, stage receipts and process cleanup remain unchanged.

## Executed checks

Host: Pop!_OS22.04 LTS amd64, kernel7.1.1-76070101-generic;
Python3.10.12; pinned Node24.22.1/Bun1.4.4 from
`/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools` on PATH.
No claim of Debian/session runtime equivalence follows from this host.

Commands run from the checkout root, with pinned tools on PATH:

```sh
bun install --frozen-lockfile --backend=copyfile --ignore-scripts
python3 -B -m unittest discover -s apps/desktop/tests/at -p 'test_lab_namespace.py' -v
python3 -B -m unittest discover -s apps/desktop/tests/at -p 'test_controller_failures.py' -v
python3 -B -m unittest discover -s apps/desktop/tests/at -p 'test_*.py' -v
bun run test:security -- F1-02
python3 -B apps/desktop/evidence/shell-native-at/namespace-attestation-preparation/check-base-regressions.py
python3 scripts/validate_plan.py
git diff --check
```

Frozen copyfile installation was necessary for the mapped Vitest runner; 805
packages installed, lifecycle scripts disabled, no manifest/lockfile edits.
Final focused results: 53 wrapper tests and19 controller-failure tests pass.
[Complete Python discovery](all-python.txt):290 tests,12.059s, no skips or
expected failures. [Mapped security](mapped-security.txt):55 checks pass;
the original18000ms spawn bound and20000ms Vitest bound are unchanged. Its
Python discovery result also requires no skips/expected failures. Final mapped
wall time10.64s; inner Python wrapper9.251s. Both are retained in that log.

The [base control](base-regressions.txt) is explicitly expected to fail:
the same positive wrapper/controller tests encounter synthetic PID1 denial;
the missing-proof test shows old preflight reaches receipt validation.
The replay helper loads only the two inert modules from the exact base using
`git show` and in-memory compilation; it changes no source, checkout or branch.
It asserts the precise failure reasons, rejecting missing-symbol false reds.
The same three tests pass against final code. The old wrapper assertion that
PID1 denial itself is fatal is replaced by the frozen contract's missing-proof
and valid-proof/denial behavior; all other existing behavioral assertions remain.

New syscall-adapter regressions cover namespace type/device/inode and preflight
failure before permit/stage access, root reference retention/child closure,
privilege order, map and mount overlays, read-only sealed proof construction,
writer-to-independent-verifier bytes, ownership/mode/access/seals/schema/subject/
namespace/map/IO/close failures, stage import deferral and no native construction
on prerequisite failure. One ordinary unprivileged memfd fixture uses real seals,
mode/access and reads with synthetic root ownership and namespace facts. No host
FD3 is overwritten. Synthetic fixtures and ordinary Python stand-ins establish
only offline behavior, not actual containment.

[Source hashes](source-hashes.json) record all30 AT source/protocol files,
including the frozen contract: exactly the four owned Python files differ from
base. Python AST parsing covers every AT Python file and the replay helper.
Plan validation and whitespace checks pass. Existing unsafe-Enter/process/native
accounting/protocol regressions execute unchanged through full discovery/mapped
security. TypeScript/React/UI changes, UI checks and screenshots are inapplicable.

## Inherited facts and remaining gates

The corrected actual inventory at `inventory-actual-20261101-corrected` is
inherited coordinator evidence, not executed here. It establishes real root/sudo
and clean guest shutdown, UID20000 self metadata access and denied PID1 net/PID
links. It does not establish wrapper containment or native acceptance. Source,
build prerequisites and missing capabilities are unchanged by this preparation.

Actual guest/root drop/unshare/mount/chroot, Docker/SSH, product/native/reader,
display/bus/input/audio/keyring/provider actions and screenshots in this work:
ZERO. Real privileged adapters and guest CLIs were never invoked. No private-lab,
user-data or key contents were read. No installation, permit, archive, guest
build, receipt, provisioning, push, PR, watch or task promotion occurred.

| Criterion | Preparation evidence | Still required |
| --- | --- | --- |
| F1-02-AC01 | Fail-closed data proof around unchanged product security gates | Existing accepted evidence unchanged; actual refreshed containment/product evidence |
| F1-02-AC02 | Fixed controller handoff and original lifecycle/protocol regressions | Existing accepted evidence unchanged; no new singleton/native result |
| F1-02-UI | Future namespace prerequisite only; no UI work | UI/native/Orca and supported GNOME/KDE Wayland/X11 acceptance pending |
| F1-02-PRIVACY | Closed descriptor/map/schema boundaries; no new public root IDs | Existing status unchanged; actual isolation, descendants and recovery evidence |

Coordinator must obtain independent Standards and Security/Spec review before
installation or invocation; no reviewer/child was launched here. Reconcile the
historical installed wrapper APPROVED_TREE and all source/infrastructure pins,
archive/build/receipt/permit bindings and old evidence/manifests. Those records
are untouched. Provision UID/GID20000 and required build resources, then verify
real namespace/mount/statx/identity-map feasibility after drop, proof transfer,
nonleakage, cgroups/deadlines/parent death, graceful/fallback recovery and clean
shutdown under separately reviewed authority. Root/API/guest integration remains
unexecuted. F0-01 is accepted; F1-02 UI/full task, native AT, physical recovery,
full97 and complete local1.0 release gates remain pending.

API checks used the fixed Linux headers plus the primary manuals for
[NS_GET_NSTYPE](https://man7.org/linux/man-pages/man2/NS_GET_NSTYPE.2const.html),
[memfd creation/sealing](https://man7.org/linux/man-pages/man2/memfd_create.2.html)
and [statx mount IDs](https://man7.org/linux/man-pages/man2/statx.2.html).
These are API evidence, not runtime proof.

## Signing

Implementation commit `ca10386585f28f854ba7102142b24471395e251c` succeeded
with normal configured SSH signing under the30-second bound (exit0); no fallback
was used. [Attempt output](signing-attempt.txt) and
[cryptographic verification](signature-verification.txt) are retained here.
Default `git verify-commit` could not verify because no allowed-signers file is
configured. A temporary allowed-signers file containing only the configured
inline public Ed25519 key verified the signature (exit0); it was removed on
completion. No key file was read and no persistent configuration changed.
The evidence-only follow-up uses the same normal signing and30-second bound;
its exact HEAD/tree and signature verification are reported in the handoff.
Signed/tagged release requirements remain unchanged.
