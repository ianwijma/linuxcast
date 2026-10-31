# U1-01 Markdown import application increment

31 October 2026. Branch `codex/notes-markdown-import`, base merged PR76
`09de566dc3773b058be7c43e517956bd08ef7fcb`, PR77
<https://github.com/ianwijma/linuxcast/pull/77>. This is a bounded, unfinished
U1-01 increment, not complete Notes or local 1.0 acceptance. F2-01 is accepted;
broader D1-02/native accessibility prerequisites remain outstanding under the
approved partial foundation sequencing.

## Concrete behaviour and boundaries

Registered Notes → Import Markdown → selected local file → read-only title/body/
task review → Cancel/Escape without writes, or separate Create imported note.
Create uses the existing sole SQLite owner, new UUID, expectedRevision0 and normal
draft write. It preserves the outgoing note's saved version, draft and flags.
The new draft can be edited, explicitly saved, exported and opened from root search
after restart. Fonts, colours, layout and undo history are disclosed as unsupported
before Create. Unsupported HTML, explicit links, images and tables are refused;
escaped literal markup and code stay inert. No dependency, migration, new service,
resource loading or renderer filesystem authority was added.

Main accepts only the named, schema-checked IPC from the current Notes frame.
The native chooser supplies the path; descriptor-relative no-follow reads accept
only a bounded unchanged regular file, with fatal UTF-8 decoding, abort/deadline
checks and an actual-operation reservation retained until settlement. Cancellation,
invalid source, unavailable capability and stale frame return safe actionable
outcomes. The controller fences competing operations through chooser/review/Create,
reserves synchronously, checks exact write receipts and retains the imported text
and stable UUID for manual existing recovery after uncertain creation. It never
automatically replays an uncertain write.

## Handoff blockers resolved

The first continuation regression run failed four checks on the unchanged handoff:
two imported repository envelopes failed strict JSON validation, and two combined
escaped HTML/link/entity paragraphs retained a trailing literal `&#10;`.

Tiptap helpers retain optional undefined node fields. After bounded closed-schema
validation, the parser removes only permitted optional undefined fields, then
validates the closed result and the repository's existing JSON-value schema.
Regression requests pass through `parseRepositoryRequest` with the actual
`notes.write` contract, including empty paragraphs, tasks, breaks/dividers and code.
Storage request and receipt guards remain unchanged.

The lexer can split a boundary entity between an inert bare-URL token and adjacent
text. Public Tiptap extension hooks rejoin only those literal text runs before
maintained text parsing, and the Text parseChildren path decodes entities once via
core `decodeHtmlEntities`. Code and escaped characters remain separate. An initial
text-only handler change did not fix the split; an intermediate flattening change
lost task text and was rejected by existing tests. The final implementation keeps
each flattened node, including nested TaskItem, without duplicate child handlers.
Combined escaping, literal entities, code, Unicode, source immutability and the
independent 256-byte title/64KiB body limits all pass. Temporary diagnostics removed.

## Validation

Pop!_OS22.04 amd64, Linux7.1.1, pinned Node24.22.1/Bun1.4.4,
Electron45/SQLite3.53.4/Tiptap3.32.0, Chromium Playwright1.64.1.
Put `/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools` first on PATH.
The existing Electron dist was supplied with `ELECTRON_OVERRIDE_DIST_PATH` from
the retained `linuxcast-emoji-ui` worktree. Production sandbox settings unchanged.

- Focused actual import/export regressions: 45 PASS, 2 files, 0.555s.
- `node scripts/test-runner/run.ts unit U1-01`: 469 PASS, 12 files, 1.95s.
- `node scripts/test-runner/run.ts contracts U1-01`: 36 PASS, 5 files, 0.339s.
- `node scripts/test-runner/run.ts security U1-01`: 258 PASS, 12 files, 1.07s.
- `node scripts/test-runner/run.ts ui U1-01`: all 88 PASS together, 43.1s,
  including eight import cases, keyboard/focus, held/composing Enter, cancellation,
  uncertain creation/late ACK/manual recovery, unavailable/refused states and 200%.
- `BUN_TMPDIR=/tmp LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a node scripts/test-runner/run.ts integration U1-01`:
  all 40 PASS, 6 files, 45.21s. Actual import 5.302s, retained Notes 29.636s,
  whole-Trash 5.353s, plus 37 real owner checks.
- Full pinned TypeScript and scoped lint PASS; documentation rendering, plan/status
  validation and whitespace checks run before publication.

The actual production test exports a draft with boundary LF, escaped HTML/link
text, Unicode, checked/nested unchecked tasks and literal code. It verifies chooser
cancellation and unsupported-file refusal, read-only review, default Cancel focus,
Escape and Cancel with no writes, exactly one confirmed new draft, exact text/tasks,
unchanged outgoing/unrelated records, byte-identical second export/source file,
edit/Save, real launcher Arrow/Enter, Quit/restart and persisted-owner reads.
No renderer HTTP(S) requests occur; source paths/content/UUIDs do not enter usage
exports. Native chooser choices are instrumented; file read/publication, owner and
application operations are real. The actual window is resized to1120×1000 for
readable affected-state captures; capture scroll changes do not change app behaviour.

Design: DESIGN.md Tokens, List/grid/detail/form, Chat and notes, States and motion,
Accessibility, Review gate. Existing host primitives/editor/tokens are reused.
Eight component and four actual dark/light review/created captures have axe0.
All741 historical PNGs match develop byte-for-byte after restoring test recaptures.
New actual captures are `notes-markdown-import-application-{review,created}-{dark,light}.png`;
component captures/report are under `packages/notes/evidence/markdown-import-*`.
Final independent source/capture/evidence review and signed publication are pending.

## Partial acceptance and limitations

U1-01-AC01 gains stable imported-draft/owner/restart evidence; AC02 gains actual
application export→import→export text/tasks and unsupported-style disclosure.
UI gains affected-state/keyboard/browser axe checks; PRIVACY gains public synthetic
source/capture and no-resource/usage-export evidence. All four criteria remain
pending: remaining Markdown coverage/attachments, full task scope and prerequisites,
native chooser behaviour, Debian13 GNOME/KDE Wayland/X11, native assistive technology,
high contrast/performance, packaging and release gates are still required.
Private Xvfb and Chromium fixtures do not establish supported-desktop acceptance.
