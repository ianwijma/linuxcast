# Default accessibility sequence: help-event observation

Exactly one default-nine invocation ran on 24 October 2026, 11:24:51–11:26:13 UTC,
on signed source `55301bffde97ca3cf2a8bc893f8f39df7d0a3618`. It returned
**exit 3 / incomplete** at `focus:View activation help`; no retry occurred.

The first five native focus, generated presentation and dispatch-attempt checks
passed: Search commands, Hide launcher, Actions, Record shortcut and Cancel.
The help button then passed native focus. Its fresh Orca observations record
receipt, queueing and dequeueing, but do not establish processing completion.
Required fresh generated presentation and dispatch attempt were absent. This
does not identify a cause or prove the event was never processed. The heading,
landmark, Say All and final Escape/Search checks were not reached. Record receipt
and all three Dismiss anchors were observed. Earlier failed and focused-passing
runs remain separate evidence; this result does not reinterpret them.

## Environment and provenance

Actual isolated Debian 13.7 amd64, generic `6.12.113+deb13-amd64`, private Xvfb,
Electron45, Orca48.1-1+deb13u2, AT-SPI2.56.2 and SpeechDispatcher0.12 with dummy
output. Node24.22.1 and Bun1.4.4 hashes are recorded. The guest received the
reviewed generic-kernel/GNOME/Mutter preparation before this run. The preceding
run used the cloud kernel; this is not a controlled comparison or evidence of a
historical failure cause. No native compositor or physical desktop was exercised
by this accessibility run, and dummy speech establishes no audible result.

`source-manifest.json` binds 335 selected files to the signed commit and explicitly
excludes 419 preserved historical-evidence paths. All selected Git blobs and the
11 changed regular archive members were independently verified. The count 754
in readiness/cleanup is the combined integrity-entry count, not 754 signed code
inputs or proof of a whole signed checkout. The changed-file archive and full
before/after guest manifests remain private execution records; the public
manifest and Git commit identify every selected input. The checker hash is
`ec0bd47b0c225db2cab2d1e70ec8fbaef0b320283674bb4d0c5727f34f52e462`.
The four event booleans are observational and did not change success requirements
or deadlines. Five prospectively required Orca source hashes matched the installed
runtime; the historical thirteen-file authority remains separate.

The fixed JSON and PNG files are unchanged copies. Relative paths inside the
execution records describe their original private layout. Their public mapping is:

| Original record/reference | Public file and verification |
| --- | --- |
| `execution.historicalOrcaAuthorityReference` (`../../readiness.json`) | `original-readiness.json`; hash equals `historicalOrcaAuthoritySha256` |
| `execution.genericPreparationReference` and readiness preparation reference | `generic-boot-readiness.json`; hash equals `genericPreparationSha256` |
| Current readiness, resume baseline and source manifest | Same-named files; hashes in `execution.json` |
| Running handoff cleanup reference | `cleanup-and-source-after.json`; hash in `handoff.json` |

## Cleanup and visual evidence

Cleanup at 11:28:29 UTC records all 18 owned process counts zero, only the system
D-Bus daemon remaining, four private-root prefixes and the input marker absent,
and all 335 selected plus 419 preserved entries, runtimes, packages and both Orca
comparisons unchanged. Fixed output files and the private execution log were
removed after verified copying. The guest was handed back **running** at
11:28:58 for a separately authorized native reservation; this record does not
claim shutdown or authorize another test.

The three reviewed PNGs show only the app's dark search, dark actions and light
shortcut view. No help-page image was produced because that phase was not reached.
No raw Orca logs, profiles, credentials or unrelated application pixels are
published. Applicable design sections: Accessibility, Shell/navigation and Review
gate. S0-01-UI remains pending; this incomplete result provides no acceptance
promotion, ordinary speech receipt, audible/tactile QA or full desktop matrix proof.

All sixteen original execution checksums, selected Git blobs, changed archive
members, authority references, fixed reports, three images and cleanup were
independently reviewed. `SHA256SUMS` covers the fifteen public copied artifacts.
