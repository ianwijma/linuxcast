# Frozen build-facts snapshot and relay shape

Frozen before implementation, 2 November 2026. Base
`393f9da0a3e384ed6a15e18a1973d111494f19c8`. This elaborates the coordinator's
[protocol](../../../tests/at/build-facts-protocol.md); it grants no authority.
All objects below have exactly the listed keys, all integers exclude booleans,
all arrays are bounded and sorted/unique where specified. Unknown keys fail.

Snapshot keys:

- `schema`: literal `f102-build-facts-v1`.
- `identity`: `{effectiveUid: 0, effectiveGid: 0, sudoIdentity: "uid1000"}`.
- `os`: `{id: "debian", version: string, architecture: "amd64"}`; version is
  13 or 13 followed by up to two dot-separated decimal components.
- `architecture`: `{native: "amd64", foreign: [architecture string], source:
  "dpkg-status-and-arch"}`. Native is the installed dpkg package Architecture,
  independently required amd64 with x86_64 kernel/OS. Foreign is the configured
  `/var/lib/dpkg/arch` list excluding native; an absent file means no configured
  foreign architectures, an unreadable/malformed file fails. A present list must
  contain native, with no duplicates/all/unknown. No dpkg child or host probe.
- `packages`: array of projected objects, with canonical deb822 field names.
  Exact allowed fields: Package, Architecture, Version, Status, Essential,
  Protected, Priority, Multi-Arch, Depends, Pre-Depends, Provides, Conflicts,
  Breaks, Replaces, Installed-Size. Package/Status mandatory; Architecture and
  Version mandatory except not-installed records. Every other field is optional;
  presence is retained, no null/synthesized version. All values are strings.
  Order is `(Package, Architecture or "")`, unique. At most4096 records.
  Identity fields are simple, folded relationship fields use single spaces.
  Every input field (also discarded ones) obeys duplicate/continuation/size rules.
- `packageState`: `{statusSha256: lowercase sha256, statusBytes: integer1..8388608,
  holds: [{package: string, architecture: string|null}], pending:
  {updates: 0, triggers: false, broken: integer0..4096, clean: boolean}}`.
  Holds exactly match selection=hold, sorted in package order. Broken counts
  reinstreq or states other than installed/config-files/not-installed. Clean iff
  broken=0; holds do not imply broken or authority to modify. Nonempty updates
  (including unknown entries) or Unincorp triggers refuse a complete snapshot.
  No journal/triggers application. Empty/missing Unincorp is clean; unreadable
  is unavailable. Updates directory must exist, be stable, root-owned, bounded.
- `resources`: `{filesystems: {"/": capacity, "/opt": capacity,
  "/var/cache/apt": capacity}, memory: memory, cpuAffinity: affinity}`.
  Capacity exact `{status, availableBytes, freeBytes, totalBytes, availableInodes,
  freeInodes, totalInodes}`. Known values are integers0..2^63-1, available<=free
  <=total; status=missing/unknown means every value null. Fixed parent absence
  means missing; permission/I/O errors mean unknown. Memory exact
  `{status, totalBytes, availableBytes}` with known total>0 and available<=total;
  otherwise null. Affinity exact `{status, count}` with known count1..1048576;
  otherwise null. These two allow known/unknown only. No quota changes.
- `locale`: `{status, available}`. known has boolean available (false is known
  missing locale); missing has false, unknown has null. Read-only libc newlocale
  tests exactly en_US.UTF-8 with glibc LC_ALL_MASK, frees its own locale handle; ENOENT means missing,
  other errors unknown. No setlocale/global setting/command.
- `keyring`: `{status, sha256, bytes, packageVersion}`. known has lowercase
  sha256 and size1..262144 and installed debian-archive-keyring version (string
  or null if package absent). missing/unknown have null digest/bytes; packageVersion
  still exactly derived from packages. Only the fixed public root-owned regular
  single-link no-follow keyring is hashed, never exported. No trust verification
  or keyring readiness is inferred. dpkg/APT/keyring versions are in packages.

An observed packet needs no unknown facts; known missing resources/locale/keyring
are observations, not build readiness. Snapshot validation independently checks
all identity/type/order/status/hold/broken/architecture/keyring relationships.
Schema validation can represent unknown resources, but observed packet admission
rejects them. Unavailable packet carries no snapshot, count or invented baseline.

Packet exactly `{schema,status,firstFailure,encoding,expandedBytes,sha256,data}`,
with constants and limits from protocol: snapshot canonical sorted ASCII JSON
<=2097152, zlib+canonical base64, packet<=60000, combined transport65536 unchanged.
No concatenated/trailing stream, duplicate JSON keys, nonfinite/nonnative JSON
integers, noncanonical snapshot, excess nesting or decompression overflow.

Internal relay = unchanged lifecycle keys plus `buildFacts` and `artifact`.
`buildFacts` exactly `{status,firstFailure,packageCount,bytes,sha256,captureId}`;
status is not-received/unavailable/observed. Not-received uses failure=none and
all count/bytes/digest null. Unavailable has fixed non-none failure and null
counts/bytes/digest. Observed has none, count1..4096, bytes1..2097152 and digest.
CaptureId is canonical UUID4 from the permit for received replies, null before
receipt. `artifact` is null unless observed, then exactly
`{device: nonnegative integer, inode: positive integer}`. It is private identity
metadata, stripped from public result. Observed iff publication was completely
written/readback/fsynced/closed/reopened/checked and relay committed atomically;
transportResultValid iff received. Uncertain partial files remain, never removed.
Guardian reply and public output<=4096. Public exactly
`{schema:"f102-build-facts-owner-v1",jobKind:"build-facts-only",lifecycle,
 buildFacts,acceptance:"pending"}`. No packages, private identity/path or native
count reaches it. A later custody fault invalidates observation conservatively
and preserves first operation failure separately from cleanup failure.
