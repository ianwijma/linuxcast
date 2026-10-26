# Saved Keyword commands in the launcher

L1-01 / W2-03 bounded unfinished application increment, 27 October 2026.
Built on merged PR43. Complete local 1.0 task scope is unchanged.

The saved workflow's enabled Keyword entries now register as actual launcher
commands. Search and Arrow/Enter use the existing shared list. Activation opens
the exact saved entry in the existing workspace; it never starts, cancels,
approves or replays a run. Explicit Run uses the existing main-owned saved
revision/hash, fixed utility, broker and clipboard receipt. New draft edits are
excluded. Main rechecks saved authority and the original shell frame after
asynchronous reads. Renderer receives only opaque IDs and bounded display
metadata, never graph/hash/grants or execution authority.

Stable IDs preserve command usage, pin, alias and visibility data. Registration
rejects duplicate identities and invalid metadata before publication. Ambiguous
normalized Keywords are disabled with editor guidance. Failed saved loading
keeps old rows disabled and builtin editor/Hide/Quit recovery available. Shared
bounds allow 4096 applications + 1000 saved Keyword entries + eight builtins;
no storage schema migration. Valid oversized saved names remain canonical in
storage/hash and receive a Unicode-safe bounded display projection.

## Validation

Linux amd64; Node24.22.1, Bun1.4.4, Electron45, SQLite3.53.4. Production Electron
uses Chromium sandbox, private Xvfb X11, private temporary HOME/profile/XDG and
no real session bus. No user display/profile, device, provider or credentials.
Public synthetic text only. This is not native Debian GNOME/KDE Wayland/X11 or
assistive technology acceptance.

- `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a bun run test:integration -- W2-03`:
  actual production application PASS (4.20s). UI creates/connects/saves two
  distinct Keywords; actual catalogue/search/Arrow/Enter selects the second;
  opening yields no run and unchanged actual clipboard. Explicit Run proposes
  uppercase text; Back and activation of the other entry preserve exact pending
  run/prompt and unchanged clipboard. Allow once completes the original entry
  with actual clipboard/read receipt and plain result. Old saved command fails
  conflict after Save; Manage commands → Reload recovers. No renderer Node.
  Dark/light actual captures below inspected; axe zero violations both states.
- 321 targeted tests PASS on final source: catalogue,
  ranking/launcher controller, main registration, entry projection, intent
  IPC/preload, run contract and debugger controller.
- `bun run test:unit -- W2-03`: 37 PASS, including exact/missing/disabled entries,
  pending approval preservation and bounded-name host receipt.
- `bun run test:ui -- W2-03`: 20 Chromium keyboard/axe cases PASS; author component
  captures inspected separately. IME, held Enter, 200%, unavailable and changed
  entry, large plain result, explicit denial/reset and unknown remain covered.
- `bun run test:security -- W2-03`: 2 PASS (exact main frame, read-only strict
  intent, no injected Run/input/grants, sanitized errors/revoked preload listener).
- `bun run test:contracts -- W1-02`: 7 PASS.
- `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a bun run test:integration -- W1-03`:
  19 PASS (5 journal, 13 host/engine/owner, 1 actual Electron6.50s), including
  long canonical-name execution/recovery, deny/reset/once/persistent, actual
  clipboard, native Close, restart and abrupt crash without replay.
- `bun run test:integration -- L1-01`: 19 actual sole-owner pin/alias/visibility
  PASS. `... xvfb-run -a bun run test:integration -- W2-01`: 8 PASS including
  actual editor save/native Close/restart/Quit4.50s.
- Full typecheck, scoped source lint, plan validation and diff checks PASS.
- Independent SOL/high source review closed the bounded-name projection finding;
  separate UI/source/capture review clean. Internal review does not replace
  any configured GitHub review or CI requirements.

## Affected UI evidence and design

Applies DESIGN.md shared shell/list/action-panel/form/status/focus/accessibility,
workflows and security/privacy sections; shared tokens/primitives throughout.

- `workflow-launcher-application-dark-open.png`: exact second Keyword, no run.
- `workflow-launcher-application-light-result.png`: original approved entry result
  survives presentation of a different entry, with actual effect receipt.
- Component affected states and five captures in debugger/evidence, integrated
  author cf26299 as signed9e083d0.

## Still unfinished

One current saved workflow, fixed Keyword/Transform/Copy only. Full launcher
providers/history, workflow node/runtime/editor/debugger families, settings,
groups, packages and ten examples remain required. Scheduling, script/sandbox,
retry/error routes, captured values/large handles/history/breakpoints, full
prerequisite acceptance and complete native session/AT/performance/package/
release matrices remain outstanding. No whole-task, Wayland, end-to-end 1.0 or
release acceptance claim. Opening has no system effect; actual clipboard denial,
unsupported/recovery cases continue through the existing broker/run boundary.
