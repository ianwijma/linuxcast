# Explicit arithmetic, unit, colour and zoned date/time calculator — bounded L2-04 increments

## Configured fiat rates UI (bounded L2-04 increment)

`src/rate-presentation.ts` exports `RateConversionFlow` with the existing shared
Form/Detail lifecycle. Currency conversion opens with 100 / USD / EUR, reads actual
configuration and requires explicit opt-in to Frankfurter reference rates.
Configure source, About rates and typing do not convert or copy. Explicit Convert
shows the timestamped estimate, publication/fetch timestamps, endpoint, independent
Online/Offline and Recent/Stale labels. Separate Copy sends only registry revision
and opaque quote ID; its receipt must match ID, numeric text and target currency.
Results disclose approximate daily reference data, not exact accounting/live prices.

Missing capabilities are disabled with recovery guidance. Source Save uses exact
CAS revision+1 and source acknowledgement. Failed/malformed/lost Save or Clear
requires manual Reload with no replay. The host retains
`createRateConversionFlowState()` across disposal/reopen; automatic configuration
reads cannot clear `metadataUnconfirmed` or prove cache deletion. Unknown Copy
requires checking the clipboard before a deliberate retry. Expired quotes, clock
rollback, stale views/root context, reentrant pending publication, Back/Hide and
late/disposed completions cannot confirm or silently repeat an action. Unsent
Form drafts/focus survive readonly help/source navigation; depth stays 3.

Author validation on Linux/headless Chromium, Node 24.22.1 / Bun 1.4.4:

- 56 focused `tests/rate-presentation.test.ts` cases pass; 15
  `tests/rates.ui.test.ts` keyboard/browser cases pass, including axe, held Enter,
  IME, disabled opt-in, offline/stale, input/receipt failures, unknown recovery,
  pending operations, missing APIs and 200% control bounds. Strengthened help-focus
  and 200% metadata captures were separately rerun successfully.
- Full typecheck, scoped ESLint, plan validation and diff whitespace checks pass.
- 16 inspected public synthetic captures: dark/light `rates-disabled`,
  `rates-source`, `rates-result`, `rates-invalid`; dark `rates-about`,
  `rates-unavailable`, `rates-copy-unknown`, `rates-clear-unknown`,
  `rates-copy-pending`, `rates-save-pending`; light `rates-offline-stale` and
  `rates-200-percent` (all under `evidence/`, theme prefix, `.png`).

Reproduce using `LINUXCAST_TEST_FILES` containing the explicit test path with
`scripts/test-runner/vitest.config.ts` or `playwright.config.ts`. The labelled
`fixtures/rates.html` observer supplies synthetic configuration/quote receipts;
it performs no provider/network, storage or clipboard effects. This is partial
AC02/UI/privacy presentation evidence. Coordinator-owned native network, only-pair
transmission, persistence/cache and independent clipboard integration are separate.
Required crypto/secure credential setup, paste variants, full L2-04/1.0,
prerequisite/native Wayland/GNOME/KDE/AT/session/performance/release gates remain
unfinished; no simulated operation or headless check establishes those gates.


`CalculatorFlow` uses the existing launcher's shared `ViewSession` and host
`ViewRenderer`. It pushes a Calculator Form onto the supplied parent view, then
a Calculation Detail after a successful explicit Evaluate. The local
`openExpression` entry prepares the same Form and result from a deliberately
chosen root candidate. It creates no new window or visual system. The host supplies a unique view ID
prefix and current command registry revision and forwards close notifications
synchronously through `closed(viewId)`.

Typing in the dedicated Form and generic opening do not evaluate, copy or
transmit expressions. Root candidate classification is separately local and
bounded; choosing it explicitly re-evaluates without any IPC.
Evaluate is a local read action against the separate pure `evaluateExpression`
module. The Expression label and draft persist through fixed inline syntax,
domain and size/complexity errors. Requests are bounded to 512 UTF-8 bytes and
exclude controls/unpaired surrogates. A successful local result is plain metadata:
Expression and Result, plus Colour format or Date/time format for those results. Detail Markdown
is static: numbers explain floating-point approximation, up to15 significant
digits and `%`; colours explain encoded-sRGB precision and quantization. Expressions
cannot supply HTML, Markdown, links or executable content.

