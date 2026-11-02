# Bounded status projection without discarded-value accumulation

Offline preparation after the [actual status-field refusal](../bounds-actual-20261102/README.md).
The coordinator froze the explicit projection refinement at
`ef5549cadb7ef156cca19255707d4726504fd6c2` before implementation. This is not
another actual capture or a claim that the real offending field was discarded.

## Behavior and contract

The parser previously concatenated every field before selecting the fifteen
exported fields. It now stores discarded field names/presence with a None
sentinel, checks their continuation structure and duplicates, and never
accumulates their values. Selected fields keep the same value construction,
validation and16KiB assembly guard. Description, Conffiles and arbitrary unused
values still do not enter the private snapshot or public result.

The former16KiB concatenated discarded-value restriction is explicitly removed
by the [coordinator protocol](../../../tests/at/build-facts-protocol.md) and
[snapshot elaboration](../build-facts-preparation/snapshot-schema.md). Their
physical lines remain bounded16KiB and their entire stanza128KiB; input remains
8MiB/4096 records. This is a declared projection change, not merely a reason-code
change or an unreported blanket limit increase. Projected values still refuse
over16KiB. All field-name, control-character, duplicate, orphan-continuation,
simple/folded, identity/status/architecture/version checks remain. The
[Debian control-file syntax](https://www.debian.org/doc/debian-policy/ch-controlfields.html#syntax-of-control-files)
describes multiline fields, case-insensitive names and continuation/duplicate
rules; it is evidence, not authority to change unrelated behavior.

Host logic is unchanged after substituting its embedded-source assignment;
guest definitions outside package_records are bytecode-independent AST-equal to
the frozen base. Integer guard constants are unchanged. Snapshot/packet shapes,
codec, selected fields, fixed reads, output caps, unknown wrappers, source/permit
binding, FileIO writer/direct reader custody, guardian, deadlines, commands and
native admission are unchanged. The embedded/source hashes change, requiring
fresh review, sealed sources and a new permit before another real invocation.

## Executed offline validation

Platform: Linux x86_64, CPython3.10.12, pinned Node24.22.1/Bun1.4.4.

- 100 focused tests pass in1.919s, no skips/expected failures.
- Actual55 mapped F1-02 security checks pass in13.61s, including all395 Python
  cases; the Python subprocess completes12.012s under the unchanged18s bound.
- Three new methods reproduce six behavioral failures/zero errors against exact
  pre-change source, then pass current source in private copies.
- The positive cases use approximately96KiB synthetic discarded fields. They
  assert identical projected records and inspect parser locals to require None,
  proving that the values were not materialized. A collector/codec case checks
  exact full-input SHA/length, host validity and absence of the synthetic canary.
- Negative cases preserve duplicate, invalid-name, orphan, physical-line and
  total-stanza refusals. Existing field-size tests now use the projected Depends
  field instead of discarded Description, retaining their intended16KiB guard.
- A private fault control restores the old accumulator and only raises its
  field limit to128KiB. Projection output would match, but the live-local
  assertion detects materialized values: three failures/zero errors.
- Original custody controls still reproduce11/2/4 historical failures/current
  green; diagnostic controls still reproduce25 historical failures/current
  green. The duplicate-guard mutation was retargeted to its exact guard line
  after an intervening comment made the prior multi-line replacement a no-op;
  the test now also asserts the mutation actually changed its private source.
  That initial harness error is not counted as a production defect or pass.
- Host/guest AST scope, numeric guard constants, current source/embedded/input
  hashes, plan and whitespace are verified in the companion manifest. Prior
  typecheck/lint remain inherited unchanged-TypeScript evidence, not rerun here.

The [repeatable controls](check-regressions.py) use trusted Git revisions and
private source copies. No tracked source swapping or host package/locale/resource/
keyring probe occurs. Existing ordinary guardian fixtures keep their independent
FixtureGuard custody/reaping. No clock, timeout, assertion or existing effect
boundary was weakened.

Signing uses the user-authorized per-command unsigned fallback because the
configured1Password socket is unavailable in this session. Global signing and
release-signing requirements are unchanged.

## Acceptance and limitations

Initial independent Security/Spec and Standards reviews are clear as recorded
below. No changed parser or
permit has run in the guest. The actual failing field's identity/category remains
unknown; a projected field over its bound would still refuse. Both actual runs
remain unavailable with no package baseline. Used sources, permits and private
outputs are preserved; the pinned lab is stopped after verified cleanup.

No package resolution/install/build/receipt, privileged namespace/rootdrop/statx,
native product/Orca/session/physical/provider/release acceptance is established.
F0-01 remains accepted, F1-02 in-progress/UI pending, and all97/full local1.0 scope
and acceptance/dependency states remain intact. Current synthetic and actual
cleanup cannot retrospectively close the old unknown timeout-descendant gap.

## Initial independent Security/Spec review

Review bb7a5297 completed on exact27a9f73873993439cddb8a8b5a50814f8bdc7991,
base/merge-base63118f1139314931117bf1d1015d1b4c42193bf2. The final report was
read in full: no actionable P1/P2/P3 findings. The reviewer independently confirmed
discarded None storage, selected/line/stanza/input/record bounds, output typing/
allowlist, codec/raw SHA, custody, cleanup and unchanged command authority.

Executed100 focused,55 mapped/all395Python under18s; old projection6 failures,
materializing mutant3, diagnostic25 and historical custody11/2/4 controls, all
current green. Another126 boundary/semantic and172 manifest/provenance/registry
checks passed, alongside host/guest AST/numeric constants/19044-byte embedded
hash, plan/syntax/whitespace. Its checkout stayed clean with matching fingerprints;
only its own generated dependencies were removed. No source or real lab action.
Actual execution/cleanup and earlier TS checks remain inherited; private permit,
harness and machine state were not accessed. All97 states/dependencies/criteria
remain unchanged. Publication follows the normal current-head CI/GitHub gates.
This metadata addition preserves reviewed owner/test/helper/protocol bytes.

## Initial independent Standards review

Review6a27b37d completed on the same exact27a9f73/base63118f1; its final report
was read in full. Standards and separate Spec observations both have zero
findings. The reviewer confirmed None storage, retained selected-field/remaining
guards and honest unknown-category evidence.

Independently executed100 focused1.426s,55 mapped10.54s including395Python under
18s/no skips; projection6/mutant3/diagnostic25/custody11/2/4 historical failures,
zero errors/currentgreen;93 additional synthetic probes and47 hash/public-schema/
provenance/AST/constant/plan/whitespace checks. All97 task states/dependencies/
acceptance unchanged. All2879 tracked-content and index fingerprints matched;
checkout clean and only its generated dependencies/cache removed. No source,
private/lab, actual execution or publication changes. Earlier TS and real
capture/cleanup evidence remain inherited. The actual field category remains
unknown; no package/build/native/session/release or full-task acceptance follows.

Both axes therefore clear the bounded preparation at27a9f73. Publication updates
documentation/hashes/registry only; owner/tests/helper/protocol/elaboration stay
byte-identical to reviewed source. Fresh sealed source and permit are still
required after integration before any changed-parser capture.
