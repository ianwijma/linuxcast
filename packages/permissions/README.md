# Capability and permission brokers — F3-01

Implementation in progress. This package owns trusted broker policy and the
Saved permissions administration screen, not desktop backend success, credential
storage or privileged input access.
Only trusted main registers connections/operations and receives the controller
that decides prompts. Submission data cannot supply identity or approve itself.

## Coordinator-owned persistence contract

Migration 002 is reserved by the coordinator for durable decisions. The exact
TypeScript record/interface is `src/types.ts`. `permissions.list({principalKey,afterId?,limit})`
returns `{records: DecisionRecord[], nextCursor: UUID|null}` with limit1..200 and
stable ID ordering (nextCursor is the last returned ID when more remain), `permissions.put({record})` returns the committed
DecisionRecord and `permissions.revoke({id})` returns boolean. The repository
computes principalKey as SHA-256 of canonical JSON principal; canonical ordering
is builtin `{kind,id}` or package `{kind,id,version,integrity}`. scopeKey is
SHA-256 of canonical JSON scope (`{kind,...its one field}`; global only `{kind}`).
Unique key: principalKey, declarationHash, permissionId, scopeKey. Record ID is a
UUID. Put replaces the decision for that exact key, returning the actual stored
record; it cannot silently widen scope. Times are UTC ISO strings. Grants bind
package version/integrity and the complete declared-permission hash, so adding a
permission does not reuse prior approvals. Once decisions are memory-only and
bound to one invocation, never persisted or exported. Portable exports exclude
all permission decisions.

Scope semantics are exact matching, not path prefixes or arbitrary wildcards.
`resourceId` is an opaque broker handle; display paths never authorize access.
Origins are canonical HTTP(S) URL origins without credentials/path/query/fragment.
`network.local` remains a separate required permission for private-network access;
DNS, redirect and descriptor-relative file checks remain in the actual effect
adapter, which must use the broker's revalidation boundary before each effect.
Global scope is accepted only for clipboard.read/write, ai.generate,
notifications.show and background.run. Files, network, applications, windows,
input target actions, clipboard history and script jobs require a specific scope.

No new migration, storage repository, package manifest or lockfile is owned by
this lane. Persistent-decision acceptance requires the actual single storage
owner; a fake store alone does not establish persistence or restart recovery.

## Trusted integration

`PermissionBroker` and `CapabilityBroker` are main-only controllers. The parent
process authenticates an IPC connection before `connect(connectionObject,
principal, declarations)`, waits for it to finish, and derives the exact installed
package identity itself. There is no reusable token/socket or payload caller ID.
A connection receives only the `submit` closure returned by `begin`; main chooses
its source, run and approved intent. The approval UI controller alone can call
`decide` with once/persistent/deny. Prompt possession does not grant that API.
Never expose these controllers, the storage client, or arbitrary method routing
through preload or an extension transport.

The operation registry is trusted code. Each operation supplies frozen metadata,
argument validation, exact requirement derivation, required capabilities, a fresh
`validate` callback, durable `prepare` callback, and implementation. `validate`
checks descriptor-relative files/renames, network DNS/private origins/redirects,
current target/window ownership and explicit model or user intent as appropriate.
`prepare` commits actual run/effect state before dispatch. The broker revalidates
after that await. The implementation calls its lease's `revalidate` before every
later effect/redirect and obeys its AbortSignal. There is no native operation in
this foundation package and a callback success is not desktop/provider evidence.
Backends that cannot cancel an already sent action retain an unknown outcome;
they must not claim the external action was undone.

Once approvals authorize one bound invocation only. A changed request cannot
reuse its prompt. Every invocation checks registered permission IDs, the installed
declaration set, durable denies/allows, generation, connection epoch and resource
scopes. Background additionally needs background.run; input actions require an
explicit user action. Model-tool invocations require a trusted intent reference
and the adapter verifies its actual approval. Query invocations require registered
read/queryAllowed classification. A 30-second broker deadline bounds one dispatch;
long-running feature jobs must use their separately supervised lifecycle rather
than extending a single uncontrolled effect.

Revocation clears local access and aborts sensitive work before SQLite deletion.
A principal mutation gate blocks new/loading connections and new invocation/grant
admission until durable writes, revocation and any late-write cleanup settle.
This is explicit even for asynchronous store adapters; the actual storage owner
also serializes SQLite operations on its single transport.
Disconnect and capability generation changes abort old leases/prompts. Failed
storage mutation quarantines that principal until the broker is restarted after
storage recovery; no pending prefix of paginated decisions becomes a grant cache.
A late persistent write after disconnection is deleted before it can become an
active grant. Completed/failed/cancelled dispatches cannot be resubmitted. Once an
effect has been dispatched, interruption is unknown, requires review and never
causes automatic replay. Capability reports come from individual actual backend
probes, begin temporarily-unavailable/not-probed, and carry one monotonically
increasing generation. Session/lock transitions invalidate all contexts.

`createDecisionStore` uses the actual F2 validated main StorageClient's three
permission repository methods. Inventory reads accept at most 200 records per
page and 10,000 records / 16 MiB per principal; IDs must increase and continuations must name the
last returned ID. Audit is an in-memory ring of at most 1,024 allowlisted records:
time, principal kind, outcome and permission IDs. No identity IDs, paths, origins,
arguments, output, prompt text, tokens, credentials or raw exception details are
included. Tests use synthetic IDs/content; no real private material is needed.

## Shared administration owner

Production features obtain brokers from the single main-owned
`PermissionRegistry.createBroker`. The product workflow controller receives that
registry; direct standalone brokers remain useful in controlled library tests.
Do not create an independent production grant cache. Release a broker through
`registry.release`; it waits for outstanding mutation cleanup. Close the registry
before closing its storage owner.

Revocation blocks admission for the exact principal, cancels every matching
broker and notifies the owning feature so pending UI/worker waits also stop. It
waits for late grant writes and their deletion before compare-deleting the full
selected record. A failed write or cleanup quarantines that principal in the
shared registry, including after the old broker is released; no fresh broker can
read a surviving late grant as successful approval. Failed removal remains
unconfirmed and requires storage recovery, application restart and review.
Cancellation never claims an already sent external action was undone.

The owner-only `permissions.inventory` pages stored decisions across principals.
`permissions.revokeSelected` compares the complete validated record inside the
SQLite transaction and reports removed/changed/missing. A stale screen cannot
delete a newer choice. No schema migration is needed. The main window keeps
records private and gives its dedicated narrow preload only opaque per-snapshot
selectors and display metadata. Complete source/version labels survive bounded
IPC pages; truncation is visual, with complete accessible names/tooltips and a
scrollable full-source review. This API cannot approve access or choose a caller
principal.

Current workflow clipboard approval already offers once/persistent/deny in its
debugger and now shares this administration owner. Saved permissions adds
confirmation, paging, remembered-denial removal, stale/unknown remediation and
focus restoration using shared host primitives. D1-03's generic settings routes
and reusable consent surfaces remain separately owned and pending. Other feature
effect adapters and their future approval integration are not claimed here.

F3-01-AC02/UI remain pending until final review/integration and applicable native
keyboard/accessibility evidence. Unit tests and private Xvfb do not establish
the supported Debian desktop matrix, native AT or backend effects. See
`apps/desktop/evidence/permissions-application.md` for bounded product evidence.
