# Read-only install routing/control metadata — collector boundary

Coordinator contract frozen before implementation. This is a distinct,
nonexecuting collector/codec increment, not a host owner, guest permission,
installation permit, writer-exclusion proof or claim of complete install
admission. Read the accompanying
[APT/dpkg research](../../evidence/shell-native-at/debian-install-transaction-research/README.md).
The full97-task/local1.0 goal and existing acceptance states remain unchanged.

## Owned interface and explicit limits

Implement only new `install_metadata.py`, `test_install_metadata.py` and new
`evidence/shell-native-at/install-metadata-preparation/`. The coordinator owns
this protocol and `install-metadata-targets.json`. Do not edit an existing
owner, build-facts collector, controller, staging, namespace, driver, observer,
parser, source pin, permit, registry, manifest, lockfile or test routing.

The module imports inertly: no filesystem probe, process, network, environment
mutation or actual metadata collection. Its API supplies fixed guest source,
its hash, strict snapshot validation and packet encoding/decoding. Source-data
construction may read only the adjacent frozen targets file when explicitly
called, never at import. No caller path, selector, command, environment or
timeout option, host CLI, SSH invocation, reservation or artifact publication.
Running the host module must not collect host facts or dispatch anything.

The intended later guest invocation is the existing fixed Python3 isolated
mode, with no third-party import. Maximum quoted source argument60000 bytes;
do not enlarge the existing65536 transport domain. A compressed literal of
reviewable fixed Python source is permitted; never execute snapshot/target data
as code. Guest hard alarm25s and failure signals remain bounded; eventual
metadata job30s, owner600s and cleanup45s are unchanged. The current offline
suite keeps its18s wrapper. No actual guest invocation in this increment.

The payload-path data has5983 unique absolute lexical paths, including regular
files, directories and links from all55 authenticated candidate archives. Its
source is the approved payload inventory SHA256
`341b9d45b330b0cd8379d7861af72e269a9224c4189bc6ccefd8bad5907acc3a`.
The target file SHA256 is
`59e3967d9110c7b451a0ba5181382eef395967bdb4945ef1ceec9561f987f153`;
its expanded canonical path-list SHA256 is
`a54b64bcd53987a9db18066f859d2f2d9ca02f36284f80e1636cea7a6cba2432`.
Require all exact schema keys, both hashes, count/length and bounded complete
zlib/base64 decoding; no alternate file or environment override. Explicit
activation names are exactly `ldconfig`. This data identifies observation
targets only; it grants no package, script, filesystem-write or execution right.

## Fixed read scope and locks

Require Debian13/amd64, effective UID/GID0 and sudo UID/GID1000. Read only
`/usr/lib/os-release` for OS identity. Do not read user homes, user configuration,
passwd/shadow, credentials, keys, machine identity, environments, processes,
services, buses, devices or unrelated data. Invoke no command, including dpkg,
APT, an interpreter for a control file, a loader, locale helper or compiler.

Acquire shared nonblocking POSIX record locks on the existing regular,
root-owned, single-link no-follow files in this order:

1. `/var/lib/dpkg/lock-frontend`
2. `/var/lib/dpkg/lock`
3. `/var/lib/dpkg/triggers/Lock`

Never create, truncate, chmod, repair or retry a lock. Hold all three through
complete collection and final verification; release in reverse order. Keep one
retained FD per lock inode: do not reopen/close that inode through another FD,
because that can drop this process's record locks. This is snapshot consistency
only, not exclusion across a later APT/dpkg transaction.

Read `/var/lib/dpkg/status` with the existing8MiB/4096-record/128KiB-stanza/
16KiB-physical-line constraints and correct deb822 duplicate/continuation rules.
Do not accumulate discarded description/conffile values. Require each nonempty
record's identity/status; preserve valid partial/broken states truthfully.
Record original raw status SHA256/size and package/hold/broken/pending counts.
No raw status body is exported. Pending counts are records containing nonempty
Triggers-Pending or Triggers-Awaited fields, case-insensitively. No projected
status digest may substitute for this original-byte digest.

