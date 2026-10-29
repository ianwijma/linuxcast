# U1-01 — registered Quick note application increment

Based on integrated PR60/develop b79f9ddbc1f690bdd87920d5a4487319c86b35a2.
Task docs/implementation/tasks/U1-01.md; normative data.md, product/builtins.md,
testing-release.md, security.md, DESIGN.md/tokens. F2-01 accepted, broader D1-02/
native AT/full U1 pending. Complete local1.0 scope unchanged; no proof expansion.

User flow: open existing launcher, search actual registered Quick note command,
Arrow/Enter -> existing Notes workspace opens/focuses -> flush any current draft
without Save -> create exactly one new Untitled note/empty draft using existing
UUID/write path -> focus title. Previous saved/draft/pin/archive/content stays
unchanged apart from explicitly needed outgoing draft flush. Normal Notes open
never creates. Typing the launcher query never creates; query is not note content.
Deliberate later Quick note creates a different UUID; no automatic replay.

Coordinator contract freeze in packages/contracts/src/notes.ts (and launcher.ts
adds fixed linuxcast:quick-note, aggregate cap5607 for11builtins+existingproviders):
- optional named NotesApi.onQuickNoteRequested(listener:()=>boolean|Promise<boolean>)
  returns unsubscribe. Production implements; callback represents one explicit
  broker-delivered attempt. true only after a newly created initial draft receives
  a confirmed owner receipt; false for refusal/failure/unknown. No caller content,
  query, UUID/path/channel/authority in event. All creation uses existing newNote.
- Main owns finite monotonic attempt IDs; preload registers before named ready
  handshake and validates requested/finished schemas. Duplicate/stale attempts do
  not rerun callbacks. No event replay on ready/re-register/timeout/reopen.
- Main retains one Quick request through readiness/creation; same-operation gates
  prevent parallel Quick/Close/export conflicts. Deadline is unknown, not success;
  no retry until actual callback settles or window is gone. Renderer newNote keeps
  existing flush/metadata/export/read/closing/blocked/uncertain generation fences.
- Callback must reserve/admit existing New synchronously, then flush, validate
  generation/ownership, create/durable ACK. Failed outgoing draft retains local
  content, with actionable existing recovery; must not create or silently discard.
- Readonly archived retained edits refuse new creation until Restore/review or
  explicit existing close decision. No bypass of Save or retained-edit recovery.

UI owner manifest_review_sol GPT-6.1 SOL/high:
.worktrees/linuxcast-text-preview-native branch codex/notes-quick-note-ui; own only
packages/notes/{src,tests,fixtures,evidence,README.md}. Shared contract/freeze copied
UNCOMMITTED; do not edit/stage shared contracts/manifests/lock/status/routing.
Make New return Promise<boolean>, true only confirmed initial draft write; optional
subscription invokes it and shows truthful actionable refusal while preserving
existing recovery/error/local edits. Existing useLayoutEffect focuses fresh title.
Use existing controls/tokens/Notes layout. No new infrastructure/research/proof.

Coordinator .worktrees/linuxcast-application-controls branch codex/notes-quick-note
owns fixed launcher registration/dispatch, main handshake+single request+native
lifecycle gates, preload event protocol, shared fixtures/integration/testmaps/status.
No new dependency, migration, renderer Node/network/clipboard/input service.

Evidence: bounded controller success/outgoing flush/no Save/failure/unknown/retained
archive/reentrant+generation/duplicate New guards; synthetic real Tiptap dark/light
Quick request/focus and truthful refusal captures with keyboard/axe. Root verifies
actual registered command→exact one real SQLite new draft→existing note preserved,
second deliberate invocation/new UUID, normal Notes/typing/no auto-replay/restart,
strict spoofed/duplicate/stale protocol and actual close/export gates. Unit/fixtures
are not supported Debian GNOME/KDE Wayland/X11/native AT/performance/release proof.
All U1 criteria stay pending; remaining Trash/revision/attachment/rootprovider/
Markdown import and full release scope remain required.
