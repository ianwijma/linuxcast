# L2-06 — actual Emoji skin-tone application check

Bounded application evidence on PR67/develop `981d4b24f3684f26f3d17293f604283eb2f63221`,
with coordinator-integrated tone production changes in isolated `codex/emoji-tone-ui`.
Owned delta: one new integration test, this report and four new actual captures.
Existing tests, 19 initial +8 tone component captures and4 prior actual captures
remain unchanged. No staging, commits, shared/status or production edits.

## Verified behaviour

The test builds the real registry/root/shared Grid/Form/Actions/preload/main/offline
catalogue/clipboard stack. Before UI ownership, a named Medium API search returns
100 modifier-containing records, exact tone echo and full3944/9 group metadata,
then releases its handle. No raw search invalidates an active UI search handle.
The three built Emoji license/provenance files equal their source bytes.

Root **Emoji** → query `woman technologist` → People & Body → compact Grid → Arrow
selection → **Choose skin tone**. Both Escape and explicit Cancel retain exact query,
category, density and selected item without changing native CLIPBOARD. Apply Medium
keeps query/category/density, shows the active filter and one canonical result;
CLIPBOARD remains the public sentinel until explicit **Copy emoji**. Independent
`xclip` readback checks 👩🏽‍💻 and `[1F469,1F3FD,200D,1F4BB]`; the real receipt leaves
Grid visible. Unmodified returns the original woman technologist, and Dark finds
the source mixed sequence 🫱🏻‍🫲🏿. These filter changes never copy.

With category All, Dark + `flag: Australia` shows **No matching results**; All tones
restores the flag read-only. Hide from the Medium Form, secondary-instance `--show`
and reopen discard tone/query/category/compact density. Quit(exit0)/restart/open
preserve a fresh sentinel without replay. Actual SQLite owner export records only
one successful Emoji use, allowed aggregate keys, no tested queries, category, tones,
Unicode values or sentinels. Renderer-page HTTP(S) requests observed:0;
`page.on('request')` does not instrument main networking.

## Commands, platform and inspection

Prefix: `PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH BUN_TMPDIR=/tmp`.

- `node apps/desktop/setup-sqlite.ts`: PASS existing Electron ABI rebuild.
- `ELECTRON_OVERRIDE_DIST_PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/linuxcast-emoji-ui/node_modules/electron/dist LINUXCAST_PRIVATE_DISPLAY=1 LINUXCAST_TEST_FILES='["apps/desktop/tests/emoji-tone.integration.test.ts"]' xvfb-run -a node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS1 actual scenario5.91s /6.87s total. Reused existing pinned Electron binary;
  no Electron download or host display used.
- Scoped ESLint, `git diff --check`, plan validator and31 historical PNG hash
  comparisons: PASS. Coordinator owns full integrated compiler/checks.

Pop!_OS22.04 LTS amd64/Linux7.1.1-76070101-generic; private Xvfb X11/xclip;
Node24.22.1/Bun1.4.4, actual Electron45.0.0, Playwright1.64.1/axe4.14.0.
`chromiumSandbox:true`, normal production renderer sandbox/context isolation,
no `--no-sandbox`, no desktop/compositor/session D-Bus. Reduced motion;
private temporary HOME/XDG/profile removed afterward.

Author inspected all four `emoji-tone-application-{form,applied}-{dark,light}.png`
production captures: focused labeled enum/disclosure/Apply/Cancel, retained query,
category, compact cell, active Medium status and visible explicit Copy/footer.
Four actual-renderer axe analyses:0 violations through the existing legacy bridge.
DESIGN: Tokens; Shell and navigation; Results and actions; List/grid/detail/form;
States and motion; Accessibility; Review gate. Shared tokens/primitives only.

Initial candidates stopped at test assumptions about the empty query case: the
shared heading is `No matching results`, and `rocket` also legitimately matches
tone-bearing astronaut keywords. Only the test changed to use a flag query and
category All, then the full scenario passed. No production workaround.

## Acceptance limits

Partial L2-06-AC02: real canonical tone-filtered explicit Copy/readback, mixed and
unmodified source matching, read-only recovery and transient lifecycle. Partial UI:
registered keyboard/Form/Cancel/Apply/dark/light; component evidence separately
covers pending/unknown/200%. Partial PRIVACY: aggregate-only export and renderer
requests/no replay. No new actual denial/unsupported/uncertain branch is claimed;
existing boundary/component evidence covers those. AC01 dictionary is unchanged.

All full L2-06 criteria remain pending: dictionary, favourites/frecency/custom
keywords, native paste, full prerequisites, Debian13 GNOME/KDE Wayland/X11,
native AT/Orca/high contrast, performance/package/release and complete local1.0.
Private Xvfb is not supported-desktop or native accessibility acceptance.
