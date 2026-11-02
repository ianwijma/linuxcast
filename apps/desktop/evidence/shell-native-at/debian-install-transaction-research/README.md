# Closed Debian install transaction: locks, hooks and triggers

Research performed personally on 2 November 2026. **APT 3.0.3 releases the inner
dpkg lock before its pre-install hook. A successful simulation plus that hook is
not an atomic state-and-install operation.** Ordinary dpkg respects APT's retained
frontend lock; a writer using `DPKG_FRONTEND_LOCKED` and an independent
`dpkg-trigger` need additional exclusion. The separately reviewed install owner
must establish that exclusion, bind the actual installed handlers and runtime,
and preserve dirty state after any uncertain mutation. None is established by
public source or the existing projected baseline alone.

Starting HEAD `cb1610a71fb2236afaa7e194b412d46df7675b31`, tree
`45c9801de08ab2ac392770900fe2d7801153363c`; approved develop PR108 context
`dea300ade7fa211021daef1d4367f04754df2693`. The initially clean isolated branch
was renamed `codex/debian-install-transaction-research`. This new README is the
only owned tracked change. No merge, rebase, reset, parent import, push, PR,
watch, registry edit, package execution or new privileged authority occurred.
Final commit/tree/signing and clean status are supplied in the handoff.

## Repository and evidence boundary

Read [AGENTS](../../../../../AGENTS.md), [PLAN](../../../../../docs/PLAN.md),
[GOAL](../../../../../docs/implementation/GOAL.md),
[F1-02](../../../../../docs/implementation/tasks/F1-02.md),
[F0-01](../../../../../docs/implementation/tasks/F0-01.md),
[registry](../../../../../docs/implementation/tasks.json), architecture
[overview](../../../../../docs/architecture/overview.md),
[security](../../../../../docs/architecture/security.md),
[stack](../../../../../docs/architecture/stack.md) and
[testing/release](../../../../../docs/implementation/testing-release.md).
F0-01 is accepted. F1-02 remains in-progress, its UI/native/full-task gates
pending; all 97 tasks and complete local 1.0 scope are preserved.

Read the complete 546-line [resolution report](../debian-package-resolution-preparation/README.md),
[provisioning research](../build-provisioning-research/README.md),
[55-body/control evidence](../debian-build-package-inputs/README.md),
[actual canonical capture](../canonical-keyring-actual-20261102/README.md),
[keyring reconciliation](../packaged-keyring-reconciliation-20261102/README.md),
[build-facts protocol](../../../tests/at/build-facts-protocol.md) and
[schema](../build-facts-preparation/snapshot-schema.md). Also read the current
[source](../source-build-preparation/README.md),
[controller](../../../tests/at/controller-protocol.md),
[namespace](../../../tests/at/namespace-attestation-protocol.md),
[outer owner](../../../tests/at/outer-owner-protocol.md),
[offline-build](../offline-build-preparation/README.md) and
[Rust-routing](../../../tests/at/rust-build-routing-protocol.md) contracts.
This is the research skill's primary-source/single-Markdown workflow, performed
without nested agents. Source links are evidence, never execution authority.

Inherited candidate: `g++ make libgio-2.0-dev`, built-in APT solver `3.0`, exactly
55 new / 767 kept / zero upgrades, removals, downgrades or held changes.
Authenticated bodies total 77072036 bytes; Installed-Size sum 300170240 bytes.
The candidate's 15 maintainer scripts have real alternatives, documentation-link,
pkgconf-directory and dangling-f77 cleanup effects. No second solver execution
or actual installation was performed here.

Allowed private package facts were opened as data using no-follow descriptors;
regular/single-link/mode0400, size and SHA256 were checked before relying on them:

| Input | Bytes | SHA256 |
| --- | ---: | --- |
| Projected status | 224920 | `4786a2907757f76af0c1b01f36cb7f884b30cd36ef70d047fb2719d9be23c8b8` |
| Projected facts | 1142 | `53aeee03fb194b739a5246c97fdf445884634314a427473bee27814e589afcd7` |
| Projection provenance | 1027 | `40d5830ab95ddebdd78d53bc4cd95041394cc8c3ab450175cd01c478867ff2a6` |
| Full private plan | 213796 | `495b3acfe8b4c6ed0af811decb84c776da7d4974388c4ca1b37a3e88713363f3` |

The recorded target versions are **apt 3.0.3 and dpkg 1.22.22**. Package versions
do not prove installed executable bytes. Canonical captured snapshot SHA256
`4fc728c09b869f4cae66ed058adb32d1d92804ca2862cf42cc7fbbb285364196`
remains distinct from the projection and original guest status identity. Never
substitute the projection for the live database or its original-status digest.
All 767 keep tuples, status bodies and resource values remain private.

## Primary-source identity and authentication

Sources Debian's web reader failed for the initial source requests. Critical
findings below instead come from bounded, data-only reads of official source
archives, authenticated through the matching signed Debian source index:

1. Rehashed the permitted canonical public keyring, 55918 bytes,
   SHA256 `506b815cbb32d9b6066b4a2aa524071e071761e7e7f68c3ac74f3061ba852017`.
   Isolated `/usr/bin/gpgv`, private empty homedir, exited0 with three VALIDSIGs
   on cached trixie InRelease. Its cleartext exactly matches retained Release,
   SHA256 `ed56aac47e7911e65ee63aae8d67e29f20e023f840e49f8ed037043a33de138a`.
2. That Release authenticates original [main/source/Sources.xz][sources-index]:
   10540436 bytes, SHA256
   `6002f81f463a2d976d84b34170367cc16da2d60bd0ba9ab9d868d6e1c1a935d9`.
   Expanded source index: 57389881 bytes, SHA256
   `ae99131b13c7e61c53a52c33a2f9088a1bc5db15a664f5d90cc3753ad9b65606`.
