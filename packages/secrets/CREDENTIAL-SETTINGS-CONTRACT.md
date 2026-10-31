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
