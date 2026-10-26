# Saved web Quicklinks — bounded L2-05 UI

`QuicklinksFlow` uses the existing `ViewSession` and shared List/Form/Actions.
The coordinator supplies the optional named `QuicklinkApi`, launcher revision,
Hide callback and retained `QuicklinksFlowState`. It opens at depth two; New/Edit
uses one depth-three Form. Back/Cancel follows the shared dirty-draft dialog and
restores the List query/selected identity; closing the flow preserves the root
query and selection. Disposal aborts presentation without popping other views.

The complete list holds up to 500 validated summaries, with names and hosts but
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

Design sections: Shell/navigation; Results/actions; List/Grid/Detail/Form;
States/motion; Accessibility; Review gate. Existing tokens, fonts, neutral rows,
focus, disabled reasons and action affordances are reused. Fixture CSS changes
layout only; there is no second visual system or added window.

Validation on Node 24.22.1/Bun 1.4.4:

- `tests/presentation.test.ts`: 54 controller cases for strict records/receipts,
  complete refresh, 500/100 bounds, validation/drafts, known/unknown outcomes,
  no replay, persistent gates, navigation/disposal and separate Hide failures.
- `tests/quicklinks.ui.test.ts`: 14 real Chromium keyboard/axe cases, including
  dirty cancel/focus, CRUD request observation, pending/late replies, explicit
  recovery, later identities and unavailable capabilities.
- `evidence/`: dark/light List, Form, invalid-input and unknown-opening captures,
  plus pending Save, loading, unavailable and separate Hide-failure states.
- Typecheck, scoped ESLint, plan validation and diff checks pass. Tests use
  `LINUXCAST_TEST_FILES` with the two explicit owned test paths until coordinator
  suite integration. Shared List query-focus fix 74b9954 is a separate prerequisite.

Fixtures are labelled, public synthetic in-memory data and request observers.
They perform no native confirmation, actual browser handoff, SQLite write or
network request. These checks provide partial L2-05 AC01 input/authority,
AC02 explicit unsupported-template, UI and PRIVACY evidence; they do not establish
placeholder execution or native persistence/dispatch. The coordinator owns actual
SQLite/main/preload/GIO and production-app validation. Full snapshot placeholders,
named arguments, nonrecursive snippets, typed URL component builders, browser/
open-with/file/registered-URI targets, tags/pin/hide and native export remain
required. L1/F3 prerequisites, Debian GNOME/KDE Wayland/X11, native assistive
technology and release acceptance remain pending. This slice does not complete
L2-05 or reduce the agreed 1.0 scope.
