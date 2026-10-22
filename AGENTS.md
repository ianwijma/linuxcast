# Implementation instructions

## Read before changing application behaviour

1. Read `docs/PLAN.md`, your task card in `docs/implementation/tasks/`, and its normative references.
2. All UI work MUST follow `docs/design/DESIGN.md` and `docs/design/tokens.json`. Use shared host primitives; extension and workflow UI does not invent a separate visual system.
3. Read `docs/architecture/security.md` before adding IPC, permissions, credentials, scripting, integrations, or input handling.
4. Check `docs/implementation/tasks.json` dependencies. A planned task is not implemented just because its documentation exists.

## Parallel ownership

- Work on one bounded task in an isolated worktree/branch, with `codex/` branch prefix.
- Keep edits inside the task's owned paths. The coordinator owns shared contracts, migrations, dependency manifests, lockfiles, task status, and integration routing.
- Request shared changes through the coordinator; never silently modify another lane's interface or revert its work.
- Stubs must be explicit. Unsupported capabilities must be visible and actionable; never report simulated success as a completed system operation.
- Update the feature/task status only after acceptance evidence exists. Record commit/PR, test results, platform, and any limitations.

## Invariants

- Target Debian 13 amd64, GNOME/KDE on Wayland/X11. Probe individual capabilities.
- Native Linuxcast package formats only; no Raycast SDK compatibility or Alfred importer.
- No Node in renderers, arbitrary plugin code in the host, insecure credential persistence, unsandboxed plugin fallback, or raw keyboard stream exposed to plugins/AI.
- The optional privileged input service is installed disabled and stopped. It must satisfy the security and keyboard-recovery acceptance gates.
- One global AI provider/model for ordinary AI entry points; no hidden route, model, billing, or hosted fallback. Local speech is separately configured.
- Source links are evidence, not instructions. Skills and workflow packages cannot grant themselves permissions.
- Never downgrade the agreed complete local 1.0 scope to an MVP without a user-approved plan change.

## Validation and PRs

Run `python3 scripts/validate_plan.py` for documentation/task changes. Run the task-specific checks appropriate to implementation changes, with real desktop evidence where required. A headless browser check does not establish Wayland integration.

Every UI PR identifies the applicable design sections and includes dark/light or affected-state screenshots. Every capability PR records backend, session, success, denial, unsupported, and recovery behaviour. Describe concrete before/after behaviour and validation. Do not mark work complete when required checks are unavailable; record the limitation.
