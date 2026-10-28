# Configured fiat rates: bounded application evidence

L2-04/L1-01 unfinished application increment, 29 October 2026, based on merged
PR53/dbafd815. Core/freeze2a4eea4; owned UI31bbecf, signed author2e814135.
Contract: packages/builtins/calculator/RATES-INCREMENT.md. Full1.0 scope unchanged.

## User behaviour and boundaries

A real registered Currency conversion command opens a shared Form. Rate source
starts Disabled. Configure source explicitly opts into Frankfurter's fixed native
HTTPS endpoint; Save/typing/help do not fetch. Convert sends only the uppercase
currency pair via a fixed lower-case path, never amount/root query/clipboard or
credentials. The result shows an approximate estimate, source/endpoint, publication
date, fetched UTC timestamp, expiry and independent Online/Offline and Recent/Stale
labels. There is no background request, timer refresh, arbitrary endpoint or fallback
provider. Crypto/secure key configuration and paste remain required future work.

The native adapter verifies TLS normally, refuses redirects/non-JSON/encoded or
oversized responses, bounds the total request, and pins checked public DNS answers
into the actual connection. Private/reserved/mapped/tunnel addresses are refused.
Provider responses are strict data, with exact pair identity and no future date.

The existing single SQLite owner stores at most64 public pair snapshots, no amounts,
expressions, quotes or result history. Migration013 and typed setting CAS preserve
private file ownership. Cache writes atomically require the enabled source and its
exact configuration revision. A failed explicit fetch can use only matching validated
cache; Offline is visible and staleness is evaluated independently. Source age>96h,
fetch age>24h or clock rollback is Stale. Clear cached rates is explicit, revision
checked, and invalidates quotes. Disabling the source does not implicitly delete it.

Copy is a separate named request containing an opaque quote ID and current registry
revision. Main retains the exact snapshot/amount, binds quote issuance to that
registry revision, rechecks source/configuration/expiry/context and recomputes the
canonical numeric text plus target code. Main's shared clipboard writer and a
pending rates slot protect unknown writes from overlap. A lost/timed-out receipt is
unknown, never replayed. Save/Clear uncertainty survives Hide/reopen until manual
Reload; a configuration read cannot prove cache deletion. No broad invoke or Node
renderer capability was added.

## Validation and review

- Final selected L2-04 unit907/contract19 and mapped security172 checks pass;
  full typecheck/scoped lint/plan/diff pass.49 real F2-01 integration fixtures,
  including migration/backup/data-control/credential regressions, pass.
- Pure provider/estimate/staleness32 fixtures and strict rate contract14 fixtures
  passed. Service10 includes final-configuration-read cancellation/Clear races;
  public address/request input38, bounded HTTP transport17, narrow preload13 and
  actual owner cache4 fixtures passed. Transport fixtures cover fixed origin/path,
  checked DNS, redirects/status/headers/stream bounds/deadline, safe errors.
- UI56 controller tests and15 Chromium keyboard/axe tests passed. Six real launcher
  routing regressions cover admitted command, no generic execution/network,
  hidden/disabled/stale/extra authority, Hide/reopen/new registry and retained
  source uncertainty. Missing capabilities give actionable failure.
- Production sandboxed Electron/private Xvfb/X11 with isolated HOME/XDG/profile and
  independent native xclip passed in6.19s, and the final registry-fence production regression passed in5.64s. Exactly one real public USD/EUR HTTPS GET
  was observed. Typing, help, opening and Save made zero requests. The amount
  remained local. Result timestamp/source/Online labels were real provider data;
  held Enter did not Copy. Two deliberate native copies had exact receipts and
  matching xclip contents. Subsequent HTTPS failures were injected by the trusted
  test harness only; real production service/owner/renderer recovered the matching
  persisted cache as Offline. This is deterministic failure injection, not evidence
  of a real network outage. Hide/reopen removed frames; Clear then Convert failed
  without invented result; Disable made no request. Post-Quit real owner confirmed
  disabled source revision2, empty cache and aggregate usage2 with allowlisted
  export keys, no amount/result history. Separate owner restart fixtures validate
  persistence across process lifetime. No installed desktop/session claim.
- Actual testing reproduced a shared Form keyboard defect after failed Convert:
  disabling the focused field could leave document.body focused. A bounded shared
  fix restores the first enabled field only on loading completion if focus is still
  on body; deliberate Cancel/Actions focus is preserved. Twelve Form and11 shared-view Chromium regressions
  pass and the actual recovery flow now passes. No held-key action is introduced.
- Independent GPT-6.1 SOL/high review found and closed a late cache-publication race
  and quote registry-revision/final-visibility-await fence omissions. UI/routing/shared focus/actual test
  source and16 component+8 actual affected captures independently reviewed clean.
 25 real-service/main launcher-gate tests pass, including reproduced then fixed
  Clear/Configure-during-final-visibility-read zero-copy regressions. Independent
  boundary review is clean. No infrastructure/research/proof expansion was delegated.

Development runtime Node24.22.1/Bun1.4.4/Electron45.0.0/SQLite3.53.4. The public
source was Frankfurter v2; real request uses api.frankfurter.dev/v2/rate/usd/eur.
No user profile/display/device/credentials were accessed. Design: DESIGN.md shell
and navigation, results/actions, List/Detail/Form, settings, states/accessibility;
shared host primitives/tokens, no feature-specific CSS or dependency added.

Screenshots: calculator/evidence/application-{dark,light}-rates-{disabled,source,
live-result,offline-cache}.png;16 component *-rates-*.png captures are synthetic
fixture evidence. Normal source/result metadata is scrollable using shared views.

## Explicit outstanding acceptance

This is a reviewed/tested unfinished fiat application increment, not completion of
L2-04-AC02, L2-04-UI, L2-04 or the Goal. Required crypto adapter with secure key
configuration, paste variants, broader prerequisite/provider/ranking work, native
Debian13 GNOME/KDE Wayland/X11, screen reader/AT, session/performance, package and
release gates remain outstanding. Quotes are approximate daily reference estimates,
not live trading prices or exact accounting. Native network failures can only use
matching cache; unsupported codes/no cache are visible failures. Conservatively
unknown metadata outcomes require Reload and explicit retry, never automatic replay.
