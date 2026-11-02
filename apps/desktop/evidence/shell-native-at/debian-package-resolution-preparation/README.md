# Exact Debian 13 package resolution preparation

Executed 2 November 2026 UTC, non-UI research only. **Debian APT 3.0.3's built-in
3.0 solver produced and replayed an exact candidate transaction: 55 new packages,
767 installed packages kept, zero upgrades, downgrades, removals or held changes.**
The missing `en_US.UTF-8` requires later generation, with no additional locale
package needed for this captured baseline. No package installation, generation,
compiler/build, guest, native product, ABI, desktop or accessibility proof follows.

Starting HEAD `d70ecc9aea1764c7b4092c804ef5f812953e13e2`, approved PR105 base
`bf4b49261abab0ac3e8424fabc4afafdd5e93eda`; isolated branch renamed to
`codex/f1-02-debian-package-resolution`. Only this README is an owned tracked
change. The final commit/tree/signature and clean status are reported at handoff;
a report cannot contain its own commit ID. No imports, merges, pushes, PRs,
watches, delegates or task/criterion edits occurred.

## Scope and retained private evidence

Read AGENTS, [GOAL](../../../../../docs/implementation/GOAL.md),
[PLAN](../../../../../docs/PLAN.md), [F1-02](../../../../../docs/implementation/tasks/F1-02.md),
its [registry](../../../../../docs/implementation/tasks.json), normative
[overview](../../../../../docs/architecture/overview.md),
[security](../../../../../docs/architecture/security.md),
[stack](../../../../../docs/architecture/stack.md) and
[testing/release](../../../../../docs/implementation/testing-release.md).
F0-01 is accepted; F1-02 is in-progress with UI/native/full-task gates pending.
The full 97-task local 1.0 goal remains unchanged. Applied the research skill's
primary-source/single-report workflow personally, as explicitly requested; no
background agent or paid/private-provider skill query was used.

Also read the [prior provisioning research](../build-provisioning-research/README.md)
and its source register, [build-facts protocol](../../../tests/at/build-facts-protocol.md),
[snapshot schema](../build-facts-preparation/snapshot-schema.md), current
[product_staging.py](../../../tests/at/product_staging.py),
[actual capture](../canonical-keyring-actual-20261102/README.md) and
[public keyring reconciliation](../packaged-keyring-reconciliation-20261102/README.md).
The existing preparation still resets PATH to Node's directory plus `/usr/bin:/bin`,
runs SQLite rebuild then the desktop build, and requires frozen caches/receipt
custody. This solver run changes none of those interfaces or pending gates.
The minimal roots follow current [build.ts](../../../build.ts),
[setup-sqlite.ts](../../../setup-sqlite.ts) and the direct GIO/GObject/GLib links in
[applications.rs](../../../../../native/platform/src/applications.rs).

All scratch artifacts are retained under this newly created caller-owned0700 root:

```text
/tmp/f102-debian-resolution-haf7i667
```

`full-plan.private.json` contains every keep/install tuple and relationship,
source bindings, ordered command records and estimates. The full baseline,
`facts.json`, per-package policy output and raw solver stdout remain private.
No package bodies, full installed-version list or resource values appear here.
The original allowed input roots were read-only; no private lab path was read.
The projection was copied only into this new solver root, never into guest/host
dpkg state. Its digest is not the original guest status digest.

Private full-plan identity: **213796 bytes**, SHA256
`495b3acfe8b4c6ed0af811decb84c776da7d4974388c4ca1b37a3e88713363f3`.

## Input authentication and freshness

The permitted projection's strict provenance key set, schema/kind, capture ID,
767 count, file sizes/digests and distinct snapshot/projected/original-status
identities were checked before consumption. Duplicate JSON keys and nonfinite
numbers refuse. All supplied package/fact fields were checked using the current
inert `lab_build_facts.validate_snapshot` validator: fixed identity/OS constants
only supplied its envelope, not a new guest observation or reconstruction of
the unavailable original full snapshot. Holds, configured architectures, clean
pending state, locale and keyring consistency were checked explicitly. The
separate original guest status digest/size remain in private provenance.

| Input identity | SHA256 |
| --- | --- |
| Canonical captured snapshot (inherited, not read from lab) | `4fc728c09b869f4cae66ed058adb32d1d92804ca2862cf42cc7fbbb285364196` |
| Projected solver status, 224920 bytes | `4786a2907757f76af0c1b01f36cb7f884b30cd36ef70d047fb2719d9be23c8b8` |
| Permitted facts, 1142 bytes | `53aeee03fb194b739a5246c97fdf445884634314a427473bee27814e589afcd7` |
| Permitted provenance | `40d5830ab95ddebdd78d53bc4cd95041394cc8c3ab450175cd01c478867ff2a6` |
| Guest-matching public packaged keyring, 55918 bytes | `506b815cbb32d9b6066b4a2aa524071e071761e7e7f68c3ac74f3061ba852017` |

