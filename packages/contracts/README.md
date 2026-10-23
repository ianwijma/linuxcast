# Shared contracts (provisional F0-01 preparation)

This increment implements the shared capability, handshake, request and failure
schemas plus bounded UTF-8 framing and native operation progress/failure contracts.
It is production boundary code with synthetic
fixtures, not evidence of a running desktop adapter. S0-01 is not yet accepted; do not integrate or call the contracts frozen until
that prerequisite and the rest of F0-01 are complete. The approved sequencing
change removes only S0-03 from F0-01; input implementation and release gates
still require full S0-03 acceptance.

`src/protocol.ts` is the semantic source of truth. `native/protocol` mirrors its
native messages with Serde. Both run the exact JSON cases in `fixtures/protocol.json`.
The package's only runtime dependency is Zod; it uses standard web byte APIs and
imports no Node or Electron runtime. Test code may use Node and Cargo.

Use `FrameDecoder` for incoming byte chunks. Four big-endian length bytes precede
each JSON body, capped at 1 MiB before body allocation. Dispatch each complete
message through its schema. `parseRequest` additionally requires a broker-owned
method-to-parameter-schema registry. The Rust `parse_request` requires the same
broker-owned method/parameter decision. Neither an envelope nor a claimed method
grants permission or establishes a principal. `read_frame` errors require the
native caller to drop its connection; the TS decoder latches errors itself.
TS dispatch receives the registered schema's parsed parameter output, including
any defaults or normalization, rather than the original unchecked parameter object.

Unknown envelope fields, versions, methods and invalid parameters fail closed.
Boundary errors use `invalid-request` and fixed safe copy, never raw input or
validator diagnostics. A received failure's message must be supplied by a trusted
producer with its own redaction policy: a string schema cannot establish secrecy.
Permission, capability, cancellation and other operation failures remain distinct
typed outcomes. Cancellation is not evidence that an external effect was undone.

JSON cannot contain duplicate object keys, nonfinite numbers or unpaired UTF-16
surrogates. A 64-container nesting limit bounds parsing/validation consistently
across languages. This is an implementation resource limit within the byte cap;
it does not limit graph/subgraph execution depth or change workflow requirements.
Generation/deadline fields use nonnegative JavaScript-safe integers; integral
decimal/exponent spellings have the same result in both implementations. All
fixture data is synthetic. No keys, user content or physical input are collected.
The JSON schema preserves every own key, including `__proto__`, so a strict
registered method sees and rejects unknown parameters instead of silently losing
them. Failure detail maps likewise preserve their keys. Native JSON parsing uses
Serde JSON's `float_roundtrip` feature; boundary fixtures verify decoded generation
and deadline values as well as acceptance near the safe-integer limit.

## Native operation results

`src/native.ts` distinguishes a request, a transport acknowledgement and an
observed native postcondition. Requested/acknowledged progress is explicitly
nonterminal and cannot carry an observation. Observed progress is terminal and
must validate against the broker-owned operation/capability/postcondition registry.
The synthetic placement fixture requires its explicit `placed` postcondition;
a geometry-only reply or a mismatched requested result fails that contract.
These fixtures do not prove actual placement or compositor recovery.

`compositorUnavailable` constructs a fixed safe error and a matching generation/
capability snapshot: temporarily unavailable, an explicit recovery action, unknown
effect outcome and no automatic replay. Its schema rejects successful capability
states, automatic-retry hints, missing recovery actions or mismatched snapshots.
Explicit recovery and a fresh handshake/generation are runtime obligations.
Cancellation may also leave an unknown effect; it cannot claim an effect was
undone. A `not-applied` failure must be justified by the trusted producer, such as
cancellation before dispatch.

The Serde mirror and shared fixtures cover these distinctions. The parsers
validate messages; they do not authenticate their source, enforce event ordering,
observe an OS postcondition, manage sessions or guarantee exactly one terminal
delivery. Those runtime responsibilities remain outstanding, and no caller may
submit its own trusted registry, principal or successful native observation.

## Ordinary AI selection and stream events

`src/ai.ts` defines every ordinary AI purpose, the single provider/model/revision
selection, explicit model capabilities and versioned stream event shapes.
`snapshotAiSelection` copies and freezes the selected values for a run; later
settings changes cannot mutate that snapshot. Unknown override/fallback/endpoint/
credential fields are rejected. Unknown model limits remain null, capabilities
have no implicit defaults, and unavailable usage cannot contain invented counts.

