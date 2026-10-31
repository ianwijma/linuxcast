# Local workflow draft editor — bounded W2-01 increment

`WorkflowEditor({api})` renders a real controlled React Flow canvas over the
application-owned graph and three-node registry. The host supplies the sandboxed
workspace, appearance and named persistence/navigation API. This component has
no execution, clipboard, file, network or permission-grant API. Run is visibly
disabled with remediation; Copy text is only a graph declaration.

A new workflow has one recoverable draft. The seven searchable palette categories
show Keyword, Transform text and Copy text; missing categories explain their
availability. Shared Button, TextField and state primitives, Inter fonts and the
existing light/dark tokens are reused. Semantic labelled select/checkbox controls
complete the inspector and connection chooser. The structured node/connection
lists provide add, select, configure, connect, disconnect and delete without
any dragging. Ports identify their type. Invalid connections retain safe feedback
through background autosave. Deleting a node removes its edges and layout;
removing the final Copy node removes the clipboard declaration. Source/text
bindings stay explicitly fixed to input#/0, with paste off/history excluded.

Graph/name/layout edits debounce for 500ms. Writes are serialized and exact
compare-and-set receipts must match revision+1, draft and saved snapshot; object
member order is immaterial, while arrays/values remain exact. Newer edits stay
dirty until their own receipt. Invalid node configuration can remain a recoverable
draft but cannot replace the explicitly saved valid version. Save validates with
the same real graph validator/registry used by main; Revert verifies the exact
prior saved graph (or new empty draft), after dirty confirmation. Undo/redo
restores graph/layout snapshots without reverting owner revisions or effects.

Unknown/conflicting/malformed/timed-out writes stop autosave and retain editable
local state. Explicit Reload confirms dirty replacement and only clears recovery
after an authoritative complete read. Known failures offer deliberate Retry draft
or Save. No automatic replay or optimistic saved toast occurs. Close and
onCloseRequested share the same final-draft flush path; the listener returns true
only after a successful named close request. Failed flush/close retains the draft
and offers keep editing, retry or confirmed discard/navigation. Discard does not
claim to cancel an earlier owner write. Disposal fences all late presentation.

Design: DESIGN.md Shell/navigation, Results/actions, List/Grid/Detail/Form,
Workflows, States/motion, Accessibility and Review gate. CSS adapts workspace
layout and React Flow chrome using shared tokens; it adds no visual system.

## Verification

Node24.22.1, Bun1.4.4, Linux x86_64; actual installed React Flow12.12.0 and real
graph validator dd5dc01. The owner in fixtures is labelled public synthetic
in-memory data, never claimed as SQLite, native close or execution evidence.

- 22 controller cases: registry configuration, raw cycles/ports, declaration and
  edge deletion, graph/layout undo, debounce/serialization/newer edits, exact
  receipts and reordered keys, unknown/denied/deadline/dispose, Save/Revert and
  close-flush outcomes.
- 13 Chromium cases: keyboard add/configure/connect/delete/undo, local palette,
  dark/light empty/editing/invalid-connection/write-error states, explicit dirty
  confirmation and focus restoration, native-close callback observation, failed
  flush/discard, and 200% text without document overflow. Axe passes affected
  states. Nine public screenshots in evidence/ were inspected.
- Full typecheck, scoped ESLint, plan validation and diff checks are run before
  the owned commit. Coordinator-owned task mapping/native integration is separate.

Commands (prefix PATH with `.worktrees/tools`, set BUN_TMPDIR=/tmp):

```sh
LINUXCAST_TEST_FILES='["apps/desktop/src/features/workflows/canvas/tests/controller.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts
LINUXCAST_TEST_FILES='["apps/desktop/src/features/workflows/canvas/tests/editor.ui.test.ts"]' node node_modules/@playwright/test/cli.js test --config scripts/test-runner/playwright.config.ts
bun run typecheck
node node_modules/eslint/bin/eslint.js apps/desktop/src/features/workflows/canvas --max-warnings 0
python3 scripts/validate_plan.py
```

Coordinator integration now passes the mapped W2-01 suites: 24 units (22
controller and two Quit-preflight), five contracts, 15 main/preload security,
eight integration and 13 Chromium cases. The actual production Electron45 /
SQLite3.53.4 flow uses private XDG/profile directories and an owned Xvfb X11
display. It opens the registered editor, adds/connects/saves three nodes, flushes
an immediate edit on native Close, reopens/restarts with recovered draft and
prior saved version, then flushes another edit on application Quit. No storage,
editor or execution mock is involved. Version7→8 recovery snapshots, stale CAS,
invalid/oversized Save rollback and clear preservation pass. Aggregate export
contains no workflow names/content. Two actual dark/light captures in
`apps/desktop/evidence/workflow-editor-application-*-saved.png` were inspected;
axe passes. These are process/persistence observations, not native-session or
assistive-technology acceptance. Execution remains unavailable.

