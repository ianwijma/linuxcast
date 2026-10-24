# Shared contracts (provisional F0-01 preparation)

This package implements shared capability/native IPC, commands/views, extension
lifecycle, workflow, provider/harness, AI storage and registry contracts, with
bounded UTF-8 framing and reusable synthetic fixtures.
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
traffic and durable runtime persistence remain to implement.


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


## Command declarations

`src/commands.ts` defines stable `namespace:local-name` command IDs, aliases,
source metadata, versioned argument schema envelopes, required capabilities,
permission requirements and broker registry references for visibility/handlers.
`parseCommandDescriptor` rejects unknown capability, permission, predicate and
handler references and validates each permission scope with its registered
schema. It returns normalized scopes rather than the original unchecked data.

Registration must be owned by the authenticated broker. Source metadata is not
a principal; requirements are not grants, declared handlers are not executable
code, and parsing never dispatches an action. The host must resolve identity,
compile/validate argument schemas, bind reviewed handlers/predicates, classify
effects and apply current grants and user intent before invocation. The schema
validator is not an extension installation or command runtime.


## Extension transport

`src/extensions.ts` defines versioned request, mutually exclusive terminal
response and subscription-event envelopes, plus the five declarative view event
variants. Requests validate against broker-owned session and method registries;
replies bind request/session/method and validate completed results using the
registered result schema. Event payloads bind to an existing subscription's
request/session/method and schema. Parsed defaults/normalization are preserved.
Cancellation is distinct from success and cannot request automatic retry.

These are Node extension-host contracts, not messages consumed by Rust native
helpers. Claimed session/package identity cannot authenticate a principal or
grant access. The connection owner must track outstanding invocations, accept
one terminal, enforce deadlines/default policy and sequence rules, cancel
subscriptions/close handles/expire leases on disconnect and require a fresh
handshake on reconnect. View events require current view/revision/item/form
validation before effects. Parser fixtures do not prove that runtime enforcement
or an actual sandboxed extension host is implemented.


## Shared settings and resource references

`src/settings.ts` defines all eight setting kinds and permission requests shared
by native extensions and workflows. Defaults must match their types, bounds and
listed enum options; secret and file/directory/application defaults are rejected.
Text length bounds count Unicode code points. Pattern strings remain data for a
bounded host validator, not executable validators supplied by a package.
`parsePermissionRequest` uses the host's permission-specific scope schema and
returns normalized scope data. It never creates a grant.

`src/resources.ts` follows the normative workflow `FileRef` shape: explicit file
kind, opaque grant/entry IDs, display name and optional presentation-only path.
Application references have their own explicit kind. Declarative views reuse
these references. This corrects the earlier provisional id-only file reference
before freeze; there are no integrated version1 consumers to migrate. Actual
file resolution, race checks, grant ownership and application lookup remain
broker obligations; display paths do not authorize access.

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

The normative completeness review's view lifecycle/date, workflow results,
workflow-node/tool metadata and shared AI scenario gaps now have provisional
contracts and fixtures below. URL/contact references complete the shared typed
resource values. Final full-scope review and S0-01 acceptance still precede freeze. Runtime enforcement
of these contracts belongs to the consuming brokers, hosts and adapters; this
freeze defines the schemas, compatibility fixtures and required obligations,
not running OS/provider effects. The overview's native request `id` and the
extension transport's `requestId`/`sessionId` envelopes are separate contracts;
both have distinct versioned schemas in this package. No runtime dispatch, permissions, native
effect, credentials, UI or automatic reconnection is implemented here.

The coordinator owns contract changes and shared dependency files. A schema change
must update its mirror and common positive/negative fixtures in one reviewed
change. Keep version/build fields distinct from app, SDK, workflow and database
versions. Incompatible changes require explicit protocol version handling; never
silently reuse grants or replay uncertain effects across a reconnect.

## Workflow values and bindings (provisional)

`src/workflows.ts` defines explicit literal, JSON Pointer and scalar-template
bindings, typed invocation envelopes, named-port node results, safe error shapes
and distinct run states. Workflow values reject prototype-related keys, non-JSON
objects, arrays over10,000 entries and values/envelopes over1MiB. Binding syntax
never executes expressions; actual lookup, scalar-only expansion, readonly branch
snapshots, trusted context construction and secret-handle policy remain runtime
obligations. A context's identity/target fields do not authenticate their sender.
Workflow definition/registry compatibility contracts are defined below; graph compilation and execution remain downstream.

## Provider status and model catalogs (provisional)

