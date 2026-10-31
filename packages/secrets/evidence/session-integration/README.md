# F2-02 main/helper session integration preparation

Recorded 31 October 2026 in coordinator worktree
`/home/ian/.t3/worktrees/linuxcast/f2-02-credential-storage`, branch
`codex/f2-02-credential-storage`, against developf461a87. This is preparation
for the complete credential flow; F2-02 and all existing acceptance remain unchanged.
No renderer credential API or production Electron session service is enabled yet.

The fixed packaged native helper now compiles its reviewed credential-session
module and accepts exactly `credential-session` without identity/options. The
read-only observer source is the reviewed d89d05e implementation, unchanged.
The coordinator corrected only its parent-death fixture: stdin stays open through
parent death, eligibility precedes exit, and all output uses shared strict checks.
Historical child manifests remain historical; its coordinator-review.json records
that fixture correction separately.

`SecretSessionStream` bounds chunks to8192bytes, encoded lines to512bytes, pending
bytes below512, and frames to64 per1000ms window. It rejects invalid UTF8, duplicate
or escaped keys, malformed/extra/private fields, non-safe/replayed sequences,
terminal extra data and excessive output. A batch is fully validated before any
eligible notification. Denial transitions preceding a final unlocked observation
remain visible synchronously. Monotonic and wall-clock gaps are checked before
accepting any new batch; partial bytes never extend receipt age and split frames
retain first-byte receipt time. At2500ms, initial timeout, clock regression/error,
invalid framing, identity ineligibility or terminal failure quarantines the
generation. Buffered later observations cannot reopen it.

`SecretSessionClient` launches the main-owned absolute helper path with fixed argv,
no shell and only LANG in its environment. No loader options, keys, HOME, desktop
or bus addresses are inherited. stderr is discarded. Every listener sees denial
even if another throws; reentrant stop cannot deliver a subsequent unlock.
A100ms main timer expires silence; admission also synchronously checks freshness.
Stop invalidates synchronously, closes stdin, escalates only the retained child
at100/250ms, waits for child close including stdio and rejects if unverified at
1500ms. There is no automatic restart; a trusted owner must create a new generation.
Suspend/resume integration must invalidate before reuse; it is not wired yet.

`SecretStore.open` requires a main-owned session observer; no default eligible
bypass exists. Both session-only and persistent admission require fresh eligible
state. Freshness is rechecked after storage waits and immediately before the
trusted consumer callback. Observation denial aborts existing consumers; a quick
unlock cannot revive an older lease. An explicit clear-on-lock setting clears
session buffers on any observation denial; default retention until quit remains.
Manual lock cannot override denied observation. Failed session observation reports
retry-session and never offers session-only entry while ineligible. Deletion and
reconciliation remain bounded local operations and never grant use. Close aborts,
unsubscribes, coalesces even reentrantly, and drains reads/deletions/reconciliation
and writes before closing the pinned private directory.

## Validation and limits

- `node scripts/test-runner/run.ts security F2-02`:87checks, including8stream,
  8owned-helper and9store-session adversarial checks plus4initial gate checks.
  Ordinary private Python executable fixtures verify lifecycle, fixed argv/env,
  malformed-batch denial, lock/unlock ordering, expiry and SIGKILL escalation.
  Storage crypto remains explicitly synthetic in those tests.
- Full `bun run typecheck` and `bun run lint`, plan validation and whitespace
  checks pass with Node24.22.1/Bun1.4.4. No dependency/lockfile/migration change.
- `cargo test -p linuxcast-platform --offline`:38tests pass, including6observer
  policy tests; no real logind/desktop/credential operation. Offline platform
  all-target Clippy with warnings denied passes.
- `packages/secrets/native/tests/run.sh`:6pure/35private-bus checks and non-root
  peer rejection pass with the corrected fixture, offline standalone Clippy,
  warnings-denied compilation and format checks. Ubuntu-based development host,
  Rust1.95/GIO2.72.4 and the existing pinned isolated Ubuntu22 fixture image are
  recorded in the original preparation report. No host bus or lab was used.

Independent review of this coordinator client/store/CLI integration is required
before production use. The prior native observer review does not cover these new
TypeScript or CLI changes. `sources.json` pins current sources without rewriting
historical worker manifests. Existing standalone keyring smoke now explicitly
uses a synthetic eligible session: it tests keyring only, never native lock proof;
it was not rerun as part of this preparation.

F2-02-AC01: partial implementation and synthetic boundary evidence only. The
provider callback's actual dispatch must independently check its current lease
immediately before sending; no provider consumer is enabled here. AC02 and
privacy historical acceptance are unchanged. UI remains pending: actual secure
and session-only credential setup/status, actionable session/keyring recovery,
main service startup/retry/ordered shutdown, native suspend/resume, real keyring,
provider flows, Debian13 GNOME48/Plasma6.3 Wayland/X11, packaging and release gates
remain mandatory. Async LockedHint/IPC are not atomic physical lock proof or input
authority. No task completion or full local1.0 completion is claimed.


## Independent reviews and small coordinator fixes

Independent Standards review of signedf18efab found no actionable finding.
Security/Spec independently passed87mapped/38Rust/6pure/35privatebus/nonrootpeer,
fulltype/lint/Clippy/format/plan/hash/signature checks, and identified twoP2s:
lock during blob IO still decrypted once before the callback guard; cancellation
could offer session-only entry while current session status denied it. Neither
finding exposed the credential to a consumer, but both violated the preparation
boundary. Coordinator fixes recheck session freshness/abort/deletion immediately
after blob closure and before decrypting, within ciphertext zero-fill finally.
All operation failure results now prefer current blocked session status to a
generic error, including persistent-write cancellation. Three denial-state blob
IO injections assert zero decrypt calls, no consumer, zeroed ciphertext and no
session-only offer. Persistent-write cases cover locked/inactive/unavailable;
older tests now expect the current denied status.90mappedsecurity checks pass.
These small fixes are coordinator-validated; no new independent final clean
Security/Spec review is claimed. Production lifecycle/UI/provider/native gates
listed above remain pending. Current sources.json supersedes its prior current
hashes; reviewed commit f18efab preserves the reviewed source provenance.


## Integrated foundation baseline, 1 November 2026

Updated to approved develop1b3efe1 (merged diagnostics, Saved permissions and
shellzoom/native preparation), carrying coordinator checkpointd595aed. All product
source merged automatically. Registry/checkpoint/test-map conflicts preserve every
merged increment and every pending criterion. Current100F2security/55F1security/
72F3security,38platformRust, offlineClippy/format, fulltypecheck/lint/frozeninstall/
plan/whitespace pass. Native observer and all coordinator production implementation
files are unchanged from reviewed/fixedf18efab/06373ba; only runner source pin changes
for the union. The focused component PR need not wait for its future runtime/UI
consumer to integrate. Full task, credential flow, supported desktop and release
acceptance remain pending. An initial smoke build stopped before product launch
because this worktree lacked its Electron SQLite addon; standard pinned setup-
sqlite rebuilt it without source/config changes before the rerun.

Actual production diagnostics smoke on this integrated tree passes1/1 in5.99s,
including build/link of the helper with its new fixed mode. Existing diagnostics
captures remain byte-identical. No credential mode was enabled in the Electron
flow: its native success/denial/unsupported/termination evidence remains the
explicit private-bus component suite, not actual desktop/session acceptance.
