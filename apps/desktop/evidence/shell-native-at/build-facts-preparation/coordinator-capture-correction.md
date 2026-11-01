# Coordinator capture binding correction

Initial Standards review `30922b61` of exact HEAD
`aafd1bf7ff60e637d25a414633988a1287cd912b` against frozen BASE
`393f9da0a3e384ed6a15e18a1973d111494f19c8` found no documented Standards or
material Fowler findings. It separately identified one P2 Spec defect: a valid
unavailable reply could carry a different capture UUID from the retained permit.
Only observed replies entered the artifact branch containing the binding check.
This contradicts snapshot-schema.md's permit binding for every received reply.

The coordinator moves that check before the artifact branch, for both observed
and unavailable replies. Not-received results remain valid before permit
admission. No schema, authority, source-pinning, deadline, packet limit, cleanup
or guest probe changes. A mismatched or unbound received reply is refused as
custody failure before its result can be accepted by the caller.

The new regression generates an actual synthetic unavailable transaction, checks
its correctly bound caller validation, substitutes another canonical UUID4 and
requires refusal. It also refuses a received reply without a retained permit,
preserves the not-received pre-admission case, and checks no artifact exists.
Before the code change the test failed with one behavioral assertion, zero
errors: `Rejected not raised`. Fixed source passes. No tracked-source swapping,
host package/resource probe, real CLI, permit, lab or native action occurred.

Executed coordinator checks on Linux x86_64/Python3.10.12 and pinned
Node24.22.1/Bun1.4.4:

- New regression: 1 pass, 0.006s.
- Focused suite: 83 pass, 1.156s, no skips/expected failures.
- Actual mapped F1-02 security: 55 pass, 11.98s. Its automatically discovered
  Python payload now contains378 cases and completes in10.686s within the
  unchanged18s deadline. No test/clock/deadline weakening.
- Plan validation and whitespace checks pass. Current ASTs, source/embedded
  hashes and unchanged input bindings are verified in the companion manifest.

Initial Standards reviewer independently ran82 focused/all377Python/55mapped,
AST/19preparation-input+33custody hashes/embedded hash/plan/whitespace/lint. Its
typecheck initially SIGSEGV'd; identical pinned retry passed. Those results cover
the initial source, not this correction. Separate initial Security/Spec review
`cd58456c` remains running; no clean initial or final Security/Spec result is
claimed yet. A fresh final review will include this correction and any other
actionable initial findings.

The original README, validation.json and sha256.json remain the author's
historical evidence for `5067676`/`e4ba89b`. Their two code/test digests intentionally
differ after this correction. coordinator-capture-sha256.json records current
code/test/correction digests and the historical comparison commit. Do not treat
the historical manifest as current code identity.

AC01/AC02/privacy historical acceptance is unchanged; F1-02/UI/full-task/native
and all97/local1.0 release requirements remain pending as documented. No push,
PR, capture, provisioning, build or native acceptance follows from these tests.
