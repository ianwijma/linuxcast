# Linuxcast

A planned Linux productivity launcher inspired by Raycast's client experience and Alfred's workflow system.

**Status: research and implementation planning. There is no runnable application yet.** The initial target is Debian 13 amd64, GNOME and KDE, on Wayland and X11. The implementation stack is Electron, React, TypeScript, Tailwind CSS, SQLite, and Rust desktop helpers.

Start with the [approved plan](docs/PLAN.md), [documentation index](docs/README.md), [implementation roadmap](docs/implementation/ROADMAP.md), and [design system](docs/design/DESIGN.md).

The 1.0 target includes a keyboard-first launcher, desktop utilities, native extensions, a visual workflow editor, notes, calendar, focus, OCR, local dictation, and configurable AI. Earlier milestones are alpha/beta releases, not a reduction of the agreed 1.0 scope. Cloud accounts, sync, enterprise administration, and compatibility with Raycast/Alfred packages are outside v1.

## Work on a task

Read [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md). Select an unblocked task from the [task registry](docs/implementation/tasks.json); its task card specifies dependencies, owned paths, contracts, design references, and acceptance checks. Application work must follow the linked specifications.

```sh
python3 scripts/validate_plan.py
python3 scripts/plan_status.py
```

These commands validate and inspect the planning artifacts. Application test commands in task cards describe checks to introduce during implementation, not tests that already exist.

## Licence and attribution

Linuxcast-authored material is GPL-3.0-only unless an individual file states otherwise. See [LICENSE](LICENSE). Raycast, Alfred, and other names identify research sources and remain their owners' trademarks. Linuxcast is independent and does not include their proprietary application code, logos, or extension packages.
