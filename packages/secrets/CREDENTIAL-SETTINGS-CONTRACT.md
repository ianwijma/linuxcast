# F2-02 first-party credential settings continuation

The frozen wire is platform-contracts/src/credential-settings.ts. This next bounded
increment adds actual main lifecycle and first-party key setup/status UI. It does
not complete F2-02 or change any supported native/full1.0 release criterion.

The first concrete target is the default OpenRouter API key, as required before
A1-01. Owner is main-fixed `{ownerKind:'provider',ownerId:'openrouter-default'}`;
preference key is main-fixed `credentials.openrouter.default`. Its strict version1
value holds only referenceId(UUID/null) and clearSessionOnLock(boolean), separately
from provider/model selection. Never select a route/model, validate provider auth
or send a provider request from this screen. Other credential owners remain part
of the agreed later integrations, never invented free-form identities here.

The settings renderer is first-party host UI using shared primitives/tokens. It
may send the user's new masked input once through the dedicated saveKey endpoint.
This is not generic ViewModel/action data, extension/workflow input or a secret
readback API. Main never returns a key or reference ID. Never put the value in a
URL, draft persistence, diagnostics, logs, exports, errors or status text. No
stored-value reveal. Strings may remain in runtime copies; no zeroization claim.

Save chooses persistent or session-only explicitly; default is no selection.
Unavailable persistence must never silently switch the selection. Main performs
fresh session/storage validation at admission and after asynchronous/native
confirmation. Replace/remove uses a main native confirmation, exact fixed target
and current expectedRevision. Busy/stale/unknown outcomes are explicit; do not
replay automatically. Cancel/submit/close/session denial clears editable input.

Clear-on-lock policy is a separate setPolicy operation. It applies conservatively
to lock/inactivity/session loss; default retains session-only values until Quit
while denying use during lock/loss. UI reflects server state rather than optimistic
policy success. A main-owned runtime must synchronously invalidate on storage
loss/suspend, verify old helper shutdown before replacement, reject late generation
callbacks and drain the store before the storage owner closes. Provider consumers
must independently fresh-check their current lease immediately before real dispatch.

Snapshot/action replies carry only strict fixed metadata/enums/codes. Renderer
button state is not authority. Main validates exact owning window/main frame/URL,
bounds input, uses the existing SecretStore, and publishes only confirmed local
results. Session hints are asynchronous and not atomic physical lock proof.

The UI supports loading/error/retry, empty/saved/temporarily unavailable, keyring
secure/unavailable/basic-text denial, policy/busy/stale/unknown states, keyboard/
Escape, text overflow and light/dark using existing host primitives. Privacy
fixtures are synthetic. UI unit tests are not actual Electron, keyring, Debian,
Wayland or native AT evidence; coordinator supplies main wiring and actual product
validation/captures after integration. No new third-party version is introduced.

Status snapshots must not apply older preferences after a newer mutation. Main
fences policy application/publication by confirmed preference revision and
mutation generation, coalesces external metadata reads and permits only one
bounded read-only refresh when a snapshot became stale. A denied session cannot
weaken policy. If eligibility/cancellation changes during an acknowledged policy
weakening, main keeps the stronger in-memory policy and attempts one exact CAS
restoration of that stronger value. This protective compensation never repeats
the requested weakening; failed/unconfirmed restoration is unknown/needs-review
and keeps the conservative in-memory floor. Save success is checked again after
pointer persistence/deletion, including memory-reference existence.


## Main-only captured credential eligibility

`CredentialSettingsService.captureCredential()` returns an immutable actual selected
reference and process-local generation, or null. It initializes the trusted runtime
before reading metadata. It never returns a stored key, authenticates a provider,
changes a route or silently converts persistence. The existing renderer wire and
portable exports remain unchanged; neither captures nor generations are accepted
from those sources or persisted. The generation is never reused across settings
service instances within the owning process; exhaustion denies new captures.

`authorizeCapturedCredential(capture, authenticatedRunId, signal)` admits only the
exact current reference/mode/generation and fixed OpenRouter owner after fresh
metadata/session checks. It copies and strictly validates its argument before IO.
A stale capture cannot be exchanged for the current credential or reopened after
lock/unlock, replacement, removal, retry, uncertainty or service restart. Session-
only eligibility checks the actual retained memory reference independently of
persistent keyring availability. Persistent eligibility still requires secure
storage. Observed independent pointer/owner/storage changes and failed metadata
reads invalidate prior captures; a snapshot is not atomic external filesystem
attestation and does not replace the SecretStore use lease.

The returned eligibility lease has `signal`, `valid()` and idempotent asynchronous
`release()`. Main calls valid immediately before every credential-bearing dispatch,
including after each await, alongside the independent SecretStore use signal,
caller/content/network/permission checks. Invalidation aborts leases. Normal release
ends eligibility without falsely signalling revocation. Invalid, duplicate or
non-UUID run IDs deny; at most128 pending or live admissions exist per service.
Aborted metadata admission retains its slot until actual IO returns. Do not claim
this supplies cancellation of existing repository/filesystem IO or proves bounded
credential retirement; those operations keep their existing owners and limits.

Mutation admission invalidates earlier captures before native confirmation, even
if that confirmation is later cancelled. Close and observed storage/session loss
also revoke them. Reacquisition requires a fresh explicit capture; there is no
network, authentication or effect retry. The API is trusted main composition only,
not a new renderer, extension, workflow or generic repository capability. Actual
AI composition must atomically match one configured provider/model/profile with
this captured credential and retain the captured generation for that run. All
native/provider/desktop/AT and whole-task acceptance requirements remain.