3. Its exact apt/dpkg stanzas authenticate both `.dsc` and source tar SHA256/size;
   each `.dsc` independently agrees with its tar. No maintainer-key verification
   of the `.dsc` signature is claimed. Authentication is the archive Release →
   Sources → source-artifact chain, retaining the earlier image/keyring bootstrap
   assumption. Stable Release date is 2026-09-12 07:55:41 UTC and declares no
   Valid-Until; no invented expiry exemption is used.

| Official source artifact | Bytes | Authenticated SHA256 |
| --- | ---: | --- |
| [apt_3.0.3.dsc][apt-dsc] | 3091 | `ccf1666e5b268d76bf62aafb22db089a2fdae9c17d1d1c446546b3621768add7` |
| [apt_3.0.3.tar.xz][apt-tar] | 2422096 | `5b5f6f6d26121742a83aa80d4ed0eb0c6ce9bea259518db412edefd95760e4ef` |
| [dpkg_1.22.22.dsc][dpkg-dsc] | 3449 | `fc481d9b87cd4416cd55673cc1fa716b57480a6b23253ac0d87c1abbfad4c964` |
| [dpkg_1.22.22.tar.xz][dpkg-tar] | 5746724 | `d5ea9f132deec8030b50ab2a02ade2b49f0c7a195805a302c8301156fe833a57` |

Only regular source files were materialized mode0400 in new caller-owned0700
`/tmp/f102-install-transaction-research-9_db4mh5`. Archive programs, loaders,
scripts and build systems were never executed. An initial whole-dpkg extraction
stopped at the declared per-member guard; a subsequent narrower selection read
only bounded source/man/spec files. It did not enlarge the guard. Versioned
source links and line numbers below refer to these authenticated archives, even
where the online source viewer is unavailable. The exact-version source is the
authority for lock ordering; rolling manuals are supplemental.

## Lock ordering and the actual mutation boundary

These are POSIX `fcntl` record locks on the existing lock inodes, not `flock`
locks or file-presence tests. APT `GetLock` uses a whole-file write lock,
nonblocking by default, with close-on-exec. `Debug::NoLocking` disables it;
an EROFS path can produce APT's warning/fallback rather than exclusion. The owner
must independently refuse missing/replaced/nonregular locks, read-only database
mounts and either bypass. Do not unlink a contended lock. [APT fileutl.cc:250][a-lock]
and [dpkg file.c:295][d-lock] establish the primitives.

| Stage and source | Frontend `/var/lib/dpkg/lock-frontend` | Inner `/var/lib/dpkg/lock` | Consequence |
| --- | --- | --- | --- |
| `apt-get --simulate`, `CheckIfSimulateMode`, private-main.cc:55–76 | Locking disabled | Locking disabled | Historical simulation is planning evidence only; a separate read-only collector must lock its own snapshot. [Source][a-sim] |
| Real cache open, `BuildCaches`, cachefile.cc:111–130; `debSystem::Lock`, debsystem.cc:112–170 | APT acquires first | APT acquires second | Real planning reads state while both are held; dirty numeric update journal refuses. `DPkg::Lock::Timeout=0` means no waiting/retry. [Cache][a-cache], [system][a-system] |
| Acquisition/preparation before `DoInstall` | APT retains | APT retains, except download-only drops both | Real install must not be download-only. Archive-cache locking is a separate lock and is not database protection. [Install][a-install] |
| private-install.cc:562, immediately before `PM->DoInstall` | APT retains | APT **closes** its inner lock FD | Inner lock is already absent when `pkgDPkgPM::Go` starts. [Source][a-handoff] |
| dpkgpm.cc:1559–1563, `DPkg::Pre-Invoke`, then `RunScriptsWithPkgs` | APT retains | **Not held by APT** | A pre-install hook may itself acquire/check the inner lock, but its release creates a handoff gap. [Source][a-go] |
| APT invokes dpkg, dpkgpm.cc:2050–2055 | APT retains; sets `DPKG_FRONTEND_LOCKED=true` in child | dpkg acquires its own | It is a declaration of frontend ownership, not an inherited inner lock. [Source][a-dpkg-env] |
| dpkg `modstatdb_can_lock/lock`, dbmodify.c:249–290 | Direct dpkg acquires unless environment variable is **present** | Always acquires for writing | Even `DPKG_FRONTEND_LOCKED=0` skips frontend acquisition. Ordinary direct dpkg blocks on APT; a deliberately frontend-skipping writer can race the gap/batches. [Source][d-system] |
| dpkg returns; APT continues another batch | APT retains | Prior dpkg releases at close/exit | Do not infer continuous inner exclusion across multiple invocations. APT reacquires inner for incomplete/media-loop continuation, not around every hook/batch. [Source][a-handoff] |
| External `dpkg-trigger` | Does not require it | Does not require it | It serializes Unincorp using **`triggers/Lock`**, independently of the two package locks. [Source][d-deferred], [spec][d-spec-state] |

APT `debSystem::IsLocked` explicitly tests the frontend lock count and comments
that the inner lock may be released (debsystem.cc:214–222). Its truth in a hook
cannot establish inner-lock ownership. Retaining another process's inner lock
while starting dpkg makes dpkg's acquisition fail; it is not a handoff solution.
Likewise Linux POSIX locks are not transferred to a forked child merely by
passing its FD. [APT implementation][a-system], [fcntl lock semantics][fcntl]

The real profile must explicitly retain `pkgCacheFile::Generate=true` (its false
fast path returns before lock acquisition), `Debug::NoLocking=false`,
`APT::Get::Simulate=false`, `Debug::pkgDPkgPM=false`, `DPkg::Lock::Timeout=0`,
`DPkg::Run-Directory=/` and `DPkg::Chroot-Directory=/`. A no-op/debug route must
never become installation success. Freeze `DPkg::Path` to the audited system
directories and the internal planner; no external solver/planner executable.
[cachefile.cc:95–119][a-cache], [dpkgpm.cc:1565,2024–2055][a-go]

