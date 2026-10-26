# Fixed text workflow engine

`validateTextWorkflow` and `runTextWorkflow` support enabled Keyword entry points,
text transforms and explicitly declared Copy text only. Bindings must be exactly
`input#/0`; settings, subgraphs, error routing and conditional/presentation edge
flags are unsupported. All definitions are descriptor-checked, detached and
validated with the existing graph registry before work. Run data is frozen;
fan-out uses independent envelopes and deterministic FIFO/order without a join.
Disabled nodes block their stream. Queue admission and activations share the
configured execution cap. Input is at most16KiB UTF-8 and text output64KiB.

Keyword trimming runs before its required/optional/none argument check. Required
means nonempty after configured trimming; none accepts only empty after trimming.
Transforms use captured or explicit supported locale. Title lowercases each
Unicode word and uppercases its first grapheme using Intl segmentation; normalize
uses NFC. Text remains transient in onValue/result and the host copy closure.
Step metadata contains only validated activation/node identity, type/state and
duration. No text, labels, input, secrets or nested raw errors enter step events.

Running metadata is awaited before work and succeeded metadata before publishing
a value. Run/node deadlines include journal and approval waits. Cancellation
aborts the host signal; an unsettled copy stays unknown and is never replayed.
A bounded one-second terminal metadata cleanup may follow cancellation/deadline;
it performs no work/effect. The parent also owns finalization of aborted steps.
Post-effect failed metadata acknowledgement requires review. A fixed host
WorkflowRunError can prove a denial/unavailable error occurred before dispatch;
unclassified copy failure cannot. Late copy settlement never publishes values,
step success or a different returned result.

This is application-owned execution code with injected host callbacks, not a
plugin runtime or a broker. The host owns process isolation, permission checks,
prepared/dispatched journal checkpoints, native clipboard receipt, run storage,
crash recovery and interactive UI. Full script generations, async node families,
loops/calls, binding/configuration, retry, debugger, session/AT and release
acceptance remain pending. No native clipboard integration is inferred from
controlled closure tests.
