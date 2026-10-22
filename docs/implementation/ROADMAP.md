# Implementation roadmap

This is the execution handoff for [the approved plan](../PLAN.md). All application tasks are initially **planned**. The documentation PR does not implement the client.

The authoritative [task registry](tasks.json) contains 96 bounded task cards, each with ownership, dependencies, normative contracts, design references, steps, tests and acceptance checks. The [full dependency graph](dependencies.md) is generated from that registry. Read [testing and release](testing-release.md) for command semantics and desktop evidence requirements.

## Start sequence

1. Integrate the planning PR. Run `python3 scripts/validate_plan.py` and inspect `python3 scripts/plan_status.py`.
2. Complete [F1-01](tasks/F1-01.md): workspace/dependency bootstrap and real task-scoped check runners. Do not invent passing stub scripts.
3. Run feasibility tasks [S0-01](tasks/S0-01.md) through [S0-06](tasks/S0-06.md) in parallel where runners/devices permit. Their source belongs under isolated spikes; findings distinguish demonstrated behaviour from assumptions.
4. Complete [F0-01](tasks/F0-01.md): freeze shared contracts using the spike findings. If a required mechanism fails, revise the affected specification and dependent tasks explicitly; do not silently remove agreed scope.
5. Dispatch dependency-ready work below. One coordinator owns shared interfaces and integration; up to three feature agents can work alongside it without overlapping paths. More workers may be used if ownership remains disjoint.

## Parallel lanes

| Lane | Work | Task range | Main integration prerequisites |
|---|---|---|---|
| Runtime | Secure shell, windows, packaging | F1-01–F1-03 | Contract freeze for runtime; data for package lifecycle |
| Storage/security | SQLite, migrations, secrets, capabilities | F2-01–F2-03; F3-01 | Shared contracts |
| Design | Tokens, primitives, declarative views, settings | D1-01–D1-03 | Bootstrap/contracts; brokers for consent |
| Launcher/utilities | Search, applications, commands, files, links, calculator, dictionary, emoji | L1-01–L1-03; L2-01–L2-07 | UI/storage; platform capabilities where needed |
| Desktop | Portals, GNOME, KDE, X11, windows | P1-01–P1-05 | Broker/contracts; separate adapters may run concurrently |
| Keyboard/text | Supervisor/worker, Hyper, triggers, clipboard, insertion, snippets | P2-01–P2-04; P3-01–P3-03 | Native proof and capability/context contracts |
| Extensions | Sandbox, SDK, scripts, catalogue, developer tools | E1-01–E1-05 | Permissions/storage; shared views |
| Workflows | Runtime, editor and node families | W1-01–W1-03; W2-01–W2-03; W3-01–W3-05; W4-01–W4-09 | Editor and engine parallel after contracts; integration joins nodes/services |
| AI | Providers, conversations, context, tools, agents, memory, harnesses | A1-01–A1-03; A2-01–A2-05; A3-01–A3-05 | Global broker first; UI and provider adapters parallel |
| Automation | Durable occurrence scheduler and UI | A4-01–A4-02 | Workflow journal and conversation runtime |
| Browser | Native messaging, context, history and site rules | B1-01–B1-03 | Permission and desktop lifecycle contracts |
| Productivity | Notes, contacts/calendar, system/media, focus, auto-quit, games, themes | U1-01–U1-03; U2-01–U2-04 | Separate packages can run in parallel after their adapters |
| Media/speech | Capture/library, OCR/QR, Whisper and dictation | M1-01–M1-02; M2-01–M2-02 | Local processing parallel; insertion/UI integrates later |
| Release | Desktop matrix, visual/performance evidence, package release | R1-01–R1-03 | Feature integration and independent input/security gates |

## Milestones

**Foundation alpha:** runtime/storage/permission foundation, design primitives, application search, command settings and installable .deb. This proves usability and packaging, not feature completeness.

**Automation alpha:** desktop/clipboard/snippet capabilities, independently validated optional keyboard service, sandbox SDK/package manager and visual workflows with example packages. A disabled or unsupported integration has a clear capability state.

**Productivity beta:** all built-ins, full chat/provider/tool/harness capabilities, schedules, browser integration, calendar/notes/focus, OCR and local dictation. Each feature has integrated acceptance evidence, not just a screenshot or mocked result.

**1.0:** the four-session end-to-end matrix, security/recovery gate, visual/accessibility checks, measured performance and installation/upgrade/uninstall release evidence all pass. All agreed local features remain part of the release gate.

## Assignment and progress

Use one task/PR/isolated worktree, normally `codex/<task-id>-<description>`. The coordinator sets owner and branch in the registry, then marks `in-progress`. Dependency-owned contracts must not be edited by feature agents. Every task links the canonical design; UI uses shared primitives, not feature-specific approximations.

Mock-based development may overlap dependencies only after the contract fixture is frozen. It does not mark the dependent task done. A task is done only after integration, successful relevant acceptance, and evidence recorded as PR/commit/check/platform references. `blocked` records a concrete external dependency or failed mechanism; it is not a substitute for implementation effort.

Update the registry, rerun `python3 scripts/render_tasks.py`, then validate. The coordinator owns task-state changes to avoid concurrent manifest conflicts. Do not edit generated cards independently. Keep source/feature mappings current when scope is refined.

## Shared-file rules

The coordinator owns root manifests/lockfiles, `packages/contracts`, database migration numbering, routing registration and the task/source/feature registries. Task cards that explicitly implement one of these areas are coordinator work. Other agents provide a proposed interface/fixture change for integration rather than modifying the shared path. Separate subsystem folders are independently owned; overlapping parent/child ownership never runs concurrently.

## Future work

Cloud accounts/sync, teams/enterprise, hosted marketplace/billing, mobile/remote clients and additional OS/CPU targets require separate designs. Raycast/Alfred compatibility and wholesale community-package recreation are explicitly excluded. Research coverage of these products is retained in the feature matrix; it is not an implementation commitment for 1.0.
