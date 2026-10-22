# S0-03 reviewed-source execution plan

Preparation only. Requires the coordinator's explicit exclusive Debian VM
reservation before any guest command. No runtime, staging, marker, device or
policy operation has been performed under this plan. The17 reviewed files remain
frozen at diff SHA256 `d83d44dd8d096cbd59cc9e91867ee042ff647605ad22031bd05c3df3b82b3892`;
this plan is a separate owned document. No signing or shared-file edits.

## Fixed artifacts and prerequisites

Revalidate every entry in `/tmp/linuxcast-s003-denial-files.sha256` and
`evidence/denial-source-sha256.txt` locally before staging and after completion.
The fixed native artifacts are:

| Artifact | Exact SHA256 |
|---|---|
| Device-free denial probe | `b6c526b5bb853cab416b27bea36c0b216c2cd11bd946de266dc7e301eef7b7d4` |
| Private denial helper | `f0e96dbc18b9a2726b52f3a80ad9b0b6f8e2973146d849a48c2d90f563b1a9e2` |
| Refactored supervisor | `2e959061d64eff7e2e051cc8ec402d0270512a9dd8bc1cbbd184675604d9953d` |
| Prior accepted supervisor (backup/restore only) | `1060b44313a1536926d89303625b9f91272a1f59a5d05ac803e026843e11ef7a` |
| Previously accepted, unchanged worker | `45fae18d283eee7bfbff39fbe060b29c040d951db248d04bc5aa5eba1ce00eb8` |
| Previously accepted, unchanged synthetic lab | `9211ceb29ae2373717f2fc74d591544898ac2931c3f83deaf21186b7b6da7e51` |

The last two hashes are the **accepted old bytes**, not the current local rebuilds
of their unchanged source. Their sources and the manufactured C boundary must
match the accepted source manifest. Verify the guest's existing accepted files
at `/opt/linuxcast-input-spike/` without executing them. If absent or different,
stop; do not substitute rebuilt binaries or change their identity guards.

After reservation, verify actual Debian13.7/amd64, generic6.12.113+deb13-amd64,
native libsystemd257.13-1~deb13u1 and libevdev1.13.4. Retain only public versions
and prerequisite booleans. Baseline must have no native compositor, Xvfb,
Electron, Node, GDB or input-spike processes; DBus at its known baseline2; no
graphical logind session, input-lab marker, manufactured Linuxcast devices or
private desktop/observer roots. Abort on a conflicting session/reservation.
The existing dedicated `linuxcast-input-spike` nonlogin account must already
satisfy the accepted lab checks; no account/group/permission provisioning here.

Use only the existing lab transport, never read its key or known-host contents:

```text
docker exec linuxcast-s0-04-vm ssh -i /lab/test-key -p 2222 -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/lab/known_hosts -T debian@127.0.0.1 <fixed-reviewed-command>
```

For the second observation replace `-T` with `-tt`. All generated stage names
are controller-owned private values, never caller-selected input paths or
public artifact fields. No host devices, credentials, home, bus, cgroup or socket
mounts are added. No host/guest services, PAM, settings, grants, groups or policy
are changed; the sole temporary enabling marker belongs to step2 below.

## 1. Exactly one device-free run per SSH transport

1. Create a fresh owned0700 guest stage for SSH-T. Copy only the exact probe and
   helper via unique owned `/lab/` staging files and `scp` through the above
   fixed transport. Keep the exact sibling basenames
   `linuxcast-input-spike-denial-probe` and
   `linuxcast-input-spike-denial-helper`, mode0500, owned by the ordinary SSH
   account. Verify both hashes on the guest immediately before execution.
   The input-lab marker remains **absent** throughout these observations.
2. A bounded controller runs only
   `env -i <owned-stage>/linuxcast-input-spike-denial-probe --observe-private-denial`.
   Record exact `loginctl show-session self -p Type --value`, `isatty(0)` boolean,
   safe runtime versions, elapsed time and exit status. No fabricated XDG/PAM
   session metadata or session activation. Independently bound the owned process
   group to7750ms and cleanup to8000ms; native driver/helper guards remain7s/6s.
3. Before persisting output, require at most20 lines,512 bytes per JSON row and
   at most10260 stdout bytes; stderr at most384 bytes. Successful output has
   **exactly five keys**: `phase`, `evidenceVeto`, `decisionVeto`, `canArm`,
   `workerArmEmitted`. Phases are the fixed before/after controlled-termination
   enums. Both boolean fields are false. Reject unknown fields, arbitrary text,
   partial rows, wrong types or non-enum vetoes; do not save their raw contents.
