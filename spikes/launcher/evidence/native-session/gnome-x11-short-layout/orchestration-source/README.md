# S0-01 one-run collection: offline source review

No guest, Docker, SSH, compositor or display access was used to prepare or test
this bundle. No signed launcher source or shared file changed. Invocation is
forbidden until the coordinator explicitly grants the exclusive Debian VM
reservation; a CLI flag alone is not permission.

## Readable code paths

1. `host.py`: verifies the fixed immutable archive/authority, collector/guest-phase
   fingerprints and local reviewed helper/manifest hashes. Creates an owned 0700
   `mkdtemp` transfer capsule under `/tmp`, writes exclusive/no-follow 0400 copies,
   and sends only their synthetic bytes plus reviewed code over stdin through the
   established Docker/SSH command. No container transfer files or key reads occur.
   Only SSH uses the existing fixed lab identity/known-hosts paths. There is one
   connection and no retry.
2. `guest_phase.py`: target/non-root/generic-kernel, zero-graphical/DBus-two/marker
   baseline and pinned owned regular Node/Bun checks precede staging. It internally
   creates its own 0700 guest-home root, exclusively writes inputs, validates the
   bounded archive member types/names before manual exclusive extraction, and
   verifies all 24 source/11 patched/static hashes before helper imports/build.
   Frozen install, explicit Electron setup and fresh build run once each. All Bun,
   temp, XDG and `electron_config_cache` paths stay inside the owned stage. Node/Bun
   hashes are checked before/after commands and after cleanup. Preparation rejects
   enter the same inode-owned cleanup path as post-spawn failures.
3. `collect.py`: validates target/baseline/source/build again, removes only copied
   historical GNOME X11 output inside its owned stage, and invokes the unchanged
   runner once under the reviewed Supervisor. It validates public result/manifest
   and optional renderer PNGs before any publication, and verifies the raw 56f2
   manifest hash plus exact original manifest/source authority again after the run.
   Source/archive/authority cleanup is inode checked and preserves replacements.
4. Guest phase reaps the whole owned process tree before collecting fixed names,
   then removes its entire internally owned root in `finally`, even on preparation
   rejection or a post-spawn assignment failure. It emits only one bounded JSON
   response containing fixed file names and scalar release checks. Literal failure
   categories replace exception text; child stdout/stderr are discarded.
5. Host pipe drain retains at most 24 MiB, discards overflows, and uses no raw log
   file. Host independently validates complete nested report, manifest, provenance,
   cleanup and release schemas before exclusive public writes. Unknown keys/files,
   private canaries, malformed base64, forged signed-tree/physical claims, changed
   source/build and false cleanup claims reject. Input transfer copies are inode
   checked and removed. Only validated synthetic results remain inside the host's
   private capsule for review; failure removes it.

After explicit reservation, the sole entry is `host.py --reserved-one-gnome-x11`.
The fixed guest command is `run-session.py gnome-x11 --private-guest`. The runner's
original 45-second startup budget, single typed information call bounded by one
second/remaining startup time, 180-second checker and 240-second private child
timeout are unchanged. Collector's 300-second ceiling only triggers cleanup.
Guest phase allows 330 seconds for collector plus teardown; each of the three
non-native preparation commands has 180 seconds. Host transport allows 920 seconds
for all preparation/collection/cleanup. These outer guards add no native readiness
waits, retries, relaunch, reload or backend change.

Only fixed public report/manifest, optional own-renderer/CDP dark/light PNGs,
provenance, cleanup and `release.json` survive host validation. Native incomplete
outcomes remain incomplete. Missing markers/unavailable information do not prove
a cause. Zero exit requires bounded native success plus clean release; otherwise
exit is three. Transport failure means release is unverified, without automatic
reconnect. SIGKILL/VM termination cannot be claimed as cooperatively cleaned; no
process policy or service is changed.

Provenance distinguishes 24 runtime inputs/static authority matching signed
`d8b6f6e8cedfe76e5c97fdac6a0ebe81940f9cab` from unsigned archive construction at
signed `a3db48d` plus reviewed 51ed patch. It rejects claiming the entire archive is
the signed tree. Historical unsigned-at-execution 398c/2111 evidence and immutable
snapshots remain unchanged. No portal consent, physical session matrix, audible
screen reader, compositor screenshot or acceptance closure follows preparation.

`test_collect.py`: 28/28 harmless checks pass. `test_orchestration.py`: 18/18 pass.
They use local private temporary files, synthetic parser data and owned harmless
Python descendants only. Entry/Docker/SSH/native actions are never invoked.
Tests cover early preparation cleanup, failure after process creation but before
assignment, timeout/no retry, pipe overflow discard, source/manifest tampering,
strict public/private field rejection, collision/inode preservation, pinned tools
and cache containment. A full guest-flow cancellation fixture sends the first HUP, then five repeated HUPs during the existing teardown of a detached TERM-resistant descendant, and asserts no owned descendant remains before root deletion. Only orchestration masks repeat HUP during teardown; the reviewed runtime supervisor and its eight-second grace are unchanged. All Python files parse. `manifest.json` fingerprints this
frozen bundle; scripts/tests/readme/manifest are read-only.

The complete bundle can be preserved under owned
`spikes/launcher/evidence/native-session/gnome-x11-prevalidation/` after reviewed
execution. It contains no private state, keys, raw logs or host application data.

## Short-layout increment (not executed in a guest)

The reviewed failed 1cca run and its original bundle remain unchanged elsewhere.
Its private bus template was 113 encoded bytes; a harmless owned local AF_UNIX
fixture confirms 107 accepted, 108/113 rejected. Restricted sandbox first blocked
the positive bind with EPERM; unchanged checks pass under ordinary approved local
socket permission. This proves a layout defect, not the sole discarded historical
runner cause.

Only orchestration changes: guest mkdtemp uses exact lc1- plus eight characters,
and the collector's TMPDIR is source/t inside that same existing owned root.
Private canonical/0700/UID/inode checks remain. Encoded fixed socket templates are
prechecked against 107 bytes, and unexpected generated suffix length rejects before
source verification or child invocation. Session bus is 78 bytes, fixed native
Wayland socket 96; runtime bus and full ten-digit signed-pid_t-safe AT-SPI template (95 bytes) also remain below
107. No second ownership domain is introduced. Snapshots detect historical/new
other collection roots while excluding only their own current capsule. Strict
provenance exports only fixed numeric path lengths/max, never raw runtime paths.
All frozen runtime inputs/archive/authority/56f2 output and original budgets,
no-replay/identity/backend/activation assertions remain unchanged. HUP teardown
shield and full resistant-child regression remain in place. No new guest run,
readiness wait, retry or acceptance evidence is claimed.
