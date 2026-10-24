# KWin X11 diagnostic — multiple windows for own launcher PID

Exactly one reviewed diagnostic run on signed13b9e2a7e882fe218fecba00974041538edb3296 exits3/incomplete at `native-initial-identity`. [Provenance](provenance.json), [all23 exact source inputs](source-manifest.json), [safe report](report.json) and [cleanup](cleanup.json) are retained separately from the original3528 attempt.

The last parsed observation is request12, state `predicate-unmet`: the launcher PID has two candidates. The exact-one PID gate therefore prevents every launcher identity/geometry inspection. The fixed decoy has one candidate, matches the expected desktop-file identity channel, and has actual native X11 backend/positive geometry/work area. No decoy activation occurs. This establishes PID multiplicity, without identifying either candidate or implying that either is the intended launcher target. No launcher native identity/backend/focus or lifecycle success is inferred.

No source changed or identity gate was broadened. Final fixed native processes/private roots and exact input marker are absent; own stage/caches were removed in [the clean release](../release-diagnostics-20261022.json). No screenshot was captured before this failed initial target assertion. Any exact-target selection fix needs separate source review and native execution authorization.
