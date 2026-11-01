# F2-02 captured credential eligibility preparation

Coordinator branch `codex/f2-02-captured-credential-leases`, checkout
`/home/ian/.t3/worktrees/linuxcast/t3-d1b99cbd`, base approved develop
`b23a3cc650f98238c1190b6136889c5117266694`. This is one bounded backend increment.
No AI package, shared platform/renderer wire, dependency, migration, main routing,
UI, capture or historical evidence changed. Independent Standards and Security/Spec
reviews remain required; the prescribed Codex review provider previously exhausted
its usage limit. No clean review, publication or acceptance promotion is claimed.

Before, a trusted provider could only ask settings.use for the credential current
at that later call. It could not capture the actual private explicit session-only
reference or retain eligibility for an older broker snapshot. Now trusted main
can capture an immutable actual reference/generation and admit that exact binding
for a UUID run. Lock, inactivity, lost/stale session/storage, settings mutation,
changed observed metadata, read failure and shutdown revoke prior eligibility.
A retained memory key cannot revive an old capture after unlock. Generations are
not reused across service lifetimes in the same process and are not persisted or
accepted from IPC. Normal release is idempotent without signalling revocation.

Only metadata leaves the new methods. Their lease is not a SecretStore use lease,
provider authentication, content consent or permission grant. Main still must
compose one atomic global provider/model/profile/credential snapshot, call
SecretStore.use with the exact captured reference and fixed owner, observe its
signal, and freshly check captured eligibility immediately before each real
credential-bearing dispatch. Existing current-target settings.use is unchanged.
No production AI composition or network operation was added here.

## Executed validation

Pinned Node24.22.1/Bun1.4.4 on the existing Pop!_OS/Ubuntu-based amd64 development
host; existing installed dependencies reused. No new dependency installation or
version change, native desktop, keyring, provider, guest, privileged operation,
display/bus/input/audio test, screenshot or real credential was used.

- `bun run test:security -- F2-02`:165 passed, including38 settings tests
  (17 existing and21 new), actual private-file/storage-owner regression fixtures
  and synthetic session/helper/crypto boundaries.
- `bun run test:unit -- F2-02`:86 passed (71 Credentials and15 Local data).
- `bun run test:contracts -- F2-02`:3 passed. The wire itself is unchanged.
- Full no-write TypeScript check, scoped ESLint over the three changed TypeScript
  files, planning validation and whitespace checks pass.

New cases prove actual session-only/persistent reference identity, metadata-only
capture without another decrypt on an already opened store, lock/inactive/loss
irreversibility, confirmation/replacement/cancellation, delayed admission and
caller mutation, malformed/foreign/stale/duplicate IDs, owner/read failure,
128 pending/live admission bound, delayed storage notification, keyring refusal,
release, close and a persisted key after runtime/service restart. Synthetic keys
only; UI snapshots are checked to omit their reference IDs. Persistent save's
existing round-trip verification decrypts, so the capture test resets that spy
after setup before checking the new methods; it does not misattribute setup IO.

Five controlled implementation faults each make focused behavioral tests fail:
removed revocation, valid-after-release, aliasing caller capture instead of copying,
a129-slot rather than128-slot admission bound, and reused service generations.
Every fault run exits with a test failure; no timeout is used as proof. The capacity
fixture resumes pending IO and releases all returned leases even when its assertion
fails. The fixed source is restored exactly after all probes; current mapped tests
and static validation were then rerun successfully. Logs are private temporary
artifacts at `/tmp/f202-captured-lease-*.log`, not release evidence.

## Acceptance mapping and limits

| Criterion | Contribution | Remaining gate |
| --- | --- | --- |
| F2-02-AC01 | New main-only metadata/capture lease; no renderer/key/value wire; synthetic identity, revocation, keyring and privacy boundaries | Real native observer/keyring/provider composition and supported desktop proof |
| F2-02-AC02 | Existing controls unchanged; mapped category/repository tests pass | Historical acceptance unchanged; no new broad claim |
| F2-02-PRIVACY | Synthetic private fixtures, no new logging/export/readback/credential routing | Historical acceptance unchanged; integrated provider privacy still pending |
| F2-02-UI | No UI or renderer wire change;86 existing unit checks pass | Existing supported-session/Orca/native UI gate remains pending |

At most128 pending/live UUID admissions are retained. Cancelling a metadata read
is not actual IO cancellation: its slot remains occupied until the real read
returns. Existing repository timeouts and shared SecretStore filesystem/admission
cancellation limits remain. Eligibility checks do not atomically attest external
filesystem edits or physical screen lock; SecretStore.use and asynchronous Linux
session observation retain their independent safeguards and documented limits.
A caller must release its lease. Closed service drops its purely in-memory lease
registrations and denies late admission; runtime/store own actual secret/helper
retirement. No full cancellation-latency or native recovery claim follows.

F2-02 AC01/UI and whole-task remain pending. A1-01 remains planned and its
preparations local until whole F2/F3 prerequisites are accepted. All97 tasks,
complete local1.0, native four-session/AT/physical/performance/package/release
scope is preserved. No task status or generated card was edited.


## Initial independent reviews completed

Security/Spec47865d99 and Standards03715988 reviewed exacta411f882/baseb23a3cc,
package source2aa405e. Both are clear: no actionable introduced findings or material
Fowler smell. Spec independently165security/86units/3contracts,12private probes,
3controlled faults/staticchecks/6hashes; Standards independently38settings/86units/
3contracts/fulltype/scopedlint/plan/whitespace/6hashes with frozen install. Spec's
full-security/private-probe results were inherited by Standards, not rerun there.
Clean exact checkout/index/tracked/untracked state verified by both.

Approved develop4cdf978 (mergedPR98) is integrated before publication. Its only
merge conflict was coordinator PROGRESS; resolved to preserve both checkpoints.
The five reviewed source/contract/package-README paths stay byte-identicaltoa411;
publication metadata adds no API behavior. Actual provider/native/desktop evidence
and full F2/A1 prerequisites remain pending. No credential/UI or schema acceptance
is promoted by merging this bounded component.


Post-integration coordinator validation passes:55F1security (complete265Python
11.504s under18s),165F2security,3contracts, fulltype/scopedlint/plan/whitespace.
The86unit results remain independently executed review evidence on the unchanged
package source. This merge introduces only the reviewed inventory prerequisite
and coordinator/evidence metadata; no additional credential behavior.
