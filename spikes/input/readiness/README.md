# Device-free metadata readiness — S0-03 source only

This engineering module creates **selection proposals, never capture readiness or
consent**. It has no CLI, device-open/grab/uinput/worker/Arm operation, input stream,
service installer, permission change, or positive eligibility path. Separate reviewed private metadata observations have completed while the source
was unsigned; aggregate values/rows/private evidence are not published here.
Their four capture/consent/device/worker flags remain false and the authenticated
companion is unavailable. They establish neither complete/error-free hardware
inspection, device absence nor capture eligibility. See GUARDIAN.md for the
source/unit provenance and still-pending acceptance gates. AC01/AC02 remain pending. Existing manufactured-device guards and
native sources are unchanged.

`UdevMetadata.scan()` lazily loads only the fixed amd64 system libudev. It uses
input/keyboard enumeration and fixed device properties/sysfs attributes, requires
positively initialized devices with the current `seat` tag, and closes all
owned libudev references. Public exact zero from either check excludes only that
device: it may represent an ordinary false or a collapsed internal error, so it
is not an error-free classification. Explicit negative/unexpected values
invalidate the snapshot. Counts cover positively qualified metadata only, never
all hardware, complete discovery, absence of keyboards or capture readiness. It never opens the returned devnode. C strings, device counts and
elapsed scan observations are capped. Importing either module has no metadata
effect. Fixed launch environment: `LC_ALL=C.UTF-8`, `LANG=C.UTF-8`,
`PATH=/usr/bin:/bin`, and **no other entries**, checked before loading libraries.
Python -I -S with these values is tested through a fake libudev; an empty startup
environment can acquire Python's `LC_CTYPE` and is deliberately rejected.

The pure production filter rejects Linuxcast/self virtual metadata, other virtual
paths, pointer/touch/tablet/game-controller/switch or mixed metadata, unknown
transport/identity, wrong seats and missing keyboard/emergency-chord capability
bits. Eligible transport categories are USB, Bluetooth and i8042 only. Missing
ID_SEAT maps to seat0 following logind's default, **not** evidence of an active
authorized session. Duplicate enumerated paths invalidate the adapter, including skipped entries;
duplicate returned syspath/devnode/device numbers invalidate the catalog before
other pure filters. All128 inspected entries, including non-event and zero-check
entries, count toward the adapter bound; skipped devices still unref and advance
exactly once, without downstream metadata reads.
The private fingerprint includes the exact current node/path/number and metadata;
reconnect/replacement is not automatically approved.

`Catalog` receives a **trusted parent seam**: `ParentPeer` contains the real UID,
server-owned connection generation, monotonic expiry and an `alive()` callback.
The parent must already retain and authenticate the accepted kernel peer/pidfd and
transport, derive the UID from it, and ensure `alive()` checks that retained
lifetime. This module does not implement that adapter, accept a claimed PID/UID,
or prove actual kernel authentication. The dedicated guardian supplies a
separately reviewed kernel-bound parent; that does not make this standalone seam
a generic IPC endpoint. Dependency/source/clock injection is
for the trusted parent and fixtures only. No caller-selected source/library/path
exists on a wire. Every actual invocation still requires its separately reviewed source authority
and bounded wrapper; standalone metadata proposals do not grant capture.

The catalog's random secret and enumeration generation yield ephemeral opaque
tokens. The only untrusted proposal fields are token and generation; extra
claimed consent, authentication, device path, principal, unlocked state or
companion fields invalidate. Proposals retain the exact parent object, its fixed
generation/expiry, selected fingerprint and catalog epoch. Enumeration staleness
(1 second), proposal expiry (at most5 seconds, also bounded by parent expiry),
clock reversal, cancellation, replacement, disconnection or a different parent
object invalidate terminally. Both timing values concern metadata proposals;
they do not replace the existing input leases/watchdogs. Every assessment rescans
and brackets peer lifetime and expiry. Refresh cannot revive a selected proposal.

