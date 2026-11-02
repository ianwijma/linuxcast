# APT 3 final-hook refusal control

This is an unprivileged private fixture, not an installation or an install
admission implementation. Real Debian APT 3.0.3 used private copies of the
previously authenticated runtime, indexes, projected status and 55 package
bodies. A fixed synthetic dpkg refused every mutating request. No host dpkg,
maintainer script, guest, service, compiler or native application was executed.
F1-02 remains in progress, UI pending; all 97 tasks and full local 1.0 remain
mandatory.

The fixture tests the source findings in the [transaction research](../debian-install-transaction-research/README.md).
It complements the [first-order collector preparation](../install-metadata-preparation/README.md),
whose code is inert on import and was not dispatched by this experiment.

## Executed boundary

Platform: Linux x86_64 development host, UID/GID1000, Python3.10.12 and the
unmodified Debian APT3.0.3/glibc runtime. The host's APT was not used. The
[runtime inventory](runtime-files.json) records 16 public package identities,
46 selected ELF records and 60 regular executable/library files including
independent SONAME copies. The fixture rechecked each public `.deb` against its
digest in the approved [resolver report](../debian-package-resolution-preparation/README.md),
then matched each selected ELF to the archive member without extraction or
executing maintainer scripts. The verified loader used `--inhibit-cache` and a
private library path; `--list` resolved every disk library inside that root.
The signed-index authentication of those runtime packages is inherited from the
resolver preparation and its independent reviews, not a fresh signature check.

[fixture.py](fixture.py) creates a new mode0700 root for each invocation. All
APT configuration, package state, lists, caches, locks, logs, HOME and temporary
paths are redirected there. No input hardlinks or archive symlinks are created.
The original 124 copied input files retain their hashes and full identity/mode/
owner/link/size/time fingerprints. The original source plan hash remains
`495b3acfe8b4c6ed0af811decb84c776da7d4974388c4ca1b37a3e88713363f3`.
The 767-record baseline and raw configuration/hook streams stay private; only
the already public candidate action identities are exported.

The real-route settings are `Simulate=false`, `Debug::NoLocking=false`,
`Debug::pkgAcqArchive::NoQueue=false`, `--no-download`, `--no-remove`, no
recommends/suggests and exact 55 versioned tuples. All pre/post/update hooks are
cleared before adding the sole fixed `Pre-Install-Pkgs` hook, Version3/InfoFD0.
`DPkg::ConfigurePending=false`, `DPkg::TriggersPending=false`,
`DPkg::NoTriggers=false`, forced nonrecursive unpack, `Use-Pty=false` and
`Inhibit-Shutdown=false` are explicit. External methods, solvers, planners,
compressors and signature helpers are absent; PATH contains only the private
fake dpkg and hook. Neither hook invokes shell input or downloaded programs.
The kernel has not been demonstrated to deny network/Unix-socket access; these
settings are not a substitute for future installation containment.

Every APT/loader execution has an independent 30-second supervisor deadline and
the existing FixtureGuard's two-second exact-child cleanup. It retains pidfds,
acts as subreaper, and requires ECHILD/no retained or adopted child before
reporting absence. Final runs finished normally; no forced child cleanup was
needed. Logs are private files with a 64MiB RLIMIT_FSIZE and core dumps disabled.

## Results

| Control | APT exit | Real-route elapsed | Observed boundary |
| --- | --- | --- | --- |
| Reject final hook, exit73 | 100 | 0.557s | Full v3 stream delivered; zero fake-dpkg calls; projected status and extended state unchanged. |
| Pass synthetic hook, exit0 | 100 | 0.593s | Fake dpkg received `--unpack --auto-deconfigure` plus exactly55 archive paths, refused with exit74; no package mutation occurred. |

Both streams contain exactly110 records of nine fields: one archive action and
one `**CONFIGURE**` action for each approved candidate, with no removal. Old
version/architecture are `-`, old Multi-Arch is `none`, comparison is `<`, and
new identities/Multi-Arch values match the candidate plan. Absent new Multi-Arch
is encoded by APT as `none`. Both complete action sequences agree. Every archive
path is inside the private cache, and its bytes independently match the exact
candidate SHA256 and size. [actions.json](actions.json) preserves their order
with archive basenames in place of private paths.

The hook process independently attempts nonblocking POSIX exclusive locks on
only its private frontend/database lock files. In both final runs the frontend
lock is contended and the database lock is available. This corroborates the
source finding: the final hook does not hold the inner database lock. It does
not establish exclusion against frontend-skipping writers or `dpkg-trigger`.

[results.json](results.json) records the final timings, outcomes, loader results,
stream digests, private fixture identities and conservative limits. The passing
control proves the rejection did not merely hide an earlier APT refusal. It is
deliberately incapable of proving a successful package transaction. The fake
dpkg's `--auto-deconfigure` request is recorded, not approved for a real owner.

Two initial harness corrections are retained honestly: a missing `archives/`
input directory failed before child execution; uppercase `%3A` cache quoting
caused a missing-method refusal before the hook. APT's `QuoteString` uses
lowercase hex, so the corrected fixture uses `%3a`. Subsequent bring-up runs
confirmed hook refusal and fake-dpkg refusal before the final two runs added
archive-member verification and independent lock probes. A summary assertion
also initially expected `no` for absent Multi-Arch; the actual stream and source
use `none`. No guard, authentication policy, limit or real system path was
relaxed to obtain the final result.

## Limits and next gates

No production final-hook verifier, digest-custody handoff or actual install
permit is implemented here. The fixed hook reads a bounded stream and either
rejects or permits only a synthetic consumer. The future admission gate must
independently verify action tuples, whole-baseline agreement, authenticated
archive hashes and retained custody, not trust APT's size-only cached fast path.
The source and final flags alone do not prove a real transaction lacks implicit
effects.

Actual trigger/config/handler metadata is still missing. Full helper/runtime/
NSS/ldconfig/manpath/sourced-code and recursive-trigger closure, diversion and
statoverride effects, dpkg configuration, independent writer exclusion, capacity,
kernel network/activation denial, toolchain/sysroot transfer and guest ABI,
installation/locale/build/receipt/rootdrop/statx/containment/native/AT/session/
release gates remain outstanding. The separate host-owner implementation and
both independent review axes must complete before a freshly pinned read-only
capture. Historical guest cleanup and unknown timeout-descendant absence remain
inherited; these new fixture ECHILD checks do not close older gaps.
