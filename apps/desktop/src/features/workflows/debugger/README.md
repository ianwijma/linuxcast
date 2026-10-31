# Saved text workflow run panel — bounded W2-03 increment

`WorkflowRunPanel({api,editorRevision,savedDefinition,initialEntry?,onClose})` attaches to the
host's current run without executing anything. Definition props provide saved
identity/entry metadata only; main fresh-loads and authorizes the exact revision.
Only explicit Run submits entry/input. Approval submits the offered decision and
current run/prompt IDs; Cancel submits the displayed run ID. Scoped reset submits
only editorRevision. There is no generic permission, clipboard, worker, journal,
file, network or persistence API in this component.

The shared controls provide a saved-version label, enabled Keyword chooser,
multiline text input (16KiB), explicit new invocation, read-only status, last50
step metadata/durations, and a keyboard-scrollable plain result (64KiB maximum).
The host remains responsible for executing, retaining and cancelling the run.
Back/Escape returns to the editor without cancellation; reopening subscribes and
gets the existing run/approval. Native workspace close/Quit cancellation belongs
to the coordinator's host integration, before editor draft flushing.

Clipboard approval shows the workflow name/revision, exact proposed text and
replacement scope. Only actually offered Allow once, Always allow for this saved
version and Don't allow choices appear. Cancel receives focus when the card is
ready; no approval is selected. Held Enter cannot cross asynchronous transitions,
while textarea newlines and IME composition retain native editing behavior.
A scoped permission reset never starts/replays a run. Denied/unavailable states
have fixed remediation; unknown outcomes warn to inspect the clipboard and offer
only a deliberate new invocation, never retry/replay.

The controller fences run IDs, retired identities, monotonic sequences, stale
reads, exact start/decision/cancel receipts and disposal. A transport/malformed
uncertainty gate survives automatic events; explicit Refresh reconciles host
state before new effectful actions. Old snapshot status cannot claim certainty
while a request is unconfirmed. Main-reported requiresReview remains visible.
All messages are fixed safe strings; raw error details are not rendered. Input,
proposed clipboard text and result remain transient normal React text, with no
HTML, links, per-step value capture or local history.

Design: DESIGN.md Shell/navigation, Results/actions, List/Grid/Detail/Form,
Workflows, States/motion, Accessibility and Review gate. The panel is a section/h2
for embedding in the host main/h1 workspace. Existing shared Button/state controls,
input classes, fonts and tokens supply its appearance; CSS only arranges the
workspace and bounded text/metadata regions.

## Launcher-selected entry increment

Optional `initialEntry` selects exactly that enabled saved Keyword. Undefined keeps
its existing first-enabled default. A missing, disabled, wrong-type or empty ID
is visibly unavailable, has no Run form and cannot fall back through controller
entry changes. Refresh/Back remain reachable. Any actual host run/approval still
renders independently for inspection and explicit cancellation.

Changing this presentation intent replaces only the local controller/subscription,
then gets the existing host state. It never starts, cancels, approves or replays.
A valid requested entry remains selected while an older run is active (chooser
locked); after terminal, a fresh explicit Run uses that entry. The seven added
controller and six Chromium cases cover exact second-entry requests, unavailable
IDs, no mount effects and intent changes during pending approval. Five public
selected/unavailable/pending dark/light captures were inspected. These are
component observations; new actual launcher registration, opaque command identity,
fresh saved routing and production entry integration are coordinator-owned.

## Verification

Node 24.22.1/Bun 1.4.4, Linux x86_64 and real Chromium with the reduced-motion
preference (stable captured states, no shared transition midpoint sampling). Fixtures are explicitly
public synthetic host snapshots/request observers. They run no worker, broker,
clipboard, SQLite or native operation and are not desktop/effect acceptance.

- 36 controller cases (29 original plus seven entry-intent cases) cover no mount/typing effects, exact request shape,
  reattachment, read/event and run/sequence fencing, offered choices, wrong or
  malformed receipts, scoped cancellation/reset, unknown/deadline/manual recovery,
  duplicate submission, UTF8 limits, disposal, 64KiB output and last50 bounds.
