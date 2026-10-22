# Stack, build and packaging contract

Status: selected stack for implementation; not yet installed, built or tested. Research snapshot: 2026-10-22. UI work must use [DESIGN.md](../design/DESIGN.md).

## Selected technologies

| Layer | Selection | Implementation rule |
| --- | --- | --- |
| Desktop runtime | Electron 45 initial baseline | Pin an exact patch at bootstrap; stay on a supported major and consume security patches promptly |
| UI | React 19, TypeScript, Tailwind CSS 4 | Resolve and lock the exact compatible compiler in foundation task F1-01, recording its compatibility rationale |
| UI primitives | Radix primitives, Lucide icons | Wrap in the design system; product tokens and icon rules come from the design document |
| Rich notes editor | Tiptap 3 | Store versioned structured documents; sanitize imported/pasted content and provide accessible editing controls |
| Visual workflow editor | `@xyflow/react` / React Flow 12 | Use typed custom nodes, accessible keyboard controls and a structured outline; graph semantics live outside the canvas |
| Build | Vite 7 for renderer, esbuild for main/preload/utility entry points | Build explicitly before packaging; do not depend on the experimental Forge Vite plugin |
| Workspace | Bun workspace, committed `bun.lock` | `bun install --frozen-lockfile` in CI; package ownership follows overview.md |
| Package generation | Electron Forge 7 with Debian maker | Initial artifact is one amd64 `.deb`; include native helpers and runtime assets as unpacked resources |
| Local database | SQLite at least 3.51.3 through better-sqlite3, FTS5 | One trusted storage utility process owns the database; rebuild the native addon for pinned Electron and assert runtime SQLite version |
| Portable backup encryption | Rust `age` crate from the rage project, standard age passphrase format | Pin a reviewed compatible version in bootstrap; no custom cipher/KDF; encrypted full backups and scheduled exports |
| Data access | SQL migrations and typed repositories | No ORM; test migrations and queries against actual SQLite |
| Contracts | Zod schemas and inferred TypeScript types | Rust Serde mirrors checked by common success/failure JSON fixtures |
| Native code | Rust, edition 2024, stable toolchain | Pin the toolchain at bootstrap; build on Debian 13 amd64; no nightly dependency |
| Untrusted extension runtime | Bundled standalone Node.js 24 LTS | Separate from Electron's embedded Node; one bubblewrap host per active extension |
| Sandboxing | Debian bubblewrap | Mandatory, with explicit profile; no unsandboxed fallback |
| Native desktop libraries | GLib/GIO, D-Bus, X11/XFixes/XTest, Wayland client, libei | Link only the adapters needed; negotiate runtime capabilities |
| Privileged input worker | Rust, libevdev, libxkbcommon, uinput | Fixed remapping and literal trigger engine; never runs user code |
| Local OCR | Tesseract 5 | Bounded child worker, explicit language packs, no silent remote fallback |
| Local speech recognition | whisper.cpp | Bundle runner; download the approved multilingual base model only after explicit setup |
| Workflow regular expressions | Rust `regex` crate | Bounded patterns/input; reject unsupported backreferences/lookaround; never fall back to a backtracking engine |
| Image transformations | Sharp with libvips | Trusted bundled media code in a separate contained worker, scoped files and bounded decoded pixels |
| PDF assembly | pdf-lib | Merge/split/assemble in a contained worker; no document scripts or silent changes to originals |
| PDF text extraction/rendering | PDF.js | Dedicated sandboxed renderer and PDF.js worker using Chromium canvas; no document scripts, eval or automatic external access |
| Office document conversion | Optional detected LibreOffice headless | Sandboxed selected-file job with disposable profile; do not bundle the large office suite or auto-install it |
| Local speech output | Optional installed speech-dispatcher | Fixed broker adapter through libspeechd; visible unavailable/setup state if service/voices are absent |
| Unit/domain tests | Vitest, React Testing Library; Rust tests | Test semantics, contracts and failure recovery rather than snapshots alone |
| UI automation | Playwright Electron support | Add real GNOME/KDE session tests; Playwright support alone does not validate native integration |

