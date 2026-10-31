# F1-02 offline rebuild cache routing — preparation only

The existing build preparer creates a fresh private HOME and sets Cargo offline,
but did not put prepared Cargo sources or Electron headers in that HOME. The
pinned electron-rebuild4.2.1 resolves `.electron-gyp` from `os.homedir()`; its
node-gyp12.4.0 accepts `npm_config_nodedir` and skips header installation when set.
These facts were checked against the installed locked dependency source, not
inferred from a different version's documentation. No dependency changed.

A dedicated ordinary-Python fixture reproduced the gap against approved `bbbe813`:
prepared input files existed, but the child saw cargoCache=false/headers=false
and exited42. The corrected preparer passes the same fixture with both true;
HOME stays private and Cargo stays offline. This is a synthetic routing/receipt
check, **not an actual Node/Rust/Electron build or native attempt**.

## Prepared input layout

Before `prepare`, the trusted coordinator supplies a public cache bundle at
`node_modules/.cache/f102-offline-build/` inside the fresh installed staging tree:

```
manifest.json
.cargo/registry/...                  public cached crates/index/source only
.electron-gyp/45.0.0/include/node/   exact pre-provisioned Electron headers
```

The strict manifest has exactly `schema:1`, `rustVersion:"1.95.0"`,
`electronVersion:"45.0.0"` and `files`. Every regular payload file has one entry
`relative-path: {"sha256":"<64 lowercase hex>","executable":false}`; executable
files use the actual boolean true. No duplicate/unknown keys or numeric booleans.
The payload must include `node.h`, `config.gypi`, `common.gypi` under the header
path and public Cargo registry contents. Empty cache completeness is not inferred
from this shape: actual offline compilation still has to succeed.

The bundle/root/files must be owned by the preparation UID and read-only. Reject
links, outside/internal hardlinks, unsafe/noncanonical paths, special objects,
extra files, bad hashes or executable flags, credentials/config/bin directories
outside the two fixed cache subtrees, more than30,000 payload files, a manifest
above4MiB or payload above512MiB. The supplied manifest is provenance from the
trusted coordinator, not a signature or independent proof of compiler identity.
Actual Debian compiler/toolchain/runtime versions, hashes and complete header/
cache provenance still require the existing caller inventory gates.

The preparer compares this bundle with the initial source/dependency inventory,
copies verified bytes into its newly owned empty private HOME before any child,
checks each copied digest, and rechecks the original bundle before and after the
build. No host HOME, Cargo configuration/credentials, SSH agents, display or
session is inherited. Private copies may be written by build tools and are
removed by the existing bounded owner. Only these variables are added:
`CARGO_HOME=<private HOME>/.cargo`, `CARGO_NET_OFFLINE=true`,
`npm_config_nodedir=<private HOME>/.electron-gyp/45.0.0`, `npm_config_offline=true`.
Pinned native tools still need to exist on the already fixed build PATH; this
change neither installs Rust nor admits a rustup/host runtime fallback.

The input manifest/cache bytes enter the existing complete immutable receipt
inventory. Receipt schema and validation API are unchanged. The cache remains
immutable even though neighboring dependency/rebuild directories are mutable.
The existing source/lock/addition checks, outside-hardlink rejection, receipt
alias checks, Node hash, output hashes and final read-only sealing remain.
No controller, observer, Orca, namespace, approved-tree or runtime-source pin
is changed. The old namespace authority continues to reject newer source.

## Executed evidence and limits

Python3.10.12, Linux amd64 development host. Eleven staging tests pass, including
ordinary Python child routing/receipt validation, missing/mutable/bad-hash/unknown/
credential/numeric-boolean/duplicate inputs rejected before any child, symlink/
hardlink/source-mutation rejection, short/zero writes, and mutation during build.
The earlier added-source/directory test now supplies valid prepared cache inputs,
so it continues to exercise the actual post-build source boundary.

