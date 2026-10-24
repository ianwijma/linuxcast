# KWin Wayland diagnostic — fixed decoy identity rejection

Exactly one reviewed diagnostic run on signed13b9e2a7e882fe218fecba00974041538edb3296 exits3/incomplete at `decoy-challenge`. [Provenance](provenance.json), [all23 exact source inputs](source-manifest.json), [safe report](report.json) and [cleanup](cleanup.json) are retained separately from the original3528 attempt.

The last fully parsed observation is request15, phase `decoy-native-ready`, state `predicate-unmet`. The fixed decoy PID has one candidate, but both expected-ID comparisons (`resourceClass` and `desktopFileName`) are mismatches. Geometry/work area are not inspected and no decoy activation is issued. This proves parsed identity rejection, without retaining raw identifiers or identifying its cause. Earlier actual launcher native Wayland identity/geometry and resident close remain partial observations; ordinary CLI challenge, shortcut/portal consent and explicit Quit completion remain unexecuted.

The partial dark image is synthetic own-renderer/CDP only. No source changed during execution; no assertion/identity gate was relaxed. Fixed native processes/private roots and exact input marker are absent after the run; the final guest stage/caches were removed in [the clean release](../release-diagnostics-20261022.json). No physical/session or complete task acceptance is inferred.
