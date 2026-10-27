# Launcher saved-search fallback: application evidence

L1-01/L2-05 bounded unfinished increment, 27 October 2026, based on merged
PR49/f79a345. Contract/main freeze9f09aa4; UI d22f1e6 (signed authorc715b6f);
actual application62eaaee. Full agreed local1.0 scope is unchanged.

## Result

An unmatched valid nonblank root query offers configured saved web searches.
Only shown/enabled saved webSearch entries and an available shown Quicklinks
parent qualify. Matching registered commands retain their normal ranking.
Literal/path links and unavailable/hidden providers do not become fallbacks.
The bounded provider list sorts by name/ID and retains a selected identity.
A distinct local fallback ID cannot be sent to generic execution or preferences.
Main exposes only the exact saved ID/revision and a boolean search marker, never
the target/configuration/query. No new IPC, migration, process or dependency.

Arrow/Enter deliberately chooses Search with the saved provider. Fresh List/Get
checks require the exact current shown ID/revision/search kind before opening
the existing Query form prefilled with the captured root query. Review search
shows the exact encoded URL; separate Open search requests the browser handoff.
Ordinary saved-entry navigation continues to start with an empty argument.
Typing, result navigation, choice and Review perform no native or network effect.
Cancel/List/Back restore the original root query/selection. Hide clears the
captured invocation. Definitions/export/usage retain no transient query/target.

Stale, deleted, hidden, converted or unavailable providers show Reload/Back and
withhold alternate rows. Manual Reload never replays the old entry choice or
converts a captured query into another target kind. Original-context/operation
ownership checks fence delayed or reentrant publication, newer Reload, changed
query/selection, Back/Hide/dispose and unknown browser outcomes. Two review
findings—kind conversion on Reload and an older completion navigating after a
newer synchronous Reload—are fixed with focused regressions.

## Checks

Linux amd64 Node24.22.1/Bun1.4.4/Electron45/SQLite3.53.4/GIO2.72.4. Production
checks run sandboxed Electron with private HOME/profile/XDG on an owned private
Xvfb X11 display. GIO starts a real private browser-handler process. Only native
file chooser choices are instrumented. No user display/profile/device/provider.

- Mapped L1-01:241 units,12 contracts,114 security passed.
- Mapped L2-05:361 units,16 contracts,50 security,45 integration passed. Suites
  overlap; these are per-suite totals, not distinct-test totals.
- Production application flow16.52s: real persisted saved search, unmatched
  Unicode/metacharacter root query, explicit provider choice, exact prefilled
  Query, Cancel/List/Back query/selected-ID restoration, repeated deliberate
  choice, held-Enter Review without browser I/O, separate Open with exact encoded
  GIO argv and empty stdin, private selected JSON excluding query/expanded URL.
  Existing ordinary empty-argument/path/preferences/restart/privacy flow passes.
- Focused author403 controller/routing checks passed; final integrated counts are
  251 Quicklinks presentation,27 routing,125 launcher controller. Full68 launcher
  Chromium keyboard/axe cases passed, including seven new fallback cases.
  Delayed/stale/wrong-kind/hidden/cancel/unknown/Reload and publication fences,
  IME/held Enter, 200% text and affected dark/light states are covered.
- Full typecheck, scoped lint, plan validation and diff pass. Independent
  GPT-6.1 SOL/high metadata, signed UI and exact integrated/actual reviews clean
  at62eaaee; both findings closed.
  UI source/tests/fixtures/captures match signed authorc715b6f. Coordinator README
  changes only correct the final focused-test count breakdown.

Ten component captures and six actual dark/light root/Query/Review captures were
inspected. Actual: `quicklinks-application-{dark,light}-fallback-{root,query,preview}.png`.
Component: `apps/desktop/src/features/launcher/evidence/*web-search-fallback*.png`.
DESIGN Shell/navigation, Results/actions, List/Form/Detail, states and accessibility
apply; existing shared primitives/tokens, no new CSS. Public synthetic text and
example.invalid URLs only; aggregate usage and exports exclude invocation data.

## Still unfinished

Partial L1-01 selected-identity/UI/privacy and L2-05 typed-query/UI/privacy evidence
only. Full asynchronous providers, file/AI fallback, ranking controls, documented
context/placeholder/target flows, prerequisites and Debian GNOME/KDE Wayland/X11,
native assistive technology, performance, packages and release gates remain
pending. Private Xvfb/browser fixtures do not establish supported-session or AT
acceptance. Native dispatch does not prove browser page completion or focus.
Neither task is complete; no release gate or complete1.0 feature was removed.
