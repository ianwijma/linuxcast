# L2-05 — captured date/time Quicklink application increment

Base PR74/develop633ca9fa79218956af072b6d76fa62fb6784a70a. Read complete L2-05
task card, PLAN, workflows/security/product builtins/testing-release, DESIGN/tokens.
Existing L1/F3/owner/shared UI/native browser outputs are integrated under the
user-approved unfinished sequencing; full acceptance/dependencies remain pending.

Bounded application flow: create/edit a saved clock-value Quicklink → search its
actual registered name/tag in launcher → open that exact current saved entry →
explicit Review captures one date/time/timezone snapshot and displays the exact
encoded URL → separate explicit Open sends that reviewed URL to existing native
browser handling. No typing/save/navigation/browser effect, no saved expanded URL,
snapshot, clock history, hidden code/template, remote call or background refresh.
Back/Cancel retain parent state; Hide/restart drop the snapshot. Full1.0 retained.

First pure-builder interface is frozen here. Shared persisted config/wire/UI will
be coordinator-owned next; this note does not itself implement any capability.
Only new helper/test/report files are assigned initially. No framework, new
provider/service/dependency/process or general context acquisition is requested.

`src/clock.ts` exports:

```ts
interface ClockLink {
 queryParameter:string;
 source:'date'|'time'|'timezone';
 timeZone:'system'|'UTC';
}
interface ClockSnapshot {capturedAt:string;timeZone:string;}
captureClockSnapshot(epochMs:number,timeZone:string):Readonly<ClockSnapshot>;
buildClockLinkUrl(baseUrl:string,config:ClockLink,snapshot:ClockSnapshot):
 {url:string;value:string};
```

Capture is pure: explicit finite integer epoch milliseconds and explicit valid
IANA/UTC timezone only, no Date.now/environment/locale/context lookup. Return an
immutable canonical UTC ISO instant with milliseconds and canonical Intl timezone.
Reject unrepresentable/non-four-digit-year instants and invalid/oversized/control/
surrogate zones with fixed safe errors; no truncation, fallback or guessed timezone.
Caller owns obtaining system timezone at an explicit invocation. It is data, not
file/network/native authority. Main must separately validate a system snapshot
timezone against its actual current host timezone before an effect.

Build strictly validates exact own-data objects (no accessors/exotic objects/extras), the
existing quicklinkUrlSchema/query-parameter rules, enum source/timeZone and exact
canonical snapshot. UTC config requires snapshot zone UTC. System config accepts
the explicitly captured canonical zone; no implicit lookup in this pure function.
Date=`YYYY-MM-DD`, time=`HH:mm:ss` in captured timezone (h23/ISO calendar/Latin
digits), timezone=canonical IANA/UTC string. All projections derive from the same
captured instant. Formatting is an explicit typed operation, then interpolate the
fixed `{{context.date}}`, `{{context.time}}` or `{{context.timezone}}` through the
existing @linuxcast/templates parser. No expression or formatting inside braces.
Date/time midnight/DST must remain deterministic; Open must not recapture a later
instant. Caller performs explicit new Review to refresh; no timer.

Set exactly the chosen URL query component using URLSearchParams, preserving
origin, base path and fragment, plus unrelated parameters. Never encode the entire
URL or interpolate an executable/raw template. Enforce existing8192 UTF8 result
bound and return exact canonical URL/value. Errors fixed and content-free, e.g.
ClockLinkBuildError reason invalid-definition/invalid-snapshot/result-too-large.

Helpers must bundle in the sandboxed browser and main: no Node imports. Browser
JavaScript cannot reliably identify transparent Proxies; catch reflective failures
as invalid input and do not claim arbitrary Proxy detection. Main receives
structured-cloned JSON, not functions/accessors/Proxies, and owns effect authority.

Initial lane owns ONLY src/clock.ts, tests/clock.test.ts and
CLOCK-INCREMENT-BUILDER.md in packages/builtins/quicklinks. Parent owns all shared
contracts/barrels/manifests/storage/migrations/API/main/UI/routing/status. Do not
edit historical captures, existing parser or unrelated feature code. Freeze patch
and exact hashes; no author commit. Tests cover real Intl projections at day/year/
DST/UTC boundaries, explicit stable snapshot, invalid/special objects, bounded
Unicode/URL component encoding and unchanged authority. Pure tests are not actual
native browser/application evidence. Full UI/actual integration/independent review
and normal signed PR/checks/reviews/merge remain required. Map partial findings to
AC01/AC02/UI/PRIVACY without marking the complete task done.

## Shared wire/UI integration freeze

Coordinator packages/contracts/src/quicklinks.ts now adds optional saved `clock`
with exact ClockLink fields, exclusive with webSearch/pathArgument; summaries carry
only `clock:true`. Existing generic saved-root metadata does not need clock details
or a fallback marker. Clock links are NOT web-search fallback providers. Definitions
and native selected export include configuration only, never captured values.

Existing openQuicklink adds optional `clock:ClockSnapshot`, exclusive with query.
Main freshly loads ID/revision, refuses hidden/mismatched kind, validates the
snapshot's zone against saved UTC or actual host system zone, computes target from
that same supplied public instant, rechecks parent/frame/registry and invokes the
existing native opener. A public clock snapshot is typed scalar data like the
existing vars.query argument, not permission authority; renderer URL is never
accepted. No main-issued snapshot/proof service or extra channel is needed here.
Reply adds only `clock:{capturedAt,timeZone,url,value}`; require exact snapshot,
expected canonical URL/value and absent other dynamic receipt kinds. Unknown
handoff retains existing no-replay/manual Reload semantics and actual write slot.

UI owns only existing Quicklinks presentation/fixtures/tests + NEW clock captures
and CLOCK-UI.md. Use the existing FIVE New/Edit fields (name,url,type,queryParameter,
tags), preserving existing fixtures and strict submit shape. Extend Type choices:
clock-date-system, clock-time-system, clock-timezone-system, clock-date-utc,
clock-time-utc, clock-timezone-utc. Titles clearly name Current date/Current time/
Timezone name and System timezone/UTC. Each maps to source and timeZone config.
Existing queryParameter field is required by validation for search/clock only;
literal/path still require empty. Edit prefills same choice and parameter. Keep
flags/tags/other-kind conversions/save CAS/exact receipts/export/reload safeguards.
No new standalone Form controls or feature-specific visual system is needed.

Clock summary primary opens fresh exact saved record through existing get. Present
shared Detail with source/timezone/base and **Review current value** (read). Only
that explicit action calls captureClockSnapshot(Date.now(), chosen resolved zone)
and buildClockLinkUrl. Store snapshot/value/URL transiently in this flow. Review
Detail shows exact URL, projected scalar, captured UTC instant and resolved zone;
**Open time link** is a separate write, **Review current value** explicitly refreshes
with a new capture; Cancel/Back read-only. No default background refresh or recapture
on Open, including across midnight. Different saved source/revision, Hide/restart,
Back and unknown outcomes invalidate/retain recovery consistently with existing
query reviews. Preserve root/base query/selection and existing pending fences.
Main-known denial/unavailable/timezone change explains deliberate Review/Reload;
never show successful browser-page completion or automatic retry.

Use exact existing action IDs when practical; parent needs final new title/IDs for
actual tests. Actual application must create/restart saved clock config, root
search→Arrow/Enter→fresh review, deliberate native argv dispatch, freeze across
clock change, hidden/changed refusal, cancellation, no effects from Save/Review,
selected export/aggregate privacy, dark/light/200% and unavailable recovery. Pure/
component fake clocks are labelled separately from actual native dispatch evidence.
