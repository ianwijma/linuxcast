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

Partial W2-01-AC01 evidence covers the bounded three-node non-drag path; partial
AC02 covers inert layout and graph undo. UI/privacy evidence uses shared controls
and public fixtures, with no content in diagnostics or execution calls. No whole
criterion/task acceptance is claimed. Root owns actual packaged launch/edit/save/
close/reopen/restart/SQLite evidence. Full palette, multiple workflows, packages,
settings/bindings/notes/copy-paste, execution/debugger and all ten examples remain
required. Supported GNOME/KDE Wayland/X11, physical-device, assistive-technology,
high-contrast/native text scaling and release acceptance remain pending, as do
broader D1-02/L1 prerequisites. The complete local1.0 scope is unchanged.
