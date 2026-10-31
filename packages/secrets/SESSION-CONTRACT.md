# F2-02 credential session observation contract

This is coordinator-owned preparation for actual SecretStore integration and
credential setup/status UI. It is not an enabled credential route, provider
request, physical lock test or F2-02 acceptance. The full local1.0 scope remains.
F2-01 is accepted. F1/F3/D1 native gates and credential/provider integration remain.

The installed Electron45 declarations mark `powerMonitor` lock/unlock events as
darwin/win32 only. Do not register them on Linux and claim Linux lock protection.
The required Linux adapter is an unprivileged, read-only fixed GIO/logind observer.
It supplies main-owned SecretStore admission, never the privileged input service.

## Frozen wire and main policy

`src/session.ts` defines strict schemaVersion1 NDJSON frames. Every frame has a
positive monotonic safe-integer sequence. The maximum encoded line is512bytes;
the parent bounds chunks/lines before JSON parsing. A healthy observed frame has
only active, lockedHint, localGraphical and ownerMatches booleans. Unavailable
frames have only a fixed reason enum. No PID, session ID, username, bus owner,
object path, credential or raw error crosses this interface. It is not renderer IPC.

The adapter must resolve the session of its live original parent PID itself;
no argv/stdin caller identity is accepted. Require matching session UID, active
local graphical user class (x11/wayland, not remote/greeter/TTY), typed LockedHint
and a root-owned unique logind bus peer. Subscribe before the initial snapshot,
bind all calls/signals to that exact peer/session, handle invalidated properties,
verify identity on refresh, and fail closed on changed owner, disconnect, invalid
properties, unsupported target or method deadline. Never treat IdleHint as lock.

The adapter emits fresh current observations at most1000ms apart when healthy,
and reacts to relevant changes promptly. No heartbeat may assert unlocked merely
because the process is alive. Calls are bounded; unknown state emits one fixed
unavailable frame then terminates. stdin EOF, SIGTERM or parent disappearance must
stop/reap the observer. There are no commands beyond lifecycle termination.

`SecretSessionGate` begins unavailable. Only a fresh fully eligible false locked
hint admits use. Receipt age is measured on the main monotonic clock, not helper
timestamps; at2500ms it is unavailable. Lock/inactivity immediately denies. Malformed,
duplicate/reordered/extra-field/transport failure or invalid clock quarantines
that gate generation. A trusted lifecycle owner creates a new adapter/gate to
recover; late queued frames cannot reopen a failed generation.

Before production use the owner must wire fresh checks at admission and immediately
before sensitive dispatch, stale-state expiry/notifications to abort existing
SecretStore consumers, lock policy and bounded helper shutdown. Observations do
not authorize a provider, account or effect; those checks remain separate.
Logind LockedHint and notifications are asynchronous desktop-reported hints, not
an atomic physical screen-lock guarantee. Supported desktop/session transition,
suspend/resume, bus loss/recovery and keyring tests remain mandatory. This adapter
cannot authorize input capture/injection or replace fresh companion context.

## Primary API evidence and validation scope

- [systemd-logind session API](https://www.freedesktop.org/software/systemd/man/latest/org.freedesktop.login1.html):
  GetSessionByPID and typed session properties identify the observed session.
  LockedHint is maintained by SetLockedHint; it is distinct from inactivity.
- [GIO call_sync](https://docs.gtk.org/gio/method.DBusConnection.call_sync.html):
  supply explicit reply type, deadline and cancellation; release owned results.
- [GIO signal_subscribe](https://docs.gtk.org/gio/method.DBusConnection.signal_subscribe.html):
  bind unique-name ownership and callback lifetime to the owning main context.

Current4pure tests cover receipt freshness/exact boundary, lock/inactive/owner/type
ineligibility, replay/extra/private fields, transport failure, clock regression and
new-generation recovery. These are synthetic policy tests. No native backend,
production credential UI or session/keyring result follows from their success.


## Coordinator implementation continuation

The initial frozen schema/heartbeat/freshness policy remains unchanged.
`session-stream.ts` and `session-client.ts` now implement bounded framing,
whole-batch validation, dual-clock gap quarantine, split-frame first-byte age,
synchronous denial notification and retained-helper shutdown. SecretStore now
requires a trusted observer, checks admission and callback freshness, aborts on
observation denial and drains active operations before directory close. The fixed
native CLI/library arm compiles. See evidence/session-integration/README.md for
current source pins, tests and limits. These new coordinator changes still require
independent review, actual main lifecycle/provider dispatch wiring and credential
setup/status UI. No native desktop/session/keyring acceptance follows from this.
