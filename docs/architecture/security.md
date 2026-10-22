# Security and permission contract

Status: implementation requirements and release gates, not an audit result. Research snapshot: 2026-10-22. Permission and recovery UI must follow [DESIGN.md](../design/DESIGN.md); do not hide missing safety prerequisites behind a generic error.

## Threat model and limits

Protect user files, credentials, clipboard history, notes, conversations, application control and physical input from untrusted extensions, workflows, imported content, remote model/tool responses and browser messages. A malicious extension must not escape its declared grants merely because the user installed it. A malicious document or AI output must not become an instruction to grant permissions.

The application broker, bundled native helpers, official desktop companions and privileged input binaries are trusted code. Keep these small at the boundary, review changes to them and pin their build inputs. Root compromise, a compromised compositor/kernel and arbitrary unsandboxed malware already running as the user are outside a complete protection guarantee. Same-UID Unix sockets are a process boundary against sandboxed code and other users, not a proof that all same-UID host processes are benign.

The ordinary SQLite database and content files are private to the user's account but are not encrypted at rest by Linuxcast. Full-disk/home encryption remains separate. Clipboard filtering and sensitive-field detection are best effort: never promise that password-manager content or every protected field can be recognized on Linux.

## Trust boundaries

| Boundary | Required enforcement |
| --- | --- |
| Renderer to main | Sandboxed renderer, context isolation, no Node integration, narrow preload methods, sender/frame validation, schema validation |
| Extension to broker | Separate Node process inside mandatory bubblewrap; authenticated parent-owned stdio identity; grant checks on every method |
| Script/MCP child to broker | Separate job sandbox and identity; no inherited extension/AI privilege expansion |
| Broker to native helper | Packaged executable path, version handshake, bounded protocol, no shell interpolation |
| Desktop component to helper | Fixed method set, sender/session checks, generation validation; no arbitrary eval/D-Bus forwarding |
| Browser to host | Native messaging allowlisted extension IDs plus per-profile pairing; no unauthenticated localhost endpoint |
| User app to input service | Explicit administrative grant, peer credentials, active-seat/lock leases and bounded fixed protocol |
| Supervisor to input worker | Dedicated UID, handed-off descriptors, empty capabilities, no user-code evaluation |
| Provider/tool output to effects | Treat as untrusted data; explicit invocation context, typed arguments, permission/tool policy checks |

## Electron hardening

