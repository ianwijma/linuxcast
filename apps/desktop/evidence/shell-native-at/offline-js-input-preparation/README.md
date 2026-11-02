# Locked JavaScript archives and host cache preparation

Coordinator preparation on2 November2026, after approved PR106 merge
`36629712ca936f9b88cea86f71b2cc66e610f84c`. **Host input checks only, not a
Debian build, guest cache install, network-containment or native acceptance.**
No application/test/protocol source changed. Full97/local1.0 remains mandatory.

## Acquired public inputs

The pinned TypeScript parser reads the exact frozen Bun lock42c4f163. It contains
1003 npm registry resolutions, one pinned GitHub source and20 workspaces. Earlier
checkpoint shorthand calling all1004 external sources registry packages was
imprecise; the Electron node-gyp GitHub resolution is handled explicitly.

Only explicit OS/CPU constraints exclude68 resolutions. The936 Linux/x64-eligible
resolutions deduplicate to811 archives,91412138 compressed bytes. Every archive
matches its locked SHA256/SHA512 integrity, including
`@electron/node-gyp@github:electron/node-gyp#06b29aa`. No retry, private registry,
credential, mirror, alternate version or unpinned source was used. The short Git
revision is supplemented by the exact locked archive integrity; no independent
commit-signature claim follows. No libc choice was guessed from package names.
20 workspaces come from the approved source archive, not registry downloads.

Read-only tar metadata inspection finds21694 members:21602 regular files,
333503606 declared regular bytes,92 directories,185 executable-mode files,
18 ELF files and24 `.node` names. No escaping paths/links or special/sparse
members were found; package contents remain unexecuted.89 package manifests
declare install/prepare lifecycle keys; those declarations grant no permission.
This inventory does not establish every bundled binary's target or safety.

The first auditor wrongly assumed every npm tar uses the top-level name
`package`; authenticated `@types/keyv` uses `keyv`. It stopped before publishing
an audit. Its script/failure record remain preserved; the corrected auditor
requires one contained relative root without imposing that arbitrary name.
Neither audit extracted files or changed the811 verified archives.

Sealed public inputs outside the lab:

- `f102-public-js-artifacts-20261102`:0400 archives, inventory, collector and
  verification,0500 directories. Collection9.035s, no failures.
- `f102-public-js-artifact-audit-20261102`: preserved failed read-only audit.
- `f102-public-js-artifact-audit-20261102-v2`: completed audit in1.558s.

## Host cache construction and controls

Pinned host Bun1.4.4/Node24.22.1 were versioned and hashed, not newly authenticated
as upstream distributions or tested in Debian. A fresh approved3662971 Git tar
(122306560bytes,2898 blobs) was checked against every Git blob ID and executable
flag, then extracted by the reviewed sealed-source helper into a new private
host tree. Source/tree/archive identity is recorded separately from signature
trust; the merge's signature was not cryptographically reverified here.

Private scrubbed HOME/XDG/cache paths and absent source `.npmrc`/bunfig prevent
ambient user configuration from being adopted. The command is:

```text
bun install --frozen-lockfile --backend=copyfile --ignore-scripts
```

It exits0 with source bytes unchanged,21681 cache regular files/329633297bytes.
Existing independent FixtureGuard kernel custody supervises exact children,
retains pidfds and verifies reaping/ECHILD; no broad process scan or signal.
This is a host dependency/cache operation with lifecycle scripts disabled by
flag, not a product build or a guest/privileged worker invocation.

Bun creates805 absolute cache aliases. A separate read-only seed copies regular
bytes into independent single-link files and rebases every alias to a contained
relative target. No developer node_modules tree is copied. Another fresh source
tree receives a writable copy of that seed, with equivalence checked before Bun:

```text
bun install --offline --frozen-lockfile --backend=copyfile --ignore-scripts --cache-dir <new-private-cache>
```

Warm cache exits0; an otherwise fresh empty-cache control exits1 with explicit
`--offline ... is not in the cache` errors. Both preserve every source byte and
finish with exact owned-child absence. The original and sealed-seed regular
hashes/relative alias equivalence were rechecked after both cases. Node_modules
contains required esbuild, TypeScript, Electron package and better-sqlite3 source.
GNU Rollup, Tailwind oxide, lightningcss and napi lzma packages are present; their
selected addon headers are ELF64 little-endian x86_64, without dynamic loading.
SQLite was not compiled and Electron runtime was not prepared.

The compact seed manifest is4058327bytes/26079 nodes; its pretty inspection form
is5080657bytes. Do not feed either into the existing Cargo/header-only cache
schema or weaken its allowlist/limits. A later separately reviewed Bun-input
kind and transfer/materialization custody are required. Compact size alone does
not grant acceptance by another format. Capacity admission must include
330MB seed, mutable cache, installed tree, other tools and build scratch; the
archive's333MB sum is not a whole-build capacity estimate.

These are **offline-flag availability checks**. No kernel network denial was
installed or verified; do not substitute them for the later enforced-offline
guest worker. No trusted lifecycle grant, upstream runtime signature/CPU/ABI
proof, guest transfer, root preparation, installation/build receipt, native AT,
desktop/session or release acceptance follows.

- [Curated measured results](summary.json).
- [Exact retained record/harness bindings](retained-bindings.json).
- Retained host root: `f102-host-bun-cache-preparation-20261102` outside the lab.
- Primary cache semantics: [Bun global cache](https://bun.sh/docs/pm/global-cache)
  and the pinned CLI's help (`--offline`, `--ignore-scripts`, `--backend`, cache-dir).

All raw artifacts, failed attempts and private logs remain attributed and
preserved. F1-02 remains in-progress/UI pending, all97 task/dependency/criterion
states unchanged. Historical timeout-descendant uncertainty remains unknown.
