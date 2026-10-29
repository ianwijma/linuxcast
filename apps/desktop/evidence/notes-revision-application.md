# U1-01 — saved revision review and restore as draft

Integration update, 29 October 2026: merged [PR63](https://github.com/ianwijma/linuxcast/pull/63) at `89d91af034b327a6ce3621c33cce3d661cb33dac`. Configured signing is repaired. The original review-time baseline/publication statements below are historical; PR62/63/64 are now all integrated. Validation limits and outstanding full task/desktop/release acceptance remain unchanged.

29 October 2026. User-authorized reviewed/tested unfinished application increment.
Coordinator `codex/notes-revision-restore`; UI `codex/notes-revision-ui`. Based on
PR61/develop f00984e plus the separate reviewed Trash snapshot TREE
b938e51c65efa363b457d61d04c0dd26aafc8919. Trash signing/publication is blocked on
1Password; neither Trash nor this follow-on is integrated yet. Publish Trash first.
All four U1 acceptance criteria, broader D1 and release acceptance remain pending.

## Behavior and boundary

Saved revisions reserves the exact selected note context, waits for an already
admitted Save and stores an ordinary editable dirty draft without Save before
reading history. Paused/retained or readonly edits are never replayed implicitly.
Competing edits, search/navigation, New/Quick, metadata, export and Close are fenced.
History returns at most50 metadata summaries, newest revision first. One explicit
selection reads one closed rich document with matching note/current/source revision,
title and creation timestamp. Rich preview is readonly, including checked tasks
and literal Unicode. Cancel/closing the review never restores or Saves.

Restore as draft opens explicit confirmation with Keep current draft focused first.
The disclosure says it replaces the latest draft/retained local edits and leaves
Save unchanged. Confirm dispatches only the exact note/current/source revision;
main rereads the owner source and the sole SQLite owner derives content. Draft,
search projection and modified time update at CAS+1; saved content, history, pin,
archive, Trash and creation time are preserved. Separate explicit Save remains
necessary to replace the saved version. No optimistic replacement or automatic
replay follows refusal, timeout or uncertain outcomes. Actual delivered writes
retain the shared mutation/export/Close slot; only settled fresh Get reconciles
uncertainty. Late preview results cannot replace a newer selection or disposed UI.

Archived/trashed history is readable; restoring its saved revision is refused in
UI, main and owner until that note is restored active. Missing, pruned, coalesced,
foreign or stale revisions refuse without substitution. Corrupt historical content
is preserved and cannot restore. Existing last50/per-minute coalescing needs no
new migration, dependency, permission, service or backup mechanism. No renderer
Node/network, caller content/path/SQL or executable rich content is introduced.

## Verification

Pop!_OS22.04 Linux amd64; Node24.22.1/Bun1.4.4/Electron45/SQLite3.53.4; owned private
Xvfb X11/profile/database and public synthetic content. Chromium component fixtures
are synthetic observers. Neither establishes Debian13 GNOME/KDE Wayland/X11/native
AT/high contrast/performance/package acceptance.

- `bun run test:unit -- U1-01`:330 PASS, including157 Notes controller and seven
  export cases. Author focused164 PASS; captured Save, exact reads/receipts, retained
  edits/readonly, preview generations/disposal, cancellation and no replay covered.
- `bun run test:contracts -- U1-01`:20 PASS, including50/51 limits, strict descending/
  unique/current bounds, metadata-only summaries, closed preview/byte caps and strict
  named wire/repository selections without caller source authority.
- `bun run test:security -- U1-01`:156 PASS, including71 main Notes,44 preload,11
  pure fake-transport Notes client,13 Quick and17 retained export cases. Covers
  forged identities/current/source versions/restore receipts, readonly predispatch,
  late preflight, retained actual write slot/unknown deadline, Close and fresh Get
  reconciliation. New client cases are explicitly mapped into U1 security.
- `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a bun run test:integration -- U1-01`:
  24 PASS:23 actual SQLite owner and production Electron19.94s. Owner coverage:
  multiple minute-separated saved versions, exact older rich/task/Unicode selection,
  draft-only CAS/search/reopen/privacy, last50/coalescing/replaced/pruned refusal,
  revision order after clock rollback, readonly/stale/foreign/caller authority and
  corrupt source preservation.
- Production: actual registered launcher/Quick → create/edit/save rich task →
  retained Archive/Trash flows → normal local dirty draft flush/open history →
  owner-backed exact source readonly preview →600ms confirmation/Keep with unchanged
  exact stored record → deliberate confirmed Restore as draft preserving saved/
  history/flags → real export/no-overwrite/cancel → second Quick UUID/native Close/
  Quit/restart/forced private owner+app crash → exact two-record recovery/privacy.
  Only native chooser choice is instrumented; storage and export writer are real.
  Production chooses the latest retained saved version; older selection is covered
  by actual owner and component tests, not falsely claimed in this desktop scenario.
- Author50 distinct real Tiptap Chromium cases PASS across45 then targeted5 after
  a fractional capture geometry assertion (759.34375≤759). Test-only +1px rounding
  tolerance fixed that assertion; this was not one clean full50 run. Sixteen new
  component affected captures independently inspected.
- Full integrated TypeScript compiler PASS via direct pinned Node invocation. An
  earlier Bun-launched full compiler SIGSEGV is not counted as a pass. Scoped
  ESLint on19 revision-changed TypeScript files PASS. Plan/diff checks recorded
  in the coordinator checkpoint.

Two initial production attempts failed before completion: expected empty-window
Close raced locator completion, then the version button's accessible name included
its timestamp. The test now accepts only an actually closed expected window, selects
the exact revision/title within history, and bounds cleanup to its owned process.
The successful mapped run also corrects two preview captures using normal region
scrolling and bounds assertions. Historical PNGs retain baseline bytes; only six
new production captures belong to this increment. Final outbound-request observation
is attached to every Notes window, including Quick and reopened windows; its final
application-only run PASS20.02s.

## Review and identity

Independent backend review file_search_service_sol CLEAN. Storage notes SHA256
73a49f5d0dc8a3de663fb7f72a3416173b603ab5bcc2b96969fb2d862d5286ec;
main notes IPC ef053b9a187e9e2919c28ee2d52d7838b38293b53a2d788e0cf9e968e39348bf;
preload b760cc68e8a02c84801cbca7fb438f44b7543651100c54d2c59574521f8410cd.

Independent alias_review_sol UI/controller/production-source review CLEAN. Initial
clipped preview capture finding is closed after inspecting both corrected images.
All16 component and six production captures independently inspected. Final23-file
owned UI patch5c85dd24ffd9099155bf814b88872c7b46c89c2e0158b9a8f0ab9177e1aa1330
and manifest486e6e6e21567b45fba810d5db77c5eee2dcaac8b7f6c830e82301420bff2cba
reconcile every file hash. No baseline deletions/shared changes in that owned delta.
Controller72f75fc5a3669545f16ea757a1e52be48d5154c0eca4cf0aeb5701607b710b13;
editor716a84e19218612361a826a613568130fb516bbcd92d7c46007fa1d74a4ac85b;
viewabe19f424338fcded7140fcb06fecf2b19d82ed00c3cac7ed577610c5caeffac.
Contractedde21ca343dc361202f59a209e5a889b493a112adea905dda0dae27dfe72777.

## Design and captures

DESIGN.md Shell/navigation, Results/actions, List/detail/forms, Chat and notes,
States/motion, Accessibility and Review gate; shared host controls/tokens.
Six production images, each-{dark,light}.png in this directory:

- notes-revision-preview-application
- notes-revision-confirm-application
- notes-revision-restored-application

Sixteen component images in packages/notes/evidence cover dark/light list, readonly
rich preview, confirmation, restored draft and loading/error/unsupported/
readonly/pending/unknown/refused/200% action states.

## Still required

Signed publication, current-head CI/configured GitHub reviews and normal merge for
Trash then this revision increment remain. Permanent deletion/Empty Trash,
attachments, root Notes provider, full Markdown import/roundtrip/native chooser,
broader D1/native AT/Debian sessions/high contrast/performance/package/release remain
required. Ordinary private SQLite is unencrypted; unacknowledged edits may be lost
on forced crash. No full U1, platform, release or Goal completion claim.
