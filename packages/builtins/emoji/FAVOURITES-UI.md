# L2-06 — explicit Emoji favourites UI

Bounded application increment on PR68/develop `6227ef05ad02f636d8a6bd7aee8f90e81de4b6f8`,
isolated `codex/emoji-favourites-ui`. Coordinator owns contracts, main/preload,
persistent storage, data search, integration routing and status. This owned patch
contains presentation, focused tests/fixture, this report and eight new captures.
No shared files, manifests, historical captures, staging or commits were changed
by this lane. Full L2-06 and complete local1.0 scope remain pending.

## Behaviour and boundaries

Rows show the shared **Favourite** tag only from available saved metadata. Explicit
Actions offer **Add to favourites** / **Remove from favourites**; Copy remains
primary Enter. Existing read-only Choose category remains second so Ctrl+Enter
cannot write a favourite. Held Enter is stopped by the existing host capture guard.
No navigation, search, filter, category, tone, density or cancellation saves/copies.

**Show favourites** / **Show all emoji** preserve query/category/tone/density and
selected ID when present, release old handles and issue read-only searches.
Favourites-only sends exactly `true`; All omits the wire key. Empty saved results
retain Show all recovery. Missing/unavailable preferences disable filter/write
with storage/Reload guidance while ordinary search and Copy remain usable. Missing
save capability never simulates success.

A save reserves synchronously and shares the effect gate with Copy. It binds the
exact selected issued context and current preference revision. Exact receipt
requires desired boolean and revision+1; then old data/handle is dropped and a
fresh read precedes the named receipt. Stale or contradictory read metadata cannot
publish a saved tag or named success. No optimistic preference state, automatic
Copy/Paste, queued/replayed writes or command-usage update is introduced here.

Unknown save outcomes retain source metadata and explicit recovery. Actual pending
write ownership survives deadline, selection/query changes, pop/Hide/dispose and
late acknowledgements. Copy/other writes stay fenced until settlement and a
subsequent deliberate fresh preference read. A missing preference snapshot or
failed read during an actual write cannot silently resolve uncertainty. Late
results cannot publish into a different frame/root/query/selection/tone/filter.
Closing/reopening clears only the transient favourites filter; saved IDs remain
backend-owned preferences.

## Validation

Pinned prefix: `PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH BUN_TMPDIR=/tmp`.

- `LINUXCAST_TEST_FILES='["packages/builtins/emoji/tests/presentation.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS120 cases,45 new; final0.818s total. Covers exact saves/filter/Copy receipts,
  stale context and revision, synchronous reservation, mutually held effects,
  unknown/deadline/late acknowledgement, root/lifetime/query/selection invalidation,
  no optimistic/replayed writes, failed read recovery, unavailable/missing metadata
  and capability, empty filter, omission versus exact filter echo and handle release.
- `LINUXCAST_TEST_FILES='["packages/builtins/emoji/tests/emoji.ui.test.ts"]' node node_modules/@playwright/test/cli.js test --config scripts/test-runner/playwright.config.ts --workers 1`:
  PASS24 cases23.0s, including six new favourites cases; eight new captures/axe0.
  Focused six-case first run PASS7.0s. Historical27 PNG SHA256 values unchanged.
- Direct pinned Node `node node_modules/typescript/bin/tsc --project tsconfig.base.json --noEmit`:
  PASS. Scoped ESLint, `git diff --check` and `python3 scripts/validate_plan.py`: PASS.
  The final read-refusal guidance adjustment is covered by the120-case controller
  suite; full browser regression preceded that narrow error-path adjustment.

Initial fixture late-reply test reused the newer handle ID; the existing release
protection correctly retained it. Fixture identities were corrected. Intermediate
compiler errors were test/fixture optional/discriminated-union annotations, fixed
before the final compiler pass. No production or shared workaround.

Platform: Pop!_OS22.04 amd64/Linux7.1.1-76070101-generic, Node24.22.1/Bun1.4.4,
React19.3.1/Playwright1.64.1 Chromium headless shell1248/axe4.14.0, reduced motion,
1000x850 viewport and200% text. Synthetic public16-entry fixture simulates transport,
preferences and clipboard receipts. Production full3944 catalogue stays in main.
No sandbox-disabling flags; these checks do not prove persistence or native Copy.

## Captures and acceptance limits

Author inspected all eight new public fixture captures, with zero axe violations:

- `dark-emoji-favourite-actions.png`: explicit action, focused search and cancellation.
- `dark-emoji-favourite-saved.png`, `light-emoji-favourite-saved.png`: named receipt,
  source-confirmed Favourite tag, retained compact Grid and Copy primary.
- `light-emoji-favourite-empty.png`: genuine filtered empty and Show all recovery.
- `dark-emoji-favourite-pending.png`: retained unmodified row and disabled Copy.
- `light-emoji-favourite-unknown.png`: no optimistic tag, explicit recovery guidance.
- `light-emoji-favourite-unavailable.png`: useful ordinary result/Copy and storage guidance.
- `light-emoji-favourite-200-percent.png`: readable explicit Remove action and focus.

DESIGN sections: Tokens; Shell and navigation; Results and actions; List/grid/detail/
form; States and motion; Accessibility; Review gate. Existing host tags, Grid, Form,
Actions and semantic tokens are used.

Partial L2-06-UI: keyboard/Actions/empty/pending/unknown/unavailable/dark/light/scaling.
Partial AC02: preserves canonical explicit Copy and exact favourites-filter context;
real clipboard and persistent restart acceptance belong to coordinator integration.
Partial PRIVACY: bounded received metadata, no full preference list in renderer,
public synthetic captures and no implicit Copy/new authority. AC01 unchanged.
All full task gates remain pending: dictionary, custom keywords, frecency, semantic
AI, native paste, full prerequisites, Debian13 GNOME/KDE Wayland/X11/native AT/Orca/
high contrast, performance/package/release and complete local1.0 acceptance.

Coordinator final integration: newer contradictory preference snapshots use neutral
latest-state guidance instead of a stale Added/Removed receipt; two Add/Remove
regressions bring the controller suite to122PASS. Independent re-review clean.
Final mapped24browserPASS23.5s covers the prior read-refusal adjustment; final
7integrationPASS18.44s covers all3realElectron scenarios plus4storageowner cases
on latest source. Full directNodeTypeScript and scopedlint PASS. See actual report.