Every assessment returns only fixed reason and four false booleans. A valid
metadata proposal still reports `AUTHENTICATED_LIVE_COMPANION_UNAVAILABLE`:
capture remains unavailable until a separately reviewed compatible authenticated
companion/session adapter exists. Do not treat an unknown/false logind LockedHint
as unlocked evidence, keyboard connection as consent, or authentication as a
feature/device grant. Opaque candidate tokens/transport categories are private
interaction data; raw names, paths, fingerprints, principals and token values are
not diagnostics. Source errors normalize to a fixed exception without rendering
the original exception payload.

The adapter's elapsed checks are fail-closed observations after fixed libudev
calls, **not an independent preemption guarantee** for a stalled library/kernel.
The dedicated guardian source and its previous independently reviewed outcomes
are documented in GUARDIAN.md. Every new source authority requires independent
review and a separately authorized bounded invocation; this v4 source change
authorizes no actual metadata use or capture. Its1s adapter/2s query/5s total
guardian/8s outer/2s cleanup bounds stay unchanged.

Run local fixtures with `python3 -B -m unittest -v test_readiness` from this
directory. The tests exercise the production filters/catalog, fixed ctypes
metadata call signatures and reference cleanup through a fully synthetic DLL,
unknown environment rejection before loading, and a real sanitized Python -I -S
startup using that fake DLL. The parent lifetime is an injected trusted seam;
it is not actual kernel-peer/logind/companion proof. Real Python file/open entry
points are trapped during catalog tests, and the production adapter exposes only
fixed libudev metadata functions. Fixtures retain public synthetic names only.

The initial17 local tests passed, then coordinator review found the Python locale
startup mismatch; the exact minimal environment and actual startup regression
correct it. Those checks are synthetic startup/metadata fixtures. Historical
source and first outcomes remain preserved; no hardware/native or physical
acceptance is inferred.

Actual platform compatibility remains unproved here. Previously observed host
Pop!_OS22.04/GNOME42/systemd249 differs from Debian13/GNOME48/Plasma6.3. The current
peer-session adapter lacks its systemd253+ symbol on host249, and no reviewed
authenticated host42 positive companion path exists. This metadata module fixes
neither blocker. Later physical tests also need explicit selected-device consent,
administrative authorization, a dedicated worker, live pre-device enforcement,
fixed emergency/lease recovery, compositor held-key observations and the final
manufactured14/mapped2 regression. No physical-enabled fallback is added.

Normative: task S0-03; security.md114–139; linux-integration.md85–115 and143–179;
testing-release.md45–51; DESIGN.md Review gate. There is no product UI in this
increment. Shared manifests, routing, registry and generated cards remain with
the coordinator.

Primary API references: [systemd257 libudev device source](https://raw.githubusercontent.com/systemd/systemd/v257/src/libudev/libudev-device.c),
[libudev enumeration](https://www.freedesktop.org/software/systemd/man/257/udev_enumerate_scan_devices.html),
[logind seat default](https://raw.githubusercontent.com/systemd/systemd/v257/src/login/logind-core.c).

## V4 qualification and preserved execution history

The original signed7e version of this README, adapter and test_readiness.py is
preserved byte-for-byte in private source history, with their literal commit/hash
provenance recorded. These THREE files are new unsigned deltas; only
readiness.py and checks.json remain byte-identical signed7e files. Historical
checks and real/fake results remain unchanged; later signing cannot rewrite
then-unsigned execution provenance. The old initialized0 test expectation is
explicitly superseded by the reviewed per-device rule; its private/scan/string
error assertions remain, with a positive zero-exclusion/cleanup assertion added.
The standard unfiltered suites plus new test_per_device.py cover this behavior;
no replacement test runner/subclass or silent exclusion is used.

The underlying libudev249/257 implementations can collapse internal current-tag
errors to0; initialized can likewise expose0 with errno. This module adds no
errno query/API or tag filter to force diagnosis. Any zero result omits that
device, while each remaining candidate must pass every original positive guard.
This is conservative candidacy, not global inspection success.
