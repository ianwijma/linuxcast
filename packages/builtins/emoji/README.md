# Emoji dataset and local search — L2-06 increment

This is the offline data/search component of the registered Emoji → search →
keyboard selection → explicit Copy application increment. The coordinator owns
launcher registration, IPC, the shared shell/grid, clipboard handling and task
status. This component does not establish desktop copy, paste or accessibility
acceptance by itself. It adds no runtime download, dictionary installation,
provider call, query history, permissions or persistence.

Read with [L2-06](../../../docs/implementation/tasks/L2-06.md),
[PLAN](../../../docs/PLAN.md), [built-ins](../../../docs/product/builtins.md),
[data](../../../docs/architecture/data.md),
[security](../../../docs/architecture/security.md) and
[testing/release](../../../docs/implementation/testing-release.md).
The application flow must use the existing shared primitives and
[design system](../../../docs/design/DESIGN.md), particularly Shell and navigation,
List/grid/detail/form, States and motion, Accessibility and Review gate, plus
[tokens.json](../../../docs/design/tokens.json).

L1-01 and D1-02 have integrated application/shared UI code; their full acceptance
remains unfinished. This bounded increment does not mark those dependencies,
L2-06, dictionary, emoji or full local 1.0 complete. Dictionary discovery and
missing-language guidance, tone-selection UI, custom keywords, favourites,
frecency, paste/fallback, grid density and optional explicitly invoked semantic
AI remain required task scope. Tone sequences are present in the dataset.

## Fixed data and license

The fixed Emoji **17.0** catalogue contains **3,944 fully-qualified** entries in
the exact order of Unicode's `emoji-test.txt`: nine nonempty groups and 98
subgroups. It excludes the file's minimally-qualified, unqualified and standalone
component rows. This is a release pin, not a newest-version claim.

