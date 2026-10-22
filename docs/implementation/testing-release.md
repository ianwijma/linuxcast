# Test and release specification

This is a future acceptance contract. The repository presently runs documentation checks only. Read [security](../architecture/security.md), [Linux integration](../architecture/linux-integration.md), and [design](../design/DESIGN.md).

## Commands to establish in foundation

| Command | Contract |
|---|---|
| `python3 scripts/validate_plan.py` | Existing: local documentation, IDs, graph, coverage, assets and token checks. |
| `python3 scripts/plan_status.py` | Existing: task counts and dependency-ready work. |
| `pnpm lint` / `pnpm typecheck` | Foundation introduces no-write lint and TypeScript validation. |
| `pnpm test:unit -- TASK-ID` | Task-scoped unit tests; omitted ID runs all. Unknown IDs fail, never silently pass. |
| `pnpm test:contracts -- TASK-ID` | Shared wire/schema/ViewModel/native fixture checks. |
| `pnpm test:ui -- TASK-ID` | Renderer behaviour, accessibility and visual fixtures; not desktop-native proof. |
| `pnpm test:integration -- TASK-ID` | Installed-client/desktop adapter integration suite. Reports unavailable desktop separately from pass. |
| `pnpm test:security -- TASK-ID` | Sandbox, permission, IPC and adversarial fixtures. |
| `pnpm test:perf` | Repeatable latency, process-memory and idle-CPU measurements. |
| `cargo test --workspace` | Rust workspace tests after native bootstrap. |
| `pnpm package:deb` | Build the complete amd64 client package after packaging bootstrap. |

F1 foundation tasks create runners with these interfaces. Task cards name the future commands needed for their acceptance; these are not commands to run in the documentation-only snapshot. Bootstrap records prerequisites and runs every introduced command once. Tests must check behaviour and boundaries, not merely mirror implementation.

## Desktop matrix

Debian 13 amd64 GNOME 48 Wayland, GNOME X11, KDE Plasma 6.3 Wayland, and KDE X11. Record exact distro, desktop, kernel, portal, Electron, GPU, scale and helper versions for each run. Use fresh users and persisted-user upgrade fixtures. Test native GTK, Qt, Chromium and terminal destinations, not just Electron-to-Electron actions.

Headless CI validates pure logic/contracts/UI. Dedicated VM/hardware runners validate compositor/portal/session/input behaviour. Missing access is a reported acceptance gap, not a skipped success. Test at least one physical laptop keyboard plus a USB keyboard for privileged input, and Bluetooth reconnect where supported hardware is available.

## Required end-to-end scenarios

1. Install .deb, first launch, choose shortcut, search/open an application and file, use action panel, dismiss/reopen and quit. No tray dependency.
2. Enable/disable desktop companions; observe unavailable/permission/available transitions; revoke portal permissions and recover.
3. Copy text/HTML/image/files, search/pin/paste clip, switch focus mid-paste, copy concurrently, confirm no overwrite of newer clipboard state.
4. Configure snippet and Hyper independently. Exercise immediate/delimiter modes, duplicate/prefix conflicts, multiple keyboards, Caps tap/hold, layouts, dead keys and IME pause.
5. Run all ten packaged workflow examples through visual editing, debug inspection, export/import, cancellation, failure and retry. No secret export.
6. Configure OpenRouter and a selected model; run Quick AI, chat, saved command and workflow node. Change selection during a stream; the running request retains its snapshot. Cover 401/429/network/partial stream/cancel.
7. Preview clipboard/file/browser/screen context, approve a tool, deny another, navigate away and back, resume without duplicate execution. Project memory stays isolated.
8. Record dictation, cancel, record again, transcribe offline, optionally clean with the configured model, insert only into the valid intended target.
9. Schedule a workflow/AI run; sleep across occurrences; restart after a possibly effectful step; verify coalescing and interrupted-review behaviour.
10. Notes draft recovery; calendar read-only versus writable sources; recurring events/timezones; focus app/site rules; screenshot OCR/cache eviction without original-file deletion.
11. Browse/install/update a native package, reject malformed/archive traversal/package permission expansion, and prove isolation of denied file/network resources.
12. Suspend/resume, lock/unlock, fast user switching, helper restart, multiple monitors, fractional scale, unsupported capabilities and offline data.

## Privileged input release gate

Installation leaves the service disabled/stopped. Test polkit allow/cancel, selected versus new keyboards, user/seat authorization, TTY/remote/greeter exclusion, stale lease, malformed frames, socket spoofing, conflicting remapper and virtual-device loop prevention.

Kill worker, supervisor and Electron separately while modifiers are down and during snippet deletion/insertion. Block IPC; induce CPU pressure; unplug/replug; exercise SYN_DROPPED; invoke emergency disarm. Verify the supervisor did not retain device descriptors, physical input returns, no keys remain stuck, pending transactions are discarded, and no automatic crash loop regrabs devices. Inspect journal/core-dump policy for absence of typed content. Test update and uninstall while active.

Focus identity and committed-text understanding are separate capabilities. Test password/PIN fields and terminal password prompts; unknown field contexts pause unless explicitly allowed per app. A documented raw-input fallback must not claim universal sensitive-field detection. See the exact timings and state machines in [Linux integration](../architecture/linux-integration.md).

## Performance and visual quality

Reference development runner: Debian VM with four dedicated vCPUs, 8 GiB RAM and SSD-backed storage; record host CPU, compositor/GPU and load. Include one physical-machine cross-check. Warm launcher visible-and-focused p95 target <=100 ms across 100 trials. Local indexed filename search p95 <=50 ms with a fixed 100,000-path dataset and 50 queries after index completion. Measure end-to-end boundaries, not only internal function timings. Cancellation acknowledgement target <=1 s for ordinary jobs; native input recovery uses its stricter independent thresholds.

Report total process-tree PSS, cold startup, indexing throughput and idle CPU. Establish baselines first; do not claim an arbitrary memory cap has been achieved. Regression budgets become measured release gates after baseline review.

Review dark/light, opaque fallback, selected/focus, loading/empty/error/permission states. Validate keyboard-only operation, accessible names and announcements, 200% text scaling, high contrast, reduced motion, long names, CJK/RTL text display and non-US key labels. Workflow editor must support non-drag editing. Mockups are not runtime evidence.

## Release checklist

- Every v1 feature has integrated task/test evidence or a previously specified capability-limited state; no hidden scope reduction.
- Migrations handle upgrade and interrupted migration with backup/recovery. Downgrade refuses newer incompatible schemas safely.
- Fresh installation, upgrade, failed upgrade, uninstall and reinstall preserve/remove data according to explicit choice.
- Input-service binaries are stopped before replacement; consent survives upgrade but capture requires fresh handshake. Uninstall disarms and removes service authorization.
- Bundled Node/native addons/helpers match Electron architecture and Debian ABI; no developer runtime is required for normal use.
- Optional models/languages use versioned checksums, visible download size/licence and retry/cancel. Offline core remains useful.
- Publish .deb, SHA256 checksums, SBOM/licence inventory, release notes, supported-session/capability report and recovery instructions.
- Notify about releases and open the verified download page; do not assume Electron autoUpdater provides Linux updates. Future signed APT hosting is separate work.
- No keys, private clipboard/screenshots, raw input or unredacted tool results in packages, logs, test evidence or PR assets.
