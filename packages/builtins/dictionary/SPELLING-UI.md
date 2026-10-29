# L2-06 installed-language spelling presentation

Base PR73/develop `9ae4bc4`, isolated `codex/dictionary-spelling-ui`. Read with the
[task](../../../docs/implementation/tasks/L2-06.md), [freeze](SPELLING-INCREMENT.md),
[PLAN](../../../docs/PLAN.md), [data](../../../docs/architecture/data.md),
[security](../../../docs/architecture/security.md), [built-ins](../../../docs/product/builtins.md)
and [testing/release](../../../docs/implementation/testing-release.md).
Existing L1/D1/shared shell/storage is reused under approved partial increments;
full prerequisite/native/task/release acceptance stays pending. Full local1.0
scope is unchanged.

## Controls and integration

`SpellingFlow({session,api,viewId,revision,language,onChange?})` exports
`open(fromViewId)`, `owns(id)`, `query(id,query)`, `active`, `pending`, `handle(intent)`,
`closed(id)` and `dispose()`. The captured language is validated metadata, never a
path or installed word array. One owned `${viewId}-spelling` frame changes from
shared Form to shared List; there is no extra nested result frame or custom CSS.
The coordinator owns the Dictionary wrapper, root routing and production APIs.

Exact accessible controls:

- Wrapper action `dictionary:spelling`: **Check spelling** (coordinator-owned).
- Form title **Check spelling**, required text field `word`, title **Word**;
  accessible textbox label **Word (required)**. Current language appears in status.
- `spelling:check`: **Check spelling**, read-only Form submit.
- `spelling:cancel`: **Cancel**, read-only Form cancel.
- Results title **Spelling results**, local-only host search **Filter spelling suggestions…**.
- `spelling:copy`: **Copy suggestion**, explicit write, primary Enter on a row.
- `spelling:back`: **Back**, read-only secondary Ctrl+Enter on a row and first global
  action. Empty List Enter therefore returns to Dictionary without an effect.
- `spelling:again`: **Check another word**, read-only return to the Form with its
  last checked word; the next explicit submit obtains a new request UUID.

Typing invokes nothing. Form values are closed own data fields (ordinary or
null-prototype shared Form values), with no getters/coercion, trimming or Unicode
normalisation. Input is validated before an API call: one word, at most128 Unicode
scalars/256 UTF-16 units/512 UTF-8 bytes, no spaces/control/bidi formatting. Overlong
invalid input is not published as an unbounded ViewModel value. Inline validation
and fixed safe errors keep the draft actionable.

Each explicit Check calls `crypto.randomUUID()` and binds revision, UUID, language
and literal word. Recognised results show the exact original word; otherwise the
native-order suggestions (up to32, possibly internal spaces) are literal List row
titles. No Markdown, HTML, active links, image, definition or AI rendering occurs.
No suggestions means no invented correction. A source/engine failure is **Spelling
could not be confirmed**, not a bad-word result. Missing API, unavailable source,
denial and stale context have visible recovery. No read invokes usage recording.

Copy sends only issued context/record ID. A parsed receipt must exactly match
revision/UUID/language/word/check ID/snapshot/record ID and canonical suggestion
text before **Copied … Paste it explicitly where you need it; nothing was inserted
automatically.** There is no generic clipboard text API or automatic Paste. Known
no-effect refusal invalidates the result and requests a new Check. Malformed,
missing, failed or timed-out receipts retain **The copy outcome is unknown**,
release result authority and never replay Copy. A failed new Check retains that
uncertainty; a deliberate successful fresh Check after settlement restores Copy.

Full parent frame IDs/revisions/query generations/queries/selections are captured.
Own frame revisions, selected stable suggestion ID and filter generation guard
Copy. Stale async results cannot substitute text, show late success or reopen the
view. Each invocation release uses only its exact revision/UUID, once; cancelled,
failed, timed-out, stale and closed invocations are released even before a server
check ID exists. A late reply cannot release a newer UUID.

Check/Copy reserve synchronously before publishing loading. The `pending` getter
includes actual promises through the five-second caller timeout, Back, Hide,
disposal and reopening. Effects/checks stay fenced until actual settlement;
settlement never automatically checks or copies again. The wrapper retains the
pending flow and fences competing base Copy/language/definitions/spelling/reload.
`onChange` lets the coordinator update base availability only when spelling is
inactive, so the parent origin remains stable while the spelling frame is active.
Cancel/Back retain the base Dictionary query/language/selection; closing/reopening
clears the transient word/results. Nothing is persisted by this presentation.

