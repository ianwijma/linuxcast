# Launcher commands and applications — bounded L1-01/L1-02 increments

`Launcher` uses the existing shared `ViewRenderer` and `ViewSession`. Main supplies
`LauncherApi` and a named Hide callback; the renderer receives only metadata and
sends a selected command ID with the registry revision. The explicit URL Form
uses the separate named URL API with only revision and a validated address. Main retains all actual
handlers, sender validation, current availability checks and usage persistence.
No shell, provider, file or generic repository interface is added to rendering.

The registry supplies registered built-ins and discovered applications. Cold
empty-query ordering follows main's useful default order. Local saved favourites,
usage and aliases are read through main, and query text stays in the renderer.
New query generations invalidate old work; accepted refreshes preserve selected
identity through reordering. A newer metadata response supersedes older replies.
Loading blocks execution. Disabled rows remain discoverable with their reason.
Only an explicit current item action can dispatch; stale revisions, hidden views,
unknown IDs and duplicate in-flight requests cannot. Requests have a five-second
presentation deadline; unknown outcomes show an error and never auto-replay.
A Quit or application-launch receipt is never displayed as proof of a completed
system operation. Explicit deadline-exceeded replies retain unknown-outcome
wording; the user checks the result before attempting another launch.

Design: DESIGN.md Shell and navigation, Results and actions, States and motion,
Accessibility, and Review gate. The shared list provides arrows from the query,
Home/End on the list (native caret Home/End in the query), Enter, Ctrl+K actions,
Escape panel dismissal before launcher dismissal, visible focus and disabled
reasons. Reopening focuses the query. A failed Hide restores the view instead of
leaving an empty window. Shared fonts, colours, spacing and opaque surfaces are
unchanged; this feature introduces no second visual system.

## Pin and unpin commands

The selected enabled command has an explicit secondary **Pin command** or
**Unpin command** action. The original Open/Hide/Quit remains primary. Pin state
uses the existing accessible Pinned accessory and star icon. A pending change
blocks pin/execute duplicates and refresh races; it does not change the badge or
claim saved state. Only a validated authoritative reply from
`setLauncherPinned({commandId, revision, pinned})` changes the metadata. It must
contain the matching command and requested saved value at a current revision.
Ranking then updates while the shared view preserves selected identity and the
primary action.

Pinning never executes a command or records use. The coordinator's single owner
updates only the pinned field, preserving count, timestamp and alias. Unavailable
ranking storage disables this edit and offers Reload commands. A rejected,
malformed or uncertain acknowledgement retains prior metadata and requires an
explicit reload before another pin edit; no mutation is replayed automatically.
Reload remains available even if a later ordinary command succeeds. Hidden or
cancelled replies are ignored; reopening fetches authoritative state again.

## Edit a search alias

The selected enabled command offers **Edit search alias** in Actions. It pushes
one shared Form onto the existing ViewSession stack, prefills the saved alias,
identifies the target command in the field hint and provides Save alias/Cancel.
Saving trims the draft; an empty value requests removal with `alias: null`.
The shared bounded alias schema rejects invalid/control text and more than 64
Unicode scalars or 256 UTF-8 bytes. Known collision/invalid/unavailable replies
show fixed inline errors and retain the draft for explicit correction. Stale or
unavailable replies also expose an explicit Reload commands action in the Form. Main
checks normalized collisions against declared and saved aliases; the renderer
never treats a draft as execution authority.

Only a same-revision, one-target `updateOnly` acknowledgement with the exact
requested alias updates local metadata. Immutable command fields and pin must
remain unchanged. Current usage count and timestamp come from the trusted owner;
execution or settings may have changed them since the renderer loaded its
catalogue. The sole owner changes only the alias field during an alias write.
Other paged commands retain their metadata. Saved aliases enter the existing local exact-alias ranking; removing
one removes that match. Alias editing never invokes a command or records use.

Root query, selection and primary action remain in the lower stack frame through
save, cancel or back. Shared draft/discard handling and focus restoration apply.
Pending saves disable fields/submission; stale form/root actions, hidden or
closed views, duplicate submissions and late replies cannot publish results or
replay mutations. An uncertain acknowledgement keeps the draft, disables further
metadata edits and exposes **Reload commands** through Actions. This explicit
reload reads stored state without repeating the write. Cancel/back from an
in-flight save also retains Reload; later successful ordinary commands cannot
clear the unconfirmed metadata flag. Hiding/reopening fetches fresh stored state.

