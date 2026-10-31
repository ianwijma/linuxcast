# Existing UI refresh priority — 1 November 2026

The user selected Opus **Instrument** for all seven surfaces in merged PR84 and
now prioritizes updating existing UI. This supersedes the earlier hybrid idea.
Every UI design/implementation/update assignment uses **Claude Opus 5.5, medium**
(`claudeAgent`, `claude-opus-5-5`, `effort: medium`). The general Goal model rule
continues for non-UI work. Full agreed local1.0 scope is preserved.

The selected proposal at `docs/design/proposals/raycast-refresh/opus/` is the
adoption source. The coordinator migrates canonical DESIGN.md/tokens together,
reviews shared interfaces and integrations, and records actual evidence. Proposed
screenshots and old appearance checks do not establish implemented adoption.

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

The selected proposal differs from the current implementation in more than
colour: current action filtering is above its list, grid uses listbox/option
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
acceptance. The current Opus D1-01 lane remains the only UI implementation writer;
renderer implementation waits for its shared API/token freeze.
