# F2-02 session observer: synthetic preparation evidence

Recorded 2026-10-31. This lane owns only new `packages/secrets/native/` files and
this optional evidence directory. No shared contracts, manifests, lockfiles,
platform lib/main, Node gate, runners, registry or task statuses were changed.

Prepared checkout: `/home/ian/.t3/worktrees/linuxcast/t3-3dc194dc`.
Branch: `codex/f2-02-session-observer`.
Parent: `757ce20c650c0f4df6d847f10212c6edeaa016ab`.
Coordinator HEAD: `f461a870a0abd1b9d5cb565edac92ba34c758ef7`.
Frozen coordinator tree: `6ed5dc0060680b805b6982e52c1368266dfcf7dd`.
The final lane tree/commit is reported with handoff; no acceptance is implied.

## Commands and tool provenance

```sh
packages/secrets/native/tests/run.sh
python3 scripts/validate_plan.py
git diff --check
```

Standalone Rust compilation uses edition 2024, `-D warnings`, Rust 1.95.0
(`59807616e`, 2026-04-14) and system GIO/GObject/GLib 2.72.4 on the Ubuntu-based
amd64 development host. No dependency installation or manifest change occurs.
Offline standalone Clippy denies warnings for all targets through a temporary
manifest; the explicit GIO call's argument count and frozen unit-error public API
have narrow documented lint allowances. Neither allowance changes runtime policy.
Docker server 29.9.2 runs the pinned **existing local image**:
`sha256:7a9b0ce66e89479ffa08120e240c52f7dd150f4355b0b5073c24f5e66494d785`.
Image OS: Ubuntu 22.04.5 LTS; Python 3.10.12; dbus-daemon 1.12.20; GIO 2.72.4.
It is used solely as an isolated fixture runtime, with no original workload or
lab resumed. The script never pulls an image or starts a host bus. If this image
is absent, fixture integration is unavailable and must be reported as such.

Exact container isolation and compile commands are in
[`native/tests/run.sh`](../../native/tests/run.sh). The service/controller/helper
use explicit private bus addresses. Only fixture code and the compiled helper
are mounted read-only. No host system/session bus or desktop was inspected.

## Evidence mapping

| Boundary | Observed synthetic result | Acceptance limit |
| --- | --- | --- |
| Typed properties/policy | Six pure tests: eligible x11/wayland, lock/inactive denial, foreign UID, remote/TTY/greeter, missing/invalid/duplicate values, no IdleHint substitute, terminal ordering, local address policy | Pure tests alone prove no native behavior |
| Root peer / process | Actual helper with root-owned private mock: eligible observations, heartbeat ceiling; separate UID 65534 mock denied | Root attestation stays enabled; no real logind/desktop proof |
| Changes / identity | Lock/inactive changes, invalidated lock property, stale signal values, exact peer signal filtering, session drift, removed session, sleep notification | Synthetic properties/signals only; no desktop action |
| Race / generation | Owner release/reacquire, in-flight owner change and in-flight stale unlocked reply terminate/revalidate without reopening | Asynchronous desktop hint limits remain |
| Failures | Missing/wrong property/reply, denial with seeded raw error, total deadline, invalidated missing property, malformed signal, bus loss | Unknown states deny; no recovery of a failed generation |
| Lifecycle / privacy | EOF/SIGTERM both idle and during pending call; unexpected stdin data; original parent death/reparent with exact-child reaping; fixed strict bounded output and empty helper stderr | Main still owns production child shutdown/reaping and gate expiry |

The actual helper fixture suite has 35 checks, plus one non-root peer rejection.
Every fixture output is checked for strict fields/types, increasing safe sequence,
512-byte line cap, exactly one terminal unavailable with no subsequent frame,
empty helper stderr and absence of the synthetic private-content sentinel.
This does not mean the repository's security runner maps these new checks yet.

F2-02-AC01: partial prerequisite only; no credential storage/use path is integrated
or accepted. F2-02-AC02: no change or new claim. F2-02-UI: no UI work; missing
credential setup/status remains. F2-02-PRIVACY: synthetic component output privacy
evidence only, with no change to overall task status. Full F2-02/native/provider/
credential acceptance is **not claimed**. The agreed complete local 1.0 scope is
preserved. Debian 13 GNOME 48 / Plasma 6.3 Wayland/X11, real session switching,
suspend/resume, keyring, SecretStore abort/clearing, provider dispatch, packaging
and user-facing credential setup/status remain future acceptance work.

The coordinator's four synthetic gate checks and reported 62 mapped checks are
frozen input context, not checks rerun or expanded by this lane. Coordinator glue
and consumer requirements are proposed in [`native/README.md`](../../native/README.md).


## Coordinator review follow-up

Independent review of d89d05eea1937616a6f3fa72b0079266a61fe1cd found no
production observer defect. Its nonblocking P3 fixture finding was valid: original
parent exit also closed helper stdin and only the last output frame was checked.
In the coordinator copy, a separate controller retains the helper stdin writer
until after helper exit, confirms an eligible observation before parent death,
requires bounded exact-child reaping, and applies the same strict frame and
terminal validator as every other case. This isolates parent-lifetime detection
from EOF. The original worker commit and sources.sha256 remain historical;
coordinator-review.json pins this corrected fixture separately.

Coordinator reran native/tests/run.sh: six pure tests,35private-bus checks and
non-root-peer rejection pass, including the strengthened parent-death case;
offline Clippy, warnings-denied compilation and rustfmt pass. This is synthetic
component preparation, with no host bus, desktop, lock, keyring or provider action.