Partial W2-01-AC01 evidence covers the bounded three-node non-drag path; partial
AC02 covers inert layout and graph undo. UI/privacy evidence uses shared controls
and public fixtures, with no content in diagnostics or execution calls. No whole
criterion/task acceptance is claimed. Root owns actual packaged launch/edit/save/
close/reopen/restart/SQLite evidence. Full palette, multiple workflows, packages,
settings/bindings/notes/copy-paste, execution/debugger and all ten examples remain
required. Supported GNOME/KDE Wayland/X11, physical-device, assistive-technology,
high-contrast/native text scaling and release acceptance remain pending, as do
broader D1-02/L1 prerequisites. The complete local1.0 scope is unchanged.

## Saved text-run integration

The production workspace now supplies the named WorkflowRunApi and enables Run
for its last explicitly saved version. Save notices no longer claim execution
is unavailable; Copy inspector explains the separate approval step. The optional
component fixture without a run API continues to show explicit unavailable state.
See ../debugger/README.md and desktop/evidence/workflow-run-application.md for
actual worker/clipboard evidence and unfinished full-scope acceptance.

## Instrument presentation refresh (existing UI, no new features)

The existing workspace now uses the selected Instrument composition (DESIGN.md: Workflows, Shell and
navigation, Results and actions, Controls/keycaps/line icons, List/grid/detail/form, States and motion,
Accessibility) with shared `Button`, `TextField`, `GlyphTile`, `LineIcon`, `GroupCaption`, `StatePlate`
and state primitives; `editor.css` uses semantic tokens only. Controller, registry, graph, storage,
run and permission semantics are unchanged.

- **Header**: workflow tile, `Workflow editor` title, bounded workflow name and the existing quiet save
  status. Keycaps appear only where the editor actually binds them: Save `Ctrl` `S`, Close `Escape`
  (Run, Revert, Reload, Undo and Redo carry none). Header is in normal flow, never sticky.
- **Palette (240)**: flush captions with live counts per category; rows with a closed-vocabulary tile
  (Keyword `command`, Transform `system`, Copy `clipboard`), name, description and `+` verb. Name stays
  "Add …" for assistive technology. Empty categories show the dotted (not-yet-available) or filtered
  shape with the existing copy. A scoped grid replaces the shared Row here so a 240 px sidebar never
  overflows (the shared Row's `12em` text basis does; see shared requests).
- **Canvas**: controlled React Flow 12.12 on `canvas` with a 16-unit `canvasDot` grid in flow
  coordinates; 208 px `raised` node cards (tile, uppercase category, title, one configuration line,
  typed port line). Nodes are `role="button"` with `aria-pressed` and are named from their visible text;
  the selected node uses `selection` plus the rail. Edges use `controlBorder`. Positions/viewport remain
  presentation only. With no nodes the canvas shows an empty plate.
- **Structured path** stays directly under the canvas: numbered node rows (tile, `label · id`, category,
  "in … from … · out … to …", `aria-pressed`, rail) and the unchanged connection chooser/edge list.
- **Inspector (300)**: tile + name, ID/Type/Input/Output/Declared effects facts ("clipboard.write ·
  declaration only, not a grant"), then the unchanged configuration controls and Delete node last.
- **Notices** keep their single `alert` region each. Fixed controller copy is classified only by exact
  string: Save/Revert receipts (after exact CAS) are a neutral notice, never a success plate; validator
  rejections are error bands; write/load/close uncertainty is the unclassified unavailable band.
- **Layout**: panels share hairline separators and wrap (rather than overflow) for narrow windows and
  200% text; forced colors map selection to `Highlight` outline/rail and the pane to `Canvas`.

Verification (Linux amd64, Node 24.22.1, Bun 1.4.4, Chromium via Playwright; pinned tools PATH):
`bun run test:ui -- W2-01` 19 passed (13 existing unchanged plus 6 new: node keyboard selection
persistence and visible-text names, bound-only shortcuts and Ctrl+S receipt classification, 240 px palette
/inspector geometry at 1440/1000@200%/600, dark/light forced colors + reduced motion, 200% focused row).
`test:unit -- W2-01` 24, `test:contracts -- W2-01` 5, `test:security -- W2-01` 15 passed. Actual Electron
`apps/desktop/tests/workflow-editor.integration.test.ts` passed on owned private Xvfb (captures in
`apps/desktop/evidence/instrument-workflows/`). Captures: `evidence/instrument/README.md`.

Limitations and shared requests (coordinator-owned):

1. Stored node spacing (`controller.add`: x step 240 flow units) ignores text scaling, while card width
   follows rem tokens, so cards overlap on the canvas at 200% text. Request: derive placement from measured
   card size or provide a non-overlapping layout helper. Ports stay left/right (not the design's
   top/bottom) because that controller layout is horizontal.
2. Shared `Row`: `.lc-row-text` `flex: 1 1 12em` overflows a 240 px sidebar at normal text. Request a
   sidebar/compact Row variant in D1-01; this lane uses a scoped palette grid meanwhile.
3. Typed edge labels and an invalid-edge rendering are omitted: the 32-unit gap between stored positions
   leaves no room, and the validator rejects invalid edges before they exist.
4. New cases live in the already-mapped `tests/editor.ui.test.ts`; no runner mapping change needed.
5. `packages/storage/tests/workflow-editor.integration.test.ts` (mapped integration W2-01) fails one
   version-7 migration case on the unchanged parent base (`StorageError invalid-request`); it imports no
   UI and is outside this lane.