Major/minor selections above are intentional implementation choices. Bootstrap must resolve compatible exact patch versions, commit the lockfile/toolchain and record licenses and checksums. Do not interpret the table as proof of the newest package release. If a listed tool cannot interoperate, document evidence and obtain a plan amendment instead of silently substituting a different runtime or SDK.

Electron's supported release window covers its latest three stable majors, so Electron 45 is a starting baseline, not a permanent pin. The research snapshot places 45.0.0 on 2026-10-20. [Release index](https://releases.electronjs.org/?channel=stable), [release policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines). Forge documents its Vite plugin as experimental; the explicit Vite/esbuild build keeps packaging independent of that plugin. [Forge Vite documentation](https://www.electronforge.io/config/plugins/vite).

## Debian baseline

Debian 13 includes GNOME 48 and KDE Plasma 6.3. The supported baseline includes each distribution's security updates; it does not require users to compile a newer compositor or replace their portal packages. [Debian 13 announcement](https://www.debian.org/News/2025/20250809), [release information](https://www.debian.org/releases/trixie/).

The research snapshot observed these package versions. They are evidence for API selection, not exact dependency pins that would block a Debian security update:

| Package | Observed Debian 13 version | Consequence |
| --- | --- | --- |
| `xdg-desktop-portal-gnome` | 48.0-2 | GNOME 48 portal integration baseline |
| `xdg-desktop-portal-kde` | 6.3.5-1 | Plasma 6.3 portal integration baseline |
| `kwin-wayland` | 4:6.3.6-1 | Use APIs and protocols present in KWin 6.3.6 |
| `libei1` | 1.3.901-1 | Build and validate portal input emulation against this distro library |
| `bubblewrap` | 0.12.0-1~deb13u1 | Verify the required namespace/profile behavior on stock Debian 13 |