**Copy result** is a separate primary write action. It uses only the optional
named `copyCalculatorResult({revision, expression})` API. Main re-evaluates the
expression and copies the canonical numeric/unit or closed colour result; the renderer
has no arbitrary clipboard interface. A strict copied receipt must match text,
optional unit, colour format and date/time format before the UI reports “Result copied.” No automatic copy,
hide, persistence, expression history or remote request is introduced.

Pending copy disables duplicates and has a five-second presentation bound.
Known failures have fixed recovery guidance. Unknown, malformed, mismatched or
lost receipts tell the user to check the clipboard before explicitly choosing
Copy result again. Nothing is replayed automatically. Edit expression or Escape
while a copy is pending invalidates its receipt and warns on the remaining Form
that copying may have occurred; navigation/cancellation cannot undo a clipboard
write. Disposal discards pending presentation work without claiming cancellation
undid the write. A missing API disables Copy with remediation while local
local calculation remains usable.

Edit expression and Escape return Detail → Form → launcher, preserving the shared
form draft/focus and the launcher's root query/selection. Dirty cancellation uses
the shared discard UI. Action handling validates current owned view/revision,
absence of item selection, allowed intent keys and the exact single Expression
form value. Stale, hidden, malformed and disposed intents cannot evaluate/copy.

## Unit conversion and read-only help

The same Form accepts a scalar arithmetic expression followed by a supported
source unit, `to`, and a target from the same category. Examples are `(2+3) km to
m`, `32 degF to degC` and `1 MiB to B`; function scalars such as `sqrt(16) km to
m` use the same evaluator. Arithmetic without units retains its existing result
format. Conversion results use the shared `formatCalculationText` formatter:
numeric text, one space and the canonical unit symbol. The main process uses the
same formatter when it independently recomputes a requested copy.

**Supported units** is a discoverable read action in the Form's Actions panel.
It pushes a read-only shared Detail with fixed semantic instructions and public
catalogue metadata grouped into Length, Mass, Duration, Temperature, Angle, Data,
Area, Volume, Speed, Energy, Power and Pressure. Help does not evaluate, submit,
copy or discard the unsent Form draft. Back/Escape returns to that same mounted
Form. Help is unavailable from a result so the launcher keeps at most two nested
calculator frames: Form plus either result or help.

Symbols are case-sensitive and limited to the closed 92-symbol catalogue;
unsupported or ambiguous identifiers receive fixed Supported units remediation.
Incompatible categories receive a fixed same-category explanation. Prefixes,
unit names and dimension-changing quantity algebra are not inferred.

- `d` is exactly 24 hours; `wk` is seven such days. These are fixed durations,
  separate from calendar dates, timezones and daylight-saving transitions.
- `K`, `degC` and `degF` represent absolute temperatures. Temperature differences
  and contextual interpretations are unsupported. Bounds are K ≥ 0,
  degC ≥ -273.15 and degF ≥ -459.67; lower values receive a fixed domain error.
- Data prefixes `kB`/`MB` and their bit equivalents use powers of 1000;
  `KiB`/`MiB` and their bit equivalents use powers of 1024. `B` means bytes and
  `bit` means bits. Capitalization is significant.
- `US_gal`, `US_qt`, `US_pt` and `US_fl_oz` are US liquid measures.
  `imp_gal` and `imp_fl_oz` are imperial measures. Bare `gal` is unsupported;
  `oz` is a mass unit, while fluid ounces use the explicit volume identifiers.

Copy remains explicit. Missing, mismatched, invalid or unknown acknowledgement
units are unknown copy outcomes, even if the numeric text matches. Back, hidden,
disposed and stale unit-copy replies retain the existing no-replay guards.

## Explicit local colours

The same Form accepts one explicit colour followed by `to hex`, `to rgb` or
`to hsl`, for example `#f80 to rgb`, `rgb(255 0 0 / 50%) to hex` or
`hsl(120 100% 50%) to hex`. **Supported colours** is a read-only Form action with
fixed syntax/range examples and public metadata. It preserves the unsent draft
and focus, evaluates/copies nothing, and is unavailable from a result. Units help,
colour help and a result are mutually exclusive, keeping root/Form/Detail depth3.

