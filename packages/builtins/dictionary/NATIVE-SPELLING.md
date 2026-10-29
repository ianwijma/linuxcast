# L2-06 — contained native spelling backend

30 October 2026. Bounded application backend on `codex/dictionary-spelling-native`,
base `9ae4bc4`. Read with [SPELLING-INCREMENT.md](SPELLING-INCREMENT.md), the complete
[L2-06 card](../../../docs/implementation/tasks/L2-06.md), PLAN, architecture data,
security and stack, product builtins, testing-release and DESIGN/tokens. Shared
contracts, native mode routing, packaging and application assembly are coordinator
owned. This delivery owns only the native module, its tests and this report.

## Concrete behavior

The existing platform executable's fixed `dictionary-spell` mode loads the system
Hunspell 1.7 C API at `/lib/x86_64-linux-gnu/libhunspell-1.7.so.0`. It calls only
create/destroy, spell, get_dic_encoding, suggest and free_list; there is no CLI,
add/remove/save call, personal dictionary, dataset download or library-path input.
Affix rules, forbidden words and compound rules are evaluated by real Hunspell,
rather than inferred from the base-headword list. Definitions/thesaurus are separate.

Read-only inherited regular descriptors 3/4 supply the selected aff/dic. The worker
bounds size at 1MiB/16MiB, uses pread without moving caller offsets, compares
size/inode/device/mode/mtime/ctime before/after copying and seals private memfds
against write/grow/shrink/further seal changes. Original and unrelated inherited
FDs close before native parsing. Minimal UTF-8/NUL/header/count/line validation
runs in bounded Rust; the installed-source reader additionally owns its full lexical
validation, approved-root/symlink authority and post-operation source-race checks.
A later change to the original cannot change the sealed snapshot; the reader must
refuse that stale operation after its fresh source validation, not treat this worker
as an original-path identity oracle.

Before dictionary construction the worker requires Linux Landlock ABI3 or later
with an empty allowlist covering all ABI3 filesystem rights. No home, `/proc`,
working directory or system data directory is granted. Sealed anonymous memfds
remain readable through exact `/proc/self/fd/N` paths; both are explicitly tested
readable after confinement because Hunspell can otherwise construct an empty
handle following an fopen failure. The fixed library and its dependencies load
before this restriction; untrusted dictionary parsing starts afterwards.

A separate x86_64 seccomp allowlist rejects alternate ABIs and unknown syscalls.
It permits bounded runtime memory management and read-only openat subject to
Landlock; writes are only stdout/stderr, executable mappings and shared mappings
are denied. Network/socket operations, execution, descendants, signals to other
processes, arbitrary metadata lookups, io_uring, ptrace and mutation operations
are not allowed. The parser's stderr goes to a fixed `/dev/null` sink, preventing
source-content diagnostics. Early initialization failures can emit only the
routing layer's fixed `PLATFORM_SPELLING_UNAVAILABLE` diagnostic. No parser
content is returned as a diagnostic.

Limits are core0, address space512MiB, CPU2s and32 open FDs. A default SIGALRM
terminates a stalled worker after3s; the transport independently owns its3s wall
clock/AbortSignal kill and waits for actual child close. No containment fallback.

The protocol is one big-endian-length JSON ready frame, one check request plus
stdin EOF, then one result and clean exit0. Unknown/duplicate fields, second
requests, trailing bytes, invalid words, malformed/truncated or >4096B requests
are refused. A failed frame may precede ready for initialization refusal, or follow
ready for a request/result refusal; routing exits1. No response exceeds65536B.
Input is one literal word, <=128 scalars/256 UTF-16 units/512 UTF-8 bytes, without
whitespace, controls or bidi controls. Exact Unicode is echoed without normalization.

Recognised words return `correct:true` with no suggestions. Otherwise native-order
suggestions are deduplicated and capped at32 with an honest truncated flag. Each
suggestion is valid UTF-8, <=256 scalars/512 UTF-16 units/1024 UTF-8 bytes, untrimmed
and free of controls/bidi controls; internal spaces are preserved. Invalid or
oversized output refuses the operation, without slicing text into a guessed result.
This backend never copies, pastes, records usage or persists checked words.

