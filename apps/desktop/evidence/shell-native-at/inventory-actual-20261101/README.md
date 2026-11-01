# First actual Debian inventory — partial facts, clean shutdown

One reviewed inventory-only invocation ran on 1 November 2026 UTC
(2 November in Australia/Sydney). It returned exit3 after 66.924s.
This is real Docker/QEMU/SSH/sudo and graceful-shutdown evidence, not a
successful complete inventory or product/Orca/native accessibility run.

## Source and custody

Approved develop was `c71ef81e2b06922fde635565523e4b57eee004a4` (PR99,
including PR98). Three immutable host inputs matched reviewed source
`a744b7b072a950d178c684987009d4aeca2ecf6e` byte-for-byte. A private0500
source directory held owned single-link0400 files. The exact13-field
private0400 permit bound their hashes, embedded source and retained lab root.
The existing lock inode/mode were preserved. Rejected `abff18a` was not used.
No private user-data or key contents were read by the coordinator.

The fixed invocation used `/usr/bin/python3 -E -s -S -B`, the reviewed
`lab_inventory_owner.py` and its two required review flags. It ran from `/`,
stdin closed, with only the owner's fixed PATH/HOME/LANG/LC_ALL. No command,
account or timeout overrides, automatic retry, build, installation, display
or reader operation. Outputs were newly created0600; stderr was empty.
The caller retained and reaped its exact owner process. The owner independently
supervised its guardian/transports and reported owned-child absence.

## Actual result

`owner-result.json` is the unchanged, strict-schema-validated result. The owner
reported incomplete/firstFailure=`transport` with a valid guest reply; the
guest's firstFailure was `packages`. Partial metadata remains incomplete:

- `linuxcast` key transport and noninteractive sudo reached effective UID/GID0,
  with the expected sudo UID/GID1000 identity.
- Debian13/amd64 was observed. VERSION_ID13 does not establish the previously
  recorded point-release version.
- Package versions are **unknown**, not absent. A subsequent offline valid
  multiline-field fixture exposes a parser defect. This is a plausible cause,
  not proof of the exact guest input that failed. No raw guest package database
  was collected.
- Fixed Python, Orca, D-Bus, Xvfb, xauth, xdotool, speech-dispatcher, sudo and
  systemctl paths were present as recorded; gcc, g++, make and pkg-config absent.
- UID/GID20000 accounts were absent; zero processes used that UID. The bounded
  snapshot counted98 processes and zero graphical/test candidates. This is
  neither an exhaustive proof of process types nor historical fixture cleanup.
- The capability-free feasibility child could inspect its own net/PID namespace
  metadata, but both `/proc/1/ns/net` and `/proc/1/ns/pid` were denied. Its cleanup
  succeeded. Namespace equality remains unknown, never inferred true. No
  namespace was created/changed. Current native wrapper checks remain unmet.

## Shutdown and acceptance limits

The owner reported cleanupFailure=none, containerStoppedVerified=true,
ownedChildrenAbsent=true and reservationClean=true. Separate fresh read-only
inspection revalidated pinned configuration, exited/running=false/PID0/exit0.
The marker was absent and the same existing lock was reacquired. These checks
supplement the owner's child proof; they do not replace it. The fixed graceful
cleanup path completed without a forced-stop failure.

`postflight.json` records bounded checks and source/permit hashes;
`invocation.json` records timestamps, duration and exact caller reaping.
Private originals remain retained without overwriting native evidence.
Historical timeout-descendant absence gaps remain unknown.

F1-02 AC01/AC02/privacy evidence and UI/task states are unchanged. Product and
Orca native runs remain0. This does not prove interruption recovery, containment,
a Debian build/ABI/receipt, supported desktop/AT, physical-input/audio or full97
local1.0 acceptance. Next: reviewed package parsing, build provisioning and a
reviewed namespace-identity check across privilege drop preserving isolation.