Design: Shell and navigation; Results and actions; List, grid, detail and form;
States and motion; Accessibility; Review gate. No feature-specific CSS or new
components, dependencies, execution permissions or storage interfaces are added.

## Command visibility

**Manage commands** is a global root action, including when the root query has no
matches. It opens one shared List with local search across both shown and hidden
registered metadata. At most 100 matches are displayed; refining the query finds
identities from any collected page. Shown/Hidden and Unavailable accessories stay
visible. Management provides only Hide/Show, Back and Reload; it never invokes a
registered command. Hidden, unavailable applications can still be shown again.
Hide Linuxcast and Quit Linuxcast remain shown for recovery, with a disabled
visibility action and explanation. Root rows append **Hide command** after pin
and alias; their original primary action stays unchanged.

Only an explicit selected action sends `setLauncherHidden({commandId, revision,
hidden})`. Both the API and authoritative `visibilityAvailable: true` are
required. A successful first page is recollected through every cursor before
metadata changes. The strict merge checks revision +1, the exact identity set,
requested visibility, immutable descriptors, pins and aliases. Usage totals are
authoritative owner metadata; visibility itself never executes or records use.
No optimistic removal or saved toast appears. Root ranking excludes hidden rows
before caps and selection retention; direct hidden primary, URL, calculator,
alias and pin entry points are also fenced.

Back/Escape restores the root query and selected identity unless that identity
was hidden and is consequently no longer eligible. Management query is ephemeral.
Pending changes block duplicate/different-target requests. Leaving or hiding a
pending view invalidates late presentation and warns that visibility may have
changed; it cannot undo storage. Unknown/malformed/mismatched/lost replies and
failed page collection require **Reload commands**. Known unavailable/stale
failures offer fixed remediation. Only an explicit, complete authoritative
reload clears the metadata gate; automatic Hide/reopen and ordinary execution
cannot clear it or replay a write. The five-second presentation deadline also
covers acknowledgement pagination.

Design: Shell/navigation, Results/actions, List/detail/form, States/motion,
Accessibility and Review gate. The shared List, Actions, status and focus behavior
use existing tokens and fonts; no new visual system or registered management
command is added. This is partial L1-01 command visibility and keyboard/privacy
UI evidence, not full provider, fallback, AI, native or task acceptance.

## Explicit Open URL

The registered **Open URL** command opens one shared Form, with a persistent URL
label, Open URL submission and Cancel. A valid HTTP/HTTPS root query locally
matches this existing command and visibly prefills the canonical ASCII address.
Opening the Form, editing, pinning, alias changes, cancel and back never send a
URL. Invalid addresses remain editable with inline errors. The shared URL schema
rejects credentials, unsupported schemes, raw whitespace/control/surrogate and
backslash characters, malformed escapes and addresses exceeding 8,192 canonical
UTF-8 bytes. The dedicated Form accepts this bound while root search retains its
512-code-unit limit. Parsing is local and performs no network requests.

Only a current explicit submission calls `openLauncherUrl({revision, url})`.
Pending submission disables fields and duplicate requests. Stale actions,
hidden/disposed UI and late replies cannot dispatch again or publish a result.
Known unavailable handoff shows remediation as a status error and retains the
valid draft for an explicit unchanged-value retry after browser settings are
fixed. Known invalid/stale requests retain an inline error and offer Reload.
Unknown outcomes tell the user to check the browser, retain the draft and gate
new submissions until explicit Reload. This gate survives cancel, ordinary
command success and automatic hide/show/refresh; Reload never repeats a URL.

A strict dispatched-only receipt pops the Form and requests the existing named
Hide callback. A Hide failure is reported separately from the dispatched browser
handoff. No completed-page/focused-browser toast is shown. Main owns dispatch and
records only command usage after acknowledgement; this slice does not save URL
contents/history. Other aliases, pins, paged applications, root query, selection
and primary action remain in the existing system. Shared design sections are
Shell and navigation; Results and actions; List, grid, detail and form; States and
motion; Accessibility; Review gate. No feature-specific component/CSS is added.

