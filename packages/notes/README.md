# Notes application increments

`Notes({api: NotesApi})` is the actual Tiptap 3.32.0 OSS workspace, exported named
and default from `src/index.tsx`. It uses shared host Button/TextField/ThemeProvider
and semantic tokens, following DESIGN Shell/navigation, Results/actions,
List/detail/form, Chat-and-notes, States/motion and Accessibility.

The library searches owner-projected stored titles/body locally, 100 records per
page with explicit Load more. New note generates one Web Crypto UUID and writes
an Untitled note / empty document draft with expected revision zero. The rich
editor supports headings 1–3, bold/italic/strike/code, lists, tasks, quotes, code
blocks and dividers. `/` opens the real keyboard-controlled block menu. Unicode,
IME, native caret and Tiptap undo/redo are retained. StarterKit links/underline
are disabled and `injectCSS:false`; automatic trailing-node insertion is disabled
to preserve loaded JSON exactly on focus. Editable-state activation emits no
content update and identical content changes are ignored; closed JSON validation bounds each editor
transaction before accepting it. Paste/drop accept bounded literal plain text,
never HTML, files, images, URLs as links or remote assets.

Drafts store after 500 ms. Writes serialize; typing during a write remains local
and the next draft uses the acknowledged revision. Save note / Ctrl+S separately
updates the saved version. Every receipt validates exact ID, next revision,
content using `noteContentKey`, unchanged prior saved content for drafts and
unchanged creation time. Unknown, timeout, conflict or malformed acknowledgements
block writes without replay. Confirmed Reload stored note reconciles owner state
while retaining local content; the user must explicitly Retry draft or Save.
Known rejection retains edits and offers explicit retry. Loading another note
freezes the outgoing editor after flushing, preventing silent loss while reading.

Navigation and native close flush the latest draft. `onCloseRequested` returns
the actual boolean Promise and invokes `api.close` only after a successful flush.
Failure exposes Keep editing, Retry close and explicit Close without latest
changes. Earlier pending writes may already be stored; closing never undoes them.
Disposed/late/reentrant completions cannot start new writes or replace content.
No renderer localStorage, note history, content logging, external requests,
arbitrary HTML or generic IPC is added. Local SQLite is not encrypted at rest.

## Explicit Markdown export

Export Markdown flushes the latest draft without Save, then invokes a named
id/revision-only main API. Main derives the stored content, asks for a native
unencrypted file destination and revalidates the exact owner/draft before private
exclusive publication. Existing names are refused. Pending export freezes editing,
Save and navigation; Close/Quit require finishing or cancelling it. Cancellation
preserves the note. Unknown outcomes require checking the selected file and never
replay automatically. The UI/file notice discloses plaintext, LF normalization,
font/color/layout/undo loss and multiline inline-code plain-text fallback.

Matching MIT Tiptap Markdown3.32.0 and marked17.0.6 are pinned. Twelve bounded
serializer fixtures check selected text/task preservation through its reader;
full import/roundtrip acceptance is pending and its Markdown API is beta.
The follow-on passes 202 mapped unit,13 contract,51 security,19 browser and8
integration cases. The actual private Electron/SQLite scenario passes7.37s;
only the native chooser choice is instrumented. Seven new affected public
captures are inspected. See
[application evidence](../../apps/desktop/evidence/notes-markdown-export-application.md)
and [increment boundary](MARKDOWN-EXPORT-INCREMENT.md).

## Pin/Unpin and Pinned only — 29 October 2026

Selected notes expose Pin note / Unpin note through the optional named API.
The latest local draft is flushed without Save first. No state changes
optimistically: the receipt must have the same ID, revision +1, requested pin,
unchanged draft/saved content and exactly unchanged creation/modification times.
Normal draft/Save acknowledgements must preserve the current pin too. Older
hosts without pin capability show a disabled action and reconnect guidance.

One synchronously admitted Pin promise freezes editing, search/filter/navigation,
New, Save and export. Native Close/Quit are refused while it is pending. Intent
and post-flush fences prevent same-turn Pin/selection/Close races; pending
publication/disposal cannot dispatch another operation. Known refusal permits
explicit retry. Uncertain, conflict, timeout or malformed receipts block writes
until confirmed fresh Reload, retain local content and never replay Pin.

Pinned only is a labelled native checkbox using shared field/focus classes. It
requests owner filtering before pagination, checks the normalized filter echo and
requires every returned filtered row to be pinned. Search/filter changes fence
old pages and reset the cursor; UUID selection stays stable. A confirmed Unpin
can remove the row from filtered results while retaining its exact open editor.
Pinning changes no note content, saved version, history or timestamps.

Current bounded author checks on Linux amd64 / Node24.22.1 / Bun1.4.4:

- 63 focused unit cases: 56 controller (26 new Pin/filter/CAS/race cases) and
  seven retained export cases.
