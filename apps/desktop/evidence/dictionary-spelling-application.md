# L2-06 — explicit installed-language spelling increment

Dictionary now offers **Check spelling** for the selected installed UTF-8 language.
The shared Form sends one literal word only on explicit submission. A shared List
shows the recognised original word or up to32 unique native suggestions in native
order. Arrow navigation and an explicit **Copy suggestion** copy the issued text;
they never paste into another application. Cancel/Back retain the Dictionary
language, query and selection. Hide/restart discard spelling input/results.

This is an unfinished L2-06 application increment, not completion of L2-06 or
local1.0. Its full task card is `docs/implementation/tasks/L2-06.md`. Existing
shell/storage/UI prerequisites are integrated under the user's approved partial
sequencing; outstanding prerequisite and release acceptance is not promoted.

## Implementation and boundaries

Main uses the existing installed-source reader and packaged Rust platform helper,
with fixed `dictionary-spell` mode and system Hunspell1.7 C API. The child receives
only pinned aff/dic descriptors and one framed word, with sanitized environment,
sealed source snapshots, required Landlock/strict seccomp and memory/CPU/FD/wall
limits. Missing library/containment or unsupported data fails closed. No CLI,
shell, network, personal-dictionary or unsandboxed fallback is introduced. The
runtime requires Debian `libhunspell-1.7-0` and separately user-installed language
packages. F1-03 packaging remains its explicit stub; this increment does not
claim a Debian dependency declaration/package exists.

Named check/Copy/release IPC binds UUID, server check ID, owner/frame, revision,
generation, language, exact word, source snapshot and issued suggestion. Copy
freshly revalidates the installed pair and permission before dispatch. Four actual
read slots and the global clipboard reservation survive timeout/late settlement;
release cancels only its own invocation and no effect is replayed. Words/results
are transient, with no typing requests or saved spelling history. Only confirmed
explicit Copy records the existing aggregate Dictionary usage, without word text.

## Verification

Parent mapped checks:847 unit /54 contract /416 security /78 browser PASS.
The unit suite includes36 controlled-child protocol fixtures; those are not native
Hunspell correctness evidence. Default execution sandbox made these script children
exit before fixture code; the authorized actual-process run passed. No production
policy was weakened. Rust `cargo test --locked -p linuxcast-platform --test
dictionary_spelling`:12 real-library/containment tests PASS3.01s. Full direct Node
TypeScript and locked all-target Clippy PASS; scoped ESLint PASS.

The actual sandboxed Electron scenario uses an isolated profile/private Xvfb X11
display and the packaged helper with existing en_GB data. It verifies dirty Cancel
Keep/Discard, exact affix-derived `cats` recognition and real xclip Copy, native
misspelling suggestions, ArrowDown selection and exact selected-text Copy, Back,
Hide/second-instance reopen, Quit/restart, empty reopened Form, aggregate usage2,
private settings/usage exports and zero observed renderer HTTP(S) requests. The
final mapped scenario passed11.927s. Initial test attempts pressed a briefly disabled
action after Back; the final helper waits for its visible enabled state. Keyboard,
stale-context and held-key safety guards remain unchanged. Temporary public test
diagnostics were removed.

A separate real authored pair → installed reader → contained native → main IPC
scenario passes. A real atomic .dic replacement invalidates old Copy twice, with
zero clipboard/usage effects, and a fresh check obtains a different snapshot even
though the word remains recognised. Electron identity and clipboard are explicitly
synthetic in that scenario. Actual application source files are not mutated.

Final mapped integration:34 checks across13 files PASS73.80s, comprising8 actual
sandboxed Electron scenarios,25 storage-owner/client checks and1 real native/reader/
IPC source-replacement scenario.

## Review and visual evidence

Independent review covered native code, reader/transport, contracts/IPC/preload,
wrapper/shared focus and actual assertions. Fixed findings include native BOM/
SET-comment compatibility, duplicate JSON response keys, settled shared Form focus,
dirty Cancel confirmation and misleading base-search failure wording while Copy
was pending. The held-Copy → Back → failed-query regression preserves the actual
effect fence until settlement. Parent reviewed that authored regression separately.

Applicable DESIGN sections: List/Grid/Detail/Form, keyboard/focus, status/error,
Actions and dark/light appearance; canonical tokens/shared host primitives only.
Eight component captures cover Form dark/light, loading, suggestions, empty,
unavailable, unknown Copy and200% Form. They are synthetic fixtures, axe0 and
independently inspected. Four `dictionary-spelling-application-*.png` captures show
actual recognised/suggestion states dark/light, axe0; parent inspected the final
captures after the mapped run. Historical captures are retained byte-for-byte.

## Acceptance and remaining work

AC01/AC02/UI/PRIVACY have additional partial evidence only. No full task or
criterion is marked passed here. Remaining requirements include all supported
language/encoding/data formats, complete StarDict/thesaurus, native Paste,
global-provider semantic entry points, Debian13 GNOME/KDE Wayland/X11/native AT,
performance, packaging, upgrade/recovery and release gates. The host here is
Pop!_OS22.04 amd64/Linux7.1.1, private Xvfb X11; Node24.22.1/Bun1.4.4/Electron45,
Rust1.95 and system Hunspell1.7 ABI. Browser axe checks are not native AT or
Wayland acceptance. No runtime library-absence induction or full package test is
claimed; see the separate native/source/UI reports for their precise limits.
