# L2-06 — configured local definitions application check

Bounded application evidence on PR70/develop `13d8eb6`, worktree
`codex/dictionary-definitions-data`. Owned delta: one new actual application test,
this report and six new actual captures (the coordinator explicitly added the two
changed-source captures after the first finding). Reader files, shared production
code, contracts, manifests and status were not edited by this actual-check lane.
All59 historical PNGs and the frozen three reader files remain byte-identical.

## Actual flow and consent

The test builds the registered Dictionary/root/shared List/Detail/Actions, preload/
main, bounded StarDict reader and existing settings CAS. The public authored
one-entry UTF-8 source is generated in a private temporary directory; no installed
dictionary dataset is redistributed. Its phrase is `café au lait`, with phonetic
`ka.fe o lɛ`, multiline meaning, literal Markdown/HTML/URL syntax and more than12000
Unicode scalars of meaning text, requiring two complete Detail pages.

**Synthetic consent:** only the exact-title `Choose local StarDict definitions`
and `Use local definitions?` native dialog answers are injected in trusted Electron
main. Picker Cancel, confirmation Cancel and Use source exercise the actual
configuration/CAS/reader/UI. This does not validate a real native file chooser,
native consent interaction or accessibility. Other dialog titles are not replaced.
No path is supplied through a renderer input or renderer filesystem grant.

Root Dictionary → Local definitions starts with actionable unconfigured guidance.
Both Cancel paths leave configuration unchanged; the later saved revision1 confirms
neither Cancel wrote. Choose/Use source then exposes the configured source and exact
Unicode phrase. Query/Arrow selection are read-only; separate explicit Read definition
opens its exact plain meaning/phonetic text. Literal `<script>`, `<img>`, Markdown
link/image syntax and URL text remain visible text, with no article a/img/script/
iframe/object elements and no observed renderer HTTP(S) request. The page1+page2
rendered text matches all source non-whitespace characters; Previous restores page1.
No additional Read/usage occurs for Next/Previous. Back retains query/selection.

Hide from Detail and a secondary `--show` reset all nested frames; reopening starts
with empty query and configured List. Quit(exit0) → closed-app storage inspection →
restart preserves configuration without opening source dialogs, auto-reading or
replaying clipboard work. A new clipboard-owner sentinel remains unchanged. Another
explicit Read succeeds. A known external append to the chosen `.dict` then makes
Reload refuse with changed-source status, retained query, zero rows and **Local
definitions unavailable**, rather than a matching-results claim. Forget clears only
the saved configuration; another Quit/restart remains unconfigured without dialogs.
Every source file survives byte-exactly, except the deliberately appended file whose
expected mutated bytes are also checked. The application does not modify source data.

Initial closed-app setting is absent (main's revision0 default); configured value is
private canonical JSON with exact chosen path, opaque source ID/snapshot at revision1;
Forget stores literal `null` at revision2. Normal settings and command-usage exports
omit that private setting/path, phrase, phonetic, definition text and source IDs.
Usage records contain only the allowed aggregate keys and exactly3 successful explicit
Reads; configuration, query, paging and lifecycle add no usage. There is no definition
Copy/Paste. Independent native `xclip` readback stays at the public sentinel through
configuration, search, reads, paging, lifecycle, refusal and Forget.

Renderer-page HTTP(S) requests observed:0. `page.on('request')` does not instrument
main networking. The authored fixture is removed with its private profile afterward.

## Commands, results and images

Prefix: `PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH BUN_TMPDIR=/tmp`.

- `node apps/desktop/setup-sqlite.ts`: PASS existing Electron ABI rebuild.
- `ELECTRON_OVERRIDE_DIST_PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/linuxcast-emoji-ui/node_modules/electron/dist LINUXCAST_PRIVATE_DISPLAY=1 LINUXCAST_TEST_FILES='["apps/desktop/tests/dictionary-definitions.integration.test.ts"]' xvfb-run -a node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS1 scenario8.22s /9.01s total. Six actual-renderer axe analyses:0 violations.
  Existing pinned Electron binary reused; no host display or Electron download.
- Direct pinned Node `tsc --project tsconfig.base.json --noEmit`, new-test scoped
  ESLint, `python3 scripts/validate_plan.py` and `git diff --check`: PASS.
- Before/after hashes of19 frozen tested inputs, all59 historical PNGs and frozen
  three reader files: PASS. Exact production and owned-file hashes accompany the
  bounded binary patch manifest.

The initial actual run reached configuration, all four initial captures/axe0,
pagination, Back/Hide/restart and saved revision1/usage2, then failed because the
shared renderer replaced the supplied unavailable heading with **No matching
results** for a nonempty query despite correctly warning that the source changed.
The coordinator fixed warning/error extension empty headings, copied that shared
renderer into this lane and requested two changed-source captures. The full rerun
above passed; no production workaround or reader policy relaxation was made here.

Platform: Pop!_OS22.04 amd64/Linux7.1.1-76070101-generic; Node24.22.1/Bun1.4.4;
actual Electron45.0.0, Playwright1.64.1/axe4.14.0, private Xvfb X11/xclip.
`chromiumSandbox:true`; normal production renderer sandbox/context isolation;
no `--no-sandbox`, host desktop or compositor/session D-Bus. Reduced motion and private
HOME/XDG/profile. Storage inspection runs only with Electron closed under the normal
single-owner lock.

Author inspected all six final `dictionary-definitions-application-{list,detail,changed}-{dark,light}.png`:
canonical phrase/source and Read footer, literal meaning/phonetic/HTML/URL syntax
with page1of2 and scrollable Detail, and changed-source warning with retained query/
unavailable heading. Shared primitives/tokens only. DESIGN sections: Tokens;
Shell/navigation; Results/actions; List/grid/detail/form; States/motion;
Accessibility; Review gate.

## Acceptance limits

Partial AC01: explicitly selected local configured-source search/read with no app
download or dataset redistribution; this is not a licence audit of a user's source.
Partial UI/PRIVACY: actual inert plaintext, pagination, explicit consent boundaries,
settings CAS/export exclusion, lifecycle, source-change refusal and aggregate usage.
AC02 receives no new definition Copy/Paste claim; installed base-word Copy remains
separate. Denial/unknown/unsupported parser cases belong to boundary/component
checks and are not claimed as actual native session observations here.

Full L2-06, Hunspell affix/forbidden/compound correctness, complete StarDict formats/
markup/media/resources/encodings/synonyms/thesaurus, real native picker/consent
accessibility, Orca/native AT, full prerequisites, Debian13 GNOME/KDE Wayland/X11,
high contrast/performance/package/release and complete local1.0 acceptance remain
pending. Private Xvfb and injected native answers do not establish those gates.
