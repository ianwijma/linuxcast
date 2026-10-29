# L2-06 — actual custom Emoji keyword application check

Bounded application evidence on PR70/develop `13d8eb6`, isolated
`codex/emoji-keywords-data`. Owned delta: one new actual test, this report and four
new Form/saved Grid dark/light captures. Frozen search files, datasets, shared
production/contracts/manifests/status and old tests were not edited by this
actual-check lane. All59 base historical PNGs and the frozen three search files
remain byte-identical. Staged Dictionary definitions work is separate and untouched.

## Verified actual behaviour

The test builds the registered root Emoji command/shared Grid/Form/Actions,
preload/main, complete pinned source search and existing storage-owner settings CAS.
No raw test API search replaces an active UI handle. There is no dialog injection;
dirty/discard is the actual shared host Form UI. All phrases are authored public
examples, not user content.

Root Emoji → source query **glass of milk** → explicit **Edit search keywords**.
Dirty Cancel opens Discard; Keep editing retains the draft, then Discard returns
to the same Grid query/selection. A separate dirty Escape/Discard also preserves
that context. Reopening the Form remains empty. Save
`["public café ritual","☕"]` gets its named source-confirmed receipt. The unique
text alias now finds the canonical glass of milk, which did not match before.
The glyph alias `☕` shows canonical hot beverage plus glass of milk; selection
correctly remains on the stable milk ID. Explicit Home then ArrowRight navigates
back to milk. All editing/search/navigation leaves native CLIPBOARD unchanged.

Only separate explicit **Copy emoji** writes `🥛`; independent native `xclip`
readback equals the canonical string and exact scalar `[U+1F95B]`. Reopening the
Form confirms both saved phrases. Hide from an unsaved Form, secondary `--show`
and reopen clear Form/draft/query and restore default Grid state, while the saved
alias still matches. Quit exits0. Closed-app storage inspection finds exactly
revision1 with canonical JSON `[{"id":"emoji:1f95b","keywords":["public café ritual","☕"]}]`;
initially that setting was absent. Cancel/Escape and the hidden draft did not write.

Restart starts with no Form, empty query and no implicit Copy/autosave. The alias
still matches. Empty the confirmed Form and explicitly Save: **Cleared search
keywords for glass of milk** is confirmed, the original alias query stays visible,
there are zero matches and no unknown-outcome fence. Coordinator's corrected UI
verifies the canonical entry through read-only search before reissuing the original
query; no visible query jump or write replay. Closed-app preference becomes literal
`[]` at revision2. A second restart still has no text-alias match; `☕` again finds
only canonical hot beverage. Revision remains2.

Native clipboard sentinels stay unchanged through edits, searches, Save/Clear,
cancellation, lifecycle and recovery, except the one explicit canonical Copy.
Fresh sentinels are seeded after restart to distinguish automatic replay. Usage
contains exactly1 successful Emoji Copy and only allowed aggregate keys; keyword
edits/queries/Forms add no usage. Ordinary settings and usage exports omit
`emoji.keywords`, both phrases, discarded drafts, source ID/name/value and sentinel.
This asserts export/aggregate privacy, not complete encrypted-backup coverage.

Renderer-page HTTP(S) requests observed:0. `page.on('request')` does not instrument
main networking. Private HOME/XDG/profile are removed after the scenario; storage
inspection runs only with Electron closed under its normal single-owner lock.

## Commands, results and captures

Prefix: `PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH BUN_TMPDIR=/tmp`.

- `node apps/desktop/setup-sqlite.ts`: PASS existing Electron ABI rebuild.
- `ELECTRON_OVERRIDE_DIST_PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/linuxcast-emoji-ui/node_modules/electron/dist LINUXCAST_PRIVATE_DISPLAY=1 LINUXCAST_TEST_FILES='["apps/desktop/tests/emoji-keywords.integration.test.ts"]' xvfb-run -a node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS1 final scenario5.67s /6.45s total. Four actual-renderer axe analyses:0 violations.
  Existing pinned Electron binary reused; no host display or Electron download.
- Direct pinned Node `tsc --project tsconfig.base.json --noEmit`, new-test scoped
  ESLint, `python3 scripts/validate_plan.py` and `git diff --check`: PASS.
- Before/after frozen14 tested-input hashes, all59 historical PNG hashes and frozen
  three search-file hashes: PASS. Exact owned-file/production hashes accompany
  the bounded six-file binary patch manifest.

Initial actual run stopped on a test assumption: the selected milk ID correctly
survived the glyph-query change instead of automatically selecting hot beverage.
Only the test changed to navigate with Home/ArrowRight. The second run reached
all4 captures/axe0, exact native Copy, Hide/reset and saved revision1/privacy/usage1,
then exposed an actual filtered-out confirmation edge: Clear removed the alias
match but incorrectly left an unknown status because its selected row was absent
from fresh results. The coordinator fixed canonical read-only confirmation and
original-query reissue. The strict same scenario then passed above, including
named Clear/no unknown/no query jump. No production edits or test workaround here.

Platform: Pop!_OS22.04 amd64/Linux7.1.1-76070101-generic; Node24.22.1/Bun1.4.4;
actual Electron45.0.0, Playwright1.64.1/axe4.14.0; private Xvfb X11/xclip.
`chromiumSandbox:true`, normal production renderer sandbox/context isolation,
no `--no-sandbox`, host desktop or compositor/session D-Bus. Reduced motion.
Backend success is real local preference CAS/canonical search/native Copy.
Denial, unavailable/unsupported storage or clipboard and genuinely timed-out writes
were not induced in this actual scenario; their separate boundary/component tests
are not native session evidence here.

Author inspected all4 final `emoji-keywords-application-{form,saved}-{dark,light}.png`:
focused labeled multiline field, two phrases and trim/clear/no-Copy disclosure,
visible Save/Cancel; glyph alias with canonical milk keyboard-selected and Copy
footer/manual-paste guidance. Shared primitives/tokens only. DESIGN: Tokens;
Shell/navigation; Results/actions; List/grid/detail/form; States/motion;
Accessibility; Review gate.

## Acceptance limits

Partial AC02: actual keyword-selected canonical Unicode Copy/manual-paste guidance.
Partial UI/PRIVACY: real shared Form dirty cancellation, source-confirmed Save/Clear,
text/glyph search, stable keyboard selection, Hide/two restarts, absent vs saved vs
cleared preference, private export exclusion and aggregate usage. No new dictionary
AC01 or dataset licence claim; no app dataset download is introduced.

Full L2-06 remains pending: complete Dictionary Hunspell/StarDict/thesaurus support,
Emoji frecency/native paste/explicit global-provider semantic lookup, complete
backup coverage of private keywords, full prerequisites, Debian13 GNOME/KDE
Wayland/X11/native AT/Orca/high contrast/performance/package/release and complete
local1.0 acceptance. Private Xvfb does not establish those native desktop gates.
