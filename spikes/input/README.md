# S0-03 native input recovery feasibility

This is a **synthetic-device-only engineering spike**, not an installable input service. Read [S0-03](../../docs/implementation/tasks/S0-03.md), the complete [input lifecycle](../../docs/architecture/linux-integration.md), [security](../../docs/architecture/security.md), [overview](../../docs/architecture/overview.md), [stack](../../docs/architecture/stack.md), and [testing/release](../../docs/implementation/testing-release.md) before interpreting its results. The design review gate and tokens were read; no product UI is introduced.

## Boundary and current evidence

The source implements passthrough, fixed **Left Ctrl + Right Ctrl + Escape** disarm, one-second application lease, 100ms worker heartbeat, 500ms supervisor watchdog, parent-death handling and terminal disarm. It contains no Hyper mapping, snippet matching, templates, deletion/insertion, arbitrary shortcut injection, provider or workflow integration. No physical keyboard path can be selected through the public protocol.

**The final actual Debian guest security gate passes 2/2 checks with no skips**, using source `26688de`: all 14 manufactured-device scenarios and the mandatory extension-sandbox control-socket denial. The runner was the isolated Debian 13.7 amd64 software VM, generic kernel 6.12.113+deb13-amd64, systemd 257 and libevdev 1.13.4, with no graphical session or host input devices mounted. Source hashes and all three binary hashes matched the guest. This establishes real synthetic kernel recovery and containment evidence; it does not establish physical held-key recovery, compositor modifier state or live logind transitions. The first unavailable run and the later failed mixed timing measurement remain recorded below. No host service, permissions, group membership, systemd policy, physical input device or user desktop was changed or used. Missing prerequisites still fail the harness rather than skipping tests.

Independent review found three concrete gaps in the first source: dormant completed input could replay on Arm; watchdog expiry added an inappropriate100ms grace; and wrong-UID evidence could be satisfied by DAC/busy rejection alone. The source now adds the bounded pre-arm barrier and manufactured queue regression, immediate watchdog kill with calibrated timing, and a root peer denial before any authorized connection. The final guest run exercises these strengthened scenarios successfully, alongside the retained compile/non-device checks.

The coordinator owns Cargo manifests/lockfile, dependency inventory, task registry and named-suite mapping. Rust1.95/edition2024, libc0.2.191, serde1.0.229 and serde_json1.0.154 are pinned there. The Debian build image supplies libevdev1.13.4, development headers, pkg-config and the C compiler. The tiny C bridge uses Linux header constants rather than handwritten syscall or ioctl numbers; Rust owns protocol and safety state machines.

## Descriptor and process lifetime

The root lab manufacturer creates a fresh libevdev uinput source with a fixed synthetic name and unique physical identity. It opens a source evdev client and a separate output `/dev/uinput` descriptor, hands both to the root supervisor over a private `SOCK_SEQPACKET` socket using `SCM_RIGHTS`, then immediately drops those copies. A separately opened observer evdev client can verify a competing grab; it is a different kernel client, never a duplicate of the worker's client.

