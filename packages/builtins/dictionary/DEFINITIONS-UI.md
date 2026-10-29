# L2-06 Local definitions presentation increment

Base PR70/develop `13d8eb6`, isolated `codex/dictionary-definitions-ui`.
Read with the [task card](../../../docs/implementation/tasks/L2-06.md),
[increment freeze](DEFINITIONS-INCREMENT.md), [PLAN](../../../docs/PLAN.md),
[data](../../../docs/architecture/data.md), [security](../../../docs/architecture/security.md),
[built-ins](../../../docs/product/builtins.md) and
[testing/release](../../../docs/implementation/testing-release.md).
This is an unfinished application increment under the approved sequencing;
full task, prerequisite, desktop and release acceptance remains pending.

## Behaviour and boundaries

`DefinitionsFlow({session,api,viewId,revision})` supplies the shared Local definitions
List and exact-word Detail. It provides `open`, `active`, `owns`, `query`, `handle`,
`closed` and `dispose`; an internal optional `onChange` callback fences the wrapper
while an actual source mutation is outstanding. Existing `DictionaryFlow` delegates
these nested frames and adds the read-only `dictionary:definitions` action.
Returning refreshes the base List and preserves its query and stable selection.
Absent optional definition APIs retain the existing base-entry disclosure and
fixtures; the new action is disabled with reconnection guidance. With these APIs,
base-entry language guidance refers to Local definitions and still discloses that
full spell checking is unavailable.

The List exposes at most 100 returned canonical entries and source metadata only.
Enter reads the selected exact entry; Ctrl+Enter is read-only Back. With no selected
entry, the first two actions are Back and Reload. Source changes therefore require
explicit Actions: **Choose definition source** or **Forget definition source**.
The renderer neither accepts a path nor opens files, downloads data, performs a
network lookup or interprets source instructions. Native chooser and confirmation,
private configuration, source format checks and durable writes belong to main.
Forget removes the saved preference only; source files are not deleted.

All schema and receipt fields bind reads to the issued revision, search handle,
query, configuration revision, source ID, snapshot ID, entry ID and exact returned
word. Definition parts are rendered as ordinary literal prose: every ASCII Markdown
punctuation character is escaped, logical line breaks are preserved, and source
HTML, links and images cannot become active content. Meaning/Phonetic labels
identify part kinds. Page chunks contain at most 12000 Unicode scalars and at most
65536 UTF-8 bytes after escaping and line preservation. Concatenating the raw page
chunks retains all part text; no definition data is discarded. Read-only Next and
Previous show Page N of M without requesting the definition again. This increment
adds no definition Copy action.

Configure reserves synchronously and retains its actual promise through caller
expiry, selection/query change, Back, pop and disposal. Its caller bound is 125
seconds to allow normal native interaction; read/search bounds are five seconds.
Base Copy and another source mutation stay fenced until settlement. Late results
cannot report success or replay. Unknown mutation outcomes require a deliberate
fresh search after settlement before a new explicit change. Failed reads during
uncertainty retain unknown guidance and never claim that nothing changed.
Configured, forgotten and cancelled replies all release the old search and read
fresh context. A named success requires the exact next configuration revision and
source metadata, including source ID and snapshot; contradictory stale or newer
state gets neutral current-source guidance. Cancelled selection never reopens the
chooser automatically. Replaced and late searches release their exact handles,
including transport/await gaps. Ancestor/frame/query/revision/selection guards
prevent stale search/read/configure publication and Detail pagination.

Unconfigured, unavailable, unsupported-format, invalid and changed sources remain
visible and actionable. Available-but-empty search is distinguished from missing
source data. Missing methods disable their actions with recovery guidance. Fixed
safe messages do not expose backend error strings or source paths.

Owned files are two presentation files, two new tests, two new fixture files, this
report and eight new PNGs. Shared contracts/freeze, existing preview CSS, historical
tests/fixtures/PNGs, coordinator routing/main/preload/storage and task status are
outside this patch. No staging or commits.

## Validation and visual evidence

