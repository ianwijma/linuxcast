# L1-01: explicit saved web-search fallback

Bounded application increment on merged PR49/f79a345. Full L1-01/L2-05,
prerequisite and complete local 1.0 acceptance remain unfinished.

## Frozen boundary

Existing launcher metadata `quicklink:{id,revision}` gains optional
`webSearch:true`, derived only from the validated saved summary by main.
It contains no URL/configuration/query and grants no execution authority. Literal
and path links omit it. No IPC/API, schema migration, process or dependency is
added. Existing strict Quicklink selection/Open requests are unchanged; when
calling Get, strip the metadata-only marker and send only ID/revision.

When a nonblank valid root query has no ranked registered-command matches,
show a separate configured web-search fallback section, using only current
shown/enabled webSearch-marked entries and a shown/enabled Quicklinks parent.
At most 100 providers, deterministic name/ID order, retaining a current selected
synthetic identity within that bound. Label the cap if truncated; explain that
choosing a provider opens a local form and only Open search sends the query.
No fallbacks for blank/invalid/overlong query, hidden/disabled/missing parent,
loading/unavailable catalogue, or literal/path providers. Matching commands
retain their existing ranking and behavior. No implicit/default remote choice.

A fallback row has a distinct stable synthetic local ID (not a registered command
ID); Arrow/Enter deliberately chooses “Search with <saved name>”. Recheck current
root view/revision/query/selection/provider/parent before opening. Never send
synthetic IDs to generic Execute, pin/alias/visibility or persistence. Do not
make fallback IDs acceptable to shared launcher execution schemas.

Use a local `QuicklinksFlow.openWebSearch(fromViewId,selection,query)` entry
method. Capture only the query at explicit choice, validate it with existing
webSearchQuerySchema, and freshly verify the exact selected saved ID/revision,
shown state and webSearch kind before opening existing Query form prefilled
with that value. Existing local Review search→exact target→separate Open search
remains mandatory. Ordinary saved-entry navigation remains empty and never
inherits root text. No browser/copy/Save/usage during query/results/choice/form/
review/navigation. No new context/network/provider permissions or AI fallback.

Retain existing root/List/Form depth, original-context fences, unknown/no-replay,
manual Reload, hidden denial, exact receipt and transient-argument semantics.
Stale/deleted/hidden/converted/missing providers withhold alternate rows and show
Reload/Back; never convert fallback into literal/path Open. Delayed read or
synchronous publication invalidation cannot push a late argument form or start
an effect after query/selection/Back/Hide/dispose changes. Reload is deliberate
recovery, never automatic action replay. Cancel/Back restore original query and
selected fallback identity when it still exists. Hide clears captured query.

## Ownership and validation

manifest_review_sol owns existing launcher controller/fixtures/tests/README/
evidence and Quicklinks presentation/tests/README only. Coordinator owns this
freeze, contracts/main projection/mappings, actual app checks and registry.
Read full L1-01/L2-05 cards and refs: PLAN, architecture/overview+security,
product/builtins, testing-release, DESIGN/tokens; shared Form/List/Detail/Actions
and existing tokens. No new infrastructure/research/proof work or dependencies.

Focused evidence covers empty/no-match/matching query, provider kinds/parent,
cap/stable selection, exact current choice and fresh record, retained query,
Cancel/Back/reopen, delayed/stale/wrong-kind/hidden/unknown/Reload, synchronous
publication invalidation, held Enter/IME, keyboard/axe and affected dark/light/
200% captures. Coordinator proves actual persisted saved search→no-match root
query→explicit choice→review→separate real GIO argv and restart/export privacy.
Mocks are component evidence only; no whole-task/native/AT/release completion.
