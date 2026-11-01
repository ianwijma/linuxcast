# Direct reader custody after writer ownership correction

Independent final recheck `9a318340` at
`8cf1b32afdf342e75831dab2effadf1bf25bad9f` confirmed the original writer-close
failures resolved and Standards clear, but found one new P2: the Python artifactfd
setter could be interrupted before retaining a newly opened reader. Both the
publication reopen and independent caller reopen leaked the exact reader under
real SIGALRM or SIGTERM. Dirty custody/first-failure/accounting stayed correct;
those reports did not establish descriptor retirement. The final report was
read in full and is not treated as a clean final review.

The coordinator removes the setter. Both acquisitions now assign directly to
the reader backing field, as recommended by the review, without a Python method
receiving an unowned descriptor. Initialization and reader retirement also use
that field directly. The read-only artifactfd accessor still derives the open
writer number from its FileIO owner or returns the retained reader number. The
owning writer, reader no-follow/exclusive/mode/identity/content checks, guardian,
signals/deadlines and all wire/permit/source/acceptance boundaries are unchanged.

Two new tests cover both acquisition routes under both real signals. Against the
reviewed source, line tracing delivers the signal at setter entry while it owns
no backing-field reference. Against the fixed source, which has no setter, it
delivers at the first line after direct acquisition to check that custody is
already retained. Each requires dirty/unclaimed output and EBADF for the exact
reader after cleanup. Independent identity-checked fallback closes any exact
leaked fixture descriptor during historical reds; handlers and tracing are
restored in finally. This does not inject a Python replacement open that raises
before returning its descriptor, which would manufacture a different handoff.

All four route/signal cases fail reviewed8cf1b32 with four behavioral assertion
failures and zero errors, then pass fixed source. The repeatable
[historical controls](check-review-regressions.py) now include three trusted Git
baselines: original seven methods (11 failures), writer two methods (2 failures)
and reader two methods (4 failures), each with zero errors and current green.
Only private temporary source copies execute; no tracked source is swapped.

Coordinator executed on Linux x86_64, CPython3.10.12 and pinned
Node24.22.1/Bun1.4.4:

- 93 focused tests pass1.366s, no skips/expected failures.
- Actual mapped F1-02 security:55 checks pass11.49s, complete388-case Python
  payload10.222s under the unchanged18s deadline.
- Current AST, unchanged embedded source and current/historical hash bindings,
  plan and whitespace are verified separately. Previous TypeScript type/lint
  results remain inherited unchanged-TypeScript evidence, not a fresh run.

The previous review independently ran91focused/all386Python/55mapped, 27 passing
additional probes, four reproducing reader cases, current17/historical53hashes,
embedded source, fourASTs/plan/whitespace. Its unchanged-source type/lint were
inherited. Those results cover8cf1b32, not this direct-field correction.

The four prior manifests remain historical at their named commits. The current
coordinator-reader-sha256.json binds this correction and identifies their Git
snapshots. The guest source remains unchanged6b1a383c.../18055bytes. No permit,
capture, CLI, Docker/SSH/lab/guest, package installation/build, privileged/native
or Orca operation occurred. All97/full local1.0, current task/criterion states
and unknown historical timeout-descendant absence remain intact. Fresh final
independent review is required before publication or the first capture.
