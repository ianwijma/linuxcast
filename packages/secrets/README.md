# Main-owned secret storage — F2-02

`SecretStore` is a main-only service. Main supplies the actual Electron safeStorage
object, the single F2 storage owner's `secretRefs.*` repository adapter and a
trusted fresh `SecretSessionAccess`. There is no default eligible-session bypass.
Consumers receive an opaque UUID and persistence mode. There is no plaintext
get/decrypt IPC endpoint; an authorized trusted main adapter receives the value
only inside `use(reference, owner, callback)`. Callback results are discarded.
Neither service nor repository logs secret values, encrypted bytes or raw errors.
The callback must not forward credentials to renderer/extension/workflow/model
content; it performs the already authorized provider/account operation itself.

Persistence requires all of: selected `gnome_libsecret`, `kwallet`, `kwallet5` or
`kwallet6` backend; encryption availability; v11 keyring ciphertext; successful
roundtrip; and private blob/metadata publication. `basic_text`, unknown backend,
unavailability and failed roundtrip do not write a credential. Failed roundtrip
latches persistence unavailable until explicit `recheckKeyring` succeeds. No
plaintext-encryption flag is used. Session-only storage is a separate explicit
selection and never silently substitutes for requested persistence.

The pinned Electron45 synchronous API reports the selected backend for the same
OSCrypt implementation that encrypts these blobs. Its async provider chain has
independent fallback behavior and no equivalent selected-provider attestation;
its availability boolean alone is not treated as OS-keyring proof. Electron45
marks the sync API deprecated for removal in46; upgrading must establish secure
backend attestation for the replacement API before retaining persistent secrets.
See [pinned implementation](https://github.com/electron/electron/blob/v45.0.0/shell/browser/api/electron_api_safe_storage.cc)
and [pinned API documentation](https://github.com/electron/electron/blob/v45.0.0/docs/api/safe-storage.md).

The data directory comes from trusted main's XDG resolution. Its `secrets`
directory is0700, files0600; a pinned directory descriptor, fixed UUID filenames,
exclusive staging, no-follow reads, link publication and fsync guard file access.
The encrypted envelope binds the exact reference UUID and owner identity to the
credential; swapping two valid ciphertext files cannot cross those bindings. The
repository stores owner identity, opaque ID and UTC metadata only. A value is
bounded to64KiB; encrypted bytes to128KiB. Session storage is bounded to256 items
and1MiB total. Values/owners are copied before asynchronous persistence. Failed
publication/metadata writes attempt encrypted-file and reference cleanup and
never return success. Startup reconciliation first validates the complete bounded reference inventory,
then removes only UUID-named orphan encrypted blobs and staging files in its
private directory. A failed inventory read disables persistent access instead of
deleting from a partial list; explicit reconciliation can retry after recovery.
Unrelated files are preserved. Main creates exactly one service after obtaining
the application/storage-owner lock; reconciliation cannot overlap its writes.

Lock suspends every use and aborts active consumers. Main can select clear-on-lock;
otherwise session values remain inaccessible until unlock. Quit clears session
buffers and aborts active consumers; pending persistent writes finish cleanup
before the directory closes. Strings passed to trusted consumers may remain in
runtime copies, so this is not a complete memory-zeroization claim. Deletion
removes the encrypted file/reference and aborts active consumers. safeStorage has
no per-credential keyring deletion API: its shared app encryption key must not be
deleted while other credentials rely on it. Deletion is logical cleanup, not
forensic erasure, and cannot undo an already sent external request.

`SecretSessionClient` owns the fixed packaged helper's `credential-session`
mode. Its bounded NDJSON stream requires fresh eligible observations, denies
lock/inactivity and quarantines malformed, lost or delayed generations. Every
SecretStore admission and trusted consumer callback rechecks freshness; pending
IO also rechecks immediately before decrypting. Session denials synchronously
abort consumers and optional clear-on-lock removes session buffers. A manual
`setLocked(false)` cannot override denied observation. The owner must invalidate
on suspend/resume, wait for exact helper closure and create a fresh generation
for recovery. See [session contract](SESSION-CONTRACT.md) and
[component evidence](evidence/session-integration/README.md).

The actual Electron startup/retry/suspend/ordered lifecycle and credential setup/
status UI are still separate unfinished integration. Trusted provider adapters
must check their current lease immediately before actual dispatch; receiving a
secret inside a callback is not inference authorization. safeStorage does not
expose a separate keyring-lock state query. Failed availability/use returns an actionable
state without guessing that a particular backend error means the user locked it.
No host session, keyring or desktop setting is changed by tests.

## Verification and remaining acceptance

`tests/secrets.security.test.ts` uses generated synthetic values and a clearly
labelled encryption test double for denial, roundtrip failure, scope, ownership,
link attacks, cleanup and lifecycle boundaries. It is not OS-keyring proof.

`tests/run-keyring-smoke.ts <installed Electron45 binary>` launches a disposable
private HOME and XDG directories before starting D-Bus, Xvfb and GNOME keyring
with generated unlock input. An allowlisted environment excludes inherited
display, session, keyring and process-injection variables. Actual
Electron safeStorage and SecretStore write/reopen/use/delete are exercised; output
contains only fixed statuses/version/backend and cleanup booleans. It uses an
explicit in-memory reference fixture; SQLite reference persistence is a separate
actual-owner integration check. The observed pass used Electron45.0.0,
gnome-keyring40.0/libsecret on Pop!_OS22.04 host; it does not establish Debian13,
KDE, host desktop session or full packaged-app integration acceptance.

`tests/persistence.security.test.ts` uses the real SQLite child owner, actual
typed repository client and private encrypted files with a generated test cipher.
It verifies metadata-only persistence across owner restart, deletion surviving
restart, explicit session-only non-persistence and cleanup after owner disconnect.
The test cipher does not establish OS-keyring security; the separate actual
Electron smoke establishes the stated secure backend roundtrip.

F2-02 remains incomplete until final application integration, independent review
and shared host secret/data-control UI (including keyboard/accessibility
and affected light/dark states) are verified. Typed statuses are not substitute
UI evidence, and F2-02-UI is not marked not-applicable.


## Captured credential admission for trusted providers

`CredentialSettingsService.captureCredential()` returns the actual selected
memory/persistent reference plus a process-local generation. The main-only
`authorizeCapturedCredential()` lease checks that exact captured binding after
metadata IO and immediately before dispatch. It never substitutes the credential
selected later. Captures are immutable opaque metadata, never renderer status,
exports, durable configuration or proof of network/provider permission. The
existing `use` method continues to target the current settings credential;
it must not be used to impersonate an earlier captured reference.

Trusted provider composition must use `SecretStore.use(capture.reference, owner,
callback)` plus the captured eligibility lease, its abort signal and fresh valid
check, while independently enforcing caller/content/tool/network authority and
one atomic provider/model configuration. Releases are idempotent and normal
release does not abort the lease signal. Admission slots remain owned through
actual pending IO; this API does not make the existing shared IO cancellation
bound disappear. Production AI wiring and native/keyring/provider acceptance are
still outstanding. See [the capture contract](CREDENTIAL-SETTINGS-CONTRACT.md#main-only-captured-credential-eligibility)
and [preparation evidence](evidence/captured-credentials/README.md).