Source inspection of the exact [Debian libevdev1.13.4 archive](https://deb.debian.org/debian/pool/main/libe/libevdev/libevdev_1.13.4+dfsg.orig.tar.xz), `libevdev/libevdev-uinput.c`, found that creation does not copy the library object's `phys` into the kernel device. The first source only set the library metadata, so the later strict evdev identity check could not succeed. The manufacturer and passthrough setup now explicitly apply the Linux-header `UI_SET_PHYS` ioctl to their already-open uinput descriptors **before** device creation, and fail closed if it fails. The source identity comparison remains unchanged. The reviewed correction is exercised by the successful final real synthetic kernel run.

The supervisor authenticates the private root peer and validates the manufactured source identity. It creates a fixed worker subprocess under the dedicated nonlogin `linuxcast-input-spike` UID/GID with no supplementary groups, then sends the two descriptors through its own private socket. **It immediately drops all device descriptors after that send.** No recovery duplicate exists. The worker owns the last references to its evdev client; library destruction alone is insufficient, so Rust `OwnedFd` values close the descriptors after native teardown.

The worker checks empty effective/permitted/inheritable/ambient capabilities, disables core dumps and dumpability, installs `PR_SET_PDEATHSIG=SIGKILL` after credential changes, and checks the parent-death race. Before initialization it receives only the two selected descriptors and one internal socket. Its stdin/stdout point to `/dev/null`; stderr now inherits only the trusted engineering failure channel described below. Other descriptors close on exec. After libevdev/uinput setup and sysfs discovery, an amd64 seccomp allowlist denies new files, sockets, execution, process/thread creation, ptrace, io_uring and mount operations. Only specified input-state/grab/device-destruction ioctl requests remain usable. The capability bounding set is not a permission the worker can exercise; it has no permitted/ambient capability and cannot execute another image. Production unit bounding-set validation remains a separate gate.

The supervisor narrows its effective/permitted capabilities to CHOWN, SETUID, SETGID and KILL. It does not install a system service or claim validation of the production unit, device cgroup policy, systemd watchdog or polkit lifecycle. A production logind/desktop adapter is also not implemented here: trusted context updates come from a root-owned **synthetic fixture** channel. The unprivileged control client cannot assert lock state, UID, session properties, consent or context generation.

Virtual-device readiness and all physical keys released are required before grabbing, with kernel key-state checks before and after the grab. Dormant events are discarded without forwarding; after grabbing, a mandatory bounded drain must reach `EAGAIN` in both libevdev and kernel queues, then key state is checked again before accepting Arm. A completed old press/release cannot be detected by a held-key snapshot alone. More than256 queued events, synchronization loss or another ambiguous drain error refuses Arm and terminates the worker. Forwarding has no unbounded queue: at most64 events are handled per loop before lease/control checks. `SYN_DROPPED`, unexpected event types, failed forwarding, expiry, disconnect, invalid protocol, context revocation or emergency chord terminate this worker. No resynchronized state is interpreted as text. Orderly teardown emits releases for its own logical keys, ungrabs and destroys the virtual device. SIGKILL relies on last-descriptor closure and uinput removal; the final synthetic kernel experiment verifies grab release and virtual-device removal for worker and supervisor SIGKILL. There is no automatic worker respawn/regrab path.

## Control and privacy

The fixed public socket lives below a root-owned non-writable `/run/linuxcast-input-spike/` hierarchy. The per-case socket is owned by the authorized client UID with0600 permissions. The supervisor validates `SO_PEERCRED`; the client verifies service UID0. The protocol has only version1 handshake, status, arm, renew and disarm. Strict JSON schemas reject unknown fields and operations. Length-prefixed frames have a stricter1024-byte control bound inside the global1MiB ceiling, no pipelining, bounded connection/frame deadlines and a32-request/second rate bound. Replies contain only version, generation, state and allowlisted reason.

Raw events and held-key state stay inside the worker and the isolated synthetic observer. No key event, unmatched text, device-event payload, credential, clipboard or application title is logged, sent over control IPC, saved to disk or placed in core dumps. The final harness report contains public scenario names, booleans and numeric operational/recovery timestamps only. Native libevdev logging is disabled. Same-UID unsandboxed malware is not claimed isolated by the socket; the final mandatory extension-sandbox test proves this socket hierarchy is inaccessible under the accepted sandbox profile, with an authorized direct-client positive control and zero sandbox connections.

The first actual guest kernel attempt failed before any scenario report, so diagnostics now identify a static startup stage. Trusted supervisor/worker stderr is inherited through the lab instead of discarded: each failing process emits at most one JSON line capped at384bytes, containing only component/stage/failure codes (`A-Z` and underscore, maximum64characters), a fixed IO-kind enum and optional numeric errno1..4095. Error Display/Debug, error sources, path strings, JSON field/value text and device events are never formatted. Unknown errors map to a fixed unclassified code; JSON parser failures map to a fixed schema code. A replacement panic hook ignores the panic payload/location/backtrace. libevdev logging remains disabled before every library initialization. A seeded non-device regression verifies that arbitrary error text/private path canaries cannot appear. This engineering stderr change does not remove capability, seccomp, parent-death, core or watchdog checks.

## Reviewable guest harness

`linuxcast-input-spike-synthetic-lab` requires all of these before opening uinput:

- Explicit `--reviewed-disposable-guest` invocation as root.
- Debian13 `/etc/os-release` and no graphical session records under `/run/systemd/sessions`.
- A root-owned regular0600 `/run/linuxcast-input-spike-lab` marker containing exactly `S0-03 disposable Debian synthetic devices only\n`.
- A dedicated nonlogin `linuxcast-input-spike` account, distinct from root and client UID1000.

These checks prevent accidental normal invocation; they are not a security boundary against a malicious root administrator. **Never create that marker on the user's host.** The final runner was the isolated official Debian13.7 software VM with no host input/uinput devices mounted. Do not run while another agent starts a graphical guest session. The coordinator must reserve the guest for this test, review this harness, and create the marker/test account there explicitly. All executables must be root-owned and non-writable by other users before use.

The manufacturer supports only fixed modifier/Escape/F24 key capabilities and never enumerates physical devices. Device nodes come from libevdev's newly created object, are validated character devices opened `O_NOFOLLOW`, and the supervisor independently validates the exact synthetic name/physical identity. The harness's UID1000 client closes every inherited device/control descriptor before connecting. Worker signals use pidfds, avoiding PID-reuse kills.

The successful actual scenarios are worker/supervisor SIGKILL with synthetic modifiers down; SIGSTOP/500ms worker watchdog; one-second app lease with otherwise fresh context; fixed emergency chord; competing-client regrab, virtual-device removal and no rearm after550ms; wrong-UID control denial; context revocation; and locked/unknown/inactive/TTY/remote/stale context **fixtures** coupled to actual no-grab checks. A separate queue regression stops the dormant worker, queues a completed syntheticF24 down/up before Arm, resumes it and requires no virtual key events; the same observer must then see fresh post-armF24 input as a positive control. Kernel virtual-device removal is not evidence about modifier cleanup in a real compositor or physical laptop/USB/Bluetooth keyboard. Those release gates remain outstanding.

The wrong-peer experiment runs before any authorized connection: a root test peer can pass the unchanged0600 socket DAC, yet must receive the supervisor's explicit `PEER_UID_OR_BUSY` denial. With no other client present this isolates `SO_PEERCRED` UID enforcement. A separate dedicated-worker-UID client is also denied by0600 DAC; the subsequent authorizedUID1000 connection must work. Production permissions are not weakened for this test.

Recovery measurements start before the trigger and end when both a separate client can grab and the old virtual device returns `ENODEV`. The watchdog case waits a fresh operational heartbeat immediately before SIGSTOP, avoiding up to100ms uncertainty in heartbeat age. The mandatory watchdog value remains500ms, with **no additional cooperative grace**. The supervisor records the last heartbeat, expiry detection and actual successful SIGKILL issuance, emitting this typed operational record immediately after kill and **before** wait/reap. The test requires detection after at least500ms of silence, kill>=detection, and silence-to-kill<=500+75ms (the explicit scheduling/observation tolerance). Eventual kernel grab/virtual-device removal has a separate250ms bound measured from kill issuance. A late kill cannot pass merely because cleanup completed inside a larger combined window.

The app lease remains1000ms. Its disarm-request timestamp is captured after a successful control send; the test requires request>=lease expiry and <=expiry+75ms, then eventual kernel removal within250ms of that request. SIGKILL paths retain their250+75ms observation window; emergency/context paths retain100+75ms. Only cooperative teardown reasons may use a100ms grace before kill. These are separate action and kernel-cleanup measurements, not changed production leases/watchdogs.

This corrects the earlier measurement model: the actual combined run failed the old mixed watchdog-cleanup bound at620ms, and a quiet standalone run observed628ms watchdog cleanup,1102ms lease cleanup and roughly127-133ms SIGKILL/emergency cleanup. A kernel teardown tail is an inference from those timings, not yet a proved cause. The final operational timestamps establish those phases separately: watchdog detection and successful SIGKILL occurred 501 ms after the last heartbeat, with grab/virtual-device removal observed 127 ms after kill; lease disarm was requested 1 ms after expiry, with removal 101 ms after that request. Worker SIGKILL recovery took 121 ms, supervisor SIGKILL 116 ms and emergency disarm 78 ms. These are measurements of this runner, not physical/compositor latency guarantees. `recovered()` checks its bound before and after kernel ioctls and returns failure for a late observation; a regression covers completed-but-late recovery. Completed/failed case observations are emitted even when a later case fails, and the required TypeScript test saves only allowlisted labels, booleans and numeric timestamps to `evidence/kernel-debian.json` **before** assertions, including partial reports from nonzero native exits. No raw stdout/stderr/error text or arbitrary JSON field is copied into that artifact.

Before any subsequent execution, the coordinator must review descriptor drops, fork-child inherited-FD closure, dedicated UID/capability transition, parent-death race, post-init seccomp, marker/session guard, pidfd signaling and all teardown paths. No approved host device path, host credential or device mount is needed.

## Checks

The no-device checks use the pinned Debian build image, unprivileged build UID1000 and only project/cache mounts:

```sh
cargo test --locked -p linuxcast-input-spike
cargo clippy --locked -p linuxcast-input-spike --all-targets -- -D warnings
cargo fmt -p linuxcast-input-spike --check
```

The current no-device run passes **eleven checks** (eight native unit/protocol/descriptor/privacy tests and three actual subprocess checks), with no ignored tests: [nondevice-tests.log](evidence/nondevice-tests.log). Strict all-target clippy passes: [clippy.log](evidence/clippy.log). TypeScript typecheck/lint and planning validation also pass. These no-device results complement the successful manufactured-device run; they do not authorize physical device testing.

`tests/nondevice.rs` launches the actual worker's fixed policy-probe mode to validate empty capabilities/core policy and real seccomp denial of file, socket, exec, clone and unknown ioctl requests; it opens no input devices. Pure safety fixtures cover session/lock/seat/remote/consent/freshness denial, exact lease expiry/generation/no-rearm and the fixed chord. Actual Unix sockets exercise SCM_RIGHTS, sender-copy closure, CLOEXEC and peer credentials. These are distinct from the successful actual synthetic kernel harness.

The required named suite maps to `spikes/input/kernel.security.test.ts` and coordinator-owned `spikes/input/plugin-socket.security.test.ts`. Its fixed root-owned `/opt/linuxcast-input-spike/linuxcast-input-spike-synthetic-lab` executable and explicit reviewed-guest invocation require real manufactured-device recovery; missing prerequisites fail rather than skip. The final `bun run test:security -- S0-03` run passed both checks, exit 0, with no skipped tests. See the [final security log](evidence/security-debian.log), [allowlisted kernel report](evidence/kernel-debian.json) and [cleanup verification](evidence/guest-cleanup.json). Afterward, cleanup confirmed no Linuxcast input processes or manufactured devices remained, and the root-only lab marker was removed before the guest was released. A run with no guest/kernel prerequisites must fail that gate; no skipped or unavailable success is acceptable.

## Acceptance map

| Criterion | Evidence / remaining gap |
|---|---|
| S0-03-AC01 | Actual manufactured-device worker/supervisor SIGKILL releases the grab and removes the virtual device; watchdog, lease and emergency recovery also pass bounded measurements. **Not sufficient to close the full criterion under its normative references:** physical keys held during failure and compositor no-stuck-modifier recovery remain unverified. |
| S0-03-AC02 | Actual mandatory sandbox cannot reach the control socket; root wrong-peer denial precedes the authorized client. Locked/inactive/TTY and other trusted synthetic contexts refuse Arm with actual no-grab checks. **Live session evidence remains incomplete:** these decisions use root fixture Context records, not actual logind/desktop lock or session transitions. |
| S0-03-UI | Conditional N/A proposed: no product UI/service enablement introduced. Engineering diagnostics do not establish onboarding/accessibility acceptance. |
| S0-03-PRIVACY | Seeded diagnostic privacy regression, reviewed fixed failure codes and allowlisted final reports; only public synthetic identities, booleans and operational timing scalars. No raw event/content logs or core dumps; source/timing reviews and successful actual reports are recorded separately from outstanding physical/desktop gates. |

## Primary API evidence

- [Kernel uinput](https://docs.kernel.org/input/uinput.html): userspace device creation; libevdev recommended for new software.
- [libevdev initialization/grab](https://www.freedesktop.org/software/libevdev/doc/latest/group__init.html): grabbing and descriptor lifetime; freeing libevdev does not close its fd.
- [libevdev uinput lifecycle](https://www.freedesktop.org/software/libevdev/doc/latest/group__uinput.html): externally supplied uinput descriptors and virtual-device destruction.
- [libevdev synchronization](https://www.freedesktop.org/software/libevdev/doc/latest/group__events.html): `SYN_DROPPED` and synchronization status; this restricted spike disarms.
- [Linux Unix-domain sockets](https://man7.org/linux/man-pages/man7/unix.7.html): SCM_RIGHTS, peer credentials and pathname socket permissions.
- [Parent-death signal](https://man7.org/linux/man-pages/man2/PR_SET_PDEATHSIG.2const.html): credential-change clearing and the parent-death race.

Complete production installation/polkit, logind races, selected physical-device fingerprints/udev, service hardening/watchdog, suspend/update/uninstall, USB/Bluetooth, LEDs/media keys, multiple devices, keymap/IME/protected fields and any actual Hyper/snippet behavior are owning-task/release work. This spike does not close the complete privileged input security gate.

## Read-only session-context increment

The separate `linuxcast-input-spike-context-probe --observe-own-session` executable is a monitor-only engineering tool. **Source snapshot `e944347` and its private fixtures were independently reviewed. The host invocation denied before bus access; two actual Debian guest invocations acquired fresh logind data and reported remote/non-graphical session denials.** It cannot open an input device, create or connect an input control socket, send Arm, change session state, install a service or grant input permission. No call from the input supervisor or worker uses this module. The successful manufactured-device evidence above remains tied to source `26688de` and its recorded binaries; it is not live-context evidence for this increment.

The native bridge binds only the executable's real PID/UID through `sd_pid_get_session` and `sd_session_get_uid`, rechecking that binding before and after every snapshot. It accepts no claimed UID, session identifier, PID, bus address or path argument. A process launched by a systemd user manager may have no unambiguous login session; this produces `NO_BOUND_SESSION`, rather than guessing a same-UID graphical session. Internally retained session/object/unique-owner identifiers never cross the C/Rust bridge or appear in the report.

The bridge connects only the fixed `/run/dbus/system_bus_socket`, after checking its root-owned socket and non-writable root-owned parent directories. Environment-selected buses and libsystemd debug logging overrides are removed before any library call. It resolves the unique `org.freedesktop.login1` owner through the system bus, requires that connection's Unix UID to be root, and addresses session reads to that pinned owner. The application method set is fixed: `GetNameOwner`, `GetConnectionUnixUser`, `GetSession` and typed `Properties.Get` for `User`, `Remote`, `Active`, `Type`, `Class`, `Seat` and `LockedHint`. Complete method-return signatures must exactly match `s`, `u`, `o` or `v` before any expected leading value is read; property variants also require the exact contained signature. Auto-activation is disabled. The only additional bus operations are connection setup and signal subscriptions; no lock/unlock, activate, take-control/device or property-write operation exists.

Each native snapshot has a 250 ms total query budget and at most 50 ms per call. At most 32 incoming messages are dispatched per drain, with an additional callback-event bound covering dispatch inside synchronous method calls; excess traffic fails closed. The executable emits at most 20 reports over its nominal five-second observation window, with an independent seven-second process deadline covering stalled setup/local session reads or blocked report output. Owner changes, selected-session property changes or invalidations, selected-session removal, bus disconnection and any query/malformed/deadline/flood failure advance the monitor-local generation and discard that snapshot. Typed reads are bracketed by message drains and PID/session checks; no cached eligibility survives an error or timeout. Snapshots older than one second, a query lasting over 250 ms or reversed timestamps lose every eligibility flag. These asynchronous observations do not provide an atomic lock boundary. A failed connection is terminal for this short invocation; restart the monitor after repairing an unavailable bus/session. The numeric generation is local to this observation run, not an authorization or replay token.

Every report has `monitorOnly=true`, `canArm=false`, `companionAvailable=false` and `lockKnown=false`, with fixed denial enums and public booleans/numeric timings only. Even a fresh root logind `LockedHint=false` produces `COMPANION_UNAVAILABLE` and `UNKNOWN_LOCK`; it cannot grant permission. A reported locked hint also produces `LOGIND_LOCKED`. There is no supported companion authentication or positive lock/eligibility grant path in this increment.

The coordinator added the explicit bin target and build-only `libsystemd-dev=257.13-1~deb13u1` to the isolated Debian build image, `linuxcast-s0-03-context-build:debian13` (image digest `d99e0a39fcbca61433ce22b65842f7dc8c81b3df0f5ffd04b2ad767c879d557a`). The runtime library is distro `libsystemd0`; no Rust dependency or lockfile change was needed. The owned build script compiles a separate private-fixture executable; its injection/server code is never linked into the probe.

The no-device run now passes 16 Rust checks: 11 unit tests, two context subprocess checks and the three original non-device subprocess checks. One context subprocess checks 14 actual private socketpair sd-bus cases: typed unlocked hints, wrong session UID, non-root service owner, malformed variant or unexpected trailing method-return fields, a genuinely unanswered method timeout, property invalidation, locked/remote/TTY/inactive state and service-owner change and a real burst exceeding the callback-event bound. Its private server rejects every method outside the fixed read set. A seeded arbitrary property/value canary is not printed. Rust tests require missing companion denial even with otherwise fresh eligible logind values, discard all flags on invalidation/timeout/stale or malformed observations, and reject caller-selected identity/bus arguments before library access. These are private transport/model fixtures, not live logind/session acceptance. See [context non-device checks](evidence/context-nondevice-tests.log) and [strict context Clippy](evidence/context-clippy.log). The [source hashes](evidence/context-source-sha256.txt) and [probe binary hash](evidence/context-binary-sha256.txt) identify this increment separately. [Static binary inspection](evidence/context-binary-inspection.log) shows only the three context bridge exports, no input-boundary/libevdev symbols and no libevdev dynamic dependency. This inspection does not substitute for live system-bus evidence.

The [actual host observation](evidence/context-host.json) identifies source `e9443479cd3d124476057043aba91f5f7cb49764` and the matching probe SHA256 `32f2637486b0d4ac4a54445eda14c9ba92166e8d83979b61d71ed7a7a34bee2d`. On Pop!_OS 22.04, GNOME 42.9 X11, kernel 7.1.1-76070101-generic, runtime libsystemd 249.11 and libc 2.35, the five-second invocation exited 0 with 20 exact-schema reports. Every report had `canArm=false`, all session/graphical/eligibility flags false, and only `NO_BOUND_SESSION`, `SNAPSHOT_STALE`, `COMPANION_UNAVAILABLE` and `UNKNOWN_LOCK`. This process had no unambiguous own-PID session binding, so the bridge denied before bus connection. It proves the real ambiguous-binding denial path on this host; it provides **no actual system-bus query, authenticated owner, locked/inactive/TTY transition or companion authorization evidence**, and is not a Debian 13/systemd 257 runtime result. The earlier wrapper metadata attempt was incomplete because an architecture-unspecified package query matched multiple installed architectures; the recorded final invocation followed the corrected native-amd64 metadata query. No earlier acceptance is claimed. Artifact review confirms only public platform/build metadata and fixed booleans, numeric fields and denial enums; no session/PID/UID identifiers, paths, titles or raw bus/error data appear in the reports.

The subsequent actual Debian 13.7 guest observations used the same source and exact probe hash, generic kernel `6.12.113+deb13-amd64` and runtime `libsystemd0=257.13-1~deb13u1`:

| Observation | Allocated PTY | Own `loginctl show-session self` type | Reports / exit | Maximum snapshot query |
|---|---|---|---|---|
| [Ordinary SSH](evidence/context-guest-ssh.json) | false | `tty` | 20 / 0 | 69 ms |
| [SSH with `-tt`](evidence/context-guest-pty.json) | true | `tty` | 20 / 0 | 16 ms |

All 40 reports are fresh, own-PID-bound, UID-matched and read from the root-owned logind service. Both sessions report `active=true`, `local=false`, `graphical=false` and `seatZero=false`, with exact denials `REMOTE`, `NOT_GRAPHICAL`, `NOT_SEAT_ZERO`, `COMPANION_UNAVAILABLE` and `UNKNOWN_LOCK`. Every report retains `canArm=false`, `companionAvailable=false` and `lockKnown=false`, even though logind's locked hint is known and false. These results prove actual context-data acquisition and negative observation for these real remote/TTY sessions. They do **not** prove refusal by the input supervisor or worker: neither consumes this monitor, and the monitor has no Arm operation. In particular, `active=true` supplies no inactive-session evidence, and a false locked hint supplies no authenticated desktop-unlocked evidence.

The guest reservation was explicitly borrowed and returned to S0-02. No PAM/sshd configuration, policy, session activation/lock, input settings or fabricated XDG/session metadata was changed. [Cleanup verification](evidence/context-guest-cleanup.json) records absent monitor processes, removed staged guest/host-lab files, absent input-lab marker and reservation return. Independent artifact checks verify exact report/metadata keys and scalar types, all expected denial values, monotonic report timestamps, matching source/binary identifiers and no private identifiers, window data or raw bus/error strings.

Actual locked/inactive transitions, authenticated supported companion freshness and enforcement by the input supervisor/worker still need real integration evidence. Physical held-key and compositor recovery remain outstanding. **AC01/AC02 are not complete.** No host input enablement, administrative policy or device access follows from this monitor.

Primary context API references: [systemd 257 login1](https://www.freedesktop.org/software/systemd/man/257/org.freedesktop.login1.html), [PID/session binding and its user-manager limitation](https://www.freedesktop.org/software/systemd/man/257/sd_pid_get_session.html), [typed bus properties](https://www.freedesktop.org/software/systemd/man/257/sd_bus_get_property.html), [explicit bus address](https://www.freedesktop.org/software/systemd/man/257/sd_bus_set_address.html), [method timeouts](https://www.freedesktop.org/software/systemd/man/257/sd_bus_set_method_call_timeout.html) and [signal subscription](https://www.freedesktop.org/software/systemd/man/257/sd_bus_add_match.html).

Additional schema/routing sources: [whole-message signature checks](https://www.freedesktop.org/software/systemd/man/257/sd_bus_message_get_signature.html) and [D-Bus sender/path_namespace match rules](https://dbus.freedesktop.org/doc/dbus-specification.html#message-bus-routing-match-rules). The production property subscription is restricted to login1 session paths; the private direct-peer fixture uses the known unique-owner equivalent because a direct peer has no broker name resolver.


## Peer-bound monitor increment (reviewed source `224a3bb`)

`context::PeerMonitor::bind_connected(UnixStream, trusted_expected_uid)` is a separate **monitor-only engineering API**. The caller supplies an already accepted AF_UNIX stream and an expected UID from trusted server state, never from a message. Successful construction captures metadata; it does not authorize the peer. There is no new executable, input device access, control protocol, Arm operation or supervisor/worker integration in this increment. The own-session probe's invocation and behavior remain unchanged. All reports retain `canArm=false`, `companionAvailable=false` and `lockKnown=false`.

This API requires a dedicated observer launched with an **empty environment**, before library initialization, and no subsequent environment mutation. It rejects any environment entry with fixed `ENVIRONMENT_UNTRUSTED` before optional-symbol resolution or session/bus work, and rechecks the contract around queries. It never clears global environment inside a library. This is not a general in-process production adapter. Private subprocess negatives seed an arbitrary canary, logging override and bus-address override; each returns only the fixed rejection boolean, with empty stderr and no bus query.

The native constructor validates a connected AF_UNIX/SOCK_STREAM socket, derives actual kernel `SO_PEERCRED`, requires the trusted UID, and obtains **`SO_PEERPIDFD` from that same connection**. Both retained descriptors are CLOEXEC. There is no `pidfd_open` fallback, arbitrary PID/session constructor, wire principal parser or client SCM_RIGHTS acceptance. The Rust API consumes the supplied stream and retains only its native metadata copy. Kernel pidfd liveness and transport disconnection checks bracket `sd_pidfd_get_session`/session-UID reads, each fixed bus method, and the complete snapshot. Session/UID changes, connector death (even if a descendant retains the socket), transport loss, malformed/query/deadline/invalidation failures advance the epoch and permanently deny that binding. A new same-UID connection cannot revive it. Existing fixed root-owned system-bus routing, typed schema, subscriptions and 250 ms snapshot/50 ms method budgets remain in force; an over-budget local lookup also discards the snapshot. Any future executable must independently bound its entire process lifetime, as the own-session CLI already does.

The peer function is resolved only as the fixed public `sd_pidfd_get_session` symbol through `dlsym(RTLD_DEFAULT)` in the already-linked system library. No library path is accepted or dynamically opened. Missing capability produces `PEER_SESSION_UNSUPPORTED`; an unavailable kernel socket option produces `PEER_PIDFD_UNAVAILABLE`. Pinned systemd257 exports the symbol as `LIBSYSTEMD_253`. Offline ELF inspection confirms that rebuilding the own-session probe adds **no ELF version requirements or NEEDED libraries** compared with its accepted baseline, and does not hard-link that symbol or require `LIBSYSTEMD_253`. This preserves the prior host249 ABI requirement without pretending the old library supports peer observation. No rebuilt probe was invoked against a host or guest bus in this increment. See [inspection](evidence/peer-binary-inspection.log) and accepted [baseline versions](evidence/peer-own-probe-baseline-versions.log)/[baseline libraries](evidence/peer-own-probe-baseline-needed.log).

The pinned Debian13 build container runs as UID1000 with only project/cache mounts, on the actual Pop!_OS host's Linux7.1.1-76070101-generic kernel. Its **19 no-device Rust checks pass**, with no ignored tests, including the existing14 private typed sd-bus cases and the new real post-fork-connect transport fixture. Strict all-target clippy and formatting pass. See the [fixed transport report](evidence/peer-transport.json), [test log](evidence/peer-nondevice-tests.log), [clippy](evidence/peer-clippy.log), [platform/check metadata](evidence/peer-checks.json) and [source hashes](evidence/peer-source-sha256.txt). The fixture proves retained-socket connector death, death during an outstanding mock query, same-UID nonrevival, terminal session/UID changes, wrong UID/fd, unavailable capability and disconnect denial. Forged PID/UID bytes and a client SCM_RIGHTS descriptor remain queued and are never parsed or installed. Fixture children have bounded lifetimes and are reaped; no host bus or device is mounted or opened.

**Session and bus replies in the peer fixture are private mocks**, including the mocked root bus owner and session UID. These results establish real kernel transport/lifetime behavior plus private query-race handling, not live logind authentication, supported-companion freshness or supervisor enforcement. The ELF check is static ABI evidence, not a new host execution result. The earlier actual own-session captures remain tied to source `e944347` and their recorded binary, separately from this increment. **S0-03-AC01 and AC02 remain pending** for physical/compositor recovery and real input enforcement/context transitions. UI remains conditional N/A; public reports and new evidence contain only fixed labels, booleans, operational timing/tool metadata and public fixture identities.

Primary peer API references: [systemd257 PID/pidfd session APIs and the warning against peer PID lookup for authorization](https://www.freedesktop.org/software/systemd/man/257/sd_pid_get_session.html), [systemd257 pidfd identity verification implementation](https://github.com/systemd/systemd/blob/v257/src/libsystemd/sd-login/sd-login.c), and [Linux6.12 public socket option definitions](https://github.com/torvalds/linux/blob/v6.12/include/uapi/asm-generic/socket.h). The build uses the target header's `SO_PEERPIDFD`, not a guessed numeric option.


## Dedicated private-peer observer wrapper (reviewed source `8a62ab2`)

`linuxcast-input-spike-peer-probe --observe-private-peer` is the only production invocation for this engineering wrapper. It accepts no PID, UID, session, bus address or socket path. Before any libsystemd work or child/thread creation it clears the environment, disables core dumps/dumpability and installs a seven-second kernel alarm. The executable is separate from the input supervisor/worker and has no device, Arm, input-control protocol, service, grant, session-activation or policy operation. **The coordinator and a separate reviewer accepted the exact source/private lifecycle tests. One authorized host invocation subsequently returned unsupported before any session lookup**, as recorded below.

The guardian creates its own generated0700 temporary directory and0600 AF_UNIX listener. Its fixed controlled child **connects after fork**, with parent-death protection and a parent-identity race check. The guardian checks the accepted socket's kernel peer PID/UID against its own unreaped controlled child and real UID, removes both temporary pathnames, then forks the query process. That process uses the reviewed `PeerMonitor` API and inherits the empty environment/no-core policy. The client sends no application content or descriptors; the observer accepts no claimed identity or control messages from it.

The query process samples20 reports at nominal250 ms intervals. At the fixed2.5-second midpoint the guardian terminates and reaps only its own controlled client, then sends a fixed internal completion byte to the query process. Ten reports precede and ten follow that verified termination. A successful wrapper exit requires fresh PID/UID/root-owner-bound observations before termination, followed by terminal `PEER_DEAD` with cleared flags and an advanced, unchanged generation. Every report remains monitor-only, `canArm=false`, with missing-companion/unknown-lock denial. A missing library capability produces one `UNAVAILABLE` row with a fixed denial and an incomplete/nonzero exit; a missing session or failed query also cannot produce successful observation evidence.

Public rows have only fixed phase enums `BEFORE_CONTROLLED_TERMINATION`, `AFTER_CONTROLLED_TERMINATION` or `UNAVAILABLE`, plus the existing safe report or fixed denial. Each serialized row is capped at4096 bytes and there are at most20 report rows. No PID, UID, session/object/owner identifier, pathname, raw bus error or content is emitted. The test-only lifecycle fixture's captured internal process identifiers stay in memory and are not published. Existing bounded diagnostic classification/panic handling never formats error payloads or paths.

The guardian performs no session queries and can terminate a stalled query process independently. Its ordinary6.5-second deadline reserves bounded cleanup time; the original seven-second `SIGALRM` remains armed through production error reporting/exit, even if the guardian stalls or output blocks. Operational process-lifetime pidfds are opened only for its own direct, unreaped fork children and used for signaling without PID reuse. They are **not** an authentication fallback: peer identity still comes exclusively from `SO_PEERCRED`/`SO_PEERPIDFD`. Both controlled children use parent-death SIGKILL/race checks. Cancellation, early failure and deadlines stop/reap owned children; the dedicated guardian reaps adopted descendants. No arbitrary process can be selected for signaling.

The pinned Debian13 userland container on the Pop!_OS host's Linux7.1.1 kernel passes the existing19 no-device Rust checks plus the separate **nine-case, single-threaded, no-query lifecycle fixture**, with no ignored tests. Cases cover fixed invocation/privacy, normal completion, connect-stage failure, cancellation, query failure, query stall/ordinary deadline, an actual retained descendant, guardian SIGKILL and the genuine seven-second kernel alarm with the guardian deliberately stalled. The latter requires exit124 and observes child death through retained kernel handles; the fixture allows250 ms external scheduling/measurement tolerance without changing the seven-second alarm. Strict all-target clippy, formatting, typecheck and plan validation pass. See [test log](evidence/peer-wrapper-nondevice-tests.log), [clippy](evidence/peer-wrapper-clippy.log), [fixed fixture report](evidence/peer-wrapper-private.json), [checks](evidence/peer-wrapper-checks.json) and [frozen source hashes](evidence/peer-wrapper-source-sha256.txt). The fixture replaces session data with explicit mocks and never calls libsystemd session/bus APIs; it is compiled only into the separate test target, with no production fixture selector.

Cleanup evidence is stage-specific. Ordinary startup failure removes the private paths. The tested guardian SIGKILL and seven-second alarm cases occur **after verified pathname removal**. An external, uncatchable SIGKILL during the narrow directory-creation/connect startup window cannot run Rust filesystem cleanup and may leave an empty generated0700 directory/0600 socket; it contains no private payload. Parent-death protection still applies to children. This spike does not promise arbitrary-timing SIGKILL filesystem cleanup.

The host249 invocation established no peer-session data; the subsequent Debian observations below establish read-only data acquisition and peer-death observation only. Desktop lock/companion eligibility and supervisor enforcement remain unverified. The earlier actual own-session evidence remains separate and unchanged. Physical held-key/compositor recovery and real input-enforcement context transitions remain outstanding: **AC01 and AC02 stay pending**. There is no product UI or input enablement flow. Fixture success alone authorizes no actual session lookup, guest access or service/policy change; source review precedes any separately approved observation.


## Actual host private-peer wrapper: unsupported

After independent source review, the single authorized host invocation of `--observe-private-peer` used exact source `8a62ab283d6a55fce076ca60e8b320852c2fb316`, registration checkpoint `da2b283eb71b60bee5c71c2b8ab6f5c0d3dbaaed` and binary SHA256 `7ea51672bfd419b375efb10f68d2e9ef70ac19e3f381fb1b3fe82db3eeb18e6c`. The launch had an empty environment and an independent7.75-second process deadline/eight-second cleanup budget. See the [strictly validated host artifact](evidence/peer-wrapper-host.json).

On actual Pop!_OS22.04 amd64, Linux7.1.1-76070101-generic and libsystemd249.11, it exited3 after4.218 ms. Exactly one public row reports `UNAVAILABLE` / `PEER_SESSION_UNSUPPORTED`; the only stderr row contains the fixed `PRIVATE_PEER_OBSERVATION_INCOMPLETE` diagnostic with no raw error payload. This matches the missing systemd253 pidfd-session API on host249. The constructor denies before session/bus reads. **This is actual unsupported-wrapper/cleanup evidence, not successful peer-session binding, logind acquisition or input-enforcement evidence.** There is no numeric-PID fallback.

The outer capture bounded bytes/rows and validated exact public keys, types and fixed values before saving any artifact. It reaped the wrapper, verified its own new process group absent and verified no new owned temporary paths remained. No PID, UID, session identifier, pathname, raw error or private content is retained in the evidence. No guest, compositor/focus, input/device, service or policy operation was performed. AC01/AC02 remain pending, and there was no repeat invocation.

The coordinator subsequently approved an exclusive Debian257 reservation for exactly one ordinary SSH observation and one allocated-PTY observation using this exact binary. The reviewed procedure below was followed sequentially, with cleanup checked after each run. The results establish data acquisition/negative observation only; they cannot prove lock/inactive transitions, authenticated companion freshness, actual Arm refusal or physical/compositor recovery.


Reviewed guest observation procedure (subsequently executed once per transport):

1. Wait for S0-02's clean guest release and the coordinator's explicit reservation. Use only the existing ordinary SSH account/session; do not alter PAM, sshd, permissions, services, session state or input configuration.
2. Stage the reviewed binary alone in a freshly generated0700 directory, with executable mode0500. Verify SHA256 `7ea51672bfd419b375efb10f68d2e9ef70ac19e3f381fb1b3fe82db3eeb18e6c` immediately before and after each invocation. Record source `8a62ab2`, registration `da2b283`, actual kernel/native libsystemd version and exact `loginctl show-session self -p Type --value` result; retain only its fixed type value and the `isatty(0)` boolean, never a session ID or account/connection identifiers.
3. From an existing SSH command session explicitly without a PTY (`ssh -T`), run only `env -i ./linuxcast-input-spike-peer-probe --observe-private-peer` in that private stage. After separately checking cleanup, repeat once with an allocated PTY (`ssh -tt`) using the same exact binary/argv. The coordinator supplies the already approved guest transport; these are invocation forms, not new connection credentials or commands run here.
4. Independently bound each capture to7.75 seconds plus cleanup within eight seconds. Limit stdout to81940 bytes, each row to4096 bytes and stderr to384 bytes. Validate all keys/types/denial enums before saving public evidence; reject banners, unexpected text, unknown fields or partial output without publishing their raw contents. Preserve a real unsupported/nonzero outcome rather than converting it to success or repeating automatically.
5. Successful data-acquisition evidence requires exit0 and exactly20 rows: ten `BEFORE_CONTROLLED_TERMINATION` with fresh kernel-peer/session/UID/root-logind binding and actual remote/non-graphical/TTY negative context, then ten `AFTER_CONTROLLED_TERMINATION` with `PEER_DEAD`, all eligibility flags cleared, and a generation above every pre-termination generation that never changes or revives afterward. Every report must retain monitor-only, `canArm=false`, `companionAvailable=false` and `lockKnown=false`. Validate the existing exact19-field report schema, nondecreasing observation times and250 ms query bounds. The separate session type/PTY observations must agree with the actual transport; no fabricated XDG/session metadata is allowed.
6. Verify the wrapper and its own controlled client/query processes are absent, all observer temporary paths are removed and the staging directory/binary is removed after each run. Keep only cleanup booleans, fixed labels, safe versions/hashes and timing. The guardian's fixed midpoint uses only its own unreaped client; the observer cannot accept another target or grant input permission.
7. Independently review the source/binary/runtime mapping, strict artifact schemas and cleanup before recording the result. The two successful captures prove real remote/TTY context-data acquisition and kernel peer-death/no-revival observation only. They cannot close AC02 without actual supervisor enforcement, authenticated companion/transition evidence, or AC01 without physical/compositor recovery.


## Actual Debian peer observations and guest release

The exact reviewed wrapper source `8a62ab2`/registration `da2b283` and binary SHA256 `7ea51672bfd419b375efb10f68d2e9ef70ac19e3f381fb1b3fe82db3eeb18e6c` ran **once per approved transport**, sequentially, after the prior desktop task released the disposable guest. Actual runtime was Debian13.7 amd64, generic Linux6.12.113+deb13-amd64 and native libsystemd257.13-1~deb13u1. The guest received only the reviewed binary in private owned staging; local runtime source hashes remained unchanged, and the guest binary hash matched before and after each run.

| Actual transport | stdin is TTY | logind self type | Reports / exit | Elapsed | Maximum query |
|---|---:|---|---|---:|---:|
| [SSH without PTY](evidence/peer-wrapper-guest-ssh.json) | false | `tty` | 20 / 0 | 5028.231 ms | 51 ms |
| [SSH allocated PTY](evidence/peer-wrapper-guest-pty.json) | true | `tty` | 20 / 0 | 5027.806 ms | 42 ms |

For each run, the first ten reports are fresh, kernel-peer/session-bound, UID-matched and root-logind-owned. They record `active=true`, `local=false`, `graphical=false`, `userSession=true` and `seatZero=false`, with exact denials `REMOTE`, `NOT_GRAPHICAL`, `NOT_SEAT_ZERO`, `COMPANION_UNAVAILABLE` and `UNKNOWN_LOCK`. Thus there is **no inactive or authenticated-unlocked proof**: the false logind locked hint is known, while companion availability/known lock remain false.

After the guardian terminates and reaps only its own controlled connector, the next ten reports in each run contain `PEER_DEAD`, `SNAPSHOT_STALE`, `COMPANION_UNAVAILABLE` and `UNKNOWN_LOCK`. All eligibility flags are cleared. The context epoch advances from1 to2 and remains2 throughout the remaining observations, with no revival. All40 reports retain monitor-only and `canArm=false`. These are actual kernel peer-lifetime and logind negative-data observations, distinct from the private mocked lifecycle fixtures and from production input enforcement.

An independent outer capture bounded execution/cleanup, bytes and row counts, then validated the exact19-field report schema, phase ordering, bool/integer/denial types, timing order/budgets and generation behavior before saving safe artifacts. A separate local artifact check repeated those schema/semantic/hash checks. No PID, UID, session/object/owner identifier, private pathname, raw bus/error text or user content is retained. Both runs have empty stderr and no timeout. The original host249 unsupported artifact remains unchanged.

[Guest cleanup/release verification](evidence/peer-wrapper-guest-cleanup.json) ties both artifact hashes to the frozen runtime/binary and records cleanup after each run: wrapper reaped, its own process group absent, observer temporary paths absent, guest staging directory/binary removed, and the owned container staging file removed. At release, fixed compositor/Xvfb/Electron/Node/GDB counts were all0, DBus remained at its baseline2, private matrix roots were absent and the exact input-lab marker was absent. No input devices, input permissions, PAM/sshd settings, services, session activation, compositor or policy were changed. The exclusive guest reservation was returned clean before another task resumed; no further guest calls were made.

**AC01/AC02 remain pending.** This wrapper is not integrated with the input supervisor/worker and cannot Arm. Real supervisor refusal, desktop lock/inactive transitions, supported companion freshness and physical held-key/compositor recovery remain outstanding. The successful read-only SSH/PTY evidence does not establish a native desktop session or close the privileged-input security gate.

## Device-free live-denial decisions: source increment

The reviewed [proposal](live-denial-proposal.md) is implemented as source for
independent review, with **no new live context or input execution**. The existing
root-only `supervisor --synthetic-lab` now calls `decision::DecisionState` for
request/lease/context decisions. It explicitly selects the legacy synthetic
policy; its manufactured-device and no-graphical-session guards are unchanged.
This does not declare that existing input entry point live-enforced. Its same14
actual manufactured-kernel scenarios and mapped security route must be rerun
after independent review and a separate guest reservation.

The fixed `linuxcast-input-spike-denial-probe --observe-private-denial` engineering
driver selects only the live-denial policy. Its otherwise eligible trusted
fixture cannot override a live veto. The **same decision functions** called by
the supervisor decide Arm/Renew/running checks; there is no armed-live
constructor, positive helper grant, or caller-selected policy/principal/path.
The device-free driver never launches a worker, opens input descriptors or
sends worker IPC. A pending observation, negative context, missing authenticated
companion, stale data, helper timeout/death, channel failure or epoch change can
only deny. Arm/Renew veto terminally disarms that connection; later reports or a
new same-UID connection cannot revive it.

`denial_observer.rs` launches a dedicated exact sibling helper with an empty
environment and private bounded seqpacket channel. The helper rejects any
environment entry before library work, verifies real/effective/saved identity,
empty capabilities, no-new-privileges, no-core, parent-death/race binding and
descriptor closure. Its bootstrap receives exactly one duplicate of the actual
server-accepted metadata socket, trusted expected UID equal to its real UID,
and a parent-issued connection generation. Client protocol bytes/rights cannot
provide those values. Socketpair creator credentials identify the expected
parent; they are **not** used to authenticate the helper as a child. The parent
owns the actual direct unreaped child and private endpoint. Metadata binding
still derives SO_PEERCRED/SO_PEERPIDFD from the accepted connection itself.

This launcher is intentionally restricted to its ordinary real UID. It does not
implement a root-to-client-UID drop adapter for a future input service; that
separately reviewed adapter would need trusted UID/GID/group/capability handling.
No helper is spawned in the running supervisor loop. All startup/query/cleanup
waits occur outside that loop; the observer's poll handles at most one bounded
nonblocking packet and a nonblocking child-liveness check. There is one pending
request, sampling no faster than250ms, a300ms parent request deadline, the
existing250ms query limit and1000ms freshness ceiling. Sequence, connection,
epoch, timestamp/duration, schema, byte and descriptor checks fail terminally.
The helper's6s lifetime and independent7s driver guard bound this experiment.

Public rows distinguish **`evidenceVeto`**, the latest validated helper evidence
or transport failure, from **`decisionVeto`**, the first terminal decision veto.
For example a decision latched on REMOTE remains denied when later evidence
reports PEER_DEAD. This is expected nonrevival, not a claim the peer stayed alive.
Only fixed phases/veto enums and denial/effect booleans are emitted (at most20
rows,512 bytes each); no principal, session, connection generation, path, raw
error or protocol content is exported. Unsupported/failed observation is an
explicit incomplete nonzero result. Parent-owned children have PDEATHSIG and
bounded cleanup; generated0700 directory/0600 socket paths are removed before
queries. As with the earlier wrapper, external uncatchable termination during
the short startup window can leave only an empty directory/socket; no payload
is stored there.

The no-device checks include synthetic positive Arm/Renew/lease preservation,
otherwise eligible fixture plus an actual kernel-peer/private mocked-bus remote
negative consumed by the shared decision, prearmed test-state revocation,
terminal no-revival, missing/stale/timing mismatch, malformed/oversized/trailing
packets, extra rights, wrong sequence/connection/epoch, unsupported capability,
peer death and helper fault. A deliberately stalled helper leaves simulated
worker-heartbeat ticks progressing with bounded parent polls. The private suite
also checks an injected non-CLOEXEC descriptor is closed, fixed invocation and
arbitrary/logging/bus environment rejection, parent SIGKILL cleanup, and an
actual independent7s deadline. These session/bus replies are **private mocks**,
not new live logind proof. The C fixture's fixed numeric observation export
uses the existing Rust conversion; the production native bridge is unchanged.

See [checks/platform metadata](evidence/denial-checks.json),
[native test log](evidence/denial-nondevice-tests.log),
[clippy](evidence/denial-clippy.log),
[source hashes](evidence/denial-source-sha256.txt) and
[binary hashes](evidence/denial-binary-sha256.txt).
AC01/AC02 remain pending. This source increment does not establish actual
supervisor refusal using live context, authenticated graphical lock/inactive
transitions, physical held-key/compositor recovery or a production input grant.
