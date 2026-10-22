# S0-04 mandatory extension sandbox feasibility

This is a fixed synthetic feasibility fixture for [S0-04](../../docs/implementation/tasks/S0-04.md), not an extension SDK, package installer, production supervisor or arbitrary-code host. It changes no product UI. The normative inputs are [extensions](../../docs/architecture/extensions.md), [security](../../docs/architecture/security.md), [testing/release](../../docs/implementation/testing-release.md) and the [design review gate](../../docs/design/DESIGN.md#review-gate); design tokens were read, but no visual/keyboard/accessibility acceptance is claimed.

## Boundary implemented

- A private disposable staging directory contains the fixed package fixture, its own writable data directory, Node **24.22.1**, and only the runtime's necessary copied ELF libraries. The runtime is copied from the F1-01 Node build asset `/tmp/linuxcast-node24/node` and checked before and after copying against SHA-256 `e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb`. It is never selected by package metadata or downloaded by this spike.
- bubblewrap uses mandatory user/mount/PID/IPC/UTS/network/cgroup namespaces (`--unshare-all`), `--die-with-parent`, `--new-session`, dropped capabilities, a private `/proc`, minimal `/dev`, read-only runtime/package mounts, private `/data` and `/tmp`, a read-only root and a clean allowlisted environment. No host home, repository, session/display/bus socket, browser profile, input device or credentials are mounted. The synthetic listeners and canary files are created outside the mounts.
- A small C program emits classic BPF using the installed Linux UAPI constants, not a handwritten syscall-number table. It checks the amd64 architecture/x32 ABI and denies direct sockets, namespace re-entry, mounting, ptrace/process-memory access, io_uring setup and other privileged kernel interfaces. `clone3` returns ENOSYS so libc can use the inspected `clone` flags; new namespace flags remain denied. The filter is defense in depth alongside namespaces, and has not received a production security audit. Node also disables native addons and SIGUSR1 inspector startup.
- `systemd-run --user --scope` requests 256 MiB memory, no swap, 64 tasks and one core of CPU quota. **A successful systemd command is insufficient.** The parent reads `memory.max`, `pids.max` and `cpu.max` from the actual scope. bubblewrap blocks on a separate parent-owned descriptor until these values are verified; Node cannot start the fixture while a required controller is absent. No reduced profile or plain-Node fallback exists.
- Parent-owned stdin/stdout carry 4-byte big-endian framed UTF-8 JSON. Frames are bounded at 1 MiB; invalid UTF-8/JSON/envelopes, stale sessions, caller-supplied identity and unknown methods fail closed. The parent binds its own session/principal and offers exactly one public allowed fixture operation and one denied operation. Raw diagnostics are never persisted; accumulated stderr is capped at 1 MiB. The prototype additionally bounds incoming frames per invocation. It implements no remote network, credentials, real files or system effects through this broker.
- Deadlines are at most 30 seconds. Cancellation signals the entire scope, escalates after a one-second grace period, kills any remaining launcher group, and checks kernel cgroup population. Detached descendant, memory/task/CPU pressure and malformed-output fixtures are implemented. They cannot execute on the current Pop!_OS host, but the complete22-check suite passes on the isolated Debian13 guest described below.

## Actual host result

User-authorized host test, 23 October 2026 (Australia/Sydney): **Pop!_OS 22.04 LTS amd64**, kernel **7.1.1-76070101-generic**, bubblewrap **0.6.1**, systemd **249**. The coordinator identified GNOME Shell 42.9; this spike does not claim desktop matrix evidence. The supported Debian 13/GNOME 48/KDE 6.3 release matrix remains separate.

The actual [host probe](evidence/host-probe.json) exits **3** with `CPU_CONTROLLER_UNAVAILABLE`, verified scope cleanup and no fixture startup. It does not report simulated broker or direct-access success. The installed vendor `user@.service` sets `Delegate=pids memory`; the current user's manager and parent slice expose only `memory pids` to their children. Consequently `CPUQuota=100%` is accepted by systemd without a `cpu.max` file appearing in the child scope. Silently accepting that result would leave CPU containment unenforced.

The host filesystem shows `cpu` at the root hierarchy, so this is a delegation-policy gap, not evidence that the kernel lacks the CPU controller. See [controller evidence](evidence/controllers.txt). No policy, service, user manager or session was changed.

## Actual Debian13 result

A disposable Debian13.7 amd64 guest now passes **22/22 security checks**, including the real allowed broker, denied direct file/sibling/database/network/display/bus/environment access, malformed/flooded output, cancellation of a detached descendant, wall deadline, actual memory OOM enforcement, task-limit pressure and CPU throttling. The independent probe reports20true boundary checks and verified cleanup. Kernel controls read back `memory.max=268435456`, `pids.max=64` and `cpu.max=100000 100000` before fixture execution.

See [Debian probe](evidence/debian-probe.json), [complete suite](evidence/security-debian.log), [exact tested source hashes](evidence/debian-source-sha256.txt) and [runner/provisioning record](vm/README.md). QEMU TCG runs in a bounded unprivileged container with no host devices/cgroups/session mounts; Debian's own default user manager supplies CPU delegation. This did not change the user's host policy. It does not establish desktop/session, physical-input or performance release gates.

## Checks and reproduction

Prerequisites: the accepted F1-01 toolchain/dependencies, the staged Node asset above, x86_64 Linux with development UAPI headers and `gcc`, bubblewrap, unified cgroup v2 and a functioning systemd user manager with `cpu memory pids` delegated. No additional JavaScript dependency is needed.

```sh
bun run typecheck
bun run lint
node spikes/sandbox/probe.ts
bun run test:security -- S0-04
```

The coordinator registered these exact owned files in the security mapping: `spikes/sandbox/protocol.test.ts`, `spikes/sandbox/supervisor.test.ts`, `spikes/sandbox/host.security.test.ts`. This lane does not edit that shared manifest.

Pure framing/principal and missing-backend fixtures pass **5 checks**. A targeted host fixture separately covers a deterministic namespace-startup failure and missing bubblewrap. The namespace fixture is an explicit supervisor stand-in; it does not claim to disable the host kernel's namespaces. It returns the real bubblewrap error shape before any package execution and verifies that no fallback emits fixture protocol. Filtered tests are not represented as a passing full security suite. On the Pop!_OS host the complete security suite remains nonzero because the mandatory profile is unavailable; the separate Debian run executes every check successfully.

Actual required named-command result: `bun run test:security -- S0-04` exits **1**, with **7 passed and 15 failed** out of 22 checks. All 15 real-profile cases report `CPU_CONTROLLER_UNAVAILABLE` and verified cleanup before fixture startup; none establishes successful adversarial containment. The full unsuppressed result is retained in [security-suite.log](evidence/security-suite.log).

After delegation is available, rerun the complete named security suite and retain actual results for all direct file/sibling/database/network/display/D-Bus/environment attempts, allowed and denied broker calls, malformed/framed output, actual cancellation/descendant cleanup and memory/tasks/CPU pressure. Do not mark S0-04-AC01 passed based on source inspection or pure fixtures. The Debian probe and complete suite provide the actual execution evidence; the host failure remains a separate supported unavailable state.

## Proposed administrative remedy — declined, not applied

The user explicitly chose to leave system policy unchanged. No override, manager reload or session restart was applied. This proposal is retained only as reviewed context; it is not authorization to apply it. An isolated Debian13 VM supplied the missing execution evidence without changing this host.

There is no user-scope-only workaround: a manager cannot delegate a CPU controller that it did not receive. The narrowly scoped proposed override is for the current UID **1000**, not every user's manager. An administrator should review existing overrides first; if a different machine already delegates more controllers, preserve them when adding `cpu`.

Create `/etc/systemd/system/user@1000.service.d/50-linuxcast-cpu-delegation.conf` with:

```ini
[Service]
Delegate=cpu memory pids
```

Concrete administrator commands for this host, only after approval:

```sh
sudo install -d -m 0755 /etc/systemd/system/user@1000.service.d
printf '[Service]\nDelegate=cpu memory pids\n' | sudo tee /etc/systemd/system/user@1000.service.d/50-linuxcast-cpu-delegation.conf
sudo systemctl daemon-reload
```

This makes CPU resource partitioning available to UID 1000's user manager and therefore other user scopes as well; it does not grant root, input or filesystem access. Reloading the system manager alone does **not** recreate the already-running user's cgroup. Apply it at a planned user-manager start, preferably the next planned reboot after saving work. A complete logout may suffice only if user lingering/other sessions do not keep that manager alive. **Do not restart/terminate `user@1000.service` from this active session**: doing so can terminate user services, GNOME/Codex and unsaved work. No restart or reboot is authorized or performed by this spike.

After the planned restart, verify `systemctl show user@1000.service -p DelegateControllers`, its actual `cgroup.controllers` and the scope's actual `cpu.max`; then run the probe and full suite. If the controller is still unavailable, keep extensions unavailable and inspect the parent slice policy. Rollback removes only this new override, reloads the system manager and takes effect at the next planned manager start; preserve unrelated administrator overrides.

Primary references: [bubblewrap v0.6.1](https://github.com/containers/bubblewrap/tree/v0.6.1), [systemd 249 scopes](https://www.freedesktop.org/software/systemd/man/249/systemd-run.html), [systemd 249 resource controls and Delegate](https://www.freedesktop.org/software/systemd/man/249/systemd.resource-control.html). The installed `bwrap --help`, Linux UAPI headers and vendor unit were also inspected. This proposed remedy has not been tested or represented as successful.

## Acceptance mapping and F0-01 inputs

| Criterion | Current evidence / gap |
| --- | --- |
| S0-04-AC01 | Debian13 probe passes all20boundary checks; complete22-check suite proves broker/direct denial and hostile resource handling. Pop!_OS host remains unavailable without CPU delegation. |
| S0-04-AC02 | Missing-backend fixtures plus real Debian guest namespace denial return unavailable with no fixture startup and verified cleanup. Guest namespace limit was restored; host CPU-controller absence separately demonstrates fail-closed profile handling. See evidence/debian-namespace-denial.json. |
| S0-04-UI | Conditional N/A proposed: no user-facing product view or behavior is introduced. CLI capability diagnostics are engineering evidence only. |
| S0-04-PRIVACY | Only public synthetic file/database/socket/environment strings, dependency/runtime hashes and operational controller/version metadata. No actual credentials, user files, browser profile, keyboard data, screenshots or raw stderr are included. |

F0-01 should require a typed unavailable reason for **each** missing containment component, retain a supervisor-owned pre-exec resource gate and cgroup-based cancellation (process groups alone miss `setsid` descendants), bind principal/session to parent-owned channels, and keep native runtime/package mounts explicit. Production E1-01 must replace spike tool paths/staging with immutable packaged resources, reviewed native-helper launch/lifecycle code and frozen contracts. Package validation, runtime/native-addon tampering, descriptor-relative file grants, broker network policy, revocation integration, automatic repeated-violation suspension and real user-facing unavailable/remediation UI remain their owning tasks. This spike neither weakens those requirements nor completes a release security gate.

Coordinator review found a removed-cgroup kernfs race: reading `cgroup.events` can fail with ENODEV while the collected inode is briefly visible. Cleanup now recognizes that dead cgroup alongside ENOENT; the actual host rerun returns safe unavailable with cleanup verified.
