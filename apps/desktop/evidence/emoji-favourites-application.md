# L2-06 — actual persistent Emoji favourites check

Bounded application evidence on PR68/develop `6227ef05ad02f636d8a6bd7aee8f90e81de4b6f8`,
with coordinator-integrated favourites source in `codex/emoji-favourites-ui`.
Owned delta: one new integration test, this report and four new actual captures.
Existing tests,35 component PNGs and8 prior actual Emoji PNGs are unchanged.
No shared/status/production/manifests edits, staging or commits by this lane.

## Actual behaviour and results

The test builds the real registry/root/shared Grid/Form/Actions/preload/main/full
Unicode17.0 catalogue, storage utility and clipboard writer. Initial closed-app
StorageOwner inspection confirms absent `emoji.favourites`, empty selected settings
export and no usage. A named API probe BEFORE UI ownership returns registered Emoji,
full3944/9 group metadata, the canonical Medium woman technologist with favourite
false and available preference revision0; its handle is released. No raw search
invalidates a live UI handle. Built license/provenance bytes equal source files.

Root **Emoji** → search `woman technologist` → People & Body → Medium → compact →
explicit **Add to favourites** produces a fresh-read Favourite tag and named receipt.
Native `xclip` still reads the public sentinel. **Show favourites** retains exact
query/category/tone/density/selection and performs no Copy. Only separate explicit
**Copy emoji** writes 👩🏽‍💻, checked as `[1F469,1F3FD,200D,1F4BB]` by native readback.
Remove produces a genuine filtered empty; Show all restores the untagged row
read-only. Add again and Hide/secondary-instance `--show` preserve the saved ID while
reopen resets query/category/tone/density and transient favourites filter.

Quit(exit0)/restart retains the saved canonical favourite without replaying Copy.
A later explicit Remove, Quit/restart shows a real empty saved filter; Show all
still restores100 ordinary results without copying. Each restart seeds a fresh
clipboard-owner sentinel. Closed-app owner/settings export checks distinguish
revision3 containing only the canonical ID from revision4 containing literal `[]`;
the latter remains an existing setting, unlike the initial absent record.

Aggregate usage remains exactly1 after all four preference writes and the one
explicit Copy. Usage exports contain only allowed aggregate keys and no tested
query/category/tone, canonical ID/value or sentinel. Settings export intentionally
contains the explicitly saved canonical ID array, then `[]`. Renderer-page HTTP(S)
requests observed:0; `page.on('request')` does not instrument main networking.

## Commands, platform and inspected captures

Prefix: `PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH BUN_TMPDIR=/tmp`.

- `node apps/desktop/setup-sqlite.ts`: PASS existing Electron ABI rebuild.
- `ELECTRON_OVERRIDE_DIST_PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/linuxcast-emoji-ui/node_modules/electron/dist LINUXCAST_PRIVATE_DISPLAY=1 LINUXCAST_TEST_FILES='["apps/desktop/tests/emoji-favourites.integration.test.ts"]' xvfb-run -a node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS first run,1 scenario9.32s /10.06s total. Existing pinned Electron binary reused,
  no download or host display. Four actual-renderer axe analyses:0 violations.
- Direct pinned Node project compiler, scoped ESLint, `git diff --check`, plan
  validator and43 historical PNG SHA256 comparisons: PASS.

Pop!_OS22.04 amd64/Linux7.1.1-76070101-generic; private Xvfb X11/xclip;
Node24.22.1/Bun1.4.4, actual Electron45.0.0, Playwright1.64.1/axe4.14.0.
`chromiumSandbox:true`, normal production renderer sandbox/context isolation,
no `--no-sandbox`, no desktop/compositor/session D-Bus. Reduced motion;
private temporary HOME/XDG/profile removed afterward. Storage inspected only while
Electron is closed, with normal single-owner locking.

Author inspected all four `emoji-favourites-application-{saved,favourites}-{dark,light}.png`
production captures: active Medium/category/query, source-confirmed Favourite tag,
retained compact cell, named save receipt or favourites-only disclosure, visible
Copy primary/footer and focus. Axe uses the established actual Electron legacy
bridge. DESIGN: Tokens; Shell/navigation; Results/actions; List/grid/detail/form;
States/motion; Accessibility; Review gate. Shared primitives/tokens only.

## Acceptance limits

Partial L2-06-AC02: real canonical explicit Copy under favourites/tone context;
read-only filtering and no implicit clipboard effects. Partial UI: registered
Actions and persistent favourite/reset/empty recovery with actual dark/light.
Partial PRIVACY: aggregate-only usage, explicit settings export and renderer request
assertions. No new actual denial/unsupported/unknown-write branch is claimed;
separate boundary/component evidence covers those. AC01 dictionary is unchanged.

Full L2-06 remains pending: dictionary, custom keywords, frecency, semantic AI,
native paste, prerequisites, Debian13 GNOME/KDE Wayland/X11/native AT/Orca/high
contrast, performance/package/release and complete local1.0 acceptance. Private Xvfb
is not supported-desktop or native accessibility acceptance.

Coordinator final mapped integration on latest source: `LINUXCAST_PRIVATE_DISPLAY=1
ELECTRON_OVERRIDE_DIST_PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/linuxcast-emoji-ui/node_modules/electron/dist
xvfb-run -a bun run test:integration -- L2-06` PASS7checks/4files18.44s, including
favourites5.60s, originalEmoji5.71s, tone5.05s and4realstorageowner tests.
DirectNodeTypeScript/scopedlint PASS; independent source/test/report/capture review
clean. All16testedproduction hashes match frozen author evidence, including the
final latest-state guidance fix. No additional native desktop claim.
