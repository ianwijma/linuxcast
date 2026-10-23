# Contributing

This repository currently contains the research and implementation handoff, not application code. Begin at [the roadmap](docs/implementation/ROADMAP.md).

## Task lifecycle

Tasks use `planned`, `in-progress`, `blocked`, and `done`. Dependencies must be `done` before integration; mocked development may begin earlier only when the task card explicitly permits it and the contract is frozen. The coordinator records an owner and branch before concurrent work starts. A blocked task records its concrete blocker, not a vague progress note.

Each task is intended for a bounded implementation run. If a card cannot be completed within a focused PR, split it before implementation while preserving feature coverage and acceptance checks. Do not replace specific requirements with a generic TODO.

Use `codex/<task-id>-<description>` branches and isolated worktrees. Shared contracts, migrations, manifests, lockfiles, and task-state updates have one coordinator owner. Prefer additive, reviewed contract changes; refresh dependent fixtures in the same integration change.

## Ready and done

Ready means dependencies are satisfied, referenced contracts exist, and ownership is unambiguous. Done means the card's acceptance checks pass, its PR is integrated, and the coordinator records evidence in `tasks.json`. A completed document is not evidence that its application feature works.

Every PR must explain the behaviour, relevant feature IDs, design references, tests, and remaining limitations. Use the [PR template](.github/pull_request_template.md). Never include keys, captured private content, or raw input logs in screenshots or fixtures.

## Checks

```sh
python3 scripts/validate_plan.py
python3 scripts/plan_status.py
```

The validator checks local documentation links/anchors, source/feature/task IDs, references, feature coverage, task graph cycles, design-token structure, and SVG syntax. It does not claim that external websites remain available or that application behaviour has been tested. Implementation commands listed in cards become real checks during the foundation tasks; those tasks must wire stable command names before dependent tasks start.

Contributions are licensed under GPL-3.0-only. Record third-party licences and asset provenance before adding dependencies or datasets.
