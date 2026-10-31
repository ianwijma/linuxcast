# Saved text-run panel — Instrument component captures (W2-03)

Selected Instrument workspace rhythm for the existing run panel (docs/design/DESIGN.md: Workflows, States and
motion, List/grid/detail/form, Controls, Accessibility). Captured by `debugger/tests/run-panel.ui.test.ts` in
real Chromium with reduced motion against **public synthetic host snapshots and request observers**. No
worker, permission broker, clipboard, SQLite or native operation runs; these are not effect evidence.
The older `../*.png` captures are historical and unchanged.

| File | State |
| --- | --- |
| `*-workflow-run-ready.png` | Mounted read-only; typing/newlines start nothing; no attached run |
| `*-workflow-run-approval.png` | Host waiting-ui: tintInfo approval header, exact proposed plain text, Cancel focused, no preselected choice |
| `*-workflow-run-result.png` | Host succeeded with completed effect receipt; bounded plain result |
| `*-workflow-run-denied.png` | Host failed/permission-denied: denied shape, Not dispatched, scoped review |
| `*-workflow-run-unknown.png` | Unknown outcome: interrupted band "Inspect your clipboard", no retry/replay, never success |
| `dark-workflow-run-200-percent.png` | 200% root text with long text: columns stack, no horizontal overflow |
| `*-workflow-run-forced-colors-focus.png` | Emulated forced colors: focused Cancel, bordered approval/status |
| `*-workflow-entry-selected.png`, `*-workflow-entry-unavailable.png`, `dark-workflow-entry-pending-intent.png` | Launcher entry intents: exact entry, unclassified unavailable with no fallback form, changed intent keeps pending approval |

Status glyph shapes follow the typed host snapshot only (`debugger/ui/presentation.ts`). Steps in the
fixture's terminal states are fixture-generated. axe runs on every non-forced state.
