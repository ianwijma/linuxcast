# Linuxcast handoff — 31 October 2026

Resume the complete agreed local 1.0 objective, covering all 97 tasks through
R1-03 and every release gate. This handoff is unfinished work, not a release or
feature-completion claim. The user requested wrapping this thread so work can
continue in another thread. No further feature has been started.

Draft handoff PR: https://github.com/ianwijma/linuxcast/pull/77.
The signed source snapshot is `41824ea9b5fd422e3ea3654b91a83e1762e73b88`;
its planning CI41181103805 passed. The draft remains unmerged because of the two
application blockers below.

## Start here

Use `/home/ian/Projects/ianwijma/linuxcast/.worktrees/linuxcast-notes-markdown-import`
on branch `codex/notes-markdown-import`. It contains the consolidated coordinator
and latest author source, tests, fixtures, captures and reports. Preserve the
separate author checkout `.worktrees/linuxcast-notes-markdown-import-ui` on
`codex/notes-markdown-import-ui` as a reference; do not copy its older report over
the handoff warning. No subagents are running; old agent IDs and temporary `/tmp`
review/patch files must not be assumed available in the next thread.

Read the original objective at
`/home/ian/.codex/attachments/78a55eec-f708-4e08-b951-d8db53af7f4f/goal-objective.md`,
AGENTS.md, PLAN, ROADMAP, tasks.json, U1-01's full task card and normative references,
security.md, DESIGN.md and tokens.json. Then read
`packages/notes/MARKDOWN-IMPORT-INCREMENT.md`, this handoff and PROGRESS.md.

Persistent user decisions:

- All subagents use **GPT-6.1 SOL, high**. No Astra agents.
- Prefer small reviewed, tested application increments and merge them promptly.
  Partial feature scope must be explicit; do not merge a known broken application
  path or bypass security, CI, required reviews or branch rules.
- Keep the complete 1.0 scope. No MVP substitution or expansion into research/proof
  assignments. Continue using the existing shell, storage and shared UI.
- Coordinator owns shared contracts, manifests/lockfile, migrations, routing and
  registry/cards. Delegate only bounded, disjoint application work in isolated
  `codex/` worktrees. Old partial prerequisites do not establish acceptance.
- Normal signed commits/push/PR/merge are authorized. Preserve 1Password signing
  configuration; it worked for the last integrated commit. Do not repeat old
  unlock requests without a new real signing failure.

## Integrated and verified baseline

Primary checkout: `/home/ian/Projects/ianwijma/linuxcast`, branch `develop`, clean
at `09de566dc3773b058be7c43e517956bd08ef7fcb` when this handoff was prepared.
PR75 added captured-clock Quicklinks; PR76 added confirmed whole-Trash deletion.
Both are merged. Do not reimplement or reopen their old signing blockers.

PR76: https://github.com/ianwijma/linuxcast/pull/76, normal merge at
29 October 2026 15:07:04 UTC. Exact signed head
`31ca944f9158fd4c44cb126a3d8db9a9573de20f` was cryptographically verified.
Planning CI40898183866 passed; no requested/submitted GitHub reviews, comments or
threads; develop unprotected/rules empty, no bypass. Its 417 unit, 34 contract,
245 security, 80 browser and 39 integration checks passed, including two production
sandboxed Electron scenarios. Full Notes/native/session/release acceptance remained
pending. See `apps/desktop/evidence/notes-empty-trash-application.md`.

## Current unfinished increment: U1-01 Markdown import

Frozen flow: registered Notes command → existing workspace → choose a local
Markdown file → bounded read/parse → read-only title/body/tasks review → no-effect
Cancel or separate Create imported note → existing normal owner draft write →
edit/Save/export/root search/restart. Preserve outgoing saved/draft/flags exactly.
No new service, migration, dependency, resource loading, raw HTML rendering or
renderer filesystem authority.

Coordinator code adds optional `NotesApi.chooseMarkdownImport`, strict named IPC,
preload, descriptor-relative no-follow regular-file reading (512 KiB, fatal UTF-8,
metadata checks), read deadline and actual-operation reservations, main lifecycle
fences and an actual application scenario. Author code adds parser, controller,
preview UI, additive import labels in the existing editor and new tests/captures.
The latest four author source hashes and all 18 author-owned files are recorded
in `handoff/markdown-import-source-manifest.json`. The source was consolidated
without claiming a final assembled pass.

Two confirmed **merge blockers** remain:

1. **Parser output is not always JSON-wire safe.** Tiptap can retain own optional
   properties such as `content: undefined`. The custom NoteContent validator accepts
   them, but the storage repository JSON envelope correctly rejects them. Actual
   Create reaches a fresh-ID Get returning null, then the storage utility reports
   `unavailable / invalid-request`; creation becomes uncertain and subsequent reads
   fail. Normalize only the parser's permitted optional undefined properties away,
   then validate closed content and JSON-wire safety. Add a regression validating
   the exact imported `notes.write` repository request, including empty/leaf nodes,
   tasks, breaks/dividers and code. Do not weaken storage JSON/receipt validation.
