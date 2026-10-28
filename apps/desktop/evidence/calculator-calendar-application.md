# Calendar and elapsed date arithmetic: application evidence

L2-04/L1-01 bounded unfinished increment,29October2026, from mergedPR52/7aa0d91.
Core/freeze c6cf018; reviewedUI a1283ea (signed author0eeb82b); actual81ba9d0.
Full contract: packages/builtins/calculator/DATE-DURATIONS.md and DATE-TIMES.md.

## Behaviour

Existing root Calculate expression and Calculator Form now accept one explicit
ISO duration addition/subtraction before the existing target-zone conversion.
`2024-03-09T12:00[America/New_York] + P1D to America/New_York` gives next-day
12:00 (23 elapsed hours); the same source with +PT24H gives13:00. Autumn calendar
day spans25hours. Gregorian years/months/weeks/days apply to local source fields
first with overflowreject, then hours/minutes/seconds/fraction add exact elapsed
time. This is date arithmetic, not preservation of the original instant.

Month-end/leap invalid dates, missing/repeated calendar results and out-of-bounds
years are refused, never clamped/shifted or assigned an implicit occurrence.
Source offsets never authorize a different calendar result. Zero calendar steps
retain an explicitly selected source fold; exact elapsed time uniquely resolves
an instant across transitions. One bounded uppercase ISO duration, components
0..999999, seconds-only1..9digit fractions, fixed order and explicit target zone.
Subtraction follows the same field order with negative components; no promise
that mixed subtraction reverses addition across transitions. Fixed scalar d/wk
conversions retain their86400s/604800s semantics.

Existing Detail/help explain the difference, invalid-result messages offer manual
recovery, and unsent help/back focus is retained. Separate Copy sends only the
expression/revision; main recomputes canonical zoned text and exclusive receipt.
Typing/Evaluate/choice/help/refusals do not copy. Exact kind markers, origin/
pre-API/reentrant/pending/unknown/late/Hide/dispose/no-replay fences remain. No
new IPC/schema/dependency/migration/process/network/history or ambient clock.

## Checks and independent review

- Final mapped L2-04 PASS:803units (157arithmetic/214units/146colours/125dates/
  125presentation/33routing/3formatter),5contracts,79main/preloadsecurity and one
  actual production integration. Suites overlap; full typecheck/scopedlint/diff
  and plan checks pass. Initial typecheck identified the closed evaluator message
  table needed the two new fixed codes; updated and finaltypecheck passes.
- Core191focused PASS (125dates+66main),75new date fixtures include spring/autumn
  day-vs24h, subtraction/mixedfields, LordHowe30minute transition, fold identity/
  elapsedfold, month/leap/gap/fold/year rejection, nanosecond/historicalseconds,
  component bounds and malformed/hostile grammar. Main derives exact canonical
  output and rejects invalid durations/results before copy/use. Independent
  GPT-6.1 SOL/high source review clean, no actionable finding or edits.
- Author158focused PASS (125presentation+33routing,22new),47calculator Chromium
  keyboard/axe (39retained+8new) and one root arithmetic case PASS. Relevant
  heldEnter/IME, explicit Copy, receipt/unknown, reentrant zeroCopy, help draft/
  back focus, refusal recovery,200% and depth3 behavior checked. Independent
  signed UI/source/README/twelve affected component capture review clean.
- Actual sandboxed production Electron/privateXvfb/X11/native xclip18.01s PASS,
  isolated HOME/profile/XDG/display and independent native clipboard reader.
  Root day12:00 vs24h13:00 results each require separate Copy; typing/heldEnter/
  selection never copy. Edit/Cancel restores root query/identity, Hide/reopen
  clears nested state, generic Calculator blank. Standalone autumn/day,
  elapsed subtraction and mixed years/months/weeks/days/nanoseconds copy exact
  independent expected results. Six malformed/limit/monthend/leap/calendar-gap/
  calendar-fold refusals leave clipboard unchanged with actionable category;
  help preserves unsent draft/focus. All15retained arithmetic/unit/colour/date
  copies plus5new arithmetic copies total20. AfterQuit real owner export has
  aggregate count20 and only allowlisted usage keys, no expressions/results.
- Actual runtime Electron45.0.0/ICU78.2/tz2026e, host Node24.22.1/ICU78.3/tz2026e,
  Bun1.4.4/SQLite3.53.4. No user display/profile/device/provider accessed.
- Eight actual dark/light query/calendar-result/elapsed-result/duration-scrolled
  help captures independently inspected clean by coordinator and reviewer; final
  exact integrated UI/actual review clean at81ba9d0. Ten incidental old PNG rewrites restored only. Source and
  owned UI are unchanged from signed reviewed commits; final CI/merge pending.

Design: DESIGN Shell/navigation, Results/actions, List/Form/Detail, states and
accessibility; shared primitives/tokens, no feature CSS. Public synthetic inputs,
results and clipboard sentinel only. Actual artifacts are calculator/evidence/
application-{dark,light}-{calendar-query-root,calendar-result,elapsed-result,calendar-help}.png.
Twelve component artifacts include *calendar*, *duration* and *elapsed* captures.

## Outstanding acceptance

Partial AC01/AC02/UI/privacy evidence; AC02/UI/full task remain pending. Required
opt-in configured currency/crypto adapters, timestamped fixture-backed cache and
stale/offline states, copy/paste variants, broader launcher providers/prerequisites,
Debian13 GNOME/KDE Wayland/X11, native AT, performance, installed packages and
release gates remain mandatory. Private Xvfb/native clipboard is not supported
session/paste/AT acceptance. Complete agreed local1.0 scope/security unchanged.