- 25 real Tiptap Chromium cases: 19 retained create/edit/export cases and six
  new keyboard/filter/Pin/Unpin/pending/known/unknown/unavailable cases. Tested
  filter states pass axe; the retained 200% case checks reachable Pin geometry.
- Owned Notes typecheck with existing CSS declarations, scoped ESLint,
  plan integrity and diff checks pass. Full repository typecheck on this frozen
  author base reports only coordinator-owned main/storage fixtures still needing
  the required pinned field; coordinator verifies the integrated complete tree.

Unit selection is
`LINUXCAST_TEST_FILES='["packages/notes/tests/controller.test.ts","packages/notes/tests/export-controller.test.ts"]'`
with the existing Vitest config. Browser selection is the existing notes.ui test
with the existing Playwright config. No dependencies, shared files or test maps
were changed in this lane. Nine affected public images are inspected: both themes
Pinned filter and Unpin-empty with retained editor, dark pending/known refusal,
light unknown/reconciled and missing capability. Existing unrelated regenerated
captures are restored. The fixture is labelled synthetic in-memory persistence;
its request observer is not SQLite, native-close or restart evidence.

This increment contributes partial U1-01-UI/PRIVACY and preserves the bounded
AC01 recovery boundary. Coordinator owner migration/CAS/filter/native workspace
and production reopen evidence remains separate. Full import/Markdown roundtrip,
trash/trash restore/revision restore/attachments, root Notes provider,
Debian GNOME/KDE Wayland/X11/native AT/session/performance/package/release and
all complete U1 acceptance remain required; no whole-task completion is claimed.

## Archive/Restore and archive filtering — 29 October 2026

Archive note flushes the latest draft without Save, then invokes the optional
named metadata API. Restore note and Pin/Unpin on an archived note skip content
writes. Exact receipts require ID, revision +1, the requested flag, unchanged other
flag, draft/saved content and creation/modification times. One admitted metadata
intent serializes Pin/Archive against editing, Save, export, navigation and Close;
post-publication and post-flush checks prevent reentrant dispatch. Missing or
known-refused capabilities give actionable manual retry. Uncertain receipts block
writes until confirmed fresh Reload; no metadata operation replays automatically.

Show archived notes requests archived-only rows from the owner; unchecked means
active-only. It is independent of Pinned only. Both normalized echoes and every
row are checked before publishing; filter changes reset cursor/generation. Archive
can remove a row from Active while retaining its readonly editor. Title, task
checkboxes, formatting, slash commands and Save cannot change archived content.
Restore retains any local edits without sending them: the user reviews and
explicitly retries the draft or Saves. Archived Pin is likewise metadata-only.

Bounded author verification on Linux amd64 / Node24.22.1 / Bun1.4.4:

- 92 focused unit cases: 85 controller and seven retained export cases. The 29
  additions cover archive/filter identities, exact/forged receipts, shared pending
  ownership, refusal/unknown/timeout, retained edits and no replay.
- 32 real Tiptap Chromium cases: 25 retained and seven new Archive/Restore,
  filters, readonly live-slash, pending/known/unknown/missing-capability cases.
  Tested readonly states pass axe. Keyboard filters, held keys and the retained
  IME paths remain covered; 200% checks bound reachable Archive/Restore controls.
- Owned Notes typecheck with the existing CSS declaration, scoped ESLint,
  plan integrity and whitespace checks pass. Full repository typecheck on this
  frozen author base awaits coordinator-owned main/storage fixtures receiving
  the required archived field; those paths are outside this lane.

Commands use the explicit Notes unit/browser selections and existing configs
listed above. Thirteen affected public captures are inspected: both themes
readonly editor, archive+pin filters and restored editor; dark pending, known
refusal and 200%; light unknown, retained readonly, restored local edits and
missing capability. The unknown error is captured after normal editor scrolling,
with its bounds asserted. Unrelated regenerated historical PNGs are restored.
The fixture clearly labels synthetic in-memory persistence and observed requests;
these checks do not establish native/SQLite/restart behaviour.

This supplies partial U1-01-UI/PRIVACY and preserves bounded AC01 recovery
presentation. Coordinator production persistence/native-close/restart evidence is
separate. Full AC02 import/Markdown roundtrip, Trash/trash restore/revision restore,
attachments, root Notes provider and Debian GNOME/KDE Wayland/X11/AT,
session/performance/package/release acceptance remain required. This increment
neither completes U1-01 nor establishes full D1-02 acceptance.

## Registered Quick note presentation — 29 October 2026

The optional host Quick-note request subscribes to the existing New note path and
unsubscribes on disposal. `newNote()` now returns true only after the new UUID's
initial Untitled note / empty-document draft receives an exact confirmed owner
receipt. Normal Notes opening and subscription do not create anything. A later
deliberate request creates a different UUID; no launcher query enters note content.

