# F1-02 inventory owner — offline preparation only

## Subsequent live inventory and parser correction

The historical offline evidence below retains its original scope. The first
actual reviewed invocation is recorded separately in
[inventory-actual-20261101](../inventory-actual-20261101/README.md): valid partial
facts, package metadata unknown, denied unprivileged PID1 namespace metadata,
and verified clean shutdown. No product/Orca run or native acceptance followed.

A synthetic deb822 fixture reproduces rejection of `Conffiles:` with its value
on continuation lines, and of colon fields without a literal following space.
The narrow correction splits at the colon and strips horizontal value padding.
Package identity/status/version validation, duplicate rejection, size bounds,
source/permit pinning and all execution/cleanup authorities remain unchanged.
The regression failed all four whitespace cases on the actual-run source and
passes after correction; 58 focused inventory and 55 mapped security checks
pass (all266 offline Python cases, no skips, existing18s bound). This exposes
a valid-format defect, not a proven diagnosis of the private guest input.
No second guest execution or replacement permit has occurred. Independent
Standards39f1c16c and Security/Spec004b1237 reviews of source084e7dc are clear.
Both independently pass58inventory/55mappedsecurity/all266Python, old-source
negative controls, malformed/bounds/strict-output controls, typecheck/AST/hash/
plan/whitespace. Actual guest execution remains coordinator evidence, not a
reviewer rerun. Debian syntax reference:
https://www.debian.org/doc/debian-policy/ch-controlfields#syntax-of-control-files

This adds a separate inventory-only entry point to resolve the prerequisite cycle
between guest preparation metadata and the native owner's mandatory actual build
receipt. It creates no receipt, native permit, guest prerequisite approval or
native acceptance. Independent review precedes any invocation.

No real owner CLI, lab permit, Docker inspection/start/exec/stop/kill, SSH, guest
program, privileged drop, namespace, account mutation, systemctl, poweroff,
provisioning, dependency installation, compiler/build, display, bus, reader,
input/audio, provider or keyring operation ran in this assignment. No private
user-data/key was read. Only synthetic temporary fixtures and ordinary
unprivileged Python processes ran. Nothing was pushed or published; no PR, watch,
registry/task status, protocol, mapping, shared contract, manifest or UI changed.

Checkout: `/home/ian/.t3/worktrees/linuxcast/t3-6b25aa19`.
Branch: `codex/f1-02-inventory-owner`, renamed from T3's supplied branch in place;
no checkout or child delegation was created. Exact coordinator base:
`cc0e1eeca8fc028b2ae068b0139128c89df3b97e`, tree
`9d93f82714221911fd359f3cd8d7d455221ace0e`. Approved PR97 b23a3cc and the frozen
coordinator protocol are inherited authority, not a new independent review.
Unsigned code checkpoint `9b2a2538306ac02ac535e7b1c15466f0fd282a80`, tree
`f7e28f9997c53d262ae484e9981ce7166c2e3791`, precedes the final metadata correction.
Configured1Password signing timed out30s (exit124, no commit); the explicitly
authorized per-command `git -c commit.gpgsign=false commit` fallback succeeded.
The final evidence checkpoint uses the same authorized fallback after that
failure. The full before/after Git configuration fingerprint is unchanged; no
configuration write or release/tag signing change occurred. Final commit/tree
are handed back separately to avoid embedding a tree's own identity in itself.

The skill-library gateway returned no matches. The complete root AGENTS.md,
PLAN, F1-02 task/actual registry, architecture/security/overview/stack/Linux
integration, testing/release, inventory/outer/controller protocols, inventory,
existing owner/tests and wrapper/source/offline preparation evidence were read.
Registry F0-01 is done; F1-02 depends on it and remains in-progress. No acceptance
state is changed by this preparation.

## Fixed authority and shared custody

The [frozen inventory protocol](../../../tests/at/inventory-owner-protocol.md)
is the narrow contract. **It enumerates 13 keys**, although the assignment says
“15-key.” This implementation enforces exactly the enumerated set, without
inventing two fields:

`schema`, `jobKind`, `containerId`, `imageId`, `labRoot`, `labDevice`, `labInode`,
`ownerSha256`, `inventoryOwnerSha256`, `inventoryProbeSha256`, `guestAccount`,
`guestPrivilege`, `inventoryAuthorityReviewed`.

