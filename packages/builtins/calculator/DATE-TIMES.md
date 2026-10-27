# L2-04: explicit zoned date/time conversion

Bounded required application increment on merged PR51/4612ec0. This implements
one date/time conversion flow, not full civil-duration arithmetic or rates.
Full L2-04/complete local1.0/prerequisite/native/AT/release scope remains required.

## Frozen grammar and engine

`<ISO local date/time>[<source zone>] to <target zone>`; source may have an
explicit `Z` or numeric offset before its bracketed zone. Examples:
- `2026-10-27T09:00[Australia/Sydney] to UTC`
- `2024-11-03T01:30-04:00[America/New_York] to UTC`
- `2024-11-03T01:30-05:00[America/New_York] to UTC`

ISO Gregorian years0001..9999, YYYY-MM-DD, uppercase T, hours/minutes required;
optional seconds and1..9 fractional digits. No natural-language/ambient clock,
locale-dependent date, implicit zone, alternate calendar, leap-second60 or24:00.
Use UTC or a supported IANA area/location identifier, never an abbreviation or
offset-only zone. Local ICU normalizes supported aliases; result may use their
canonical spelling. Fixed-offset IANA Etc/GMT names retain their standard
reversed sign convention. Conversion preserves the exact instant, including
historical second-level offsets. The fields form enforces exact source-offset
matching; plain target fields plus its exact offset avoid Temporal string
serialization's minute-rounded compatibility behavior.

Source offset, if given, must match that local time and source zone. Z is checked
as a supplied +00:00 offset, never an override of the named zone. Unknown -00:00
is refused. Missing local times (including whole skipped dates) are refused,
never moved forward/backward. Repeated local times require a matching offset;
the two matching offsets produce distinct instants. Fractional-hour and30minute
clock changes are covered. Target output includes seconds, optional normalized
nanosecond fraction, exact offset and named zone. Output outside year bounds is
refused; no truncation or rounding of the instant. Numeric subtraction without
an explicit ISO date/time T remains ordinary arithmetic.

The fixed helper uses @js-temporal/polyfill0.5.1 and local Intl/ICU only. It never
patches globals, reads the current clock, performs network/storage/clipboard/I/O,
or interprets source as code. Existing512-byte/ASCII/resource guards run before
library parsing. Calls and disambiguation candidates are fixed and bounded; no
application search over clock time. Fixed errors invalid-date-time,
unsupported-time-zone, ambiguous-date-time, nonexistent-date-time contain no
raw input or library error. Outer arithmetic/units/colour behavior stays intact.

## Frozen result/receipt

Calculation success adds `{ok:true,kind:'date-time',dateTime:'zoned',text}` with
no numeric value/unit/colour. `calculatorDateTimeValueSchema` validates closed
canonical ISO text syntax/date bounds/offset/zone shape. Engine validates actual
zone rules. formatCalculationText validates exclusive kind and returns text.
Existing numeric/colour results cannot carry dateTime. No generic free-text copy.

Existing copyCalculatorResult({revision,expression}) request is unchanged. Main
freshly re-evaluates and copies only canonical text, returning exclusive
`{outcome:'copied',dateTime:'zoned',text}`. Preload validates the closed receipt.
UI must compare text AND dateTime/unit/colour presence for every result kind;
a receipt tagged as another kind cannot confirm Copy. No new channel or caller
result/zone/offset authority. Existing unknown/context/reentrant/no-replay/usage
and privacy rules remain. No expression/result history.

## Bounded UI assignment

Use existing Calculator Expression Form, local root candidate, Result and Copy.
Add discoverable Supported date/time help with exact grammar, UTC/IANA/offset
examples and actionable gap/fold/unknown-zone/invalid-date explanations. Keep
existing total depth3 and unsent draft/focus, static sanitized Detail Markdown,
plain metadata and shared tokens/primitives. Date/time Result explains exact
instant/explicit zone rather than numeric approximation or colour text. Show
Date/time format or equivalent clear metadata. Explicit Evaluate/review/result
and separate Copy; held Enter/IME never copy. Preserve all original-context/
late/query/selection/Back/Hide/dispose/unknown/exact receipt fences.

manifest_review_sol owns existing calculator presentation/fixtures/tests/README/
evidence and only necessary existing launcher fixtures/tests/README/evidence.
Coordinator owns this freeze, contracts/types/formatter/engine/engine tests,
main/preload/native integration, manifest/lock/licenses/mappings/registry/actual
checks. No overlap/shared edits, new processes, infrastructure/research/proof.
Read FULL L2-04/L1-01 cards+norms, DESIGN/tokens/GRAMMAR/COLOURS and this contract.
Existing reviewed shell/storage/sharedUI/engine support unfinished increments;
full dependencies/acceptance remain unwaived.

Meaningful evidence includes ordinary success/exact Copy, leap/rollover/fraction,
fold both offsets, gap refusal, unknown/invalid/unsupported and manual recovery,
wrong-kind receipts, unsent help/back focus, depth, heldEnter/IME/200%+axe and
relevant dark/light captures. Coordinator proves actual production conversion/
refusal and native independent clipboard readback; mocks are component only.
Keep AC02/UI pending until full dates/durations/rates/native acceptance exists.

## Dependency provenance

Pinned npm @js-temporal/polyfill0.5.1 (ISC), jsbi4.3.2 (Apache-2.0); exact tarball
integrities in bun.lock, licenses copied into licenses/. Upstream0.5.1 release is
marked pre-release; no audited/stable-library claim. Existing Bun lifecycle policy
unchanged; no new trusted install script. Native Temporal availability is not
assumed across Node24/Electron. Local Node24.22.1 tests report ICU78.3/tz2026e;
record actual packaged runtime separately. Full SBOM/package audit remains a
release gate, not satisfied by this note.

Primary API/policy references:
[Temporal ZonedDateTime](https://tc39.es/proposal-temporal/docs/zoneddatetime.html),
[time-zone ambiguity](https://tc39.es/proposal-temporal/docs/timezone.html),
[pinned package](https://github.com/js-temporal/temporal-polyfill/blob/v0.5.1/package.json),
[release](https://github.com/js-temporal/temporal-polyfill/releases/tag/v0.5.1).
Context7 tool unavailable; coordinator consulted official sources directly.