[GNOME portal package](https://packages.debian.org/trixie/xdg-desktop-portal-gnome), [KDE portal package](https://packages.debian.org/trixie/xdg-desktop-portal-kde), [KWin package](https://packages.debian.org/trixie/kwin-wayland), [libei package](https://packages.debian.org/trixie/libei1), [bubblewrap package](https://packages.debian.org/trixie/bubblewrap).

Support requires a functioning user desktop session, an available session bus and normal distro desktop components. `amd64` is the initial build architecture. ARM64 and other distributions are future work, not untested labels on the initial release.

## Runtime ownership

Bun manages development dependencies and runs workspace scripts. Bootstrap pins the Bun version, declares `workspaces` in the root `package.json`, and commits `bun.lock`; local setup uses `bun install`, and CI uses `bun install --frozen-lockfile`. Review dependency lifecycle requirements for Electron and native build tools and explicitly allow only required packages through `trustedDependencies`. Validate native addon rebuilds and packaging with this install policy. [Bun workspaces](https://bun.sh/docs/pm/workspaces), [Bun installation and lifecycle scripts](https://bun.sh/docs/pm/cli/install).

Use `bun run <script>` for the repository's named scripts, retaining their configured tools such as Vitest and Playwright. Node-based build tools retain their declared runtime; the packaged application continues to use Electron and the bundled Node runtime described below. [Bun script execution](https://bun.com/docs/runtime).

Electron provides its own embedded Node version for trusted main and utility code. The separate Node 24 runtime exists to give extensions a stable, independently sandboxed execution environment. Do not load extension JavaScript into Electron main, a trusted utility process or a preload script.

Only reviewed bundled SQLite/media adapters may use native Node addons. Build better-sqlite3 with the exact Electron headers/ABI using electron-rebuild; package Sharp/libvips for the separate bundled Node media worker and validate its runtime ABI independently. Verify both inside the packaged app. Extension packages are pure bundled JavaScript with no `.node` files, package-install scripts or runtime native compilation. [electron-rebuild](https://github.com/electron/rebuild).

Rust executables are external processes with a versioned protocol. Avoid an N-API desktop integration addon: separate processes make privilege, cancellation and crash boundaries explicit. The privileged input worker uses libevdev rather than libinput for device forwarding and `SYN_DROPPED` recovery; libxkbcommon interprets an explicitly synchronized layout. Libinput is not a universal source of committed application text.

## Backup and workflow utility dependencies

Use the maintained Rust `age` implementation from the rage project for standard passphrase-encrypted portable backups. The project identifies the `age` crate as its library and supports interoperability with rage and the Go reference implementation. The inspected crate documentation is pre-1.0 and explicitly labels that API beta; bootstrap must pin and review the exact version/toolchain, test format interoperability and include it in dependency/security review. Do not describe it as an audited stable dependency without evidence. [rage project](https://github.com/str4d/rage), [age crate documentation](https://docs.rs/age/latest/age/). The selected wire format remains age; this is not permission to invent encryption if a dependency check fails.

The Rust helper's fixed backup-worker mode streams or stages the versioned ZIP payload privately, encrypts with the library and atomically publishes the encrypted artifact. Passphrases never appear in command arguments or environment variables. See [data.md](data.md) for formats, schedules and retention, and [security.md](security.md) for authenticated restore.

For workflow transformations, Rust `regex` provides finite-automata matching with linear behavior in input length for a fixed pattern; bound both pattern and input size and reject unsupported syntax. Sharp/libvips is the selected image transformer. pdf-lib handles assembly, while PDF.js handles parsing/text/rendering in its dedicated sandboxed renderer/worker. These are distinct jobs behind typed file handles, not arbitrary parser calls in Electron main. [Rust regex](https://github.com/rust-lang/regex), [Sharp](https://sharp.pixelplumbing.com/), [pdf-lib](https://pdf-lib.js.org/), [PDF.js](https://mozilla.github.io/pdf.js/).

Detect an installed LibreOffice binary and exact version for optional document conversion. Run a fixed headless conversion with a disposable user profile inside the selected-file sandbox, no macros, network or access to the user's normal LibreOffice profile. Missing installation produces a capability/setup state; do not download/install it automatically. Speech output uses a fixed native libspeechd adapter to an installed speech-dispatcher service, with cancel/voice capability reporting and no text placed in argv. [LibreOffice parameters](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html), [speech-dispatcher project](https://github.com/brailcom/speechd).

Bootstrap/utility tasks pin exact compatible versions, record transitive licenses and security review, and validate each packaged worker with corrupt/oversized inputs, cancellation and confinement. Document-format support is an explicit allowlist; installing a library does not justify claiming every format its ecosystem can sometimes open.

## Build and package contents

Build in a pinned Debian 13 amd64 environment. Keep Bun, Node, Rust, native libraries and model runner versions in a build manifest. CI must build from the lockfile and record source revisions and artifact hashes. Reproducibility is a target validated by repeated builds, not assumed from using a container.

Proposed filesystem layout:

| Installed location | Contents |
| --- | --- |
| `/usr/lib/linuxcast/` | Electron application, unpacked better-sqlite3 addon, bundled Node, unprivileged helper, local model/OCR runners and immutable assets |
| `/usr/libexec/linuxcast/` | Root-owned fixed administrative helper, input supervisor, input worker and browser native-messaging host |
| `/usr/share/applications/io.github.ianwijma.Linuxcast.desktop` | Stable desktop identity and launch actions |
| `/usr/share/icons/hicolor/` | Generated Linuxcast icons in required sizes; source/provenance tracked |
| `/usr/share/linuxcast/integrations/` | GNOME extension and KWin script bundles, browser companion manifests/templates |
| `/usr/share/polkit-1/actions/` | Narrow input-service administration policy |
| `/usr/lib/systemd/system/linuxcast-input.service` | Disabled-by-default optional input service |
| `/usr/share/doc/linuxcast/` | License, notices, dependency inventory and recovery instructions |

The `.deb` declares normal runtime dependencies such as bubblewrap, libsecret/GLib, libevdev/libxkbcommon and relevant desktop client libraries. Package scripts create the dedicated nonlogin input-worker account and install files, but must not enable the system input service, add the user to `input`, modify compositor settings, or download models. Verify packaging dependencies against `ldd`/package inspection; the table is not an exhaustive generated dependency list. [Forge Debian maker](https://www.electronforge.io/config/makers/deb).

Optional GNOME/KDE components are bundled assets whose enablement is an explicit onboarding action. Browser companion installation/enablement is also explicit. A browser store/signing strategy and Firefox/Chromium native-messaging manifests must pass the browser integration gate before claiming the companion is distributable.

## Version and compatibility policy

- Lock exact dependency patches in the bootstrap PR. Upgrade Electron on a regular supported-major cadence and treat critical security updates as release work, including native addon rebuild and desktop smoke tests.
- Maintain an app version, database schema version, extension SDK major version, workflow document version and native protocol major version separately.
- A changed native protocol major requires matching packaged components. Refuse mismatched helpers rather than attempting undefined compatibility.
- Preserve saved content across routine upgrades. Unknown newer extension/workflow schemas open as unsupported with an explanatory message; never overwrite them with a downgraded shape.
- GNOME component declares Shell 48 compatibility initially. KWin component targets Plasma 6.3. Later compositor versions require explicit test expansion and metadata updates.
- Native runner/model versions are pinned with license, URL, SHA-256 and architecture. Model downloads are verified before atomically moving into the model directory.
- Do not download executable updates from arbitrary extension/provider responses.

## Update and rollback behavior

Initial updates are signed/tagged project releases offering the `.deb` and checksums, with an in-app notification/link. Installation goes through the normal Debian package flow. A signed APT repository is a later distribution improvement. Electron's built-in autoUpdater does not provide Linux updating. [Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater/).

On package upgrade, stop the input service before replacing its binaries. Preserve the user's saved consent record but require a fresh session handshake and explicit rearm; never resume a stale device grab. Do not restart the desktop app and restore privileged capture without user awareness. Database migration occurs under the application owner, after a consistent local backup. Downgrading the binary does not automatically downgrade the database; restore a compatible backup through the documented recovery path.

## Required validation

Foundation task F1-01 must expose these stable workspace commands. An optional argument after `--` is a task ID from the implementation registry, translated by a small repository-owned runner to the underlying tool's include/project filters; it is not passed blindly as an arbitrary CLI flag. Omitting the task ID runs the whole suite. An unknown or explicitly empty selector must fail rather than silently run no tests.

| Command | Scope meaning |
| --- | --- |
| `bun run test:unit -- <TASK-ID>` | Domain and React component unit tests mapped to the task |
| `bun run test:contracts -- <TASK-ID>` | Shared protocol, schema and compatibility fixtures mapped to the task |
| `bun run test:ui -- <TASK-ID>` | Playwright Electron UI scenarios mapped to the task |
| `bun run test:integration -- <TASK-ID>` | Cross-process and native integration scenarios; declare required session/backend |
| `bun run test:security -- <TASK-ID>` | Permission, sandbox, IPC and adversarial fixtures mapped to the task |
| `bun run test:perf` | Complete reproducible performance suite with environment and percentile output |
| `cargo test --workspace` | Native Rust unit and protocol tests |

Native session/device tests must report prerequisites and fail the relevant release gate when prerequisites are missing. Do not report an unexecuted hardware/compositor test as passed. These are required future scripts; this documentation PR does not claim that they already exist.

The packaging gate requires clean install, first launch, update from the previous schema fixture, failed migration recovery, removal and reinstall on Debian 13 amd64. Check desktop launcher identity, protocol registration, icon sizes, native dependency loading, system-service disabled state and absence of unexpected autostart. Removal stops/disables the input service; ordinary removal preserves user data, while an explicit in-app delete-data action has its own confirmation.

Release artifacts must include a dependency/license inventory and hashes. A successful package build is insufficient: run the desktop matrix in [linux-integration.md](linux-integration.md), adversarial isolation tests in [security.md](security.md), data recovery tests in [data.md](data.md), and the design checks from [DESIGN.md](../design/DESIGN.md).

Playwright's Electron API is useful for renderer/main testing, but compositor, portal, keyring and input-device behavior needs real sessions. [Playwright Electron application API](https://playwright.dev/docs/api/class-electronapplication). React Flow supplies an editor foundation; it does not supply workflow execution semantics or make a custom node accessible automatically. [React Flow documentation](https://reactflow.dev/learn).
