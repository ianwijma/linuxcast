# Main-owned secret storage — F2-02

`SecretStore` is a main-only service. Main supplies the actual Electron safeStorage
object and the single F2 storage owner's `secretRefs.*` repository adapter.
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

`setLocked` receives trusted session events; safeStorage does not expose a
separate keyring-lock state query. Failed availability/use returns an actionable
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
