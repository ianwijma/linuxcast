# Shared contracts (provisional F0-01 preparation)

This increment implements the shared capability, handshake, request and failure
schemas plus bounded UTF-8 framing. It is production boundary code with synthetic
fixtures, not evidence of a running desktop adapter. S0-01 and S0-03 are not yet
accepted; do not integrate or call the contracts frozen until those prerequisites
and the rest of F0-01 are complete.

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

Still to implement in F0-01: command and declarative view contracts, workflow and
provider contracts, extension envelopes, response/event/subscription lifecycle,
trusted effect contexts, requested/acknowledged/observed native outcomes and
explicit compositor-failure recovery. The overview's native request `id` and the
extension transport's `requestId`/`sessionId` envelopes are separate contracts;
this increment implements the former. No runtime dispatch, permissions, native
effect, credentials, UI or automatic reconnection is implemented here.

The coordinator owns contract changes and shared dependency files. A schema change
must update its mirror and common positive/negative fixtures in one reviewed
change. Keep version/build fields distinct from app, SDK, workflow and database
versions. Incompatible changes require explicit protocol version handling; never
silently reuse grants or replay uncertain effects across a reconnect.
