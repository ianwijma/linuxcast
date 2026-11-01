# Build-facts preparation: final review outcome

Final independent recheck `065a6691` is clear on Security/Spec and Standards at
exact `c512d5f581f67b8f7096863b317a547554dc7d92`, compared with
`8cf1b32afdf342e75831dab2effadf1bf25bad9f`. The final report was read in full.
The reviewer independently reproduced all four earlier reader acquisition leaks
under real SIGALRM/SIGTERM with os.open unchanged, then confirmed all fixed cases
retire the exact reader with EBADF and no observation/clean-reservation claim.
Another22 current probes passed across later reader calls, retirement, unrelated
descriptor reuse, missing/symlink/FIFO/directory paths and identity replacement.
No new authority expansion or material standards/maintainability finding.

Independently executed on Linux x86_64, Python3.10.12 and pinned
Node24.22.1/Bun1.4.4:

- 93 focused tests pass1.356s.
- Actual55 mapped security checks pass11.56s; complete388-case Python payload
  passes10.303s under the unchanged18s bound, without skips.
- Historical controls reproduce11 original,2 writer and4 reader behavioral
  failures, each with zero errors; all11 fixed methods pass.
- Four ASTs,17 current/70 historical bindings,13 unchanged inputs, embedded
  source18055bytes/hash, plan validation and whitespace pass.
- Typecheck/lint remain inherited for unchanged TypeScript, not rerun by this
  final reviewer. Author and coordinator had passed full checks earlier.

Initial Standards30922b61, initial Security/Spec cd58456c and intermediate
rechecks9ed544ac/9a318340 remain historical reports with their stated findings,
not retroactive passes. The capture/guardian/Debian metadata corrections were
independently cleared in the prior bounded rechecks; the writer correction was
cleared by9a318340, and this recheck closes its introduced reader-setter gap.
Writer signal, ambiguous-close, canary, first-failure and guardian accounting
controls remain passing. Evidence distinguishes executed from inherited results.

The final reviewer checkout was clean before/after and its index/tracked/HEAD
fingerprints matched. No source, evidence, index, capture, publication, commit or
real lab action occurred there. Coordinator publication metadata adds this record
without changing reviewed owner/tests/helper or their embedded source. The new
coordinator-publication-sha256.json binds those exact reviewed files and this
report. Earlier manifests are historical and identify their own Git snapshots;
registry evidence/card changes are metadata, not source or acceptance changes.

This closes review of the bounded offline preparation, not F1-02 acceptance.
There is no actual build-facts permit/capture, guest build, namespace/rootdrop/
statx/containment/native AT, supported-session or release proof. Historical
inventories/shutdown and unknown old timeout-descendant absence stay inherited.
F0-01 remains accepted; F1-02 remains in progress with UI pending. All97 tasks
and complete local1.0 requirements are unchanged. A fresh sealed reviewed source
and coordinator-only permit/capture are next after normal PR integration gates.
