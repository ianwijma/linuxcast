# Saved web Quicklinks — bounded L2-05 UI

`QuicklinksFlow` uses the existing `ViewSession` and shared List/Form/Actions.
The coordinator supplies the optional named `QuicklinkApi`, launcher revision,
Hide callback and retained `QuicklinksFlowState`. It opens at depth two; New/Edit
uses one depth-three Form. Back/Cancel follows the shared dirty-draft dialog and
restores the List query/selected identity; closing the flow preserves the root
query and selection. Disposal aborts presentation without popping other views.

The complete list holds up to 500 validated summaries, with names, hosts and optional tags but
no full URLs. Search is local and projects at most 100 matches, with refinement
guidance and retained matching selection. New is reachable from empty/no-match
results. Open is primary, Edit is read-only and Remove is destructive. Missing
capabilities, loading and failure remain visible with Reload/Back remediation.
Edit obtains the exact full saved record before prefilling Name/URL. Creating,
editing, searching, saving and navigation never implicitly open a browser.

Save trims/validates the name and canonicalizes a literal HTTP/HTTPS URL. Raw
braces/placeholder syntax, credentials, invalid escapes, whitespace/control and
oversized input fail explicitly. Encoded literal braces remain literal. A name
collision stays editable inline; known stale/unavailable/limit errors retain
the draft with fixed remediation. A successful exact ID/version/name/URL receipt
is followed by complete authoritative summaries before changing the List. No
optimistic saved/removed state or automatic mutation retry is presented.

Remove waits for the main process's native confirmation without a human-response
deadline. An exact cancelled receipt preserves the definition; an exact removed
receipt must be followed by a complete list before presentation changes. Open
sends only saved ID/version and launcher revision; main derives/revalidates the
URL. Only a matching dispatched receipt in the unchanged invocation context
requests named Hide. A separate Hide failure states that handoff was dispatched;
it never replays or reclassifies the browser effect as unknown.