dpkg's `--pre-invoke` is also **too early** for an inner-lock assertion: `main`
runs it before dispatching `archivefiles/packages`; those functions subsequently
call `modstatdb_open`. A failed hook aborts that invocation, but a post-invoke
failure occurs after its effects. No claim that these hooks execute under the
inner database lock is valid. [main.c:392,786–794][d-main],
[archives.c:1491–1513][d-archives], [dbmodify.c:306–374][d-open]

Recommended minimal concurrency policy for an **unmodified** APT/dpkg route:

- The reserved, closed guest must have no independent package/trigger writer for
  the whole effectful job. Ordinary frontends/direct dpkg are additionally
  excluded by APT's frontend lock. The root execution envelope admits only this
  APT tree; no ambient hook may spawn frontend-skipping dpkg, and no independent
  timer/service/session may invoke `dpkg-trigger`. This is a required actual
  custody/quiescence fact, currently missing, not a property of the host lab lock.
- The sole fixed read-only pre-install validator acquires the existing inner
  lock and then trigger lock nonblockingly, validates state/actions/inputs below,
  and releases both before returning. Never acquire frontend again inside it:
  APT already owns that lock in another process. Contention rejects immediately.
- This closes the final check **for compliant writers under proven quiescence**;
  it does not close a malicious/uncontrolled root writer's race. Root compromise
  remains outside the security contract. If such exclusion cannot be established,
  stop before installation. A stronger same-process inner-lock acquisition/check/
  exec gate would require a separately designed/reviewed dpkg launch interface
  and lock-lifetime proof; this report neither invents nor approves that shim.

## Exact pre-install hook protocol and rejection rules

APT3 `SendPkgsInfo` emits at most protocol3. Configure the one fixed command's
`DPkg::Tools::Options::<command>::Version` to3 and `InfoFD` to0; no spaces in the
executable pathname. APT derives the configuration key from the command up to
its first space, launches `/bin/sh -c <fixed command>` and sets
`APT_HOOK_INFO_FD=0`. Its inherited `DPKG_FRONTEND_LOCKED=true` authorizes nothing
in the validator: it must never invoke dpkg. [dpkgpm.cc:297–529][a-protocol],
[apt.conf manual][apt-conf]

The version3 stream is `VERSION 3`, configuration `key=value` lines, an empty
separator line, then ordered actions with **nine whitespace-separated fields**:

```text
package old-version old-arch old-multiarch comparison new-version new-arch new-multiarch action
```

For a genuinely new install the old triple is `- - none`; comparison is `<`.
The new version preserves the epoch/full Debian version; architecture can be
`amd64` or `all`, not simply the requested qualifier. Multi-Arch may be `same`,
`foreign`, `allowed`, or the compatibility spelling `none` (manual says interpret
as `no`). `>` denotes old newer than new; `=` includes same-version operations.
The final field is an absolute `.deb` path for unpack, `**CONFIGURE**` for
configuration, or `**REMOVE**` for remove/purge. Relative archive paths produce
`**ERROR**`. Configuration values use APT's percent quoting; do not parse them
as shell, and do not source any part of this stream. [Source][a-protocol]

The concrete validator must consume bounded complete EOF and require:

1. Exactly version3, one complete separator and a bounded audited effective
   configuration; reject duplicate/unknown security-relevant options and any
   alternate config/source/hook/executable route. Suggested implementation bounds
   for coordinator freeze: 256KiB total stream, 16KiB line, at most110 package
   action lines for this expected 55 unpack + 55 configure list. A differing list
   returns to review; these are proposals, not edits to an existing contract.
2. Each ordered unpack/configure entry exactly matches a separately retained
   reviewed real-install hook projection of the frozen plan. Require each of the
   55 tuple/archive identities once in each expected operation; no configure of a
   keep, removal, same-version reinstall, downgrade, new root, duplicate or extra
   action. Preserve distinctions between Package name, requested `:amd64`
   qualifier, actual `Architecture:all` and dpkg's metadata name. A simulation's
   human `Inst/Conf` output is not itself this machine protocol.
3. Under inner+trigger locks, compare the **original** live status bytes/digest,
   all kept tuples/selections/holds/architectures, updates directory, trigger
   state and control/config/runtime bindings with the approved actual capture.
   Require all candidate packages genuinely new and no preexisting broken or
   pending work. Hash protected archive bodies against authenticated manifest;
   hook fields contain no body digest and omit unchanged packages.

Hook processes are waited for. Nonzero exit or signal makes
`RunScriptsWithPkgs` return failure; `Go` returns before its following state-file
write, selection operations and dpkg invocations. A validator must explicitly
fail malformed/truncated input: APT ignores the `SendPkgsInfo` boolean and cannot
be relied on to diagnose every short stream for it. Earlier `Pre-Invoke` hooks
have already run, so they must be empty; other APT hooks/log/cache effects are
not rolled back by this refusal. [dpkgpm.cc:515–529,1559–1569][a-go]

**Important visibility limit:** `SendPkgsInfo` skips entries without a package.
APT subsequently appends package-less `ConfigurePending` and can produce
`--configure --pending`; the stream is not a complete low-level argv/trigger
trace. It also does not enumerate baseline trigger handlers or dpkg's implicit
deconfigurations. APT's unpack argv includes `--auto-deconfigure`. Exact solver
closure, closed dpkg configuration and a clean baseline must rule those effects
out; the 55-entry hook check alone cannot. [dpkgpm.cc:1731–1757,1808–1851][a-batches]

For coordinator evaluation, the smallest profile avoiding broad pending repair
is `DPkg::ConfigurePending=false`, `DPkg::NoTriggers=false` (let ordinary dpkg
invocations process their triggers), `DPkg::TriggersPending=false`, and force
recursive installation off with `dpkg::install::recursive::force=true` plus
`dpkg::install::recursive=false`. Otherwise APT3 may automatically create a
temporary recursive tree of archive symlinks for a group larger than five.
Do not mistake `NoTriggers=true` for disabling activation; it defers processing.
No explicit `--configure -a`/`--triggers-only --pending` fallback is proposed.
This proposed invocation profile needs offline tests/review and exact action-set
replay before use; source reading does not prove its runtime success or that
every trigger will finish. Postflight rejects any residual pending state.
[dpkgpm.cc:1557,1570–1581,1755–1901][a-batches]