The separate fixed `f102-inventory-permit.json` is no-follow, owned, single-link,
regular and0400 under the same existing0700 root. Digests bind the exact reviewed
base owner, new owner and embedded UTF-8 bytes. Source checks run before guardian
admission, start and dispatch. Mutable/replaced/duplicate/foreign/native permits
are refused. Account grammar and fixed root/sudo routes are unchanged, with no
username default or authentication fallback. `inventoryAuthorityReviewed` grants
only these inventory/cleanup actions; it is not `guestPrerequisitesReviewed`.
No real permit was created; test permits exist only in synthetic temporary roots.

The existing owner supplies the lock, marker, configuration/identity checks,
independent guardian, lifetime gate, child accounting,600s overall bound,
120s readiness,45s cleanup, poweroff/fresh baseline/fallback, first-failure and
dirty-recovery behavior. Marker binding includes exact permit bytes, so a native
job, another permit or a changed account cannot consume an interrupted lease.
Recovery performs cleanup only and never replays inventory or native work.

Limited base-owner changes expose typed internal permit-name/reader, fixed SSH
composition, job reply/budget, guardian result relay and cleanup-authority seams.
The only old test change adds the default native reply/budget methods to FakeLab;
all existing assertions remain. The native CLI,15-field native permit, actual
source/archive/receipt/Node/wrapper admission and closed commands are unchanged.
Its job budget stays360s. The new entry point uses exactly two explicit inventory
review acknowledgements and no command/path/account/timeout/backend override.
The base's generic closed-parser error wording remains inherited.

Readiness retries only `/usr/bin/true` within120s. The single inventory job is
`/usr/bin/python3 -I -B -c <fixed source>`, with the exact source shell-quoted for
SSH's remote argument joining and the same fixed optional sudo prefix. There is
no stdin script, upload, installer, shell script, download, build or native
wrapper dispatch. Job time is capped30s. The same cleanup action is authorized
through the inventory-specific boolean; its implementation and failure semantics
are inherited unchanged.

## Guest source, facts and feasibility child

The embedded source is inert data on host import. Tests AST-extract definitions
and inject metadata/kernel adapters; neither its main nor its real collector or
privilege-drop child runs on the host. Real process stand-ins replace the guest
child completely with ordinary Python gate/output/sleep behavior.

Fixed bounded facts cover Debian/version/architecture, effective root and trusted
sudo UID/GID1000 indication, selected dpkg versions, required executable existence,
cgroup-v2 controller names, UID/GID20000 account presence and proc metadata counts.
Limits include8MiB dpkg input,128KiB package paragraph,16KiB line/proc status,
256KiB account metadata,8192 processes,4KiB guest reply and512-byte child reply.
Package versions are restricted to96 ASCII version characters. Arbitrary errors,
process names/PIDs, inode values, account names, machine IDs and private content
never enter the reply. Fixed paths are schema keys, not arbitrary diagnostics.

Unreadable/vanished/malformed/over-limit facts remain unknown, never zero or
absence. Graphical/test counts are fixed-name metadata candidates, not a proof
of native containment or process ownership. Missing packages, different Debian
version, absent UID20000 account and namespace denial are observed facts, never
permission to relax any native wrapper/controller gate.

A root-controlled single feasibility child is refused if UID20000 use is positive
or unknown. Its gate stays shut until exact retention; it clears groups and all
capability sets, sets all UID/GID identities to20000 and no-new-privileges, and
reads only self/PID1 net/PID namespace identities. It creates no account, file,
socket or namespace. The source sets a2s independent child alarm, CPU2/core0
limits, checks parent-death races, reapplies PDEATHSIG after setuid, verifies IDs,
groups/capabilities/NNP and exports only allowed/denied/unknown plus equality.

The parent bounds output/wait at3s and cleanup at2s, closes the gate on faults,
terminates by retained pidfd or exact unreaped direct PID, and requires reaping
through ECHILD. Lost fork returns still require reaping. Clock/bookkeeping errors
cannot skip termination; a400-iteration cleanup cap additionally bounds repeated
adapter clock/wait failures. Failed kill/wait/close remains failure even after
later absence. The guest program has a25s operation alarm within the30s transport;
deadline/cancellation propagates through child cleanup. Kernel/host loss cannot
run finalizers; child alarm/PDEATHSIG and the existing outer guardian/dirty marker
remain distinct protections, not a claim of actual guest recovery evidence.

