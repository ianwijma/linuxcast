# F1-02 fresh lab reservation and preflight

31 October 2026: the coordinator reserved the existing v4 lab with an exclusive
advisory lock, resumed its stopped Docker/QEMU guest, connected through its
existing strict-known-host identity inside the container, checked the owned
baseline and package/source versions, then requested shutdown and verified
container exit0/PID0. No host device or port was exposed; no display, product,
Orca, speech, input or native accessibility test was started. Actual native
product runs remain zero.

[report.json](report.json) records fresh Debian13.7/cloud6.12.113, Orca48.1 and
AT-SPI2.56.2, zero owned desktop/reader/test/bus process counts, no private test
roots and no input marker. Optional input service is not installed/inactive.
Thirteen installed Orca source hashes match the existing reviewed baseline.
These are infrastructure facts, not product accessibility acceptance or a
complete source/runtime/build attestation.

This resolves the earlier stopped/unreserved-guest access blocker. Missing
product session controller, fresh-output parser and strict publisher wiring now
remain the next implementation work. The original preparation report and zero-run
record are preserved. Build a fresh staged product with immutable authority and
review the controller before one bounded actual test. No host Orca fallback.

The host preflight helper was temporary, not a supported production test runner;
its SHA256 is recorded alongside the report for provenance. SSH private material
was passed by file path inside the existing container and was never read into a
report or transcript. The lock was released after confirmed shutdown.

The coordinator preserved the original child preparation manifests, whose hashes
refer to signed fc0fdb2. Its protocol README now additionally documents runner
mapping and this fresh preflight; the three Python implementation/test blobs are
unchanged. Current preparation hashes are in coordinator-source-sha256.json.
Mapped55security checks (one runs all14Python checks), full pinned typecheck/lint,
planning validation and diff checks pass. No actual native check is inferred.