## Application catalogue

Main supplies pages of at most 100 metadata rows at one registry revision. The
controller validates all pages, consistent availability, unique IDs, cursor
revision/offset and bounded total count/bytes before replacing the live catalogue.
Failed, stale or hidden refreshes do not publish a mixed partial snapshot. Search
stays local over up to 4,102 rows, takes the first 20 per provider, and presents a
separate Applications section using existing shared list primitives. Application
primary actions say Open; built-in Open/Hide/Quit retain their meaning. No desktop
ID, executable path, shell command or native fingerprint reaches presentation.

Application pins use the same explicit metadata actions. A validated one-row
`updateOnly` acknowledgement merges the matching target without losing other
pages; a partial full-snapshot reply rejects. Unavailable application discovery
keeps built-ins usable and offers Reload commands. Selection remains a stable ID
across query results and pin reordering. A still-matching selected application
remains visible across a refresh even when ranking would push it past the provider
cap: it replaces the lowest unselected result within that same bound. A removed
identity or one that no longer matches the query is released normally.

## Registered Desktop Actions

A registered application's declared Desktop Actions appear after Open, pin,
alias and visibility in the existing root Actions menu. Open remains primary.
Declared labels are plain data; only the selected registered application ID,
registry revision and declared action ID enter the optional named
`executeApplicationAction` API. Query text, titles, desktop paths, Exec and
arguments do not enter this request. Management never exposes or executes these
actions. Omitted legacy metadata or an available empty list adds no actions.
Unavailable metadata shows a disabled **Application actions** entry; a missing
API disables declared actions. Both explain how to open the application for its
other actions, while ordinary Open remains independent.

Only explicit intent can request an action. Pending state blocks duplicates and
shows a fixed status; typing, selection, navigation and rendering cannot request
one. Five-second presentation bounds, current root/query/selected-identity and
registry guards fence stale, hidden and disposed replies. Leaving a pending
context warns that the outcome is unknown and cannot undo the native request.
An exact strict `{outcome: 'requested', actionId}` receipt only acknowledges a GIO
request; it does not prove launch, focus or completion. Only that receipt in the
unchanged invocation context requests the existing named Hide. A Hide failure
explicitly says the application action was requested and the launcher could not
hide; it never relabels the action unknown or repeats it.

Known preflight denial uses fixed not-requested/Open/Reload remediation. An
unknown, malformed, mismatched, cancelled or lost receipt tells the user to
check the application, then explicitly Reload before a deliberate new request.
The action gate survives automatic Hide/reopen, refresh and ordinary command
success. Only a complete explicit authoritative reload clears it; no action is
queued or replayed. This gate is separate from preference editing and primary
Open. Main owns current native metadata/fingerprints, sender/hidden checks,
aggregate usage and dispatch; UI never increments use optimistically.

Design: Shell/navigation, Results/actions, States/motion, Accessibility and Review
gate. Shared List/Actions/status/focus and existing tokens/fonts are reused, with
no feature CSS or added window. This provides bounded L1-02 AC01 identity/input,
AC02 outcome/availability, UI and privacy evidence. The request-observing synthetic
fixtures do not establish native process effects, persistence or stdio isolation.
Those checks belong to the coordinator/native integration lane. Scoped file/URI/
argv/shell/history and complete desktop/native-AT/release gates remain required.

## Explicit configured web-search fallback

A valid nonblank query with no ranked command matches offers **Search with
<saved name>** rows in a separate Configured web searches section. The query stays
local. Only shown/enabled saved web-search metadata with a shown/enabled Quicklinks
parent qualifies; literal/path links never become fallback providers. Providers
sort by name/ID, cap at 100 with an explicit cap label, and retain a matching
selected synthetic identity across refresh/reordering. Loading, failed catalogue
reads, invalid/blank queries and matching registered commands offer no fallback.

Arrow/Enter deliberately chooses one provider. Its synthetic ID cannot enter
Execute or preference APIs. `QuicklinksFlow.openWebSearch` receives only strict
saved ID/revision plus the captured query, reads the complete current saved list
and exact shown search definition, then opens the existing shared Query Form.
The user still explicitly **Review search → Open search**. Ordinary saved-entry
navigation keeps an empty argument. Cancel/List/Back restore the original root
query/selection; Hide drops the captured query. Search/navigation/Review perform
no browser/network/copy/Save/use operation and persist no query.

