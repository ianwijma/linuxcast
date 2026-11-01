# F1-02 offline Debian build provisioning research

Preparation design only, 2 November 2026 Sydney (1 November UTC). **No provisioning,
compiler, product, guest, native or AT run.** Next prerequisite: a separately
reviewed, closed preparation authority with a signed-package input closure and
fixed staging custody. Neither the native owner nor inventory owner admits it.
No receipt/permit placeholder, arbitrary SSH program, generic privileged runner,
scope reduction or namespace-lane redesign is proposed.

Research base/starting HEAD: `bd5873823d4ca4a6919e4ad3eace9aa6610feef7`;
tree `ab3d17aea5f41f4027ddc4c3bf9a9dd74bbbc288`. Clean prepared checkout,
renamed branch `codex/f1-02-offline-build-provisioning-research`; no children.
Only this new directory is owned. Final report commit/tree belong in the handoff
(a commit cannot contain its own hash). [Repository hashes](repository-evidence.json)
and [public-source retrieval metadata](primary-sources.json) distinguish received
bytes from authenticated provenance. Source locations below refer to that base.

## Evidence and minimum build inputs

**Inherited actual evidence:** [corrected inventory](../inventory-actual-20261101-corrected/README.md)
and its [unchanged JSON](../inventory-actual-20261101-corrected/owner-result.json)
record complete/exit0, Debian13 amd64, Python3.13.5-1, Orca48.1-1+deb13u2,
AT-SPI2.56.2-1+deb13u2 and D-Bus1.16.2-2. GCC/G++/make/pkg-config and exactly
`libc6-dev`, `libsqlite3-dev`, `libdbus-1-dev`, `libglib2.0-dev`, `libx11-dev`,
`libxtst-dev` are absent. UID/GID20000 are absent/idle. This selected inventory
does **not** include complete libc/GLib/toolchain/runtime package state, free
storage/RAM, locales or every binary dependency. PID1 metadata denial is handled
by the separate [attestation contract](../../../tests/at/namespace-attestation-protocol.md).

**Actual repository facts:**

