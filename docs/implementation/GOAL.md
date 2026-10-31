Implement Linuxcast’s complete agreed local 1.0 release, covering every

required task in docs/implementation/tasks.json and its corresponding

docs/implementation/tasks/.md file, through successful completion of

R1-03 and all documented release acceptance gates.

Act as the implementation coordinator. Execute the implementation rather

than producing another plan.

Continue across tasks and turns until the complete objective is achieved.

Finishing one task, opening or merging a PR, or reaching an intermediate

milestone does not complete this Goal.

IMPORTANT

Any subagent used must be GPT-6.1 SOL on high.

AUTHORIZATION AND BOUNDARIES

You are authorized to create isolated worktrees and codex/ branches,

implement changes, install project dependencies, run checks, push commits,

open implementation PRs, and merge them into develop after the required

acceptance checks, CI, and reviews pass.

Respect branch protections, required approvals, environment permissions,

and the repository’s security and release requirements. Do not bypass them.

Make routine implementation decisions within the approved specifications.

Do not repeatedly ask permission for work already authorized here.

Ask when a necessary external permission, credential, irreversible action

outside this scope, or material scope decision requires my involvement.

INITIALIZE

1. Read:
  - AGENTS.md
  - docs/PLAN.md
  - docs/implementation/ROADMAP.md
  - docs/implementation/tasks.json
  - docs/implementation/testing-release.md
  - docs/architecture/overview.md
  - docs/architecture/stack.md
  - docs/architecture/security.md
  - docs/design/DESIGN.md
  - docs/design/tokens.json
2. Fetch the latest develop branch. Inspect existing code, task evidence,
2. open PRs, branches, and worktrees. Resume useful existing work without
2. duplicating completed implementation or overwriting unrelated changes.
3. Run:
  - python3 scripts/validate_plan.py
  - python3 scripts/plan_status.py
4. Treat tasks.json as the authoritative registry for dependencies,
4. ownership, status, and evidence. Treat each task card and its normative
4. references as the detailed implementation and acceptance contract.

ACCEPTANCE TRACKING PREREQUISITE

Inspect the current tracking tools first. If individual acceptance

completion is not already supported, implement this coordinator-owned

prerequisite before application feature work:

- Give each acceptance criterion a stable ID, verification status, and
- supporting evidence in tasks.json.
- Include the shared acceptance criteria currently added by the generator.
- Preserve existing requirement wording, task dependencies, and evidence.
- Support pending, passed, failed, and blocked criteria. Permit an explicit
- not-applicable result only for genuinely conditional requirements, with
- a recorded justification.
- Render verified criteria as checked in
- docs/implementation/tasks/.md. Keep outstanding criteria unchecked.
- Display justified not-applicable results distinctly from successful tests.
- Render actual completion evidence and outstanding limitations in cards.
- Require evidence for passed criteria. Prevent a task from being marked
- done while applicable acceptance requirements remain outstanding.
- Never infer individual acceptance success from the overall task status.
- Add meaningful validator/generator tests, including regeneration preserving
- verification state and rejection of unsupported completion claims.
- Keep tasks.json as the source of truth. Modify the registry and generator;
- never manually maintain generated task cards. Review and integrate this
- prerequisite through its own focused PR.

TASK EXECUTION CONTRACT

Before implementing any task:

- Read its complete docs/implementation/tasks/.md file.
- Read its linked normative references and applicable design sections.
- Verify prerequisites against actual implementation, integration, and
- acceptance evidence; a status label alone is not proof.
- Follow its goal, scope, owned paths, inputs and outputs, implementation
- steps, acceptance criteria, validation commands, and evidence requirements.
- Resolve conflicts between the registry, task card, and specifications
- explicitly. Do not silently weaken requirements or expand ownership.
- Every subagent assignment must include:
- Exact task ID and task-card path.
- Required normative references.
- Owned paths and shared-file restrictions.
- Dependency assumptions and required acceptance evidence.
- Its isolated worktree and branch.
- Require each implementation report to map results to the task’s acceptance
- criteria and identify outstanding checks or limitations.

EXECUTION AND PARALLELISM

1. Identify unfinished dependency-ready tasks automatically.
2. Start with F1-01 if unfinished, then follow the roadmap’s feasibility
2. tasks, shared-contract freeze, feature implementation, and release gates.
3. Delegate independent tasks to subagents where this improves progress.
3. Use separate worktrees and codex/ branches with disjoint path ownership.
4. Keep shared contracts, manifests, lockfiles, migrations, integration
4. routing, and registry updates under coordinator ownership.
5. Serialize overlapping changes. Feature agents propose shared-interface
5. changes to the coordinator instead of modifying another lane’s contracts.
6. Integrate accepted prerequisite work before claiming dependent tasks done.
6. Frozen-contract mocks may support development but do not prove acceptance.
7. After each integration, refresh task status and immediately select the
7. next ready work. Do not ask me which task to implement next.