All renderers use `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, and web security enabled. Do not set `--no-sandbox`, disable certificate validation, or load an arbitrary remote page into a privileged window. Serve packaged application resources through a restricted custom protocol. Use a Content Security Policy with no remote scripts, no `unsafe-eval`, narrowly allowed images/fonts and no renderer-origin arbitrary network access.

Expose named, typed preload methods only. Never expose the whole `ipcRenderer`, generic `invoke(channel, data)`, arbitrary file read/write, `shell.openExternal`, process spawning or secret access. Validate sender webContents and frame URL before dispatch, validate the entire payload and return a safe structured error. A compromised renderer must not acquire every broker method by guessing a channel name.

Deny navigation, new windows, downloads and permission requests by default. Explicit external-link actions allow only approved schemes and user intent; reject `javascript:`, arbitrary `file:`, credential-bearing URLs and unrecognized custom schemes. Markdown/HTML previews must be sanitized and cannot execute script. Drop/paste/import content is untrusted input.

Electron documents these controls as part of its security checklist; application implementation still needs adversarial tests. [Electron security](https://www.electronjs.org/docs/latest/tutorial/security/), [renderer sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox).

## Extension execution sandbox

Launch one standalone bundled Node 24 process per active extension through the trusted native helper. Before executing package code, create a bubblewrap environment with:

- Read-only mounts for the exact Node runtime, necessary runtime libraries, the validated extension package and immutable SDK assets.
- One writable extension data directory and an isolated temporary directory. No host home, app database, other extension directories, secret blobs, SSH/GPG/cloud credentials or inherited working directory.
- New mount, PID, IPC, UTS and network namespaces, `--die-with-parent`, a minimal environment and no ambient capabilities. No host `/run/user`, session/system bus sockets, X11/Wayland sockets, Xauthority, browser profiles or privileged input sockets.
- Minimal `/proc` and device exposure needed by Node, never host input/uinput, GPU, audio or arbitrary block devices. Network requests go through the broker; a network namespace is not replaced by a JavaScript network wrapper.
- Parent-owned stdio protocol and a bounded redacted stderr channel. Do not expose a reusable host socket/token to unrelated extensions.

Bubblewrap supplies sandbox construction primitives rather than a complete policy; Linuxcast owns the mount, namespace, resource and broker policy. Node's permission model is defense in depth, not the sandbox boundary. [bubblewrap source/documentation](https://github.com/containers/bubblewrap), [Node permission-model documentation](https://github.com/nodejs/node/blob/main/doc/api/permissions.md).

Put each extension sandbox in a systemd user transient scope with initial limits of 256 MiB memory, 64 tasks and CPU quota equivalent to one core. Default extension command wall time is 30 seconds, extendable only by an explicit declared long-running/background capability. Cap one stdout protocol message at 1 MiB and accumulated diagnostic output at 1 MiB per invocation. The helper terminates the process group/cgroup on cancellation, revocation or deadline, escalates to kill after a one-second grace period, and verifies descendants are gone. Workflow script jobs use the stricter profile from [workflows.md](workflows.md): 10-second default, 32 tasks, 256 KiB diagnostic cap and 500 ms termination grace. Repeated limit violations suspend the extension/job source until the user re-enables it.

Verify that required namespaces and resource controls can actually be created on the supported Debian desktop. If the user disables unprivileged namespaces, bubblewrap fails, or the required containment profile cannot be applied, extensions/scripts/local MCP servers are unavailable. Display the precise remediation. Never fall back to plain `node`, an Electron utility process or an uncontained shell.

### Package installation

Validate manifest/version, file count, total expanded size, per-file size and archive paths before installing to a staging directory, using the exact package limits in [extensions.md](extensions.md). Reject absolute paths, traversal, escaping symlinks, special files, native `.node` addons, package lifecycle hooks and remote executable imports. Bundled pure-JavaScript dependencies are allowed. Do not run `bun install` or any other dependency installer against an extension package on the user's machine.

Compute a content hash after validation and atomically move the package into its immutable version directory. Grants bind to installed extension identity, version and integrity record. A permission expansion, changed package identity or changed integrity requires a new grant; do not silently reuse the former package's permissions. Disable/removal stops the host before deleting its data, and deletion of user data is a separate explicit choice.

## Capability broker permissions

Every effect carries a trusted principal and invocation ID. The broker derives extension/workflow identity from its own connection registry; callers cannot declare themselves built-in. Grant checks occur at execution time as well as initial install, including redirects, renamed files and session changes.

| Permission | Scope and enforcement |
| --- | --- |
| `files.read` | User-selected directory/file handles; resolve under granted roots, reject traversal and symlink escape, cap bytes and MIME |
| `files.write` | Explicit write roots/handles; atomic writes where possible, no implicit home-wide grant |
| `network.fetch` | Allowlisted origin/scheme/port; revalidate each redirect and resolved destination; response-size/time limits |
| `network.local` | Separate explicit permission for loopback/private-network services, including local model endpoints |
| `clipboard.read` | Current clipboard only; history access is a distinct grant |
| `clipboard.history` | Specific history queries through storage, subject to user collection preferences and exclusions |
| `clipboard.write` / `input.paste` | Explicit content action, bounded size; paste needs a fresh intent/context and available backend |
| `input.shortcut` | One bounded explicit chord against a fresh target token, using consented RemoteDesktop/libei or supported X11 only; unavailable otherwise. Never forwarded to privileged inputd as arbitrary events. |
| `applications.launch` | Validated application ID or scoped file-open operation; no arbitrary shell |
| `windows.control` | Fixed operation on a valid session-scoped window handle |
| `ai.generate` | Configured provider/model through broker; no provider key returned to caller |
| `notifications.show` | App-owned notifications, rate-limited and attributed to the extension/workflow |
| `background.run` | Declared lifecycle and limits; no implicit startup persistence |
| `scripts.execute` | Separate sandbox job with declared interpreter, arguments, tools, file roots and network grants |

Network requests reject unsupported protocols and credential-bearing URLs. Resolve and revalidate destinations so an allowed public hostname cannot redirect/rebind into an ungranted loopback/private service. Local provider setup explicitly grants the selected local endpoint. Do not let an extension access every LAN service by granting an unrelated public API origin. Request/response logs omit credentials and content by default.

Filesystem handles are opaque capabilities. A display path is not authority. Use safe descriptor-relative resolution for operations and test symlink swaps and concurrent renames; string prefix checks are insufficient. External executable arguments are arrays to a fixed executable, never shell concatenation.

## Workflow, AI and MCP safety

Workflow definitions and imported files cannot grant their own permissions. The editor shows required effects before enabling an automation; changed effects require renewed approval. Built-in graph nodes can run in the trusted executor only when their implementation is fixed application code. User scripts always run in a separate sandbox job.

Tool execution uses typed arguments and broker permissions. A provider-generated tool call, webpage, skill or MCP response is untrusted input, not a new instruction from the user. Skills can supply task guidance but cannot widen file/network scopes, switch credentials or approve actions. Local MCP servers have independent sandbox profiles; a server is not trusted merely because it is launched by an approved AI tool.

Persist run state before effect dispatch, but do not claim exactly-once external actions. If a crash leaves an effect's outcome unknown, mark the run interrupted and require review instead of automatically sending it again. Retries apply only to declared safe/idempotent operations. See [data.md](data.md).

## Secrets and content privacy

Use Electron `safeStorage` only when it reports an actual OS-backed keyring backend. Store encrypted secret blobs in a private secrets directory and opaque secret IDs in SQLite; the encryption key is protected by the OS keyring. Detect the Linux `basic_text` fallback and refuse persistent credential storage in that state. Offer session-only credentials held by the broker and explain how to unlock/configure the keyring. Do not force an insecure backend flag. [Electron safeStorage](https://github.com/electron/electron/blob/main/docs/api/safe-storage.md).

This protects stored provider/account credentials; it does not encrypt the app database, notes or clipboard files. Never send credentials to renderer, extension, workflow, prompt context, telemetry, logs or error details. Clear session-only secrets on lock/quit according to the account setting; the default is clear on quit and suspend remote background jobs while the session is locked. Secret deletion removes its blob/reference and attempts keyring-backed cleanup where applicable; avoid claims of forensic erasure on SSDs.

Clipboard history is opt-in. Honor available sensitive-content hints, reliable source exclusions and lock pause, while explicitly acknowledging that Linux does not provide universal classification. Screen/audio capture requires an explicit feature invocation and relevant OS permission. Raw microphone audio and temporary OCR images are deleted when the operation finishes unless the user chooses to save them. Never fall back from local OCR/dictation to a remote provider without explicit user choice.

Logs use an allowlist of operational fields and redact URL credentials, tokens, prompt/content bodies, clipboard data, key events and file contents. Crash reporting is off by default; no unattended upload of dumps. The input processes disable core dumps entirely.

### Portable backup encryption

Full portable backups use the standard age passphrase format through the maintained Rust `age` implementation, not custom cryptography. Pin/review the library and test interoperability with rage/reference age before release; the inspected pre-1.0 crate explicitly carries a beta API caution. The format and library choice are fixed, while exact compatible dependency/toolchain versions are resolved in bootstrap. [rage project](https://github.com/str4d/rage), [age crate](https://docs.rs/age/latest/age/).

Passphrases have a 12-character minimum, are never passed in argv/environment/logs and are retained only after explicit opt-in to the secure SecretStore. Use secret-memory wrappers in the Rust worker and discard values promptly, without claiming complete zeroization of every runtime copy. Automatic backups require securely retained credentials; unavailable/locked keyring means skip with an actionable result, never plaintext fallback. Provider/account secrets and permission grants are always excluded from portable archives.

Decrypt into private staging and consume/authenticate the entire stream before changing live data. Bound age scrypt work, archive size/entry counts/expansion and paths; accept the supported passphrase form only and do not invoke external age plugins. Reject tampering/truncation/wrong passphrase before import. Restore requires schema/reference validation and category/conflict review, then a pre-restore snapshot. Internal migration snapshots and plaintext snippet/quicklink exports remain clearly labelled; encryption of a portable file does not encrypt the ordinary local database.

### Document and media workers

Treat image, PDF and office documents as adversarial parser input. Sharp/libvips and pdf-lib run in contained selected-file jobs with decoded-pixel/page/file limits, cancellation and no inherited network/home. PDF.js uses a dedicated sandboxed renderer/worker with document scripting, eval and automatic external resource access disabled. LibreOffice conversion uses a disposable sandbox profile with macros/network disabled and never the user's normal profile. A corrupt input cannot crash main or overwrite its source file. Rust regex bounds both pattern and input size and rejects unsupported syntax instead of falling back to a potentially catastrophic backtracking engine. All chosen native/transitive parser dependencies need license and security review before packaging.

## Privileged input security gate

The complete lifecycle is normative in [linux-integration.md](linux-integration.md). The following are security invariants, not optional hardening:

- Fresh package installation leaves the service disabled/stopped. No `input` group membership, world-writable devices, setuid Electron or general privileged shell helper.
- Root administrative actions are fixed enums through polkit, with caller identity derived from trusted context. Authentication cancellation is a no-op.
- The root supervisor opens only selected, validated keyboard devices for a consented active local `seat0` session. Unknown/stale lock/session state disarms.
- The worker runs under a dedicated nonlogin UID, empty capabilities, bounded memory/state, and a post-initialization syscall policy denying execution and arbitrary new file/socket access. Review the exact filter against Rust/libevdev runtime requirements.
- Handed-off evdev descriptors have no retained supervisor duplicates. Worker death must close the last grab-owning descriptor; prove this with held-key crash tests.
- App lease: 250 ms heartbeat/1 second expiry. Worker lease: 100 ms heartbeat/500 ms watchdog. systemd watchdog: 2 seconds. Parent death and control-group termination cover supervisor failure.
- Left Ctrl + Right Ctrl + Escape disarms before remapping. Crashes/emergency disarm never automatically regrab; explicit re-enable is required.
- No raw typing streams leave the worker. Literal trigger recognition returns only ID/nonce/context. No root template, snippet body, provider or workflow execution.
- Unknown focus pauses expansion; known protected fields always pause; per-app raw fallback for unavailable sensitivity information is explicit and accurately described. Physical input does not prove committed text or safe-field status.
- Insertion uses short-lived context-bound transactions, rejects stale/nonmatching nonces and revalidates before each destructive phase. Focus/lock delivery still has asynchronous limits and must be documented as such.

Systemd hardening must be validated on Debian 13: read-only system/home restrictions, bounded resources, AF_UNIX/AF_NETLINK only, device allowlist, no core dumps and minimal supervisor capabilities. Do not apply `PrivateDevices=yes` while expecting real evdev/uinput access. A stronger-looking unit that prevents recovery or breaks device access is not a passing implementation. [systemd execution controls](https://www.freedesktop.org/software/systemd/man/257/systemd.exec.html), [resource controls](https://www.freedesktop.org/software/systemd/man/257/systemd.resource-control.html).

## Required adversarial tests

Release requires tests for malformed/oversized/unknown IPC, spoofed principals, renderer/frame navigation, arbitrary URL schemes, permission revoke during work, extension archive traversal, symlink escape/races, ungranted files, inherited environment/secrets, display/bus/input socket access, direct network attempts, private-network redirect/rebinding, child-process escape, memory/process/output exhaustion, cancellation descendants and a missing sandbox backend.

Also test provider responses that request unauthorized tools, malicious Markdown/ICS/HTML, MCP servers exceeding schemas/limits, browser messages from the wrong extension/profile, unavailable/locked/basic-text keyring, and logs/crash outputs containing seeded test secrets.

The input gate adds wrong-UID/stale-session messages, replayed nonces, arbitrary device paths, selected-device replacement, virtual-device recapture, competing remappers, rapid lock/user switching, unknown protected-field state, `SYN_DROPPED`, all watchdog expiries and `SIGKILL` at every lifecycle step with physical keys held. A test report must identify desktop/session, kernel, device type and observed recovery. No source-only or mock-only result can close this gate.

Security-sensitive changes require review of the applicable threat boundary and regression fixtures. A failed mandatory containment or input-recovery gate blocks that feature's release; it must not be bypassed to meet a date.