Platform: Pop!_OS22.04 amd64, Node24.22.1/Bun1.4.4, React19.3.1,
Playwright1.64.1 Chromium/axe4.14.0. Component fixture only; viewport1000x1000,
reduced motion, and 200% root text scaling for the scaled case. Commands use
`PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH` and
`BUN_TMPDIR=/tmp`. The coordinator completed the pinned frozen install in this lane.

- `LINUXCAST_TEST_FILES='["packages/builtins/dictionary/tests/definitions.test.ts","packages/builtins/dictionary/tests/presentation.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS105 cases across two files, 1.01s total; 56 new definition cases plus the
  existing 49 base-entry cases. Tests cover literal-text/data retention, page
  bounds, source states, exact receipts, stale/contradictory refresh, synchronous
  reservation, 125-second fake-clock expiry, failed unknown recovery, late handle
  release, parent/selection/query/lifetime changes and wrapper state restoration.
- `LINUXCAST_TEST_FILES='["packages/builtins/dictionary/tests/definitions.ui.test.ts"]' node node_modules/@playwright/test/cli.js test --config scripts/test-runner/playwright.config.ts --workers=1`:
  PASS12 cases10.4s, eight captures each with zero axe violations. Keyboard
  Read/Back, explicit source changes, cancel, unknown recovery, pending-Back fence,
  missing APIs, all source states, literal inert content and pagination are checked.
- Full `node node_modules/typescript/bin/tsc --project tsconfig.base.json --noEmit`:
  PASS. Scoped ESLint, plan validation and whitespace checks are recorded in the
  frozen lane manifest.

The initial restricted browser attempt could not bind127.0.0.1; authorized elevated
runs used normal browser defaults. Intermediate fixture assertions assumed an
empty heading and Actions option roles rather than the shared renderer's actual
heading/buttons; corrected before the complete final pass. A fixture type alias
was corrected to use the exported search-value source-state type. No production
change was needed for these fixture corrections.

All eight final screenshots were inspected for contrast, focus, overflow, disclosure
and public-only content:

- `definition-dark-unconfigured.png`: source guidance and safe Back default.
- `definition-light-configured.png`: metadata, exact rows and Read footer.
- `definition-dark-detail.png`, `definition-light-detail.png`: literal punctuation,
  HTML/image/link syntax, preserved lines, Page/Source metadata and focused Detail.
- `definition-dark-loading.png`: honest pending read without fabricated rows.
- `definition-light-empty.png`: retained query and available source, no result.
- `definition-light-unknown.png`: retained prior rows, disabled Read and explicit
  unknown recovery without an optimistic source-success message.
- `definition-light-200-percent-detail.png`: scaled text and scroll-to-end metadata,
  visible Back/Actions footer; earlier text remains reachable by scrolling.

Applicable [DESIGN.md](../../../docs/design/DESIGN.md) sections: Tokens;
Shell/navigation; Results/actions; List/grid/detail/form; States/motion;
Accessibility; Review gate. Existing ViewSession/ViewRenderer/ThemeProvider and
semantic tokens are reused without feature CSS or a separate visual system.

## Acceptance boundary

Partial `L2-06-AC01`: the presentation introduces no automatic dataset/network
download or dictionary-data payload. Partial `L2-06-AC02`: existing base canonical
Copy behaviour remains regression-covered; definitions are read only. Partial
`L2-06-UI`: relevant shared List/Detail states, keyboard, scaling and axe checks.
Partial `L2-06-PRIVACY`: manually authored public samples, safe fixed errors,
literal source content and metadata-only named API requests.

The fixture visibly labels simulated source metadata, chooser/consent and preference
responses. It reads no real host dictionary and proves no native picker, durable
storage, licence, OS clipboard or installed-source operation. Real backend/source
configuration/read/restart/privacy evidence remains coordinator-owned. All full
criteria remain pending, including supported formats and complete dictionary/Emoji
scope, native AT/Orca/high contrast, Debian13 GNOME/KDE Wayland/X11, performance,
packaging/release and complete local1.0 acceptance. The complete scope is unchanged.