Read/Save/Open requests have five-second presentation bounds. Back, Hide, query
or selection changes and disposal invalidate pending presentation without claiming
to undo storage or browser effects. Unknown save/removal sets the retained
`metadataUnconfirmed` flag and blocks mutations/Open. Unknown opening sets
`openUnconfirmed`, tells the user to check the browser, and blocks another Open.
Automatic reopening/loading cannot clear these flags. Explicit Reload validates
complete stored summaries (and an edited record's current version), keeps an
open draft, then permits a later deliberate action. Failed Reload preserves the
gate. A removed edited definition retains its draft with Cancel/New remediation.

## Saved web searches

New/Edit includes Type (Literal link or Web search) and Query parameter. All five
submitted fields are validated together. A web search stores only the fixed
`{{vars.query}}` configuration and its base URL; changing Type back to literal
requires clearing the parameter and removes the configuration. Search markers
in complete summaries distinguish the primary **Open web search** action. Save
receipts check exact optional configuration and the refreshed summary marker.

Opening a search fresh-loads its exact ID/version/configuration into a depth-three
**Search web** Form. Typing has no effect. Explicit **Review search** validates
the captured query and calls the real shared domain builder locally, using its
fixed scalar snapshot and URL query-component encoder. The same view ID changes
at a higher revision to **Review search** Detail, with Query and Target URL as
plain metadata and no navigable link. **Edit query** restores the exact draft in
the same frame. There is no fourth frame or automatic browser operation.

Only explicit **Open search** sends the captured query alongside saved identity
and launcher revision; it sends no expanded URL/configuration authority. The
receipt must match ID, version, exact query and canonical preview URL. Missing,
wrong or malformed search receipts gate Open and retain check-browser/Reload
recovery. Literal requests reject unexpected search receipts. Explicit Reload
retains the query, obtains fresh configuration, discards the old preview and
requires Review again. Closing/disposal clears transient query/preview state;
only the existing uncertainty flags survive reopening. No query is added to a
saved definition, fixture history or usage aggregate.

The shared renderer's repeat guard prevents held Enter from approving Open when
Review changes Form to Detail; IME composition retains native behavior. The
fixture has no outer repeat guard masking this boundary. A new deliberate press
is required after keyup. Root kind-change focus handling places focus on the
Query input or read-only preview article, and shared dirty handling remains in
use. Known default-browser failures and separately failed Hide remain truthful.

## Saved tags

New/Edit includes an optional comma-separated **Tags** field. Shared validation
normalizes NFKC and trims labels, preserves their order and case, rejects
case-insensitive normalized duplicates, empty labels, raw controls and lone
surrogates, and bounds tags to eight labels, each 32 UTF-16 units and 64 UTF-8
bytes. Clearing the field omits tags on explicit Save. Edit prefills the actual
saved labels. Tags appear as plain List accessories beside any Web search marker;
every local query word matches across saved name, host and tags, including
records beyond the first 100 visible matches. They never alter target authority.

Get, Save and complete-summary checks compare canonical ordered tags exactly;
empty and absent are equivalent for old definitions. Noncanonical/mismatched
receipts cannot report a saved state. Unknown Save retains all five drafts,
requires explicit authoritative Reload, and permits only a later deliberate Save.
Tag entry, local searching, navigation, Save and Reload never open a browser.
The existing literal and Query→Review→Open paths and uncertainty fences remain.

The tag increment adds 30 controller cases to the prior 90 and seven Chromium
keyboard/axe cases to the prior 25. Checks cover canonicalization, tagged literal
and web-search definitions, prefill/clear, later matching IDs, strict fields,
duplicate/invalid/overbound labels, exact read/save/summary receipts, pending and
late Save, unknown-state Reload and retained drafts. Nine new public captures
under `evidence/*-quicklinks-tags-*` show dark/light local results, Forms, inline
errors and unconfirmed Save, plus an eight-tag Form at 200% root text. The existing
pending and typed web-search captures are refreshed with tags. Captures were
inspected; focused keyboard controls scroll into view using shared Form behavior.

Validation uses Node24.22.1/Bun1.4.4 on Linux x64 and Chromium component fixtures.
Commands: `LINUXCAST_TEST_FILES='["packages/builtins/quicklinks/tests/presentation.test.ts"]' bun x vitest run --config scripts/test-runner/vitest.config.ts`
and the corresponding `tests/quicklinks.ui.test.ts` selection with
`bun x playwright test --config scripts/test-runner/playwright.config.ts`.
Full typecheck, scoped ESLint, plan and diff checks pass. The shared raw-control
schema hardening dbfabde is a separate prerequisite, not duplicated here. The
shared pending-Form scroll fix d00f8f4 keeps Save and enabled Cancel entirely
inside the scroll viewport without moving focus. The existing pending Save case
checks all four control bounds, holds Enter to reject duplicate Save/accidental
Cancel, and inspects the corrected pending capture. Focused pending, held-Enter,
IME and 200%-text regressions pass; the shared fix is a separate prerequisite.
This supplies partial L2-05 UI/PRIVACY evidence; existing AC01/AC02 encoding and
unsupported-placeholder behavior remains covered by regressions, with no new
placeholder capability. Actual tag SQLite migration/persistence and native
browser dispatch are coordinator-owned checks, separate from these observers.

Design sections: Shell/navigation; Results/actions; List/Grid/Detail/Form;
States/motion; Accessibility; Review gate. Existing tokens, fonts, neutral rows,
focus, disabled reasons and action affordances are reused. Fixture CSS changes
layout only; there is no second visual system or added window.

Validation on Node 24.22.1/Bun 1.4.4:

- `tests/presentation.test.ts`: 120 controller cases for strict records/receipts,
  complete refresh, 500/100 bounds, validation/drafts, known/unknown outcomes,
  no replay, persistent gates, navigation/disposal and separate Hide failures.
- `tests/quicklinks.ui.test.ts`: 32 real Chromium keyboard/axe cases, including
  dirty cancel/focus, CRUD request observation, pending/late replies, explicit
  recovery, later identities, unavailable capabilities, typed definitions, local
  previews, exact argument/configuration receipts and held Enter. The 54 original
  presentation and 14 original browser cases are retained.
- `evidence/`: dark/light List, Form, invalid-input and unknown-opening captures,
  plus pending Save, loading, unavailable and separate Hide-failure states. Twelve
  new web-search captures cover dark/light definitions, Query/Review, invalid and
  unknown query states, pending opening and a long Unicode preview at 200% root
  text scaling (720×1200 CSS pixels). The focused regression verifies both footer
  controls remain inside the shell after the shared footer fix; the refreshed
  capture was inspected. Definition captures use 800×800 with keyboard focus on
  Save; normal query/preview captures use 800×650. These are component observations, not native
  desktop or assistive-technology acceptance.
- Typecheck, scoped ESLint, plan validation and diff checks pass. Tests use
  the mapped L2-05 suites after coordinator integration. Real domain 9c009e9 and shared kind/repeat fixes from b9a1130, 128b48d
  and 0a084c4, plus footer fix 453f194, are separate prerequisites; they are not duplicated in the UI commit.

The integrated coordinator passes 157 mapped units, 10 contract tests, 27
main/preload security checks and 29 integration checks (20 domain SQLite, eight
owner/client and one actual bundled Electron flow). The actual Electron45 /
SQLite3.53.4 / GIO2.72.4 flow uses an owned private Xvfb X11 display and private
browser-handler process. It creates a search, reviews a Unicode/metacharacter
query, proves held Enter cannot approve opening, and dispatches only the exact
reviewed URL as argv with empty stdin. Restart preserves the definition but
starts with an empty query; usage clear and aggregate export retain no query,
base URL or expanded target. Literal CRUD and native-choice cancel/confirm
removal remain covered. Only native dialog choices are instrumented. Six actual
dark/light Form/List/Review captures were inspected and axe passes. This is real
process/persistence evidence, not supported desktop/session, assistive technology
or browser-page completion acceptance. Production captures are in
`apps/desktop/evidence/` with the `quicklinks-application-` prefix.

Fixtures are labelled, public synthetic in-memory data and request observers.
They perform no native confirmation, actual browser handoff, SQLite write or
network request. These checks provide partial L2-05 AC01 input/authority,
AC02 explicit unsupported-template, UI and PRIVACY evidence; they do not establish
the complete placeholder feature. Actual coordinator persistence/dispatch evidence
is separately described above. Full context snapshots and other named arguments, nonrecursive snippets, other
typed URL components, browser/
open-with/file/registered-URI targets, pin/hide and native export remain
required. L1/F3 prerequisites, Debian GNOME/KDE Wayland/X11, native assistive
technology and release acceptance remain pending. This slice does not complete
L2-05 or reduce the agreed 1.0 scope.
