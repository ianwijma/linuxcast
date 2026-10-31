# Existing UI refresh priority — 1 November 2026

The user selected Opus **Instrument** for all seven surfaces in merged PR84 and
now prioritizes updating existing UI. This supersedes the earlier hybrid idea.
Every UI design/implementation/update assignment uses **Claude Opus 5.5, medium**
(`claudeAgent`, `claude-opus-5-5`, `effort: medium`). Non-UI subagents use
GPT-6.1 SOL with high reasoning. Full agreed local1.0 scope is preserved.

The selected proposal at `docs/design/proposals/raycast-refresh/opus/` is the
adoption source. The coordinator migrates canonical DESIGN.md/tokens together,
reviews shared interfaces and integrations, and records actual evidence. Proposed
screenshots and old appearance checks do not establish implemented adoption.

## Current adoption checkpoints

These are bounded implementation checkpoints, not completed task or native UI
acceptance. The approved develop checkpoint is PR89 merge
`63c958115d3efec4505efad12f3898aa0003bb93`.

| Surface | Implementation state | Evidence and remaining work |
| --- | --- | --- |
| Shared tokens and primitives (D1-01) | Merged in [PR87](https://github.com/ianwijma/linuxcast/pull/87), `031f78e` | Instrument tokens, controls, rows, tiles and state plates; validator parity and malformed-key regressions passed independent review. Product adoption and native/AT acceptance remain separate gates. |
| Local data (F2-02) | Merged in [PR88](https://github.com/ianwijma/linuxcast/pull/88), `e2b3a5a` | Sidebar, captured-action bands and measured sticky-band focus clearance; 12 affected-state product captures. Both independent reviews passed. Native dialogs are instrumented and supported desktop/Orca proof remains pending. |
| Credentials (F2-02) | Merged in [PR89](https://github.com/ianwijma/linuxcast/pull/89), `63c9581` | Explicit storage radios, qualified local status and truthful cancellation; 9 captures, 86 unit/3 contract/145 security checks and two Electron flows. Initial reviews' cancellation finding was corrected and coordinator-verified. Native observer/keyring/provider and supported session/AT proof remain pending. |
| Shared renderer and launcher (D1-02/F1-02/L1-01) | Merged in [PR91](https://github.com/ianwijma/linuxcast/pull/91), `432fa6a` | Current 30 renderer browser cases, 28 D1 units and both shell Electron flows pass. Four review corrections cover 200% split overflow, regrouped-action focus loss, list Left routing and modified grid jumps; six regressions fail the prior source and pass fixed. Fresh independent final recheck passes both axes; current 323 L1 units/55 F1 and177 L1 security checks also pass. Native acceptance remains pending. |
| Saved permissions (F3-01) | Merged in [PR90](https://github.com/ianwijma/linuxcast/pull/90), `f7ed86e` | Existing broker/controller/opaque snapshot authority is unchanged. Coordinator mapped the 8 new component cases: 83 units/2 contracts/72 security checks and two Electron flows (24.42s) pass. The 21 captures remain author-identical; both independent reviews passed without actionable findings. Native AC02/UI acceptance remains pending. |
| Files, builtin details/forms/grid | Shared-frame adoption is included in the pending D1 increment | Downstream role/action/keyboard regressions support the shared change. Inspect any remaining feature-specific workspace composition after D1 merges; do not infer native acceptance or a complete feature from those fixtures. |
| Notes (U1-01) | Merged [PR93](https://github.com/ianwijma/linuxcast/pull/93), `279a3a4` | 482 units/36 contracts/258 security/101 browser/40 integrations pass,28 captures. Slash-menu scaling correction parent-verified with four original-source failures; native/task gates remain pending. |
| Workflows (W2-01/W2-03) | Opus source `0fa31fc` integrated and verified; ready for focused publication | Standards clear; sole Spec drag-frame P2 corrected and parent-verified with two original-source failures. Current48 browser cases,61 units,5 contracts,17 security and three actual app flows pass;39 captures. Native/task gates remain pending. |

Renderer, all three settings increments and Notes are merged. The workflow
composition is verified for focused publication, using Opus 5.5 medium. Do not
hold a reviewed UI increment for full native/task/release acceptance, and do not
use its merge to promote those outstanding gates. The detailed registry remains
authoritative for task and criterion verification.

The evidence below the priority table records the original pre-adoption audit;
its baseline implementation descriptions and timings are historical.

| Priority | Existing tasks and surfaces | Bounded result |
| --- | --- | --- |
| 1 | D1-01 tokens and host primitives | Promote selected roles/metrics, bind semantic CSS/Tailwind, controls/keycaps/state plates and shared row/glyph vocabulary; preserve APIs and add affected-state evidence. |
| 2 | D1-02, F1-02, L1-01 shared renderer/launcher | Hanging rows/captions, category tiles/selection rail, bottom action filter, status footer, list/detail separator and existing grid treatment; retain exact command/action/security semantics. |
| 3 | F2-02/F3-01 existing Local data, credentials and Saved permissions; L2-02 files | Adopt workspace/settings compositions and capability/recovery presentation using the merged shared foundation. Preserve credential/no-readback, confirmation, uncertainty and saved-permission boundaries. |
| 4 | U1-01 notes; W2-01/W2-03 workflows | Selected notes editing/recovery and workflow palette/canvas/inspector/debug structure, including keyboard/list alternatives and current persistence/cancellation behavior. |
| 5 | L2-03/04/05/06 existing builtin forms/details/grid | Complete remaining preview, calculator/rates, quicklink, dictionary and emoji views through the same primitives and renderer. |

Chat is selected for later AI implementation; do not manufacture a working chat
or provider flow to match a prototype. Update existing surfaces before adding new
feature UI. Keep PRs bounded, review/test current heads, merge promptly, and issue
the user's one- or two-sentence summary after each merge.

For each affected surface: compare against selected Instrument references;
validate dark/light opaque themes, loading/empty/error/denied/unavailable/recovery,
keyboard and focus restoration, 200% text/zoom and overflow, contrast, forced
colours and reduced motion using real implemented controls. Use actual Electron
captures for product changes. Browser/component checks remain distinct from
Debian GNOME/KDE Wayland/X11 and native AT acceptance. Do not preserve fixed-height
prototype clipping or copy simulated prototype success into product operations.

F1 native accessibility preparation remains saved on separate branches. Refresh
its source archive/build/checkpoints against the updated UI before any native
attempt; do not spend an attempt validating the superseded appearance. No lab
start or privileged input enablement is part of this reprioritization.

Tasks/criteria stay in their current verification states until new evidence is
recorded. Historical evidence remains traceable; no feature, privacy boundary,
provider-routing rule, supported platform or release gate is removed.

## Inspected implementation boundaries

Source audit at coordinatorb9fefd2 (prior application code, before Instrument):

| Surface | Actual existing entry/implementation | Consequence for rollout |
| --- | --- | --- |
| Launcher | apps/desktop/src/renderer/index.tsx → features/launcher/index.tsx → packages/ui/src/views/renderer.tsx | Shared renderer migration reaches launcher and its nested builtins. Root loading/error/size handling lives outside ViewRenderer and needs product regression coverage. |
| File search | apps/desktop/src/renderer/file-search.tsx → packages/builtins/file-search/src/index.tsx/controller.ts → ViewRenderer | List/detail changes affect the real indexed-file workspace, not only the launcher fixture. Folder leases, preview permission and Copy outcomes remain controller/main-owned. |
| Emoji/dictionary/calculator/quicklinks | Launcher-routed presenters produce existing validated ViewModels | Shared row/grid/action/form changes propagate here; keep selection, glyphs, drafts, explicit Copy/send and current action IDs. |
| Local data | apps/desktop/src/renderer/data-settings.tsx and data-settings.css | Uses shared controls but its category composition is separate from ViewRenderer. |
| Credentials and Saved permissions | packages/secrets/src/ui/ and packages/permissions/src/ui/ | Dedicated first-party APIs and isolated windows. Visual adoption must not introduce stored-key readback, optimistic key/policy success, arbitrary grant mutation or replay. |
| Notes | packages/notes/src/index.tsx/editor.tsx/styles.css | Separate editor/workspace composition; existing draft/import/export/delete/recovery behavior must survive adoption. |
| Workflows | apps/desktop/src/features/workflows/canvas/ and debugger/ | Separate canvas/list/inspector/debug composition; keep non-drag access, effect approval, unknown outcome and Quit preflight. |

The existing ViewModel wire is `packages/contracts/src/views.ts`. It currently
has strict item/action shapes and builtin/glyph/asset/file icon variants; there
is no glyph-category property. Any added wire field must be proposed to the
coordinator and validated, never smuggled as CSS/SVG/style. The next Opus lane
chooses presentation using the accepted shared primitives and frozen contracts.

The selected proposal differed from the audited baseline in more than
colour: its action filtering was above its list, grid used listbox/option
semantics, and detail resizing uses a range input. Instrument specifies the
bottom filter, grid/gridcell semantics and a focusable separator. These require
intentional keyboard/ARIA regression updates, not a blanket screenshot refresh.
Prototype-specific fake effects and always-disabled sample capability states must
not replace real product state. Future native AT checkpoints must follow the
implemented roles/names after review, without loosening native proof requirements.

Relevant existing mappings in scripts/test-runner/suites.json:

- D1-01: token unit checks and primitive Playwright fixtures.
- D1-02: session/form/loading units and shared-view Playwright fixtures.
- F1-02: actual shell and shell-accessibility Electron scenarios.
- F2-02: credential UI units/contracts and actual diagnostic/credential scenarios.
- F3-01: saved-permission contract/controller and actual permissions/workflow runs.
- L2-02/L2-06/U1-01/W2-01/W2-03: existing file/builtin/notes/workflow fixtures and
  real integration paths named by each task. Select affected checks per change;
  do not rerun unrelated suites merely to inflate coverage.

Coordinator executed D1-02's existing session/form/loading unit baseline before
renderer adoption:27/27pass on pinned Node24.22.1/Bun1.4.4 atb9fefd2. This is behavior preparation, not Instrument visual or native
acceptance. At that checkpoint the Opus D1-01 lane was the only UI implementation
writer, and renderer implementation waited for its shared API/token freeze.

The unchanged renderer browser baseline also passes: `bun run test:ui -- D1-02`,
11/11 tests in10.9s at290d7f0, Node24.22.1/Bun1.4.4/Playwright1.64.1. It covers
dark/light views, async selection, action filtering/focus/Enter, nested return,
grid arrows and disabled actions, draft and transient-secret cleanup, adversarial
Markdown/model denial, states,200% text, forced colours, reduced motion and IME
repeat guards. Incidental screenshot recaptures were restored to their exact Git
blobs; no historical evidence was replaced. This establishes the existing browser
behavior only, not Instrument appearance, native Electron or supported-session AT.

A separate geometry probe of the unchanged synthetic fixture (Chromium156.0.8078.4,
720×1200 viewport,100%/200% root text) confirms that existing list rows grow from
43.8–59.4px to85.6–148.0px and grid cells also grow, with no measured vertical
title/caption clipping. A long list title ellipsizes horizontally at200%; its
complete accessible label remains the existing contract. The fixture's outer
promotional header can push the shell/footer below the viewport, so its document
overflow assertion does not prove native window/footer visibility. Preserve
intrinsic row growth and add explicit implemented row-content/footer bounds in
the migration checks, using the actual product harness for window geometry.
