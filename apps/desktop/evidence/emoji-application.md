# L2-06 — actual registered Emoji application check

Bounded unfinished application increment on PR66/develop
`42afa6ba397f77f079fc057ac2c2f9f3d08d87cc`, with coordinator-integrated production
source in isolated `codex/emoji-ui`. Owned delta: one integration test, this report
and four new actual captures. Frozen UI, production/shared/status/manifests/lockfile
and historical captures are unchanged; no staging or commits.

## Actual behaviour and results

`apps/desktop/tests/emoji.integration.test.ts` builds and runs the production
registry/root controller, shared Grid/Form/Actions, preload/main APIs, full pinned
Unicode17.0 dataset, real clipboard writer and private SQLite profile. It verifies:

- Built `LICENSE-UNICODE.txt`, `LICENSE-CLDR-48.txt` and `provenance.json` are
  byte-identical to the three data source files.
- Named API, before opening any UI search handle: registered `linuxcast:emoji`,
  full3944 entries via9 group counts,100 returned results, explicit handle release.
  No raw search calls invalidate an active UI handle.
- Root **Emoji** opens the real100-result Grid. Search, Arrow/Home selection,
  category Cancel/Apply and compact/comfortable density leave CLIPBOARD unchanged.
  Cancel preserves the exact query and selected item.
- Only explicit **Copy emoji** writes CLIPBOARD. Independent native `xclip` readback
  checks complete strings and code-point arrays: 👩🏽‍💻 =1F469 1F3FD 200D 1F4BB;
  ❤️ =2764 FE0F;1️⃣ =0031 FE0F 20E3;🇦🇺 =1F1E6 1F1FA. The real receipt keeps the
  Grid visible and explains explicit pasting; there is no automatic insertion.
- Unsupported branch is INJECTED by setting main-process
  `XDG_SESSION_TYPE='unknown'` on the SAME private Xvfb display, not another real
  desktop/session. The actual writer refuses and leaves the flag unchanged.
  Restore `x11`, deliberately Reload, then explicitly Copy: 🚀 succeeds.
- Back preserves root query `emoji`. Hide from category, secondary-instance
  `--show`, reopen, Quit(exit0) and restart discard nested state without copying
  or replay. A new public sentinel remains unchanged on restart/open.
- Zero renderer-page HTTP(S) requests observed. `page.on('request')` does not
  instrument main networking. Renderer `require` is unavailable. After final Quit,
  actual owner reopen shows exactly5 successful Emoji copies in command usage;
  only allowed usage keys are present, with no tested query/category/Unicode value
  or sentinel content.

## Commands and platform

Prefix: `PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH BUN_TMPDIR=/tmp`.

- `node apps/desktop/setup-sqlite.ts`: PASS Electron ABI rebuild.
- `LINUXCAST_PRIVATE_DISPLAY=1 LINUXCAST_TEST_FILES='["apps/desktop/tests/emoji.integration.test.ts"]' xvfb-run -a node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS1 actual scenario6.51s /7.47s total, including the three built-license checks.
- Scoped ESLint and `git diff --check`: PASS. `python3 scripts/validate_plan.py`:
  PASS local documentation integrity (not application acceptance).

Pop!_OS22.04 LTS amd64, kernel7.1.1-76070101-generic; private Xvfb X11/xclip,
no desktop/compositor/session D-Bus; Node24.22.1/Bun1.4.4, actual Electron45.0.0,
Playwright1.64.1/axe4.14.0. Renderer sandbox/context isolation enabled;
chromiumSandbox:true, no --no-sandbox. Reduced motion enabled; private ephemeral
HOME/XDG/profile/runtime removed afterward.

Intermediate limits: two lane compiler attempts exited SIGSEGV139 without
diagnostics, not PASS; coordinator separately reported full direct-Node project
compiler PASS and owns the final integrated check. First app candidate stopped on
retrying Copy without refreshing its stale handle after unsupported recovery;
changed only the test to follow visible Reload→explicit Copy guidance, then full
scenario passed. First Electron module import printed its standard
`Downloading Electron binary...` initialization message; final run used the local
installed binary. Setup transport was not instrumented and is distinct from the
renderer request assertion. No production workaround or security weakening.

## Four actual captures and acceptance limits

Author and coordinator reviewer inspected these production
`linuxcast-app://shell/index.html` captures. All four actual-renderer axe analyses
are clean through the established Electron legacy bridge. Public data only,
readable status/focus/selection/footer, scrollable Grid within launcher bounds:

- `emoji-application-grid-dark.png`
- `emoji-application-grid-light.png`
- `emoji-application-copied-dark.png`
- `emoji-application-copied-light.png`

DESIGN.md: Tokens; Shell/navigation; Results/actions; List/grid/detail/form;
States/motion; Accessibility; Review gate. Shared host primitives/glyphs are reused.

Partial L2-06-AC02 support: actual canonical Unicode copy/readback, unsupported
branch/refusal/recovery. Partial UI: registered keyboard/Grid/category/density and
actual dark/light/lifecycle evidence. Partial PRIVACY: public fixtures, bounded
usage export and renderer request/no-Node/no-replay assertions. AC01 dictionary
licensing/discovery is outside this check; installed offline data/build provenance
is bounded Emoji evidence only. Permission denial and uncertainty cases remain
separate boundary/component evidence, not claimed real-session permission tests.

All full L2-06 criteria remain pending. Dictionary, favourites/frecency, custom
keywords, tone picker, explicit paste, full L1/D1 prerequisites, supported Debian13
GNOME/KDE Wayland/X11/native AT/Orca/high contrast, performance/package/release and
complete local1.0 scope remain required. Private Xvfb is not desktop-matrix proof.
