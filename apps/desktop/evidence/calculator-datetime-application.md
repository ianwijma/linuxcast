# Zoned date/time: application evidence

L2-04/L1-01 bounded unfinished increment,27October2026, based on merged
PR51/4612ec0. Core/freeze76d4121; historical-offset fix2c08f6e and reviewed owned
UI are validated; normal1Password signing recovered after user unlock. The exact UI patch
SHA256 is d0942a065024c86acef1a99e629661911f02bac11ce6b142f478c998ab6626ad.
This is application integration evidence, not whole-task completion.

## Behaviour

Existing Calculator Form and local root result now accept explicit ISO local
source date/time plus named source and target zones. Example:
`2026-10-27T09:00[Australia/Sydney] to UTC` yields
`2026-10-26T22:00:00+00:00[UTC]`. Detail explains exact instant preservation and
shows Zoned ISO date/time metadata. Supported date/time help documents the
bounded grammar, zones, offsets, unsupported input and manual recovery.

Missing local times are refused, never shifted. Repeated local times require
an exact matching source offset; the two New York fold offsets select distinct
instants. Gregorian/leap/year bounds, nanosecond fractions and historical
second-level offsets are preserved. No ambient clock, natural-language dates,
implicit zone or locale-dependent parsing. DATE-TIMES.md is the full contract.

Evaluate and root choice remain local; Copy is separate. Main receives only
revision/expression, recomputes canonical text and returns an exclusive typed
receipt. UI compares text and all kind markers; wrong-kind receipts cannot
confirm Copy. Original context, held Enter/IME, pending/unknown, reentrant,
Hide/dispose and no-replay guards remain. No expression/result history or
background query transmission is added.

Pinned @js-temporal/polyfill0.5.1(ISC) and jsbi4.3.2(Apache-2.0) use local ICU;
exact lock integrities and license copies are committed with the core. No
trusted install hook or global Temporal/Intl patch. Upstream0.5.1 is marked
pre-release; no stable/audited claim. Full release SBOM/package audit stays open.

## Validation and review

- Final integrated mapped L2-04:706units,5contracts,77main/preload security and
  one actual production integration PASS. Suites overlap. Full typecheck,
  scoped lint and diff pass. Fifty fixed date cases cover DST folds/gaps,
  Lord Howe30minute changes, Apia skipped date, leap/year bounds, fractional
  rollover, source-offset mismatch, zone/input limits and arithmetic retention.
- Author136focused units(105presentation/31routing),39calculator Chromium
  keyboard/axe(29retained+10new) and one rootdate Chromium case PASS. Cases
  cover heldEnter/IME, unsent help/back focus/depth,200%, exclusive receipts,
  stale/reentrant zeroCopy and affected error/recovery states. Component
  browser fixtures do not establish desktop integration.
- Actual sandboxed production Electron/private Xvfb/X11 integration10.89s PASS,
  isolated HOME/profile/XDG and independent native xclip reader. Runtime
  Electron45.0.0/ICU78.2/tz2026e; unit host Node24.22.1/ICU78.3/tz2026e,
  Bun1.4.4/SQLite3.53.4. No user display/profile/provider/device used.
- Actual root Sydney conversion verifies typing/heldEnter/selection never copy,
  separate Copy writes exact previous-day UTC text; Edit/Cancel restores root
  query/selection and Hide/reopen clears nested state. Generic Calculator blank.
  Manual gap/fold/invalidleap/unknownzone recovery and help preserve clipboard;
  helpBack restores unsent draft/focus. Both NYfold offsets copy05:30/06:30UTC;
  Paris1890 copies exact+00:09:21. Eight retained standalone arithmetic/unit/
  colour copies plus three retained root copies and four new date copies total
  fifteen. Real owner export afterQuit has count15 and only allowlisted aggregate
  usage fields; none of the expressions/date results are present.
- Independent GPT-6.1 SOL/high core review found a historical-offset P2:
  Temporal string serialization/matching can round offsets to minutes. Exact
  source object fields plus bounded offsetNanoseconds equality and exact target
  PlainDateTime+offset+zone formatting fix it. Three fixed Paris regressions
  prove both exact directions and rounded-offset refusal;119targeted/type/lint
  PASS. Independent source re-review closes P2, no further finding.
- Independent UI/actual source review and all11component/sixactual date captures
  clean. UI patch bytes exactly match author staged tree; no source changes
  after review. Normal signing recovered. Exact signedheadb012c84 independently reconciled, CI40436099692 passed and PR52 merged7aa0d91 on27October2026; no requested GitHub reviews/comments/threads. Primary frozeninstall/productionbuild66assets pass.

Design: DESIGN Shell/navigation, Results/actions, List/Form/Detail, states and
accessibility; shared primitives/tokens, no feature CSS. Captures contain public
synthetic date expressions/results only. Actual artifacts:
`packages/builtins/calculator/evidence/application-{dark,light}-date-{query-root,result,help}.png`.
Component artifacts: calculator `*-date-time-*.png` and launcher
`dark-root-date-time-query.png`.

## Outstanding acceptance

AC02/UI remain pending. This conversion is only part of required dates/timezones;
civil-duration/calendar arithmetic and opt-in configured timestamped fixture-backed
currency/crypto adapters with stale/offline states remain required. Existing
unfinished shell prerequisites/providers/ranking and complete Debian13 GNOME/KDE
Wayland/X11, native AT, performance, installed packages and release gates remain
mandatory. Private Xvfb/native clipboard smoke is not supported desktop/session,
paste or AT acceptance. Full local1.0 scope is unchanged; neither task is complete.
