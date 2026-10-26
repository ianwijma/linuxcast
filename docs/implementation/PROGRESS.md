# Coordinator checkpoint

Updated 27 October 2026. **Goal ACTIVE**: implement all 97 agreed local 1.0 tasks through R1-03 and every applicable release gate. Read `/home/ian/.codex/attachments/78a55eec-f708-4e08-b951-d8db53af7f4f/goal-objective.md` before continuing. An increment does not complete this goal.

## User instructions

- **Every subagent must use GPT-6.1 SOL / high reasoning.** Reuse the existing SOL agents below. Never reactivate older Astra agents. Any new agent requires model `gpt-6.1-sol`, effort `high`, fork `none` and a complete bounded assignment.
- Merge small reviewed/tested application increments promptly; explicitly record unfinished UI, desktop and release acceptance. No more infrastructure/research/proof work for manifest_review. Do not ask the user to choose tasks.
- User approved unfinished increments, preserving complete scope, security, requested GitHub reviews, dependencies and release gates. No physical-input/device authorization; only owned private Xvfb displays.
- Preserve normal 1Password Git signing. User unlocked it; signing works and sometimes needs a few seconds. Poll live handles before assuming a signing failure.

## Current integration

Primary checkout `/home/ian/Projects/ianwijma/linuxcast` is clean develop **7687f9866afa3a4d583daec6fef5b1e4ba3e07d2**, merged [PR40](https://github.com/ianwijma/linuxcast/pull/40), literal Quicklinks. Frozen install and desktop build (63 renderer assets) passed. PR39 Desktop Actions and earlier application increments are integrated; historical evidence is in tasks.json/cards, package READMEs and Git.

Coordinator worktree `.worktrees/linuxcast-application-controls`, branch **codex/quicklinks-web-search-flow** from7687f98. Current bounded **L2-05 saved web searches** is implemented and locally verified, awaiting final evidence commit/PR/CI/merge. Source head **a13da1a** integrates signed author4d40479. Frozen contractb9a1130; pure parser/buildercc214b7(author9c009e9); repository843e02a(authora11115a); main/preload/owner2c2501c. Shared focus/repeat/IME/footer fixes b9a1130/128b48d/0a084c4/453f194. Read `packages/builtins/quicklinks/WEB-SEARCHES.md` for exact frozen bounds.

Users create/edit a named web search, enter a query, review the encoded target, and explicitly Open search through existing GIO. Main fresh-loads stored identity/config and derives the URL; renderer supplies no URL authority. Queries/expanded targets never persist. Unknown operations retain no-replay gates and explicit Reload recovery. Only the configured query component changes; fixed vars.query snapshots are scalar, bounded and never recursively evaluated. Shared held-Enter guard prevents Review→Open approval; IME composition remains native. Long 200%-text footer now remains inside the shell.

Validation on Node24.22.1/Bun1.4.4/Electron45/SQLite3.53.4/GIO2.72.4:

- PASS157 mapped units (90 presentation,3 routing,39 templates,25 builder),10 contracts,27 main/preload security,29 integration (20 domain SQLite,8 owner/client,1 actual production app).
- Actual production flow passed5.58s on owned private Xvfb X11/private XDG/browser-handler: literal CRUD plus saved search creation, Unicode/metacharacter query, exact preview, focused held-Enter refusal, explicit real process argv/empty stdin, Hide/reopen, usage clear, complete restart, retained definition/empty fresh query, query/base/target-free aggregate export. Only native-dialog choices instrumented. Six affected actual dark/light Form/List/Review captures inspected; axe passed. Durations are smoke observations, not performance acceptance.
- Author90presentation/25Chromium keyboard+axe cases passed, including final footer geometry/capture regression; final source/200%-text visual review by alias_review_sol clean at a13da1a. Root final integrated browser run also passed all25cases in23.5s.
- Regressions43F2-01storage,70L1-01main/preload and11D1-02shared UI passed. Real version6→7 consistent snapshot/reopen, clear preservation and literal/search conversion passed. Full typecheck/lint/plan/diff pass.

L2-05 stays **in-progress**: AC01/AC02/UI pending; privacy passed with extended query-free actual evidence. Full snapshot context acquisition, cursor/missing/recursive remediation, snippet inclusion, other typed components/arguments, browser/open-with/file/registered URI, tags/pin/hide/export, prerequisites/nativeAT/session/release requirements remain mandatory. Review pending final evidence/PR state before merge. No PR existed at initial audit; develop unprotected, no open PRs then. Do not assume current CI/reviews without checking.

## Agent ownership

All are existing **GPT-6.1 SOL/high**:

- `manifest_review_sol`: `.worktrees/linuxcast-l1-01`, branchcodex/l2-05-web-search-ui, clean signed4d40479. Bounded concrete UI done; no infrastructure/research/proof reassignment.
- `file_search_service_sol`: `.worktrees/linuxcast-l1-02-native`, branchcodex/l2-05-web-search-domain, clean authora11115a. Domain commits9c009e9/a11115a integrated.
- `alias_review_sol`: read-only independent review; final source/200% visual clean at coordinatora13da1a. Final production/evidence reconciliation remains to request.

After this increment is merged, select the next bounded application work without asking. W1-01 is the sole fully dependency-ready task (F0-01/F2-01 done). W2-01 accessible workflow editor can pair with W1-01 graph validation under the approved unfinished UI prerequisite increment policy, using existing contracts/shell/storage/shared UI. Read full cards and workflow/security/design references, freeze a small usable editing interface, then delegate disjoint owned paths. No next-task implementation is underway yet.

## Complete scope and acceptance

Registry: **8done/13in-progress/76planned;51passed/330pending/8not-applicable**. Never infer task acceptance from documentation or an integrated slice. Render cards from tasks.json and run validate_plan/plan_status after registry changes.

F2-02 core credentials/data controls and Local data clear/export are integrated (PR25); credential setup/status/diagnostics host UI, provider/package/nativeAT/release acceptance remain. L1-01/L1-02/D1-02 shell/registered commands/pins/aliases/visibility/applications/DesktopActions are increments; providers/fallback/permission administration/history/full typed launch/native/session acceptance remain. L2-01/02 indexed metadata search/filter/sort/folder navigation and L2-03 Copy path are integrated increments; MIME/recent/extractors, ordered multi-file buffer/full typed actions/preview/cache still required. L2-04 arithmetic/92 units/sRGB colours are integrated; calendar/timezones/DST/rates/cache and native acceptance remain. All remaining task-card scope, R1-01/R1-02/R1-03 and release artifacts remain required.

## Runtime and checks

Use `export PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH` and `BUN_TMPDIR=/tmp`. Node24.22.1/Bun1.4.4/Rust1.95 are pinned; do not use older system binaries. Normal sandbox escalation is required for Bun temporary/network/socket work, Git metadata/sign/push and isolated actual app checks. Preserve signing configuration.

Mapped suite runner validates all mapped file paths. Map files only once they exist. Targeted Vitest uses `LINUXCAST_TEST_FILES='["path"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`. Actual app uses `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a bun run test:integration -- L2-05`. Serialize actual production tests sharing dist. Do not use --no-sandbox or the user's display.

Prior native lab is historical, no new VM/device/proof work scheduled. Private lab `.worktrees/private-lab` remains private; last recorded container stopped24October11:36UTC. S0-01 native resident-close/AT and all four Debian GNOME/KDE Wayland/X11 session gates remain outstanding. Chromium/private-Xvfb evidence does not satisfy them. Skill-library gateway/frontend-design instructions read; canonical repo DESIGN/tokens take precedence. Query service unavailable, local catalog read; no new external dependency added.
