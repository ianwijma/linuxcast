# L2-05 — explicit clock snapshot URL builder

30 October 2026, `codex/quicklink-time-builder`, base PR74/
`633ca9fa79218956af072b6d76fa62fb6784a70a`. Owns only `src/clock.ts`,
`tests/clock.test.ts` and this report. Read with [CLOCK-INCREMENT.md](CLOCK-INCREMENT.md),
the complete L2-05 card, PLAN, workflows/security/product builtins/testing-release,
DESIGN and tokens. Actual L1-01/F3-01 outputs are integrated under approved partial
increments; their full acceptance and complete local1.0 scope remain required.

## Concrete behavior and interface

`captureClockSnapshot(epochMs,timeZone)` accepts only an explicit safe integer epoch
in milliseconds and valid bounded IANA/UTC zone. It returns a frozen
`{capturedAt,timeZone}`: exact four-digit-year UTC ISO with milliseconds and the
runtime's canonical Intl zone. Timezone aliases/case normalize only at capture;
raw numeric offset zones, invalid Unicode/controls, oversized strings and
unrepresentable instants fail with a fixed content-free invalid-snapshot error.
Zones are ASCII names of at most128 characters; Intl must recognise them.

`buildClockLinkUrl(baseUrl,{queryParameter,source,timeZone},snapshot)` uses exact
own-data objects and validates source date/time/timezone, mode system/UTC, the
existing query-parameter rule and existing safe literal HTTP(S) URL schema.
Snapshot text and timezone must already be exactly canonical; noncanonical date
normalization, aliases, missing fields, accessors, exotic prototypes, extra fields
and reflective failures are refused. Null-prototype own-data objects are supported.
No property value is coerced into a string. UTC mode requires an actual UTC snapshot.
System mode consumes the explicitly supplied canonical zone; this helper never
looks up the current system timezone. Main must independently validate that zone
against the current host before an effect.

Date is YYYY-MM-DD, time HH:mm:ss and timezone the canonical zone name. The fixed
Intl locale/calendar/numbering system/hour cycle are en-US/iso8601/latn/h23.
An explicit longOffset part at the captured instant supplies the timezone shift,
including historical seconds; ISO serialization supplies unambiguous 00–23 time,
Latin digits and astronomical year0000. This avoids Intl's unsigned year-part
ambiguity between year0000 and0001. No local wall time is parsed/disambiguated.
The projected date must also fit four digits; out-of-range projections fail safely.

Formatting precedes one fixed `{{context.date}}`, `{{context.time}}` or
`{{context.timezone}}` binding through the existing @linuxcast/templates parser.
There is no arbitrary template, expression, provider, namespace lookup, recursion,
context acquisition or formatting syntax inside braces. URLSearchParams sets only
the chosen parameter, removes its duplicate old values and preserves unrelated
decoded entries, origin, path and fragment. Standard query serialization can
canonicalize existing percent escapes/spaces. The final URL/value are returned;
URLs over8192 UTF-8 bytes are refused without truncation.

The helper bundles in both browser and main and imports no Node capability. A
browser cannot reliably identify transparent Proxies; this is not claimed. It
catches reflective failures and refuses accessor descriptors without invoking
getters. Main receives structured-cloned JSON and retains authority. The helper
never obtains Date.now/system timezone/environment/implicit locale, persists data,
opens a browser, copies text, calls a provider or starts background work. Review
and subsequent Open must reuse the same captured snapshot; another Review is an
explicit caller action. Errors expose only ClockLinkBuildError with reason
invalid-definition/invalid-snapshot/result-too-large and fixed safe messages.

## Validation

Pinned prefix: `PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH BUN_TMPDIR=/tmp`.

- `bun install --frozen-lockfile --ignore-scripts`: PASS805 packages/82ms. Initial
  sandbox invocation hit temporary-directory EROFS; authorized normal execution
  succeeded with scripts disabled. No manifest or lockfile change.
- `LINUXCAST_TEST_FILES='["packages/builtins/quicklinks/tests/clock.test.ts","packages/templates/tests/templates.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS125 checks/2files/659ms, comprising86 new helper cases and39 unchanged parser cases.
- `node node_modules/typescript/lib/tsc.js --project tsconfig.base.json --noEmit`: PASS.
- `node node_modules/eslint/bin/eslint.js packages/builtins/quicklinks/src/clock.ts packages/builtins/quicklinks/tests/clock.test.ts --max-warnings 0`: PASS.
- esbuild API bundling clock.ts with platform browser/format esm/write false:
  PASS353117B/143inputs, no Node imports or emitted repository files. This is a
  browser build check, not an actual UI/desktop scenario.
- `python3 scripts/validate_plan.py` and owned whitespace checks: recorded in final manifest.

Tests use actual Intl projections at UTC midnight/day/year/leap boundaries,
negative epoch milliseconds, New York spring/fall DST, Sydney DST and Lord Howe's
half-hour transition, Kathmandu's quarter-hour zone, historical Paris offset
seconds and four-digit year endpoints. Explicit fake ambient clock changes and a
throwing Date.now/fetch prove captured output stays unchanged with no clock/network
lookup. Unicode IDN/query entries, timezone slash/plus encoding, duplicate chosen
parameters, preserved unrelated parameters, fixed bindings, canonical snapshot
checks, exact URL/parameter bounds, unavailable Intl, malformed own-data objects
and content-free errors are covered. Frozen inputs remain unchanged. The initial
single failing expectation used Asia/Kathmandu rather than this Intl runtime's
canonical Asia/Katmandu; the fixture was corrected without changing production.

Platform: Pop!_OS22.04 amd64/Linux7.1.1-76070101-generic,
pinned Node24.22.1/Bun1.4.4/Vitest4.1.12/TypeScript6.0.3. Timezone spellings and
historical rules are the pinned runtime's Intl data; application browser/main must
use their corresponding runtime and canonicalization rather than guess aliases.

## Partial acceptance and remaining work

Partial L2-05-AC01: fixed typed date/time/timezone values are encoded into exactly
one safe URL component, without changing executable authority. Partial AC02:
existing nonrecursive scalar parser is reused with fixed known bindings; no new
recursive/snippet/cursor/context capability is claimed. UI: this pure helper has
no user interface or screenshots; parent application still needs shared Form,
exact Review, separate Open, stale-context/unknown/lifetime gates and affected
states/design/keyboard evidence. PRIVACY: only public synthetic domains/instants/
values appear in fixtures; fixed diagnostics contain no submitted URL/snapshot;
no new persistence or logging exists in this lane.

Coordinator owns schemas/barrels/manifests/storage/migrations/API/main/UI/root
routing/status and real saved-link/browser integration. Source tests do not
establish native Open/browser completion, root saved-entry behavior, restart/
usage/export privacy or permission/session recovery. Full documented placeholders,
arguments/browser-open-with/file/registered-URI targets, native assistive technology,
Debian13 GNOME/KDE Wayland/X11, prerequisites, performance/package/release and full
L2-05/local1.0 acceptance remain pending. No criterion/task status was changed.
