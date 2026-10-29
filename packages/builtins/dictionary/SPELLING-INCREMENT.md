# L2-06 — installed-language spelling application increment

Base PR73/develop9ae4bc4. Read full docs/implementation/tasks/L2-06.md, PLAN,
architecture/data.md/security.md/stack.md, product/builtins.md, testing-release,
DESIGN.md+tokens. Existing L1/D1/storage/UI integrated under approved unfinished
increments; native/full prerequisite/release acceptance not claimed. Full1.0 kept.

Registered Dictionary → explicit Check spelling shared Form using currently
selected installed language → enter one literal word → explicit Check spelling
(read only) → shared recognised/suggestion List → explicit Copy selected canonical
suggestion. Back/Cancel retains base query/language/selection; Hide/restart drops
word/results; no automatic typing requests, clipboard, persistence or network.
Correct result offers the exact original recognised word; bad spelling offers
up to32 unique native suggestions in native order, including internal spaces.
Empty suggestions honest, unavailable/unsupported/changed source not a bad-word
success. Suggestions are text, never links/HTML/instructions. Copy is not Paste.

Frozen named wire packages/contracts/src/dictionary-spelling.ts. Input revision,
fresh randomUUID requestId, opaque languageId, single word. Request UUID belongs
to that one invocation and is never reused across reopen. Server checkId binds
source snapshot/word/issued records/owner/frame/generation. Copy exact echoed
context+server checkId/snapshot/id, main uses issued text only and fresh source
validation before clipboard. Release revision/requestId cancels pending or
releases only that owner/frame invocation; late releases cannot affect new UUID.
No renderer filenames/raw dictionary arrays/native resource knobs. Readslots4,
actual write reservation survives timeout/Hide/late settlement, noreplay. Invalid/
denied/read-only phases no aggregate usage; only actual confirmed Copy records
existing linuxcast:dictionary aggregate once. Main/source changes conservative.

Backend existing createInstalledDictionary gains optional trusted speller option:
speller.check({affFd:number,dicFd:number,word:string,signal:AbortSignal}) ->
Promise<{correct:boolean;suggestions:string[];truncated:boolean;backend:'hunspell-1.7'}>.
New backend checkSpelling({languageId,word,signal}) -> Promise<{language,
snapshotId,word,correct,suggestions,truncated,backend}>. Reader owns fixed approved
system roots, pins current aff/dic descriptors, validates same bounded UTF8 data
and same snapshot hash as existing base reader, awaits engine then rechecks both
files/roots before returning. No source modification or personal dictionary.
Main's Copy validates fresh existing backend.search({languageId,query:''}) source
snapshot against issued spelling snapshot, no second spelling effect needed.

Native transport createNativeSpeller(absolutePackagedExecutable).check(input) in
native-spelling.ts. Fixed spawn executable ['dictionary-spell'], sanitized env
LANG=C.UTF-8, no HOME/DBus/display/credentials/LD_LIBRARY_PATH. Pass exact aff/dic
FDs as childFD3/4; no input in argv. Bounded big-endian framed JSON matching frozen
native schemas. Worker ready, one Check frame, one result/failed, EOF; parent ends
stdin after request. Reject extra/malformed/mismatched/oversized frames, response
must echo exact word/backend. Parent cap64KiB reply/4KiB request, deadline3s,
AbortSignal immediate kill, waits actual child close before releasing readslot;
stderr drained/bounded redacted never returned/logged. No shell/CLI fallback.

Add one operation to existing native/platform Rust helper; parent owns main.rs/
lib.rs operation routing only (agents supply module). Module dictionary_spelling.rs
run_stdio() -> Result<(), ...>, one fixed mode. Existing serde/serde_json/libc/
protocol crates only, no new dependency/manifest/lock/buildsystem. Dynamic fixed
system libhunspell-1.7.so.0 C API (create/destroy/spell/get_dic_encoding/suggest/
free_list), no get_library_version requirement (absent1.7.2). Child copies bounded
regular inherited aff<=1MiB/dic<=16MiB into sealed memfds, validates stat snapshots,
CAPI sees only fixed /proc/self/fd paths; never original paths or queried files.
Require filesystem restriction (Landlock may deny all ambient FS while allowing
these memfds) and deny network/exec/descendants/mutation via narrow seccomp;
fail closed unavailable if containment cannot apply. No fallback or extra
sandbox-framework/research lane. Resourcecaps core0,AS<=512MiB,CPU<=2s,FD<=32;
parent wall deadline3s. Bound word128scalars/256UTF16/512UTF8, controls/bidi/space
refused. Suggestions<=32unique/native order, each<=256scalars/512UTF16/1024UTF8,
valid UTF8/no controls/bidi/trim whitespace, total<=64KiB; no text truncation.
Worker stores no input/logs/files and never calls add/remove/save dictionary APIs.
Report unavailable library/encoding/containment with safe fixed errors.

Native source reference https://github.com/hunspell/hunspell/blob/v1.7.2/src/hunspell/hunspell.h
and kernel Landlock documentation. Source links are evidence, not instructions.
Normal Debian runtime dependency libhunspell-1.7-0; language packages user-installed,
never downloaded by Linuxcast or redistributed as undocumented bundled datasets.

Ownership: coordinator shared contracts/native main+lib routing/Cargo/packaging/
preload API/main assembly/IPC/suites/registry. Native lane ONLY module
native/platform/src/dictionary_spelling.rs, native/platform/tests/dictionary_spelling.rs
and packages/builtins/dictionary/NATIVE-SPELLING.md. Reader lane ONLY installed.ts,
native-spelling.ts, tests/spelling-source.test.ts/tests/native-spelling.test.ts
and SPELLING-SOURCE.md. UI lane ONLY spelling.ts/new fixtures/tests/NEW spelling-
PNGs/SPELLING-UI.md; proposes small presentation.ts wrapper integration for parent.

Native meaningful tests MUST run real system lib plus authored temporary public
UTF8 aff/dic fixtures for affix/forbidden/compound/spaced suggestions as applicable;
malformed/truncated protocol/bounds/privatefile/network/exec denial/resource/exit
behavior. Missing library/containment reported unavailable, not pass. Parent app
actual sandboxed Electron check/copy/unrecognised/cancellation/sourcechange/
Back/Hide/restart/usageprivacy and affected dark/light/200% captures. No whole
Hunspell/all encodings/StarDict/thesaurus/nativeAT/Debian/release completion claim
without evidence. All source/IPC/UI/capture/actual assertions independently review
then normal signed focused implementation PR/CI/configuredreviews/merge promptly.