The outgoing local draft flushes without Save before switching. An admitted New
serializes against duplicate New, metadata, Close, Save and export; already admitted
Close/export prevent creation before their pending state publishes. Post-flush,
publication and disposal fences prevent late dispatch. Busy, failed/uncertain
flushes and archived retained edits return false, retain existing content/recovery
and never recreate or replay automatically. Fresh title focus uses the existing
layout effect. Main/preload attempt IDs and launcher registration are coordinator
work; the component does not invent an event broker or report synthetic durability.

Bounded author checks on Linux amd64 / Node24.22.1 / Bun1.4.4:

- 105 unit cases: 98 controller and seven export; 13 additions cover confirmed
  creation, outgoing draft/no Save, distinct/duplicate UUID requests, known/unknown
  failure, archived retained edits, admitted/reentrant Close/export/Save and disposal.
  A queued explicit Save settles before Quick flushes or changes the outgoing ID.
- 37 actual Tiptap Chromium cases: 32 retained plus five host-callback cases.
  Both themes verify focused empty-draft creation, prior draft preservation and
  deliberate later creation; pending duplicates/Close, unknown no-replay and
  readonly retained-edit refusal are covered. Tested new states pass axe.
  Final-source verification passed 26 cases before a retained initial editor-mount
  timeout; the unchanged-source rerun passed that case and ten skipped cases.
  The earlier pre-review-fix complete run passed all 37 in 25.6 seconds.
- Owned Notes typecheck, scoped ESLint, plan integrity and whitespace checks pass.
  The complete integrated tree and production main/preload/native lifecycle are
  validated by the coordinator separately.

The existing explicit unit/browser selections above run these cases. Five public
captures are inspected: dark/light confirmed Quick draft, dark pending/refused
Close, light unknown outgoing flush and retained archived refusal. The final
readonly refusal uses a taller viewport with bounds assertions so Restore and the
error remain visible. Historical regenerated PNGs are restored. All fixture host
callbacks and persistence are explicitly synthetic observers, not native launcher,
SQLite, restart or supported-session evidence.

This contributes partial U1-01-AC01/UI/PRIVACY presentation evidence. All four U1
criteria remain pending, including full import/Markdown roundtrip, Trash/revision
restore/attachments/root provider and complete Debian GNOME/KDE Wayland/X11,
native AT/session/performance/package/release scope. Integrated shared primitives
do not establish full D1-02 acceptance.

## Earlier create/edit author verification — 29 October 2026

Linux amd64, Node 24.22.1, Bun 1.4.4, installed Chromium via Playwright:

- 30 controller cases: serialized draft/Save/new UUID, exact and forged receipts,
  retained edits, stale reads/query, confirmed reconciliation/no replay, timeout,
  close success/failure, outgoing-editor and reentrant close fences, disposal/publication.
- 14 real Tiptap Chromium cases: both themes, create/edit/tasks, slash
  Arrow/Enter/Escape/IME, Unicode undo/redo, literal plain paste/no external
  request, title/body search, Ctrl+S/held/composing keys, pending/conflict/unknown,
  reconciliation and close choices, recovered-draft activation without implicit updates,
  empty/loading/unavailable and 200% geometry.
  axe reports no violations in tested editor/200% states. Strict fixture CSP uses
  external stylesheets; a computed-style assertion prevents unstyled evidence.
- Full typecheck, scoped ESLint, plan integrity and diff whitespace checks.

Commands use the repository test configs and explicit file selection:
`LINUXCAST_TEST_FILES='["packages/notes/tests/controller.test.ts"]' bun x vitest run --config scripts/test-runner/vitest.config.ts`
and `LINUXCAST_TEST_FILES='["packages/notes/tests/notes.ui.test.ts"]' bun x playwright test --config scripts/test-runner/playwright.config.ts`.
`bun run typecheck`, scoped `bun x eslint ... --max-warnings 0`,
`python3 scripts/validate_plan.py` and `git diff --check` cover static checks.

14 inspected public captures in `evidence/`: dark/light editor and empty library;
dark slash, loading, pending Save, close recovery and 200%; light search failure,
conflict/unknown and their reconciled local drafts. Reduced motion stabilizes
captures; the 200% image records an explicitly scrolled editor with reachable
Save verified separately. Fixture requests are observed against synthetic
in-memory data, **not** SQLite/crash/native-close evidence.

This supports partial U1-01-AC01 recovery presentation, U1-01-UI and PRIVACY only.
Coordinator production persistence/crash/restart evidence is recorded separately in
apps/desktop/evidence/notes-create-edit-application.md and the export evidence above.
U1-01-AC02 Markdown roundtrip is not implemented or accepted. Trash/
trash restore/revision restore, root Notes provider and full native
Debian GNOME/KDE Wayland/X11/AT/session/performance/package/release acceptance
remain required. Reviewed primitives do not establish full D1-02 acceptance.
