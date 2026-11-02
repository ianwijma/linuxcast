# Fixed build-facts bounds diagnostics

Offline preparation after the first actual capture,2 November2026 Sydney.
Base `af55d289782b00c8e3e096a9c9c1cb04fb0ac85c` freezes the coordinator's scoped
diagnostic contract. The earlier [actual run](../build-facts-actual-20261101/README.md)
returned a valid unavailable/bounds reply in42.676s/exit3 and verified shutdown;
the failing guard remains unknown. No diagnostic source has run in the guest,
and the old sealed source, used permit and actual evidence are preserved.

## Change and boundaries

The [protocol](../../../tests/at/build-facts-protocol.md) permits twelve additional
fixed refusal codes. The owner now identifies status input, line, stanza, field
and record guards; the other fixed file-read guards; update-entry count; snapshot
size; and compressed packet size. The exact guard/invariant is reported, never
raw values, paths, exceptions, package text or caller input. Existing generic
`bounds` remains accepted for historical replies. A bounded input-read invariant
also includes type/empty/length-consistency checks where already present; a code
does not assert that a larger limit would repair the input.

This changes only the closed failure enum and fixed reasons supplied to existing
guards. The host code is structurally identical after substituting its original
FAILURES/PROBE_SOURCE assignments. Guest code is structurally identical after
collapsing the new fixed reasons and removing the local fixed-path reason map.
The evidence manifest records those AST checks. No guard predicate, threshold,
read path, optional/unknown wrapper, command, packet shape, codec, source-pinning,
permit, custody, guardian, deadline or acceptance behavior changes. The source
and embedded probe hashes do change, so another actual run requires review and
fresh protected source/permit; the used permit cannot authorize this source.

Limits remain status8MiB/4096records/128KiBstanza/16KiBline-field, snapshot2MiB,
packet60000/transport65536/guardian-public4096 bytes; guest25s/job30s/start120s/
cleanup45s/owner600s, with the mapped Python18s check. All earlier writer/reader
signal, descriptor-reuse, first-failure, cleanup and no-replay boundaries remain.

## Executed offline checks

Platform: Linux x86_64, CPython3.10.12, pinned Node24.22.1/Bun1.4.4.

- 97 focused tests pass1.907s, without skips or expected failures.
- Actual55 mapped security checks pass13.10s, including all392 Python cases;
  its Python subprocess completes11.540s within the unchanged18s bound.
- The [repeatable diagnostic controls](check-regressions.py) exercise parser,
  fixed input reads, update-entry bound, snapshot and packet encoding and full
  owner transaction/public refusal paths. Five methods produce25 behavioral
  failures/zero errors on exact base source and pass current source.
- Existing original/writer/reader controls still reproduce11/2/4 historical
  failures with zero errors, and all11 current methods pass.
- Twelve new reasons retain unavailable/null package counts/bytes/digests, one
  dispatch, normal failure cleanup and no artifact; unknown invented reason
  text is rejected. No private input or exception is exported.
- Current host/guest AST scope proof, source/embedded/input hashes, plan and
  whitespace checks pass. Previous full typecheck/lint results remain inherited
  unchanged-TypeScript evidence; they are not rerun for this Python-only change.

The first four direct regression methods failed old generic source with thirteen
assertions before implementation, then passed. The complete five-method helper
adds twelve failure-code transaction cases, producing the25-assertion historical
result. All execute private synthetic inputs or temporary source copies. The
existing independent FixtureGuard retains/reaps ordinary process fixtures; no
real CLI, lab, guest, package database, locale/resource/keyring or native probe is
used by these offline checks.

Configured signing failed immediately because 1Password could not connect to its
socket. The coordinator uses the user-authorized per-command unsigned fallback
for this preparation commit; signing configuration and release-signing rules are
unchanged. Earlier actual-run and contract checkpoints were signed normally.

## Acceptance and next action

This is diagnostic preparation, not diagnosis of the real failure. Independent
Standards and Security/Spec reviews are clear as recorded below. No new permit, actual capture,
installation, build, privileged namespace/rootdrop/statx, native product/Orca,
provider or release operation occurred. The previous capture remains unavailable
with no package baseline; exact package resolution and all later build/native
acceptance still need actual evidence. F0-01 accepted, F1-02 in-progress/UI
pending and all97/full local1.0 scope remain unchanged. Historical unknown
timeout-descendant absence is not closed by these current tests.

## Independent review outcome

Both initial independent reviews completed on exact source
`3536145b0eb90dd34d5994ad4cae58791dd24c1f`, against approved PR102 merge
`40bac5ccf903feace841515ab52f29879cf62471`. Both final reports were read in full.
Standards480d0c5c found no hard-rule or material heuristic issues. Security/Spec
1c176209 found no actionable P1/P2/P3 issues. Each independently confirmed the
diagnostic-only host/guest AST scope, unchanged guard predicates/limits/reads/
wrappers/commands/custody/deadlines, generic-bounds compatibility and fail-closed
unknown reasons. The reviewed range has15 paths, correcting the brief's16.

Standards independently passed97 focused1.234s,55 mapped10.06s/all392Python within
18s,25 diagnostic historical failures/currentgreen, original11/2/4 controls,
29 additional probes,23 hashes/embedded/public schema-provenance/plan/whitespace.
Security/Spec independently passed97 focused1.244s,55 mapped10.01s with392Python
8.965s under18s, the same historical controls,20 differential refusal pairs,
47 positive checks,17 public-result checks, AST/23bindings/source provenance/
public schema/plan/whitespace. No skips or expected failures. All97 task states,
dependencies and acceptance records are unchanged. Typecheck/lint and actual
execution/cleanup remain inherited and are not re-established by these reviews.

Both review checkouts remained clean with matching tracked/index fingerprints;
their own generated dependencies were removed. No real CLI, lab/guest, package,
build, privileged/native or publication action occurred. Signature headers on
earlier checkpoints are inherited metadata, not newly verified signer identity.
Publication updates only documentation, evidence hashes and registry metadata;
owner/test/helper/protocol bytes remain exactly the reviewed3536145 source.
The next actual capture still requires fresh protected reviewed source and permit
after normal integration gates. The real failed guard remains unknown today.
