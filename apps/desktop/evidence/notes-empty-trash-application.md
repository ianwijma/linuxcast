# U1-01 confirmed Empty Trash application increment

Notes now offers **Empty Trash** under Show trashed notes. It reads the current
whole-Trash count, independently of search, pin/archive filters and pagination.
The confirmation defaults to **Keep notes**; Escape/Keep changes nothing. A separate
**Empty Trash permanently** removes exactly the reviewed unchanged trashed set and
its retained saved revisions. Active and archived notes outside Trash remain exact.
The confirmation discloses no Undo here, retained backups and no secure-erasure claim.

This reviewed/tested **unfinished U1-01 increment** reuses the existing Notes
workspace/shared primitives/sole owner. F2-01 is accepted; broader D1/prerequisite,
task, supported desktop/native AT and release acceptance remain pending. No scope,
requirement, dependency, table, migration, provider or framework is added/waived.

The owner streams a domain-separated SHA256 over ordered UUID/revision pairs for
all trashed rows. This public count/fingerprint is basis data, not permission
proof. The existing immediate transaction recomputes it, refuses any changed set
before deletion, deletes only trashed rows, cascades saved revisions and validates
the affected count/receipt before commit. Renderer filters/IDs/SQL/paths/content
cannot change scope. Main/preload/client require exact typed count/fingerprint.
The actual shared write and uncertain-batch state fence mutations, Close, export,
Quick note and selected-note opening. Only a new stable named whole-Trash read
can reconcile uncertainty after settlement; ordinary Get/list cannot. No replay.

## Validation

Host Pop!_OS22.04 amd64/Linux7.1.1, pinned Node24.22.1/Bun1.4.4,
Electron45/embeddedNode24.22.0/SQLite3.53.4. Actual application runs use sandboxed
Electron, private profiles and owned private Xvfb X11. Component Chromium/Tiptap
fixtures are synthetic in-memory behavior and are labelled separately.

| Check | Result |
| --- | --- |
| Mapped U1-01 unit | 417 PASS /10files /2.29s |
| Contracts | 34 PASS /4files /0.334s |
| IPC/preload/security | 245 PASS /10files /1.22s |
| Browser UI | 80 PASS /5files /51.4s (8 new Empty Trash cases) |
| Owner/application integration | 39 PASS /5files /42.02s (2 actual application scenarios,37 owner/client checks) |
| Full direct Node TypeScript/scoped lint/plan/whitespace | PASS |

`node scripts/test-runner/run.ts <suite> U1-01` selects mapped checks. Integration
uses `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a` and the pinned Electron executable.
The actual new scenario passed6.068s (existing complete Notes scenario30.904s). It verifies actual launcher Notes navigation, three trashed
records despite one filtered/pinned row, default Keep/Escape/Keep with untouched
sources, separate confirmed deletion, exact active saved/draft and archived source
preservation, application-created/trashed second note, cleared selected identity,
honest zero no-op, Quit/restart and real reopened-owner/usage privacy. Final focus
assertions verify enabled Empty Trash after preserving an active editor and New
note after deleting the selected trashed note. No renderer HTTP(S) requests observed.

Four new actual dark/light confirmation/result screenshots are axe0 and inspected;
eight component confirmation/result/pending/unknown/unavailable/200% states are in
[the UI report](../../../packages/notes/evidence/empty-trash-ui.md). DESIGN sections:
Tokens, Chat and notes, States/motion, Accessibility and Review gate. All729 prior
PNG files are retained byte-identically. No private account/device/provider data.

Independent GPT6.1SOL/high reviews cover contracts/owner/client/main/preload/wiring,
new tests, actual assertions, source UI and captures. Findings closed: a narrow
batch busy/uncertainty check now gates Quick/selected-open without changing normal
queued Save behavior; delayed confirmation settlement restores meaningful keyboard
focus. No new test infrastructure or production timing workaround was introduced.
The author report preserves its initial test/locator failures and split browser
runs; final coordinator mapped results above apply to the assembled source.

AC01 gains partial deletion/recovery evidence; AC02 (Markdown roundtrip) gains no
new evidence. All U1 acceptance criteria remain pending. Attachments, Markdown
import/roundtrip, full prerequisite acceptance, Debian13 GNOME/KDE Wayland/X11,
native screen reader/high contrast, performance, packaging and release gates are
still required. Logical removal does not erase backups or promise forensic erasure.
This private Xvfb run does not establish supported desktop/session/native AT acceptance.
