# Coordinator correction: retain FD3 cleanup custody

Initial independent Standards68e794e0 and Security/Specb0cccb33 reviewed
`00e261702eb70a66ca4a2320ae7a02fa437aadfb` against approved PR100. Both found
the same P2: `run()` cleared `proof_pending` before `preflight()` entered its
consumption guard. A cancellation at either function entry left FD3 open while
publishing cleanup=true. No native work began. No other actionable finding.

Both independently passed53 wrapper/19 controller tests, all290 Python without
skips (8.951/9.037s) and55 mapped security checks within the unchanged18s bound,
historical controls/current positives,30 source hashes/23 ASTs/plan/whitespace.
Their actual guest/public-metadata facts were inherited, not independently run.

## Correction

One internal `ProofCustody` object spans CLI, run, preflight and consumption.
There is no boolean ownership handoff before a callee enters. The outer owner
remains responsible until the shared guard records its close attempt.
The guard marks the close uncertain before releasing the numeric descriptor,
clears uncertainty only on confirmed close/EBADF, and never retries an ambiguous
close. Later staging/session code can reuse FD3 without the outer finalizer
closing that new resource. Remaining uncertainty prevents cleanup=true.

The guard covers early deadline/preflight/consumption cancellation and CLI-to-run
entry; the main guard also survives report/publication failures outside run.
Private internal Python parameters are not CLI/environment overrides. All
descriptor authority, namespace/map/proc, UID/capability, staging/receipt,
native-input/accounting and lifecycle gates remain unchanged.

Five new behavioral methods cover four interruption boundaries, CLI/run entry,
ambiguous close, numeric descriptor reuse and cancellation immediately at the
close attempt. Synthetic descriptor operations never overwrite a host FD3.
Older lifecycle fixtures replace preflight completely, so they explicitly use
fake proof custody without operating on host descriptors.

`check-custody-regressions.py` loads trusted fixed Git source in memory, with
inert __main__ and linecache entries. Against the exact reviewed source, the
three original-failure methods produce five behavioral failures and zero
errors; all three pass the correction. Two additional private source mutations
prove that removing the single-close guard or uncertainty accounting makes the
reuse/unknown-cleanup tests fail. No tracked source mutation or privileged/native
operation. The helper's first repo-root calculation was one level high and
failed to import; corrected before these behavioral runs, not a product failure.

Current24 focused controller tests and55 mapped security checks pass, including
all295 Python cases without skips or expected failures, under the unchanged18s
bound. The original53 wrapper tests are unchanged. Current source hashes are
recorded separately in `coordinator-custody-sha256.json`; the author's original
`source-hashes.json` remains the historical96b42643/00e2617 snapshot, not a claim
that the two corrected files still have their original bytes.

Independent final recheck is pending. No new guest, wrapper/controller CLI,
provisioning, build, native/Orca operation, installation, source/archive/receipt/
permit reconciliation or acceptance promotion occurred. Full97/local1.0 and
historical cleanup limitations remain unchanged.
