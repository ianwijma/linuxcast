# S0-03 native input recovery feasibility

This is a **synthetic-device-only engineering spike**, not an installable input service. Read [S0-03](../../docs/implementation/tasks/S0-03.md), the complete [input lifecycle](../../docs/architecture/linux-integration.md), [security](../../docs/architecture/security.md), [overview](../../docs/architecture/overview.md), [stack](../../docs/architecture/stack.md), and [testing/release](../../docs/implementation/testing-release.md) before interpreting its results. The design review gate and tokens were read; no product UI is introduced.

## Boundary and current evidence

The source implements passthrough, fixed **Left Ctrl + Right Ctrl + Escape** disarm, one-second application lease, 100ms worker heartbeat, 500ms supervisor watchdog, parent-death handling and terminal disarm. It contains no Hyper mapping, snippet matching, templates, deletion/insertion, arbitrary shortcut injection, provider or workflow integration. No physical keyboard path can be selected through the public protocol.

**The first actual guest kernel attempt failed before any successful scenario report; no kernel criterion passed.** Its revised diagnostics and native identity setup require review before another device run. No host service, permissions, group membership, systemd policy, physical input device or user desktop may be changed or used. Missing prerequisites fail the harness rather than skipping tests. Fixture and non-device syscall tests do not establish AC01 or live logind/desktop transitions.

Independent review found three concrete gaps in the first source: dormant completed input could replay on Arm; watchdog expiry added an inappropriate100ms grace; and wrong-UID evidence could be satisfied by DAC/busy rejection alone. The source now adds the bounded pre-arm barrier and manufactured queue regression, immediate watchdog kill with calibrated timing, and a root peer denial before any authorized connection. Compile/non-device results are retained; the strengthened kernel scenarios remain unproven after that early failed attempt.

The coordinator owns Cargo manifests/lockfile, dependency inventory, task registry and named-suite mapping. Rust1.95/edition2024, libc0.2.191, serde1.0.229 and serde_json1.0.154 are pinned there. The Debian build image supplies libevdev1.13.4, development headers, pkg-config and the C compiler. The tiny C bridge uses Linux header constants rather than handwritten syscall or ioctl numbers; Rust owns protocol and safety state machines.

## Descriptor and process lifetime

The root lab manufacturer creates a fresh libevdev uinput source with a fixed synthetic name and unique physical identity. It opens a source evdev client and a separate output `/dev/uinput` descriptor, hands both to the root supervisor over a private `SOCK_SEQPACKET` socket using `SCM_RIGHTS`, then immediately drops those copies. A separately opened observer evdev client can verify a competing grab; it is a different kernel client, never a duplicate of the worker's client.

