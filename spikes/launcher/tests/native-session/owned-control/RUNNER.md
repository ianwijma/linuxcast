# Exact-owned X11 control session adapter

This separate adapter implements only the fixed KWin X11 auxiliary-window
control. It does not route the full or lifecycle-only launcher probe through
new code. The existing nine control placement files remain unchanged from
signed commit `67b186b1b0cae64f7f65d1547dc7440d6f573f7c`; its original application
and observer authority remains the exact D21 manifest. Neither a new signed
runtime anchor nor a native control outcome is claimed by this source increment.

`session.py` reuses the existing target/private-context guards and process-local
Supervisor. Before effects it requires the fixed owned `/home/debian/lc1-XXXXXXXX/source`
layout and a `control-authority.json` file in that capsule's parent. The future
trusted collector must supply its independently pinned SHA-256. The descriptor
is duplicate-free fixed data capped at 16 KiB: exact control kind/backend/mode,
D21 application-observer manifest digest, six control-runtime source digests,
and the fixed Node digest. It carries no commands, paths, principals, grants,
or signed-commit claims. No actual authority descriptor or archive has been
prepared for execution in this increment; fixtures create synthetic descriptors
only in their own disposable directories.

The reader retains a no-follow directory-FD chain, opens the regular leaf
relative to the retained parent, and checks all ancestor/leaf identities after
reading. Files must be owned by the current UID and have one link; private
files must have mode 0600. The capsule/source/temp directories must be canonical
owned mode 0700. Fixed source/static/build bytes and the Node tool digest are
checked before use and after owned child teardown. This is a disposable trusted
collector tree, not a security boundary against another hostile process with
the same UID continuously changing executable files during execution. The
future outer collector must continue to isolate and own that tree.

Startup retains the original 45-second KWin owner-ready bound, followed by one
180-second control invocation inside the original 240-second private session
bound. There is no observer script, activation, shortcut, retry, or additional
readiness window. The future collector must retain the original outer
300/330/920-second bounds. Private bus/runtime templates must fit 107 UTF-8
bytes; TMPDIR is explicitly the owned `source/t` directory. Teardown masks
repeated HUP and reuses the Supervisor's TERM/INT and descendant protections.
An unverified teardown preserves its root and prevents publication.

`public.py` accepts only this distinct report/source-manifest protocol, rejects
unknown fields and duplicate JSON keys, and validates both complete objects
before creating output. Private control files are read only after owned
process-tree teardown. The fixed public files are `result/report.json` and
`result/source-manifest.json`; no window/process IDs, raw errors, logs, or images
are published. A complete control can set `controlChecksCompleted=true` only
with all six fixed proofs, the expected integer driver/session exit 3, unchanged
source, and verified cleanup. It still reports `status=incomplete` and returns
exit 3. Full acceptance, lifecycle, focus/shortcut and physical desktop flags
always remain false. A timeout or wrong outer exit cannot promote an inner
complete record.

## Source-only verification

Run from the repository root:

```
python3 -B -m unittest discover -s spikes/launcher/tests/native-session/owned-control -p test_session.py -v
/tmp/linuxcast-node24/node spikes/launcher/tests/native-session/owned-control/fixture.mjs /tmp/linuxcast-s0-01
```

The 31 new Python tests replace every compositor/process/native supervisor
entry and signal installation. They exercise actual source verification,
publication, fake-clock startup, fixed entry, cleanup order and failure paths,
parent/leaf substitution, UID/mode/link/size checks, strict schemas, and timeout
promotion rejection. The retained 29 Node tests include the existing five
synthetic Python pair groups. No Electron, Xlib, display, hardware, guest,
libudev, or real process-tree supervision is invoked by the new tests. The
existing missing-argument Node fixture needs ordinary local subprocess
permission; an initial restricted run passed 28 and blocked that child with
EPERM, then the identical permitted rerun passed all 29.

Real native positive two-owned-window selection, swapped-binding denial,
actual teardown, and the session/backend matrix remain pending. These mocks
and control code do not establish S0-01 AC01/AC02/UI or any acceptance closure.
An actual verified signed commit covering 31 runtime and three static inputs,
separately reviewed compact archive and collector, and explicit native-run
reservation are still prerequisites for future execution.