Stale, deleted, hidden, wrong-kind or unavailable definitions withhold alternate
rows and offer Reload/Back. Explicit Reload is manual recovery, never replay.
A fallback converted to a literal/path link cannot reuse the captured query.
Pending reads, synchronous publication, newer Reload operations and root/query/
selection/Back/Hide/disposal changes fence late Form navigation. Existing exact
browser receipts, separate Hide-failure truth and persistent unknown gates remain.

Validation on Linux x64, Node 24.22.1/Bun 1.4.4: **403 focused tests** pass
(251 Quicklinks presentation, 27 routing, 125 launcher controller), including
38 added fallback cases. **68 launcher Chromium keyboard/axe cases** pass,
including seven new fallback cases and all 61 earlier cases. Full typecheck,
scoped ESLint, plan and diff checks pass. Commands use explicit
`LINUXCAST_TEST_FILES` selections with the existing Vitest/Playwright configs.
Ten inspected public captures `evidence/*-web-search-fallback-*` cover dark/light
root/Query/Review, stale/pending/unknown recovery and 200%-text controls. DESIGN
Shell/navigation, Results/actions, List/Form/Detail, States/motion, Accessibility
and Review gate apply; existing host primitives/tokens are reused without CSS.
Fixtures are synthetic request observers, not native dispatch/persistence proof.

This supplies partial L1-01 AC01 selected-identity/cancellation, UI and PRIVACY,
and L2-05 typed-query/UI/privacy evidence. Coordinator owns production saved
config→fallback→exact GIO argv/restart/export checks. Full multi-provider/file/AI
fallback, ranking controls, templates/context/targets, prerequisite acceptance,
Debian GNOME/KDE Wayland/X11, native AT/performance and release gates remain
pending. Neither task is complete and complete1.0 scope is unchanged.

## Local calculator root result

An unmatched valid query with an explicit digit/math/colour signal can show one
**Calculate expression** row with canonical local output before configured saved
searches. The real bounded evaluator/formatter supplies arithmetic, existing unit
and colour results; ordinary words/bare constants, invalid/domain/unsupported/
oversized input and a hidden/disabled Calculator produce no candidate. Existing
registered matches retain priority. A selected saved-search alternative is not
replaced when the local candidate appears.

Only a current selected/revision/query-matching deliberate choice invokes local
`CalculatorFlow.openExpression`, which re-evaluates and opens the existing
Form/Detail within total depth 3. No synthetic ID reaches generic Execute or
metadata writes. Typing, classifying and choosing copy/transmit/persist nothing;
Copy result remains a separate exact named operation. Edit/Back/Cancel preserve
root query/selection; Hide clears captured state; generic Calculator opens empty.
Pre-API pending-publication, original-context and lifecycle guards prevent
reentrant zero-intent Copy and stale success; unknown outcomes never replay.

262 focused unit checks pass (82 calculator presentation,27 calculator routing,
125 launcher controller,28 Quicklink routing); 35 cases are new. Eight affected
Chromium keyboard/axe checks and 29 retained calculator cases pass. The launcher
suite now contains 76 cases, retaining 68 earlier PR50 cases without expanding this
slice's browser run. Typecheck, scoped lint, plan and diff pass on Linux x64 with pinned
Node 24.22.1/Bun 1.4.4. Twelve inspected public captures
`evidence/*-root-calculator-*` cover dark/light root/result/Edit, unit/colour,
error/pending/unknown and 200%-text states. Shared tokens/primitives follow DESIGN
Shell/navigation, Results/actions, List/Form/Detail, States/motion, Accessibility
and Review gate. Fixtures observe synthetic requests, not clipboard effects.

Partial L1-01 AC01/UI/privacy and L2-04 AC01/partial AC02/UI/privacy evidence only;
coordinator owns real native clipboard/independent-reader/aggregate-export
integration. Remaining providers/ranking, dates/DST/rates, prerequisite/native
GNOME/KDE Wayland/X11/AT/performance/release gates stay required. No full task or
scope reduction is claimed.

## Zoned date/time through the existing root calculator