4. Success requires exit0, empty stderr and20 rows: row0 is PENDING/PENDING;
   rows1–9 are REMOTE evidence and REMOTE latched decision. Rows10–19 have the
   after-termination phase. Rows10–11 may retain the prior REMOTE evidence while
   the first post-death request completes within its unchanged300ms deadline;
   rows12–19 must have PEER_DEAD evidence. Public250ms sampling cannot measure
   the private300ms deadline more precisely.
   The decision remains REMOTE throughout rows1–19. No revival or Arm/Renew effect
   is allowed. These public rows do not expose epochs/query timestamps, so do
   not claim to independently measure them from this capture. Their bounds are
   enforced by the reviewed private channel and covered in private tests.
5. An unsupported capability, timeout, wrong context, nonzero exit or schema/
   ordering failure is the **first result**: preserve only validated fixed
   rows/diagnostic enums and safe outcome metadata, cleanup, and stop before
   the second transport or kernel run. No repair, retry, fallback or threshold
   adjustment. Never promote explicit incomplete denial into successful proof.
   In particular, a valid but slow initial query could leave PENDING at the
   driver's fixed first Arm attempt; that does not prove negative consumption
   and must be recorded as incomplete rather than reinterpreted as success.
6. Verify both binary hashes again, exact owned wrapper/helper/client descendants
   absent, newly generated denial paths absent, and remove only this run's own
   guest and `/lab/` staging files. Keep no PID/UID/session/path/raw-error data.
   Then repeat steps1–6 **once** with a new stage and SSH-tt, expecting actual
   self type `tty` in both cases and stdinTTY false/true respectively.

The bounded collector must validate that exact schema/order before evidence is
saved. Any adaptation of the prior collector is separately reviewable execution
plumbing; it must not alter the frozen native source or allow target selection.

## 2. One mapped security run: same14 manufactured scenarios

Only after both device-free runs succeed and cleanup is verified:

1. Stage a fresh private test-source tree with exact accepted
   `kernel.security.test.ts`, coordinator socket test, named-suite selector,
   reports/config/map, package/lock and accepted sandbox source. Hash every
   staged source against its local snapshot. Use only the existing verified
   frozen fixture dependency/runtime bundle; if unavailable, stop for reviewed
   provisioning rather than installing or changing dependencies silently.
   Node24.22.1 must match
   `e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb`
   at the sandbox-required `/tmp/linuxcast-node24/node`. Bun1.4.4 must match
   `10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235`.
2. Reverify accepted root-owned/non-writable `/opt` hierarchy and old worker/lab
   hashes. Back up only the prior supervisor into this task's owned private
   stage; install the exact reviewed refactored supervisor as root-owned0555
   at the existing fixed sibling path. Verify all three hashes before testing.
   No root fallback, changed worker, physical path or new input service.
3. Immediately recheck graphical/process/session baseline in the same root
   wrapper. Create `/run/linuxcast-input-spike-lab` **only now**, with
   `O_CREAT|O_EXCL|O_NOFOLLOW`, root ownership and0600, containing exactly
   `S0-03 disposable Debian synthetic devices only\n`. Register `finally`
   cleanup before creation; retain its inode privately so cleanup unlinks only
   the marker created here. Never create a marker on the host. Existing lab
   graphical/manufactured guards remain independently active.
4. From the staged tree run exactly the existing named command as guest root:

   ```text
   PATH=<verified-bun-dir>:<verified-node-dir>:/usr/sbin:/usr/bin:/sbin:/bin bun run test:security -- S0-03
   ```

   Its kernel test invokes the fixed lab with `--reviewed-disposable-guest`
   and exercises14 scenarios **once**; the second test exercises the mandatory
   accepted sandbox socket denial. Do not add a separate preliminary native
   run, bypass the map, filter failing cases, change parallelism or skip tests.
   Keep170s native/180s test and40s socket-test budgets unchanged; bound the
   outer owned runner to195s plus5s cleanup. No other guest load or desktop task.
5. Require2/2 tests, exit0, no skipped/todo/flaky result. Validate and retain the
   existing allowlisted kernel report written before assertions, including all14
   named scenarios, positive recovery/backlog controls, denials and unchanged
   500ms watchdog/1000ms lease action bounds plus their existing measurement
   tolerance/250ms kernel teardown bounds. Preserve the first partial/nonzero
   sanitized report/log; do not retry or relax any timing to obtain a pass.
   The plugin case must still prove ordinary UID positive connection, zero
   sandbox connections, broker success and actual CPU/memory/pids limits.
6. In `finally`, terminate only owned unreaped children/process groups, verify
   no input-spike process or named manufactured source/virtual device remains,
   remove the exact created marker, restore the old supervisor and verify its
   prior hash. Old worker/lab bytes remain unchanged. Remove only owned staged
   trees, temporary runtime copies and container staging files. Reverify source
   hashes and safe baseline before releasing the guest; cleanup failure remains
   a failure and blocks release until resolved, never a passed test.

Evidence is read-only live negative-decision consumption plus a regression of
the explicit synthetic input entry. It does not establish that entry consumes
live context, real graphical locked/inactive enforcement, authenticated companion
authorization, physical held-key/compositor recovery or the complete input
release gate. **S0-03-AC01/AC02 remain pending.**