Capture raw bytes, digest and custody for these fixed metadata files:

- `/var/lib/dpkg/triggers/File`: required, maximum256KiB.
- `/var/lib/dpkg/triggers/Unincorp`: required existing regular empty file.
  Absence is unavailable, not an initialization/repair opportunity.
- `/var/lib/dpkg/triggers/ldconfig`: optional, maximum64KiB; retain absence.
- `/var/lib/dpkg/arch`: optional, maximum8KiB; retain absence.
- `/var/lib/dpkg/info/format`: optional, maximum4KiB; retain absence.
- `/var/lib/dpkg/diversions` and `/var/lib/dpkg/statoverride`: optional,
  maximum256KiB each; retain absence and nonempty data without applying it.
- `/etc/dpkg/dpkg.cfg`: optional, maximum64KiB; retain absence.
- Accepted config basenames in `/etc/dpkg/dpkg.cfg.d`: `[A-Za-z0-9_-]+`,
  sorted, at most32 files,64KiB each. Do not follow accepted symlinks. Record
  ignored entry names/types as metadata without opening their contents.

Retain complete bounded listings for updates, triggers and dpkg.cfg.d (or the
optional config directory's absence). Require updates to be empty. At most4096
entries in triggers/updates and64 in cfg.d, names at most255 bytes. Listings
must be independently repeated completely, including after a previous scandir
advanced a directory offset. Never list the entire dpkg info directory.

Parse every nonempty File/explicit-registration record using the exact dpkg
format from the versioned source. Package identities allow a validated
architecture qualifier; only default, `/await` and `/noawait` options are
accepted. Unknown/malformed/duplicate interests refuse, rather than disappear.
Compare path interests lexically against every frozen candidate path and its
ancestors; do not resolve merged-/usr aliases into equivalent trigger keys.

Select the union of matching File interests and ldconfig registrants, at most32
unique handler identities. For each, capture only its actual `info/<identity>`
`.triggers` and `.postinst` controls, at most256KiB each. Resolve the dpkg info
namespace correctly using status Architecture/Multi-Arch and info format; no
arbitrary filenames, path traversal, globbing or reading a different package's
control as fallback. Retain legitimate missing controls as absence, not code
success. Include selected identity/status/version fields for handlers and the
fixed apt/dpkg/libc-bin/man-db identities, explicitly distinguishing absence.

This is **first-order routing and control observation**, not full effect closure.
Diversions, helper execution, recursive explicit activations, sourced code,
runtime/ELF/NSS/manpath/ldconfig configuration, service activation and independent
writer exclusion still require coordinator analysis and separately frozen facts.
The collector must not claim those were absent, safe or verified. Nonempty
policy/config/broken/hold facts are observations, not permission to install.

## Custody and bounds

Traverse descriptor-relatively from a retained trusted root. Protect every
ancestor and leaf: root ownership, no group/other write, required type and
single-link regular metadata leaves. Do not follow arbitrary symlinks. Explicit
merged-/usr ancestor links `/bin`, `/sbin`, `/lib`, `/lib64` may be recognized only
with bounded fixed relative targets, protected ancestors and canonical binding;
this read set otherwise needs no arbitrary alias. Per-path maximum1024 bytes.

Retain device/inode/type/mode/UID/GID/link-count/size/mtime/ctime. Keep descriptor
ownership safe across opening, validation, partial reads, cancellation, hard
alarm, closing and descriptor reuse. Recheck complete bytes and path/directory
bindings before success. Absence must be checked again; late creation or same-
byte replacement invalidates the snapshot. Never close an unrelated reused FD,
retry an ambiguous close, or publish an observation with uncertain custody.
If tiny syscall/bookkeeping critical sections mask handled signals, include
SIGALRM and retain the independent later30s job bound; never mask collection.

At most128 captured files,64 retained/listed directories and256 retained FDs;
at most2MiB raw exported file bytes, with a2MiB final canonical snapshot cap.
Either bound may refuse; do not increase it to fit an unknown baseline. Status
is hashed/parsed privately and excluded from the raw-export total. The fixed
target list has its own257735-byte expansion and5983-entry limits. No unbounded
read, line concatenation, decompression, pipe, output or recursive walk.

## Snapshot and codec

Private snapshot has exactly nine top-level keys:
`schema`, `scope`, `identity`, `os`, `packageState`, `files`, `directories`,
`handlers`, `targetSha256`. Schema is `f102-install-metadata-v1`; scope is
`first-order-routing-controls-only-not-install-admission`. Identity/OS use the
existing explicit root/sudo/Debian13/amd64 facts. targetSha256 is the frozen
expanded path-list hash above. Handler identities are sorted and unique.

packageState has exactly `originalStatusSha256`, `originalStatusBytes`,
`packageCount`, `holdCount`, `brokenCount`, `pendingCount`, `selectedPackages`.
Counts are integers with justified bounds; selectedPackages maps exactly the
fixed four identities plus the derived handler identities to actual preserved
Package/Architecture/Version/Status/Multi-Arch fields or explicit null absence.
Do not synthesize absent fields of legitimate partial records.

Files have exactly `path`, `state`, `metadata`, `bytes`, `sha256`, `data`.
Present data is strict base64 of raw bytes; length/digest/metadata size agree.
Absent entries use null for all four value fields. Metadata has exactly
`device`, `inode`, `mode`, `uid`, `gid`, `nlink`, `size`, `mtimeNs`, `ctimeNs`.
Directories have exactly `path`, `state`, `metadata`, `entries`; absent has
null metadata/entries. Present entries are sorted unique objects with exactly
`name`, `kind`, `metadata`, consistent with the retained complete listing.
Export no extra path/file fields. Sorted file/directory arrays have no extras,
missing required/derived records or duplicates. The host independently checks
these relationships and rederives handler selection from the retained registry.

The distinct packet has exactly `schema`, `status`, `firstFailure`, `encoding`,
`expandedBytes`, `sha256`, `data`: schema `f102-install-metadata-packet-v1`,
encoding `zlib-base64`, status observed/unavailable. Observed means a complete
valid bounded snapshot only. Unavailable carries a fixed allowlisted reason,
zero expanded bytes and null digest/data. Exit0 only observed, exit3 unavailable;
no stderr or raw exception/path diagnostic. Maximum packet60000 bytes; later
transport65536. Host decoding rejects duplicate keys, nonfinite/wrong numeric
types, unknown fields/reasons, malformed base64, truncation, trailing/second
zlib streams, expansion lies, wrong digest/canonical form and exit/status lies.
Old build-facts/native domains reject this packet and vice versa. No public
owner/guardian result schema is introduced yet.

## Validation and next authority

All tests use private synthetic metadata and injected identity/syscall adapters;
never collect host facts, execute a control, probe `/opt`, use the real lab or
run an owner CLI. Cover parser/registry/config/handler selection, aliases,
locks/contention/order/lifetime, byte/directory/absence replacement, short reads,
all bounds/codec failures and cancellation/close/reuse boundaries. Import must
be inert. Mutations must fail the actual behavioral controls, with original
sources restored; no success can be a missing fixture or unrelated guard.
Run the focused suite and full automatically discovered offline/mapped security
suite under its unchanged18s bound, without skips or weakened old assertions.

Record executed/inherited evidence, source/target hashes and all remaining
acceptance limits in the new preparation folder. Independent two-axis review
and separate host owner/permit/artifact/transport/source-custody integration are
required before one actual capture. No permit is created here. Installation,
locale, helper/runtime closure, root provisioning, build/receipt, containment,
native/session/AT/recovery/release and full97/local1.0 acceptance remain pending.
