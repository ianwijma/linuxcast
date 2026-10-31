# Credential-session observer preparation

`session.rs` is an unprivileged, read-only Linux amd64 GIO/logind observer with
`pub fn run_stdio() -> Result<(), ()>`. It requires a **dedicated helper process**:
it temporarily owns SIGTERM/SIGINT handlers and stdin/stdout flags. It has no
dependencies beyond Rust std and system GIO/GObject/GLib. It is intentionally
not registered in the production platform library/CLI by this lane.

This is a prerequisite for F2-02 credential setup/status and the live SecretStore
lock lifecycle. It does not implement those consumers or establish full F2-02,
native, credential, provider or release acceptance. The complete agreed local
1.0 scope, Debian 13 amd64 / GNOME 48 / Plasma 6.3 / Wayland and X11 matrix remain.
F2-01 is accepted; no other task status is changed here. There is no Electron
Linux lock-event assumption, privileged input-service integration or credential
route in this module.

## Frozen inputs

- Prepared implementation checkout parent: `757ce20c650c0f4df6d847f10212c6edeaa016ab`.
- Read-only coordinator checkout: `/home/ian/.t3/worktrees/linuxcast/f2-02-credential-storage`,
  branch `codex/f2-02-credential-storage`, HEAD `f461a870a0abd1b9d5cb565edac92ba34c758ef7`.
- Coordinator frozen **tree**, not commit: `6ed5dc0060680b805b6982e52c1368266dfcf7dd`.
  `packages/secrets/SESSION-CONTRACT.md` and `packages/secrets/src/session.ts`
  were read against that tree. No coordinator file was edited.
- Normative repository guidance read: `AGENTS.md`, `docs/PLAN.md`, F2-02 card
  and F2-01/F2-02 dependency/status registry, architecture data/security/Linux
  integration, testing-release, DESIGN and tokens. This lane changes no UI.

## Identity and lifetime

The helper accepts no request payload or identity. It captures its original live
parent with `getppid()`, checks the real/effective helper UID and all four parent
UIDs in `/proc`, records parent start time and retains a `pidfd_open` descriptor.
PID 0/1 parents are rejected. A recycled PID cannot replace an exited parent.
Both sides of every snapshot recheck parent identity and lifetime; a separate
thread polls the retained pidfd and stdin and cancels GIO work on loss, EOF,
unexpected stdin data, SIGTERM/SIGINT or operation deadline. No process is spawned
by production code, and no descendant enumeration or sweep occurs.

Only a single local `unix:path=/...` or `unix:abstract=...` system-bus address is
allowed. TCP, nonce-TCP, autolaunch and fallback address lists are rejected before
connection. Normal production uses GIO's system-bus address; synthetic tests set
an explicit private `DBUS_SYSTEM_BUS_ADDRESS`. The future main launcher must use
a minimal trusted environment and the fixed packaged helper path.

The observer subscribes to the bus daemon's exact `NameOwnerChanged` signal for
`org.freedesktop.login1` **before** resolving its owner. It requires that unique
owner's `GetConnectionUnixUser` result to be UID 0. Calls and session/manager
signals then bind to that unique peer. `GetSessionByPID(original_parent)` derives
the exact session path. Before reading properties it subscribes to that path's
`PropertiesChanged`, and the peer's manager `SessionRemoved` / `PrepareForSleep`.
Owner loss/change is terminal, even if the same peer immediately reacquires the
name. There is no silent rebound.

Every snapshot rechecks the owner, its UID, the parent-derived path, typed
properties, then the path/owner/UID/parent again. Properties require `User (uo)`
matching the parent UID, `Class s == user`, `Type s == x11|wayland`, `Remote b ==
false`, `Active b` and `LockedHint b`. Locked and inactive observations are valid
**denials**. Foreign UID, remote, TTY, greeter/other class, missing/duplicate/invalid
properties or unknown state terminate unavailable. `IdleHint` is never used.
No new fields such as `CanLock` are required from the Debian baseline.

Signals invalidate a snapshot; their booleans are never applied to cached state.
Invalidated properties are re-read. Signals received during a snapshot force a
complete re-read within the same budget. Malformed relevant signals, a removed
derived session, sleep/resume notification, path drift and bus closure fail closed.
Unknown/malformed output cannot authorize credentials through the frozen gate.

## Read-only API and resource boundaries

Explicit D-Bus methods are only `GetNameOwner`, `GetConnectionUnixUser`,
`GetSessionByPID` and `Properties.GetAll`. GIO additionally performs normal bus
authentication/Hello and AddMatch/RemoveMatch for subscriptions. Method calls use
`NO_AUTO_START`; no service activation is requested. There are no lock/unlock,
activation, kill, hint-setting, control/device, portal, display, input, audio,
credential, provider or network operations.

Connection setup and each complete snapshot have a **700ms total budget**,
including retries. Every `call_sync` specifies the exact reply type and remaining
deadline. A separate 10ms lifecycle poll cancels even address/authentication setup
or a blocked call. The next periodic refresh starts 150ms after publication;
the 700ms budget, at most 100ms nonblocking output and polling margin fit inside
the 1000ms healthy heartbeat ceiling. Relevant events trigger an earlier refresh.
No cached unlocked frame is used as a heartbeat. Scheduler starvation can still
stop delivery: main's independent **2500ms receipt-age expiry** is mandatory.

