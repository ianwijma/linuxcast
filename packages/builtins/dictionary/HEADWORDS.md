# L2-06 — installed Dictionary base-headword backend

Bounded application increment on PR69/develop `0696e1d`, isolated
`codex/dictionary-headwords-data`. Owned files: `src/installed.ts`,
`tests/installed.test.ts` and this report. Coordinator owns package/contracts,
main/preload/root/shared UI/clipboard/status integration. No dependencies, manifests,
lockfiles, shared/status files, staging or commits were changed by this lane.

## Application interface and behaviour

`createInstalledDictionary({roots?})` is Node-only. `roots` is trusted fixture
assembly only; production omits it and uses exactly `/usr/share/hunspell` and
`/usr/share/myspell/dicts`. No renderer paths, home scanning, network, downloads,
package installation or process execution. Host dictionaries are not redistributed.

- `languages()` returns `{languages:InstalledLanguage[],truncated:boolean}`;
  at most64 names in stable ASCII order. Each language has opaque ID, basename
  name, available/unsupported-encoding/invalid/unavailable state, optional bounded
  ASCII encoding and fixed safe guidance. No path or file content enters metadata.
- `search({languageId,query})` returns exact query echo, identical available-language
  metadata, source `snapshotId`, at most100 `{id,word}` records and honest truncation.
  Language IDs are `language:<64 lower hex SHA256>`, word IDs `word:<64 hex>` and
  snapshot IDs bare64 hex. Only discovered IDs select files. Unknown IDs fail.
- `InstalledDictionaryError` codes are invalid-request/unavailable/
  unsupported-encoding/malformed/changed, with fixed safe messages. Exported
  disclosure and missing-language package-manager guidance are application text.

Discovery inspects bounded paired-file and encoding/header metadata, reading at
most32 dictionary-header bytes per new source identity, rather than decoding every
installed dictionary per keystroke. Available means a readable UTF-8 file pair with
valid basic metadata; selected search still validates the complete source and can
fail safely on malformed entries. Valid unchanged sources return matching language
metadata from discovery/search. A single selected-source snapshot cache is checked
against current file identities; no persistence, background service or new index.

Selected parsing preserves exact UTF-8 source headwords before flags/morphology,
including escaped slash/backslash. It deduplicates exact words, preserves case and
combining sequences, normalizes only matching, ranks exact/prefix/substring matches
before the100 cap and uses deterministic lexical ties. IDs bind the exact paired
source snapshot and language. No affixes are synthesized, forbidden/compound flags
interpreted, definition produced or spelling correctness claimed. Source entries
bearing such flags remain visible as base entries with that explicit disclosure.

## Bounds and file safety

Production roots must be real directories. File symlinks resolve only to direct
paired children of the two approved roots; escapes, nested targets, dangling links
and special files are refused. Linux directory descriptors plus
`/proc/self/fd/<descriptor>/<name>` pin reads; O_NOFOLLOW/O_NONBLOCK and pre-open
regular-file checks refuse replacement links/special files. Descriptor/path
inode/device/size/mtime/ctime and root identity are verified before and after reads;
paired files remain open until both snapshots are checked. Changing/replaced data
fails rather than returning partial or stale source words. This is a bounded Linux
reader using existing Node APIs, not a general filesystem capability.

Limits:2 fixed/injected roots;2048 directory entries per root;64 languages;
1MiB `.aff`/16MiB `.dic`;500,000 declared entries;8192-byte lines;65,536 affix lines.
Oversized files are rejected from stat before allocation. Reads allocate at most
recorded size+1 and verify actual length. Count headers must match selected-source
entry lines. Only explicitly declared UTF-8/UTF8 is decoded, fatally; other encodings
have actionable UTF-8 package guidance, never replacement conversion. Words are
nonempty, <=128 Unicode scalars/512 UTF-8 bytes with no whitespace/control/bidi/
unpaired surrogate. Queries are <=512 UTF-16 units/2048 bytes and reject control/
bidi/unpaired surrogate before filesystem discovery. Extra/accessor input fields
are rejected without invoking getters. Errors expose no native paths/content.

## Validation and installed observation

Pinned prefix: `PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH BUN_TMPDIR=/tmp`.

- `LINUXCAST_TEST_FILES='["packages/builtins/dictionary/tests/installed.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS43 cases, final0.363s total. Synthetic temporary fixtures cover canonical
  Unicode/combining words, flags/escaped slash, BOM/CRLF, deterministic dedup/ranking/
  cap, missing roots/pairs, unsupported encoding, malformed counts/entries/UTF-8,
  word/line/file/language limits, metadata-only discovery, genuine zero-entry source,
  root/file symlinks/escapes/special files, changed-file/alias races, safe read-error
  handling, input/path authority and snapshot/ID refresh.
- Direct pinned Node project compiler and scoped ESLint: PASS.
  `python3 scripts/validate_plan.py` and `git diff --check`: PASS.
- Read-only Node invocation of the installed backend, additionally parsed with
  coordinator `dictionaryCatalogueSchema`/`dictionaryBackendSearchSchema`: PASS.
  Host discovery:63 languages, truncated=false;38 available,6 unsupported encoding,
  19 invalid basic metadata. `en_US` available UTF-8; installed `.dic` header79,013
  and860,381 bytes were observed without copying the file. Query `hello` returns3
  literal substring matches, canonical `hello` first, truncated=false. Source snapshot
  `20beec8a5247a353523aa40f58509082a814e602c851aadf19e629449a5b41d7`.

Platform: Pop!_OS22.04 amd64/Linux7.1.1-76070101-generic; Node24.22.1/Bun1.4.4,
ordinary read-only installed system files and synthetic temporary fixture files.
No installed data files or full source arrays are committed as fixtures/artifacts.
Initial zero-entry fixture incorrectly wrote an extra blank entry, and an
intermediate compiler narrowing error occurred during metadata-only refactoring;
both were fixed before final tests/compiler pass. No production/shared workaround.

## Acceptance limits

Partial L2-06-AC01: discovers only already installed data, no silent/unlicensed
redistribution/download and explicit missing/unsupported language guidance. This
check does not audit every installed package's licence. Partial PRIVACY: fixed-root
read authority, bounded metadata, safe errors, public synthetic fixtures and no
network/history/logging implementation. DESIGN List/Form/states/accessibility
presentation and canonical clipboard effects are coordinator-owned application work.

Full AC01/AC02/UI/PRIVACY/native gates remain pending: complete Hunspell affix/
forbidden/compound checking, configured StarDict definitions/thesaurus, full
language/encoding support, explicit Copy/manual-paste integration and usage/privacy
runtime evidence, Debian13 GNOME/KDE Wayland/X11/native AT/Orca/high contrast,
performance/package/release, full prerequisites and complete local1.0 acceptance.
This reader must feed the registered application flow; it is not a standalone proof
or completed dictionary feature.
