# Prepared guest-native restart scenario

Source preparation only: no VM compositor or helper process has been started for this scenario. Build, syntax/type/lint and deterministic preparation checks do not establish native restart acceptance.

After the coordinator releases the disposable Debian guest, the same private session runner can select a **separate** real-helper restart experiment:

```sh
LINUXCAST_S002_NODE=/path/to/pinned/node python3 run-session.py kwin-wayland --private-guest --restart-scenario
LINUXCAST_S002_NODE=/path/to/pinned/node python3 run-session.py kwin-x11 --private-guest --restart-scenario
```

The ordinary success experiment remains unchanged: its `CANARY_COMPLETED` reconnect reply is a synthetic end-of-experiment transport response. It is never reported as a process restart. The restart mode uses no completion/reconnect reply to stand in for failure or recovery.

The restart driver starts the actual private Gio helper plus the current Node `CommandQueue` process. After a native KWin geometry command is acknowledged, the queue dispatches a placement into its in-flight state. The Gio parent deliberately retains that real `NextCommand` invocation without delivering its reply. The driver then kills the helper's entire process group with `SIGKILL`. It requires the actual service name to disappear and the current KWin `kwinLoop`/native QTimer watchdog to report `COMPANION_DBUS_TIMEOUT`, with a reload action and no placement dispatch.

A fresh helper process generates its own new instance UUID. A bounded generation base supplied by the trusted experiment coordinator makes the numeric generation advance across these two real processes; this is provisional test coordination, not the frozen production restart protocol. The old stopped script must make no request for longer than one watchdog interval after the new service appears. The driver then explicitly unloads and reloads the script through KWin's fixed native scripting methods.

The fresh helper rejects the original generation, then deliberately sends a handle with only its numeric generation updated. The actual script must deny its stale instance before native window access. A fresh current handle must complete a native geometry command and acknowledgement. Geometry before and after must remain equal, no old placement may reach dispatch, and the new instance/generation must differ. The script is explicitly unloaded and the helper group terminated at the end.

Only exact tagged JSON emitted by this script is extracted from the private compositor log; raw logs are never printed/exported. Values are limited to public own-window rectangles, opaque fixture handles, counters and fixed reasons/actions. No keyboard input, clipboard action or other application window is involved. Missing prerequisites, missing observations, protocol errors and deadline expiry produce unavailable results, never a synthetic success. The full physical desktop/session matrix remains outstanding.

The outer runner owns the private process tree with Linux `PR_SET_CHILD_SUBREAPER`. It installs SIGTERM/SIGINT handlers, discovers only its own descendants through `/proc` ancestry, verifies that relationship after opening pidfds, and sends termination to the tree concurrently. Orphans from detached sessions are adopted and reaped. After eight seconds of cooperative cleanup, remaining owned descendants receive SIGKILL; teardown has an additional three-second bound. Repeated cancellation is ignored during cleanup. This handles ordinary cancellation and the runner's own deadline; it does not claim cleanup if the outer supervisor itself is forcibly killed with SIGKILL or the kernel cannot terminate a process.

The local harmless supervision fixture creates a child and grandchild in separate sessions, both ignoring SIGTERM. Both SIGTERM and SIGINT cancellation of the outer supervisor must leave neither descendant PID alive. These checks use no display, input, clipboard, session bus or VM. The pipe-reader preparation checks retain stdout and stderr through a delayed grandchild after its direct parent exits; normal success waits for `close`, with the independent byte cap, cancellation and one-second deadline retained.