2. **Combined escaped literal text plus a boundary newline loses text.** In pinned
   Node, importing an export of a paragraph containing
   `\nPublic Unicode 雪 🐧 and literal <script>inert</script> [link](https://example.org)\n`
   produces a literal trailing `&#10;` instead of LF. The narrow exporter boundary-LF
   entity change fixed simpler cases, not this combination. Fix the correct text
   token parse stage exactly once using maintained public Tiptap APIs; preserve
   literal entities and code without globally decoding final text. Core exports
   `decodeHtmlEntities`; Text's parseMarkdown handler and parseChildren/inline paths
   are the relevant library implementation. No custom parser or new dependency is
   justified by this finding. Add the combined regression and preserve source data.

Previously resolved findings to preserve: monotonic read expiry after awaits and
parse, actual slot held through settlement, import availability notifications after
Export/Save/New/metadata/single-delete, meaningful Create/Cancel focus, and the
existing selected-open single-publication/reentrancy fence. Latest author controller
`0389b14c…a579123` restores that opening fence; rendered readiness uses public reading
state while method admission still checks private opening ownership. The previous
assembled controller `dbbb7dbc…2262619` failed that existing launcher regression and
must not be restored. Latest parser `5b8e21fa…775100e` separates title and body caps;
keep the 256-byte title + 64 KiB body regression.

## Validation history and immediate finish sequence

The author report preserves its own component results (283 Notes units and eight
browser cases), initial failures and limitations. It now carries an explicit
superseding warning about the two actual application failures. Those component
passes do not establish application integration or full AC02.

Fresh handoff validation on the consolidated source: **463 unit /12files /1.91s,
36 contracts /5files /0.345s and258 security /12files /1.06s PASS**. Full pinned
TypeScript, task rendering/plan validation/status and whitespace checks also pass.
These checks do not cover or waive the two known failing application cases.

Earlier coordinator checks: 36 contracts and 258 security passed; 461 units passed
before later controller/parser changes. A later 462-unit run had one meaningful
selected-open publication failure, fixed in the latest consolidated author source.
Mapped browser attempt: six failed to start /82 not run because sandboxed loopback
listen returned EPERM. Rerun with authorized loopback access; this is not a browser
success or an application behavior failure.

Actual new scenario has **not passed**. It verified export, chooser cancellation,
unsupported-file refusal, read-only review and Escape/Cancel preservation, then
failed on creation as above. Two actual review screenshots are intermediate
artifacts, not final acceptance evidence. Temporary public-fixture transport
observation confirmed the invalid request and has been removed from the test.
Native chooser choices are instrumented; real file/owner/application operations
are separate from native chooser and supported desktop acceptance.

After fixing the two blockers, run focused regressions, map the final tests and
run appropriate U1-01 unit/contracts/security/UI/integration checks. The production
scenario is `apps/desktop/tests/notes-markdown-import.integration.test.ts`; it also
checks second export, edit/Save, actual launcher Arrow/Enter, Quit/restart, exact
unrelated preservation and privacy. It may reveal further integration defects;
resolve them rather than editing assertions to simulate success. Complete final
independent source/capture/evidence review, then sign/push, make the draft PR ready,
inspect current-head CI/reviews/rules and merge normally with expected-head matching.
Record the merge and immediately select the next bounded application work.

Pinned runtime prefix:
`/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools` (Node24.22.1/Bun1.4.4).
Use `node scripts/test-runner/run.ts <suite> U1-01` after putting it first on PATH.
Actual integration requires an owned private Xvfb display:
`BUN_TMPDIR=/tmp LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a node scripts/test-runner/run.ts integration U1-01`.
If Electron's dist is absent, the previous verified executable was supplied via
`ELECTRON_OVERRIDE_DIST_PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/linuxcast-emoji-ui/node_modules/electron/dist`.
Existing SQLite addon rebuild: `node apps/desktop/setup-sqlite.ts`. Do not change
production sandbox settings. Git metadata/network/native runtime actions may need
normal sandbox escalation; existing authorization applies.

All 741 historical tracked PNGs were verified byte-identical during handoff.
Keep them unchanged after tests recapture them; retain new affected-state captures.
Do not rely on expired `/tmp` baseline or review JSON files. Rebuild baselines from
Git when needed. No manifests or lockfiles changed.

All four U1-01 criteria remain pending. Registry totals remain 8 done,20 in progress,
69 planned;56 passed criteria,325 pending,8 justified N/A. Full prerequisites,
attachments, remaining Markdown coverage, Debian13 GNOME/KDE Wayland/X11, native AT,
high contrast/performance, packaging and all release gates remain required. The
complete 1.0 objective is not complete.
