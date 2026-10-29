# U1-01 — pin/unpin and Pinned filter application increment

29 October 2026. Integrated in [PR59](https://github.com/ianwijma/linuxcast/pull/59),
merge2aa49e540c8be6ea1fba1e0e85e945975fa88542, reviewed signed head
b25b2f8d9c77f7833d9cc91c342b8726de5ea0dd, CI40800718606 PASS. No requested or
submitted GitHub reviews/comments/threads. Based on integrated PR58/develop
b945289012c53a05a71193f9650df5a12ce06dfc. Coordinator codex/notes-pin;
UI author codex/notes-pin-ui. Full U1-01 and all four acceptance criteria remain
pending; this is another user-approved small unfinished application increment.

## Behavior and boundaries

Pin note/Unpin note changes stored metadata, not the editor document. The UI first
flushes the latest local draft without Save, then submits only id, expected revision
and explicit desired pinned boolean. Pin is never optimistic. A successful receipt
must have the next revision and exact requested state while preserving draft,
saved version, creation/modification timestamps. No saved revision is added.

Pinned only filters actual owner SQL before pagination, combines with local title/
body search and retains existing stable updatedAt/id ordering. Query/filter changes
reset cursor and generation; client/main/preload/UI check normalized filter echoes
and every pinned row. Unpinning in this view removes the row after owner refresh
while retaining the selected editor and content. A textual Pinned accessory avoids
relying on color. Missing capability stays visibly unavailable.

Schema015 adds checked defaultfalse pin metadata and an index. Existing schema14
notes preserve content/revision/timestamps and migrate to unpinned; the owner takes
its existing consistent recovery snapshot. Metadata CAS increments revision once,
including explicit same-state operations; unknown targets/stale revisions refuse.
Ordinary draft/Save preserve the current pin. New records begin unpinned.

Named schema/sender/main-frame authority, shared actual write slot, export exclusion,
pre-dispatch deadline checks and exact receipts remain enforced. Close/Quit cannot
destroy the owner during an admitted metadata mutation. Deadline/unknown outcomes
retain the actual operation slot and uncertainty fence until settlement and explicit
fresh Get reconciliation; there is no automatic replay. The controller reserves
queued intents synchronously and rechecks ownership after flush to prevent Pin
racing with navigation/Close. Local edits remain available for explicit recovery.
No new dependency/service/helper, permission grant, network, AI or filesystem export
is introduced by pinning. Ordinary private SQLite remains unencrypted at rest.

## Verification

Development host Pop!_OS22.04 Linux amd64; Node24.22.1/Bun1.4.4/Electron45.0.0/
SQLite3.53.4. Owned private Xvfb X11/profile and public synthetic data only. Neither
Xvfb nor headless Chromium establishes Debian13 GNOME/KDE Wayland/X11/nativeAT.

- `bun run test:unit -- U1-01`: 228 PASS, including56 Notes controller cases
  (26 new pin/filter/receipt/reentry cases),7 export,12 serializer and existing
  launcher/catalogue/search regressions. Three queued-intent/post-flush regressions
  cover both Pin/navigation/Close orderings without discarding a known receipt.
- `bun run test:contracts -- U1-01`: 14 PASS, including strict existing identity/
  positive revision/boolean authority and required record/summary pin metadata.
- `bun run test:security -- U1-01`: 67 PASS: main/preload sender/request checks,
  exact pin/id/revision/content/saved/timestamp receipts, synchronous backend reentry,
  retained actual slot/deadline/fresh-read uncertainty, Close and filter echo/row
  gates, plus existing export private-file/symlink/cancellation/owner boundaries.
- `bun run test:integration -- F2-01`: 49 existing storage/migration/recovery cases
  PASS after schema015, without weakening recovery or keyring expectations.
- UI author: 63 focused controller/export cases and25 real Tiptap Chromium cases
  PASS (19.3s), comprising19 retained and6 new browser cases: dark/light owner-filter
  and unpin/retained editor, checkbox Space/focus, pending held/IME-key gating,
  unknown/confirmed Reload without replay or local loss, missing API and known
  refusal/deliberate retry. Tested axe states report zero violations. Nine new
  affected public captures independently inspected; no new visual language.
- `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a bun run test:integration -- U1-01`:
  12 PASS: eleven actual Notes owner cases and production Electron scenario7.91s.
  Owner tests include schema14→15 snapshot/defaultfalse/preserved source, metadata
  CAS/history/timestamps, reopening, preserved pin through Save and >100 matching
  pinned rows paginated without duplicates or accidental inclusion of unpinned
  source records. Title/body queries and command-usage privacy are checked.
  The production flow uses registered launcher Notes, real editor and SQLite:
  checked rich task/Unicode/literal script-looking text → Pin exact preserved
  saved/draft/timestamps → Pinned only → Unpin/empty filtered list with editor
  retained → Pin again → both-theme captures/axe → real Markdown export with
  native chooser choice instrumented → no overwrite/cancel → actual title/body
  search → nativeClose/Quit flush/restart → force only private owner/application
  processes to stop after durable draft ACK → recover exact revision/saved/draft
  and pinned=true → reopen owner/privacy check. No external requests or script/
  link execution. Native chooser interaction itself remains pending.
- Final full `bun run typecheck`, scoped ESLint, plan integrity and diff checks
  PASS. Restricted compiler launches segfaulted without diagnostics; the required
  compiler completed normally outside that process sandbox after UI integration.
  No crash was treated as a successful check.

## Review, identity and visual evidence

Independent file_search_service_sol reviewed coordinator contract/migration/owner/
client/main/preload and tests clean; notes-ipc.ts SHA256
ce28e091424e1d38e7023186f9ed629ff6e1ecfbfaac99eb8c9e593dd6eb4c3d.
Independent alias_review_sol closed the queued Pin/navigation/Close P2 and inspected
all nine affected component captures clean. Exact16-file author patch applied and
per-file hashes reconciled: /tmp/linuxcast-notes-pin-ui-owned.patch SHA256
1f018a755e10a772973b454c2953fdb3dc4199f61840961163f27d016feb46db.
No shared contracts/freeze were included in the author patch; no unsigned commit.

Actual new captures: `notes-pin-application-dark.png` and
`notes-pin-application-light.png` in this directory. Eight prior application
captures regenerated because pin controls are now visible. Component captures in
packages/notes/evidence/: dark/light-notes-pinned-filter, dark/light-notes-unpin-
filter-empty, dark-notes-pin-pending, light-notes-pin-unknown/reconciled/unavailable,
dark-notes-pin-denied (all .png). Prior component captures retain historical
increment evidence; the nine new states show current pin behavior.

Design: Shell/navigation, Results/actions, List/detail/form, Chat and notes,
States/motion and Accessibility; shared host controls/tokens and labelled checkbox.

## Still required

Archive/trash/restore, revision restore, attachments, root Notes provider and Quick
note remain required. Full Markdown import/roundtrip, native chooser interaction,
Debian13 amd64 GNOME/KDE Wayland/X11, nativeAT/highcontrast/performance and package/
release acceptance remain pending. Pin pending/unknown UI and main boundaries have
fixture/unit evidence; the production scenario proves the listed successful real
flow, not the whole desktop/session/failure matrix. No full D1-02/U1-01/release or
Goal completion claim. Unacknowledged local edits can be lost on forced crash.
