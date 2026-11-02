# Collector registry framing and actual host composition

This checkpoint corrects the initial collector Security/Spec P2 and composes
the actual collector with the new private-artifact host owner. It grants no
capture or installation authority. All effects below use private synthetic
fixtures; no real owner CLI, permit, lab, guest, installer or native operation.

## Review and source boundary

Both initial reviews were read in full at `cfa3813`, base approved PR110
`1f8f954`. Standards12c56474 reported no findings. Security/Spec4ee8dec3 found
one P2: both registry parsers accepted missing final LF and1023 content bytes,
contrary to dpkg1.22.22's `fgets_checked` and its1024-byte buffers. Their other
checks and19-path identity were clear; actual APT/guest execution stayed
inherited. Those reviews do not cover the newly composed host owner.

The new owner author `66b1c565b41f3e60d5a237c2281597fc456f1bd0` was imported
as `5be5cfe`, exactly six additive files, from its prepared base `0f82f96`.
Its [original evidence](../../install-metadata-owner-preparation/README.md)
remains unchanged:67 focused/469 Python/55 mapped tests, no actual collector
present and no composition proof at that historical checkpoint. The original
[collector evidence](../README.md) likewise remains historical and byte-identical.
The13 owner and10 collector historical manifest bindings verify against their
respective author Git snapshots, rather than pretending modified sources still
have old hashes.

## Corrections and combined behavior

Both the fixed guest parser and independent host parser now require final LF
for nonempty registry bytes and at most1022 content bytes per physical line.
The LF and C NUL occupy the other two buffer positions. Empty registries remain
valid; exact1022 content+LF is accepted through collect→packet→host validation.
There is no read-set, limit, command, authority or deadline expansion.

Three new regression methods exercise guest collection and independent host
parsing separately for File and explicit-registry missing LF plus the1023-byte
File record. Running them against exact reviewed `cfa3813` source gives **six
behavioral failures, zero errors/skips**; corrected source passes. The valid
1022-byte control passes both. The private historical harness initially left
the fixture function's default guest bound to the current module, so only the
three host failures were exposed. Binding that private default to the historical
guest exposes all six intended failures. No test/source guard was weakened.

Actual composition exposed a fail-closed interface mismatch: the author's host
adapter required `none` in `FAILURES`, whereas the frozen collector API lists
only unavailable reasons. The host now requires that list to exclude `none`
and explicitly adds the observed sentinel to its own wire-code set. The small
private fixture codec follows that same contract; existing owner tests keep all
effect/custody assertions. No collector wire or frozen contract changes.

The new [composition tests](../../../../tests/at/test_install_metadata_composition.py)
load the actual adjacent collector source through `_Sources`, verify six
source/data/probe hashes and function origins, and use its real source/validator/
codec. Only the protected-ancestor profile is explicitly substituted for the
owned temporary source root; production profile stays unchanged. Guest System
uses the existing injected private filesystem adapter, never the host default.
The existing fake Lab denies all external child dispatch.

Four tests cover observed roundtrip/counts, every actual unavailable code,
full synthetic lifecycle through the real private artifact and public summary,
and an unavailable reply creating no artifact. Reusing the original author's
`_Collector` implementation makes all four fail behaviorally with zero errors;
the fixed adapter passes. The public output contains no fixture bodies, original
status digest, paths or artifact device/inode. Initial test bring-up called an
incorrect validation method and omitted exit3 on an unavailable fake reply;
both harness assumptions were corrected without changing production guards.

## Executed validation

Linux x86_64, Python3.10.12, pinned Node24.22.1/Bun1.4.4:

- Collector: **53 focused passed**,4.360s.
- Owner: **67 focused passed**,0.768s.
- Actual composition: **4 passed**,0.851s.
- Mapped F1 security: **55 passed**,15.45s; Python wrapper14.436s under the
  unchanged18s deadline, no skips/expected failures.
- Exact wrapper payload independently recorded all **526 Python tests**,
  complete true/native false, **14.569s** under18s; see
  [record](python-check.json). Its original performance.now delta was in
  milliseconds; the evidence formatter's field units were corrected while
  retaining the raw delta, without repeating execution.
- Full no-write typecheck/lint passed. AST, plan, whitespace, original author
  bindings, unchanged production seams and current [source hashes](source-hashes.json)
  passed. New quoted source is48848bytes; exact returned source48814bytes,
  SHA256 `8de614aa1dc4fd4855bae2c18da19b1584c93a2f235d91986762bb5cc8eb7492`.

The source/target packet, transport, snapshot, public/relay and startup/job/
guest/owner/cleanup/test bounds are unchanged. Base owner, artifact owner,
inventory, security wrapper and suite mapping are byte-identical. No historical
source/archive/native/receipt execution pin is reconciled by these tests.

## Outstanding gates

Initial independent owner Standards/Security/Spec review and the collector
correction recheck are next. Actual capture requires protected immutable source
custody and a fresh exact17-key/six-hash permit in the separate reviewed domain;
this checkpoint creates neither. Trigger/helper/recursive closure, independent
writer exclusion, capacity/network/activation, actual install/locale/toolchain/
build/containment/native/AT/session/recovery/release remain unproved. Historical
guest facts/cleanup and unknown old timeout-descendant absence remain inherited.

The pure hook verifier is saved separately, unmerged/unreviewed, at `720140c`
on `codex/f1-02-install-hook-verifier`; it is not part of this composition.
All97 task states/dependencies/criteria and complete local1.0 remain unchanged;
F0-01 accepted, F1-02 in-progress/UI pending. New integration/fix commits are
honestly unsigned via the authorized per-command fallback; no Git configuration
change, push or PR.