Colour results show Expression, Colour format and the canonical Result as plain
metadata. Their static explanation uses encoded sRGB, approximate floating-point
conversion, 8-bit/channel hex quantization and up to6 fractional digits for
functional output. Alpha is preserved without compositing. The numeric-unit and
arithmetic-percent explanations do not appear on colour results. No custom swatch,
CSS/DOM colour parser, remote resource or additional clipboard method is used.

Hex supports3/4/6/8 digits; RGB/HSL use lowercase functional names with either
legacy commas or space-separated components and optional alpha. Do not mix comma
and slash syntax. Fixed errors retain invalid/range drafts and point to help.
Named colours, variables, URLs, nested arithmetic, relative and wide-gamut colours
are unsupported. See COLOURS.md for the exact grammar, component ranges, hue bound,
canonical spelling and rounding policies; the separate pure engine owns parsing.

Explicit Copy still sends revision/expression only. Numeric-looking, missing,
mismatched, invalid or differently formatted colour receipts are unknown outcomes,
even when another field matches. Back/disposal invalidate pending receipts without
claiming the native write was undone; no copy is replayed automatically. Nothing
stores expressions, colour results or history.

Design references: DESIGN.md Shell and navigation; Results and actions; List,
grid, detail and form; States and motion; Accessibility; Review gate. Production
presentation contains only semantic ViewModels and existing host primitives,
tokens/fonts. `fixtures/preview.css` only lays out the labelled fixture.

## Deliberately selected root expressions

The launcher offers a local **Calculate expression** candidate only for an
unmatched query with an explicit number/math/colour signal and a successful real
bounded parser/formatter result. Ordinary words, bare constants, unsupported,
domain-error and oversized inputs cannot hijack root search. Matching registered
commands keep priority; Calculator must be shown/enabled. Saved-search alternatives
stay separate and a selected provider retains its identity when a calculation
appears. The synthetic item cannot enter generic Execute or preference APIs.

`openExpression(fromViewId, expression)` uses the same private evaluation helper
as explicit Evaluate, pushes the existing Form/Detail and retains the captured
expression for Edit. Generic `open` stays empty. Root query/selection survives
Edit/Back/Cancel; Hide/dispose clears the invocation. Form publication is fenced
before Result navigation. Copy remains separate expression-only named IPC, with
exact receipt validation. Original root context and pending/lifecycle ownership
are checked immediately after pending publication and before the API call, so
synchronous Back/dispose/query invalidation causes zero Copy requests. Late or
unknown outcomes never report copied or replay automatically.

Author checks pass on Linux x64 with Node 24.22.1/Bun 1.4.4: **262 focused units**
(82 presentation, 27 calculator routing, 125 launcher controller, 28 Quicklink
routing), including 35 new cases; **eight new root Chromium keyboard/axe checks**
and **29 retained calculator Chromium checks**. Full typecheck, scoped ESLint,
plan and diff checks pass. Vitest/Playwright use explicit `LINUXCAST_TEST_FILES`
selections with the existing test-runner configs. Twelve inspected public
captures in the launcher's `evidence/*-root-calculator-*` cover dark/light root,
result and Edit Form, units/colour, inline domain error, pending/unknown Copy and
200%-text footer containment. Existing shared DESIGN Shell/navigation,
Results/actions, List/Form/Detail, States/motion, Accessibility and Review gate
apply; no feature CSS or window is added. Fixture clipboard requests are observed,
not performed. Coordinator owns native clipboard/independent-reader and aggregate
export privacy integration.

This provides bounded L2-04 AC01 no-execution/no-background-transmission/word-query,
partial AC02 arithmetic/unit/colour UI, and L1-01 selected-identity/UI/privacy
evidence. Full dates/civil-time/DST, configured stale/offline currency/crypto rates,
provider/ranking, prerequisite/native desktop/AT/performance/release gates remain
pending. Neither task is complete and full1.0 scope is unchanged.

