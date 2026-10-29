# L2-06 installed Dictionary base-entry presentation

Base PR69/develop `0696e1d`, isolated `codex/dictionary-headwords-ui`.
Read with the [task card](../../../docs/implementation/tasks/L2-06.md),
[application freeze](APPLICATION-INCREMENT.md), [PLAN](../../../docs/PLAN.md),
[data](../../../docs/architecture/data.md), [security](../../../docs/architecture/security.md),
[built-ins](../../../docs/product/builtins.md), and
[testing/release](../../../docs/implementation/testing-release.md).
This is a bounded unfinished application increment under the approved sequencing:
integrated L1/D1/shared shell/storage are reused; full prerequisites remain pending.

## Behaviour and ownership

`DictionaryFlow({session,api,viewId,revision})` provides the shared Dictionary List
and Dictionary language enum Form. It exports `open`, `active`, `owns`, `query`,
`handle`, `closed` and `dispose` for coordinator root routing. The enum field is
`languageId`; action IDs are `dictionary:copy`, `dictionary:reload`,
`dictionary:language`, `dictionary:apply-language`, `dictionary:cancel-language`
and `dictionary:back`. All UI uses existing ViewSession/ViewRenderer components
and semantic tokens. There is no feature CSS or custom visual system.

The initial read omits language selection; its returned language is pinned for
subsequent query/reload requests. Choose language is read only (secondary
Ctrl+Enter when a row is selected); Apply preserves query and selection where
the exact ID remains. Cancel/Escape preserves applied state. A changed unsent
selector follows the shared dirty-Form discard confirmation. Back restores root
query/selection; close/dispose/reopen resets the local query and chosen language.

Rows are labelled **Installed base entries**. The limitation **Definitions and
full spell checking are not available yet** stays visible. Hunspell affix flags,
forbidden/compound rules and definition lookup are not interpreted by this slice;
headword presence is not spelling validation. Missing data offers system-package
installation guidance without downloading anything. Unsupported/invalid/unavailable
language sources remain explicit and offer another language or Reload. Source
messages and paths are not displayed. More-than-100 records and more-than-64
languages are disclosed; opaque IDs convey identity, never file authority.

Only explicit **Copy word** (primary Enter) calls the named API. It binds revision,
search handle, query, selected language, source snapshot, exact row ID and unchanged
canonical Unicode word; success requires every receipt field to match. The List
stays open and instructs manual paste. Searches, selection, language changes,
Reload, cancellation and mount never copy. No host file access, network, AI,
download or arbitrary clipboard payload exists in the presentation.

Copy reserves synchronously before publication and keeps the actual outstanding
promise fenced after caller timeout, query replacement, pop or disposal. Stale
selection/root query/root revision/frame/lifetime replies cannot report success
or replay. Unknown outcomes require a settled explicit read before a new explicit
Copy. A failed replacement read retains uncertainty even if the earlier clipboard
write might still complete; it never falsely reports that nothing was copied.
Every replaced/popped/disposed owned search is released, including transport/await
gaps and late valid replies. Release failure grants no effect authority.

Owned files: presentation, two tests, three fixture files, this report and eight
new PNGs. Copied package/lock/contracts/freeze and coordinator production routing,
main/preload, installed-data reader, status/task records and application evidence
are excluded. No staging or commits.

## Commands and evidence

Platform: Pop!_OS22.04 amd64, Node24.22.1/Bun1.4.4, React19.3.1,
Playwright1.64.1 Chromium/axe4.14.0. Private synthetic component fixture;
reduced motion; viewport1000x1000; 200% root text scaling in the scaled case.
Commands use `PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH`
and `BUN_TMPDIR=/tmp`. No security-disabling browser flags.

- `bun install --frozen-lockfile`: PASS. Restricted temporary-directory `EROFS`
  was followed by the authorized elevated install; shared lockfile unchanged.
- `LINUXCAST_TEST_FILES='["packages/builtins/dictionary/tests/presentation.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS49 focused cases, 660ms total /79ms test time on the final behaviour.
- `LINUXCAST_TEST_FILES='["packages/builtins/dictionary/tests/dictionary.ui.test.ts"]' node node_modules/@playwright/test/cli.js test --config scripts/test-runner/playwright.config.ts --workers=1`:
  PASS10 cases7.7s; eight affected captures, each with zero axe violations.
- Full `node node_modules/typescript/bin/tsc --project tsconfig.base.json --noEmit`
  and scoped ESLint over owned presentation/tests/fixtures: PASS.
- `python3 scripts/validate_plan.py` and `git diff --check`: PASS; planning checks
  establish documentation integrity only.

Initial unit assertions incorrectly assumed an unresolved automatic read had
already selected a language, and incorrectly forbade the safe status publication
which reenables recovery after actual clipboard settlement; corrected assertions
retain stale-success/no-replay checks. Initial type errors were widened test
literal inference, fixed with literal types. The restricted browser attempt could
not bind127.0.0.1; authorized elevated runs used normal sandboxed browser defaults.
Intermediate browser assertions missed the shared dirty-Form discard dialog and
treated a warning status as an alert; fixed and the complete suite rerun.
Coordinator review then identified the failed-read uncertainty wording issue;
fixed with a dedicated49th regression and complete final unit/browser reruns.
The final post-test source edit only corrects an inaccurate release comment.

Inspected final captures:

- `dark-dictionary-list.png`, `light-dictionary-list.png`: neutral shared List,
  selected identity, visible source/feature limits, focus and Copy footer.
- `dark-dictionary-language.png`: enum focus, current language, Apply and Cancel.
- `dark-dictionary-loading.png`: honest loading with no fabricated entry.
- `light-dictionary-empty.png`: available source with no matching base entries.
- `dark-dictionary-unavailable.png`: no installed sources and package guidance.
- `light-dictionary-copy-unknown.png`: retained rows, disabled Copy and explicit
  clipboard/reload recovery without optimistic success.
- `light-dictionary-200-percent-language.png`: scaled selector, instructions and
  both actions remain reachable and legible.

DESIGN.md sections: Tokens; Shell/navigation; Results/actions;
List/grid/detail/form; States/motion; Accessibility; Review gate. All eight PNGs
were inspected for dark/light contrast, focus, disclosure, overflow and privacy.
The fixture contains four manually authored public samples and visibly labels
simulated language/search/clipboard responses; it reads no installed dictionaries.

## Acceptance boundary

Partial L2-06-AC01: no automatic or unlicensed dataset download path is added;
real installed-source/licensing checks remain coordinator/data-lane evidence.
Partial AC02: exact Unicode receipt and manual-paste guidance; synthetic clipboard
replies do not prove native Copy. Partial UI: shared List/Form keyboard, relevant
states, text scaling and axe. Partial PRIVACY: synthetic public samples, fixed
safe errors, inert input and no source-path/generic-file/network authority.

All full L2-06 criteria remain pending. Actual registered root/backend/source
discovery/clipboard/restart/privacy evidence belongs to the coordinator. Complete
Hunspell spelling/StarDict definitions, dictionary/Emoji scope, native paste,
native AT/Orca/high contrast, Debian13 GNOME/KDE Wayland/X11, performance,
packaging/release and full local1.0 acceptance remain required.