IMPLEMENTATION REQUIREMENTS

- Preserve the complete agreed local 1.0 scope; do not substitute an MVP.
- Follow the canonical design system throughout, including shared primitives,
- keyboard interaction, accessibility, and affected light/dark states.
- Preserve the approved Debian platform, architecture, native package formats,
- provider configuration, and security boundaries.
- Keep unsupported capabilities visible and actionable.
- Never report simulated system operations as successful real operations.
- Never introduce insecure credential storage, unsandboxed plugin fallbacks,
- arbitrary plugin execution in the host, or raw keyboard streams exposed
- to plugins or AI.
- Follow all privileged-input consent, installation, recovery, and validation
- requirements. Do not enable the service implicitly.
- Do not rewrite acceptance criteria merely to make an implementation pass.

VALIDATION AND PR REVIEW LOOP

For each bounded task:

1. Implement the task and its meaningful task-specific checks.
2. Run the validation commands required by the card and relevant integration,
2. security, UI, performance, and platform checks.
3. Distinguish unit tests and mocks from real Debian desktop evidence.
3. A headless browser run does not establish Wayland integration.
4. Obtain independent review against the task card and normative references.
4. Address actionable findings and verify the final changes.
5. Open a focused PR identifying the task ID, task-card path, concrete
5. behaviour, acceptance evidence, and remaining limitations.
6. Inspect configured/requested GitHub reviews and review bots. Wait for
6. their completion, address actionable feedback, and obtain required
6. re-review and approvals. Internal review does not replace required
6. GitHub approvals. Do not invent a reviewer requirement if none exists.
7. Ensure checks and applicable reviews cover the current PR changes.
7. Do not merge merely because CI is green.
8. Merge into develop only when the task’s required checks, acceptance,
8. review, and repository integration requirements are satisfied.
9. Record integrated commit/PR references and accurate acceptance evidence.
9. Regenerate cards, validate the plan, and refresh dependency readiness.
9. While a PR awaits review or CI, continue other dependency-ready work.
9. Use bounded waits and avoid repeatedly polling unchanged state.

PROGRESS AND CONTINUITY

- Maintain accurate task and criterion status in tasks.json.
- Record evidence with commands, outcomes, relevant platform/backend versions,
- artifact references, screenshots where required, and limitations.
- Run after registry changes:
  - python3 scripts/render_tasks.py
  - python3 scripts/validate_plan.py
  - python3 scripts/plan_status.py
- Keep a concise coordinator checkpoint in
- docs/implementation/PROGRESS.md with active task IDs, worktrees, branches,
- PRs, outstanding reviews, blockers, and next ready actions.
- Update durable progress before context compaction or interruption.
- After resuming, read that checkpoint, the registry, and active task cards,
- then verify current repository and PR state before continuing.
- Provide concise progress updates without treating them as completion.

BLOCKERS

If one task is blocked:

- Record the exact blocker and affected acceptance requirement.
- Attempt reasonable remedies within the approved scope.
- Continue independent work while the blocker remains.
- Request only the specific input or access needed to unblock progress.
- Unavailable required checks remain outstanding. Never convert them into
- passes, hide them behind successful stubs, or claim the Goal is complete.
- Keep the Goal active while useful authorized work remains. If no valid
- progress remains possible, report the concrete blockers and what would
- unlock them, following the Goal system’s lifecycle rules.

FINAL COMPLETION

Complete R1-01, R1-02, and R1-03 only after their prerequisites and required

evidence are satisfied. Validate the documented desktop/session matrix,

security and recovery behaviour, accessibility, performance, and package

installation, upgrade, uninstall, and data recovery.

Produce the release artifacts required by R1-03, including the Debian

package, checksums, SBOM, licence information, release notes, capability

matrix, and upgrade instructions. Follow the repository’s publication

requirements.

Mark the persistent Goal complete only when:

- Every required implementation task is integrated.
- Every applicable task-card acceptance criterion has supporting evidence.
- All documented 1.0 release gates pass.
- Required release artifacts and publication steps are complete.
- The registry, generated cards, and progress records reflect reality.
- Finish with a concise release summary, artifact and PR links, validation
- evidence, and any explicitly supported platform limitations.