## Explicit zoned date/time conversion

Use `2026-10-27T09:00[Australia/Sydney] to UTC` or an explicitly offset repeated
time such as `2024-11-03T01:30-04:00[America/New_York] to UTC`. The existing local
Form and root candidate use the supplied real bounded engine; there is no new
query route or IPC. Result shows plain **Date/time format: Zoned ISO date/time**
and canonical text, with exact-instant/explicit-zone guidance rather than numeric
approximation copy. Copy stays separate and compares text plus dateTime/unit/
colour presence for every result kind. A missing/wrong kind cannot confirm Copy.

**Supported date/time** is a read-only Form action using the same total depth 3
help pattern. It preserves unsent drafts/focus on Back, provides UTC/IANA and both
fold-offset examples, explains real Gregorian years 0001–9999, optional seconds
and 1–9 fraction digits, zone aliases/Etc-GMT policy, checked source offsets/Z,
unknown -00:00 refusal, year bounds and no ambient clock. Missing local times
are refused even with an offset; repeated times need a matching offset. Fixed
inline invalid-date, unknown-zone, fold and gap messages retain the expression
and direct manual correction/help. Help, typing, Evaluate and result navigation
never copy, save or contact a service. Existing original-context, reentrant Copy,
late/disposed, unknown and no-replay guards remain unchanged.

Author checks on Linux x64, pinned Node 24.22.1/Bun 1.4.4: **136 focused units pass**
(105 presentation, 31 launcher calculator-routing; 27 new). **39 calculator Chromium
keyboard/axe checks pass** (29 retained, 10 new), plus one new root-date Chromium
case. Full typecheck, scoped ESLint, plan and diff checks pass. Tests use explicit
`LINUXCAST_TEST_FILES` selections with the existing Vitest/Playwright configs.
Ten inspected `evidence/*-date-time-*` captures cover dark/light Result/help/fold/
gap, unknown receipt and 200%-text exact fractional output/footer containment;
`apps/desktop/src/features/launcher/evidence/dark-root-date-time-query.png` shows
local root classification before any Copy. Fixtures use public synthetic dates
and observed requests, never real clipboard writes. Shared DESIGN Shell/navigation,
Results/actions, List/Form/Detail, States/motion, Accessibility and Review gate
plus existing primitives/tokens apply. No custom CSS/window is introduced.

This is partial L2-04 AC02/UI and preserved AC01/privacy evidence. Core
contracts/engine/formatter/main/preload and native clipboard independent-reader
production evidence are coordinator-owned prerequisites; UI fixtures do not prove
those effects. Full civil-date/duration arithmetic, configured timestamped
stale/offline currency/crypto rates, providers/ranking, prerequisite acceptance,
Debian GNOME/KDE Wayland/X11, native AT/performance/release gates remain required.
Neither L2-04 nor complete local 1.0 is marked complete.

## Calendar and elapsed arithmetic

The existing date/time Form/root result accepts one explicit operation such as
`2024-03-09T12:00[America/New_York] + P1D to America/New_York`.
**Supported date/time** explains the fixed uppercase ISO duration grammar:
unsigned components 0–999999, fixed order, no redundant leading zeros, and
1–9 fractional digits only on seconds. M before T means months; after T it means
minutes. One + or - applies to the whole duration; the target zone stays explicit.
There is no new view, engine grammar in presentation, IPC or clipboard authority.

Calendar years/months/weeks/days apply to source-zone Gregorian fields first,
then hours/minutes/seconds add exact elapsed time. P1D can span 23 hours in spring
or 25 in autumn; PT24H always advances 24 elapsed hours. Result text explains
that arithmetic changes the instant; only plain conversion retains the original
exact-instant wording. Mixed durations apply calendar then elapsed fields, with
nanosecond precision preserved by the existing real engine/formatter. Fixed
scalar d/wk conversions retain their elapsed 86400/604800-second meanings.

