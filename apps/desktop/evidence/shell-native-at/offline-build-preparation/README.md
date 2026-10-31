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
