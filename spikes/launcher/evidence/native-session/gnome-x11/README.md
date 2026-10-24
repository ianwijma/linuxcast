# GNOME X11 — incomplete native probe

Exact unchanged checker3528f160390707e7dc7e48251e4bbe0cdb1d655a234c8a7501e30214bc7df593/source inputs matching signed3c747cc ran in the reserved isolated Debian13 GNOME48.7 X11/privateXvfb session. [Full manifest](source-manifest.json), [safe report](report.json) and [post-run cleanup](cleanup.json) are preserved. Exit3/statusincomplete at `native-initial-identity` is not acceptance success.

Actual Electron45/X11 strict sandbox/context isolation/no renderer Node assertions pass. No poll satisfied the initial exact launcher-count condition, so the persisted native observation list is empty. The driver persists only successful predicate observations; this artifact cannot distinguish a missing acknowledgement from a count/identity/geometry-readiness mismatch. Native identity, geometry, focus, shortcut activation and lifecycle assertions remain unestablished. No cause is claimed and no unrelated window/content is read to diagnose it. No screenshot was published for this incomplete phase.

Fixed native processes/private roots are gone and the exact input marker is absent after the run. No source change occurred during execution; any diagnostic/fix requires separate review. HostGNOME42 evidence remains separate and cannot close this target gate.
