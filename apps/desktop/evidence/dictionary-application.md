# L2-06 — actual installed Dictionary application check

Bounded unfinished application evidence on PR69/develop `0696e1d`, with
coordinator-integrated Dictionary production source in `codex/dictionary-headwords-data`.
Owned delta: the coordinator-prepared new integration test (assigned to this lane),
this report and four new actual captures. Frozen installed-reader files and existing
Emoji tests/captures remain unchanged. No production/shared/status/manifests edits,
staging or commits by this actual-check lane.

## Verified behaviour

The test builds the real registered Dictionary/root/shared List/Form/Actions,
preload/main installed-source reader, storage utility and clipboard writer. A named
probe BEFORE UI ownership discovers bounded language/result metadata without paths
and explicitly releases its issued handle. No raw search replaces a live UI handle.

Root **Dictionary** → query `ca` → Arrow selection → **Choose language**. Escape
and Cancel retain exact query and selected item without changing native CLIPBOARD.
The real installed UTF-8 `en_GB` source is selected through the shared Form. Query
`café`, select the exact canonical source word, then separate explicit **Copy word**:
independent native `xclip` readback equals `café` and `[0063,0061,0066,00E9]`.
The receipt stays in List with manual-paste guidance. Base-entry-only and unavailable
full spell checking/definitions disclosures remain visible.

A nonmatching query shows the genuine filtered empty without copying. This host's
`es_ES` pair passes basic header discovery but full selected-source parsing rejects
an entry containing U+200E at line1746, as independently identified by coordinator.
The actual UI failure is required and observed as **could not be loaded**, with no
partial result or clipboard change; explicitly selecting `en_GB` recovers. An
existing unsupported-encoding language is also required and observed with empty
results and actionable UTF-8/choose-another guidance. These branches are not silently
skipped. The strict reader remains unchanged; no unsafe data policy workaround.

Hide from the language Form, secondary-instance `--show`, reopen, Quit(exit0) and
restart reset the exact default language/query/nested context without replay. A fresh restart
clipboard-owner sentinel remains unchanged through open. Actual closed-app storage
owner export records exactly1 successful Dictionary use and only allowed aggregate
keys; no tested query/word/language ID/name/system path/sentinel is present.
Renderer-page HTTP(S) requests observed:0. `page.on('request')` does not instrument
main networking. No installed dataset files are redistributed; captures show only
public base words and language labels.

## Commands, platform and captures

Prefix: `PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH BUN_TMPDIR=/tmp`.

- `node apps/desktop/setup-sqlite.ts`: PASS existing Electron ABI rebuild.
- `ELECTRON_OVERRIDE_DIST_PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/linuxcast-emoji-ui/node_modules/electron/dist LINUXCAST_PRIVATE_DISPLAY=1 LINUXCAST_TEST_FILES='["apps/desktop/tests/dictionary.integration.test.ts"]' xvfb-run -a node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS1 final actual scenario8.28s /9.06s total (preceding full pass8.26s /9.04s). Reuses existing pinned Electron binary;
  no Electron download or host display. Four actual-renderer axe analyses:0 violations.
- Direct pinned Node project compiler, scoped ESLint, `git diff --check`, plan
  validator and47 historical Emoji PNG SHA256 comparisons: PASS. Frozen reader3
  files remain byte-identical to their prior reviewed manifest.

Initial run reached canonical Copy/Spanish rejection/recovery but stopped because
the prepared aria-busy selector was absent and the new unsupported-status assertion
ran during **Searching installed base entries…**. Only test waits changed to poll
loaded-language and semantic unsupported status; final full scenario passed.

Pop!_OS22.04 amd64/Linux7.1.1-76070101-generic; private Xvfb X11/xclip;
Node24.22.1/Bun1.4.4, actual Electron45.0.0, Playwright1.64.1/axe4.14.0.
`chromiumSandbox:true`, normal production renderer sandbox/context isolation,
no `--no-sandbox`, no desktop/compositor/session D-Bus. Reduced motion;
private temporary HOME/XDG/profile removed afterward. Storage inspected only after
Electron Quit using the normal single-owner lock.

Author inspected `dictionary-application-{language,copied}-{dark,light}.png`:
focused labeled installed-language enum, Apply/Cancel and base-entry disclosure;
selected canonical café, explicit receipt/manual-paste text, scrollable source List
and visible Copy/footer. Axe uses the established actual Electron legacy bridge.
DESIGN: Tokens; Shell/navigation; Results/actions; List/grid/detail/form;
States/motion; Accessibility; Review gate. Shared primitives/tokens only.

## Acceptance limits

Partial AC01: installed-source discovery and explicit unsupported/invalid-source
recovery, without app downloads or dataset redistribution. This is not a package
licence audit. Partial AC02: actual canonical Unicode Copy/manual-paste guidance.
Partial UI: registered keyboard/Form/cancellation/empty/recovery/dark/light/lifecycle.
Partial PRIVACY: public words, aggregate-only usage export and renderer request
assertions. Actual permission denial/unknown clipboard outcomes and missing-language
fixtures belong to separate boundary/component evidence, not this session claim.

Full L2-06 remains pending: complete Hunspell affix/forbidden/compound checking,
configured StarDict definitions/thesaurus, missing/other-language and encoding
support, native paste, semantic/full Dictionary and Emoji scope, full prerequisites,
Debian13 GNOME/KDE Wayland/X11/native AT/Orca/high contrast/performance/package/release
and complete local1.0 acceptance. Private Xvfb is not supported-desktop/native
accessibility acceptance. This increment browses source base entries and does not
claim that a returned word is valid spelling.

Coordinator final integration on identical16productionfiles: mapped8checks/5files
PASS26.77s, includingDictionary8.21s, originalEmoji5.63s, favourites5.27s, tone5.11s
and4realstorageowner checks. Full directNode projectTypeScript, newactual/main-test
scopedlint anddiffchecks PASS. Independent finalactualtest/report/4capture review
clean; no native desktop acceptance claim. Reviewed newPNG bytes preserved after
regression recapture; all47historicalEmojiPNGs unchanged.
