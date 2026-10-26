# Actual text workflow run: bounded W1-02 / W1-03 / W2-03 increment

Application flow: open saved workflow → enter text → execute fixed Keyword and
Transform nodes → inspect result/clipboard approval → explicitly allow/deny →
actual clipboard write with exact receipt. No simulated operation. Full1.0,
complete runtime/editor scope and all acceptance criteria remain unchanged.

## Ownership / dependencies

- Domain author W1-02 owns only workflows/src/engine/** (source/tests/README).
- UI author W2-03 owns only desktop/src/features/workflows/debugger/**.
- Coordinator owns contracts/registry/manifests/migrations/journal repository,
  worker entry/bridge, broker/IPC/preload/build/editor integration and status.
- Existing static graph/model, saved editor, sole SQLite owner and permission
  broker are real integrated dependencies. Their full task/native acceptance
  remains pending under user-approved unfinished application increments.
- Required cards/norms: W1-02, W1-03, W2-03; PLAN; workflows architecture sections
  2–4/6/8/9; security; data retention/recovery; testing-release; DESIGN/tokens.

## Frozen engine interface

Export from engine/index.ts:

- `validateTextWorkflow(value: unknown, triggerNodeId: string): WorkflowDefinition`.
  Use existing graph validator/EDITOR_NODE_REGISTRY and descriptor-safe cloning.
  Initial executors are application-owned input.keyword, utility.transform and
  output.clipboard only. The selected entry must be an enabled Keyword. Reject
  unsupported node/configuration/settings/subgraphs before effects; do not
  reinterpret them. Binding source/text is explicitly input#/0 in this increment;
  other valid bindings report unsupported-configuration (full binding scope stays
  required). Node IDs<=200UTF8/no controls; reachable Copy requires declared
  clipboard.write. No package can approve its declarations.
- `WorkflowRunError(code: WorkflowRunErrorCode, effectOutcome?:
  'not-dispatched'|'unknown')` has fixed safe message/code/effectOutcome; no raw
  user content or nested cause in errors.
- `runTextWorkflow(options): Promise<TextWorkflowResult>` where options is
  `{definition: unknown, triggerNodeId: string, input: string,
  context: WorkflowEnvelope['context'], signal: AbortSignal,
  createActivationId(): string,
  onStep(step: WorkflowRunStep): Promise<void>,
  onValue(text: string): void,
  copyText(request: {activationId: string;nodeId: string;text: string},
    signal: AbortSignal): Promise<void>}`.
  Result is `{state:'succeeded'|'failed'|'cancelled', output?:string,
  errorCode?:WorkflowRunErrorCode, effectOutcome:'not-dispatched'|'completed'|
  'unknown', requiresReview:boolean}`. Types come from contracts/workflow-run.ts.

Execute a deterministic FIFO queue, outgoing edges ascending order, immutable
branch data, disabled nodes block their stream; no implicit join. Input keyword
required/optional/none/trim behavior is normative. Transform trim/upper/lower/
title/normalize uses explicit locale (default captured context.locale), NFC for
normalize, no eval/expression/regex fallback. Reject invalid locale explicitly.
Title casing uses Unicode word segmentation, not ASCII-only splitting. Each
activation is counted against defaults.maxNodeExecutions; obey run deadline
including waits and node.timeoutMs, cancellation and 64KiB output/16KiB input
caps. Await onStep(running) before work and onStep(terminal) before reporting
success. Metadata has no values; output is transient via onValue/result. Clipboard
calls only the injected host closure, never native/Node/Electron directly.

The closure may wait for human approval; AbortSignal cancels it. No clipboard or
node replay. Report unknown honestly after a dispatched/uncertain copy or failed
post-effect journal acknowledgement. Do not claim that cancellation undoes an
effect. Sequential execution is within maxConcurrentNodes; broad async node
families, script-filter generations, loops/calls/retry remain required later.
Do not build a generic plugin runtime or new research/proof framework here.

## Frozen UI interface

Export `WorkflowRunPanel({api,editorRevision,savedDefinition,onClose})` from
features/workflows/debugger/index.tsx; api is WorkflowRunApi from contracts.
Coordinator embeds it in existing canvas workspace and enables Run saved workflow
for a saved valid version. No authority comes from savedDefinition props; main
fresh-loads exact editorRevision and derives the definition/identity.

Show explicit saved-version label, Keyword entry chooser, labelled text input,
Run, Cancel run, status, last50 step states/durations and a bounded scrollable
plain-text result (max64KiB). Initial get+subscribe cannot start a run. Maintain
runId/sequence identity, fence late reads/replies/disposal and never replay on
mount/navigation. Returning to editor preserves the host run/approval; reopening
reattaches through get. Native workspace close/Quit cancels the interactive run
before flushing editor. New runs require an explicit action and no active job.

Permission card shows workflow identity and clipboard text/replacement scope,
with Allow once, Always allow for this saved version, Don't allow, Cancel run.
Use actual broker prompt choices. No approval is preselected; focus Cancel and
block held Enter through async state transitions while preserving IME/text
editing. Persistent deny/unavailable has Review clipboard access (the scoped
reset method) and Start new run remediation; no automatic resubmission. Reset
revokes only this freshly loaded definition's clipboard decision, cancels active
work, and never broadens other grants. Unknown state warns to inspect clipboard;
it cannot offer retry/replay. Only an explicit new invocation can run again.

Use shared primitives/tokens, normal React text (no HTML/links), light/dark,
keyboard/focus, loading/empty/error/denied/approval/running/cancelled/unknown/
success/200% states, real controller/browser/axe checks and inspected public
captures. UI has no Node, clipboard, journal or generic permission API. Leave
full debugger/history/breakpoints/large-value capture scope pending explicitly.

## Coordinator runtime/security contract

Run computation belongs to a trusted dedicated workflow utility process,
never renderer or arbitrary graph code in main. Child executes only bundled
fixed engine code; scripts remain unavailable without the separate sandbox.
Parent-owned strict bounded messages authenticate the exact child; child has a
minimal environment and no secret/grant/session handles. Main alone performs
PermissionBroker connect/begin/decide with a workflow principal derived from the
fresh saved definition hash; renderer only supplies entry/input and prompt/run
IDs, never principal/operation/text-for-copy/grant authority. Current workspace
main frame, revision/definition and cancellation are revalidated before effects.

Use existing real clipboard writer/receipt and permission broker once/persistent/
deny/revoke. Do not claim capability from a session environment alone; use actual
backend outcome, with unsupported/busy/unknown truthful and actionable. Mark
host adapter available only for a fixed registered operation whose actual
support/receipt is checked at execution; do not claim native-session acceptance.

Metadata-only journal through the existing sole SQLite owner: run identity,
workflow identity/version/hash/editor revision, run/step transitions and safe
error/effect outcome. No input/output/labels/credentials in durable trace. Write
prepared/dispatched checkpoints BEFORE copy; record completion after actual
receipt. Startup marks unfinished runs interrupted and dispatched steps unknown;
NEVER replay. Retain metadata<=30days/10k runs, no default value capture. UI can
show recovered interruption and remediation. Root verifies real clipboard,
denial/no effect, cancel/close, restart/no replay, exact argv-free worker protocol,
permission persistence/revocation and query-free export on an owned private Xvfb.

No full task/native/AT/release acceptance follows from this increment. Merge the
reviewed/tested application flow promptly; keep missing full-scope work explicit.