- 20 Chromium keyboard/axe cases (14 original plus six entry-intent cases) cover dark/light ready, approval, result, denial
  and unknown states; Back/reopen, explicit choices, held Enter, pending/late
  replies, IME behavior, a large scrollable result and 200% text without horizontal
  overflow. The original eleven captures plus five affected entry-intent captures in evidence/ were inspected.
- Full typecheck, scoped ESLint, plan and diff checks pass. Task mapping and actual packaged integration are coordinator-owned.

Commands (prefix PATH with `.worktrees/tools`, BUN_TMPDIR=/tmp):

```sh
bun run test:unit -- W2-03
bun run test:ui -- W2-03
bun run typecheck
node node_modules/eslint/bin/eslint.js apps/desktop/src/features/workflows/debugger --max-warnings 0
python3 scripts/validate_plan.py
```

Partial W2-03-AC01 evidence covers view navigation/reattachment with no start or
approval loss in the component boundary. Partial AC02 covers bounded plain output
and metadata inspection; no performance/native-AT acceptance is inferred. UI and
privacy evidence uses public data and no values in diagnostics. Root owns actual
worker/permission-broker/journal/clipboard, persistent grants/revocation,
close/restart/no replay and metadata-only export evidence. Full debugger/history,
step value capture, breakpoints, script generations, loop/call/retry semantics,
full palette/configuration, packages and all ten examples remain required.
W2-02/W1-03 and broader prerequisite/native GNOME/KDE Wayland/X11, physical-device,
assistive-technology and release gates remain pending. Complete local 1.0 scope
is unchanged; this increment does not complete the task or any full criterion.

## Instrument presentation refresh (existing UI, no new features)

The panel now follows the selected Instrument workspace rhythm (DESIGN.md: Workflows, States and motion,
List/grid/detail/form, Controls, Accessibility) with shared `Button`, `LineIcon`, `StatePlate` and state
primitives and token-only `run-panel.css`. Controller, run, broker, journal and request semantics are
unchanged; the editor wraps it in the same workspace header (tile + `Workflow editor`).

- Header: eyebrow, `Run saved workflow` focus target, exact saved identity line, ghost **Back to editor**
  with its bound `Escape` keycap.
- Main column: New run card (unchanged chooser, 16 KiB textarea, explicit Run, Refresh, scoped review),
  approval card with a `tintInfo` header (approval shield + "Approval needed"), exact plain proposed
  text and only the offered monochrome secondary choices (none preselected, Cancel focused), and the
  bounded plain Result card.
- Side column (300): status with a shape-coded glyph from `ui/presentation.ts` beside the existing state
  word, metadata facts (workflow, revision, run ID, clipboard effect) and the last-50 step list with glyph
  plus word plus duration. Classification follows the typed host snapshot only: success shape only for
  host `succeeded`; `waiting-ui` approval shape; denied → denied shape; unknown outcome / deadline →
  interrupted shape; `unavailable`/`storage-unavailable`/unconfirmed → unclassified info shape; validation
  codes → error. Unknown is never success. Main-reported `requiresReview` is an interrupted band
  "Inspect your clipboard" (eyebrow "Outcome unknown"), with no retry/replay copy.

Verification: `bun run test:ui -- W2-03` 24 passed (20 existing unchanged plus 4 new: host-state shape
classification incl. unknown/denied never success, bound-only Escape and unshortcut secondary choices,
dark/light forced colors with focused Cancel). `test:unit -- W2-03` 37 and `test:security -- W2-03` 2
passed. Actual Electron `tests/workflow-run.integration.test.ts` and `tests/workflow-launcher.integration.test.ts`
(`test:integration -- W2-03`) passed on owned private Xvfb; captures in
`apps/desktop/evidence/instrument-workflows/`, component captures in `evidence/instrument/README.md`.
New cases live in the mapped `tests/run-panel.ui.test.ts`; no runner mapping change needed.