Invalid duration syntax/limits receive fixed inline grammar remediation.
Invalid month-end/leap/year-bound/gap/fold calendar results are refused rather
than clamped or given an implicit offset. Drafts remain editable; guidance offers
another date/duration, elapsed hours or explicit unambiguous date conversion.
Source offsets never authorize a calendar result. Help remains read-only within
total depth 3, preserving unsent draft/focus; screenshots scroll to new duration
content. Edit/Back/Cancel, held Enter/IME, original-context/reentrant/pending/
unknown/no-replay fences and separate exact dated Copy remain in use.

Author validation on Linux x64 with Node 24.22.1/Bun 1.4.4: **158 focused units**
(125 presentation, 33 calculator routing; 22 new), **47 calculator Chromium
keyboard/axe cases** (39 retained, 8 new), plus **one root-arithmetic Chromium
case** pass. Full typecheck, scoped ESLint, plan and diff checks pass. Commands
use explicit `LINUXCAST_TEST_FILES` with the existing test-runner configs.
Twelve inspected public captures cover dark/light calendar-day/elapsed-hour
results, calendar-result errors and duration help, invalid duration, unknown Copy,
200%-text containment and the existing root candidate. Calculator files are
`evidence/*-{calendar,elapsed,duration}-*`; the root capture is
`apps/desktop/src/features/launcher/evidence/dark-root-calendar-arithmetic-query.png`.
Incidental regenerated old screenshots are restored. Fixtures observe requests,
not native clipboard effects; coordinator owns production/independent-reader
integration. Core c6cf018 is a separate prerequisite, not duplicated in UI work.

DESIGN Shell/navigation, Results/actions, List/Form/Detail, States/motion,
Accessibility and Review gate apply; existing shared primitives/tokens are reused.
This is partial L2-04 AC02/UI with preserved AC01/privacy evidence, not full task
completion. Broader date/civil-duration behavior, configured timestamped stale/
offline currency/crypto rates, providers/ranking, copy/paste variants, prerequisite
and native desktop/AT/session/performance/release gates remain required. Complete
local 1.0 scope is unchanged.

## Evidence and remaining scope

`tests/presentation.test.ts` has 125 passing presentation checks and
`tests/calculator.ui.test.ts` has 47 passing Chromium keyboard/axe checks covering
explicit Form and Detail transitions, draft errors/domain/oversize, clipboard unavailability,
unknown/mismatched/pending replies, back/dirty cancel/focus, stale/disposed actions
and local readonly metadata. Unit cases add length/function-scalar, temperature, decimal/binary
data, unsupported/ambiguous and incompatible units, help draft/focus navigation,
and exact numeric-text/unit copy acknowledgement checks. Colour cases add closed
hex/RGB/HSL/alpha metadata, help/draft/error navigation, exact colour receipts,
numeric/format/unit mismatch rejection and late pending/disposed guards. `fixtures/` explicitly observes clipboard requests
without touching the host clipboard. Public synthetic arithmetic, unit and colour expressions enter
test screenshots; no user content, secrets or external requests are used.
Twenty-one component screenshots cover dark/light Form, arithmetic/unit/colour
results, validation, Supported units/colours help, plus unknown, unavailable and
missing-copy states. All six new colour result/help/error captures were visually
inspected. Dark help/unit validation and light unit result were visually inspected;
the shared help-return focus fix is verified in both themes. Development checks use Node 24.22.1/Bun 1.4.4.
Typecheck, scoped lint and plan validation pass. Browser checks require a local
fixture server and real Chromium processes; they are not native clipboard proof.

This presentation contributes bounded L2-04-AC01 and partial AC02 unit/colour-conversion
UI and privacy evidence. The
separate evaluator lane owns parser, conversion tables and numeric/colour correctness. Coordinator main/
preload/launcher routing owns sender validation, recomputation, actual clipboard
and production Electron integration. Full L2-04 remains incomplete: broader civil-date/duration arithmetic, configured currency/crypto adapters, timestamped
fixture-backed cache and stale/offline rate behavior remain required. Debian
GNOME/KDE Wayland/X11, native assistive technology and full release acceptance
remain pending. The complete local 1.0 scope is unchanged.

## Integrated arithmetic application evidence (PR32)

