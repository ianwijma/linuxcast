# Provisional workflow subgraph wire shape

Status: proposed within F0-01 preparation; not frozen or integrated.

## Context

The approved workflow specification names `SubgraphV1` and requires one entry,
explicit return/error exits and named bounded child subgraphs. Its illustrative
TypeScript leaves that record's fields undefined. Editor and runtime consumers
need one concrete shape before parallel implementation.

## Chosen behaviour

`workflowSubgraphSchema` has local `nodes`, `edges`, one `entryNodeId` and
`exits.return`/`exits.error` references containing `nodeId` and output `port`.
Subgraphs live in the workflow's named `subgraphs` map. Registry-specific node
configuration references those names; workflow-core validates calls, cycles,
16-level nesting, execution limits and cancellation before enabling a graph.
Contract parsing resolves each explicit entry/exit and ordinary edge against the
host's node/version/config/output-port registry. It grants no execution rights.

## Alternatives and compatibility

An untyped JSON subgraph would leave editor/runtime implementations incompatible.
Implicit first/last-node entries or exits would make array reordering change
behaviour. Embedding recursive child graph objects would duplicate graph identity;
named references preserve the approved package shape. These alternatives are not
used. No integrated v1 consumer exists, so there is no data migration. Any later
incompatible frozen shape requires explicit schema-version handling.

## Impact and checks

Tasks F0-01 and W1-01; feature foundation and native workflows. No dependency,
acceptance criterion, platform, feature scope or runtime authority changes.
Compatibility fixtures cover an explicit entry and both exits, unresolved entry,
unknown ports/nodes/versions, duplicate identity/order and normalized value limits.
Actual graph compilation/execution remains W1-01 and later node/runtime work.