The full offline AT suite passes119 tests without skips. Both changed files parse;
plan and whitespace checks pass. A separate original-source negative control
loads the exact `bbbe813` preparer: the ordinary Python cache-routing fixture
fails there (`rejected:child`, missing caches) and passes with the corrected source.
All fixture payloads and outputs are explicitly synthetic public text. No real
product, compiler, dependency installer, Docker, SSH, guest, namespace, display,
bus, reader, input/audio, keyring or provider operation occurred.

Independent review, actual current immutable Debian build/receipt, guest tool and
cache provisioning, reviewed outer owner, PID1 metadata feasibility, actual native
query identity and all native/session/AT/physical/release gates remain pending.
Historical F1-02 AC01/AC02/privacy evidence and full97-task/local1.0 scope are
unchanged. The separate current PR95 archive remains honestly historical relative
to this new unreviewed preparer correction. No execution authority follows from
these offline tests or this report.

## Independent review and bounded corrections

Initial Standards `3c306e10` of exact `2312fbd`/BASE `bbbe813` is clear:
11staging/119offline Python cases, original-source routing negative control,
AST/hashes/plan/whitespace independently pass. Initial Security/Spec `14cf1b4f`
independently passed the same119 checks and found two P2s. Cache inventory reused
the outer inventory's root receipt exclusion, so a newly added cache-local
`f102-build-receipt.json` could be omitted. The mutation regression also created
unrelated source directories, allowing an unrelated guard to make it pass.

Cache inventories now explicitly include every entry; only the actual outer
receipt inventory retains its old exclusion. Ordinary Python child regressions
for a cache-local receipt-named file and symlink both fail exact `2312fbd` and
pass the correction. The mutation fixture now precreates its source directories;
disabling only post-build cache validation makes that test fail. Restoring the
guard passes all12staging cases. Parent55mapped security checks pass14.11s,
including all120offline Python tests without skips. Both AST parses, hashes,
plan and whitespace pass. The two P2s are parent-verified resolved; no second
independent final clean review is claimed. No real build/native invocation.

## Public cache candidate inventory

Separately, under the existing exclusive lab lock, the coordinator created an
owned read-only public candidate outside Git:420payload files,22,861,050bytes,
manifest SHA256 `d733fe37559bac91c95c24ccea09b0993a25de604243e03e33063793f7e90db3`.
All152locked crate archives and their selected sparse-index records match the
committed Cargo.lock checksums (lock SHA256
`07693a75d13e9d180b86583aee18c5946fe9eedfc67eb74ba52fe1c8b8fe3031`).
The125 locally cached Electron45header files include the required headers.
Their upstream archive digest was **not independently verified**; that provenance
remains a provisioning gate, not inferred from the folder label or local hash.

The already pinned host Cargo1.95 resolved all152registry packages/four workspace
members with `metadata --offline --locked` from an empty private profile seeded
only with the selected public Cargo cache. No compiler output or target directory
was produced; Cargo.lock and the read-only candidate remain unchanged, and the
private profile/raw metadata were removed. Host Rust reports1.95.0/LLVM22.1.2;
this is not Debian compiler/runtime inventory, compilation, or ABI evidence.

The lab was freshly stopped/exited/PID0/exit0 before and after the cache snapshot.
No guest/container-start/exec, dependency download, build, namespace, display,
reader, input/audio, keyring or provider action occurred. The separate outer-owner
implementation remains unreviewed and unused. Actual immutable Debian build and
all previously listed native/full-task/release gates remain outstanding.

## Supplemental upstream header verification after PR96

The coordinator later retrieved the pinned [official Electron45 checksum list](https://www.electronjs.org/headers/v45.0.0/SHASUMS256.txt)
and header archive over HTTPS. The350,098-byte archive SHA256 is
`bf3ec8efe30aa2d66759f2e9e8afd05182f656edb09478424d8fb5bcddfae4f6`, matching
that published digest. Read-only tar comparison matches all124upstream header
files against the frozen cache candidate. Its sole extra file, `installVersion`,
matches the locked node-gyp12.4.0 installation metadata. No archive code was
executed or installed. The original cache/provenance remain unchanged; a separate
private0400supplement records the new verification. This closes the bounded
upstream-header-content gap noted at initial snapshot time, not signed-release,
actual Debian compiler/ABI/build or native acceptance.
