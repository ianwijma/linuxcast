# KWin X11 — incomplete native probe

Exact unchanged checker3528f160390707e7dc7e48251e4bbe0cdb1d655a234c8a7501e30214bc7df593/source inputs matching signed3c747cc ran in the reserved isolated Debian13 KWin6.3.6 X11/privateXvfb session. [Full manifest](source-manifest.json), [safe report](report.json) and [post-run cleanup](cleanup.json) are preserved. Exit3/statusincomplete at `native-initial-identity` is not acceptance success.

Actual Electron45/X11 strict sandbox/context isolation/no renderer Node assertions pass. No poll satisfied the initial exact launcher-count condition, leaving the persisted native observation list empty. Since the driver saves only successful predicate observations, this artifact cannot distinguish a missing acknowledgement from count/identity/geometry readiness. Native identity, geometry, focus, shortcut activation and lifecycle remain unestablished; no screenshot or failure cause is claimed.

All fixed native processes, private roots and the exact input marker are absent after the run; two DBus daemons are the established guest baseline. No source change or unrelated application/content inspection occurred. Any diagnostic/fix requires separate review, and all relevant target gates remain pending.
