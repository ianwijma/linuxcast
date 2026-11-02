# Actual reviewed projection capture

Executed 2 November 2026 UTC after PR104 merge
`0a363239473cfc81c2c3d4895d1d5c3df2f4fe87`, with exact independently reviewed
`27a9f73873993439cddb8a8b5a50814f8bdc7991`. Initial Standards6a27b37d and
Security/Specbb7a5297 were clear before publication; current-head planning CI
41370128888 passed before the normal merge.

**Outcome: unavailable/keyring, no package baseline.** One fixed capture ran
02:37:04.507860–02:37:39.161323 UTC, monotonic34.644s, exit3, zero automatic
retries. It passed the earlier assembled-field refusal and reached keyring
collection. No package snapshot/count/digest was published. This does not prove
which original package field caused the earlier refusal or why keyring failed.

Exact approved source47929bytes and embedded probe19044bytes were sealed under
0500/0400 custody. Under the unchanged original0664 reservation lock, the used
3536145 permit was archived no-replace, preserving inode, bytes and0400 mode;
a fresh14-key permit and UUID admitted this one metadata job. The fixed Python
CLI/environment, linuxcast/sudo identity, guardian and shutdown budgets were
unchanged. The private invocation harness is retained0400 with its recorded hash.

The reviewed owner reports valid reply, incomplete/transport, cleanupnone,
owned children absent, stopped and reservationclean. Independent postflight
confirms exact caller reaping/own subreaper ECHILD, full pinned container
exited/runningfalse/PID0/exit0, no marker, original lock reacquired, unchanged
source/permit and stderr0. This establishes this normal refusal cleanup, not
interruption recovery or historical unknown descendant absence.

- [Unmodified owner output](owner-result.json).
- [Invocation and clock boundaries](invocation.json).
- [Independent postflight](postflight.json).
- [Source/probe/permit provenance](source-provenance.json).

Only fixed lifecycle metadata, nulls and hashes are public. No actual package
body, keyring bytes, credentials or environment contents entered these records.
Prior private sources/permits/outputs remain preserved. No package resolution,
installation/build/receipt, rootdrop/statx/containment/native product/Orca,
desktop/session/physical/provider/release or whole-task acceptance is established.
F1-02 stays in-progress/UI pending; all97 task/dependency/acceptance states and
full local1.0 scope remain unchanged.

## Offline diagnosis and next correction

Debian's [2025.1 packaging Makefile](https://sources.debian.org/src/debian-archive-keyring/2025.1/Makefile/)
builds a regular `.pgp` keyring and a `.gpg` symlink, then preserves that alias
when installing. Its [README](https://sources.debian.org/src/debian-archive-keyring/2025.1/README/)
names `.pgp` as the canonical active keyring. A private synthetic fixture with
that exact layout reproduces unavailable/keyring in the real collector:
one behavioral assertion failure, zero errors, all owned descriptors retired.
This proves a Debian13 compatibility defect, without establishing the actual
guest path's type or excluding size/permission/read causes of the actual result.

The coordinator freezes the minimal canonical fixed-path correction in
[build-facts-protocol.md](../../../tests/at/build-facts-protocol.md) before code.
Read `.pgp` directly, preserving every custody/bounds guard; never follow the
alias or try a fallback. Independent review and fresh source/permit precede the
next real capture. This evidence records no such correction execution.
