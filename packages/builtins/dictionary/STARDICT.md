# L2-06 — selected local plain StarDict definitions reader

Bounded application implementation on PR70/develop
`13d8eb63be2e3ccd0c3c69c2d42914be0c356bb8`, isolated
`codex/dictionary-definitions-data`. Owned files: `src/stardict.ts`,
`tests/stardict.test.ts` and this report. Coordinator owns native chooser/confirmation,
configuration/storage, main/preload/issued contexts, shared UI/root and task status.
No dependencies, manifests, lockfiles, shared/status files, staging or commits were
changed by this lane. The reader feeds that application flow directly.

The supplied [official StarDict format specification](https://github.com/huzheng001/stardict-3/blob/master/dict/doc/StarDictFileFormat)
was read directly. This implementation supports normal2.4.2/3.0.0 metadata,
network-byte-order index offsets/sizes, duplicate headwords and plain UTF-8 meaning/
phonetic fields. It accepts uncompressed pairs and common gzip/dictzip pairs, with
same-type sequences or explicit per-entry types. The final same-type field has no
terminator; explicit fields require their terminators. These format facts do not
claim complete StarDict compatibility.

## Small application interface

`openStarDictSource({ifoPath})` is Node-only trusted assembly: only main receives
the native chooser's explicit absolute `.ifo` path. No renderer path, filesystem
grant, directory crawl, user-home scan, download, network, process or resource read.

- `metadata` is frozen `{id,name,wordCount,snapshotId}`; source object is frozen too.
  IDs are `stardict:<64 lower-hex SHA256>` and bare64-hex snapshot. Snapshot binds
  exact selected metadata/index/data bytes, including compressed bytes when used.
- `search({query})` returns exact query echo, <=100 `{id,word}` records and honest
  `truncated`. IDs are `entry:<64hex>`, binding snapshot/ordinal/word/offset/size.
  Duplicate source words retain distinct entry IDs and definitions. Search ranks
  exact source spelling, normalized equality, prefix then substring, using stable
  source order for ties. Normalization affects matching only; Unicode words/text
  and ordinary phrase spaces are preserved.
- `definition({id})` returns exact `{id,word,parts:[{kind,text}]}`. Meaning `m` maps
  to meaning, `t`/`y` to phonetic. Literal punctuation/HTML-looking text in a plain
  field remains inert text for the coordinator's escaped plaintext Detail UI.
  No Copy/Paste, source execution or guessed definition is performed here.
- `close()` is idempotent, releases held descriptors and drops source-data/index
  references. Later and pending reads refuse after close. Search/definition recheck
  held file/directory identity each call; a changed source remains unavailable until
  main explicitly opens it again.
- `StarDictError` uses fixed safe invalid-request/unavailable/unsupported-format/
  malformed/changed/closed messages. No source paths, parser contents or native
  errors are returned. Metadata exposes only public book name/count/opaque IDs.

Declared unsupported same-type sequences fail open; unsupported explicit entry
fields fail the requested definition without returning partial supported fields.
Locale encodings, markup/media/resource fields, plugin/tree/storage formats and
synonym/thesaurus expansion are unsupported. `.syn`, `res/` and other optional
files are never read. `STARDICT_DISCLOSURE` exposes this limitation for the host UI.
Empty genuine sources and empty source fields are not filled with invented text.

## Bounds and source safety

Only the selected directory's exact matching `.ifo`, `.idx` or `.idx.gz`, and
`.dict` or `.dict.dz` leaves are considered. Both variants present is an explicit
unsupported ambiguity, not guessed precedence. Same-directory file links may
resolve to matching-suffix leaves; escapes/nested targets/special files are refused.
A held directory descriptor pins reads through `/proc/self/fd`, with O_NOFOLLOW/
O_NONBLOCK and regular-file/size checks before allocation. Source and directory
inode/device/size/mtime/ctime/path checks run before and after initial loading and
again before each public read. All failed opens release acquired descriptors.

Limits:64KiB `.ifo`;16MiB decoded index;250,000 entries;64MiB decoded data;
32MiB per compressed input. Built-in asynchronous Node gunzip uses maxOutputLength;
truncated/corrupt streams and output bombs fail without partial results. No external
compression tool or dependency. Whole source buffers stay in trusted Node.

Metadata requires normal magic/version and bookname/wordcount/idxfilesize, unique
option keys and final newline. Index bytes and declared count must agree exactly;
32/64-bit offsets remain safe integers and offset+size stays inside decoded data.
Index ordering follows ASCII-case comparison then UTF-8 byte ties; duplicate words
and shared definition offsets are allowed. Words are <=128 scalars/255 UTF-8 bytes,
nonblank and without control/bidi/invalid Unicode. No malformed UTF-8 replacement.
Queries are <=512 UTF-16 units/2048 bytes; selected paths <=4096 units/bytes; getters,
extra fields and malformed input bounds are rejected before file access; entry IDs
resolve only within the selected snapshot.

Each definition has <=32 plain parts/64KiB total UTF-8 text; encoded entry overhead
is also bounded. LF/CR/tab are preserved, other controls/bidi/invalid Unicode are
refused. Entry parsing is on demand, so a source with unsupported explicit fields
may be searchable but the affected definition fails visibly. Main owns caller
monotonic deadlines/actual read slots and must close late stale open results;
this reader does not claim that regular filesystem I/O has a hard wall-clock bound.

## Validation and limits

Pinned prefix: `PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH BUN_TMPDIR=/tmp`.

- `LINUXCAST_TEST_FILES='["packages/builtins/dictionary/tests/stardict.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS61 cases, final0.630s total/0.461s tests, zero unhandled errors. Includes eight
  real binary32/64-bit plain/gzip/dictzip-RA combinations, Unicode/phrases/combining
  words, duplicate senses/shared offsets, exact ranking/cap, metadata/word/index/
  offset/definition/part limits, unsupported fields/tree/resources, optional files
  not read, invalid UTF-8/control text, compressed-input/output/truncation bounds,
  paired ambiguity/escapes/special files, read mutation/revalidation, descriptor
  cleanup, close-during-read and malformed/getter/path authority checks.
- Direct pinned Node project compiler, scoped ESLint, plan validator and
  `git diff --check`: PASS.

Fixtures are authored synthetic words/definitions and generated binary/compressed
files in removed temporary directories; no dictionary dataset is redistributed.
Platform: Pop!_OS22.04 amd64/Linux7.1.1-76070101-generic, Node24.22.1/Bun1.4.4.
The first test run's close-during-read rejection observer attached too late and
Vitest reported an unhandled rejection despite passing assertions. The test was
fixed to observe before close; final run has no unhandled error. No shared or
production workaround.

Partial AC01: explicitly selected local files only, no silent download or dataset
redistribution; no licence audit of a user's chosen source. Partial PRIVACY: exact
source scope, bounded output and fixed safe errors, synthetic fixtures/no source
paths in returned metadata. Coordinator integration owns chooser consent, persistent
private configuration/export exclusion, issued API/read lifecycle and plaintext UI.
AC02/whole UI/native acceptance are not established by these reader tests.

Full L2-06/local1.0 remains pending: complete Hunspell checking, full StarDict/
locale/markup/media/resource/tree/synonym/thesaurus support, semantic features,
native paste, complete prerequisites, Debian13 GNOME/KDE Wayland/X11/native AT/Orca/
high contrast/performance/package/release. This is a bounded application slice,
not a standalone proof or completed Dictionary feature.