`src/providers.ts` keeps authentication, inference permission, eligibility,
quota/rate limits and availability distinct. A ready record requires explicit
inference authorization and eligibility; identity-only sign-in is insufficient.
Credential persistence distinguishes secure opaque references, session-only
reasons and no credential requirement. Catalogs identify their fetch time and
adapter provenance, preserve unknown limits and distinguish empty success from
stale or unavailable results. These records are emitted by trusted adapters;
parsing cannot establish their claims. Profile/endpoint schemas are defined below. Actual catalog fetching, account checks
and SecretStore operations remain outstanding. Harness and AI storage records are
defined below; their runtime implementations remain downstream.

## Explicit harness contracts (provisional)

`src/harness.ts` separates an explicit harness submission from broker-selected
run/runtime/model/account/billing identity. It copies content before snapshotting
that identity. Typed inspect/start/resume/turn/cancel operations, session refs,
steering/resume capabilities and distinct missing/version/auth/account/quota/
crash/lost states prevent silent assumptions. Tool-approval events validate
complete arguments against the host's offered-tool registry and remain pending;
parsing cannot approve them. Cancellation and completion have separate terminals.
A working-directory reference must resolve to an authorized directory. Actual
runtime/version/auth checks, session ownership, tool grants, reconnect policy,
ordered events, durable terminals and child lifecycle remain downstream work.
These shapes never substitute a harness for the ordinary global AI selection.

## Trusted effect dispatch records (provisional)

`src/effects.ts` separates untrusted operation/argument submissions from broker
principal/invocation context and registry-owned effect classifications. Unknown
operations, claimed builtin identity/grants and caller labels fail validation;
normalized JSON arguments are copied. The resulting versioned dispatch record
is not authorization. The broker still checks fresh grants, query restrictions,
intent/target freshness, confirmations, revocation and pre-dispatch persistence.
A package's declared effect cannot replace the host operation classification.

## AI storage records (provisional)

`src/ai-storage.ts` gives conversations, user drafts, immutable message revisions/
branches, attachments, run snapshots, tool approval/results, ordered event records
and context summaries concrete versioned shapes. UUID/revision/UTC metadata and
content-identified blob references keep record identity distinct from arbitrary
paths. Partial output stays referenced when a run is interrupted; unknown tool
effects require review and reject automatic replay. Summaries retain explicit
source revision and selection references. Database schema integers are separate
from application builds. Actual repository ownership, immutable persistence,
foreign keys, event ordering/exactly-one terminal, recovery, retention and content
redaction remain storage runtime requirements; schemas do not implement SQLite.

## Workflow definitions and registry compatibility (provisional)

`src/workflow-graph.ts` defines versioned native graphs, nodes/edges, settings,
permission requests and inert editor state. Node versions/configurations and
edge source ports resolve through the host registry; defaults stay normalized
and remain subject to the same workflow value restrictions. Duplicate node/edge
IDs, duplicate source ordering and unresolved endpoints reject. Limits count
nodes/edges across the top-level graph and named subgraphs.

The previously sketched `SubgraphV1` now has concrete `entryNodeId`, local nodes/
edges and `exits.return`/`exits.error` node/port references. This fills in the
specified one-entry/explicit-exit shape before any integrated consumer; it adds
no execution authority. Cycle checks, registry-specific subgraph call validation,
16-level execution depth, binding resolution, trigger activation and runtime
scheduling/cancellation remain workflow-core work. Host compatibility and SPDX
validation occur before package activation, using the package manager's registry.

## Provider profiles and endpoints (provisional)

`src/provider-profiles.ts` normalizes credential-free base URLs and separates
HTTPS, explicitly granted loopback HTTP and per-endpoint opted-in insecure
development HTTP. Profiles contain adapter/auth/data-destination metadata and
opaque credential/network-policy references; the latter binds explicitly
configured broker proxy/custom-CA settings. They cannot select a model or carry
keys/routing fallbacks. The host registry checks adapter/auth/endpoint-kind
compatibility. Real endpoint grants/opt-ins, DNS/redirect revalidation, TLS and
proxy/CA trust, account checks and credential use remain broker obligations.
Base URLs omit query/fragment/userinfo; provider-specific API parameters belong
to the registered serializer rather than credential-bearing endpoint metadata.

## Repository requests and replies (provisional)

`src/repositories.ts` defines versioned request/reply envelopes bound to the
storage owner's method/parameter/result registry. Completed results must validate
against that registered result schema and match the pending request identity.
Failed and cancelled replies remain distinct; unknown cancelled write outcomes
require review and prohibit replay. Concrete conversation-get and message-revision-
append methods bind shared record schemas. Other domain repositories register
additional typed methods as additive contracts; no generic SQL/table/path request
is exposed. Parsing cannot establish sender ownership, approve a mutation, enforce
revision uniqueness or prove a transaction committed. The single storage owner
still implements transactions, durable replies, access checks and recovery.

## Native extension manifests (provisional)