Constants were checked against local primary UAPI headers
`/usr/include/linux/prctl.h` and `/usr/include/linux/capability.h` (hashes in
checks.json): PR_SET_PDEATHSIG1, PR_SET_DUMPABLE4, PR_CAPBSET_DROP24,
PR_SET_NO_NEW_PRIVS38, PR_CAP_AMBIENT47/CLEAR_ALL4 and capability v3
`0x20080522`. No syscall, setuid or namespace success is inferred from headers.

`f102-inventory-probe-v1` strictly validates closed facts, types, counts, states,
first-failure order, exit code and cross-field consistency. The existing guardian
relays the separately validated reply under its4KiB packet bound. Public
`f102-inventory-owner-v1` explicitly says inventory-only and separates lifecycle
from inventory facts, always acceptance=pending. No native-run counter or native
success exists. Successful metadata collection can truthfully report denial,
missing packages or an occupied UID; it is not native readiness.

## Executed checks and inherited limitations

Python3.10.12, Linux x86_64/kernel7.1.1-76070101-generic development host;
no Debian guest or desktop session evidence. [checks.json](checks.json) records
commands/timings/signing and [sha256.json](sha256.json) binds owned files and
unchanged protocol inputs. The final55 inventory tests pass0.766s; all88 existing
owner tests remain passing. Final exact mapped Python payload passes263 tests
(208 prior +55 new), no skips,17.244s Python/17.350s wall under its unchanged18s
subprocess timeout. An intermediate full253-case discovery also passed17.397s.
Two final negative controls against checkpoint9b2a253 fail as intended: missing
package Status and an empty proc directory no longer become absence/zero. Held
installed packages retain their actual version; missing OS ID is unknown.
AST checks, plan integrity and whitespace pass. No dependencies were installed;
the Node/Vitest shell was not needed to execute its exact Python payload.

Offline regressions include cross-job/changed permits and markers; exact
root/sudo quoting; source mutation before effect; no native dispatch; lifecycle
intents, first failure and recovery; invalid/unknown/oversized/inconsistent facts;
package/proc read bounds; UID collision; namespace denial/unknown; and injected
pipe/fork/pidfd/gate/read/write/drop/PDEATHSIG/capset/identity/wait/close/clock/
timeout failures. Five new ordinary Python fixtures cover successful child and
guardian relay, post-fork failure, deadline and deliberate false inner cleanup.
They reuse only the existing **independent test FixtureGuard**, whose own
libc/pidfd/direct-adopted-child/ECHILD cleanup does not call implementation
cleanup. It verifies absence even with the deliberately broken adapter. Existing
88 owner fixtures/assertions and the original18s mapping are not weakened.

The current checkout's group-writable source modes are not runtime approval:
real source admission still rejects them. Source-pin tests use private copies
with safe modes rather than weakening read_source. The coordinator must supply
reviewed sources with the already-required runtime custody before invocation.
No real guest account is known: UID1000, Debian13.7 and previous clean shutdown
are historical inherited facts. The unrelated old `debian` account lead was not
used. Two historical timeout-fixture absences remain unknown; no scans, signals,
retrospective cleanup or new absence claim were attempted.

Coordinator follow-ups: reconcile13/15 wording; independently review this exact
source; refresh the **two owner/test entries only** in the parent-owned old
outer-owner hash evidence; verify current account, transport, root/sudo and
poweroff authority before any permit/invocation; retain real inventory separately;
and resolve current native source/UID/PID1 feasibility and actual immutable
build/receipt/namespace/native gates through separate reviewed work. Old owner
manifests were deliberately not edited. Other inherited evidence/protocol files
remain byte-identical to the exact coordinator base.

| Criterion | Preparation contribution | Acceptance limit |
| --- | --- | --- |
| F1-02-AC01 | Native receipt admission remains mandatory; separate metadata route | Existing accepted renderer/security evidence unchanged; no new product runtime |
| F1-02-AC02 | One inventory job, conservative accounting/recovery | Existing accepted singleton/deep-link evidence unchanged |
| F1-02-PRIVACY | Fixed facts, bounded/redacted replies, synthetic negative tests | Existing status unchanged; real guest isolation/teardown unproved |
| F1-02-UI | No UI/product/design change | Native AT, supported four-session matrix and full UI remain pending |

F1-02/full task, native/session/physical/audio/delivery, packaging/release and all97
complete-local1.0 gates remain pending. No screenshot or containment, transport,
receipt, real inventory or native acceptance claim follows from this preparation.


