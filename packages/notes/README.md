# Notes create/edit application increment

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

## Author verification — 29 October 2026

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
Coordinator production persistence/crash/restart integration remains separate.
U1-01-AC02 Markdown roundtrip is not implemented or accepted. Pin/archive/trash/
restore/revision restore/export, root Notes provider, Quicknote and full native
Debian GNOME/KDE Wayland/X11/AT/session/performance/package/release acceptance
remain required. Reviewed primitives do not establish full D1-02 acceptance.