`src/extension-manifest.ts` implements the native version1 manifest, bundled ESM
entry paths, all shared setting/input kinds, command defaults and optional tool,
workflow-node, skill, MCP, model and setup-dependency declarations. Background
commands normalize to disabled and require the background permission declaration;
tray commands require their separate tray permission. Declaring either permission
creates no grant. Command preference overrides preserve type and enum vocabulary.

`parseExtensionManifest` takes a host-owned registry for compatible host/SDK
versions, license policy, JSON Schema semantic validation, permission scopes,
recognized dependency targets and the staged regular-file inventory. Callbacks
are mandatory; the shape schema alone cannot establish installability. Their
errors become a fixed typed contract failure. Referenced icons, entry points and
skill resources must exist. The archive validator must already reject unsafe
links, native payloads and malformed archives; a relative path string cannot prove
filesystem confinement. Full package byte bounds apply before shape validation.

Optional contribution records concretize the prose specification: dependencies
have a local `id`, `kind`, host-recognized `target` and user-facing `reason`; stdio
MCP names that runtime dependency and a package-relative entry with argument data.
Remote MCP names an HTTPS endpoint and must reference its declared `network.fetch`
permission. Both reference declared permissions by ID.
Tools use the shared versioned JSON Schema wrapper and an ESM entry; workflow
nodes use config/input/output wrappers and a handler ID. Skills reference bundled
Markdown and optional resource paths. Models reuse the shared capabilities and
carry no credentials or automatic selection. Endpoint TLS, origin, local-service
consent and referenced permission coverage are enforced by the host before use.
These provisional field choices have no integrated v1 consumer; incompatible
changes after freeze require explicit version handling.

Synthetic fixtures cover malformed IDs/versions/paths, missing files, unsafe
settings/defaults, compatibility/registry failures, optional contributions and
oversize manifests. They establish neither successful installation nor sandbox,
network, credential, scheduler, model-selection or archive-integrity enforcement.

## Immutable package lifecycle (provisional)

`src/package-lifecycle.ts` shares immutable extension/workflow identity records:
package kind, reverse-DNS ID, SemVer and content integrity are separate fields.
`integrity` is SHA-256 of the exact UTF-8 bytes of the validated `integrity.json`
file; its listed digests bind every other regular file. Different metadata bytes
therefore change the grant-bound identity even when the payloads are identical.
The version1 integrity record names every staged regular file except itself,
with SHA-256 and byte length. This package metadata may exceed the RPC frame
limit; archive limits still include its actual bytes and the additional file.
Parsing compares the exact set against a trusted
archive validator's computed inventory; matching untrusted declarations to each
other is not sufficient. Hashes identify content and never prove authorship or a
valid signature. Archive safety, compressed/expanded limits, image decoding and
actual cryptographic computation remain the package manager's responsibility.

Install/update requests name a host-owned staging reference. Update/uninstall
requests name the exact expected active identity; rollback names a retained
immutable identity. Unknown or mismatched references fail. The package manager
must recheck the active pointer transactionally, validate settings and required
setup, resolve explicit local-draft decisions, and collect fresh grants bound to
identity/version/integrity before activation. No request contains granted scopes
or executable migration hooks. Uninstall defaults to retained user data and
makes credential revocation/removal a separate explicit choice.

Terminal activation results bind to the captured candidate and previous identity.
Initial installation and newly introduced automatic bindings stay disabled.
Updates/rollback may report existing configured bindings enabled only after the
manager verifies renewed grants; the result is not itself an approval.
Disable success retains the installed version and data while asserting stopped
processes, removed registrations, revoked capabilities and disabled automatic
triggers. Uninstall success asserts exited processes, removed registrations and revoked
capabilities, with the requested data/credential disposition. These assertions
must come from the trusted manager after observing those effects; parsing alone
performs none. Failed/cancelled results distinguish preserved/restored state from
an uncertain interrupted operation requiring review, with no automatic replay.
The manager retains the last known-good version, pins running sessions to their
original version, and restores pointer/registrations atomically on activation
failure. Durable recovery and uninstall teardown require actual later tests.

## Extension command sessions (provisional)

`src/extension-session.ts` creates a bounded launch record from a submitted
command/arguments/preferences and separate broker-owned session/connection/
generation, immutable package identity and capability snapshot. Mode and value
validators come from the host's registry for that exact package version.
Normalized values are rechecked as JSON objects and deeply copied before launch;
identity-preserving validators cannot retain caller-owned nested references. Secret inputs use
opaque handles; the package manager must compile the declared settings into the
correct validators and resolve ownership/expiry without exporting raw secrets.

Terminals bind session, connection generation, command and immutable version.
An already-running old version may finish after an update; a new version or
reconnected channel cannot submit that old session's result. Completion,
cancellation, failure and supervisor-observed interruption remain distinct.
An interrupted session has an unknown effect and cannot request automatic replay.
These records do not authenticate a process, launch a sandbox, enforce grants or
execute commands. The supervisor still owns response/time/resource limits,
view-owned cancellation, exactly-one terminal, lease/subscription cleanup and
TERM/KILL/descendant verification. View revision/delta contracts are defined
below; the full cross-contract review remains before freeze.

