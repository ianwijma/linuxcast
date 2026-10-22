# Linuxcast implementation plan

Approved planning baseline: 22 October 2026. Immediate deliverable: the documentation PR. Application implementation follows through the linked task graph.

## Product and scope

Build an independent GPL-3.0-only Linux productivity client inspired by Raycast's interaction/design language and Alfred's workflow model. Initial support is Debian 13 amd64, GNOME 48 and KDE Plasma 6.3, Wayland and X11. Use Electron, React, TypeScript, Tailwind CSS, SQLite, and Rust helpers in one Debian client package. Optional browser extensions are installed separately; desktop companions and the disabled-by-default privileged input subsystem ship with the client.

Version 1.0 includes all agreed local client feature families: launcher/search, files, clipboard, snippets, quicklinks, calculator, emoji, translation, dictionary, windows, system/media controls, notes, calendar/contacts, focus, screenshots/OCR, dictation, scripts/extensions, a visual workflow editor/runtime, advanced AI, and supported harness integrations. Usable alpha milestones do not redefine 1.0 as a smaller core-only product.

Use native Linuxcast formats. Do not implement Raycast SDK compatibility, Alfred workflow import, cloud accounts/sync, enterprise administration, mobile clients, or every third-party Store/Gallery integration in v1. Document those capabilities and their disposition in the [feature matrix](product/features.json). Mac-specific commands receive concrete Linux equivalents or explicit incompatibility explanations.

The research is based on official documentation, source where available, and inspected website/client screenshots. Neither proprietary native client was executed or decompiled. Source dates, platform distinctions, previews, and evidence limitations belong in the [source register](research/sources.json), [Raycast research](research/raycast.md), and [Alfred research](research/alfred.md).

## Architecture

Use sandboxed host-rendered windows and a small trusted main process. Separate storage/indexing, workflow, and AI work from rendering. A versioned native helper handles Linux desktop integration. Extensions run in a bundled Node runtime under mandatory bubblewrap isolation, using a declarative List/Grid/Detail/Form/Action SDK. There is no unsandboxed fallback and no custom React reconciler in v1.

Freeze command/search/action, view, platform capability, permission, workflow, provider/harness, secret, and native IPC contracts before parallel feature integration. SQLite has one writer; migrations and backups use consistent snapshots. Native portable backups are encrypted with standard age format and can run on an explicitly enabled resident schedule; private pre-migration snapshots remain plaintext. Credentials use the system keyring with session-only fallback, never insecure disk storage. Full details: [architecture](architecture/overview.md), [stack](architecture/stack.md), [data](architecture/data.md), and [security](architecture/security.md).

Each desktop operation advertises available, permission-required, component-required, unsupported, or temporarily-unavailable. GNOME, KDE and X11 adapters are distinct; XWayland does not imply native Wayland control. Browser context comes through paired Firefox/Chromium native-messaging companions with explicit permissions.

The optional input subsystem uses a privileged device/session supervisor and a dedicated unprivileged libevdev/libxkbcommon worker. It starts disabled, captures only selected keyboards, exposes no raw keystrokes to plugins/AI, and has mandatory crash/recovery gates. Initial support is one active local graphical session on seat0. Snippet expansion is tied to focus/layout/session epochs, with manual fallback for uncertain IME/sensitive-field contexts. See [Linux integration](architecture/linux-integration.md).

## Workflows and AI

Ship a visual graph editor with a searchable palette, typed connections, configuration forms, reusable groups, undo/redo, and node-level debugging. Implement triggers, list/script filters, forms/previews, launch/file/HTTP/script actions, variables/transforms/conditions/delays/bounded loops, outputs, and AI nodes. Reject raw graph cycles; isolate scripts; cancel stale searches; journal runs without replaying uncertain external effects. Native packages omit credentials and execution history. See [workflows](architecture/workflows.md) and [extensions](architecture/extensions.md).

All ordinary AI entry points use one global provider/model snapshot per run. Implement OpenRouter first, followed by OpenAI Responses, Anthropic Messages, Gemini, Ollama, and compatible endpoint presets. Capabilities control vision/tools/structured output; unsupported actions are explained before transmission. No hidden provider/model/billing fallback.

Support the full chat lifecycle, Quick AI and saved commands, context previews, approved tools, MCP, agents, projects, skills, inspectable memory, durable schedules, and local Whisper dictation. Model download is explicit. Harnesses are separate execution integrations: official ChatGPT-plan/Codex and Copilot routes where eligible; supported Claude API/SDK credentials or the unchanged installed CLI's own login. Never harvest CLI subscription tokens. See [AI](architecture/ai.md).

## Design and implementation order

[DESIGN.md](design/DESIGN.md) is mandatory for all UI. Use shared host components, graphite/light surfaces, compact icon-leading rows, neutral selection, keyboard hints, and consistent actions. Original mockups and SVG icons establish Linuxcast assets; source screenshots are observations, not copied implementation. Include light/dark, loading/empty/error, permission, keyboard and accessibility states in every component specification.

The [roadmap](implementation/ROADMAP.md) and [task registry](implementation/tasks.json) turn the scope into independently owned PRs. First validate desktop focus/clipboard, privileged-input recovery, sandboxing, provider streaming and the editor's integration shape. Freeze contracts, then run UI, storage, permission, native adapter, extension, workflow, provider, browser and productivity lanes in parallel where dependencies allow.

Use one isolated worktree per task. One coordinator owns contracts, manifests, lockfiles, migration numbering and task status. Task cards identify owned paths, input/output contracts, feature IDs, design references, implementation steps, validation commands and acceptance evidence. They are sized for GPT 6.1 Sol at high reasoning effort; no card should simply ask an agent to implement an entire subsystem without boundaries.

Milestones: foundation alpha; desktop/extension/workflow alpha; complete productivity/AI beta; full local 1.0. Do not label a feature done before its acceptance evidence exists.

## Validation and delivery

The planning PR must pass reference/coverage/DAG validation. Application release requires unit/contract/security checks, visual/accessibility checks, and real integration evidence on GNOME/KDE Wayland/X11. Ship ten complete example workflows. Test install/upgrade/uninstall, migrations/recovery, disabled components, offline/denied/unsupported states, suspend/resume, multimonitor/fractional scaling, clipboard races and keyboard-service failures.

Initial performance targets are warm-launcher p95 <=100 ms and indexed-search p95 <=50 ms on a recorded reference system with 100,000 paths. These are targets, not measured results. Package a .deb with checksums, dependency/licence inventory, release notes, supported-capability matrix and update instructions. Use Debian package upgrades rather than assuming Electron's auto-updater supports Linux. See [test and release specification](implementation/testing-release.md).

The empty repository needs a minimal licence baseline on develop, followed by this documentation branch and PR. Application work belongs to subsequent branches. Future cloud sync, teams, mobile clients and other platforms require separate designs.
