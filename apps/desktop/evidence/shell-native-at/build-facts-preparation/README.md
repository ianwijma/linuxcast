# F1-02 offline read-only build-facts preparation

Implementation only, 2 November 2026. **Actual owner/guest/build/native/Orca
runs: zero. No permit created.** Independent review is next; only the coordinator
may seal a fresh reviewed source/permit and perform the first actual capture.
No task, criterion, authority, receipt, archive or historical evidence is promoted.
Full97/local1.0 and every outstanding release/session/AT gate remain mandatory.

Prepared checkout `/home/ian/.t3/worktrees/linuxcast/t3-51c711b5` started clean at
exact coordinator HEAD `393f9da0a3e384ed6a15e18a1973d111494f19c8`, whose parent is
approved PR101 merge `4f47e531437b9f15501afc4de79309d74c5f2c29`. Renamed existing
prepared branch to `codex/f1-02-build-facts-owner`; no checkout creation, import,
cherry-pick, merge or reset. Final commit/tree/signing outcome is supplied in the
handoff, avoiding self-referential hashes.

Only new `lab_build_facts.py`, `test_lab_build_facts.py` and this directory are
owned. All existing base/inventory/native/controller/namespace/staging code,
contracts, inventories, source pins, receipts, dependencies/lockfiles, runner
mapping, registry, progress and task cards are unchanged. No push, PR or watch.

The coordinator [build-facts protocol](../../../tests/at/build-facts-protocol.md)
is primary. [snapshot-schema.md](snapshot-schema.md) froze exact nested keys/types
before implementation. The locale probe was subsequently clarified to use all
glibc locale categories, with no shape change. Read PLAN/GOAL/F1-02/registry,
architecture overview/stack/security, testing-release/design review gate,
outer/inventory/controller protocols and wrapper/source/build-provisioning
preparation evidence. F0-01 accepted; F1-02 in-progress/UI pending are inherited.
The skill-library gateway returned no matching skills; no agents were delegated.

## Implemented behavior

The separate closed CLI has only the two reviewed-build-facts acknowledgements.
Its separate private0400 permit has exactly14 keys, canonical UUID4 capture nonce,
fixed linuxcast/sudo-noninteractive and three exact source hashes. Native and
inventory domains cannot authorize this job or consume its marker. The verified
UID1000/account route is coordinator-confirmed context, not new execution proof.
No permit-writing interface exists in implementation.

Small subclasses reuse the unchanged reservation/marker, configuration inspection,
start accounting, exact retained children, readiness budget, guardian/caller
lifetime, interrupted recovery and poweroff/stop/kill cleanup. Only fixed quoted
embedded Python source is dispatched, once, under30s; readiness repeats only true.
Guest alarm25s/startup120s/total600s/cleanup45s and transport65536 remain unchanged.
A snapshot collision refuses fresh work before marker/start. Valid interrupted
marker recovery takes priority over that collision and never replays facts.

Guest collection is inert source data, never imported/executed as a host probe.
Existing no-follow/root-owned/single-link read-only descriptors take nonblocking
POSIX shared dpkg frontend then database locks. Both stay open through metadata
read, retained status byte/stamp/path revalidation and pending/architecture checks.
No lock is created, truncated or chmodded. Status<=8MiB,4096 stanzas,128KiB/stanza,
16KiB/line/field. Deb822 parsing checks discarded fields too, case-insensitive
duplicates, colon/whitespace/continuations, mandatory identity/status and strict
Debian versions/selection/state/enums. It preserves field presence, holds,
uninstalled records and broken states, sorts unique name/architecture pairs and
exports exactly the15 permitted fields. No descriptions/user paths are exported.

An empty stable updates directory and empty/absent Unincorp are required;
unreadable or nonempty journals/triggers fail rather than claiming a clean
baseline. Broken records remain observed with clean=false; holds never authorize
an upgrade. Native architecture comes from the installed amd64 dpkg package
record, cross-checked with Debian13/x86_64; foreign configuration is read from
dpkg's arch file. Missing arch file means no configured foreign architectures;
unreadable, duplicate or incomplete present lists fail. No dpkg child is needed.
This documents the metadata source, not an independent binary architecture
attestation. [Primary retrieval hashes](primary-sources.json) record dpkg1.22.22
arch.c/dbmodify.c/parsehelp.c and glibc2.41 locale.h. The first web-tool reads of
git.dpkg.org failed; bounded public upstream HTTPS reads succeeded. No host dpkg
command or package database was read. These links are evidence, never authority.

Only the three fixed filesystem capacities, bounded MemTotal/MemAvailable, own
affinity count, a temporary libc newlocale/freelocale handle for en_US.UTF-8 and
the fixed public Debian keyring digest/size are collected. Missing parents,
locale or keyring are known missing facts with null capacities/digest; I/O and
permission failures remain unknown and prevent an observed packet. Zero capacity
is a known observation, never a fabricated replacement for unknown. No global
locale mutation, key bytes, credential, user content, process scan, service,
namespace, UID provisioning, network, device or resource limit operation occurs.

