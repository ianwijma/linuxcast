# F1-02 source build preparation — 1 November 2026

This coordinator increment follows integrated credential PR85 and prepares the
fresh source input required by the existing native AT controller protocol. It
neither builds nor executes the product, starts the lab, installs dependencies,
creates namespaces or supplies native accessibility acceptance.

The private frozen candidate is approved PR85 head
`beb0d716557c80c5c7e8d63a2527d6de61baa141`, tree
`6176bdd039c68324538d2f3e60414b7c6ae1edc1`. Its source signature was verified
against the configured public SSH key without configuration changes. After
independent final review, PR85 merged at
`6c3d9465c9045a97b8c15bef441500b50dc42197`; its source tree is the same candidate.

Under the existing exclusive lab lock, the coordinator created a private tar:
98,191,360bytes, SHA256
`3d67f4b7c43d7cee7020a39572accfdc03400853eea7201199d9bf9cffecee9a`.
All2,504 archive blobs and executable flags were independently compared with Git.
The archive and original private provenance are mode0400 outside Git. They are
not a product build receipt. The lab was freshly observed stoppedfalse/PID0/exit0
and was never resumed. Source was archived while final review was pending; the
original receipt keeps that historical fact instead of being rewritten.

## Extraction helper

`apps/desktop/tests/at/source_bundle.py` is inert on import. It accepts a fixed
reviewed archive digest, revision/tree provenance, expected file count and a
private canonical destination parent, then creates only a new0700 source tree.
It refuses root, nonprivate or noncanonical destinations, nonregular/nonprivate/
multilink/symlink archive inputs, bad digest/comment/count, traversal, duplicate
or conflicting paths, links/devices/FIFOs, prior build/cache/receipt inputs and
nonzero trailers. Current Git source has no tracked links; dependency symlinks
are installed later inside staging and validated by product_staging.py.

The helper copies/hash-checks a bounded input into a sealed memfd before parsing,
so later source-file mutation cannot change extraction. Limits:256MiB tar/total
content,32MiB per source file,20,000 entries,1,024-byte paths/255-byte components.
It writes private0600 files/0700 executable files and directories. Normal failures
remove only the new owned root; a replaced root is preserved and cleanup failure
retains the original failure category. Kernel/process loss can interrupt cleanup;
outer staging/lab ownership is still mandatory. No wall-clock deadline is added
here: the trusted caller must run preparation under its existing bounded owner.

The CLI emits only private metadata/fixed failure categories. The tree hash is
caller provenance; this helper cannot independently derive a Git tree/signature
from a tar. Archive SHA256 and the Git revision comment bind the input previously
verified by the coordinator. This is not an archive signature or release claim.

## Verification and remaining work

Sixteen offline checks use real private files/memfds and synthetic tar fixtures:
exact content/modes; sealed snapshot mutation; identity/hash/provenance/count;
traversal/conflicts; links/specials; archive ownership/permissions; destination
policy; size/entry/trailer limits; partial-write cleanup; same-UID root replacement
preserved with original failure. These are extraction tests, not native tests.

A deterministic post-check replacement fixture exposed a cleanup race in the
initial aa31f67 helper: the path identity was checked, then `shutil.rmtree`
resolved the name again and deleted a foreign replacement. Cleanup incorrectly
reported success while the original owned tree remained. The new regression
fails against that original source; a separate post-open replacement control
already passes there and remains passing after correction.

Cleanup now opens the root with no-follow/directory flags and checks the actual
opened inode against the identity recorded at creation before traversal. Child
directories stay descriptor-relative and are checked before descent/removal.
The final root binding is checked again; retained directory link counts confirm
the original directories were unlinked. Unknown types, nonprivate entries,
replacement roots or a20,000-entry cleanup bound preserve unverified resources
and return cleanupVerified=false without replacing the original failure reason.
The dedicated nonexecuting preparation UID remains a trust boundary; the helper
does not run untrusted code under it or replace the outer staging/lab owner.

