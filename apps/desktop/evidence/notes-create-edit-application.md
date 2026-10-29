# U1-01 Notes create/edit application increment

29 October 2026. This is a reviewed application increment with explicitly
unfinished acceptance. U1-01 remains in progress; the complete local 1.0 scope
and security requirements are unchanged. No Notes PR/merge exists yet because
the configured 1Password signer has rejected the normal signed commit retries.
No signing configuration was changed and no unsigned commit was created.

## Result and boundaries

The production launcher's registered **Notes** command opens a separate workspace.
New note, title and real Tiptap 3.32.0 OSS body editing, formatting, slash insertion,
task checkboxes, title/body search, transactional 500 ms drafts and separate Save
are implemented. Close and Quit flush the latest draft. A stored draft and the
last explicitly saved version remain separate across reopen/restart/crash.

The existing single SQLite owner applies migration 014 with a pre-migration
consistent snapshot. Revision CAS prevents stale overwrites; the owner derives
search projection and stores at most 50 coalesced saved revision buckets, ordered
by revision even after wall-clock rollback. Draft writes do not create saved
history. Ordinary private SQLite is **not encrypted at rest**. No Notes data goes
to AI, network, diagnostics, command usage exports or renderer persistent storage.

The window uses the shared hardened sandboxed/context-isolated/Node-free
preferences and self-only CSP. Named Notes preload methods expose no SQL, file
paths, generic IPC, network, execution or credential authority. Closed structured
JSON validation bounds 64 KiB text, 256 KiB document JSON, 4096 nodes and depth 16.
Paste/drop accept bounded literal plain text; no HTML, images, links or custom
nodes are loaded. Exact write receipts preserve prior saved content/creation time;
uncertain outcomes require an explicit fresh read and deliberate next action.
The actual mutation slot survives caller timeout, and an elapsed preflight cannot
start a late write. Per-note uncertainty fences are bounded and never evicted;
reads predating a mutation cannot reconcile its newer uncertain outcome.

Design references: DESIGN Shell/navigation, Components Results/actions and
List/grid/detail/form, Chat-and-notes, States/motion and Accessibility. Shared
Button/TextField/ThemeProvider, semantic tokens and existing fonts are used.

## Verification and review

Development host: Pop!_OS 22.04 LTS Linux amd64; Node 24.22.1, Bun 1.4.4,
Electron 45.0.0, SQLite 3.53.4. Production application tests use a new private
Xvfb X11 display and disposable profile/data/runtime/home, not the user's session.
No `--no-sandbox`, real-user files, keyring, input devices or live desktop are used.

- `bun run test:unit -- U1-01`: 183 passed on final source.
  Includes 30 Notes controller cases, launcher routing/visibility/receipts,
  complete-catalogue limits and search. Ten fixed commands plus 4096 applications,
  1000 workflow commands and 500 Quicklinks require the shared ceiling 5606.
- `bun run test:contracts -- U1-01`: 11 passed, including closed rich grammar,
  unsupported/executable input, bytes/depth/width/cycles and stable content keys.
- `bun run test:security -- U1-01`: 28 passed across main IPC and preload,
  including sender/frame/lifecycle gates, known failures, forged receipts,
  deadlines, two-note uncertainty and both older-read reconciliation races.
- Actual owner `packages/storage/tests/notes.integration.test.ts`: 7 passed,
  covering migration 13→14 snapshot/settings, durable saved/draft reopen, CAS,
  literal Unicode/wildcard title/body search and paging, malformed input rollback,
  revision coalescing/clock rollback and forged initial draft receipts/no replay.
- `bun run test:ui -- U1-01`: 14 real Tiptap Chromium cases passed in 10.9 s on final integrated source (author run also passed).
  Dark/light, empty/loading/failure, slash/Arrow/Enter/Escape/IME, tasks, literal
  paste, Unicode undo/redo, 500 ms draft versus explicit Save, held keys,
  uncertain/conflict reconciliation, close choices and 200% controls. Tested axe
  states have zero violations. Component fixtures are synthetic in-memory storage.
- Production `apps/desktop/tests/notes.integration.test.ts` first passed in 5.26 s:
  actual registered launcher command, New/Tiptap/tasks, real SQLite title/body
  search, native close flush before debounce, Quit flush/restart, forced SIGKILL
  of only the private storage owner and application after a durable draft ACK,
  exact revision/content recovery separate from saved content, and reopened owner
  privacy checks. This does not establish arbitrary in-flight write recovery.
  Screenshot QA subsequently found an unpainted post-crash capture and the
  recovered-notice activation callback issue; final correction/verification is
  recorded below, not inferred from the first passing persistence assertions.
- Full typecheck and scoped ESLint pass on final source. Existing F2-01 storage
  regression suite: 49 passed after adding migration 014. Existing dependency inventory refreshed from the lockfile:
  1020 resolutions/927 installed registry metadata entries; all 54 newly inventoried
  registry rows have MIT (52), ISC (1) or Apache-2.0 (1) metadata. This includes
  earlier merged lockfile changes; it is not the packaged release SBOM.

Independent file_search_service_sol core/main review closed retention, initial
saved-null, RPC error shape, catalogue size, per-note uncertainty and reconciliation
race findings. Independent alias_review_sol reviewed controller/editor/tests and
all 14 component captures, closing the synchronous Close-without-flush dispatch
finding. Actual production captures are reviewed separately. No review is claimed
as supported-session or release acceptance.

## Explicit outstanding acceptance

U1-01-AC01 has real private-profile crash/restart evidence for acknowledged drafts
and saved content, plus synthetic failure/uncertain recovery presentation; complete
supported-platform/release evidence is outstanding. Unacknowledged local edits may
be lost on a forced crash. U1-01-AC02 Markdown roundtrip/export is not implemented.
Pin/archive/trash/restore, revision restore, attachments, root Notes provider and
Quicknote remain required. Full D1-02, Debian 13 GNOME/KDE Wayland/X11, native
assistive technology, screen reader/high contrast, performance and package/release
acceptance remain pending. No full task completion is claimed.

## Final application correction and verification

The final production scenario passed in 6.17 s after focused corrections. Initial
harness locators omitted the shared required-title label and did not scope the
Task list option to the slash menu; both were corrected. Screenshot QA detected
an unpainted recovered window; captures now bring the private window forward and
wait for fonts and two real animation frames. A real Tiptap activation issue also
cleared the recovered notice: setEditable emitted an unchanged-content update,
and default trailingNode could insert a paragraph on focus. The editor now uses
setEditable(..., false), disables implicit trailingNode insertion and ignores
identical validated document edits. The added controller/browser checks verify
focus beyond the debounce interval preserves exact content, recovery notice and
zero writes; native Enter can still leave an empty task and deliberate typing
stores a draft. Final actual crash capture visibly retains the recovery notice.

Independent UI review verified the final activation delta and exact 25-file
author snapshot b327054c98feb3fd0d462d63475e9a2b02c1d7cdb50573c40d84098079cf8db4.
Actual captures: notes-application-{empty,dark-saved,light-saved,pending-draft,
crash-recovered}.png in this directory; all public content. Full task/Markdown/
supported-session/AT/release acceptance remains outstanding.