English keyword/short-name metadata comes from official **CLDR 48**, tag
`release-48`, commit `acd6d88ae493633240e19a87a721076a8a75c310`.
The [CLDR 48 release notes](https://cldr.unicode.org/downloads/cldr-48) explicitly
identify Unicode 17 names and search terms. All 3,944 catalogue entries have
CLDR English keywords and a short name; 108 have an alternate CLDR short name
different from the Unicode test-file name.

The source bytes and copyright notices remain unchanged in `data/`. They use
**Unicode-3.0**; retain both
[Unicode's notice](data/LICENSE-UNICODE.txt) and
[CLDR 48's notice](data/LICENSE-CLDR-48.txt) with redistribution. The former is
the exact checksum-pinned license snapshot retrieved on 29 October 2026, not a
separately versioned Emoji data file. Linuxcast application code remains under
the repository's GPL-3.0-only license.

Only these five primary upstream files were obtained:

| Bundled source | Exact upstream source | SHA-256 |
| --- | --- | --- |
| `emoji-test-17.0.txt` | [Unicode 17.0.0 Emoji test data](https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt) | `1d8a944f88d7952f7ef7c5167fef3c67995bcae24543949710231b03a201acda` |
| `cldr-en-48.xml` | [CLDR English annotations at pinned commit](https://raw.githubusercontent.com/unicode-org/cldr/acd6d88ae493633240e19a87a721076a8a75c310/common/annotations/en.xml) | `8511aadd046fdba2f0ffe590266ced8bbf48175ad139b2675d85d7141057b235` |
| `cldr-en-derived-48.xml` | [CLDR derived English annotations at pinned commit](https://raw.githubusercontent.com/unicode-org/cldr/acd6d88ae493633240e19a87a721076a8a75c310/common/annotationsDerived/en.xml) | `d76bd041c8c9e7b00b716aff8b7d9dbf509877010e191d5efd068be2553e066e` |
| `LICENSE-CLDR-48.txt` | [CLDR license at pinned commit](https://raw.githubusercontent.com/unicode-org/cldr/acd6d88ae493633240e19a87a721076a8a75c310/LICENSE) | `b4c0ae8ef04f7059f96ce5bbe0467f9fe6f6d81bbe13517701dfeb961fb4d0b6` |
| `LICENSE-UNICODE.txt` | [Unicode license](https://www.unicode.org/license.txt) | `e7a93b009565cfce55919a381437ac4db883e9da2126fa28b91d12732bc53d96` |

The generated `data/emoji-17.0.json` SHA-256 is
`7fd94960ff2db3f69258d2cea7492cb11015efd6cc12b75d4d2254ac5a36beac`.
[provenance.json](data/provenance.json) also records source byte sizes, exact URLs,
release pins, counts and this generated-data checksum.

The deterministic derivation keeps only `fully-qualified` source rows and copies
the source name, group, subgroup and `E` introduction version. It constructs
`value` directly from the source code points and `id` from the lowercase source
hex tokens, including minimum-four-digit padding (`emoji:0023-fe0f-20e3` for #️⃣).
It joins each row to CLDR through the value with U+FE0F removed **only for the
join key**, as specified in the CLDR source header. It splits CLDR keywords at
` | ` and retains a differing CLDR `tts` short name in `aliases`. Source Unicode
values retain every VS16, ZWJ, modifier, regional indicator and tag scalar.
Tests independently compare the complete generated catalogue and all English
metadata against these bundled sources; no build-time network is required.

## Pure module boundary

`src/data.ts` exports `Emoji`, `EmojiGroup`, `emojiData`, `emojiGroups`,
`getEmojiGroups()`, `getEmoji(id)`, `EmojiInputError` and the two release constants.
Every record, nested keyword/alias array, category and public array is frozen.
`getEmoji` returns `undefined` for an unknown well-formed canonical ID and throws
the fixed `EmojiInputError` (`code: 'invalid-request'`) for a malformed ID.
IDs are case-sensitive `emoji:` plus 4–6-digit lowercase hexadecimal chunks,
at most 128 UTF-16 units. Dataset lookup remains the authority for Copy.

Each `Emoji` has `id`, exact canonical `value`, `name`, `group`, `subgroup`,
`version`, `keywords` and `aliases`. `version` is the entry's Emoji introduction
version (for example `0.6` or `17.0`), not the catalogue release. Category IDs and
names use the exact official group names; categories include entry counts.

`src/search.ts` exports `searchEmoji({query, group?, limit?})` and
`EmojiSearchInput`. A result is a frozen array of canonical `Emoji` records.

- Query must be a string of at most 512 UTF-16 units and 2,048 UTF-8 bytes, with
  no `Cc` control characters or `Cs` unpaired surrogates. Length is checked before
  UTF-8 allocation, normalization or grapheme segmentation. ZWJ, VS16, combining
  characters and emoji flag tags remain valid.
- Optional `group` must be one of the nine exact category IDs. Optional `limit`
  is an integer from 1 through 100, default 20. Unknown fields, non-plain objects,
  accessors, unknown categories and invalid limits throw the same fixed error;
  errors contain no submitted query.
- Empty/space-only queries browse in Unicode source order. Text uses NFKD,
  lowercase and diacritic folding for matching only. Punctuation separates word
  tokens, except signed numeric keywords such as `+1` and `-1`. Every token must
  prefix a word in the name, alternate English name or English keywords.
- Literal emoji graphemes must all occur in the same result. They may accompany
  word tokens (`👩🏽‍💻 developer`). Glyph matching tolerates omitted VS16 while
  still returning the complete fully-qualified copy value. Emoji are separated
  from text before normalization so characters such as ㊗️ retain literal matches.
- Relevance orders an exact glyph, exact name, exact alias, exact keyword, name
  prefix and then other token matches. Ties retain pinned source order. There is
  no implicit frecency, random ordering, regex execution or online interpretation.

The synchronous search imports only the generated JSON and the owned data
module. It uses no Node API, I/O, provider, shell, SQL or runtime network. Rendering
support depends on installed fonts; canonical data/search success does not prove
that a desktop font paints every Emoji 17 sequence as one glyph.

## Verification and limits

With pinned tools on PATH and `BUN_TMPDIR=/tmp`:

```sh
LINUXCAST_TEST_FILES='["packages/builtins/emoji/tests/search.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts
node node_modules/eslint/bin/eslint.js packages/builtins/emoji/src/data.ts packages/builtins/emoji/src/search.ts packages/builtins/emoji/tests/search.test.ts --max-warnings 0
node node_modules/typescript/bin/tsc --project tsconfig.base.json --noEmit
python3 scripts/validate_plan.py
```

The 22 focused tests pass, including source checksums/full notices, exact 3,944-row
coverage/order/IDs/copy values, every glyph's exact search/get round trip, all CLDR
keyword/alias mappings, group counts, flags/keycaps/ZWJ/tone/combining searches,
literal token matching, bounds and invalid input, safe errors and mutation
resistance. Full TypeScript and scoped ESLint pass. These checks ran on
Pop!_OS 22.04 amd64, Node 24.22.1/Bun 1.4.4; they are pure component/data evidence.
The coordinator records the integrated application checks separately. Debian 13,
GNOME/KDE Wayland/X11, native clipboard/paste, native assistive technology, high
contrast, full L2-06 and release acceptance remain pending.