Each owned GVariant/GObject/GError/string is released by its matching GLib API.
Borrowed strings are copied while their variants live. Connection/subscriptions
and callbacks use a private thread-default main context on one thread; subscription
data is heap-owned and freed by GIO's destroy notifier. Same-thread unsubscribe
precedes context teardown. The separate lifecycle thread only polls/cancels and
is joined on return. Output is nonblocking with a 100ms bound; stdout flags and
signal handlers are restored. The helper owns no subprocesses to reap; main must
reap its exact helper child. EOF/SIGTERM produce terminal unavailable and exit 1
through the proposed CLI, including during pending calls. They are not retries.

## Frozen wire

NDJSON, schemaVersion 1, positive strictly increasing safe integer `sequence`, at
most 512 encoded bytes including newline. Observed frames have exactly:

```json
{"schemaVersion":1,"sequence":1,"state":"observed","active":true,"lockedHint":false,"localGraphical":true,"ownerMatches":true}
```

Failure emits one terminal frame and returns `Err(())`, for example:

```json
{"schemaVersion":1,"sequence":2,"state":"unavailable","reason":"peer-changed"}
```

Fixed reasons are `unavailable`, `denied`, `invalid-session`, `invalid-response`,
`peer-changed`, `transport-lost`. Deadlines/normal lifecycle termination use
`unavailable`; bus shutdown can deliver `peer-changed` before transport closure.
A broken/backpressured output may prevent delivery of the final frame; closure,
parse failure and expiry must independently quarantine main's gate generation.
No output or diagnostics contain PIDs, session IDs, usernames, bus names, object
paths, raw errors or credentials. Serialization uses fixed enums/booleans only.

`LockedHint` and D-Bus delivery are asynchronous desktop reports, **not atomic
physical lock proof**. Two-sided validation reduces races without eliminating
changes immediately after observation. No screen, power or desktop action was
performed for this preparation.

## Coordinator-owned production glue proposal

In `native/platform/src/lib.rs`, add:

```rust
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
#[path = "../../../packages/secrets/native/session.rs"]
pub mod credential_session;
```

In `native/platform/src/main.rs`, before the existing index fallback, add the
fixed exact-argv arm (no extra identity/options and no raw diagnostics):

```rust
if arguments == ["credential-session"] {
    let code = if linuxcast_platform::credential_session::run_stdio().is_ok() {
        0
    } else {
        1
    };
    std::process::exit(code);
}
```

The coordinator owns any cfg around this Linux-only binary arm, build routing,
manifest changes, runner/security mapping and production consumer wiring.
Future main must launch/reap the exact owned child, bound chunks/lines **before**
JSON parsing, validate the frozen strict schema, and quarantine on malformed,
replayed, out-of-order, extra-field, expired or closed streams. Every credential
admission and sensitive predispatch must fresh-check the main gate. Lock,
inactivity, loss and expiry must abort live SecretStore consumers and apply the
configured credential-clearing policy. Only a trusted lifecycle owner may create
a new gate/helper generation. UI setup/status, provider authorization, live
SecretStore and keyring recovery remain coordinator work; no hidden fallback is
introduced here.

## Validation and acceptance limits

Run `packages/secrets/native/tests/run.sh` offline with the pinned local image
present. It runs standalone `cargo clippy --offline --all-targets -- -D warnings`
through a disposable manifest (without changing the workspace), compiles with
`rustc -D warnings`, checks Rust formatting, executes
six pure GVariant/policy tests without bus access, then tests the actual helper
on private synthetic buses in disposable containers. Each container drops all
capabilities, has no network, uses a read-only rootfs, private `/tmp`, bounded
memory/tasks and only read-only fixture/helper mounts. No host home, system/session
bus, desktop socket, device or Debian AT lab state is mounted. Subprocesses use an
explicit clear environment with a private system-bus address and deliberately
unusable session-bus address. The fixture may change **its synthetic service**,
never a real desktop or production policy.

The positive fixture is root **inside** the container with empty capabilities;
production root-peer attestation remains enabled. A second UID 65534 container
proves an otherwise eligible user-owned peer is denied. All test identities,
properties and privacy sentinels are generated synthetic content. Fixture-only
owner release, fake signals and subreaper behavior are not production APIs.

See [validation evidence](../evidence/session-preparation/README.md) and
[test output](../evidence/session-preparation/standalone-tests.txt). These are
component preparation, not the coordinator's 62 mapped checks or native matrix
acceptance. A fresh native-main integration build/test and all real desktop,+suspend/resume, session-switch, keyring, packaged credential/provider and UI flows
remain required. The test image is Ubuntu 22.04, **not Debian 13**. There is no
Wayland, X11, GNOME, Plasma, real lock or credential acceptance from these mocks.

## Primary references

Accessed 2026-10-31; latest pages are API evidence, not proof of target behavior.
Only long-established methods/properties are used; these links do not establish
that newer optional fields exist on Debian 13.

- [systemd logind D-Bus API](https://www.freedesktop.org/software/systemd/man/latest/org.freedesktop.login1.html)
  (page identified systemd 262): `GetSessionByPID`, typed session properties and
  desktop-maintained `LockedHint`, separate from inactivity.
- [GIO call_sync](https://docs.gtk.org/gio/method.DBusConnection.call_sync.html)
  (page library 2.91.0; API since 2.26): explicit types/deadlines and owned return.
- [GIO signal_subscribe](https://docs.gtk.org/gio/method.DBusConnection.signal_subscribe.html)
  (same page library/API versions): unique-name binding, thread-default context,
  same-thread unsubscribe and destroy-notifier lifetime requirements.
- Local `native/platform/src/applications.rs` supplied existing GIO ownership
  conventions only; none of its application discovery or launch behavior is used.
