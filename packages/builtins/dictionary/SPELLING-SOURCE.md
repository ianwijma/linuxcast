# L2-06 — installed spelling source and native transport

Bounded application increment on PR73/develop `9ae4bc4`, isolated
`codex/dictionary-spelling-reader`. Owns only `src/installed.ts`, new
`src/native-spelling.ts`, `tests/spelling-source.test.ts`,
`tests/native-spelling.test.ts` and this report. Read with the complete L2-06 card,
PLAN, data/security/stack, built-ins, testing-release, DESIGN/tokens and
SPELLING-INCREMENT.md. Full local1.0, prerequisites and native/release gates remain
unfinished. This feeds the registered Dictionary application; it is not a completed
dictionary feature or standalone proof.

## Source interface and authority

`createInstalledDictionary({roots?,speller?})` retains existing `languages()` and
base-entry `search()` behaviour. Production omits trusted fixture `roots` and uses
only `/usr/share/hunspell` and `/usr/share/myspell/dicts`. The optional trusted
`speller.check({affFd,dicFd,word,signal})` receives the exact open descriptors of the
validated source pair. No renderer path, executable, encoding or native-resource
option is accepted. Missing speller is an explicit unavailable result.

`checkSpelling({languageId,word,signal})` returns `{language,snapshotId,word,correct,
suggestions,truncated,backend:'hunspell-1.7'}` only after the trusted engine settles
and both source files/roots still match. Input is one exact word: at most128 Unicode
scalars/256 UTF-16 units/512 UTF-8 bytes, no whitespace, controls, bidi formatting or
unpaired surrogates. Closed plain inputs/accessor/proxy checks precede discovery.
No normalization rewrites the input or native suggestions. Suggestions may contain
internal spaces, retain native order, and obey the frozen UTF-8/scalar/count,
uniqueness, trim/control/bidi and correct-result rules. Invalid replies fail safely;
they cannot become invented recognised words or empty-success fallbacks.

Each check pins the same existing approved directory/file descriptors and validates
the complete bounded UTF-8 aff/dic bytes before engine dispatch. It uses the base
reader's exact parser/source hash, so spelling and base search agree on snapshot
identity. Bounds remain1MiB affix/16MiB dictionary,500000 entries,8192-byte lines and
65536 affix lines. Existing symlink/regular-file/encoding/count/source-word policies
remain strict. Full spelling validation does not rely on a cached base-word result.

Descriptors stay open throughout engine work. Both descriptors, original aliases,
resolved targets and original/target roots are rechecked afterward; mutation,
replacement, root switch or symlink escape refuses the result. Cancellation before
dispatch does no engine work. Cancellation during a pending trusted callback keeps
the descriptors until that actual callback settles; the native transport supplies
its own mandatory kill/close behaviour. Source data and installed packages are
never written, downloaded, redistributed or converted. Existing safe fixed errors
omit native paths/content. Existing base-entry disclosure remains accurate for the
separate base-entry browsing view.

## Fixed native transport

`createNativeSpeller(absolutePackagedExecutable)` is trusted main assembly only.
Each check spawns exactly that executable with `['dictionary-spell']`, no shell,
and environment `{LANG:'C.UTF-8'}`. There is no inherited HOME, PATH, display,
session bus, credential or loader configuration. Exact source descriptors become
child FD3/4; per-call arguments contain no paths or native controls. Descriptor
regular-file/size checks occur before spawn.

The child must emit frozen framed JSON ready, receive one Check frame followed by
stdin EOF, then emit one result or failed frame and close. Frames have big-endian
32-bit lengths, fatal UTF-8 decoding and the existing strict JSON parser; duplicate
keys and nesting beyond64 levels are refused before schema validation. A result must echo the exact word and
`hunspell-1.7`; it requires clean exit0, complete stdout EOF and no extra/partial
bytes. A fixed failed code is accepted before ready for initialization failure or
after Check; it is returned only after actual close, including native exit1.
Malformed/unknown/extra/duplicate/mismatched/oversized output, missing terminal
reply and abnormal result exit fail closed. Native stderr is drained, counted and
discarded; its contents never enter errors or logs.

