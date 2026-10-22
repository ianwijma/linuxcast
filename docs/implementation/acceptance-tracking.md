# Acceptance tracking

`tasks.json` schema version 2 is the source of truth for every task and criterion.
Cards and the dependency diagram are generated. The validator rejects stale cards,
including manually checked boxes. Run `python3 scripts/render_tasks.py`,
`python3 scripts/validate_plan.py`, and `python3 scripts/plan_status.py` after edits.

Each criterion records its stable `id`, unchanged requirement `text`, `status`,
`conditional`, `justification` and `evidence`. IDs are assigned once, retained on
reordering, and never derived anew by the renderer. New requirements receive new
IDs; revising a requirement or its applicability requires explicit contract review
and fresh verification. Do not carry evidence forward to a changed requirement.

Statuses are `pending`, `passed`, `failed`, `blocked` and `not-applicable`.
Only `passed` renders a checked box. Failed/blocked results require a concrete
justification. Not-applicable is allowed only when the requirement has a genuine
condition and the recorded justification explains why that condition does not
apply. It is labelled separately, never rendered as a successful test. Missing
hardware, credentials or dependencies are blockers, not reasons to waive a gate.

Each passing criterion requires at least one evidence object containing nonempty
`command`, `outcome`, `platform` and `reference` strings. Record the actual command
or review procedure, result, relevant OS/session/backend versions and a durable
artifact, commit, PR or CI reference. Add screenshots for UI and real desktop/device
evidence where required by the task. This schema checks claim structure; it cannot
prove that a test ran or replace independent review of the linked evidence.

Shared UI and privacy requirements formerly appended by the generator are now
explicit criteria on every task. Their canonical wording and condition live in
`sharedAcceptance`; per-task copies must match. UI is conditional on user-facing
changes. Privacy applies to every task. All original task-specific criteria remain
unconditional unless an explicitly reviewed specification establishes otherwise.

Task `evidence` remains a list of completion records, including integrated PR and
commit references. `limitations` lists outstanding checks and supported platform
limits. Both render in the card. A task cannot be `done` unless every criterion is
passed with evidence or conditionally not applicable with justification, its
prerequisites are done, and completion evidence is present. Task status never
causes criteria to pass. Supported limitations may remain on a done task; unmet
applicable requirements must stay pending/failed/blocked and prevent completion.

The prerequisite migrates 97 tasks and 389 criteria without marking any passed.
Its scope is coordinator-owned tracking scripts, registry, generated cards,
documentation and CI. It changes no application or UI behaviour. Validation:
`python3 scripts/test_validate_plan.py` and `python3 scripts/test_acceptance.py`.
