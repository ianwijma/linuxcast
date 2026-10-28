# L2-04: calendar and elapsed date arithmetic

Next required bounded application increment on merged PR52/7aa0d91. Full
L2-04/complete local1.0/prerequisite/native/AT/release requirements remain.
No new IPC, dependency, migration, service, research or proof lane.

## Frozen grammar and semantics

`<ISO local date/time>[<source zone>] + <ISO duration> to <target zone>`
or the same with `-`. Existing DATE-TIMES.md source/offset/zone/precision/year/
resource rules apply. Examples:
- `2024-03-09T12:00[America/New_York] + P1D to America/New_York`
  gives `2024-03-10T12:00:00-04:00[America/New_York]` (23 elapsed hours).
- Same source `+ PT24H` gives `2024-03-10T13:00:00-04:00[America/New_York]`.
- `2024-11-02T12:00[America/New_York] + P1D to America/New_York`
  gives `2024-11-03T12:00:00-05:00[America/New_York]` (25 elapsed hours).
- `2024-02-29T23:59:59.123456789[UTC] + PT0.000000001S to UTC`
  gives `2024-02-29T23:59:59.12345679+00:00[UTC]`.

One uppercase ISO duration: `P[nY][nM][nW][nD][T[nH][nM][n[.fraction]S]]`.
At least one component; T requires a time component. Integer components 0..999999
with no redundant leading zeros; only seconds allow1..9 fractional digits.
Unsigned components, fixed order, no duplicate units, exponent/comma/locale/
negative atoms, fraction on days/hours/minutes, bare P or PT. `P0D`/`PT0S`
are identities. The separate + or - operator applies to every component. One
operation only; spaces around it and `to` required. Target zone is mandatory.
Calendar M means months before T, elapsed M means minutes after T.

First validate exact source as in DATE-TIMES.md, including offset/fold/gap rules.
Then apply signed years/months/weeks/days to local Gregorian fields in the source
zone, with overflow REJECT: Jan31+P1M and leapday+P1Y do not silently clamp.
A changed calendar step landing in a source-zone gap or fold is refused, never
shifted or assigned an implicit occurrence. Choose another date/duration, use
an elapsed-time duration, or explicitly convert the resulting date/time with a
matching offset. A zero calendar step retains an explicitly selected source
fold occurrence. Source offsets are never reused as result authority.

Next apply signed hours/minutes/seconds/fraction as exact elapsed time to that
resolved instant. This may cross a clock transition and land in a repeated time;
the instant uniquely selects its offset. Finally convert to target zone using
exact existing canonical formatting. A mixed P1DT1H means calendar day first,
then one elapsed hour; subtraction follows the same field order with negatives,
and is not promised to invert mixed addition across transitions. Any calendar
step/result outside years0001..9999 is refused. Fixed d/wk scalar unit conversions
remain86400s/604800s and do not gain civil semantics.

Implementation uses existing pinned Temporal/local ICU, bounded grammar and a
fixed number of library calls. No current clock, loops over dates/transitions,
user code, network/storage/clipboard or global patch in the evaluator.

## Frozen result and errors

Success/formatter/main request/receipt stay existing exclusive
`{ok:true,kind:'date-time',dateTime:'zoned',text}` and expression-only Copy.
No schema/API expansion. Calculation errors add only local fixed codes:
- `invalid-duration`: use one supported ISO duration, each component0..999999,
  seconds-only fractions, and Supported date/time help.
- `invalid-duration-result`: calendar step/result is invalid/out of bounds or
  missing/repeated in source zone; choose another date/duration, use elapsed
  hours, or explicitly convert an unambiguous resulting date/time.
Original source invalid/fold/gap/zone codes remain unchanged.

## Bounded UI assignment and evidence

Read FULL docs/implementation/tasks/L2-04.md and L1-01.md plus their normative
security/data/product/testing/design references, DESIGN/tokens, DATE-TIMES.md,
GRAMMAR.md and this freeze. Existing reviewed unfinished shell/storage/sharedUI
are reused; their full acceptance remains outstanding.

manifest_review_sol owns calculator presentation/fixtures/presentation+browser
tests/README/evidence and only necessary existing launcher fixtures/tests/README/
evidence. Coordinator owns engine/helper/types/main/nativeactual tests,
contracts/manifests/locks/mappings/registry and integration routing. Do not alter
shared boundaries; request changes. Existing sandbox/noarbitrarycode/nohistory/
noimplicitcopy/unknown/reentrant/originalcontext/security rules remain.

Use existing Expression Form, root result, Calculation Detail, Supported date/time
help, Edit and separate Copy; no new view/process. Explain calendar-vs-elapsed,
month-end/leap rejection and missing/repeated calendar result recovery. Keep
explicit Evaluate, same depth3, unsenthelp/backfocus, heldEnter/IME/200%/axe,
exact exclusive receipts and stale/pending/unknown/no-replay guards. Show real
canonical results, no simulated copies. Relevant dark/light affected captures.
Bounded meaningful checks cover spring P1D vs PT24H, autumn/day subtraction,
months/leap invalid and recovery, mixed duration/fractions, refusal/invalid/
limits, explicit root result and no Copy until separate action. Coordinator
proves production/native readback; component mocks remain labelled as such.
No more infrastructure/research/proof work. Full opt-in rates/stale/offline,
copy/paste variants, nativeAT/session/performance/release remain required;
AC02/UI/task stay pending without their complete evidence.