Source inspection of the exact [Debian libevdev1.13.4 archive](https://deb.debian.org/debian/pool/main/libe/libevdev/libevdev_1.13.4+dfsg.orig.tar.xz), `libevdev/libevdev-uinput.c`, found that creation does not copy the library object's `phys` into the kernel device. The first source only set the library metadata, so the later strict evdev identity check could not succeed. The manufacturer and passthrough setup now explicitly apply the Linux-header `UI_SET_PHYS` ioctl to their already-open uinput descriptors **before** device creation, and fail closed if it fails. The source identity comparison remains unchanged. This is a source-confirmed correction pending a reviewed real kernel rerun, not a claimed successful recovery result.

The supervisor authenticates the private root peer and validates the manufactured source identity. It creates a fixed worker subprocess under the dedicated nonlogin `linuxcast-input-spike` UID/GID with no supplementary groups, then sends the two descriptors through its own private socket. **It immediately drops all device descriptors after that send.** No recovery duplicate exists. The worker owns the last references to its evdev client; library destruction alone is insufficient, so Rust `OwnedFd` values close the descriptors after native teardown.

The worker checks empty effective/permitted/inheritable/ambient capabilities, disables core dumps and dumpability, installs `PR_SET_PDEATHSIG=SIGKILL` after credential changes, and checks the parent-death race. Before initialization it receives only the two selected descriptors and one internal socket. Its stdin/stdout point to `/dev/null`; stderr now inherits only the trusted engineering failure channel described below. Other descriptors close on exec. After libevdev/uinput setup and sysfs discovery, an amd64 seccomp allowlist denies new files, sockets, execution, process/thread creation, ptrace, io_uring and mount operations. Only specified input-state/grab/device-destruction ioctl requests remain usable. The capability bounding set is not a permission the worker can exercise; it has no permitted/ambient capability and cannot execute another image. Production unit bounding-set validation remains a separate gate.

The supervisor narrows its effective/permitted capabilities to CHOWN, SETUID, SETGID and KILL. It does not install a system service or claim validation of the production unit, device cgroup policy, systemd watchdog or polkit lifecycle. A production logind/desktop adapter is also not implemented here: trusted context updates come from a root-owned **synthetic fixture** channel. The unprivileged control client cannot assert lock state, UID, session properties, consent or context generation.

Virtual-device readiness and all physical keys released are required before grabbing, with kernel key-state checks before and after the grab. Dormant events are discarded without forwarding; after grabbing, a mandatory bounded drain must reach `EAGAIN` in both libevdev and kernel queues, then key state is checked again before accepting Arm. A completed old press/release cannot be detected by a held-key snapshot alone. More than256 queued events, synchronization loss or another ambiguous drain error refuses Arm and terminates the worker. Forwarding has no unbounded queue: at most64 events are handled per loop before lease/control checks. `SYN_DROPPED`, unexpected event types, failed forwarding, expiry, disconnect, invalid protocol, context revocation or emergency chord terminate this worker. No resynchronized state is interpreted as text. Orderly teardown emits releases for its own logical keys, ungrabs and destroys the virtual device. SIGKILL relies on last-descriptor closure and uinput removal; the actual kernel experiment must verify that behavior. There is no automatic worker respawn/regrab path.

## Control and privacy

The fixed public socket lives below a root-owned non-writable `/run/linuxcast-input-spike/` hierarchy. The per-case socket is owned by the authorized client UID with0600 permissions. The supervisor validates `SO_PEERCRED`; the client verifies service UID0. The protocol has only version1 handshake, status, arm, renew and disarm. Strict JSON schemas reject unknown fields and operations. Length-prefixed frames have a stricter1024-byte control bound inside the global1MiB ceiling, no pipelining, bounded connection/frame deadlines and a32-request/second rate bound. Replies contain only version, generation, state and allowlisted reason.

Raw events and held-key state stay inside the worker and the isolated synthetic observer. No key event, unmatched text, device-event payload, credential, clipboard or application title is logged, sent over control IPC, saved to disk or placed in core dumps. The final harness report contains public scenario names, booleans and recovery elapsed times only. Native libevdev logging is disabled. Same-UID unsandboxed malware is not claimed isolated by the socket; the mandatory extension sandbox must separately prove that the path is inaccessible.

The first actual guest kernel attempt failed before any scenario report, so diagnostics now identify a static startup stage. Trusted supervisor/worker stderr is inherited through the lab instead of discarded: each failing process emits at most one JSON line capped at384bytes, containing only component/stage/failure codes (`A-Z` and underscore, maximum64characters), a fixed IO-kind enum and optional numeric errno1..4095. Error Display/Debug, error sources, path strings, JSON field/value text and device events are never formatted. Unknown errors map to a fixed unclassified code; JSON parser failures map to a fixed schema code. A replacement panic hook ignores the panic payload/location/backtrace. libevdev logging remains disabled before every library initialization. A seeded non-device regression verifies that arbitrary error text/private path canaries cannot appear. This engineering stderr change does not remove capability, seccomp, parent-death, core or watchdog checks.

## Reviewable guest harness

`linuxcast-input-spike-synthetic-lab` requires all of these before opening uinput:

- Explicit `--reviewed-disposable-guest` invocation as root.
- Debian13 `/etc/os-release` and no graphical session records under `/run/systemd/sessions`.
- A root-owned regular0600 `/run/linuxcast-input-spike-lab` marker containing exactly `S0-03 disposable Debian synthetic devices only\n`.
- A dedicated nonlogin `linuxcast-input-spike` account, distinct from root and client UID1000.

These checks prevent accidental normal invocation; they are not a security boundary against a malicious root administrator. **Never create that marker on the user's host.** The only planned runner is the existing isolated official Debian13.7 software VM with no host input/uinput devices mounted. Do not run while another agent starts a graphical guest session. The coordinator must reserve the guest for this test, review this harness, and create the marker/test account there explicitly. All executables must be root-owned and non-writable by other users before use.

The manufacturer supports only fixed modifier/Escape/F24 key capabilities and never enumerates physical devices. Device nodes come from libevdev's newly created object, are validated character devices opened `O_NOFOLLOW`, and the supervisor independently validates the exact synthetic name/physical identity. The harness's UID1000 client closes every inherited device/control descriptor before connecting. Worker signals use pidfds, avoiding PID-reuse kills.

Planned actual scenarios are worker/supervisor SIGKILL with synthetic modifiers down; SIGSTOP/500ms worker watchdog; one-second app lease with otherwise fresh context; fixed emergency chord; competing-client regrab, virtual-device removal and no rearm after550ms; wrong-UID control denial; context revocation; and locked/unknown/inactive/TTY/remote/stale context **fixtures** coupled to actual no-grab checks. A separate queue regression stops the dormant worker, queues a completed syntheticF24 down/up before Arm, resumes it and requires no virtual key events; the same observer must then see fresh post-armF24 input as a positive control. Kernel virtual-device removal is not evidence about modifier cleanup in a real compositor or physical laptop/USB/Bluetooth keyboard. Those release gates remain outstanding.

The wrong-peer experiment runs before any authorized connection: a root test peer can pass the unchanged0600 socket DAC, yet must receive the supervisor's explicit `PEER_UID_OR_BUSY` denial. With no other client present this isolates `SO_PEERCRED` UID enforcement. A separate dedicated-worker-UID client is also denied by0600 DAC; the subsequent authorizedUID1000 connection must work. Production permissions are not weakened for this test.

Recovery measurements start before the trigger and end when both a separate client can grab and the old virtual device returns `ENODEV`. The watchdog case waits a fresh operational heartbeat immediately before SIGSTOP, avoiding up to100ms uncertainty in heartbeat age. The mandatory watchdog value remains500ms, with **no additional cooperative grace**. The supervisor records the last heartbeat, expiry detection and actual successful SIGKILL issuance, emitting this typed operational record immediately after kill and **before** wait/reap. The test requires detection after at least500ms of silence, kill>=detection, and silence-to-kill<=500+75ms (the explicit scheduling/observation tolerance). Eventual kernel grab/virtual-device removal has a separate250ms bound measured from kill issuance. A late kill cannot pass merely because cleanup completed inside a larger combined window.

The app lease remains1000ms. Its disarm-request timestamp is captured after a successful control send; the test requires request>=lease expiry and <=expiry+75ms, then eventual kernel removal within250ms of that request. SIGKILL paths retain their250+75ms observation window; emergency/context paths retain100+75ms. Only cooperative teardown reasons may use a100ms grace before kill. These are separate action and kernel-cleanup measurements, not changed production leases/watchdogs.

This corrects the earlier measurement model: the actual combined run failed the old mixed watchdog-cleanup bound at620ms, and a quiet standalone run observed628ms watchdog cleanup,1102ms lease cleanup and roughly127-133ms SIGKILL/emergency cleanup. A kernel teardown tail is an inference from those timings, not yet a proved cause. New operational timestamps must establish the action and cleanup phases separately. `recovered()` checks its bound before and after kernel ioctls and returns failure for a late observation; a regression covers completed-but-late recovery. Completed/failed case observations are emitted even when a later case fails, and the required TypeScript test saves only allowlisted labels, booleans and numeric timestamps to `evidence/kernel-debian.json` **before** assertions, including partial reports from nonzero native exits. No raw stdout/stderr/error text or arbitrary JSON field is copied into that artifact.

Before execution, the coordinator should inspect descriptor drops, fork-child inherited-FD closure, dedicated UID/capability transition, parent-death race, post-init seccomp, marker/session guard, pidfd signaling and all teardown paths. No approved host device path, host credential or device mount is needed.

## Checks

The no-device checks use the pinned Debian build image, unprivileged build UID1000 and only project/cache mounts:

```sh
cargo test --locked -p linuxcast-input-spike
cargo clippy --locked -p linuxcast-input-spike --all-targets -- -D warnings
cargo fmt -p linuxcast-input-spike --check
```

The current no-device run passes **eleven checks** (eight native unit/protocol/descriptor/privacy tests and three actual subprocess checks), with no ignored tests: [nondevice-tests.log](evidence/nondevice-tests.log). Strict all-target clippy passes: [clippy.log](evidence/clippy.log). TypeScript typecheck/lint and planning validation also pass. These results do not authorize or complete device testing.

`tests/nondevice.rs` launches the actual worker's fixed policy-probe mode to validate empty capabilities/core policy and real seccomp denial of file, socket, exec, clone and unknown ioctl requests; it opens no input devices. Pure safety fixtures cover session/lock/seat/remote/consent/freshness denial, exact lease expiry/generation/no-rearm and the fixed chord. Actual Unix sockets exercise SCM_RIGHTS, sender-copy closure, CLOEXEC and peer credentials. These are distinct from the pending synthetic kernel harness.

The proposed exact named-suite path is `spikes/input/kernel.security.test.ts`. Its fixed root-owned `/opt/linuxcast-input-spike/linuxcast-input-spike-synthetic-lab` executable and explicit reviewed-guest invocation require real manufactured-device recovery; missing prerequisites fail rather than skip. The coordinator-owned required `bun run test:security -- S0-03` mapping and extension-sandbox denial route must be installed before acceptance. A run with no guest/kernel prerequisites must fail that gate; no skipped or unavailable success is acceptable.

## Acceptance map

| Criterion | Evidence / remaining gap |
|---|---|
| S0-03-AC01 | Implementation and deterministic/no-device checks only. **Actual synthetic kernel SIGKILL/grab/virtual-device recovery is pending review/execution.** Physical and compositor recovery remain separate release gates. |
| S0-03-AC02 | Strict peer-credential protocol and trusted-context denial fixtures. **Actual synthetic no-arm/context transitions and plugin sandbox socket denial are pending.** No live logind lock/session implementation is claimed. |
| S0-03-UI | Conditional N/A proposed: no product UI/service enablement introduced. Engineering diagnostics do not establish onboarding/accessibility acceptance. |
| S0-03-PRIVACY | Public synthetic capability identities, booleans, operational failure codes and elapsed times only; no raw event/content logging or core dumps. Independent review pending. |

## Primary API evidence

- [Kernel uinput](https://docs.kernel.org/input/uinput.html): userspace device creation; libevdev recommended for new software.
- [libevdev initialization/grab](https://www.freedesktop.org/software/libevdev/doc/latest/group__init.html): grabbing and descriptor lifetime; freeing libevdev does not close its fd.
- [libevdev uinput lifecycle](https://www.freedesktop.org/software/libevdev/doc/latest/group__uinput.html): externally supplied uinput descriptors and virtual-device destruction.
- [libevdev synchronization](https://www.freedesktop.org/software/libevdev/doc/latest/group__events.html): `SYN_DROPPED` and synchronization status; this restricted spike disarms.
- [Linux Unix-domain sockets](https://man7.org/linux/man-pages/man7/unix.7.html): SCM_RIGHTS, peer credentials and pathname socket permissions.
- [Parent-death signal](https://man7.org/linux/man-pages/man2/PR_SET_PDEATHSIG.2const.html): credential-change clearing and the parent-death race.

Complete production installation/polkit, logind races, selected physical-device fingerprints/udev, service hardening/watchdog, suspend/update/uninstall, USB/Bluetooth, LEDs/media keys, multiple devices, keymap/IME/protected fields and any actual Hyper/snippet behavior are owning-task/release work. This spike does not close the complete privileged input security gate.