## Local routing, authentication and actual network denial

Retain the built-in `3.0` solver, full original signed indexes, 767 exact-version
preservation policy and frozen 55 literal requests from the resolution report.
Do not replace resolution with a manually selected dependency list. Use isolated
`APT_CONFIG` loaded first, with all config directories, sources, preferences,
auth, keyrings, lists, archives, caches, logs, executable/method/solver/planner
paths explicitly bound. Unlike simulation, point `Dir::State::status` to the
**real `/var/lib/dpkg/status`**, with root filesystem `/` and default admindir;
redirecting it to a private status copy would also misroute APT's dpkg lock paths.
[init.cc:231 onward][a-init], [debsystem.cc:130,173][a-system]

Only local `file:` sources may identify the three unchanged signed repositories;
retain their authenticated pool filenames and seed the exact cache basenames.
Use `--no-download --no-remove`, no recommends/suggests, no fix-missing,
autoremove, reinstall, allow-held/downgrade/unauthenticated/insecure/date bypass.
Do not add positional arbitrary `.deb` files as volatile sources: APT treats
local-source archives differently, including allowing absent index hashes.
[private-install.cc:165–181][a-nodownload], [acquire-item.cc:3380–3571][a-archive]

**Cached archive warning:** `pkgAcqArchive` accepts an existing final cache file
of matching size as complete/local before acquisition, without hashing that
file in that fast path. `NoQueue` similarly marks a path complete/local without
acquiring it. Therefore independently hash every body at root intake and again
in the final validator, with root-protected immutable path custody through dpkg
open. A size-correct replacement must fail. **NoQueue is simulation bookkeeping
only and must be absent/false in the real profile.** [acquire-item.cc:3528–3571][a-cache-body]

`--no-download` removes nonlocal fetch items; it is not kernel network denial.
Local-only repositories limit acquisition, not shell/maintainer/helper syscalls.
Enforce a separately reviewed no-network preparation envelope for the entire
root APT/dpkg descendant tree, with no inherited network descriptors, proxy/
credential/session environment or ambient system/session activation sockets.
Do not reuse receipt-gated native namespace authority for bootstrapping.
Actual feasibility/denial evidence is missing. Network denial also does not
prevent contact with an allowed Unix activation socket. [Install source][a-nodownload],
[repository security](../../../../../docs/architecture/security.md)

APT config isolation does **not** isolate dpkg config. dpkg1.22.22 loads
`/etc/dpkg/dpkg.cfg.d` (accepted filenames, alphabetical order), then
`/etc/dpkg/dpkg.cfg`, then `$HOME/.dpkg.cfg`, before processing argv. Its
pre/post-invoke lists accumulate; `--admindir` does not relocate those reads.
The fixed empty HOME prevents the home read from introducing a hook, while actual
system configs must be captured/reviewed and contain no unapproved hook, force,
path-filter or alternate-root option. Do not claim that clearing APT's hook lists
clears dpkg's hooks. The only shell hook admitted is the reviewed read-only
validator; independently reachable service helpers/systemctl calls must be absent
from the closed script graph, not merely hidden by a policy-rc.d assumption.
[options.c:164–215][d-options], [main.c:759–787][d-main]

## Trigger closure: what is known and what must actually be captured

dpkg1.22.22 distinguishes explicit names from `/path` file interests.
`interest`/`interest-await` and `activate`/`activate-await` are aliases; noawait
controls waiting, **not execution**. An interested noawait handler overrides an
awaiting activation; activate-noawait likewise creates no await edge even when
the handler uses interest-await. Thus these candidates can cause libc-bin's
ldconfig handler to run despite their `activate-noawait ldconfig` declarations.
[Exact parser, triglib.c:710–752][d-parser], [manual][deb-triggers]

`trig_path_activate` matches the recorded pathname and its parent components.
It does not generally resolve symlink aliases into equivalent interests.
`/lib/pkgconfig` and `/usr/lib/pkgconfig` must remain separate textual keys even
on merged-/usr; capture the filesystem alias separately for custody. File
interests may activate before modification, including an attempt that changes
nothing. Account for archive paths, directory changes, diversion-selected paths,
removals and explicitly dispatched helper activations, not just new regular
file names. [triglib.c:527–645][d-path], [archives.c:735][d-archive-trigger],
[unpack.c:725,835][d-unpack-trigger], [trigger spec][d-spec-path]

The handler is the interested package's **installed `postinst`**, called with
`triggered` and one argument containing the space-separated trigger names.
dpkg marks it half-configured before dispatch, then records completion; a failed
handler can leave persistent failed state. Handler scripts use normal interpreter,
PATH, libraries and configuration. Their package being among the 767 keeps does
not make their execution absent. [trigproc.c:451–481][d-process],
[script.c:171–246][d-script], [Policy6][policy-scripts]

Additional public controls were authenticated from the rehashed original trixie
Packages index, downloaded and read as data here (no extraction into a system
path). They establish expected upstream behavior, **not actual guest bytes**:

| Package/artifact | Control binding and reachable behavior |
| --- | --- |
| [libc-bin 2.41-12+deb13u4][libc-deb], 638452 bytes, SHA256 `dc8c79647fe3a5f37f72a400414f70263d0212f010ff2c09f990e30d91e38d1c` | `triggers` 440 bytes/SHA `c3d6b5df131336e54c31dc5687929467de7abea5c5798e3d6a6b2a64ef971fd4`: interest-await ldconfig. `postinst` 847 bytes/SHA `3daa7e3ffd429c1d77287f0fc840a490a607697906d2303452f70578647ce0d4`, lines35–37: PATH-resolved ldconfig with root argument; on failure its own verbose second call. The configure-only nsswitch-copy branches are not the triggered branch. |
| [man-db 2.13.1-1][man-deb], 1469060 bytes, SHA256 `d5a407221a0d59845484b5343a37ec6374102e949353e4b158eaa2cbaf27aa5a` | `triggers` 383 bytes/SHA `0a0a9141e038168b0a6d0978584b1d74c1805d5004b5be2b07f1be1ddb886c44`: six noawait directory interests including `/usr/share/man`. `postinst` 4906 bytes/SHA `abad869cb7243dd96f235bc96e4733dd0c2dbe1a93de7732cbffefca35bc9b1c`, lines6–41: ensure cache directory; if auto-update marker exists, setpriv as man with initialized groups and `/usr/bin/mandb -pq`; runuser fallback if setpriv missing; mandb errors suppressed. Trigger branch exits before debconf, AppArmor, tmpfiles and service/timer configure branches. |
| New pkgconf-bin 1.8.1-4, from already authenticated55 controls | `postinst` 369 bytes/SHA `84de581851b98c869967c3852496aad6694860347bb51d3dbe55bbfa3a5f2362`: configure/triggered may create `/usr/lib/pkgconfig`. Its interest-noawait is `/lib/pkgconfig`. This does not prove that existing baseline path interests consist only of these examples. |

There are 427 `/usr/share/man/` entries in the authenticated candidate payload
inventory. That makes man-db's public handler a concrete path-interest concern,
but its actual registered interests and enablement still need observation.
No speculative audit of all 767 packages is needed.

**Separate trigger state and locking matter.** The actual routing database is
`/var/lib/dpkg/triggers/File` plus per-explicit-name registration files such as
`triggers/ldconfig`; package `info/*.triggers` controls are not a substitute for
those registrations. Pending state is also in full status `Triggers-Pending`/
`Triggers-Awaited`, and deferred requests are in `triggers/Unincorp`.
`dpkg-trigger` writes Unincorp under `triggers/Lock` without taking the status
lock. Capture frontend → inner → trigger lock in that order, release reverse;
do not hold the trigger lock across package scripts that need it.
[triglib.c:275–397,527–568,795–843][d-registry],
[trigdeferred.c:73–143][d-deferred], [on-disk spec][d-spec-state]

**Absent Unincorp is not sufficient:** the build-facts collector allowed absent
Unincorp as empty. In dpkg's trigger initialization path, missing Unincorp can
lead to transitional activation of installed packages' registered interests.
Require the real, existing, regular empty Unincorp for this transaction and bind
it under the trigger lock. Do not repair/create it during preflight. Otherwise
return to capture/review rather than infer a closed handler set from that earlier
clean flag. [triglib.c:814–843][d-incorporate], [spec:773–788][d-transitional]

## Minimal next read-only observation, proposed to the coordinator

No fresh baseline capture is authorized or performed here. Before implementation
is finalized or permission for installation is sought, freeze/review a separate
bounded metadata probe for precisely the following missing facts. Keep raw
records private; publish typed requirements and public package hashes only.

| Record | Minimum data and reason |
| --- | --- |
| Original state and locks | Existing frontend/inner/trigger lock descriptors and retained parent identities; full original status hash/size plus selected tuple/status/selection and pending-trigger fields; empty updates directory; existing empty Unincorp; native/foreign architecture file; no holds/broken state. Reconcile against original private provenance, never projection SHA. |
| Routing registry | Bounded complete `triggers/File` content, metadata and digest; explicit registrations for ldconfig and any explicit trigger reachable from the reviewed scripts/helpers. Derive affected installed handlers from exact candidate path prefixes and activations, including recursive activations from those handlers. Retain absence records and directory listings sufficient to detect replacement/additions. Unrelated explicit-name contents need not be exported. |
| Only affected installed controls | Resolve each handler's actual dpkg info namespace using package architecture/Multi-Arch and info format; capture its `triggers`/`postinst` bytes and identity, comparing to authenticated matching-version public controls. Also capture any residual config-files control for a proposed “new” package rather than assuming no old script. Unknown/different code blocks closure. |
| dpkg filesystem policy | Hash/privately review bounded diversions, statoverride and path-exclude/include/config state affecting these paths; identify relevant payload collisions and overwritten ownership. These can change runtime files/effects even with identical projected dependencies. Do not dump unrelated private files. |
| Executable and handler custody | Fixed APT/libapt/dpkg/dpkg-deb/gpgv-or-sqv route, `/bin/sh` interpreter, dpkg-maintscript-helper/update-alternatives, required PATH utilities, ldconfig, setpriv and mandb, ELF interpreter/DT_NEEDED closure and any sourced script/module. Exact package version + content hash + mode + canonical path/symlink chain + protected ancestors. Actual file identity and runtime trust are separate from package status. |
| Fixed handler inputs | ldconfig config/include closure and permitted library roots/cache identity; man-db auto-update marker, `/etc/manpath.config`, cache-parent custody and typed man UID/GID/groups; relevant NSS configuration/module identity for setpriv group initialization. Reject arbitrary includes, external service backends, writable library/man roots or fallback programs rather than exporting homes, credentials, passwd/shadow or cache bodies. Compare public helper sources first; hash/typed local facts suffice where no local code must be reviewed. |
| Configuration/activation exclusion | APT effective-config closure, dpkg system/home config and absence of invoke hooks/unsafe force/path changes; dynamic-loader preload/config custody; fixed package-manager/trigger-writer quiescence and lack of ambient service activation routes for this job. The host reservation lock alone establishes none of these. |
| Capacity/locale | Private available bytes/inodes and fixed job limits; bind installed localedef and recursive en_US locale-source/charmap inputs separately. Existing locales/libc-l10n/libc-bin membership and missing en_US.UTF-8 remain observations, not generation/integrity proof. |

Suggested probe bounds for coordinator review: retain the existing status8MiB,
line16KiB, stanza128KiB and4096-record bounds; registry File256KiB, explicit
registration64KiB each, controls256KiB each, at most32 reached handler packages,
and2MiB total private control/registry export. Hash executables/libraries by
streaming with separate per-file/total byte bounds derived from authenticated
package sizes; do not export those bodies. Path/dependency inventories require
explicit entry/byte caps and fail on overflow. These limits are proposals with
no new collector authority, quota change or claim they fit the actual baseline.

