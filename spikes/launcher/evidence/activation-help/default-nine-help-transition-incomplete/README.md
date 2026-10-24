# Default-nine help transition — incomplete

Exactly one actual run of `node spikes/launcher/tests/at/xvfb-orca.ts` ran
on 24 October 2026, 10:41:50–10:43:07 UTC, and exited 3 at
`focus:View activation help`. There was no retry.

The first five native focus and fresh Orca generated-presentation/dispatch-attempt
checks passed, including Record shortcut and Cancel shortcut change. The new
fixed Record focus-event receipt observation is true. The sixth checkpoint
reached the View activation help button with its exact native role and focus
event, but fresh generated-presentation and dispatch-attempt observations remained
false. Heading, landmark, Say All and final Escape checks were unreached.

This is an incomplete full-sequence result. It neither diagnoses the earlier
Record failure nor replaces the separate successful focused help-reading run.
Ordinary dispatch-attempt markers do not establish speech receipt or audible
output. No compositor, physical input or complete desktop-matrix result follows.

## Source and platform

The selected 335 non-evidence inputs match signed commit
`2fcbdaed159ff10aa313ad0555eaf379ce1f7f40`. Its signature was verified against
the existing configured public key; no signing configuration changed.
`source-manifest.json` lists these hashes and the 419 preserved evidence paths
excluded from the signed-source subset. All 754 guest integrity entries were
checked before and after execution. This is not verification of a whole signed
checkout, and the 419 archived evidence files are not claimed as current source.
The five changed selected inputs were transferred in a separately checksummed
private archive and independently compared with their signed Git blobs.

Platform: isolated Debian 13.7 amd64, cloud kernel 6.12.113, private Xvfb,
Orca 48.1, Electron 45, Node 24.22.1 and Bun 1.4.4. Runtime and source hashes
are in the fixed JSON artifacts. The help notice state is synthetic and app-only.
The three screenshots show only the launcher's actual dark search/actions and
light shortcut views. No help screenshot was reached. Applicable design sections
are Accessibility, States and motion, and Review gate.

## Provenance and cleanup

`execution.json` names each authority by hash:

- `priorReadinessSha256` refers to the exact copy `original-readiness.json`,
  the fresh guest's preparation record before the earlier 9af33f checker run.
  It supplies the original package/runtime and 13 installed Orca source hashes;
  it is not this run's resume baseline or current checker authority.
- `readinessSha256` refers to this folder's `readiness.json`, checked after
  transferring the signed subset.
- `sourceManifestSha256` refers to this folder's `source-manifest.json`.
- `resume-baseline.json` separately records the preserved guest baseline before
  transferring the five changed inputs.

The historical records' `sourceFilesVerified: 754` counts integrity entries,
including the 419 evidence files; it does not mean 754 application source files.
The exact original readiness fields and old checker hashes remain unchanged.

Cleanup at 10:44:14 UTC found all 12 owned process counts zero, private roots
absent and the input-lab marker absent. Selected source, preserved evidence,
runtime, Electron, 13 Orca files and packages were unchanged. Guest poweroff
completed normally; independent Docker inspection confirmed stopped, exit 0,
PID 0 at 10:44:42 UTC. Raw Orca logs, profiles, keys and guest disks remain
private or were discarded; none is included here.

The full default-nine accessibility sequence and actual native unconfirmed-notice
reproduction/manual recovery remain outstanding. S0-01 UI remains pending.