Fresh independent verification began `2026-11-02T03:18:45.129773+00:00`. All three InRelease
payloads were verified with isolated `gpgv`, no user keyring, and the exact public
packaged keyring matching the recorded guest fact. Verified cleartexts byte-equal
the cached Release files. Each entire original compressed and expanded Packages
index matches its exact signed SHA256/size; no trimming or rewriting occurred.
Release Origin, Codename, amd64 eligibility, Date and explicit Valid-Until were
checked. The matching `debian-archive-keyring_2025.1_all.deb` was also rehashed
against the authenticated index (179244 bytes,
`9ea7778e443144ca490668737a8ab22dd3e748bb99e805e22ec055abeb3c7fac`), and its
regular canonical keyring bytes rechecked in memory. Initial HTTPS-fingerprint/
guest-image trust remains the inherited assumption, not a newly audited trust root.
This is the Debian [Release → index → artifact chain](https://manpages.debian.org/trixie/apt/apt-secure.8.en.html),
not an individual package signature claim.

| Suite / component / architectures | Date UTC | Explicit expiry UTC | Fresh valid signatures |
| --- | --- | --- | --- |
| trixie / main / amd64 + all | 2026-09-12 07:55:41 | none declared | 3 |
| trixie-updates / main / amd64 + all | 2026-11-01 08:09:02 | 2026-11-08 08:09:02 | 2 |
| trixie-security / main / amd64 + all | 2026-11-01 12:12:11 | 2026-11-08 12:12:11 | 2 |

Stable's absence of explicit expiry was preserved; no exemption was invented.
Security's signed component label is `updates/main`, while its index path is
`main/binary-amd64/Packages`; both bindings were retained. Dates were rechecked
again during final private validation. This plan must be refreshed or revalidated
before later use, particularly after those explicit expiry times.

| Suite | Original Packages.xz bytes / SHA256 | Expanded Packages bytes / SHA256 |
| --- | --- | --- |
| trixie | 9678380 / `7778d3e3f303b7ddb8ce0fe7c8d57473a076c6bf2e8f241f75421d2396352498` | 56620099 / `4f2c68d67001d595fbd343f6dbad44468953a51c4d9dec3a4803249f6e295940` |
| trixie-security | 291652 / `a05d49ec16890db9bdbbe25ecbcb9d106d06bbaf410b4420fb9f2575c777a7e6` | 2112942 / `d62ad8b70281f4319324ce053ea47d8a8bfbeeb98e3456119113024cf0a5ef9c` |
| trixie-updates | 1108 / `7b52592d46eb9bf694ffd99b90fb521064a6bfd1d0a9f69f22cabf31cb7ea38e` | 2351 / `f11dc066868a4a595e364dd24cab9eaa2c6cca758bd855a7bbe3ea4c320911fb` |

| Suite | InRelease SHA256 | Verified Release SHA256 |
| --- | --- | --- |
| trixie | `0584fba32e13e0ab8285fb16c27adea1ec03a73669c18702821094fd6ca86675` | `ed56aac47e7911e65ee63aae8d67e29f20e023f840e49f8ed037043a33de138a` |
| trixie-security | `6f64e49b0c96174839bc6ba03d22d97ffe96c746602b9a413779324673e098fc` | `9ca5555dfde56b42f06f2fdc707a5b07e49f086fe4552d79a99ac8dc7990dfbb` |
| trixie-updates | `878f891a824d2420ad5a386c2b7d6ef79cd89e961f48c7a9a1db1bca7ed02bfe` | `c522a15652467833de10a00482b9a0097fec07c77082e8a75d69205881be4814` |

## Verified APT execution and isolation

Host platform/tool versions (not a Debian native test):

- `gpgv`: `gpgv (GnuPG) 2.2.27`.
- `readelf`: `GNU readelf (GNU Binutils for Ubuntu) 2.38`.
- `git`: `git version 2.34.1`.
- `python`: `3.10.12 (main, Aug 31 2026, 10:18:17) [GCC 11.4.0]`.
- `platform`: `Linux-7.1.1-76070101-generic-x86_64-with-glibc2.35`.
- `machine`: `x86_64`.
- `atUtc`: `2026-11-02T03:27:03.361334+00:00`.
- `apt`: `apt 3.0.3 (amd64)`.

The host's APT was never executed. Sixteen authenticated Debian13 runtime
packages (10170736 downloaded bytes) supplied the unmodified APT3 executables,
Debian glibc loader and their libraries. Public `.deb` acquisition used fixed
signed-index Filename/Size/SHA256 bindings, HTTPS, no ambient proxy handler,
bounded reads and no-replace creation. Downloads were at most15MB per runtime
artifact. ar/tar inspection admitted bounded plain members; traversal, sparse
and special files refused. Archive links were never created or followed.
Only selected regular ELF files were copied into the fresh private runtime;
SONAME aliases are independently copied identical bytes, not archive links.
No control/maintainer script, installer or root consumer ran.

`readelf -h -l -d -V` inspected each selected ELF without `ldd`. Every DT_NEEDED
entry was present. The verified Debian loader's `--list` confirmed that every
disk library for apt-get resolved inside this runtime; the kernel vDSO is the
only non-file mapping. Version/simulation success checks the load route, not
product/toolchain ABI. Runtime package selection was solely for this isolated
loader route; it is not a handwritten substitute for the transaction solver.
The complete runtime artifact/file/DT_NEEDED manifest and readelf outputs remain
private (`runtime-manifest-16.json`, `inspection/`, `runtime-loader-list.stdout`).

| Runtime package tuple | Artifact bytes | Authenticated artifact SHA256 |
| --- | --- | --- |
| `apt:amd64=3.0.3` | 1452192 | `55e341fbe92d7502c98faf1b3c235393ea0744db119cf2173603e965b658aef4` |
| `libapt-pkg7.0:amd64=3.0.3` | 1112916 | `fdcc9f780c7de466c7f0038e6e242c73cb63c8f9fe2781a3185a2c810984ab0a` |
| `libc6:amd64=2.41-12+deb13u4` | 2846580 | `967aa62605721081c3eb2a17650611a792aa802d76a6511d1840242623d204c9` |
| `libstdc++6:amd64=14.2.0-19` | 713628 | `ab1fa05837aa7a92aae748fd07a18a35f7d18bb4a71c4724fe2bbf0e32089de0` |
| `libgcc-s1:amd64=14.2.0-19` | 72772 | `3c71917b490d1a17aed43196a2787a256ecf060526cdb20216a74bedc061b150` |
| `libseccomp2:amd64=2.6.0-2` | 51712 | `89d5138e05fb6a86b9afd8b54dc0fb4b14f4c27c05e6c5f767c2132bdf808531` |
| `libssl3t64:amd64=3.5.7-1~deb13u2` | 2453872 | `916f7f40b34a06e6ebfaefcdab331bff458328411da672598f126a760472467d` |
| `libsystemd0:amd64=257.13-1~deb13u1` | 454648 | `ab0d4127b5e46e6f8c015a1db15a62ba9ae274cdefa150083adf90ada0600ea1` |
| `libbz2-1.0:amd64=1.0.8-6` | 37912 | `cba4cda04244b5e481bb15524bc3c983a7d1b6f330013b9b381706a2fcb65310` |
| `liblz4-1:amd64=1.10.0-4` | 63900 | `c31ec4c7c82755a38b2f3fe066fc0c5518cc91a601a268fbcd19bdacb1f22e1e` |
| `liblzma5:amd64=5.8.1-1+deb13u1` | 309492 | `1cfcc6e0dc36f438a79b6e2189facdb9d150b08f57d190a60e01c98075c7f896` |
| `libudev1:amd64=257.13-1~deb13u1` | 152300 | `5d41c284f5a93b05bc7d648b61a02dd2bb9ff05b2261ad1a8b7d96044a0cfa88` |
| `libxxhash0:amd64=0.8.3-2` | 27096 | `81da7064d56fc044f5db4bb3c1e80ff50a4986dcbbf80d958eeca565b44c157f` |
| `libzstd1:amd64=1.5.7+dfsg-1` | 303836 | `2f6a2aeacfc925eba8b00ac9139bc4bfccf8cacb09eb93de067074b26948eef9` |
| `zlib1g:amd64=1:1.3.dfsg+really1.3.1-1+b1` | 88892 | `015be740d6236ad114582dea500c1d907f29e16d6db00566ca32fb68d71ac90d` |
| `libcap2:amd64=1:2.75-10+deb13u1+b3` | 28988 | `89fc4d34fc7a28ad6f0fcd0c561ab253b9dedf6f77f5a000b47c276c8295bf67` |

All APT invocations used this exact loader prefix (no shell, chroot, namespace,
container, guest or installed-runtime fallback):

```text
/tmp/f102-debian-resolution-haf7i667/runtime/ld-linux-x86-64.so.2
  --inhibit-cache
  --library-path /tmp/f102-debian-resolution-haf7i667/runtime
  /tmp/f102-debian-resolution-haf7i667/runtime/<apt-get|apt-config|apt-cache>
```

The explicit scrubbed child environment is exactly:

```json
{
  "PATH": "/tmp/f102-debian-resolution-haf7i667/empty-bin",
  "HOME": "/tmp/f102-debian-resolution-haf7i667/home",
  "TMPDIR": "/tmp/f102-debian-resolution-haf7i667/tmp",
  "LC_ALL": "C",
  "LANG": "C",
  "TZ": "UTC",
  "APT_CONFIG": "/tmp/f102-debian-resolution-haf7i667/apt-final.conf",
  "OPENSSL_CONF": "/tmp/f102-debian-resolution-haf7i667/etc/openssl-empty.conf",
  "OPENSSL_MODULES": "/tmp/f102-debian-resolution-haf7i667/empty-bin"
}
```

`APT_CONFIG` is loaded before any configuration parts, as specified by
[apt.conf](https://manpages.debian.org/trixie/apt/apt.conf.5.en.html) and
[APT3 init.cc](https://sources.debian.org/src/apt/3.0.3/apt-pkg/init.cc/).
Final `apt-config dump` was retained and audited: no `/etc`, `/var`, `/usr` or
`/bin` absolute path remains in the effective configuration. Under the private
root, these explicit path controls apply:

| APT setting | Private location / policy |
| --- | --- |
| Dir | the new root above |
| Dir::Etc, parts, main | `etc`, empty `etc/apt.conf.d`, empty `etc/apt.conf` |
| sourcelist / sourceparts | fixed three-suite `etc/sources.list` / empty `etc/sources.list.d` |
| preferences / preferencesparts | generated baseline-preserving `etc/preferences` / empty `etc/preferences.d` |
| netrc / netrcparts | empty `etc/auth.conf` / empty `etc/auth.conf.d` |
| trusted / trustedparts | empty `etc/trusted.gpg` / empty `etc/trusted.gpg.d`; each source Signed-By is the verified private `keyring.pgp` copy |
| Dir::State, lists, status | `state`, `state/lists`, explicitly the captured projection copy `status` |
| extended_states / cdroms | empty `state/extended_states` / absent `state/cdroms.list` |
| Dir::Cache, archives, pkgcache, srcpkgcache | `cache`, `cache/archives`, `cache/pkgcache.bin`, `cache/srcpkgcache.bin` |
| Dir::Log, Terminal, History, Planner | `log`, `log/term.log`, `log/history.log`, `log/planner.log` |
| Dir::Bin dpkg, apt-key, gpg, gpgv, sqv, compressors | absent executables in `empty-bin` |
| methods, solvers, planners (including compiled-in list children) | only `empty-bin`; built-in solver `3.0` selected |
| DPkg::Path | only `empty-bin` |
| architectures / system | only `amd64` / Debian dpkg interface; index Architecture:all remains eligible |
| hooks | pre/post-invoke and pre-install/update hook lists explicitly cleared; no ambient configs loaded |
| proxies / acquisition | no inherited environment proxy; HTTP/HTTPS/FTP proxy false; zero retries; missing method executables; NoQueue true |
| safety | Simulate true, Download false, Remove false; no allow-downgrades/held changes/unauthenticated/insecure/date bypass |

All installed packages receive two specific preferences, in this order: exact
captured version priority1001, then all other versions priority-1. No Debian
version comparator or alternative/provider resolver was reimplemented. APT's
own per-package policy output confirmed **all767 installed candidates equal their
captured installed versions**. There are no holds or foreign architectures.
Empty isolated extended_states treats the baseline as manual, conservatively;
the capture does not include original automatic/manual marks, so this is not
a claim to preserve or authorize rewriting those marks. No autoremove ran.

## Commands, stopped attempt and successful solver evidence

The first `minimal-frozen` run exited100, because APT initialized archive method
metadata before its simulation branch and the isolated `https` helper was absent.
It did not produce a complete transaction and is not used as closure evidence.
The initial effective config also exposed compiled-in executable search-list
children; these were cleared/redirection completed before the final runs. No
ambient executable or acquisition method was allowed to run.

Upstream APT3 [pkgAcqArchive](https://sources.debian.org/src/apt/3.0.3/apt-pkg/acquire-item.cc/#L3559)
provides `Debug::pkgAcqArchive::NoQueue`, explicitly intended for preparing order
without archive download. Setting it true returns before QueueURI; this corrects
the method-initialization blocker while retaining actual dependency resolution
and simulation ordering. [private-install.cc](https://sources.debian.org/src/apt/3.0.3/apt-private/private-install.cc/#L252)
constructs archive items before its later `pkgSimulate` branch. No fake `.deb`,
method wrapper, modified binary, unsigned index or authentication bypass was
introduced. NoQueue's simulated complete/local bookkeeping is not proof that
the candidate archives are present or authenticated on disk.

Exact APT arguments, after the loader prefix above:

```text
apt-get --version
apt-config dump
apt-get --simulate --no-download --no-remove check
apt-get --simulate --no-download --no-remove --no-install-recommends --no-install-suggests install g++ make libgio-2.0-dev locales
# The preceding request first failed with the initial config; it succeeded after the final config below.
apt-config dump
apt-get --simulate --no-download --no-remove check
apt-get --simulate --no-download --no-remove --no-install-recommends --no-install-suggests install g++ make libgio-2.0-dev
apt-get --simulate --no-download --no-remove --no-install-recommends --no-install-suggests install g++ make libgio-2.0-dev locales
apt-get --simulate --no-download --no-remove --no-install-recommends --no-install-suggests install <all 55 sorted exact tuples in the table below>
apt-cache policy <all 767 sorted installed package names, retained privately>
```

The first four calls used `apt-isolated.conf`; the remaining calls used
`apt-final.conf`, whose changes clear executable subtrees, redirect compressors/
dpkg PATH and enable NoQueue. The private command arrays contain every literal
argument, including all55 frozen tuples and the private767-name policy query.
The loader-list command was the same loader prefix with `--list` before the
apt-get binary. All final commands exited0; final solver stderr was empty.
Both minimal-root and locale-inclusive simulations selected identical55 Inst/
Conf records. Exact-tuple replay reproduced their installation/configuration
ordering byte-for-byte. The baseline dependency check passed before and after
the final configuration correction.

The exact successful stdout summary was:

```text
0 upgraded, 55 newly installed, 0 to remove and 0 not upgraded.
```

The `0 not upgraded` reflects this preservation policy, not a general assertion
that every Debian package has no newer available version. APT3 resolves the full
unmodified index against captured versions, including Depends, Pre-Depends,
alternatives, versioned Provides, Multi-Arch and Breaks/Conflicts using Debian
ordering. [Debian Policy relationships](https://www.debian.org/doc/debian-policy/ch-relationships.html)
and [apt-get simulation](https://manpages.debian.org/trixie/apt/apt-get.8.en.html)
are the primary semantics. This is a concrete solver result, not a separately
verified formal proof of APT's implementation or a synthetic handwritten closure.

A first private export validation stopped on differing Filename values for the
same util-linux version in stable/security. It was a bookkeeping refusal after
successful resolution, not a solver failure. Those entries have identical
Size/SHA256 and relationship fields; stable uses `pool/main`, security uses
`pool/updates/main`. The corrected export retains both authenticated locations
and checks byte/relationship equality without demanding identical URLs.
`freeze-attempt1.py` preserves the original stopped exporter.

Exact private orchestration entry points, executed with isolated Python flags:

```text
python3 -I -B /tmp/f102-debian-resolution-haf7i667/prepare.py
/usr/bin/python3 -I -B /tmp/f102-debian-resolution-haf7i667/runtime.py apt libapt-pkg7.0 libc6 libstdc++6 libgcc-s1 libseccomp2 libssl3t64 libsystemd0 libbz2-1.0 liblz4-1 liblzma5 libudev1 libxxhash0 libzstd1 zlib1g libcap2
/usr/bin/python3 -I -B /tmp/f102-debian-resolution-haf7i667/solve.py
/usr/bin/python3 -I -B /tmp/f102-debian-resolution-haf7i667/refine.py
/usr/bin/python3 -I -B /tmp/f102-debian-resolution-haf7i667/freeze.py
# freeze.py first refused the URL equality assumption; corrected invocation then passed.
/usr/bin/python3 -I -B /tmp/f102-debian-resolution-haf7i667/runtime.py locales libc-l10n libc-bin
/usr/bin/python3 -I -B /tmp/f102-debian-resolution-haf7i667/inspect-locale.py
/usr/bin/python3 -I -B /tmp/f102-debian-resolution-haf7i667/final-check.py
```

Other external child argv were fixed `gpgv --homedir <own gnupg> --keyring
<own keyring.pgp> --status-fd 1 --output <suite-verified-Release> <allowed-suite-InRelease>`,
`readelf -h -l -d -V <own ELF>`, and the recorded fixed version probes. Public
source retrievals used the four APT3 raw source URLs cited above plus dpkgpm.cc;
web-source/manual reads are informational, never configuration authority.
Solver/inspection children used explicit argv, closed inherited FDs, retained
stdout/stderr files and30s/10s deadlines; gpgv had20s. Stage/refine/freeze scripts
were supervised with55s exact-child timeouts, locale/final checks with30s;
no timeout fired and every tool session returned/reaped. The initial preparation
ran as a managed foreground tool child and completed normally (not under an
outer Python deadline); its gpgv children were20s-bounded. No unmanaged background
job, broad kill, global cleanup or helper fallback was used. Public downloads had
20s socket timeouts plus exact-byte bounds inside the supervised staging jobs.

## Frozen public candidate closure

All55 entries below are **install**, not upgrade. All767 keep tuples remain
private; their reason is preservation of the captured installed baseline.
Proposed upgrades: **none**. No removal, downgrade or held selection is proposed.
The reason column identifies explicit roots or textual mandatory relationship
references among APT-selected packages; it does not independently choose providers
or claim a causal solver trace for every alternative. APT's successful ordering
and exact replay are the authority for selection.

Total signed-index download estimate: **77072036 bytes**
(73.50 MiB). Additional Installed-Size sum:
**300170240 bytes** (286.26 MiB),
using1024 bytes per recorded Installed-Size unit. These omit filesystem/block
overhead, triggers, logs, locale generation, package cache duplication and all
Rust/Node/Bun/Electron/npm/Cargo/source/build scratch. Private resource facts are
known but are not published or treated as capacity admission for those phases.

The table freezes the exact tuples and per-artifact signed metadata. S=trixie,
U=trixie-updates, X=trixie-security. No U package is selected. Filename is relative
to `https://deb.debian.org/debian/` for S, and
`https://security.debian.org/debian-security/` for X. S+X rows show the S Filename;
the private plan additionally retains the matching `pool/updates/main/...` X
location. Candidate `.deb` download availability and all55 artifact bodies were
**not** checked; they must be fetched/rehashed in the later reviewed input phase.
The separate19 public runtime/locale-inspection downloads are not this55-package
installation closure.

| Exact tuple | Reason (root or requiring selected package) | Suite | Download bytes | Installed KiB | Filename | SHA256 |
| --- | --- | --- | --- | --- | --- | --- |
| `binutils:amd64=2.44-3` | gcc-14 | S | 265400 | 1073 | `pool/main/b/binutils/binutils_2.44-3_amd64.deb` | `6bc08c02539ba53b5e748142397144c499f9b20b5fa9bb56431545db124addeb` |
| `binutils-common:amd64=2.44-3` | binutils, binutils-x86-64-linux-gnu, libbinutils | S | 2508768 | 16098 | `pool/main/b/binutils/binutils-common_2.44-3_amd64.deb` | `002da5d23f8757dee97a2c0a40e0e1d4d85a43da094488ee2ee7068d4d3691f9` |
| `binutils-x86-64-linux-gnu:amd64=2.44-3` | binutils, gcc-14-x86-64-linux-gnu | S | 1013844 | 5990 | `pool/main/b/binutils/binutils-x86-64-linux-gnu_2.44-3_amd64.deb` | `e6741ce95ff0f7a131c8d9faa3528ccbbc453078bbc62a97da81340ed7462c53` |
| `cpp:amd64=4:14.2.0-1` | g++, gcc | S | 1568 | 18 | `pool/main/g/gcc-defaults/cpp_14.2.0-1_amd64.deb` | `a6ba40550aadec80437813e0fce5516574945ff40e72306a5b378c03af3a6544` |
| `cpp-14:amd64=14.2.0-19` | cpp, gcc-14 | S | 1280 | 11 | `pool/main/g/gcc-14/cpp-14_14.2.0-19_amd64.deb` | `3bae5fe03c56c6d021900ab4fb79e35c6f75eee72a73fccc6f28a39db559d6a0` |
| `cpp-14-x86-64-linux-gnu:amd64=14.2.0-19` | cpp-14, cpp-x86-64-linux-gnu, gcc-14-x86-64-linux-gnu | S | 11047460 | 34503 | `pool/main/g/gcc-14/cpp-14-x86-64-linux-gnu_14.2.0-19_amd64.deb` | `ef274b5379f5f97fc71619d39ecc84d039d3e184570d207b909c90afaa5d79e0` |
| `cpp-x86-64-linux-gnu:amd64=4:14.2.0-1` | cpp, g++, g++-x86-64-linux-gnu, gcc, gcc-x86-64-linux-gnu | S | 4840 | 17 | `pool/main/g/gcc-defaults/cpp-x86-64-linux-gnu_14.2.0-1_amd64.deb` | `d902f484e38bce59e82efc0df2fe20139a0932ca759ecafdfe6e5b6c72238eb8` |
| `g++:amd64=4:14.2.0-1` | explicit root | S | 1344 | 13 | `pool/main/g/gcc-defaults/g++_14.2.0-1_amd64.deb` | `f86661c021ab2acb39ceb87315e7c2d4d420fdadc19945d5d589f3953410445c` |
| `g++-14:amd64=14.2.0-19` | g++ | S | 22544 | 35 | `pool/main/g/gcc-14/g++-14_14.2.0-19_amd64.deb` | `4706ab29eab3d81e93582b45b229fdedc71f1eec3071996a448cf2c8beb83f3a` |
| `g++-14-x86-64-linux-gnu:amd64=14.2.0-19` | g++-14, g++-x86-64-linux-gnu | S | 12114812 | 36931 | `pool/main/g/gcc-14/g++-14-x86-64-linux-gnu_14.2.0-19_amd64.deb` | `c66b009fedd340520279d1af2f91d0668e9f64f0c08fe62179ca1c75e556be58` |
| `g++-x86-64-linux-gnu:amd64=4:14.2.0-1` | g++ | S | 1200 | 11 | `pool/main/g/gcc-defaults/g++-x86-64-linux-gnu_14.2.0-1_amd64.deb` | `15e10fc3948ec76be8d51b23e75ad9df9c39588c94f1f47059cee02c117c7583` |
| `gcc:amd64=4:14.2.0-1` | g++ | S | 5136 | 36 | `pool/main/g/gcc-defaults/gcc_14.2.0-1_amd64.deb` | `eee65c41a441c57c05f754ced1b9d093956966a1c7da9938c3ec00d3dc2f905d` |
| `gcc-14:amd64=14.2.0-19` | g++, g++-14, gcc | S | 540064 | 622 | `pool/main/g/gcc-14/gcc-14_14.2.0-19_amd64.deb` | `21500408b5019d8d29f70ce58488e2eea469a1adb4b5fd7db45e819b5efcac4e` |
| `gcc-14-x86-64-linux-gnu:amd64=14.2.0-19` | g++-14-x86-64-linux-gnu, gcc-14, gcc-x86-64-linux-gnu | S | 21389968 | 68460 | `pool/main/g/gcc-14/gcc-14-x86-64-linux-gnu_14.2.0-19_amd64.deb` | `a17ef039f1ba482051c3efb5c2c24070002e60dd0bd09fd456ec31481a11b725` |
| `gcc-x86-64-linux-gnu:amd64=4:14.2.0-1` | g++-x86-64-linux-gnu, gcc | S | 1436 | 23 | `pool/main/g/gcc-defaults/gcc-x86-64-linux-gnu_14.2.0-1_amd64.deb` | `04c28c2760b0094b3d7758154ac095303dd00599b63ebad4086a325b607308b7` |
| `libasan8:amd64=14.2.0-19` | libgcc-14-dev | S | 2725272 | 10695 | `pool/main/g/gcc-14/libasan8_14.2.0-19_amd64.deb` | `771899ade7310fe31aa538a509354c33d62bbe4e408b4e5fc1e513988dc42645` |
| `libbinutils:amd64=2.44-3` | binutils, binutils-x86-64-linux-gnu, libctf0, libgprofng0 | S | 534440 | 2390 | `pool/main/b/binutils/libbinutils_2.44-3_amd64.deb` | `4f4664c8a8f0ad0c8631c39fab02e3d8d86ccc6f4436a1d59f059dbcb0492679` |
| `libblkid-dev:amd64=2.41.5-0+deb13u1` | libmount-dev | S+X | 208756 | 978 | `pool/main/u/util-linux/libblkid-dev_2.41.5-0+deb13u1_amd64.deb` | `775bc91f7a265d21cdfc6b710813017b2366e5c5bb665cd2e6979af5dd8a03a8` |
| `libc-dev-bin:amd64=2.41-12+deb13u4` | libc6-dev | S | 59960 | 126 | `pool/main/g/glibc/libc-dev-bin_2.41-12+deb13u4_amd64.deb` | `2c21175d6a8283ed566d154c0c0bc06f60836e53b0b9e1f74c14eac586b68c24` |
| `libc6-dev:amd64=2.41-12+deb13u4` | libblkid-dev, libmount-dev, libstdc++-14-dev, uuid-dev, zlib1g-dev | S | 1994660 | 12542 | `pool/main/g/glibc/libc6-dev_2.41-12+deb13u4_amd64.deb` | `1fda734dabcd80b77266a09ab62b0f1e3e16d8091db62899890b2200745632a2` |
| `libcc1-0:amd64=14.2.0-19` | gcc-14-x86-64-linux-gnu | S | 42796 | 140 | `pool/main/g/gcc-14/libcc1-0_14.2.0-19_amd64.deb` | `2d587e3bfba4aec701946b7ba0c1640b97b6d8dd0a34ba1c70ae85261ecedefa` |
| `libcrypt-dev:amd64=1:4.4.38-1` | libc6-dev | S | 119040 | 345 | `pool/main/libx/libxcrypt/libcrypt-dev_4.4.38-1_amd64.deb` | `98e2333aea8d64ca68f9b75c16256d3a05492fd8f9e6dba96adbc6f19e4f5a09` |
| `libctf-nobfd0:amd64=2.44-3` | binutils-x86-64-linux-gnu | S | 155672 | 293 | `pool/main/b/binutils/libctf-nobfd0_2.44-3_amd64.deb` | `e280b2be3db6e584500e865c251605b95c346767d87ccb2524e44992048fc657` |
| `libctf0:amd64=2.44-3` | binutils-x86-64-linux-gnu | S | 88616 | 232 | `pool/main/b/binutils/libctf0_2.44-3_amd64.deb` | `120cafcd93132a276fa92a8fb4cf39b23d14e5a3e348f4f5580638d71ca95ac5` |
| `libffi-dev:amd64=3.4.8-2` | libgio-2.0-dev | S | 61136 | 324 | `pool/main/libf/libffi/libffi-dev_3.4.8-2_amd64.deb` | `76b2b80193a656733e1408ebec5371334be5fd48eb5f50ab99d6baf6081d0f1b` |
| `libgcc-14-dev:amd64=14.2.0-19` | gcc-14-x86-64-linux-gnu, libstdc++-14-dev | S | 2672328 | 17357 | `pool/main/g/gcc-14/libgcc-14-dev_14.2.0-19_amd64.deb` | `ca6f2d36d96b19b3eb71405b0b80134d8c89380b02204a2512e5c58ceb090628` |
| `libgio-2.0-dev:amd64=2.84.4-3~deb13u5` | explicit root | S | 1691796 | 10742 | `pool/main/g/glib2.0/libgio-2.0-dev_2.84.4-3~deb13u5_amd64.deb` | `a9bbd748ddd40a08b336e8d6b1755e698957ac640d081ddc4c330b716c6b89c3` |
| `libgprofng0:amd64=2.44-3` | binutils | S | 807764 | 4034 | `pool/main/b/binutils/libgprofng0_2.44-3_amd64.deb` | `0d36d0bde85c467ac6735dded08e19dd30ae1369e3908b9eb48ccc0d6ff66648` |
| `libhwasan0:amd64=14.2.0-19` | libgcc-14-dev | S | 1487768 | 4850 | `pool/main/g/gcc-14/libhwasan0_14.2.0-19_amd64.deb` | `2cdaf797cad8ac30a964ab081370682dd065ae1b0305a0be9d8e0e14cd0657d7` |
| `libisl23:amd64=0.27-1` | cpp-14-x86-64-linux-gnu, g++-14-x86-64-linux-gnu, gcc-14-x86-64-linux-gnu | S | 659152 | 2253 | `pool/main/i/isl/libisl23_0.27-1_amd64.deb` | `ac8518042e81c00de1effb72bba7e88ac4ecd488f7ea8b9e3ebc63159cb53b35` |
| `libitm1:amd64=14.2.0-19` | libgcc-14-dev | S | 25956 | 115 | `pool/main/g/gcc-14/libitm1_14.2.0-19_amd64.deb` | `febdb3c528cde1a3abe952e17a1d3cfa7ccaca5b6f506d983d34385dad199490` |
| `liblsan0:amd64=14.2.0-19` | libgcc-14-dev | S | 1204164 | 3782 | `pool/main/g/gcc-14/liblsan0_14.2.0-19_amd64.deb` | `a0df07da76287a45e665d584363dc2a6a1c4e240aee41b8bbc0f67cdff97cd68` |
| `libmount-dev:amd64=2.41.5-0+deb13u1` | libgio-2.0-dev | S+X | 30740 | 98 | `pool/main/u/util-linux/libmount-dev_2.41.5-0+deb13u1_amd64.deb` | `2bef03b918e927648c6552143e17e82aa7ed2a4ce180fabd07a7d1cac7ff8686` |
| `libmpc3:amd64=1.3.1-1+b3` | cpp-14-x86-64-linux-gnu, g++-14-x86-64-linux-gnu, gcc-14-x86-64-linux-gnu | S | 52244 | 154 | `pool/main/m/mpclib3/libmpc3_1.3.1-1+b3_amd64.deb` | `2af0a5c128e03694a41c0b011bd8a958b7297436cdb3a15ddad7866dae8c300b` |
| `libmpfr6:amd64=4.2.2-1` | cpp-14-x86-64-linux-gnu, g++-14-x86-64-linux-gnu, gcc-14-x86-64-linux-gnu, libmpc3 | S | 729320 | 1225 | `pool/main/m/mpfr4/libmpfr6_4.2.2-1_amd64.deb` | `75dddce11dabc7fc543712c33dc27b7f2ee66a111763eb5eac654d010b42cd92` |
| `libpcre2-16-0:amd64=10.46-1~deb13u3` | libpcre2-dev | X | 281748 | 713 | `pool/updates/main/p/pcre2/libpcre2-16-0_10.46-1~deb13u3_amd64.deb` | `e25b12fcd1f62185962a81499388fb9c25a7614b9513b6017489275bc7011a51` |
| `libpcre2-32-0:amd64=10.46-1~deb13u3` | libpcre2-dev | X | 268704 | 685 | `pool/updates/main/p/pcre2/libpcre2-32-0_10.46-1~deb13u3_amd64.deb` | `d6095c7eebb3e783243ec9784b9b6774434aa5c16aca8f179483215fadb4313c` |
| `libpcre2-dev:amd64=10.46-1~deb13u3` | libgio-2.0-dev, libselinux1-dev | X | 851360 | 2905 | `pool/updates/main/p/pcre2/libpcre2-dev_10.46-1~deb13u3_amd64.deb` | `6740621a0062e4b4cdeaa12a51f03ed0a3de0a04b949c8fa6a92c5f4c3c6b127` |
| `libpcre2-posix3:amd64=10.46-1~deb13u3` | libpcre2-dev | X | 64104 | 90 | `pool/updates/main/p/pcre2/libpcre2-posix3_10.46-1~deb13u3_amd64.deb` | `4a7f75f6f3b7e67a9a7f1dcdfca6377db6564057bac2a225cbd0583fe878f7df` |
| `libpkgconf3:amd64=1.8.1-4` | pkgconf-bin | S | 36436 | 101 | `pool/main/p/pkgconf/libpkgconf3_1.8.1-4_amd64.deb` | `85087cd04e57fd4ab7d6e816d348c335047823ab60c78878336b74f07b352ca1` |
| `libquadmath0:amd64=14.2.0-19` | libgcc-14-dev | S | 145068 | 296 | `pool/main/g/gcc-14/libquadmath0_14.2.0-19_amd64.deb` | `f5b51cf0ece3ec3bb7494d0cdbff3ce715ae00cfb2b6ed787f7db91319d64a7b` |
| `libselinux1-dev:amd64=3.8.1-1` | libgio-2.0-dev, libmount-dev | S | 169104 | 763 | `pool/main/libs/libselinux/libselinux1-dev_3.8.1-1_amd64.deb` | `0107595c65dd5cfe7ce3643d400e7b2be2c2528bcd110ad5af8605711a858921` |
| `libsepol-dev:amd64=3.8.1-1` | libselinux1-dev | S | 372908 | 1780 | `pool/main/libs/libsepol/libsepol-dev_3.8.1-1_amd64.deb` | `c085881d0546f6d539909f5710d7a3243aeb24338f6dc455b0ef6199f45bd753` |
| `libsframe1:amd64=2.44-3` | binutils-x86-64-linux-gnu, libbinutils | S | 78360 | 110 | `pool/main/b/binutils/libsframe1_2.44-3_amd64.deb` | `38f625dfdc582717029ac3a3e97c51d994ec2e7a0e9b230c6b44e40d1276311f` |
| `libstdc++-14-dev:amd64=14.2.0-19` | g++-14-x86-64-linux-gnu | S | 2375760 | 22065 | `pool/main/g/gcc-14/libstdc++-14-dev_14.2.0-19_amd64.deb` | `4b962fac5f1af0bd8b1b3f97e0f47b9d8e9a79e88802143f00ebfbd78ad87a7b` |
| `libsysprof-capture-4-dev:amd64=48.0-2` | libgio-2.0-dev | S | 49864 | 299 | `pool/main/s/sysprof/libsysprof-capture-4-dev_48.0-2_amd64.deb` | `3cb76e124187700f5977a0acb914b3f82b2bd28105fce6f1cf2a34497b234af2` |
| `libtsan2:amd64=14.2.0-19` | libgcc-14-dev | S | 2460216 | 8807 | `pool/main/g/gcc-14/libtsan2_14.2.0-19_amd64.deb` | `529d7f68227d16975076c5f842e8b687faea1b5df8e0dcf62e436d5402844ca5` |
| `libubsan1:amd64=14.2.0-19` | libgcc-14-dev | S | 1074340 | 3319 | `pool/main/g/gcc-14/libubsan1_14.2.0-19_amd64.deb` | `9205a1bef7d6a52ffc06548e0cde169ff303e688c12d9be3a98f734449077e22` |
| `linux-libc-dev:all=6.12.113-1` | libc6-dev | X | 3021244 | 11075 | `pool/updates/main/l/linux/linux-libc-dev_6.12.113-1_all.deb` | `b2d475e01aaf0030c72bd3a0300d311f8be64aa9e82d82eae5da1a04f4010071` |
| `make:amd64=4.4.1-2` | explicit root | S | 463104 | 1766 | `pool/main/m/make-dfsg/make_4.4.1-2_amd64.deb` | `70a9709e665383b06068ccd423d62ea191b65355f318a25565dbf324b254cec6` |
| `pkgconf:amd64=1.8.1-4` | libgio-2.0-dev | S | 26172 | 65 | `pool/main/p/pkgconf/pkgconf_1.8.1-4_amd64.deb` | `f1fcad470ca3ac80b4a0f4af6f03cd215089473996b07e508b3ee342bbb11af7` |
| `pkgconf-bin:amd64=1.8.1-4` | pkgconf | S | 30220 | 83 | `pool/main/p/pkgconf/pkgconf-bin_1.8.1-4_amd64.deb` | `54efef2aef4db5fcb5e0f5b7746465000c6a779b06f3686d0ec3d2a901b20aeb` |
| `rpcsvc-proto:amd64=1.4.3-1` | libc6-dev | S | 63268 | 246 | `pool/main/r/rpcsvc-proto/rpcsvc-proto_1.4.3-1_amd64.deb` | `32ac0692694f8a34cc90c895f4fc739680fb2ef0e2d4870a68833682bf1c81a3` |
| `uuid-dev:amd64=2.41.5-0+deb13u1` | libblkid-dev | S+X | 49068 | 134 | `pool/main/u/util-linux/uuid-dev_2.41.5-0+deb13u1_amd64.deb` | `cb7d7db20e5d91193c2c6629a3f4aa917e3bc558c72b7f2db7203bcfa9a3ba1b` |
| `zlib1g-dev:amd64=1:1.3.dfsg+really1.3.1-1+b1` | libgio-2.0-dev | S | 919744 | 1317 | `pool/main/z/zlib/zlib1g-dev_1.3.dfsg+really1.3.1-1+b1_amd64.deb` | `76ed5c858e1aef38b7be93acce5910e457e77bd6271471b9d05fb42e78826224` |

## Missing locale: no extra package transaction

`en_US.UTF-8` is observed missing. The installed `locales` package supplies
locale definitions/charmaps; `libc-l10n` alone is not a replacement for those
sources. `libc-bin` supplies localedef. All three captured installed versions
match the authenticated tuples below. Public package inspection checked the
regular `usr/share/i18n/locales/en_US`, `usr/share/i18n/charmaps/UTF-8.gz` and
`usr/bin/localedef` members. Three additional public artifacts (5309984 bytes)
were downloaded, hashed and inspected; no file from them was executed and no
locale data was extracted into a system path.

| Upstream selected keep tuple | Artifact bytes / SHA256 |
| --- | --- |
| `locales:all=2.41-12+deb13u4` | 3931296 / `ffc5578d5c2c30ca70d46113908f200a09ab6e5e9eda199463af3285dbbaae8c` |
| `libc-l10n:all=2.41-12+deb13u4` | 740236 / `dbaa885f5504c67fe43c079f76e2b2b39fcf647ae39880aab3dd66e48f5e772d` |
| `libc-bin:amd64=2.41-12+deb13u4` | 638452 / `dc8c79647fe3a5f37f72a400414f70263d0212f010ff2c09f990e30d91e38d1c` |

**Fixed later choice, not executed:** generate only the required locale using
`/usr/bin/localedef --no-archive --inputfile=en_US --charmap=UTF-8
/usr/lib/locale/en_US.utf8` in a separately approved root preparation step with
scrubbed environment, trusted fixed cwd and fixed protected destination custody.
Preflight must verify the installed input/binary files and required included
locale sources, refuse destination collisions, and create the fixed output
directory safely before generation. Recheck the exact en_US.UTF-8 `newlocale`
probe afterward. Do not run broad locale-gen or change default locale settings;
[locale-gen](https://manpages.debian.org/trixie/locales/locale-gen.8.en.html)
regenerates selected configured locales, while
[localedef](https://manpages.debian.org/trixie/manpages/localedef.1.en.html)
supports explicit input/charmap and separate output. The retained private plan
records the same generation choice with generationPerformed=false. Package
status/membership does not prove guest file integrity or successful generation.

## Private reproducibility hashes and validation

All listed paths below are relative to the private0700 root, not Git artifacts.
Raw outputs, literal command arrays, configuration and script bytes are retained
for coordinator review; no private full snapshot was committed. The public table
is a candidate summary, not authority for installing or approving upgrades.

| Private retained artifact | Bytes | SHA256 |
| --- | --- | --- |
| `apt-isolated.conf` | 3413 | `1b608d08d97d281dd42355ba0ce840c4fad776ebe42619a14c103d75831e70a2` |
| `apt-final.conf` | 4259 | `6fbfab7254ce0415ce6796c975eab6585e7703452d8dd21e08cb0bf421a20e47` |
| `environment-final.json` | 443 | `31cfc4775d8306fa28539fc7b71d2acf1d4067644a06ef339e4f5cf2b9084151` |
| `final-effective-config.stdout` | 11178 | `20feef8e50ee8b34219f2b5883489592af2cb04be826988f1de7d35fd81d3832` |
| `exact-minimal.stdout` | 8973 | `3ed4d8a9234a25aaeb01d6bde599848c1f9f67cd1feb3c3d9eacc4b1d484416c` |
| `exact-with-locale.stdout` | 9030 | `b9b07f0d5b65c2213096f6ff19c006656e52d730c9ab7d2f77bc63678814bdc7` |
| `exact-frozen-tuples.stdout` | 8229 | `f73dd128265b81152bd17497437e2c8c360887bdecc6a6df80c3d265f854dd51` |
| `preserved-policy.stdout` | 185826 | `ee51e8329d4d8a8fb602d556691378ab6cbd9932c2e525732f0a1c3356a5ac6c` |
| `final-baseline-check.stdout` | 294 | `e2631d6883d733c65cae32b22f4b948fd35fd776f4c98ff028f4b13410c1d356` |
| `runtime-loader-list.stdout` | 1721 | `bd9d86b03d52e092d30146a3980ade25ebaf98def217827dd8a17a7b335b1b09` |
| `exact-install-tuples.txt` | 1616 | `a591605d9e162c1151cdee45ffd67a4c993a2a029a76f31e863875477c69bdb1` |
| `commands.json` | 1723 | `0adf871c61277f4deb642e1c5a607440c6337b656131e0581ca4ec4fa37305e8` |
| `commands-final.json` | 1939 | `eb74ac849db2693b602c058dede47d47bc468ab46259941edf204ca12123804c` |
| `commands-freeze.json` | 20761 | `ec6a47c1873c25b92f4fd9adde3ca5134c70193e7be8552b4326014f11179cbe` |
| `full-plan.private.json` | 213796 | `495b3acfe8b4c6ed0af811decb84c776da7d4974388c4ca1b37a3e88713363f3` |
| `locale-inspection.json` | 1341 | `26d1781d5ead98ceb150181087a8d10659eb74e26d88b13812ace00717283fe8` |
| `retained-validation.json` | 31467 | `60981dbc51fec0a09a66121f289f210238369b6085070a78b303023d67c69aaf` |
| `prepare.py` | 6843 | `90a93c59ea6d51c222ac6b855e9bf62c7a25ddf1e5d1c0e43545ffbebeee0b11` |
| `runtime.py` | 4239 | `c052e802fbb2e3675fe5c569fe39eb191b81ec076ffc875f5ebf14d10e6593e8` |
| `solve.py` | 5785 | `3054be23ab6e239807dd7b4c0c667c005dd39b93c462c9e9c313eb10b302064f` |
| `refine.py` | 2466 | `a9a48ec84f19901059ddf9b2a9746022abe865fc187d21ba069f12be11e676ea` |
| `freeze-attempt1.py` | 6445 | `f429f87b6d5756c477fd9e42b800cca779aab1eb68fdb265c2df36618acd4b98` |
| `freeze.py` | 6524 | `5bf44182c99ce5a1138e109c9c605e00ff9d2e05ad34055d6bc31fa16298924f` |
| `inspect-locale.py` | 2440 | `7765accd8525e274d15d2e84ecd8e3992d2480b32526506b2337b240ccfa64de` |
| `final-check.py` | 4028 | `ac68aa66988dba76b03c77247d8eb3f2bb29056a62a148984c8ef472278835c9` |
| `acquire-item.cc` | 150267 | `a567649e6d8611e7733f34b570f561959f7fdfaa1c888377395e88d3752cc82c` |
| `install.cc` | 57415 | `65eb1ce272ca9efdd5794fe718ea0f07f2719f941fd880b71295539095672f97` |
| `debsystem.cc` | 17595 | `ba79cbe8b391f2fc9597e7c995ba7f075b8d2bceb8d8c23626570d56f085562a` |
| `dpkgpm.cc` | 84158 | `c117a5c0767cf979e28829829641eea78dc2c88b13794939e73c227d52494acf` |

Focused private checks passed: exact input hash/schema/provenance bindings,
3/2/2 fresh signatures and byte-identical cleartexts, signed compressed/expanded
indexes, matching packaged keyring, full DT_NEEDED routing, actual APT3 version,
closed effective config, baseline dependency check, no forbidden transaction
actions,767 preserved preferred candidates, exact55-tuple Inst/Conf replay,
locale-inclusive equivalence, signed size arithmetic and strict retained JSON.
The private manifest records210 retained files before report generation; later
report/check artifacts do not alter the frozen plan. Plan/Markdown-link and
whitespace validation results are appended below before commit. No application
source changed, so no renderer/native test or build was run for this report.

## Remaining review and execution gates

1. Coordinator independently reviews this exact transaction and private baseline/
   plan/commands, fresh metadata and input trust. A real install requires a fresh
   state/lock/hold/architecture/pending check against the separately retained
   **original** guest status identity, not this projection hash. No upgrade is
   needed here; any later upgrade or differing action set requires a new review.
2. Fetch all55 selected artifacts, verify signed-index Filename/Size/SHA256,
   review maintainer scripts, triggers and implicit service effects, establish
   measured capacity and fixed local-only guest repository/bundle custody. Neither
   simulation nor NoQueue authenticates nonexistent archives. No install/repair
   command is approved by this report; no broad configure/force/held override.
3. Review a separate closed install/locale/stage/build owner and transfer/recovery
   authority. Freeze exact privilege, path, network denial, child custody and
   resource budgets. Any partial dpkg mutation remains durable dirty state, with
   explicit recovery rather than claimed rollback. Source links and manifests
   cannot authorize execution; root coordinator alone admits actual phases.
4. Verify/generate the single locale later, preserve global defaults, and recheck
   actual required-locale availability. Review current source archive, pinned
   Node24.22.1/Bun1.4.4/Rust1.95.0/Electron45.0.0 inputs, Cargo/npm/header caches,
   Rust PATH routing, offline lifecycle allowlist and tool/runtime ELF closure.
   The APT runtime route here is not the later product runtime/toolchain route.
5. Perform reviewed immutable staging/build/receipt work, then separately reconcile
   current namespace/native authority and source/tree/archive/receipt pins. Native
   Debian GNOME/KDE Wayland/X11, Orca, input recovery, supported sessions, package
   install/upgrade/uninstall/recovery and all local1.0 release gates remain open.
   No F1-02 UI/native/full-task or97-task acceptance is promoted by this evidence.

Rejected/unsupported substitutions: earlier host APT2.4 empty-baseline attempts,
handpicked dependency solvers, trimmed signed indexes, expired metadata bypass,
ambient host config/dpkg/credentials/hooks/proxies, namespace/chroot/proot/bwrap/
Docker/SSH/guest fallback, package installers, privileged/root execution, build
or smoke execution. No user-data, bus, keyring-service, input-device or provider
operation occurred. The only keyring bytes consumed were explicitly allowed
public Debian archive artifacts; no private keys or environment tokens were read.

## Report validation and handoff boundary

`python3 scripts/validate_plan.py` passed:279 sources,57 features,97 tasks,
135 Markdown files,7 SVG assets. Focused local Markdown link checks and all55
candidate tuple/artifact identities against the frozen private export passed.
Private strict JSON/provenance and final freshness checks passed. `git diff
--check` passed before staging; the staged whitespace/scope check is required
before commit. These are report/solver checks, not application acceptance.

Private report-validation record SHA256
`69827a52999e64f67b33d3598d05abe97594c470cf08e41c73459ececff84c5a`.
Final HEAD/tree/clean and actual configured-signing outcome are supplied
in the handoff. No persistent signing configuration change is authorized.