| Input/work | Exact source and consequence |
| --- | --- |
| Rust | [build.ts](../../../build.ts), line10, builds only `linuxcast-platform --locked --release`; [platform manifest](../../../../../native/platform/Cargo.toml), lines9–13, depends on protocol/libc/Serde. Static Cargo.lock name-edge traversal finds14 packages including two local crates, versus152 registry packages in the full workspace lock. This is a source graph, not measured Cargo resolution/compilation. |
| Native linking | [applications.rs](../../../../../native/platform/src/applications.rs), lines24/69/74, links GIO/GObject/GLib directly. No platform build.rs/pkg-config invocation. A C linker, libc startup/development files and unversioned GLib link libraries are required. [Hunspell](../../../../../native/platform/src/dictionary_spelling.rs), lines39–40, is runtime dlopen, not a header/link-time dependency. |
| SQLite | [setup-sqlite.ts](../../../setup-sqlite.ts), lines7–12: rebuild4.2.1, Electron45.0.0, host arch, `--only better-sqlite3 --force --build-from-source --jobs 2`. [Storage](../../../../../packages/storage/package.json), line13, pins13.0.3. Upstream [binding.gyp](https://raw.githubusercontent.com/WiseLibs/better-sqlite3/v13.0.3/binding.gyp), lines15–21, needs C++20/LTO; [sqlite3.gyp](https://raw.githubusercontent.com/WiseLibs/better-sqlite3/v13.0.3/deps/sqlite3.gyp), lines13–26/45–48, compiles the bundled C amalgamation. No system `libsqlite3-dev` is needed for this default build. |
| JS/runtime | [root manifest](../../../../../package.json), lines8–11/60–64, pins Bun1.4.4, Node24.22.1 minimum in major24, trusted esbuild only; preparation must pin **exact24.22.1**. Build uses esbuild0.28.2 directly, not Vite/Forge packaging. Electron45 runtime and matching headers are separate artifacts. [package-deb.ts](../../../../../scripts/test-runner/package-deb.ts) explicitly exits3/unavailable. |

**Current official package facts, not an authenticated install lock:** smallest
candidate request set is `g++`, `make`, `libgio-2.0-dev`, with complete mandatory
dependency closure and no Recommends/Suggests. [amd64 g++](https://packages.debian.org/trixie/amd64/g%2B%2B)
4:14.2.0-1 pulls GCC/CPP and their14 backends; [libstdc++-14-dev](https://packages.debian.org/trixie/amd64/libstdc%2B%2B-14-dev)
14.2.0-19 pulls libc6-dev/libgcc development support. Include binutils/assembler,
linker and LTO support through that closure, not handpicked compiler binaries.
[make](https://packages.debian.org/trixie/make) currently lists4.4.1-2.
[libgio-2.0-dev](https://packages.debian.org/trixie/libgio-2.0-dev)2.84.4-3~deb13u5
provides GLib/GObject/GIO development files; its [amd64 file list](https://packages.debian.org/trixie/amd64/libgio-2.0-dev/filelist)
contains all three required unversioned `.so` links. It pulls pkgconf and further
development libraries; resolve them all. The broader `libglib2.0-dev` additionally
pulls introspection/utilities. Explicit `pkg-config` is unnecessary for these build
scripts; the absent six-package probe is not an install specification.

Do not add D-Bus/X11/XTest headers, libevdev/systemd-dev, build-essential/dpkg-dev,
Sharp/libvips, OCR/speech or workspace-wide spike compilation for this bounded
build. [Input build.rs](../../../../../spikes/input/build.rs) needs other libraries
only if that separate workspace member is selected. Full local1.0 still requires
all later features and their libraries; this is no change to their scope.
[node-gyp12.4 docs](https://raw.githubusercontent.com/nodejs/node-gyp/v12.4.0/README.md)
require Python/make/C/C++; Python>=3.12 requires node-gyp>=10. Locked12.4.0 clears
that documented floor for guest3.13, without proving this build interoperates.

Retain upstream Rust1.95.0 rustc/cargo/target std for x86_64-unknown-linux-gnu;
clippy/rustfmt are requested by [rust-toolchain.toml](../../../../../rust-toolchain.toml),
but are not invoked by this product build. The coordinator's five verified public
component candidates,152-crate/index cache and Electron header supplement are
**inherited** [preparation evidence](../offline-build-preparation/README.md), not
freshly read private artifacts. No Debian Rust substitution/rustup download.
Audit actual ELF interpreter/DT_NEEDED and symbol versions for every supplied
tool/runtime before use; complete runtime-library/CPU compatibility is unknown.
Existing Python/apt/dpkg/shell/file-copy/locale prerequisites also need fixed
inventory; `en_US.UTF-8` is hardcoded by SessionOwner and is not established here.

## Offline signed Debian package flow — proposal, not performed

1. **Obtain the missing baseline through new reviewed preparation inventory.**
   Capture a bounded, private dpkg status snapshot with package/architecture/full
   version/status/dependency/Provides fields, holds, foreign architectures and
   pending/broken state; record its digest. Include dpkg/apt versions, required
   binaries, uid collision checks, capacities and needed loader libraries. The
   closed existing inventory cannot be repurposed for arbitrary file export.
   [dpkg-query](https://manpages.debian.org/trixie/dpkg/dpkg-query.1.en.html) supports
   structured showformat; human `-l` output is unsuitable. Preserve installed
   Python/Orca/AT-SPI/D-Bus and other baseline packages by default.
2. **Resolve off guest, unprivileged, in a fresh dedicated APT workspace.** Use
   recorded Debian APT tooling, absolute paths, a scrubbed environment and an
   explicit `APT_CONFIG` loaded first. Set its `Dir::Etc::parts/main` to owned
   empty locations **there**, not merely via late `-c`/`-o`. APT [init.cc3.0.3](https://sources.debian.org/src/apt/3.0.3/apt-pkg/init.cc/#L231)
   reads APT_CONFIG then parts/main; clearing hooks after ambient config was
   loaded cannot undo earlier includes. Redirect sources/sourceparts,
   preferences/preferencesparts, trusted/trustedparts, auth.conf/auth.conf.d,
   lists, status, extended_states, archives, binary/source caches and logs to
   this workspace; disable inherited hooks/proxies and set architecture list
   solely amd64 (Architecture:all packages remain eligible). Explicitly set
   `Dir::State::status` to the captured guest copy: [debsystem.cc](https://sources.debian.org/src/apt/3.0.3/apt-pkg/deb/debsystem.cc/#L269)
   otherwise derives a dpkg location even when APT state moved. Verify effective
   configuration before acquisition. No root, host dpkg invocation or host writes.
   [apt.conf](https://manpages.debian.org/trixie/apt/apt.conf.5.en.html) documents
   these directory controls; RootDir also prefixes absolute executable paths,
   so it is not a substitute for a complete reviewed configuration.
3. **Use only Debian13 main/trixie, trixie-updates, trixie-security.** Seed a
   separately trusted, pinned Debian archive keyring/fingerprints; the [FTP key
   page](https://ftp-master.debian.org/keys.html) is informational, not independent
   bootstrap trust. Verify InRelease (or Release+Release.gpg), codename/origin,
   architecture, clock and expiry; then signed Release SHA256/size of unmodified
   Packages indexes, then each selected Packages Filename/Size/SHA256 against
   its `.deb`. [apt-secure](https://manpages.debian.org/trixie/apt/apt-secure.8.en.html)
   describes this chain, not individual package signatures. [acquire-item.cc](https://sources.debian.org/src/apt/3.0.3/apt-pkg/acquire-item.cc/#L1501)
   checks authentication and expected hashes. Preserve the original metadata,
   signer result and artifact hashes. No `trusted=yes`, unsigned repository,
   weak-hash, unauthenticated or date-check bypass. Do not trim/rewrite Packages
   and claim the original Release still authenticates it.
4. **Resolve, review, then freeze exact tuples.** Simulate install of the three
   candidate roots with no recommends; the solver must satisfy recursive Depends,
   Pre-Depends, alternatives, versioned Provides, Multi-Arch, Breaks/Conflicts and
   installed-state constraints. [Policy7](https://www.debian.org/doc/debian-policy/ch-relationships.html)
   defines relationships. Reject removals/downgrades/held changes and unapproved
   upgrades; fail rather than force dependencies. Use Debian [version ordering](https://manpages.debian.org/trixie/dpkg-dev/deb-version.7.en.html),
   including epochs/tilde, and [APT preferences](https://manpages.debian.org/trixie/apt/apt_preferences.5.en.html).
   Record every keep/install/upgrade, reason and exact `name:arch=version`.
   Download-only that approved solved plan into private cache and independently
   verify every artifact; `apt-get download` alone does not solve dependencies.
   [apt-get](https://manpages.debian.org/trixie/apt/apt-get.8.en.html) documents
   exact-version, simulation, download-only and no-download modes.
5. **Install later, only under reviewed guest root preparation.** Transfer a
   bounded hash-manifest bundle using a new fixed inbox protocol; current native
   and inventory SSH endpoints cannot transfer/run arbitrary programs. Keep
   original signed repository layout/indexes plus only selected pool artifacts;
   guest APT uses exclusively local file sources, isolated configuration/state/
   cache/logs, and explicit guest dpkg database. Revalidate baseline digest and
   exact simulated action set immediately before install. Prefill cache and use
   no-download with exact tuples; no guest online repository/network fallback.
   Recheck hashes before root consumes bytes. Review package maintainer scripts,
   triggers and implicit service effects first: [Policy6](https://www.debian.org/doc/debian-policy/ch-maintainerscripts.html)
   and [dpkg](https://manpages.debian.org/trixie/dpkg/dpkg.1.en.html) make clear that
   installation executes code. No arbitrary hook, service enable/start or broad
   configure/repair action. An unexpected side effect/transaction is a review
   blocker. Partial dpkg mutation is durable dirty state, not rollback success;
   retain it for explicit recovery, verify configured status/triggers afterward.

**Exact version selection remains open.** The current [libc6-dev page](https://packages.debian.org/trixie/libc6-dev)
lists2.41-12+deb13u4 with exact libc6/libc-dev-bin dependencies; libgio-dev similarly
requires an exact GLib runtime. Their guest versions are absent from public
inventory. Choose matching authenticated versions where available; otherwise
review an explicit runtime upgrade or fail. Never silently downgrade to an old
archive, disable expired metadata checks, mix Ubuntu libraries or assume a package
webpage is the signed amd64 index. The three Release envelopes were fetched only
as small metadata; signature verification, Packages downloads, solver run, exact
closure/bytes and `.deb` availability remain **unperformed**.

## Fixed preparation phases and custody — proposed interface

Use a distinct `build-preparation-v1` permit/marker domain, independently reviewed
owner/guest-agent/bundle hashes and one literal phase enum per reservation:
`facts`, `install-toolchain`, `stage-inputs`, `build-receipt`. No command, path,
account, timeout, package-list or environment overrides. Package/source/cache
manifests bind **reviewed data**, never authorize arbitrary programs. Keep exact
lab/container identity, reservation inode, guardian/start gate/caller lifetime,
before-dispatch accounting and interrupted-marker recovery from the [outer owner](../../../tests/at/outer-owner-protocol.md).
Typed internal reuse needs coordinator review; a new CLI must not masquerade as
native/inventory. No source/permit/receipt for an earlier phase authorizes native
execution. Capture predecessor manifest digest and freshly revalidate custody at
every phase; no replay on uncertain effect or automatic retry.

- `facts`: fixed metadata above, no product import/run. `install-toolchain`: exact
  approved Debian package transaction, fixed nonlogin account/group20000 with no
  supplementary groups/home/login/privilege grants, verified upstream tools at
  fixed root-controlled prefixes. Refuse existing account/path collisions rather
  than adopting/chowning them. Install only predeclared Rust component paths from
  reviewed bounded extraction/manifests, not an arbitrary root installer script.
- `stage-inputs`: root creates protected ancestors under `/opt/linuxcast-f102-lab`.
  [source_bundle.extract_source](../../../tests/at/source_bundle.py), lines222–288,
  refuses root, requires a private caller-owned archive/parent, and creates a
  **randomly named new child**, not a caller-selected `/staging`. Provide a fixed
  UID20000-owned0700 extraction inbox and private verified archive copy. Extract
  as20000, quiesce the worker, retain/check descriptor identities and promote only
  that new source root to the absent final `/staging` via a reviewed no-replace
  move under root-controlled ancestors. Do this **before** dependencies/build/
  receipt exist: source has no links; installed absolute links must not be moved.
  Final staging remains20000:20000,0700. Never precreate `/staging` then pretend
  the existing extractor can fill it. Drop privilege before dependency lifecycle
  code or staged Python/TS executes.
  Supply current reviewed archive/revision/tree/count/signature status; historical
  [PR85/PR95 archives](../source-build-preparation/README.md) are not current build
  inputs. New root agent must be independently installed/pinned, not imported
  from a writable source tree as root. Account provisioning is distinct from
  product privileged-input service setup, which remains disabled/stopped.
- Frozen dependency command to validate later, from final staging cwd:
  `bun install --offline --frozen-lockfile --backend=copyfile` with exact Bun1.4.4,
  private HOME/cache and only trusted esbuild lifecycle permission. [Bun install](https://bun.sh/docs/pm/cli/install.md)
  documents offline hard failure for required misses, but optional misses can be
  skipped: explicitly require linux-x64 esbuild and every selected platform addon.
  Lock includes Rollup/Tailwind oxide/lightningcss/lzma GNU artifacts; they are
  cache/ABI inputs, not permission to source-build arbitrary missing binaries.
  [Bun cache](https://bun.sh/docs/pm/global-cache) is separate from the Cargo/header
  cache. Verify lock SRI and patch bytes; never copy developer node_modules,
  prebuilt SQLite/target/dist, external symlinks or outside hardlinks.
- Electron setup is separate: `node scripts/test-runner/setup-electron.ts` invokes
  the locked45 installer. [Installer source](https://raw.githubusercontent.com/electron/electron/v45.0.0/npm/install.js),
  lines35–47, uses `electron_config_cache` and embedded checksums but downloads on
  miss. A fully seeded verified linux-x64 runtime ZIP/cache and enforced no-network
  execution are mandatory; Cargo/header cache does not supply Electron runtime.
  Never use ELECTRON_OVERRIDE_DIST_PATH, remote-checksum overrides or host Electron.
- Place the read-only fixed `node_modules/.cache/f102-offline-build` manifest,
  Cargo registry/index and headers as required by [product_staging.py](../../../tests/at/product_staging.py),
  lines18–118. It seeds fresh HOME with CARGO_HOME/offline and npm_config_nodedir/
  offline, checks cache before/after and rejects added source/lock changes.
  Required Node lives at `/opt/linuxcast-f102-lab/node/bin/node`, root-owned.
  **Routing decision:** line219 resets PATH to Node's parent + `/usr/bin:/bin`.
  A separate `/opt/.../rust/bin` installation is invisible. Prefer a coordinator
  reviewed **constant** PATH addition for that fixed root-owned Rust prefix;
  alternatively review an exact tool layout visible on the existing PATH.
  No ambient PATH, rustup shim or download fallback. No such source edit is made here.
- `build-receipt`: run existing `product_staging.prepare(...)` as20000 in a
  dedicated owned worker; its exact child commands are
  `node apps/desktop/setup-sqlite.ts`, then `node apps/desktop/build.ts`.
  The latter invokes `cargo build --locked --release -p linuxcast-platform
  --target-dir <staging>/target`. No helper/Electron/product/addon smoke execution
  belongs to this preparation authority. Tool version probes alone may be fixed
  explicit preparation checks. Electron/SQLite ABI and SQLite version loading
  remain separate execution gates ([Electron ABI guidance](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)).

The fixed preparation worker needs enforced network denial, closed inherited FDs,
private environment/HOME/tmp, retained descendants, parent lifetime and resource
ownership. Offline flags alone are not containment. Root package actions and
unprivileged build actions require distinct fixed privilege envelopes; build code
gets UID/GID20000, empty groups/capabilities and no-new-privileges, writable staging/
private scratch only. This needs its own review; do not invoke the receipt-gated
native namespace wrapper or controller to bootstrap preparation. No Node/Bun/
Electron runtime candidate in this checkout was authenticated or executed here.

**Receipt and resource gates:** [prepare/validate](../../../tests/at/product_staging.py),
lines198–296, inventories all source/dependencies/output/cache bytes and links,
pins Node/source/archive, seals read-only and requires an independently retained
receipt digest. Revalidate as20000 after quiescing all build descendants; root
then retains protected ancestors and fixed artifact custody. UID ownership alone
is not immutability against same-UID chmod: later native wrapper read-only binds
remain required. Receipt does not authenticate source signatures, toolchain or
Debian packages; retain a separate preparation provenance manifest including
full package plan/state, tool binaries/libraries, cache hashes and all phase
results. Matching inventories prove identity/integrity, not reproducible builds.
Repeat clean builds with identical paths/inputs/toolchain and compare output
hashes later before claiming byte reproducibility.

Keep existing native outer600s/job360s/wrapper300s, native256tasks/2GiB/one CPU
unchanged. Proposal: separate reservations per preparation phase, facts<=30s,
other jobs<=360s, startup<=120s and cleanup<=45s within600s; reviewed install/stage
jobs have no native dispatch. Keep existing preparer360s and each child180s.
This split avoids pretending package install/extraction/cache seeding shares the
native job. Work includes inherited642,478,515 expanded Rust bytes, up to256MiB
source expansion, full npm/Electron trees, SQLite C/C++20+LTO and14-crate source
graph. No elapsed compile/RSS/scratch measurements exist. Capacity admission must
sum bounded input expansions, installed package sizes, duplicate private caches,
target/addon/temp/inode reserves and guest free space; the512MiB cache limit is
not a whole-build resource estimate. Fail on unavailable capacity/deadline/OOM;
any different **fixed preparation** budget/quota requires measured evidence and
separate review, never an automatic bump to native limits.

Each phase preserves first operation failure separately from cleanup failure,
unknown dispatch/state separately from absence, and bounded private diagnostics
separately from public fixed enums. Kill/reap retained children, verify exact
empty resources and the pinned stopped/exit0 baseline before clean release.
Never delete a replacement/foreign path; partial package changes and interrupted
staging remain marked dirty for explicit recovery. Successful staging is retained
by an identity-bound predecessor receipt; failed partial build is not reusable.
No automatic package rollback, recursive deletion outside owned new roots,
historical-result cleanup or native permit minting.

## Handoff and validation

Next coordinator decisions: approve the missing fixed package-state inventory;
resolve/authenticate the exact amd64 closure against it; choose Rust PATH/layout
and verified Node/Bun/Electron artifact custody; freeze preparation phase/resource/
transfer and recovery contracts; independently review implementation and fault
tests before any invocation. Then create a **current** approved source archive,
perform offline staging/build/receipt under that authority, reconcile wrapper
source/tree pins separately, and pass native admission. PID1 attestation work is
left to its active lane. No shared source/protocol/manifest/lock/registry/acceptance
edits or other-lane imports/merges, no push/PR/watch/delegation.

Applied research skill within the user's no-children restriction. Read AGENTS,
CONTRIBUTING, PLAN/GOAL, F1-02 and registry dependencies, architecture security/
overview/stack, testing-release and four AT protocols plus preparation evidence.
F1-02 depends on accepted F0-01; F1-02 remains in-progress/UI pending. Registry
snapshot:97 tasks (8done/20in-progress/69planned),56passed/325pending/8not-applicable
criteria. Full97/local1.0, existing AC01/AC02/privacy evidence and all compiler/
build/native/AT/desktop/input/audio/session/release gates are unchanged.

This work executed focused Git/rg/Python reads, small public documentation/source/
Release retrievals and documentation validation only. No embedded inventory probe,
APT/dpkg command, large index/artifact/cache fetch, install, Docker/SSH/guest/owner,
setuid/namespace/mount/service, credential/env-token/private-lab access, screenshots
or production build. Public raw Rust platform page returned404; Bun HTML exceeded
the bounded raw read, with its small official Markdown alternative retrieved.
Several web-tool source/manpage reads failed but bounded direct HTTPS reads
succeeded; primary-sources.json records actual retrievals, not invented availability.
Validation commands/results are recorded in [validation.json](validation.json).