The supplied date/time engine is accepted by the unchanged local classifier and
canonical formatter. Explicit ISO date/source-zone→target-zone input offers the
existing Calculate expression row; gap/fold/invalid inputs offer no guessed
result. A deliberate choice opens the existing local Date/time Result, and only
separate Copy sends expression/revision. The updated request-observing fixture
returns the exclusive dateTime receipt; one new root Chromium keyboard/axe check
and four routing checks pass. Its inspected public capture is
`evidence/dark-root-date-time-query.png`. The calculator README records the
136 focused units, 39 calculator browser checks, ten other date/time captures,
exact-acknowledgement/help/error behavior and limits. Production clipboard and
privacy integration remain coordinator-owned; full civil-duration/rates/provider,
prerequisite/native desktop/AT/performance/release acceptance stays pending.

## Calendar arithmetic through the existing calculator entry

The unchanged local classifier/formatter accepts the supplied calendar/elapsed
engine results. The new root fixture check verifies P1D and PT24H show distinct
spring results and neither choice copies; Edit/Cancel returns the captured query.
Two routing checks retain expression-only, separate exact dated Copy. Its public
capture is `evidence/dark-root-calendar-arithmetic-query.png`; no launcher
controller, API, ranking or persistence boundary changes. Calculator README
records 158 focused units, 47 calculator browser cases, the root case and twelve
inspected affected captures. This is partial AC02/UI/privacy evidence; production
native readback remains coordinator-owned and complete rates/provider/prerequisite/
native AT/session/performance/release acceptance remains pending.

## Evidence and limits

- `packages/search/tests/search.test.ts`: bounded ranking/generation/URL and visibility matching tests.
- `tests/controller.test.ts`: 125 registry/selection/action/failure tests, including alias draft, stale action, cancellation and acknowledgement behavior.
- `tests/catalogue.test.ts`: atomic pagination and pin/alias/visibility integrity checks.
- `tests/launcher.ui.test.ts`: 78 Chromium component cases (68 retained plus eight root-calculator, one date/time and one calendar-arithmetic case) covering keyboard,
  action-panel focus, disabled states, loading, filtered-empty, errors and axe.
- `evidence/`: actual dark/light component screenshots plus affected states;
  viewed for layout. These use the three real command names and public synthetic applications with an explicitly
  labelled request-observing API fixture and in-memory pin metadata. They do not
  execute system operations or establish SQLite persistence. The pin increment
  includes dark/light pinned, unconfirmed and unavailable affected states. The
  application slice adds dark/light application lists, unavailable discovery and
  unknown launch outcomes. The alias slice adds dark/light shared Form, inline
  collision and unconfirmed states, keyboard save/remove/cancel and exact query
  checks. Alias fixtures observe requests and keep synthetic metadata in memory;
  they do not establish real persistence. The URL slice adds dark/light Form,
  invalid and unknown outcomes plus unavailable handoff. Its fixture observes
  requests only, and browser checks verify no external requests on typing,
  navigation or synthetic submit. Visibility adds dark/light management, hidden and
  empty states, plus unavailable, pending and uncertain screenshots. Its labelled
  fixture observes explicit requests and holds public metadata in memory; it does
  not establish storage or desktop integration. The visibility slice retains 26
  controller and ten browser cases. Desktop Actions
  adds 32 controller and ten browser cases, with nine dark/light/affected captures
  for declared menus, pending, denial, unknown/mismatched, unavailable and separate
  Hide failure. Its public synthetic requests are observed only, never executed.
  All 43 earlier browser cases remain in the 53-case suite; mapped L1-02 unit
  checks cover 210 cases across controller, catalogue and search.
  These checks ran with Node 24.22.1/Bun 1.4.4.

Generated fixture data only; no user content, secret values, query logging or
remote requests. Unit/browser checks are development evidence. The coordinator
owns the actual main/preload/storage/Electron flow and its validation. Debian
GNOME/KDE Wayland/X11 and native assistive-technology acceptance remain pending,
along with full L1 providers, ranking controls and remaining file/AI fallback actions. F1/D1
native gates remain pending. Broader typed URI/file/argv/shell flows and URL/run-history controls remain
outstanding in L1-02. This slice does not mark all L1-01 or L1-02 complete.