Coordinator checks on Node24.22.1, Bun1.4.4, Electron45.0.0 and SQLite3.53.4
pass:188calculator unit checks (157evaluator,29presentation,2launcherrouting),
41main/preload security checks,2contract checks,10Chromium keyboard/axe checks,
typecheck/lint/plan/diff. The existing108launcher unit checks pass.
The production application check completes in2.39seconds using a private Xvfb
profile, real packaged Electron/SQLite and a separate native xclip reader. It
verifies that ordinary words do not select Calculator; typing and Evaluate do
not change the clipboard; explicit Copy copies14and521 into the actual private
CLIPBOARD; invalid expressions/division byzero do not copy; an unavailable
session returns a known failure and only explicit retry after recovery writes.
Hide removes both nested calculator views; real single-instance reopen shows
the launcher and preserves the clipboard without replay. After Quit, the actual
sole owner exports only aggregate calculator usage count2, without expressions
or result history. The actual dark/light screenshots in evidence/application-
{dark,light}-result.png were inspected and axe passes both themes. No clipboard
operation uses the user's display or private content.

Existing actual application/URL/alias/pin/data/restart regression passes7.18seconds.
These synthetic smoke durations are not performance acceptance measurements.
Independent GPT-6.1 SOL/high source review is clean across evaluator, contract,
main/preload, presentation and launcher hide/back/stale-revision lifecycle. The
clipboard action uses Electron45's async system clipboard promises, awaits
write/readback, and retains an unresolved write's slot after its four-second
unknown-outcome receipt so another copy cannot overtake it. Hide/Quit remain
available. No automatic replay, paste, PRIMARY or clipboard-history read is
added; native GNOME/KDE Wayland/X11, assistive-technology, installed package and
release acceptance remain pending.

## Unit conversion application evidence

The integrated conversion increment passes424mapped calculator unit checks
(157arithmetic,214conversion,49presentation,1formatter,3launcher-routing),
43main/preload security checks and3contracts. Author19Chromium keyboard/axe
checks pass with the real engine;16shared-view unit and10shared browser
regressions pass after the reproduced help-return focus fix. Full typecheck,
lint, frozen install and108launcher regression units pass. Independent
GPT-6.1 SOL/high final integrated source review is clean.

The actual production application check passes in6.41seconds using the existing
private Xvfb/X11 profile, packaged Electron45/SQLite3.53.4 and independent native
xclip reader. Explicit Copy writes `5000 m`, `0 degC` and `1048576 B`; typing,
Evaluate, Supported units help, incompatible/ambiguous/case-mismatched units and
below-absolute-zero inputs leave the clipboard unchanged. Returning from help
preserves the unsent Form draft and focus. Hide from help removes both nested
views; real single-instance reopen returns to root without replay. After Quit,
the actual owner export contains only aggregate calculator use count5, with no
arithmetic/conversion expressions or result strings. Arithmetic14/521 copying and
known unavailable-session/manual-recovery paths remain covered. These smoke
durations do not establish performance acceptance.

`evidence/application-{dark,light}-{unit-result,units-help}.png` are actual packaged
application captures with both themes inspected and axe passing. Component
fixtures remain separate from real private clipboard evidence. No operation uses
the user's display. Unit fixtures are partial AC02 evidence; calendar
DST/timezone/date behavior, colours, configured rate adapters/cache and full native
desktop/AT/installed-package/release acceptance remain unfinished.

## Integrated colour application evidence

Coordinator `fc32887` verifies real production Electron45/private-Xvfb/X11 native
xclip readback for RGB, alpha HEX and HSL, plus existing arithmetic/unit copies.
Main recomputes expression-only requests; help/typing/Evaluate/invalid values do
not copy. Help restores draft/focus, Hide/reopen never replays, and post-Quit real
owner export has only aggregate calculatorcount8 without expressions or results.
Four inspected application dark/light colour/help captures are
`evidence/application-*-colour-result.png` and `application-*-colours-help.png`.

PASS:594mapped units,4contracts,45security,29browser/axe,1actual integration, full
typecheck/lint. The6.65s smoke does not establish performance or native desktop/AT
acceptance. Independent SOLhigh review clean after canonical output validation
was tightened. Dates/DST, configured cached rates and full native/release remain
required; this does not complete L2-04.
