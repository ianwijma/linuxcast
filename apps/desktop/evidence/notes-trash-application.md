# U1-01 — recoverable Trash/restore application increment

29 October 2026. Based on integrated PR61/develop
f00984e09b08adbccd9c37ca7a5f5d46b2f1c596. Coordinator codex/notes-trash;
UI author codex/notes-trash-ui. User-authorized reviewed/tested unfinished application
increment. All four U1 criteria, broader D1 and release acceptance remain pending.

## Behavior and boundary

Move to Trash reserves the selected note and opens explicit confirmation, with
Keep note focused first and Escape/cancel. No write or draft flush occurs before
confirmation. Cancel retains local edits and offers explicit Retry/Save. Confirm
flushes the latest editable draft without Save, then changes only metadata at the
expected revision. Archived content skips the flush. The acknowledged row leaves
Active/Archive while its selected title, body, task controls and formatting remain
read-only. Show trashed notes loads actual owner-backed Trash across both archive
states, with title/body search and Pinned only. Archive and Trash filters are
mutually exclusive.

Restore from Trash changes metadata without flushing or replaying retained edits,
preserves pin/archive/content/saved version/timestamps/history and removes the row
from Trash. An active note becomes editable; an archived note remains archived and
read-only until the separate Restore note action. Retained local edits stay paused
for deliberate review/Retry/Save. Missing capability, known refusal and uncertain
outcomes remain visible and actionable; no optimistic removal or automatic replay.

Schema017 adds checked defaultfalse Trash metadata and indexes. Existing active/
archived/pinned source and saved history survive a consistent migration snapshot.
Same-state CAS still increments revision exactly once. No source is deleted, no
retention job runs, and permanent deletion/Empty Trash are not implemented here.

Strict named IPC accepts only existing UUID, expected revision and desired boolean.
Main and owner refuse content writes, Pin and Archive on trashed notes. Exact
receipts validate identity, next revision, requested Trash, other flags, content
and both timestamps. The shared actual mutation/export/Close/uncertainty/fresh-Get/
no-replay gates apply. Quick-note initial receipt observation excludes trashed
records. SQL applies Trash/archive/pin/query before paging; client/main/preload/UI
check normalized echoes and row membership, allowing mixed archive flags within
Trash. Wire safeExtend preserves rejection of archived:true+trashed:true.

No new dependency/service/helper/permission, renderer Node/network or arbitrary
IPC is introduced. Confirmation and mutation retain the reviewed queued intent,
post-flush generation and earlier explicit Save→New ordering fences.

## Verification

Pop!_OS22.04 Linux amd64; Node24.22.1/Bun1.4.4/Electron45/SQLite3.53.4. Owned private
Xvfb/profile/database/Chromium and public synthetic data only. This does not establish
Debian13 GNOME/KDE Wayland/X11/native AT/high contrast/performance/package acceptance.

- `bun run test:unit -- U1-01`:297 PASS, including124 controller and seven export.
- `bun run test:contracts -- U1-01`:16 PASS, including strict Trash authority,
  required record state and preserved cross-filter wire refinement. Earlier
  pin/archive missing-field regressions retain otherwise valid complete fixtures.
- `bun run test:security -- U1-01`:120 PASS:55 main Notes,35 preload,13 Quick and
  17 retained export cases. Nine forged Trash receipt fields, direct content/Pin/
  Archive refusal, synchronous reentry, held unknown deadline/Close/fresh Get/no
  replay, strict caller/filter authority and mixed archive Trash rows are covered.
- `bun run test:integration -- F2-01`:49 existing storage regressions PASS after017.
- `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a bun run test:integration -- U1-01`:
  20 PASS,19 actual owner cases plus production Electron16.36s. Owner tests cover
  schema16→17 snapshot/defaultfalse/source preservation, active+archived Trash CAS/
  same-state/history/reopen/restore, mixed archive+pinned >100-row pagination,
  caller authority/unknown targets and existing saved/draft/search/privacy recovery.
- Actual production: registered launcher/Quick note and rich task editing → wait
  600ms in Trash confirmation with unchanged exact owner record → Keep with no
  flush → deliberate Confirm/latest draft without Save → read-only/direct refusal
  → actual Trash/archive-exclusive/pin/search → exact active Restore → archived
  Trash/Restore retaining read-only archive until separate Restore. Existing real
  export/no-overwrite/cancel, second Quick UUID/preserved outgoing saved/draft,
  native Close/Quit/restart, forced private owner+app crash, exact two-record
  recovery and command-usage privacy remain passing. Only native chooser choice
  is instrumented; owner and export writer are real.
- Author131 focused units and43 real Tiptap Chromium cases PASS32.7s. Twelve new
  component affected states and eight new actual screenshots independently clean.
- Full integrated TypeScript/scoped ESLint/render/plan/status/diff PASS.

## Review and identity

Independent backend review file_search_service_sol CLEAN. Main notes IPC SHA256
3896afd8a335693b89ff06a49dc53feee02e451acf873ef8763feb66bf1d1c78;
storage notes c451a6727df3dcc5afaca2e6c1685637b19306a1ec11d41efb6a734df3d9265e;
preload3dc9f7b8fe6e44149f924fc4309eb3c70015e381e2c01e759fe4b19e865439ae.
Independent alias_review_sol UI/source/production scenario/all20 new capture review
CLEAN, no actionable findings. Exact19-file author patch reconciled against every
per-file hash; shared contract/freeze bytes unchanged. Patch SHA256
2c5bb05601541d35356fcf4fcfe4c1df51c6263e4776b5ca0ddee3e9bb84d4a1;
manifest0b3a80f6d32607594ffb22f9f210979399c157468a6733e3006240c19db51611.
Runtime controller61baf94033ce5f621ab04a84270b8a838fb0f01c21bb4706b32515a9fb3167af;
view1cbfeaff4a3a62460132a1fdfc9543657364a1da0f3dbd1e4cbd1657b2e7591f.
Current PR CI/configured GitHub reviews and normal expected-head merge still precede
integration; no commit/merge acceptance inferred from local evidence.

## Design and captures

DESIGN.md Shell/navigation, Results/actions, List/detail/form, Chat and notes,
States/motion, Accessibility and Review gate; existing shared controls/tokens.
Actual images in this directory, each-{dark,light}.png:

- notes-trash-confirm-application
- notes-trash-application
- notes-trash-restored-application
- notes-trash-restored-archived-application

Twelve component images in packages/notes/evidence cover both-theme confirmation,
Trash/pinned filter and restored editor, plus pending, unknown, retained local,
still archived, unavailable and denied states. Historical component PNG churn was
restored; prior actual images regenerate with current controls and footer.

## Still required

Permanent deletion/Empty Trash, revision restore, attachments, root Notes provider,
full Markdown import/roundtrip/native chooser interaction, broader D1/native AT,
Debian/session/high contrast/performance/package/release acceptance remain required.
Private SQLite is unencrypted; edits without durable acknowledgment may be lost on
forced crash. No full U1-01, platform or Goal completion claim.