Use descriptor-relative component traversal and no-follow regular leaf opens;
record device/inode/type/UID/GID/mode/link count/size/mtime/ctime, hash bounded
bytes and recheck path binding and complete bytes at the end. Account for
atomic replacement, directory entries and absent paths. Existing permitted
merged-/usr and interpreter symlinks need explicit bounded readlink records and
canonical-target verification; do not silently relax no-follow on metadata.
Root-owned single-link controls/configs, no group/other write, protected ancestors
and no untrusted same-UID writer are prerequisites. A digest does not protect a
pathname subsequently opened by dpkg; continued root custody does.

Do not acquire/reopen/close the same POSIX-lock inode via another FD in its lock
owner while relying on that lock: closing a descriptor for that inode can drop
the process's record locks. Retain one FD per lock and recheck with fstat/
descriptor-relative path metadata. No lockfile create/truncate/chmod in a
read-only probe. Refuse contention without retry. [fcntl semantics][fcntl],
[dpkg's own warning in dbmodify.c:240][d-system]

## Concrete later coordinator phase proposal — not a frozen contract

Use distinct reviewed **package-install** authority, source hashes, single-use
marker and fixed input-manifest digest; native/inventory/facts permits do not
admit it. Preserve exact owner/container/guardian/start-gate/lifetime and clean
shutdown checks. The marker records effect intent before the first potentially
effectful launch, not after a reply. No caller-supplied command, package, path,
environment, timeout, backend or shell argument is admitted.

1. **Observe, close and freeze first.** Perform only the separately reviewed
   capture above. Coordinator resolves actual trigger/helper closure and the
   concurrency guarantee, audits local control differences, checks signed
   metadata freshness and independently reviews the final fixed profile/tests.
   Missing facts stop here; this report grants neither capture nor root execution.
2. **Root intake and nonexecuting admission.** In a later reserved job, use a
   proposed fixed root `/opt/linuxcast-f102-lab/package-input` for the
   closed repo/cache/config/gate. Create only absent protected descendants using
   fixed intake rules; no adoption/chown of foreign paths. Authenticate original
   signed indexes/keyring and all55 bodies; protect every input and interpreter
   ancestor from the transport/build UID. No mutable staged project code is ever
   imported or executed as root. Capacity admission includes77MB archive storage,
   300MB metadata estimate, actual payload/block/inode overhead, dpkg backups/
   journals, trigger caches/logs and a separately measured reserve.
3. **One real APT child.** Proposed literal executable `/usr/bin/apt-get`, cwd `/`,
   stdin `/dev/null`; array `--solver 3.0 --assume-yes --no-download --no-remove
   --no-install-recommends --no-install-suggests install` followed by the same
   55 sorted exact literal tuples from the resolution report. Freeze the complete
   array in reviewed code before use; no wildcard or user list expansion.
   The closed config selects real dpkg, real status/locks, local signed sources,
   isolated apt state/cache/logs, exact baseline preference rules and the sole
   fixed final validator. Apply the proposed no-broad-pending/no-recursive profile
   only after its offline verification. Inspect every actual dpkg operation and
   preserve private bounded progress evidence; no repair branch is admitted.
4. **Scrubbed environment.** Proposed exact base: `PATH=/usr/sbin:/usr/bin:/sbin:/bin`,
   `HOME=/opt/linuxcast-f102-lab/package-input/home`,
   `TMPDIR=/opt/linuxcast-f102-lab/package-input/tmp`,
   `LANG=C`, `LC_ALL=C`, `TZ=UTC`, `DEBIAN_FRONTEND=noninteractive`,
   `APT_CONFIG=/opt/linuxcast-f102-lab/package-input/apt.conf`. HOME and tmp are
   new root-owned private directories, separate from immutable bundle files.
   These proposed constants require coordinator freeze, never caller options.
   No inherited LD_*, locale
   path, HOME, APT/DPKG config, proxy, SSH/GPG/session/socket variables or extra
   FDs. Do not pre-set DPKG_FRONTEND_LOCKED in the outer environment; APT sets it
   only for its own children. Use fixed trusted root umask/cwd and kernel network
   denial; close external buses/activation routes, with no alternate helper PATH.
5. **Final validator and dispatch.** Under APT's retained frontend lock, obtain
   inner+trigger locks, check the exact live original state and hook list, hashes,
   handler/config custody and zero dirty facts. Read-only validator failure is a
   pre-package-mutation refusal, subject to verified absence of earlier effects.
   Release its locks and proceed only within the established writer-exclusion
   envelope. Losing that guarantee invalidates admission, not a reason to retry.
6. **Locked postflight.** Once the exact APT tree and all descendants have exited,
   obtain frontend → inner → trigger locks again; reject contention. Require all
   original767 versions/architectures/holds/selections preserved and exactly55
   approved new tuples installed/configured, no reinstreq/broken states, pending/
   awaited fields, Unincorp requests or update journals. Original raw status hash
   will naturally change; compare expected semantic state plus new retained hash.
   Check reviewed alternatives/doclinks/pkgconf and handler outcomes separately;
   preserve automatic/manual marks according to a separately frozen policy.
   The solver's empty isolated extended_states did not capture the guest's marks;
   route APT marks into private transaction state or capture/preserve them before
   any policy that writes real marks. No autoremove or synthetic restoration.
7. **Separate locale/job and build phases.** Installing55 packages does not create
   en_US.UTF-8. Later fixed `/usr/bin/localedef --no-archive --inputfile=en_US
   --charmap=UTF-8 /usr/lib/locale/en_US.utf8` may create only that absent, fixed
   directory under verified root custody, using authenticated recursive inputs.
   No locale-gen, locale archive/global default changes or locale package upgrade.
   Recheck the exact newlocale probe and package state. A partially generated
   owned directory can be removed only under explicitly reviewed identity-bound
   cleanup, with no package rollback claim. Then separate tool provisioning,
   UID20000 staging and immutable build/receipt, preserving Node-only mount and
   separate fixed Rust prefix; no compiler/product smoke run belongs to install.

Timing remains outer600s, startup<=120s, effectful job<=360s, each owned child
<=180s, cleanup<=45s, full offline test suite<=18s. Hook/lock/hash work and all
APT descendants consume that one child/job budget; batches do not reset it.
Locale/stage/build use separate reservations/jobs, not an extended install
timeout. The existing preparer keeps360s total/180s per child. APT/dpkg/ldconfig/
mandb elapsed time, RSS, output size and disk reserve are **unmeasured** here;
if the admitted job cannot fit, fail and return measured evidence for separate
review. No automatic deadline/quota increase or install rerun.

## Failure, success and cleanup semantics

| Boundary | Required outcome |
| --- | --- |
| Bad intake/config/lock/state/action/hash before package dispatch | Refuse without invoking dpkg. Remove only provably owned new non-system scratch after exact-child absence; recheck state before claiming no package mutation. APT logs/cache writes may still exist. |
| Any dpkg launch, uncertain launch bookkeeping, script/helper/trigger failure, timeout/cancel/OOM, transport or owner loss | Conservatively dirty/possibly mutated. Preserve the durable reservation/recovery marker and private phase evidence; terminate/reap only retained descendants and perform bounded pinned shutdown. No automatic reinstall, configure/trigger retry, remove, downgrade or rollback. |
| APT exits0 but postflight incomplete, pending/broken state, forbidden delta, custody loss or masked helper failure | Dirty/unverified; exit0 alone is insufficient. man-db's suppressed failure is specifically not proof of successful mandb. Either freeze a narrow read-only cache outcome check before execution or report that effect unverified. |
| Packages verified but later locale/build fails | Record package-install success separately; do not replay the55 transaction or describe the overall preparation as complete. Locale/build recovery is separately reviewed. |
| Guest stopped and host children absent | Lifecycle cleanup only. It does not undo alternatives, files, dpkg state, ldconfig/man caches or locale data. A package-dirty reservation remains dirty until new capture and manual coordinator review, even after exit0 shutdown. |

dpkg's documented error-unwind paths and Policy's idempotent-script expectation
are not a whole-transaction rollback guarantee or permission to retry uncertain
effects. APT can fail after earlier batches mutated successfully; a post hook can
fail after installation. Keep first operation failure separate from cleanup
failure, and distinguish known absence from unknown state. [Policy6][policy-scripts],
[dpkg trigger dispatch][d-process], [APT post hooks][a-install]

## Validation performed here and acceptance limits

Executed: bounded public primary-source/manual research; authenticated source
chain above; one isolated15s-bounded gpgv child, returned/reaped; no downloaded
program executed. Rehashed public package/index/audit data before binding it:
five retained audit/cache files, all188 control records including15 scripts;
read those scripts as data, and counted427 manual-path entries. Rehashed the
two new public handler packages and statically read their controls. Recorded
326 allowed public file/directory fingerprints (bytes/mode/device/inode/link
count and file SHA256) and rechecked unchanged before handoff. Private permitted
projection/plan hashes and identities were likewise rechecked. A skill-library
query returned no matches; no child-agent work occurred.

Inherited, not rerun: original767-record guest capture/cleanup; other suites'
3/2/2 signatures/freshness; APT3 actual resolution/replay; all55 signed-index/body
bindings; historical offline suites, type/lint, runtime ABI and native checks.
Freshness of installation metadata must be revalidated at admission, including
updates/security Valid-Until 2026-11-08. No actual original guest status, trigger
registrations, installed handler/helper bytes, services, disks, permits, user
data, private keys or lab logs were read. No APT/dpkg/loader/maintainer/compiler,
root/namespace/install/locale/guest/Docker/SSH/owner/native/desktop action ran.

| Criterion/gate | Contribution and limit |
| --- | --- |
| F0-01 dependency | Accepted status and criterion evidence read, not changed or reaccepted. |
| F1-02-AC01 / AC02 | No product change or new renderer/single-instance/security evidence. Existing passed criteria unchanged. |
| F1-02-PRIVACY | Private keep/status/resource bodies stay private; this report adds public sources, necessary target versions and typed missing requirements only. No new runtime acceptance. |
| F1-02-UI/native/full task | Pending. Package-source research is no desktop/Orca/Wayland/physical-input proof. |
| Build/install/release | Source semantics and a concrete coordinator proposal only. Actual writer exclusion, trigger/helper capture, custody/containment, closed implementation/review and execution/recovery evidence remain required. Full97/local1.0 preserved. |

Report-only plan/local-link/whitespace and scope checks are recorded below before
commit. No application test/build is warranted for this one-document change;
no historical18s suite result is presented as freshly executed.

Executed report checks: `python3 scripts/validate_plan.py` passes (279 sources,
57 features,97 tasks,135 Markdown files,7 SVG assets); all24 local Markdown links,
43 primary-source reference definitions and60 reference uses resolve locally/
structurally; permitted326 public fingerprints and four private input identities
remain unchanged. Final staged scope and whitespace checks precede the commit.
External URL availability and future runtime behavior are not validated by the
plan checker. Staged whitespace/scope checks passed with exactly this new file.
The one normal configured-signing attempt, bounded below30s, failed immediately:
`1Password: Could not connect to socket. Is the agent running?` No commit object
was written. The user's explicit per-command `git -c commit.gpgsign=false`
fallback is used for this research commit; it is honestly unsigned. No persistent
signing configuration changes, release-signing waiver or publication follows.

## Versioned source register

Line anchors are navigation into exact source versions; authenticated tar bytes
above remain authoritative. Relevant APT source hashes exactly match the earlier
resolution research: debsystem.cc `ba79cbe8b391f2fc9597e7c995ba7f075b8d2bceb8d8c23626570d56f085562a`,
dpkgpm.cc `c117a5c0767cf979e28829829641eea78dc2c88b13794939e73c227d52494acf`,
private-install.cc `65eb1ce272ca9efdd5794fe718ea0f07f2719f941fd880b71295539095672f97`,
acquire-item.cc `a567649e6d8611e7733f34b570f561959f7fdfaa1c888377395e88d3752cc82c`.
dpkg1.22.22 dbmodify.c SHA256
`b12cc4fc7985a790744953773e76cc6be4ed8ce2a0de83ae3e00aef9bf0d3026`,
triglib.c `bd9ca4e565e4ef71effc29aa16ee8a7af79d8013b64d09c82eea41a5e9369529`,
trigdeferred.c `0c7ea5f1575392c89a8b0d265c6ede7b157634453f2636a74de3b3a031ff9574`,
trigger spec `7335edb7538bdf32f8b888b367a16349883aabca5acbbe6fb6d9cb6186a343ae`.
Raw public sources, source-index stanzas, verifier output and fingerprints remain
in the owned private scratch root; no raw baseline or downloaded code enters Git.

[sources-index]: https://deb.debian.org/debian/dists/trixie/main/source/Sources.xz
[apt-dsc]: https://deb.debian.org/debian/pool/main/a/apt/apt_3.0.3.dsc
[apt-tar]: https://deb.debian.org/debian/pool/main/a/apt/apt_3.0.3.tar.xz
[dpkg-dsc]: https://deb.debian.org/debian/pool/main/d/dpkg/dpkg_1.22.22.dsc
[dpkg-tar]: https://deb.debian.org/debian/pool/main/d/dpkg/dpkg_1.22.22.tar.xz
[a-lock]: https://sources.debian.org/src/apt/3.0.3/apt-pkg/contrib/fileutl.cc/#L250
[a-sim]: https://sources.debian.org/src/apt/3.0.3/apt-private/private-main.cc/#L55
[a-cache]: https://sources.debian.org/src/apt/3.0.3/apt-pkg/cachefile.cc/#L111
[a-system]: https://sources.debian.org/src/apt/3.0.3/apt-pkg/deb/debsystem.cc/#L112
[a-install]: https://sources.debian.org/src/apt/3.0.3/apt-private/private-install.cc/#L200
[a-handoff]: https://sources.debian.org/src/apt/3.0.3/apt-private/private-install.cc/#L562
[a-go]: https://sources.debian.org/src/apt/3.0.3/apt-pkg/deb/dpkgpm.cc/#L1559
[a-dpkg-env]: https://sources.debian.org/src/apt/3.0.3/apt-pkg/deb/dpkgpm.cc/#L2050
[a-protocol]: https://sources.debian.org/src/apt/3.0.3/apt-pkg/deb/dpkgpm.cc/#L297
[a-batches]: https://sources.debian.org/src/apt/3.0.3/apt-pkg/deb/dpkgpm.cc/#L1731
[a-init]: https://sources.debian.org/src/apt/3.0.3/apt-pkg/init.cc/#L231
[a-nodownload]: https://sources.debian.org/src/apt/3.0.3/apt-private/private-install.cc/#L165
[a-archive]: https://sources.debian.org/src/apt/3.0.3/apt-pkg/acquire-item.cc/#L3380
[a-cache-body]: https://sources.debian.org/src/apt/3.0.3/apt-pkg/acquire-item.cc/#L3528
[d-lock]: https://sources.debian.org/src/dpkg/1.22.22/lib/dpkg/file.c/#L295
[d-system]: https://sources.debian.org/src/dpkg/1.22.22/lib/dpkg/dbmodify.c/#L240
[d-open]: https://sources.debian.org/src/dpkg/1.22.22/lib/dpkg/dbmodify.c/#L306
[d-main]: https://sources.debian.org/src/dpkg/1.22.22/src/main/main.c/#L786
[d-options]: https://sources.debian.org/src/dpkg/1.22.22/lib/dpkg/options.c/#L164
[d-archives]: https://sources.debian.org/src/dpkg/1.22.22/src/main/archives.c/#L1491
[d-deferred]: https://sources.debian.org/src/dpkg/1.22.22/lib/dpkg/trigdeferred.c/#L73
[d-parser]: https://sources.debian.org/src/dpkg/1.22.22/lib/dpkg/triglib.c/#L710
[d-path]: https://sources.debian.org/src/dpkg/1.22.22/lib/dpkg/triglib.c/#L527
[d-registry]: https://sources.debian.org/src/dpkg/1.22.22/lib/dpkg/triglib.c/#L275
[d-incorporate]: https://sources.debian.org/src/dpkg/1.22.22/lib/dpkg/triglib.c/#L814
[d-process]: https://sources.debian.org/src/dpkg/1.22.22/src/main/trigproc.c/#L451
[d-script]: https://sources.debian.org/src/dpkg/1.22.22/src/main/script.c/#L171
[d-archive-trigger]: https://sources.debian.org/src/dpkg/1.22.22/src/main/archives.c/#L735
[d-unpack-trigger]: https://sources.debian.org/src/dpkg/1.22.22/src/main/unpack.c/#L725
[d-spec-path]: https://sources.debian.org/src/dpkg/1.22.22/doc/spec/triggers.txt/#L260
[d-spec-state]: https://sources.debian.org/src/dpkg/1.22.22/doc/spec/triggers.txt/#L707
[d-transitional]: https://sources.debian.org/src/dpkg/1.22.22/doc/spec/triggers.txt/#L773
[apt-conf]: https://manpages.debian.org/trixie/apt/apt.conf.5.en.html
[deb-triggers]: https://manpages.debian.org/trixie/dpkg-dev/deb-triggers.5.en.html
[policy-scripts]: https://www.debian.org/doc/debian-policy/ch-maintainerscripts.html
[fcntl]: https://man7.org/linux/man-pages/man2/F_SETLK.2const.html
[libc-deb]: https://deb.debian.org/debian/pool/main/g/glibc/libc-bin_2.41-12+deb13u4_amd64.deb
[man-deb]: https://deb.debian.org/debian/pool/main/m/man-db/man-db_2.13.1-1_amd64.deb
