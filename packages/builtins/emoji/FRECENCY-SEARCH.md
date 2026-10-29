# L2-06 — Emoji favourite and frecency search ordering

Bounded application search increment on PR72/develop `c881a662a66b5eecb0014e57eeafee70920c42f3`,
isolated `codex/emoji-frecency-search`. Ownership is only `src/search.ts`, new
`tests/frecency-search.test.ts` and this report. Coordinator owns frozen contracts,
existing settings CAS, main/preload/UI/root assembly and acceptance status. Integrated
shell/storage/UI are used under approved unfinished increments; L1-01/D1-02/L2-06
remain in progress. Full local1.0 scope and release gates are unchanged.

## Main-owned input and behaviour

`searchEmoji` adds optional `favouriteIds:readonly string[]` and
`frecency:{entries:readonly {id:string,useCount:number,lastUsedAt:string}[],now:number}`.
These are trusted-main snapshots, never renderer ranking arguments. `ids` retains
its existing subset-filter meaning; `favouriteIds` ranks matching entries without
excluding other matches. Omitted/empty ranking inputs preserve ordinary search.
Own `undefined` is invalid. Pause/resume/storage availability policy is main-owned:
omit frecency when paused/unavailable; this helper never reads a clock or setting.

Sorting is lexicographic: existing match relevance first; favourite boolean next;
then descending `useCount / (1 + max(0, now - lastUsedAt) / 604800000)`; finally pinned
Unicode source order. Canonical exact glyph/name/alias relevance still outranks
weaker boosted matches. Future timestamps receive zero age, not a score bonus.
Missing usage has score0. Equal scores retain source order. Group, tone, favourite
subset and custom text/glyph matching stay intact, and ranking/filtering happen
before the result cap. A late source entry can enter the first20/100 results without
changing its identity or Unicode value.

Both ranking snapshots use descriptor-safe plain data copying: no getters, proxies/
revoked proxies, exotic prototypes, sparse arrays, extra/symbol properties or coercion.
Null-prototype records remain supported. Favourite IDs and frecency IDs must be
sorted, unique, canonical known IDs across all3944 source entries. Frozen shared
schemas enforce <=4096 IDs/entries and <=512KiB encoded usage, integer counts1..1e9,
and canonical UTC ISO timestamps including milliseconds. The clock must be a finite
safe-integer millisecond number. Invalid timestamps/counts/unknown IDs/own undefined
fail with the existing fixed safe EmojiInputError before matching normalization,
segmentation or score calculation. Incremental encoded size checks bound allocation;
there is no silent truncation. No input content appears in error messages.

Validated usage is copied/frozen for that call; input snapshots, source data and
canonical values are not modified or retained between calls. Results remain frozen
arrays of the existing frozen Emoji objects, without usage fields. No events,
queries, files, network, processes, clipboard effects, usage increments or persistence
are added here. Only coordinator's confirmed explicit Copy may update aggregates;
UI/storage deadlines/unknown/replay/privacy/reset behaviour are outside this helper.

## Validation

Pinned prefix: `PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH BUN_TMPDIR=/tmp`.

- `bun install --frozen-lockfile`: PASS805 packages/83ms using existing pins; no
  manifest or lock changes. Initial sandbox attempt hit Bun temporary-directory
  EROFS; normal approved execution of the same frozen command succeeded.
- `LINUXCAST_TEST_FILES='["packages/builtins/emoji/tests/frecency-search.test.ts","packages/builtins/emoji/tests/search.test.ts","packages/builtins/emoji/tests/custom-keywords-search.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS157 checks across3 files,1.76s total/2.52s summed parallel test time. New64
  checks plus unchanged existing search/custom-keyword regressions. Covers real
  source entries beyond cap, relevance priority, favourite tiers, fixed-time
  seven-day decay/older-vs-recent comparisons, future clamp/equal-score ties,
  explicit-clock reranking, complete3944-entry snapshot/order, pre-cap group/tone/
  subset filters, Unicode/glyph custom aliases, canonical identity/no mutation,
  omission/empty compatibility, scalar count/time bounds, malformed/unknown/
  duplicate/unsorted snapshots, dates/counts/clock/undefined, safe redacted errors,
  getters/proxies/revoked proxies/extra array authority and rejection before matching.
- Direct pinned Node `tsc --project tsconfig.base.json --noEmit`, scoped ESLint on
  the two owned TypeScript files, `python3 scripts/validate_plan.py` and
  `git diff --check`: PASS.

Fixtures contain authored public phrases and deterministic synthetic counts/times
against the pinned canonical dataset. No user usage or dataset additions. Platform:
Pop!_OS22.04 amd64/Linux7.1.1-76070101-generic; Node24.22.1/Bun1.4.4. No Electron,
native clipboard, desktop or new screenshots were run by this search lane. Existing
search tests, shared contracts, dataset, manifests/lock, status and PNGs are unchanged.
No staging, signing or commits. Exact three-file binary patch and SHA256 manifest
accompany delivery; actual application assembly remains coordinator work.

## Partial acceptance and remaining limits

Partial AC02 input evidence: favourite/frecency/custom matches preserve canonical
Unicode/copy objects; pure search checks do not prove native Copy/Paste. Partial
PRIVACY evidence: bounded main-only snapshots, public synthetic fixtures, fixed safe
errors, no effects/logging or returned usage fields. No new dictionary AC01/licence
claim or dataset download. UI/native capability success/denial/unsupported/unknown,
pause/resume/reset persistence, global usage Clear, explicit Copy-only counting and
ordinary export exclusion require coordinator's boundary/storage/UI/actual checks.

Full L2-06 remains pending: complete Dictionary Hunspell/StarDict/thesaurus support,
full Emoji/native paste/explicit global-provider semantic lookup, complete encrypted
backup coverage, full prerequisites, Debian13 GNOME/KDE Wayland/X11/native AT/Orca/
high contrast/performance/package/release and complete local1.0 acceptance. This
search implementation feeds the application ranking flow; it is not a complete
feature or standalone proof increment.