## Commands and results

- `cargo build --locked -p linuxcast-platform`: PASS.
- `cargo test --locked -p linuxcast-platform --test dictionary_spelling -- --test-threads=1`:
  final12 PASS, 3.37s. Eleven substantive tests plus the isolated containment-probe
  child entry. Tests require the real system library/profile; neither is skipped.
- `cargo clippy --locked -p linuxcast-platform --all-targets -- -D warnings`: PASS.
- `cargo fmt --check -p linuxcast-platform`: PASS.
- `python3 scripts/validate_plan.py`: PASS279 sources/57 features/97 tasks/124 Markdown/6SVG.
- `git diff --check`: PASS. No dependency or lockfile change by this lane.

Authored public temporary UTF-8 fixtures verify `cat/S` → `cats`, rejection of an
explicit forbidden entry, `sun/C` + `flower/C` → `sunflower`, exact `café`, a native
`cafee` → `café` suggestion and `icecream` → `ice cream`, deduplication and honest
no-suggestion results. There is no redistributed installed dataset. Protocol tests
include duplicate keys, extra fields/frames/bytes, invalid Unicode and word bounds.
Source tests cover native BOM/whitespace-separated SET-comment compatibility, duplicate SET refusal, missing/nonregular/writable descriptors, size limits, malformed
UTF-8/count/NUL/encoding, snapshot preservation after external mutation, closed
originals and unchanged source bytes/identity. The profile probe directly denies
private-file reads, network/Unix sockets, exec/fork/clone3, writes/truncation/unlink,
signals, io_uring, ptrace and executable mapping. Parent `/proc` inspection records
the actual resource caps, no_new_privs and seccomp; stalled stdin ends by SIGALRM.
An injected ENOSYS for Landlock initialization produces unavailable, never a result.
Library absence itself was not induced on the host; the fixed symbol/error branches
fail closed, and application unavailable handling remains coordinator validation.

A separate read-only observation passed against installed `en_US` (3131B aff,
860381B dic): `cats` recognised under the same profile, exact ready/result, exit0
and zero stderr. No installed bytes were copied into this repository. The first
ad hoc Python observation incorrectly remapped child descriptors and received the
expected malformed refusal; passing the actual descriptors3/4 corrected the probe.
Initial focused-test assumptions about fixed initialization diagnostics and Rust
Child::wait closing stdin were corrected without relaxing production policy.
Initial compile/Clippy findings were confined to owned source and resolved.
Independent review identified legitimate BOM/trailing-comment preflight compatibility;
real native regressions now cover it. A reader-accepted `SET UTF-8#comment` without
a separating space is not a native UTF-8 encoding on this system; it is honestly
unsupported for spelling rather than silently rewritten into another source.

## Platform and acceptance limits

Pop!_OS22.04 amd64, Linux7.1.1-76070101-generic, Landlock ABI9;
Rust/cargo1.95.0, installed `libhunspell-1.7-0:amd64`1.7.0-4build1. The API signatures
follow the official [Hunspell1.7.2 header](https://github.com/hunspell/hunspell/blob/v1.7.2/src/hunspell/hunspell.h);
no unavailable get_library_version symbol is required. Filesystem confinement is
based on the [kernel Landlock contract](https://docs.kernel.org/userspace-api/landlock.html).

Partial L2-06-AC01: real installed-language processing, explicit unsupported UTF-8
compatibility state and no download/unlicensed dataset distribution. Partial
L2-06-AC02/PRIVACY: exact bounded Unicode/suggestions and content-free refusal,
with no persistence/clipboard authority in this worker. UI, canonical Copy,
source-root race binding, renderer lifecycle, aggregate usage/privacy, transport
cancellation and actual Electron flow are coordinator/reader/UI integration work.
No UI screenshots originate from this non-UI lane. DESIGN's honest capability
states/shared controls remain requirements for that application flow.

This is not full Hunspell-language/encoding, StarDict/thesaurus, native paste,
Debian13 GNOME/KDE Wayland/X11, native assistive technology, prerequisite,
performance, packaging or release acceptance. Full L2-06 and complete local1.0
scope remain required; no task/criterion status is promoted by these tests.