Stream variants cover start, text/reasoning/status deltas, tool argument fragments,
complete structured tool requests, usage, sources and distinct terminal completed/
cancelled/failed outcomes. Partial argument text cannot masquerade as a complete
tool object or request execution. `parseAiEvent` validates complete arguments
against the broker-owned per-run offered-tool registry and returns its parsed
output. Tool permissions and approval remain runtime obligations; neither the
schema nor the registry grants execution. Reasoning display is limited to intentionally returned provider data.
Source URLs allow credential-free HTTP(S) data only and never open themselves.

These are TS utility-process contracts, not native-helper messages, so they do
not expose provider details to Rust input helpers. Synthetic framed tests cover
their shapes. Producer authentication, per-run selection enforcement, ordered
event delivery, exactly-one persisted terminal, tool approvals, actual provider
traffic and harness/storage records remain to implement.


`src/ai-request.ts` defines versioned normalized messages, opaque attachment and
context references, structured output schema envelopes and bounded request
limits. Tool arguments/results are structured JSON; reasoning parts explicitly
identify intentionally returned provider data. Context references describe their
source and a local-only or preview-required transmission policy. A reference or
policy field does not grant access or authorize transmission.

`createBrokerAiRequest` keeps submitted content separate from broker-owned run
identity, origin and global selection. It rejects caller-supplied routing or
authority fields, copies message content and JSON arguments, and freezes the run
selection snapshot. The caller must supply authenticated broker context; parsing
cannot establish that authority. Runtime ownership checks, reference resolution,
consent, model compatibility, tool grants, budget enforcement and JSON Schema
semantic validation still precede sending. No provider traffic occurs here.


## Declarative views

`src/views.ts` defines versioned list, grid, detail, form, text, image and PDF
snapshots with semantic items/actions and opaque asset/file references. Unknown
renderer execution/style fields, direct asset URLs and arbitrary file paths fail
validation. Images in grids bind to item IDs. Pages have at most500 items total,
text fields at most64KiB UTF-8, and item/section/field/action identities must be
consistent. Form submit/cancel actions must exist with distinct IDs; secret fields cannot contain
published initial values. The host receives semantic content, never executable
components or callbacks.

These schemas do not render or sanitize Markdown, resolve file grants, trust an
action's declared effect, authorize dispatch or enforce live revisions/session
limits/update rates. The host must classify effects from its trusted registry,
validate the current view/revision/selected item, sanitize Markdown and safe links,
and use the shared design primitives. A valid view never invokes an action by
itself. The concrete image/PDF preview shape uses a typed `source` reference,
keeping asset/file alternatives unambiguous; no remote executable URL is accepted.
The fixtures prove parsing only, not visual or accessibility acceptance.

Dependency pins and licences were checked against the installed package/crate
metadata. `bun.lock` and `Cargo.lock` retain registry integrity checksums. Zod has
no runtime dependencies; Serde was already present in the workspace lockfile.
The new Rust JSON dependencies are the maintained Serde JSON implementation and
its integer/number formatting crates. This is a dependency/behaviour review, not
a claim of an independent security audit.

| Package | Exact version | Licence |
| --- | --- | --- |
| Zod | 4.6.7 | MIT |
| serde | 1.0.229 | MIT OR Apache-2.0 |
| serde_json | 1.0.154 | MIT OR Apache-2.0 |
| itoa | 1.0.18 | MIT OR Apache-2.0 |
| zmij | 1.0.23 | MIT |

Run `bun run typecheck` and `bun run test:contracts -- F0-01` using the pinned
toolchains. The latter runs TS checks and `cargo test --locked --offline -p
linuxcast-protocol`; install the locked Rust dependencies before an offline run.
It fails if Cargo cannot execute or either language disagrees with the fixtures.
Also run `cargo clippy --locked --offline -p linuxcast-protocol --all-targets -- -D warnings`.

Still to implement in F0-01: command contracts, workflow and
provider catalog/status/harness/storage contracts, extension envelopes, response/event/subscription lifecycle,
trusted effect contexts and runtime enforcement of native outcome/recovery
contracts. The overview's native request `id` and the
extension transport's `requestId`/`sessionId` envelopes are separate contracts;
this increment implements the former. No runtime dispatch, permissions, native
effect, credentials, UI or automatic reconnection is implemented here.

The coordinator owns contract changes and shared dependency files. A schema change
must update its mirror and common positive/negative fixtures in one reviewed
change. Keep version/build fields distinct from app, SDK, workflow and database
versions. Incompatible changes require explicit protocol version handling; never
silently reuse grants or replay uncertain effects across a reconnect.
