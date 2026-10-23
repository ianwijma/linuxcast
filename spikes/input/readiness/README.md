# Device-free metadata readiness — S0-03 source only

This engineering module creates **selection proposals, never capture readiness or
consent**. It has no CLI, device-open/grab/uinput/worker/Arm operation, input stream,
service installer, permission change, or positive eligibility path. No actual
udev metadata, keyboard, session, companion or bus has been queried for this
increment. AC01/AC02 remain pending. Existing manufactured-device guards and
native sources are unchanged.

`UdevMetadata.scan()` lazily loads only the fixed amd64 system libudev. It uses
input/keyboard enumeration and fixed device properties/sysfs attributes, requires
initialized devices with the current `seat` tag, and closes all owned libudev
references. It never opens the returned devnode. C strings, device counts and
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
authorized session. Duplicate syspath/devnode/device numbers invalidate the scan.
The private fingerprint includes the exact current node/path/number and metadata;
reconnect/replacement is not automatically approved.

`Catalog` receives a **trusted parent seam**: `ParentPeer` contains the real UID,
server-owned connection generation, monotonic expiry and an `alive()` callback.
The parent must already retain and authenticate the accepted kernel peer/pidfd and
transport, derive the UID from it, and ensure `alive()` checks that retained
lifetime. This module does not implement that adapter, accept a claimed PID/UID,
or prove actual kernel authentication. This is an ordinary trusted in-process
engineering API, not a generic IPC endpoint. Dependency/source/clock injection is
for the trusted parent and fixtures only. No caller-selected source/library/path
exists on a wire. Actual use awaits separate review of the dedicated parent
wrapper and its authentic kernel binding.

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
A future reviewed dedicated process must establish no-core/minimal environment,
fixed source/library authority, an independent overall deadline and own-child
cleanup before any actual metadata invocation. It must not enable capture. There
is no wrapper or actual-use authorization in this patch.

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
correct it. No failed live operation was retried. Final checks/results accompany
the frozen handoff; no hardware/native or physical acceptance is inferred.

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
