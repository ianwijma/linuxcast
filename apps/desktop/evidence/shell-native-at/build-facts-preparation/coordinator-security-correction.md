# Coordinator corrections after initial review

Initial Security/Spec review `cd58456c` completed on exact
`aafd1bf7ff60e637d25a414633988a1287cd912b`, BASE
`393f9da0a3e384ed6a15e18a1973d111494f19c8`. Four P2 findings required corrections.
The separate Standards review `30922b61` found no Standards or material heuristic
issues and separately identified the capture binding P2 already corrected at
`9c768cf3915b9eb97bf20a5053e11fcb6ea5b544`.

Both original reports have been read. No initial Security/Spec pass or final
independent correction review is claimed. The coordinator fixed the bounded
findings directly; a fresh final recheck is next.

## Corrections and behavioral evidence

1. **Guardian retirement:** the caller previously retained `observed` and
   `transportResultValid=true` after the guardian sent its packet but failed its
   final artifact close. Caller validation now invalidates an observed artifact
   after guardian loss or cleanup failure, retaining dispatch/start accounting,
   the original operation failure, and the independent cleanup failure. The
   existing base owner and its guardian are unchanged. A real ordinary-Python
   guardian fixture injects a close error after actually closing its own artifact
   descriptor, then requires the caller to publish no observation. The external
   FixtureGuard verifies exact child reaping/absence. The normal guardian control
   still succeeds; no guest or transport process is involved.
2. **Malformed Multi-Arch:** both guest parser and independent host validator
   refuse `Multi-Arch: same` when Architecture is absent or `all`. The new
   controls test host validation directly and guest collection separately.
3. **Partial half-installed state:** both validators preserve legitimate absent
   Architecture and/or Version in half-installed records. Collection, codec and
   direct host regressions require the fields to remain absent and the result to
   report `broken=1, clean=false`. Installed/config-files and other complete
   states keep their existing requirements. No broken state becomes package
   installation authority. The coordinator reconciles snapshot-schema.md's
   overly strict elaboration with the primary protocol, rather than weakening
   the primary requirement to report broken state truthfully. Debian's pinned
   [dpkg1.22.22 parser](https://raw.githubusercontent.com/guillemj/dpkg/1.22.22/lib/dpkg/parse.c)
   documents the partial-state exception and rejects the invalid Multi-Arch
   combinations in `pkg_parse_verify`. This primary source was independently
   read; no host or guest dpkg command was executed.
4. **Writer custody before close:** publication previously cleared the retained
   writer number before recording uncertainty or attempting close. It now keeps
   the descriptor through that cancellation boundary and retires its number in
   the close scope's finally block. Existing cancellation masking covers close
   bookkeeping; the hard alarm remains deliverable. An ambiguous Linux close
   remains non-retryable and cannot claim publication. The regression injects
   interruption at the previously leaking line, then checks the exact writer is
   EBADF after cleanup. Its independent historical-red fallback retires only the
   exact leaked fixture descriptor. The pre-existing ambiguous-close fixture now
   targets the retained writer instead of assuming the previous early release.

Six new regression methods failed against the pre-correction source with ten
behavioral assertion failures and zero errors, then passed fixed source. The
companion [repeatable controls](check-review-regressions.py) also include the
earlier capture regression: seven methods fail the exact reviewed Git source with
eleven behavioral failures, zero errors, and pass current source. These execute
private temporary source copies only. The helper's first run lacked base modules
in its nested fixture's sanitized import path (ten failures/one harness error);
copying the two unchanged base modules corrected that harness issue before the
reported eleven-failure/zero-error result. No tracked source was swapped.

## Validation and provenance

Coordinator executed on Linux x86_64, Python3.10.12 and pinned
Node24.22.1/Bun1.4.4:

- 89 focused tests pass, 1.297s; no skips or expected failures.
- Actual mapped F1-02 security: 55 checks pass, 11.65s. The complete automatically
  discovered Python payload now has 384 cases and completes in10.376s under the
  unchanged18s deadline. No test clocks, deadlines or effect assertions weakened.
- Full no-write typecheck and whole-repository lint pass.
- Current and historical source hashes, embedded-source AST/hash/size, fixed
  boundary input bindings, plan validation and whitespace are checked separately.

The initial Security/Spec reviewer independently ran82 focused/all377Python,
mapped55 security11.33s, typecheck/lint/AST/53hashes/plan/whitespace and its private
probes. The Standards review's earlier checks and transient typecheck SIGSEGV plus
successful identical retry remain historical evidence. Neither initial report
covers these final coordinator corrections.

`sha256.json` remains the initial author's historical snapshot at
`5067676`/`e4ba89b`. `coordinator-capture-sha256.json` remains the historical first
correction at `9c768cf`. The current snapshot elaboration and code/test digests
are intentionally different. `coordinator-security-sha256.json` binds current
correction files/embedded source and explicitly identifies those historical
commits; it is not an execution permit. The new embedded source hash must be
independently reviewed before a fresh actual source/permit is prepared.

Actual capture, real owner CLI, permit, Docker/SSH/guest, package installation,
build, privileged namespace/rootdrop/statx, UI and native/Orca executions remain
zero for this increment. Historical actual inventory/shutdown and unknown old
timeout-descendant absence are unchanged. No task/criterion/dependency status is
promoted; all97 tasks and complete local1.0/session/AT/release requirements remain.
