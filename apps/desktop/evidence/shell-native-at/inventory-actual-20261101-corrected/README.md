# Corrected actual Debian inventory

After PR100 merged at `69decac2bd695de53d24e5595770b2e546d362be`, the
independently reviewed `084e7dc` source was staged afresh as private0500/0400
files. A new exact13-field0400 permit bound the corrected source/probe hashes.
The old permit was retained under its used-source name, preserving its inode
and bytes under the existing exclusive lock. Neither the original run nor its
evidence was overwritten. No private user-data or key contents were read.

The same closed inventory-only CLI ran once, from `/` with closed stdin and
the fixed four-variable environment. `invocation.json` records
2026-11-01T13:20:48.713730Z to13:21:30.411073Z (2November Sydney), **41.697s,
exit0**, exact caller reaped and zero automatic retries. This is a new reviewed
invocation after a source correction, not replay of a failed product input.
No build, installation, namespace creation, display, bus, product or reader run.

## Validated facts

The unchanged `owner-result.json` passes the strict owner and guest validators.
Its lifecycle is completed, both failures are none and all metadata categories
are known. In contrast, the first run preserved packagesunknown. This successful
corrected run demonstrates that the narrow parser change handles this guest;
the original raw failing package field was never collected or identified.

Actual selected versions include Python3.13.5-1, Orca48.1-1+deb13u2,
AT-SPI2.56.2-1+deb13u2, D-Bus1.16.2-2, speech-dispatcher0.12.0-5,
Xvfb21.1.16-1.3+deb13u4, systemd257.13-1~deb13u1 and
util-linux2.41.5-0+deb13u1. The exact fixed package versions are in the JSON;
these are package metadata, not executable/source hash or ABI verification.

gcc, g++, make, pkg-config and all seven selected development packages are
confirmed absent in that metadata. UID/GID20000 accounts are absent and no
process uses the UID. The snapshot counted101 processes, with zero fixed-name
graphical/test candidates. It is not a historical or exhaustive process proof.

The capability-free feasibility child again observed self net/PID namespace
metadata, but access to both PID1 entries was denied. Equality stays unknown.
Its exact cleanup succeeded. The old wrapper AND controller therefore remain
blocked; no new capability, permission or fake namespace view was introduced.

## Cleanup and scope

The owner reports ownedChildrenAbsent, containerStoppedVerified and
reservationClean true, cleanupFailure none. A separate fresh inspect revalidated
the pinned configuration and exited/running=false/PID0/exit0; the marker was
absent and the original lock inode/mode was reacquired. Empty stderr and exact
caller reaping are recorded. These postflight checks supplement, rather than
replace, the owner's independently retained child cleanup proof.

`postflight.json` records source/probe/permit pins and bounded fresh checks.
Private originals and staged sources are retained. Historical timeout-child
absence gaps remain unknown. No interruption/crash recovery test was run here.

This proves successful bounded inventory, SSH/sudo and clean shutdown of this
pinned guest. It does not establish build-tool availability, actual product
build/receipt/ABI, namespace containment, native AT, Debian desktop matrix,
physical-input/audio or release acceptance. Product/Orca runs remain0 and all
task/criterion states remain unchanged. Next: reviewed namespace proof handoff
and narrowly scoped build provisioning with immutable current source custody.
