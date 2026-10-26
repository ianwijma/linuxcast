# Workflow draft editor: bounded W1-01 / W2-01 increment

This is a concrete local editing flow, not a runtime/proof/research task. Full
workflow scope remains mandatory. The initial application entry opens a separate
sandboxed workspace for one local workflow draft. Multiple workflows, packages,
execution/debugging, full palette, bindings/settings/notes/copy-paste and native
accessibility/session acceptance remain unfinished and visible. Never simulate
execution. Run is disabled with the explanation that execution is unavailable.

## Shared frozen interface

- Existing WorkflowDefinition and envelope schemas are authoritative. New
  contracts/src/workflow-editor.ts defines the named preload and sole-owner
  persistence boundary; use exact validated receipts, no generic IPC.
- workflows/src/registry.ts is the same application-owned three-node registry
  consumed by graph validation and the editor. No executors/permission grant
  authority. Initial palette: Keyword, Transform text, Copy text. Show seven
  categories/search; absent categories explain that nodes are not available yet.
  No new dependencies. Existing React Flow and shared UI/tokens are reused.
- Graph API (domain author owns graph/index.ts):
  `validateWorkflow(value: unknown, registry: GraphNodeRegistry): WorkflowDefinition`
  returns a validated detached definition or throws `WorkflowGraphError` with
  fixed `code` and safe fixed message. Codes: invalid-definition, invalid-node,
  invalid-edge, cycle, type-mismatch, invalid-subgraph. No user input in errors.
  Validate via existing parseWorkflowDefinition plus raw cycles (also disabled
  nodes), exact registry input/output compatibility (json accepts any kind),
  nesting/call-reference bounds (16), and global node/edge limits. Ordinary edges
  cannot target registry entries with null inputKind. Editor positions/notes/
  viewport remain inert; do not alter graph semantics. Reject invalid raw input
  without getters or mutation. No runtime/executor implementation in this slice.
- Run model API (domain author owns run/index.ts):
  `createRunSnapshot(definition: unknown, configuration: unknown, grants: readonly string[], registry: GraphNodeRegistry)` validates and
  returns a detached deeply frozen `{definition, configuration, grants}` snapshot;
  `forkEnvelope(value)` validates the shared envelope schema and returns its own
  detached deeply frozen envelope. Validate safe bounded plain JSON; no getters,
  prototypes, secret handles or side effects. Preserve typed args and null; never
  merge branches or mutate inputs. This is a model, not actual execution evidence.

## Editor API and persistence

Component export `WorkflowEditor({api}: {api: WorkflowEditorApi})` in
apps/desktop/src/features/workflows/canvas/index.tsx. Root owns workspace/build/
IPC/preload/storage/registry integration. UI author owns only canvas/**.

One private SQLite record contains a revision, current draft and last explicitly
saved valid definition (`saved` null before first Save), with owner timestamp.
Load null shows a New workflow action. Draft writes every500ms after graph/name/
layout edits; explicit Save uses action save and validates the graph first in
renderer AND main. Invalid graph may remain a draft, never a saved valid version.
Revert sends action revert and restores the last saved owner snapshot (or empty
new draft if none); main ignores supplied draft for this action. expectedRevision
is compare-and-set (0 when absent); exact current write receipt required. No
query/input content, run history, credentials or execution/grants are persisted.
Grant declarations in graph JSON are inert data, never approvals.

Serialize all writes; a newer edit stays dirty and is written only after the
prior exact acknowledgement. Unknown/conflicting writes stop autosave and show
explicit Reload/remediation; no blind retry. Reload replaces local edits only
after shared dirty confirmation. Closing flushes the last draft or exposes a
truthful retry/discard choice; OS window-close uses the same contract. Failed
writes retain the editable graph and unsaved warning. Revert is explicit and
confirmed when dirty. Successful Save/Revert update owner revision; no optimistic
saved state. API close is navigation only. onCloseRequested callback returns boolean/Promise<boolean>: true only after confirmed close request; false on failed flush/close. Main/preload bind the close attempt to its owner and nonce. Quit completes this human/flush preflight before timed resource teardown; false cancels Quit and leaves the app usable. onCloseRequested invokes the same UI close/flush path for native window close; root wraps the component in ThemeProvider and handles appearance. The component does not create a separate theme system.

## UI boundary and evidence

Left searchable categorized palette; central controlled React Flow canvas;
right inspector and equivalent structured node/connection list. Shared Button,
TextField, state/confirmation primitives/tokens. Configure keyword/argument/
trimQuery; transform operation/locale; label. Source/text use the explicit fixed
input#/0 binding in this slice; show it honestly, do not infer other binding UI.
Copy requires no paste/history field since supported values are fixed false/
exclude. Adding Copy adds its declarative clipboard.write permission/reason;
removing the last Copy removes that declaration. No grants are created.

Add/select/configure/connect/delete without dragging. Connections choose source
port/target through labelled controls and reject cycles/type mismatch with safe
feedback. Delete removes attached edges. Position changes affect editor only;
undo/redo restores graph and layout, not persisted revisions/effects. Capture
public synthetic dark/light, empty/error/invalid connection and200% states. Check
keyboard, focus, axe and layout overflow. Root verifies production launch→editor→
edit/connect/save/close/reopen/restart with real SQLite persistence. No native
session/AT acceptance may be inferred from Chromium/privateXvfb.
