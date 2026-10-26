# Metadata checkpoints for actual saved text runs

W1-03's bounded application increment stores strict run identity, saved-definition
hash/revision, state, safe error/effect outcome and per-activation node identity,
state and duration. Input, output, workflow/node labels, raw errors, credentials
and grants are absent from journal schemas. The sole SQLite owner applies
migration009, validates records and exact CAS receipts, preserves immutable
identities and rejects terminal/regressive transitions. No second database owner.

Copy moves pending→prepared→dispatched before the real host clipboard writer;
completion follows the exact write/read receipt and terminal step acknowledgement.
Unknown acknowledgements are never relabelled success or automatically retried.
Startup changes unfinished runs to interrupted, combines existing unknown and
completed Copy evidence with dispatched steps, and never invokes the worker or
clipboard. Metadata is bounded to10k runs/10k activations per run and30days;
terminal pruning runs on creation and startup. Active records survive pruning
until recovery has classified them. This is not an exactly-once external effect.

Owner tests cover crash/checkpoint gaps, existing unknown/completed evidence,
CAS/identity/regression/privacy rejection and idle retention. Actual desktop
coverage is in apps/desktop/tests/workflow-run.integration.test.ts. Full journal
history, captures/handles, scheduler/idempotent recovery and debugger scope remain
required; no task completion or broad platform acceptance follows from this flow.