## Validation and captures

Platform: Pop!_OS22.04 amd64, pinned Node24.22.1/Bun1.4.4,
React19.3.1/Playwright1.64.1 Chromium/axe4.14.0. Fixture viewport1000x1000,
reduced motion; scaled capture uses200% root text. All fixtures use authored public
words and simulated source/engine/clipboard receipts. They perform no native
spelling, host-file access, clipboard writes, persistence, usage writes or network
lookup. Native/backend/real application evidence is coordinator-owned.

Commands use `PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH`:

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: PASS805 packages with pinnedBun.
  Initial restricted temporary-directory EROFS was followed by authorized scoped
  installation; no dependency/manifest/lock change.
- `LINUXCAST_TEST_FILES='["packages/builtins/dictionary/tests/spelling.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS75 meaningful cases,0.946s total. Includes explicit-only requests/null-prototype fields,
  exact Unicode/space suggestions, strict bounds/receipts, UUID release isolation,
  wrong source/stale parent/frame/query/selection, synchronous/actual reservations,
  deadline/late navigation, missing methods, denied/unknown Copy and fresh recovery.
- `LINUXCAST_TEST_FILES='["packages/builtins/dictionary/tests/spelling.ui.test.ts"]' node node_modules/@playwright/test/cli.js test --config scripts/test-runner/playwright.config.ts --workers=1`:
  PASS11 cases,8.9s. Real shared Form/List keyboard, dirty
  Keep/Discard, Cancel/Escape, literal text, explicit Copy/manual guidance, Unicode,
  local filter, empty, loading/inert focus, unavailable, unknown recovery,
  pending Back, denied/missing methods and200% paths. Eight new PNGs, axe0 each. Final loading-only fixture observation
  correction: existing focused case PASS1,1.9s; only that capture regenerated.
- Full Node TypeScript, scoped ESLint, plan and owned whitespace results are recorded
  in the manifest. Historical tests/fixtures/captures are unchanged.

The first browser run caught a test assumption: empty List Enter correctly invokes
its read-only Back action. The fixture assertion was corrected without changing
production behavior. The real unavailable-state browser then found shared settled
focus remained on the intentionally focused loading Form container. Coordinator
fixed the shared focus predicate and its own regression; the reviewed shared file
is copied for integration/testing only and excluded from this owned patch. There
is no spelling-specific focus workaround or visual system change.

Affected captures, inspected for disclosure, literal text, focus and overflow:

- `spelling-dark-form.png`, `spelling-light-form.png`: explicit word/language and
  bounds/privacy/Cancel instructions, themed shared controls.
- `spelling-dark-suggestions.png`: exact native-order public suggestions and inert
  markup-like text, primary Copy/secondary Back.
- `spelling-light-empty.png`: no fabricated correction and explicit recovery.
- `spelling-dark-loading.png`: honest checking status, disabled field and safe inert
  Form focus, reachable Cancel/Escape.
- `spelling-light-unavailable.png`: fixed actionable read failure and recovered field
  focus, no bad-word/clipboard-success claim.
- `spelling-light-unknown.png`: clipboard uncertainty and deliberate fresh-check
  recovery; no invented no-effect or success claim.
- `spelling-light-200-percent-form.png`: readable labels/help and reachable actions.

Applicable [DESIGN](../../../docs/design/DESIGN.md) sections: Tokens;
Shell/navigation; Results/actions; List/grid/detail/form; States/motion;
Accessibility; Review gate. Reuses ViewSession/ViewRenderer/ThemeProvider and shared
semantic tokens; no stylesheet or shared component change is owned here.

## Partial acceptance and limits

Partial `L2-06-AC01`: installed-language guidance with no dataset downloads or
licensed data redistribution in this UI. Partial `L2-06-AC02`: literal Unicode
suggestion and exact canonical Copy receipts/manual Paste guidance. Partial
`L2-06-UI`: shared keyboard/dirty/loading/empty/error/recovery/themed/scaled/axe
coverage. Partial `L2-06-PRIVACY`: public fixtures, fixed error text, transient word
state and no renderer file/resource/generic clipboard authority.

No criterion/task is promoted. Production Hunspell engine and containment, real
source discovery/change validation, actual IPC/clipboard/usage/Hide/restart,
Debian13 GNOME/KDE Wayland/X11, native AT/Orca/high contrast, full dictionaries/
encodings/StarDict/thesaurus, performance, prerequisites and package/release gates
remain separately required. The fixture cannot establish native spelling or a
real desktop/backend result. No proof/research/infrastructure scope was added.
