# Authenticated candidate Debian package bodies and control inspection

Coordinator preparation after the [exact APT3 candidate resolution](../debian-package-resolution-preparation/README.md).
**No package installation, maintainer execution, guest operation or approval to
install occurred.** The candidate is still55 new packages/767 keeps, zero
upgrades/removals/downgrades/held changes; full97/local1.0 scope is unchanged.

Before acquisition, the private plan's213796bytes/SHA495b3acf were verified.
Every55 tuple, action, size, Installed-Size, SHA256 and authenticated location
was independently matched against the original signed trixie/updates/security
indexes. Compressed/expanded hashes/sizes and current dates/explicit expiry were
rechecked. Duplicate identical stable/security artifacts retain both locations;
no filename-equality fiction, rewritten index, stale bypass or solver change.
This validates artifact selection/bindings, not a second dependency-solver proof.

All55 public `.deb` files were fetched from the explicit authenticated Debian
archive locations, then checked for exact size/SHA256:77072036bytes total.
No root or package installer ran, and no input was transferred to the guest.
The archive cache is caller-private0500 with0400 single-link payloads.

Static inspection verifies ar envelopes and bounded control/data archives.
Only control data files were materialized0400 for read-only review in a fresh
private directory; payload contents were hashed in memory, not installed or
extracted into filesystem destinations. Inventory:4232 regular payload files,
294754869 regular bytes,816 directories and1375 links. No service/systemd/cron/
udev/D-Bus activation paths, special or set-ID files were observed. This is not
a claim that arbitrary package scripts or existing trigger handlers are inert.

The coordinator read all15 selected pre/post install/remove/config scripts.
Their effects include compiler alternative registration/removal, documentation
link maintenance, a pkgconf directory, conditional upgrade-only handling, and
GCC's cleanup of a dangling legacy f77 alias. These are real privileged system
effects if executed, not rollback-free or appearance-only actions. The new-install
plan does not take upgrade-only branches. A keyword inventory is retained as
navigation, not a complete behavioral proof.

Declared triggers include `activate-noawait ldconfig` and
`interest-noawait /lib/pkgconfig`. **Existing baseline trigger registrations and
handlers still require review/binding**, including any path-triggered handlers.
No inference of complete trigger safety follows from the55 control archives.
Before installation, freeze the exact action set, pre-dispatch state/lock checks,
root-protected local-only bundle, trusted APT/dpkg/hook/handler bytes, output and
resource bounds, child/guardian lifetime, partial-state/recovery semantics and
the separate fixed locale generation step. No generic root runner or source/data
manifest granting itself execution authority is admitted.

- [Exact public artifact bindings](artifacts.json).
- [Static control/payload observations](control-summary.json).
- [Retained full public data/harness hashes](retained-bindings.json).

Public archives remain in `f102-public-debian-build-packages-20261102` outside
the lab. Read-only control data and payload hash inventory remain in
`f102-public-debian-maintainer-audit-20261102`. Neither contains user files,
credentials or the full captured installed-package snapshot. Only candidate
install tuples/public hashes and bounded observations are committed here.

Original guest status, projected solver status and canonical snapshot identities
remain distinct. Fresh original-state/holds/architecture/pending and body hash
checks are mandatory before any separately reviewed install. Partial mutation
is durable dirty state, never proof of rollback or permission to retry. Build,
locale availability, native/AT/session/recovery/release and full-task acceptance
remain pending. No task or criterion is promoted by this preparation.