## Wire, publication and failure boundaries

Canonical sorted ASCII JSON snapshot<=2097152 bytes is zlib+canonical-base64
encoded into exactly seven packet fields, total<=60000 bytes. Independent host
schema/cross-field validation rejects JSON duplicates/nonfinite/bool integers,
unknown keys, bad ordering/status/hold/architecture/keyring relationships and
unknown resources. Allocation is bounded to declared+1 before decompression;
EOF, exact size/hash/canonical snapshot and no trailing/concatenated stream are
mandatory. Valid unavailable packets retain their fixed firstFailure with no
empty package baseline. Exit0 iff observed/none; unavailable exits3.

Exclusive no-follow0400 private artifact creation is relative to the retained
lab-root FD. Short writes loop; zero/lying writes, readback, fsync, close and
replacement faults refuse a publication claim. The writer is closed without
retrying an ambiguous Linux close, then reopened against the retained identity.
Uncertain partial/replacement files are preserved, never deleted/adopted. Such
failure does not block exact child/guest shutdown; it prevents clean marker
release. Atomically committed reply+artifact+validity survive interruption on
either side of the single dict publication. First operation and cleanup failures
stay separate, with may-have-started/dispatched accounting retained.

The real guardian carries only unchanged lifecycle plus fixed compact summary and
private device/inode metadata, <=4096 bytes. The caller reopens and independently
checks the same private artifact. Public output<=4096 strips identity metadata
and includes only schema/jobKind/lifecycle/buildFacts/acceptance=pending. No package
body, path, PID, machine identity, native count, source or exception reaches it.
The full exact shape and null/status relationships are in the frozen schema.

## Offline evidence and fault controls

[validation.json](validation.json) records executed checks/platform; [sha256.json](sha256.json)
binds new source/test/evidence and unchanged inputs. Ordinary process fixtures use
the reviewed independent FixtureGuard (start gate, pidfd custody, hard bounded
termination, exact reaping/ECHILD), never process-name-wide actions. They prove a
private POSIX lock writer excludes the reader and that the unchanged actual
local guardian relays success/unavailable/partial-publication results. The guest
adapter maps only synthetic temporary files; UID, OS, capacity, affinity and libc
are injected. No host package DB, locale, keyring or resource probe is used.

Behavioral fault controls deliberately remove one check only in isolated test
scope: duplicate-field rejection, decoder unused-stream rejection, artifact
readback. Each broken variant admits the corresponding real malformed/extra-stream/
empty-artifact fixture; the actual implementation rejects it. No production
clock/deadline/guard was weakened to shorten tests. Interruption trace controls
exercise before/after publication; syscall controls exercise missing/denied,
concurrency/replacement, short/zero/lying writes, fsync and ambiguous close.

Dependencies were initially absent. A scoped
`bun install --offline --frozen-lockfile --backend=copyfile --ignore-scripts`
completed from the available package cache (Bun's generic summary said resolved/
downloaded/extracted1). No lifecycle scripts, Electron setup, addon/native build,
guest install or lab network request was performed. Generated dependencies are
ignored and source/lockfiles unchanged. Pinned Node24.22.1/Bun1.4.4 were executed;
Rust1.95 is inherited pinned context and was not needed/executed.

The prepared worktree source modes are0664; production source-pinning correctly
rejects them. Source-pin tests use protected private byte-identical copies, as
existing reviewed tests do. No existing file mode was changed or source-custody
check relaxed. A future coordinator invocation requires sealed protected sources.

## Acceptance mapping and coordinator handoff

| Criterion | Contribution | Remaining evidence |
| --- | --- | --- |
| F1-02-AC01 | Separate metadata authority and strict no-native-admission/transport/schema checks; mapped existing security remains passing | No new renderer/desktop execution; existing acceptance unchanged |
| F1-02-AC02 | Same shared bounded owner/recovery/accounting, single fixed dispatch | No singleton/deep-link/native behavior change or runtime evidence |
| F1-02-UI | Read-only package/resource preparation for future immutable guest build | Still pending; no UI changes/screenshots, Debian desktop/Orca/session proof |
| F1-02-PRIVACY | Synthetic fixtures, projected metadata only, private artifact, bounded public summary | First real capture/transport/custody/recovery remain coordinator-only after review |

No shared code change is requested. Coordinator must independently review the
implementation and frozen schema, retain the exact three reviewed hashes, seal
protected source custody, issue a fresh same-domain14-key permit, and supervise
the first actual capture/transport/shutdown/recovery. Actual facts, namespace/
rootdrop/statx integration, UID20000 preparation, current source/archive/build/
receipt/native authority reconciliation and native/UI/AT/full97/local1.0 gates
remain pending. The current older native authority deliberately still rejects
newer preparations. This metadata cannot authorize package installation or build.