The request frame is at most4KiB. Combined stdout/stderr output is capped at64KiB.
The fixed three-second monotonic wall deadline and AbortSignal kill the worker with
SIGKILL. Even on spawn/error/abort/deadline paths the promise settles only after
the actual child `close` event, allowing the application to retain its read slot and
source descriptors until the process is gone. A late result cannot be replayed.
No CLI fallback, source mutation, personal dictionary or persistence is introduced.

The separate native module supplies libHunspell execution and required filesystem/
network/process containment. Controlled Node fixture children here intentionally
have no such containment claim. A real contained native binary was supplied by the
native lane, but full reader/native/application assembly and actual backend evidence
are coordinator-owned and were not executed by this source lane.

## Checks

Pinned prefix: `PATH=/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH BUN_TMPDIR=/tmp`.

- `bun install --frozen-lockfile`: PASS805 packages/88ms, unchanged manifests/lock.
  Initial sandbox run hit Bun temporary/cache EROFS; approved execution succeeded.
- `LINUXCAST_TEST_FILES='["packages/builtins/dictionary/tests/spelling-source.test.ts","packages/builtins/dictionary/tests/native-spelling.test.ts","packages/builtins/dictionary/tests/installed.test.ts"]' node node_modules/vitest/vitest.mjs run --config scripts/test-runner/vitest.config.ts`:
  PASS112 checks across3 files/4.62s total:33 new source cases,36 controlled-child
  transport cases,43 unchanged installed-reader cases. No unhandled errors.
- Direct pinned Node project TypeScript and scoped ESLint on four owned TypeScript
  files: PASS. Plan/whitespace checks recorded in the final manifest.

Source checks cover actual descriptor bytes/lifetime/closure, shared snapshot,
Unicode/combining/phrase suggestions, word bounds, absent/aborted engine, malformed
data, encodings, aliases/escapes, file/root replacements and mutation during work,
cached base-source revalidation, fixed errors and malformed callback receipts.
Transport tests use actual controlled child processes with public authored replies:
FD3/4/environment/mode/EOF validation, exact echoes, split/extra/truncated/invalid
UTF-8 frames, raw duplicate JSON fields, bounds, nonzero exits, explicit failed codes, delayed process close,
abort/deadline process death, monotonic delivery checks, missing executable and
invalid descriptor/input authority. These are not tests of Hunspell correctness.

Initial test work corrected generated fixture/type mistakes and a split-reply
fixture variable redeclaration. Sandboxed nested Node children exited without
executing the authored fixture, so final controlled-child execution used approved
normal execution; no production containment policy or transport validation was
relaxed. All tests above then passed. Independent native review found duplicate-key ambiguity in plain JSON.parse; the
transport now uses the existing strict contract parser, with two raw duplicate-key
regressions. No old tests/shared files/status/manifests,
staging, signing or commits were modified by this lane.

Platform: Pop!_OS22.04 amd64/Linux7.1.1-76070101-generic,
Node24.22.1/Bun1.4.4/Vitest4.1.12/TypeScript6.0.3.

## Partial acceptance and remaining limits

Partial AC01/privacy: fixed already-installed sources, no download/redistribution,
bounded descriptor authority, public fixtures, safe errors and no persistence or
network implementation. Partial AC02 input evidence: exact canonical Unicode and
ordered suggestions survive source/transport validation. No clipboard, renderer,
aggregate usage, real native engine correctness or native desktop result is
claimed from these source/controlled-child checks.

Coordinator/native/UI lanes still own real contained libHunspell validation,
registered check/suggestion/explicit Copy, cancellation/late effects, affected UI
captures, actual application privacy/lifecycle/restart and supported-backend states.
Full Hunspell language/encoding/affix/forbidden/compound compatibility, complete
StarDict/thesaurus/Emoji scope, prerequisites, Debian13 GNOME/KDE Wayland/X11,
Orca/native AT/high contrast/performance/package/release and complete local1.0
acceptance remain pending. Packaging must declare the real runtime library; an
existing packaging stub is not a completed dependency/release gate.
