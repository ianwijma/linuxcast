# L2-05 / L1-01: saved Quicklinks in root launcher search

Bounded next application increment after merged PR46/e5da4f8. Reuse existing
root registry/search, shared List/Actions, sole owner and Quicklinks flow.
No new process, API channel, migration, dependency or proof/research lane.
Complete 1.0, prerequisites and full native/AT/release acceptance stay mandatory.

## Frozen interface and behaviour

Launcher metadata may carry `quicklink:{id,revision}` only on an exact stable
`quicklink:<UUID>` command ID matching that selection. It contains no target URL,
query, code or authority. Maximum catalogue increases by the existing 500 saved
Quicklinks to 5604; existing paging/byte/duplicate/revision bounds stay enforced.
Main registers current nonhidden summaries using name/host/tags; search stays
local. Quicklinks storage failure leaves the existing Quicklinks recovery command
visible/actionable and makes old saved entries unavailable rather than executable.

Root selected entry Open enters existing dedicated Quicklinks List with the exact
current saved ID selected. It does not invoke native Open or generic command
execution. Fresh complete summaries must acknowledge the exact expected revision
and shown flag; a changed/deleted/hidden entry must show an error with no automatic
selection-to-action fallback or browser effect. Preserve root query/selection on
Back. Literal Open and Query→Review→Open search still require deliberate actions.
No root query is copied into the web-search argument or persisted.

Use QuicklinksFlow.open(fromViewId, optional QuicklinkSelection) or a similarly
bounded method. Validate selection before use; the full list reload checks the
requested ID/revision before selecting it. If unavailable, expose Reload/Back
and a fixed explanation; never open another row. Explicit Reload may populate
current definitions for manual selection, without acting. Pending query/selection/
Back/Hide/dispose invalidates late entry reads and never opens or navigates again.
Retained metadataUnconfirmed/openUnconfirmed fences must survive this route.

For this increment root saved-entry rows expose Open only. Pin/hide/alias editing
through root command metadata remains disabled with an explanation to use the
existing Quicklinks actions. Main rejects generic Execute/setPinned/setAlias/
setHidden for these IDs. Dedicated saved preference controls remain available.
Root saved-entry frecency/shortcuts/unified preference ranking are not claimed.
If the Quicklinks parent command is hidden or unavailable, entry Open is disabled
and cannot bypass the existing main Quicklinks visibility/effect gate.

## Ownership and evidence

manifest_review_sol owns only apps/desktop/src/features/launcher/controller.ts,
its Quicklinks routing tests and fixtures/UI evidence under that feature, plus
packages/builtins/quicklinks/src/presentation.ts, relevant presentation/keyboard
fixtures/tests/README/evidence. Do not edit shared contracts, catalogue/search
helpers, main/preload/storage, manifests/lockfiles, registry, actual integration
or another lane's files. Ask coordinator for shared changes. Coordinator owns
those paths and actual production routing/security verification.

Read cards docs/implementation/tasks/{L2-05,L1-01}.md and their normative refs,
docs/PLAN.md, docs/architecture/security.md and design DESIGN.md/tokens.json.
Existing merged shell/storage/UI are development dependencies; broader acceptance
remains pending under user-authorized unfinished application increments.

Meaningful evidence: actual summary metadata search/Arrow/Enter selects exact
saved entry; zero generic execution/browser/copy/Hide on entry; explicit existing
literal/search effects; full 500/paging bounds; stale/deleted/hidden/wrong ID/rev,
missing storage and late reads; Back/root query+selection; IME/held Enter and
affected light/dark keyboard/axe states. Unit/component mocks support development;
only coordinator production app evidence establishes integration. Report bounded
criterion evidence and every outstanding task/native/AT/release limitation.