## Workflow interactive results (provisional)

`src/workflow-results.ts` defines the exact NativeResultsV1 row/action payload,
query revision, opaque cursor, refresh and cache metadata. Whole frames remain
bounded to1MiB, pages to500 rows, refresh250–300000ms and cache1s–24h. Caching
and refresh remain off when absent. Row IDs, action IDs and nonempty normalized
modifier bindings must be unique. Empty/absent modifiers add no alternate
shortcut; plain Return remains the row's default `out` action. Explicit disabled
state is retained. The parser checks action ports against the compiled node's
registry and deeply copies accepted row/action arguments and variables.

This is data validation, not query execution. The host still binds the run/node/
query revision, discards late queries, marks preserved prior rows stale after
malformed results, enforces cache keys and cancellation, and rechecks row/action
selection, grants and stale data before effects. Neither rendering results nor
refresh metadata grants background execution or permission to mutate host data.

## View updates and navigation (provisional)

`src/view-lifecycle.ts` defines bounded snapshots, ordered list/grid item deltas,
revision-gap snapshot requests, and push/replace/pop navigation. Stale revisions
are discarded; a missing base requests a snapshot. Deltas apply atomically to a
copy, validate the resulting page, and keep the full recovery snapshot within
1MiB. Item IDs cannot repeat within a delta. Upsert indexes refer to the evolving
section after removing that item's old position. Removed selections and grid
images are cleared. Navigation binds the actual stack top and caps unique views
at16. Replacement requires a fresh view ID; same-view changes use the revisioned
update protocol. Shared forms include ISO calendar dates with inclusive optional bounds.

The host binds each view to its authenticated session and owns rendering,
rate/coalescing limits, query/selection/scroll/focus restoration, secret draft
clearing, and cancellation when views close. These pure data contracts perform
no rendering, command dispatch, permission grant or desktop operation.

## Workflow and tool registry metadata (provisional)

`src/registry-descriptors.ts` defines serializable workflow-node metadata shared
by inspectors and execution: type/version/category, config/input/output schemas,
permissions and probes, timeout/retry, editor paths, examples and an executor ID.
Tool metadata adds namespaced identity, versioned owner, effect classification,
working-directory/scope requirements, timeout and idempotency mode. Descriptors
are bounded JSON; executable functions and renderer code cannot cross here.

The registrar supplies trusted implementation metadata. Parsers bind owner and
effect, reject omitted mandatory permission/capability IDs, and prevent untrusted
annotations from enabling retries or host idempotency keys. Tool working-directory
and scope requirements must match the trusted registration. MCP runtime version
strings are opaque; native package versions retain SemVer validation. The host validates
all JSON Schemas without fetching remote references and checks node examples
and editor paths using the same compiled schemas as runtime/inspectors. Accepted
normalized metadata is deeply copied. Scope declarations request access, never
grant it. The registrar must authenticate the source, assign unique IDs, approve
changed schemas/permissions, and supply fixed or sandboxed implementations.

These are registration contracts, not a schema compiler, node catalog, editor,
MCP client, executor or permission broker. Actual invocation still resolves
scoped handles/working directories, checks fresh grants and capability state,
validates arguments, obtains required approval, journals effects and returns
bounded committed results. A host key never guarantees exactly-once effects in
an external system; unknown outcomes require review without automatic replay.

## Shared AI scenarios (provisional)

`fixtures/ai/` publishes eight reusable synthetic scenarios for captured global
selection/context, multipart success, truncated streams, approval and denial,
authentication refresh, capability rejection, and interrupted recovery. Its
README describes downstream expectations and transport feeding. Contract tests
verify wire/record compatibility and implemented parser boundaries; expected
runtime call counts remain obligations for future implementation tests, not
claims of provider, approval, persistence or UI execution.

## Typed URL and contact references (provisional)

`src/resources.ts` includes explicit URL/contact kinds alongside file/application
references. URLs carry inert text, accept only HTTP/HTTPS/mailto/tel, reject
credentials and unsafe/ambiguous schemes, and must match the host-supplied declared
scheme set before opening (canonical protocol strings include the trailing colon).
Contact references contain opaque source/record IDs and display names; display
text cannot select or authorize a contact. Contact fields travel separately under
the operation's typed schema after broker resolution.

These parsers do not open a URL, send a message, resolve a contact, grant access
or establish user intent. Brokers still enforce origin/scope, redirects, target
validation, selected contact-field access and the action's permission policy.
Rendering a URL/contact value never causes a lookup, network request or effect.
