# Workflow editor — Instrument component captures (W2-01)

Selected Instrument composition of the existing editor (docs/design/DESIGN.md: Workflows, Shell and navigation,
Results and actions, Controls/keycaps/line icons, List/grid/detail/form, States and motion, Accessibility).
Captured by `canvas/tests/editor.ui.test.ts` in real Chromium against the component fixture: a labelled
**public synthetic in-memory owner**. These are component observations, not SQLite, Electron, native
session or assistive-technology evidence. The older `../*.png` captures are historical and unchanged.

| File | State (as actually implemented) |
| --- | --- |
| `dark-`/`light-workflow-empty.png` | No stored workflow: empty plate with explicit New workflow; Run unavailable; zero owner writes |
| `dark-`/`light-workflow-editing.png` | Keyword → Transform → Copy built by keyboard; selected Copy node with rail; inspector facts/declared effect; clipboard execution unavailable (fixture has no run API) |
| `dark-`/`light-workflow-invalid-connection.png` | Cycle rejected by the real validator: error band, no false edge |
| `dark-`/`light-workflow-write-error.png` | Unknown write outcome: unclassified band, Save disabled, autosave stopped, draft editable, empty-canvas plate |
| `dark-workflow-200-percent.png` | 200% root text at 1000 px: panels wrap; structured controls reachable |
| `dark-workflow-200-percent-focus.png` | 200% root text with keyboard focus on a structured node row |
| `dark-`/`light-workflow-forced-colors-focus.png` | Emulated forced colors + reduced motion: Highlight selection outline/rail, focused palette row, CanvasText typed label |
| `dark-workflow-canvas-labels-100-percent.png`, `dark-workflow-canvas-labels-200-percent.png` | UI-only text-size projection: default chain with typed `text` edge labels; no card/label intersection at 100% and 200% |

Canvas captures with nodes were regenerated after the projection/typed-label follow-up; at 200% a wide
chain can extend past the canvas viewport (reached by panning) but cards never overlap. Forced colors are Chromium emulation, not
a desktop high-contrast theme. axe runs on every non-forced state; forced-colour cases assert computed
system-colour outlines/borders instead (axe compares authored colours with the forced canvas).
