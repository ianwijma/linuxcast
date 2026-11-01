# F1-02 read-only Debian build facts

Coordinator contract for a separate, reviewed metadata job before exact offline
package resolution. The selected inventory is insufficient for installed-state
dependencies/holds; its missing development packages are not an install list.
This step cannot install/repair packages, provision accounts, transfer build
inputs, build, create a native permit/receipt or run a product/reader. Full97
local1.0, native/session/AT and release acceptance remain unchanged.

## Fixed authority and ownership

Reuse the unchanged `lab_owner.py` reservation, pinned container/configuration,
root/lock/marker custody, guardian, interruption recovery, exact child ownership,
fixed SSH/sudo, readiness and poweroff cleanup. Keep all native/inventory CLI and
permit domains unchanged. No existing base owner, inventory, controller, namespace,
observer/parser/driver, staging, manifest, receipt or source-pin edits.

New host module `lab_build_facts.py` has one closed CLI requiring
`--reviewed-build-facts-owner --reviewed-build-facts-probe`. No caller command,
path, package selector, account, backend, timeout or arbitrary program argument.
Its inert embedded guest source is fixed `/usr/bin/python3 -I -B -c <source>`,
quoted exactly like the reviewed inventory transport. The only repeating guest
probe is fixed `/usr/bin/true` readiness under the existing120s budget. Metadata
job<=30s with guest25s hard alarm, total600s and cleanup45s unchanged. No native
wrapper dispatch or input. Same verified linuxcast UID1000/noninteractive sudo.

Private0400 permit `f102-build-facts-permit.json` has exactly14 keys:
`schema` (integer1), `jobKind` (`build-facts-only`), `captureId` (canonical UUID4),
`containerId`, `imageId`, `labRoot`, `labDevice`, `labInode`, `ownerSha256`,
`buildFactsOwnerSha256`, `buildFactsProbeSha256`, `guestAccount` (`linuxcast`),
`guestPrivilege` (`sudo-noninteractive`), `buildFactsAuthorityReviewed` (true).
Bind exact reviewed base/new-owner/embedded source bytes and existing identities.
The capture UUID is an opaque coordinator nonce, never a user path or selector.
This is metadata/cleanup authority, not guest readiness or installation proof.
Do not create a permit in implementation/review assignments.

Use the existing marker bound to exact permit bytes; foreign/native/inventory
markers refuse. Valid interrupted ownership must recover before new work, even
if its private snapshot already exists. New fresh dispatch refuses an existing
capture artifact before marker/start; override the existing create-marker seam
rather than weakening recovery. At most one start and one facts dispatch per
reservation, intent accounted before fallible launch bookkeeping.

## Fixed read-only guest collection

Require Debian13/amd64, effective root UID/GID0 and trusted sudo UID/GID1000.
No reads of homes, user content, environments, credentials, private keys, machine
identity, clipboard, buses, displays/input/audio or unrelated process metadata.
No network request, package operation, service change or namespace/UID probe.

Acquire nonblocking POSIX shared read locks on the existing root-owned regular
no-follow single-link dpkg frontend/database lock descriptors, in that order.
Never create/truncate/chmod lock files. A held/unreadable/missing/replaced lock
is unavailable; no retry or bypass. Hold both through complete metadata read and
source consistency checks. Snapshot `/var/lib/dpkg/status` through its retained
bounded regular descriptor, checking path binding, device/inode, size/timestamps
and bytes before/after. Maximum8MiB input,4096 nonempty stanzas,128KiB per stanza,
16KiB per line/field. Fail on uncertain concurrency or malformed metadata.

Correct deb822 colon/whitespace/continuation and case-insensitive duplicate rules
apply. Never skip a malformed/unnamed nonempty stanza as absence. Project only
these canonical fields, preserving their actual presence:
Package, Architecture, Version, Status, Essential, Protected, Priority, Multi-Arch,
Depends, Pre-Depends, Provides, Conflicts, Breaks, Replaces, Installed-Size.
Fold continuation whitespace for folded fields; require simple identity/status/
version fields to be valid. Package/Status are mandatory; installed/config-files
records require Architecture/Version. Preserve holds and uninstalled records;
do not synthesize missing package versions. Sort unique name/architecture records.
Do not export descriptions, maintainers, conffiles, arbitrary fields or paths.

Require no unapplied dpkg update journals or unincorporated triggers before
claiming a complete package baseline. Read only bounded directory metadata and
fixed pending-state files; never apply/repair journals or trigger processing.
Record holds/pending/broken states truthfully; unavailable/inconsistent state
cannot become a clean install baseline. Architecture facts must include native
and configured foreign architectures, with a documented source. Fixed dpkg
print-architecture/print-foreign-architectures commands are permitted only if
needed, using bounded exact retained-child lifetime/output (not subprocess.run
with unlimited pipes). No other dpkg/APT command. No host metadata collection in
implementation/tests; inject all guest facts and syscall/command adapters.

Also collect only fixed capacity/locale/public trust facts: statvfs of `/`,
`/opt`, `/var/cache/apt`; MemTotal/MemAvailable from bounded meminfo; own CPU
affinity count; availability of en_US.UTF-8 without changing global settings;
SHA256/size of the root-owned public Debian archive keyring at
`/usr/share/keyrings/debian-archive-keyring.gpg` (<=256KiB). No private key bytes.
Read dpkg/APT/keyring package versions from the projected status. Missing locale,
keyring or fixed resource parent is a known missing fact, never invented bytes
or readiness. Read failures remain unknown/unavailable. No resource quota bump.

