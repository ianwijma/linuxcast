# Fixed Rust routing for offline receipt preparation

Coordinator contract frozen before implementation. This is preparation only:
no Rust prefix is provisioned, no compiler is executed, and no new permit,
receipt, native admission or F1-02 acceptance follows from this document.

`product_staging.prepare` currently replaces PATH with Node's parent and
`/usr/bin:/bin`; the separately provisioned Rust1.95.0 binaries are invisible.
Keep Node at `/opt/linuxcast-f102-lab/node/bin/node`. Its native-wrapper tree
must still contain exactly `bin` and `bin/node`; do not hide compilers there,
widen that mount, add a shim, or change wrapper/controller/driver authority.

The fixed separate Rust prefix is `/opt/linuxcast-f102-lab/rust`, with real
`bin/cargo` and `bin/rustc`. Coordinator provisioning must authenticate the
distribution, preserve its sysroot layout, root-own/protect every ancestor and
payload, and independently pin/version/hash/ELF-check tools before preparation.
PATH is routing, not compiler identity, upstream authentication or ABI proof.

Before any build child, require the fixed Rust bin directory and both ordinary
executable files to be present. Missing, symlinked/nonregular or nonexecutable
tools fail with the existing `prerequisite` category; never silently use a
system cargo/rustc when the declared prefix is unavailable. No download,
rustup shim, caller path override, new environment option or timeout change.
The separate coordinator toolchain-custody preflight remains mandatory; this
bounded routing increment must not claim to replace it.

The preparer's scrubbed PATH becomes Node's existing parent, then the fixed
Rust bin directory, then `/usr/bin:/bin`. Never inherit the caller's PATH.
Keep the frozen CARGO_HOME/CARGO_NET_OFFLINE and Electron header/npm offline
routing, cache immutability, source/lock/output inventory, per-child180s/total360s,
SessionOwner cleanup, receipt schema and validation semantics unchanged.

Own only `product_staging.py`, its existing test file, and new
`evidence/shell-native-at/rust-build-routing-preparation/`. No build.ts, shared
contract/dependency/lock/registry changes or native pin refresh. Use ordinary
private synthetic executable fixtures, injected metadata where necessary, and
actual child command resolution to distinguish the fixed prefix from ambient/
system candidates. Never probe/create/chmod real `/opt` tools or invoke a real
compiler in implementation/review. Add original-source behavioral reds/current
greens; keep earlier routing/cache-mutation fault controls meaningful rather
than masking them behind a new missing prerequisite. Run the full offline mapped
suite under its unchanged18s bound, with no skips or assertion weakening.

Independent review and separately reviewed actual provisioning/custody precede
use. Actual compiler/build/receipt, namespace/rootdrop/statx/containment, Debian
desktop/session/AT/recovery and complete97-task/local1.0 gates remain pending.