The earlier cleanup correction passed12source tests and the complete65-test
offline AT suite without skips on this saved branch (before incorporation of the
separately merged wrapper).
No build, dependency install, product, display, bus, namespace or guest is run.
Independent review of the entire helper, not only this correction, is still
required before use. Instrument UI adoption stays the coordinator's priority;
fresh approved source/archive/build provenance must follow the updated product.

### Output custody correction

A separate success-path regression against `ce13987` replaced the staging root
during its first ordinary successful file write. The helper returned `extracted`
after later file creations followed the replacement root; no exception forced
its existing cleanup check. Replacing the destination parent could likewise
publish a path outside the retained parent, and replacing a nested directory
redirected a later file creation. All three new regressions fail that exact
saved source and pass the correction.

Extraction now retains the root descriptor, opens each directory component
relative to an owned descriptor with no-follow/directory flags, records and
checks directory identities, and creates files relative to the retained parent
descriptor. Before publication or ordinary cleanup, it rechecks the canonical
parent, root name and known directory bindings. Lost custody rejects the output,
preserves replacement paths and reports cleanup incomplete. A child-directory
fstat fault probe also verifies rejection/cleanup without leaked descriptors.
These are checks within the trusted nonexecuting preparation UID, not protection
against a malicious process with that same UID mutating files after validation.

The entry bound now includes implicit parent directories, before output creation;
a fourth regression fails `ce13987` and passes this bound. The changed helper has
16 passing source tests. No executable, guest or native test was started, and the
entire helper still requires independent review before integration/use.

A host-only smoke extracted the real pinned98MiB archive into an owned temporary
directory, independently verified all2,504 written Git blobs and private modes,
confirmed no .git/dist, then removed that temporary tree. No product build or
native run occurred. The original archive/provenance was not modified.

Independent extraction/namespace/outer lifecycle review, fresh guest runtime/
Rust/header/cache inventory, frozen copy-backend dependencies, actual immutable
Debian product build/receipt and controlled native attempt remain outstanding.
The separate namespace wrapper preparation was merged in PR86; actual invocation
still needs updated approved source, guest prerequisites and reviewed outer ownership.
F1-02-UI remains pending; historical AC01/AC02/privacy evidence is unchanged.
Full local1.0, four-session desktop/AT, real input/audio and release gates remain.

## Earlier approved-develop reconciliation

The saved helper branch now includes approved develop PR89 at
`63c958115d3efec4505efad12f3898aa0003bb93`. Earlier registry/card merge conflicts
were resolved using that authoritative registry, then the cards were regenerated;
no acceptance status changed. The source helper and its tests retain their recorded
hashes. With the separately reviewed wrapper tests present, the combined offline
suite passes **113 tests in12.079s**, with no skips. Both Python parses, both
manifest hashes, planning validation and whitespace checks pass.

This is still unused preparation awaiting independent review. It neither includes
the pending D1 renderer adaptation nor refreshes the historical archive into a
current approved product build. No dependency installation, build, guest, namespace,
display, reader or native product run occurred during this reconciliation.

## Current approved renderer reconciliation

The same four-file helper increment is now reconciled onto approved Instrument
renderer PR91, revision `432fa6a4b129b66bb064816c004f21ddd71971b4`, with the
coordinator merge checkpoint. Both executable/test files remain byte-identical to
the saved `86abb64` and the source manifest; no extractor behavior changed. The
complete offline AT discovery suite again passes113 tests without skips. Both
source hashes and Python parses, planning validation and whitespace checks pass.
No new archive, dependency install, build receipt or native execution is claimed.

The PR85 archive above is historical provenance. It cannot serve as the new
Instrument product source or build. Independent review of this helper is still
required before use; native observer role reconciliation, current approved source
archive, immutable Debian build/receipt and reviewed outer lifecycle ownership
remain separate gates. The saved Instrument DOM adapter is excluded here.
