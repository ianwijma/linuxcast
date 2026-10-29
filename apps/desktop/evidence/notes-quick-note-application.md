# U1-01 — registered Quick note application increment

29 October 2026; integrated in PR61 https://github.com/ianwijma/linuxcast/pull/61,
merge f00984e09b08adbccd9c37ca7a5f5d46b2f1c596; exact reviewed signed head
ad062ae3032cb4dafb4aaef7ca99bf9186be2a24, CI40805621008 validate PASS.
No requested/submitted GitHub reviews/comments/threads. Based on PR60/develop
b79f9ddbc1f690bdd87920d5a4487319c86b35a2. Coordinator codex/notes-quick-note;
UI author codex/notes-quick-note-ui. User-authorized reviewed/tested unfinished
application increment, not full U1/D1/native desktop/AT/release acceptance.

## Application behavior

The actual registered Quick note command is found through the existing launcher.
Only deliberate execution opens or focuses Notes, flushes the current local draft
without Save, creates a new UUID/Untitled note/empty durable draft through the
existing New path and focuses its title. Ordinary Notes open and query typing do
not create records; no query becomes note content. Each later deliberate Quick
note creates a different UUID. Prior content, saved version, pin and archive state
remain retained. Existing ordinary pending draft/Save waits are respected; competing
New, metadata, Close, export and uncertain writes cannot silently discard edits.
Archived retained local edits require Restore/review before New.

## Boundary

Main owns one monotonic attempt and fixed ready/request/finished channels. Preload
registers its callback before readiness, strictly validates events and remembers
attempt IDs across subscriptions; duplicate/stale events do not invoke New again.
The request is admitted before opening or sending. Readiness cannot replay it.
Both the timer and synchronous monotonic checks fence the deadline before dispatch
and success. A delivered timed-out request remains held until actual settlement or
owner loss. Main validates exact owner/frame/attempt and requires observation of a
validated initial owner draft before treating created:true as success. A renderer
boolean alone cannot establish durable creation.

Native Close/Quit and Markdown export respect the admitted Quick slot, including
the interval before/between actual writes. Main does not write independently of the
existing sole-owner repository or generic renderer write slot. No new migration,
dependency, helper, permission, content history, renderer Node/network or arbitrary
IPC is introduced. The fixed command is added to the strict launcher contract;
the aggregate cap becomes5607 to retain11builtins plus existing provider maxima.

## Verification

Host Pop!_OS22.04 Linux amd64; Node24.22.1/Bun1.4.4/Electron45/SQLite3.53.4.
Private Xvfb/profile/database/Chromium and synthetic public notes. This is not
Debian13 GNOME/KDE Wayland/X11/native AT/session/performance/package acceptance.

- Initial integrated production Quick flow PASS10.79s /16 mapped integration
  checks (15 owner plus actual app). Cold workspace creation, warm reuse/outgoing
  draft without Save, exact second UUID/revision1/empty content and previous saved/
  pin/archive preservation pass, as do retained Archive/Pin/export/nativeClose/
  Quit/restart/forced private crash/exact recovery/privacy. Normal reopen/restart
  retains exactly two records with no automatic Quick replay. After the queued
  Save fix, actual application-only run PASS11.81s (Vitest12.55s), including both
  themes of actual launcher and new-note captures/axe. The preceding combined run
  passed15owner cases but its app worker exited before completion; that run is
  incomplete, not a pass. One bounded isolated app retry passed with no source
  change. These results do not establish a flake-free supported desktop matrix.
- Final `bun run test:unit -- U1-01`:271 PASS, including98 Notes controller and
  seven export cases. Full integrated TypeScript/scoped ESLint/diff checks PASS.
- 101 mapped security checks PASS, including13 Quick request protocol and42 Notes
  IPC cases: readiness/duplicate/stale/spoof authority, reentry/admission, observed
  durable write, delivered uncertainty, late timer callback, Close races and removal.
- 15 mapped Notes contract checks and10 changed shared Quicklink contract boundary
  fixtures PASS. Existing aggregate exact-limit search/catalogue cases updated.
  `bun run test:integration -- F2-01`:49 existing storage regressions PASS.
- Author104 focused units/37 Chromium cases PASS; five new affected dark/light,
  pending, unknown and archived retained-edit refusal captures independently clean.
  Source review found a queued explicit Save→Quick race: New now awaits the earlier
  admitted Save with lifetime/generation/outgoing-ID guards before switching. The
  new deferred draft→Save→Quick regression proves old selection until both receipts,
  preserves explicit Save and creates the new UUID only afterward;105 author unit
  cases PASS. Independent source review closed this P2. Final browser run passed26
  before an initial editor-mount failure in a retained Archive fixture;11 affected
  failed/not-run cases then all PASS in the unchanged targeted11-case retry8.5s:
  all37 distinct final-source cases passed. This is split execution, not a single
  clean full run; the previous pre-fix37-case run passed25.6s. No skipped case is
  counted as a pass. Five final component captures and four actual application/
  launcher captures are independently reviewed clean.
- Initial missing strict command-ID registration caused catalogue/unit/production
  failures before Notes opened; fixed. Exact catalogue count fixtures adjusted for
  the added real command. Initial failures are not counted as successful evidence.
- Final11-file owned UI patch reconciled against every per-file hash. Patch SHA256
  f40850e73cb47c5227b989573d2ff72950ca90169d8d809c247b0c84e0b0508f;
  manifest0566cffa2e5c5af7ba31353238f3ab7b5d67f283fa75a24e21a9c9e0aeaf9fb7.
  Controller1fa4fc5b59cb227a15a19a995dbe27eaf03c6eee6366e6bf529f4b0418c0e982;
  main Quick IPCdb7e9e93e7a0ca6550eed4fd1def6e698b3322155e3ac697109337015b4e0948.
  Copied coordinator contract/freeze unchanged. Independent backend, UI, actual
  scenario and all nine new capture reviews clean; all actionable findings closed.
  Final render/plan/status/diff and current-head CI PASS. Configured GitHub reviews
  inspected before normal expected-head merge. Local signature verifies against
  exact configured key; GitHub unknown_key is not claimed as verified.

Actual new images: notes-quick-note-launcher-{dark,light}.png and
notes-quick-note-application-{dark,light}.png in this directory. Component images
in packages/notes/evidence are dark/light-notes-quick-created, dark-notes-quick-pending,
light-notes-quick-unknown and light-notes-quick-archived-refusal (all.png). Historical
component snapshots retain their earlier increment meaning;14 actual snapshots
regenerated because Quick note is now a registered command and footer is current.

## Remaining acceptance

DESIGN.md Shell/navigation, Results/actions, List/detail/form, Chat and notes,
States/motion, Accessibility and Review gate apply. Shared controls/tokens retained.
All four U1 criteria stay pending. Trash/trash restore, revision restore, attachments,
root Notes provider, full Markdown import/roundtrip/native chooser interaction,
broader D1-02/native AT/Debian matrix/high contrast/performance/package/release gates
remain required. Private SQLite is unencrypted; unacknowledged edits may be lost
on forced crash. No full task, platform or Goal completion claim.
