# GNOME X11 diagnostic — reply missing after Close

Exactly one reviewed diagnostic run on signed13b9e2a7e882fe218fecba00974041538edb3296 exits3/incomplete at `resident-close`. [Provenance](provenance.json), [all23 exact source inputs](source-manifest.json), [safe report](report.json) and [cleanup](cleanup.json) are retained separately from the original3528 attempt.

The initial native observation establishes exact launcher/decoy identity, native X11 backend, positive geometry and work area. The launcher matches its WM_CLASS expected-ID channel; the GTK decoy matches its GTK application-ID channel. After Close, the trace records a written `after-close-native-hidden` request with no matching fully parsed reply, while retaining the last valid initial observation. This narrows the failure stage; it does not prove an extension exception, compositor crash, geometry cause or successful resident/native-hidden lifecycle assertion.

The partial dark image is actual synthetic own-renderer/CDP only. No source changed, no unrelated metadata/content was read, and no private identifier/exception was exported. All fixed native processes/private roots and exact input marker are absent after the run; final owned guest stage/caches were removed in [the clean release](../release-diagnostics-20261022.json). Broader target acceptance remains pending.