## Snapshot, codec and private publication

Freeze strict nested key sets/types in the implementation evidence before code:
snapshot top-level exactly schema (`f102-build-facts-v1`), identity, os,
architecture, packages, packageState, resources, locale, keyring. Identity uses
effectiveUid/effectiveGid/sudoIdentity; os id/version/architecture; architecture
native/foreign/source; packageState statusSha256/statusBytes/holds/pending.
resources contains fixed filesystems, memory and cpuAffinity counts. Missing
values use explicit fixed status/null, never successful zeros. Private JSON
contains only allowed facts; reject unknown keys and nonfinite/boolean integers.
Validate all cross-field/identity/count/status relationships independently on host.

Canonical sorted ASCII JSON snapshot<=2MiB. Fixed zlib+base64 packet<=60000 bytes
fits the unchanged65536 combined transport limit; do not change Children.run or
guardian4096 limits. Packet exact keys: schema (`f102-build-facts-packet-v1`),
status (`observed`/`unavailable`), firstFailure, encoding (`zlib-base64`),
expandedBytes, sha256, data. Success uses positive bounded length, lowercase
SHA256 and canonical validated base64. Failure uses0/null/null and a fixed code.
Exit0 iff observed/none; exit3 otherwise. No raw exception/stderr/private data.
Allowed non-none codes: identity, os, package-lock, packages, package-state,
architecture, resources, locale, keyring, bounds, deadline, output, custody.

After the first actual capture returned only `bounds`, permit these additional
closed diagnostic codes without changing packet/public shapes, read scope,
limits, deadlines, authority or private-data handling:
`bounds-status-input`, `bounds-status-line`, `bounds-status-stanza`,
`bounds-status-field`, `bounds-status-records`, `bounds-os-input`,
`bounds-architecture-input`, `bounds-trigger-input`, `bounds-keyring-input`,
`bounds-updates-entries`, `bounds-snapshot`, `bounds-packet`.
They identify the fixed guard/invariant that refused the input/output, not a raw
value, exception, path or readiness claim. Input guards include empty/invalid
type or inconsistent bounded reads where already checked, not only upper size.
Existing `bounds` remains accepted for historical replies. Existing unknown/error
wrappers retain their behavior; no new diagnosis may turn an unavailable fact
into a snapshot. No code includes caller text, counts or package contents.
Synthetic guard cases must fail the prior generic-only implementation and pass
the scoped diagnostic source. A fresh independent review, approved source hash
and new permit precede any next capture; no automatic retry of the first run.

Host decoding must bound allocation before decompression, require exact declared
length/SHA256/canonical snapshot, zlib EOF and no trailing/concatenated stream,
strict base64/JSON and closed fields. Reject oversized/compression bombs. A
valid unavailable packet preserves its fixed failure, not an empty package set.

Only the host owner may publish the validated canonical snapshot as exclusive
no-follow0400 `f102-build-facts-<captureId>.json` under retained private lab-root
descriptor. Retain/check identity through short-write/readback/fsync/close and
guardian handoff; never overwrite/adopt a replacement. Preserve uncertain partial
artifacts without claiming completed publication or rollback. Private identity
metadata may cross the guardian internally, but is stripped from public output.
Public schema `f102-build-facts-owner-v1` is build-facts-only, containing existing
lifecycle plus fixed fact status/failure/count/bytes/digest/captureId and
acceptance=pending. No package bodies, paths, PIDs, machine IDs or source text.
Never publish full snapshot into earlier native results or commit actual package
baseline into fixtures. Reply validity/artifact publication stay consistent across
interruption; first operation failure and cleanup failure remain distinct.

## Implementation and acceptance boundary

Own only new `lab_build_facts.py`, `test_lab_build_facts.py` and new
`evidence/shell-native-at/build-facts-preparation/`. Existing reviewed owner APIs
should suffice through subclass seams/compressed packet. Request shared changes
from coordinator if needed; no generic runner, dependency or timeout change.
Import is inert. No real CLI, Docker/SSH/guest, privileged adapter or host package
database/locale/resource/keyring probe in implementation/review. Ordinary private
file/codec/process fixtures use existing independent child custody; no host FD
or process-name-wide action. Include original-source/fault controls that expose
real boundary failures, not implementation-mirroring tests.

Offline checks cover every parser/hold/architecture/journal/lock/concurrency and
capacity unknown; codec truncation/bounds/duplicates/trailing; permit/source/domain
and artifact collision/replacement/publication faults; caller/guardian/recovery/
cleanup/accounting and no native/installation admission. Preserve all native/
inventory tests and their295-case baseline; complete mapped suite remains within
unchanged18s, without skips, clock shortcuts or weakened assertions. Record exact
source hashes/platform/executed versus inherited results. Independent review
precedes fresh coordinator permit and first actual capture. This produces facts
for a future reviewed package plan, not installation, build or native acceptance.

Normative context: outer-owner-protocol.md, inventory-owner-protocol.md,
build-provisioning-research/README.md and Debian dpkg1.22.22 arch.c/dbmodify.c.
Source links are evidence, not authority for commands or trust bypass.
