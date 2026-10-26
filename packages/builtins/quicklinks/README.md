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

## Saved Pin/Hide preferences

Rows provide explicit **Pin quicklink / Unpin quicklink** and **Hide quicklink /
Show quicklink** actions. The dedicated List filters the complete 500 summaries
by local name/host/tags, sorts pinned matches first and stable IDs within each
group, then projects at most 100 rows while retaining a matching selected ID.
Hidden rows are excluded by default. **Show hidden Quicklinks / Hide hidden
Quicklinks** remains available in Actions even when no results match; reopening
starts with hidden rows excluded. Plain Pinned/Hidden labels expose state. A
hidden row's Open action is disabled with Show remediation, including a saved
web-search preview refreshed after a concurrent Hide.

Each metadata action fresh-loads the selected exact record, then uses the existing
full Save CAS while preserving name, URL, tags, search configuration and the other
flag. Only a matching next revision and complete authoritative summary list may
change presentation. False and absent flags are equivalent; unrelated summaries
must remain unchanged. Form editing preserves the saved flags. Metadata actions
never navigate, hide Linuxcast, copy or open a browser. A hidden selected row
moves selection to a real remaining result without invoking it.

Persistent unknown-metadata recovery, bounded requests and original query/view/
selection guards remain in use. Read failure before Save does not claim a write;
an unconfirmed Save requires explicit Reload before further writes/Open. Back,
Hide, query/selection changes, hidden-inclusion changes and disposal fence late
receipts. Reload never replays a mutation or browser operation.

This increment adds 33 focused controller cases and five Chromium keyboard/axe
cases to the retained 120/32 baseline. Nine inspected public captures named
`evidence/*-quicklinks-preferences-*` cover dark/light pinned ordering, hidden
rows, empty-result recovery and unknown Save, plus pending disabled actions.
Held Enter during Hide cannot replay an action; existing held-Enter, IME shared
behavior, dirty Form and 200%-text checks remain applicable. Linux x64,
Node24.22.1/Bun1.4.4; controller and Chromium command selections are the same as
above. Full typecheck, scoped ESLint, plan and diff checks pass.

These are component request observations, not real SQLite migration/persistence
or native browser acceptance; the coordinator owns those integrations. This
supplies partial L2-05 UI/PRIVACY evidence and preserves AC01/AC02 regression
coverage without adding placeholder authority. Root quicklink-provider ranking,
frecency/shortcuts, native export, remaining templates/targets and supported
desktop/AT/release gates are still required. Full L2-05 remains in progress.

## Saved entries in root search

Root search can expose coordinator-registered metadata for a saved quicklink.
The row provides **Open** only; its Quicklink accessory directs preference changes
to the dedicated List. Pin/alias/visibility command handlers reject these entries;
management explains the dedicated actions. A hidden, unavailable or missing
Quicklinks parent disables the saved entry and cannot be bypassed by a stale intent.

`QuicklinksFlow.open(fromViewId, selection?)` validates the optional saved ID and
revision, reads the complete authoritative summary list, and selects only an exact
shown match. Selection remains visible even beyond the first 100 of 500 summaries.
Stale, deleted, hidden, malformed or failed entries withhold fallback rows and
show fixed **Reload quicklinks / Back** recovery. Explicit Reload may display the
current list for manual choice, never automatically open another item. Pending
entry reads fence origin root query/selection, local query, Back, Hide and disposal.

Entering the List performs no generic command execution, browser handoff, copy or
Hide. Root query and selected command return on Back; the root query is never
copied into the List filter or a web-search argument. Literal Open and search
Query→Review→Open still require separate deliberate actions. Existing persistent
uncertainty flags survive routing and automatic reads; only explicit authoritative
Reload clears them. Shared held-Enter and composition handling prevent entry
navigation from silently approving a second action.

Validation for this increment: 171 Quicklinks presentation cases, 10 launcher
routing cases and 125 existing launcher-controller cases pass (306 total). The
61 launcher and 37 dedicated Quicklinks Chromium keyboard/axe cases pass (98
total), retaining existing literal/search/tag/preference and root controls.
Six new inspected dark/light captures in
`apps/desktop/src/features/launcher/evidence/*-quicklink-entry-{root,selected,stale}.png`
show root metadata, exact selected List and unavailable-entry recovery. Fixtures
use public synthetic saved definitions and observed API calls; they do not perform
SQLite/native/browser operations. Typecheck, scoped ESLint, plan and diff checks
pass with Node24.22.1/Bun1.4.4 on Linux x64. Coordinator owns actual registration,
main/storage boundaries and production native integration.

