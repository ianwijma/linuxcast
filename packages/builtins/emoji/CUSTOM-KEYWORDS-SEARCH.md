# L2-06 — custom Emoji keyword matching

Bounded application search increment on PR70/develop `13d8eb6`, isolated
`codex/emoji-keywords-data`. This lane owns only `src/search.ts`, the new
`tests/custom-keywords-search.test.ts` and this report. The coordinator owns the
frozen keyword contracts and actual editing/storage/main/preload/UI integration.
Existing L1/D1/storage/application paths are used under authorized unfinished
increments; full dependencies, task and local1.0 acceptance remain pending.

## Internal application interface

`searchEmoji` adds optional `customKeywords: readonly {id:string, keywords:readonly
string[]}[]`. It is a main-owned preference snapshot, never a renderer search
argument. Omission or `[]` restores ordinary search; own `undefined` is invalid.
No file/network/process/storage/clipboard/usage effect or external dependency is
introduced. Node `util.types.isProxy` rejects proxies before inspecting them; this
helper remains Node/main-only and is not imported by renderer UI.

The snapshot is copied from plain data descriptors before schema validation or
matching normalization. Getters, proxies/revoked proxies, nonplain prototypes,
sparse/extra array properties, extra object keys, symbols and malformed values
are refused without executing input code. IDs must be sorted, unique and known in
the complete3944-entry pinned source. Empty per-entry keyword lists are not a stored
snapshot entry; clearing removes that entry or supplies an empty whole snapshot.
The frozen shared schema enforces at most4096 entries/512KiB canonical encoded
snapshot,16 unique phrases per entry,64 scalars/256UTF8 bytes per phrase, no empty/
punctuation-only text, leading/trailing whitespace, controls/bidi/surrogates or
Unicode line/paragraph separators. Encoded size is bounded incrementally before
matching, rather than silently truncating a snapshot. Rejections retain the fixed
safe `EmojiInputError`, with no input content in its message.

Custom phrase words join source names, aliases and keywords for all-term prefix
matching. Text uses the existing NFKD/case/combining-mark matching normalization;
stored phrases and source Unicode are not rewritten. Each query glyph may match
the canonical source value or a literal glyph in an assigned custom phrase.
Emoji-only and mixed glyph/text aliases therefore work for a different entry.
Exact custom phrase/glyph matches share public-keyword rank3; exact canonical glyph
retains rank0, name/alias ranks remain unchanged. Exact custom phrases preserve
word/glyph order. Ties preserve pinned Unicode source order. Group, tone and
favourite-ID subset filters always apply to the actual source entry before the
100-result cap, even if an alias contains another category or tone's glyph.

Results remain frozen arrays of the existing canonical frozen Emoji objects.
Neither dataset nor caller snapshots are changed or retained across calls. The
search does not return user phrases as dataset keywords, synthesize Unicode/tone
variants, change copy authority, or write preferences. Main owns current-revision/
selection/source validation and persistence; the shared UI owns explicit Save,
Cancel, unavailable/unknown states, lifecycle and deliberate Copy.

## Validation

Pinned prefix: `PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH BUN_TMPDIR=/tmp`.

- `LINUXCAST_TEST_FILES='["packages/builtins/emoji/tests/custom-keywords-search.test.ts","packages/builtins/emoji/tests/search.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS93 checks across2 files,1.53s total/1.49s tests. The existing source/search
  tests are unchanged. New authored checks cover phrase assignment, cross-field
  all-term matching, Unicode/combining/fullwidth text, emoji-only/mixed/keycap/VS
  aliases, exact-rank/source-order ties, glyph placement, real group/tone/subset
  filtering, complete3944-ID snapshot, >100 matches/pre-cap filters, clearing,
  immutable canonical results/no retained caller state, exact phrase/list bounds,
  encoded snapshot overflow, malformed/unknown/unsorted/duplicate/undefined values,
  control/line separator rejection, getters/proxies/revoked proxies and refusal
  before matching normalization. Fixtures contain public authored phrases only.
- Direct pinned Node `tsc --project tsconfig.base.json --noEmit` and scoped ESLint
  on the two changed TypeScript files: PASS.
- `python3 scripts/validate_plan.py` and `git diff --check`: PASS.

Platform: Pop!_OS22.04 amd64/Linux7.1.1-76070101-generic; Node24.22.1/Bun1.4.4.
No Electron/desktop/native clipboard scenario or screenshots were run by this
search lane. No old tests, datasets, PNGs, manifests, shared contracts or status
were edited; no staging or commits. Exact three-file binary patch and SHA256
manifest accompany the delivery.

## Partial acceptance and remaining work

Partial AC02 input evidence: custom matches preserve canonical Unicode/copy values;
these pure tests do not establish native Copy/Paste. Partial PRIVACY evidence:
public authored fixtures, no diagnostics/content logging or effects, fixed safe
errors and no source mutation. This adds no dictionary dataset download or new
AC01 dictionary/licence claim. UI and full actual editing/search/restart/persistence/
unknown/denial/usage/privacy evidence belongs to coordinator integration.

Full L2-06 remains pending: complete Dictionary Hunspell/StarDict/thesaurus support,
Emoji frecency/native paste/explicit provider-configured semantic lookup, full
prerequisites, supported Debian13 GNOME/KDE Wayland/X11/native AT/Orca/high contrast,
performance/package/release and complete local1.0 acceptance. This is an application
search implementation feeding the explicit keyword-edit flow, not a completed
Emoji feature or standalone proof.