## Coordinator review corrections after abff18ac

Initial Standards002b32cf found no separate documented-rule or material Fowler
smell issue, and reported a P2 Spec defect: unnamed dpkg stanzas became known
package absence. Initial Security/Specf502bf17 found a different P2: cancellation
after reply publication but before validity publication caused final protocol
validation to replace the original interrupted outcome. Both reviewed all11 paths
atabff18ac/baseb23a3cc, independently55inventory/88owner tests, AST/hashes/plan and
clean state. Spec additionally exercised six combined synthetic faults. It failed
the mapped55-check command twice at its18s Python bound; an inherited208-case
subset also timed out, so attribution to the new inventory code was unproved.
No complete263-case independent mapped pass was claimed.

Coordinator fixes directly validate a nonempty stanza's package identity before
filtering and publish reply plus validity in one plain-dict update. Missing,
empty, invalid or orphan continuation identities now leave package facts unknown
and return the packages failure; unrelated valid names and blank separators stay
valid. The name grammar follows [Debian Policy5.6.1/5.6.7](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-source).
A trace-injected interruption immediately before or after publication preserves
firstFailure=interrupted and successful cleanup, with internally consistent reply
and validity. Both new regression methods fail reviewedabff source and pass fixed
source. No shared native owner or production SessionOwner code changed.

The coordinator reproduced the mapped timeout. An explicit diagnostic run completed
all265 tests in20.866s, not a mapped-gate pass. Two inherited persistent-discovery
fault fixtures each waited5s after real termination/reaping. Only those tests now
advance their injected monotonic clock after production sets Popen.returncode and,
for retained descendants, the kernel confirms their known proc entries are absent.
The injected clock never reaps or kills a child. All original failure, root
preservation, termination and reaping assertions remain; an added assertion requires
deadline advance after actual reaping. With termination deliberately suppressed,
both negative controls still detect failure, do not advance early and complete
their existing fallback cleanup. The first private control initially confused a
post-fallback directReaped field with the pre-fallback assertion; it was corrected
to inspect the latter. This was a probe assumption, not a production/test relaxation.

Current validation:57inventory tests,9SessionOwner tests and55mapped F1security
pass. The complete265-case Python payload now takes11.860s, below the unchanged18s
limit; no skips or expected failures. Four changed/embedded AST parses, current
inventory hashes, the one affected legacy test-fixture hash, plan and whitespace
pass. Only that test hash was refreshed in the older controller manifest; its
production source pins and all runtime/native deadlines stay unchanged. The
aborted mapped runs establish neither complete-run success nor retrospective
absence of any interrupted fixture descendants. Historical absence uncertainty is
not replaced by the later successful runs.

Before findings arrived, the coordinator copied three exact public host inputs
fromabff into private0500/0400 candidate storage under the existing retained lab
lock. A fresh read-only Docker inspect matched pinned identities/configuration and
stopped PID0/exit0; no start/exec/SSH or guest source ran. After findings, the exact
candidate directory was renamed under the same unchanged lock to
`f102-inventory-candidate-abff18a-rejected`, preserving its inode/bytes. Its previous
path is retired, no permit exists, and it must not be used. A corrected immutable
bundle/source/embedded pin and real permit require the final reviewed source.
See coordinator.md for custody and current review status. No native acceptance or
real guest, provider, device, bus, keyring, compiler/build action follows.


## Final independent correction recheck

Reviewer dc86be7a reviewed exacta744b7b/baseabff18ac and relevant full13-path
increment. Standards clear; Security/Spec closes both originalP2s with no new
P1/P2/P3. Independently55mapped checks pass, all265Python/no skips in11.759s under
unchanged18s, focused57inventory/88owner/9SessionOwner pass. Both regressions fail
reviewedBASE and passfixedHEAD in private copies; both termination-suppression
controls detect missing reaping without advancing early and complete fallback.
Four extra publication/cleanup combinations and14package probes pass after one
extra fixture corrected its missing selected-package Status. FourAST/24inventory
hashes/embedded pin+size/affected legacy test hash/unchanged production pins/plan/
whitespace pass, exactcleanbeforeafter. No lab/native actions in that review.
These checks close this bounded correction only; actual inventory transport,
privilege/poweroff, immutable source/permit/build and full native/UI/release gates
remain pending. Subsequent coordinator publication metadata leaves tested code
byte-identical toa744b7b.