This supplies partial L1-01 selected-identity/UI/PRIVACY and L2-05 UI/PRIVACY
routing evidence, retaining existing AC01/AC02 regression coverage. Full provider
merge/fallback/AI, saved-entry frecency/shortcuts, remaining placeholder/target/
export behavior, native desktop/AT and release acceptance remain pending. Neither
full task is complete.

## Export one selected Quicklink

The dedicated List provides **Export quicklink (unencrypted JSON)** with an
accessible plain disclosure: the file contains the saved name, full URL, tags
and preferences and is not encrypted. Only an explicit selected-row action
fresh-loads the exact definition and calls optional `exportQuicklink` with its
ID/revision. Shown literal/search definitions and recovered hidden rows can be
exported; exporting never opens them or invokes a search argument form. Root
saved entries remain Open-only.

Only an exact identity/version and `exported` receipt shows a publication result.
An exact `cancelled` receipt says export cancelled. Fixed known failure messages
expose Reload/reopen remediation without raw details. Malformed, mismatched,
rejected or late receipts set retained `exportUnconfirmed`: check files, then
explicitly Reload before another Export. Automatic reopening/loading cannot
clear it. Export uncertainty alone does not block browser Open or unrelated
saved edits; existing metadata uncertainty does block Export.

Fresh Get is bounded to five seconds. The native file chooser has no presentation
human-response deadline. Pending Export disables duplicates and conflicting
actions. Query/selection/origin changes, Back, Hide and disposal invalidate late
presentation without claiming to undo an already requested publication. The
post-pending-publication guard checks current context before invoking the API.
No path, JSON body, target URL or query is sent by the renderer. Export does not
Save/remove a definition, count a use, navigate, copy, open a browser or hide the
launcher. No automatic replay occurs after Reload.

This increment adds 27 controller cases and seven Chromium keyboard/axe cases
to the retained 171/37 baseline. Nine new public captures named
`evidence/*-quicklinks-export-*` cover dark/light disclosure, success, cancelled
and unknown states plus pending disabled actions. Tests cover fresh Get/selection
only authority, literal/search/hidden definitions, missing capability, known
failure, exact/malformed receipts, retained uncertainty, native human wait,
synchronous publication and late/hidden/disposed contexts, held Enter and IME.
Fixture exports are labelled request observations and create no real files.
Typecheck, scoped ESLint, plan and diff checks pass on Linux x64 with pinned
Node24.22.1/Bun1.4.4. Actual native chooser, safe JSON publication, file permissions,
existing-file refusal and production lifecycle checks are coordinator-owned;
shared main/preload prerequisite edfef0f is separate from the owned UI commit.
The composing-Enter regression reproduced an ActionPanel invocation defect before
the separate shared guard 6dd38a6; all 44 cases pass with that guard.

This is partial L2-05 UI/PRIVACY evidence, retaining existing AC01/AC02 encoding
and unsupported-placeholder regressions. It is one explicitly plaintext native
interoperability export, not bulk export/import or an encrypted portable backup.
Full templates/context/targets, saved-entry frecency/shortcuts, native desktop/AT,
performance and release acceptance remain pending; L2-05 is not complete.

Design sections: Shell/navigation; Results/actions; List/Grid/Detail/Form;
States/motion; Accessibility; Review gate. Existing tokens, fonts, neutral rows,
focus, disabled reasons and action affordances are reused. Fixture CSS changes
layout only; there is no second visual system or added window.

Validation on Node 24.22.1/Bun 1.4.4:

- `tests/presentation.test.ts`: 198 controller cases for strict records/receipts,
  complete refresh, 500/100 bounds, validation/drafts, known/unknown outcomes,
  no replay, persistent gates, navigation/disposal and separate Hide failures.
- `tests/quicklinks.ui.test.ts`: 44 real Chromium keyboard/axe cases, including
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
open-with/file/registered-URI targets remain required. Bulk export/import is
outside this increment; no import behaviour is implemented. L1/F3 prerequisites, Debian GNOME/KDE Wayland/X11, native assistive
technology and release acceptance remain pending. This slice does not complete
L2-05 or reduce the agreed 1.0 scope.
