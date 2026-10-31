# Product native AT controller preparation, 31 October 2026

**Native actual runs: 0. No new F1-02 acceptance claim.** This directory records
offline controller/parser implementation and its remaining review/integration
gates. Historical observer, spike and native evidence are untouched.

The implementation is in
[the separate controller protocol](../../../tests/at/controller-protocol.md).
Only new files under `apps/desktop/tests/at/` and this bounded evidence-preparation
directory belong to this increment. No product source, dependency, shared wiring,
runner, registry, task status or parent progress file was modified.

Prepared worktree: `/home/ian/.t3/worktrees/linuxcast/t3-1c57ce87`.
Branch: `codex/f1-02-native-at-controller`.
Base: `757ce20c650c0f4df6d847f10212c6edeaa016ab`.
Observer authority: `fc0fdb2e544c8b7b4aab08611cf1de9dabd416b0` and coordinator
frozen tree `0dcf462fb338c031effcf35081351444e1338440`. The coordinator-owned
observer files remain absent locally and were read/tested through the frozen
coordinator source; no local copy or shared-interface edit was made.

Implemented code covers private session ownership/cleanup, actual-production
staging/build receipt preparation, a production Electron keyboard/geometry
adapter, fixed14-step control, strict native protocol validation, fresh Orca
generation/attempt extraction, partial-failure recording and exclusive public
publication. The protocol contains the precise AC01/AC02/UI/privacy mapping.

Offline validation on the development host with pinned Node24.22.1/Bun1.4.4:

- 26 new Python tests pass. They use synthetic native/log/build fixtures and
  disposable ordinary Python subprocesses, including detached/double-forked
  descendants. No GI, display, reader, product or native input is invoked.
- 14 frozen observer tests pass read-only, including its envelope rejection checks.
- Python syntax parsing passes without writing bytecode.
- Strict scoped TypeScript6.0.3 checking and ESLint9.39.5 pass for
  `product_driver.ts`, resolving existing dependencies read-only from the
  coordinator installation with an ephemeral external tsconfig. This is not a
  full repository typecheck/lint or a guest build. No dependency was added.
- `python3 scripts/validate_plan.py` and staged whitespace validation pass.

The normal configured signed commit was attempted once with a30-second bound;
it produced no commit and timed out (exit124). Signing configuration is unchanged
and no unsigned fallback was attempted. Changes are staged; the immutable tree is
reported in the implementation handoff rather than self-referentially stored here.

The source-only lab inspection resumed the existing reserved lab under the
coordinator flock, used its existing identity only by path, read four installed
Orca primary-source files and confirmed their pinned hashes, then requested
shutdown and waited for container exit0/PID0. It started no display, reader,
product or input test, changed no settings and left the lab stopped. Installed
sources establish that `Speaking` is pre-send; ordinary focus has no validated
completion callback here. Every completion/delivery/audible claim stays false.

Remaining gates and coordinator proposals:

1. Independently review the controller/parser/lifetime and publication boundaries
   before authorizing one native attempt. No delegate/reviewer was launched here.
2. Integrate the existing pinned observer files and the new files together. The
   mapped Python wrapper should discover both suites; any wrapper/runner changes
   remain coordinator-owned. A local end-to-end run is blocked by missing
   observer integration, fresh Debian staging/build and the reviewed lab wrapper.
3. Prepare and verify a fresh reviewed frozen-tree source archive and immutable guest
   build, recording its actual signature status and including frozen dependencies, offline native rebuild headers/cache,
   actual Electron/addon/helper hashes and runtime/package versions. No guest
   build or staging receipt was produced in this assignment. The helper's build
   provisioning path remains unexecuted and must not be called proven.
4. Supply a reviewed loopback-only namespace wrapper and outer lab finally-path
   shutdown/reap/baseline checks. The controller refuses the regular guest/host
   network and audio/input devices. Owned Playwright inspector/CDP transport is
   local test instrumentation inside that namespace.
5. The observer has no canonical alternate/final-row ID. This implementation
   honestly records away as current target deselection plus exact DOM alternate
   selection, followed by a fresh native return event; it does not claim a fresh
   native alternate event. If that stronger requirement is mandatory, the
   coordinator must extend the exact observer allowlist/tests and source pins
   before execution. End/final-row native scroll proof remains outstanding.
6. Loading/error are labelled injections; handler restoration proves only their
   controlled recovery. No media emulation, dark/light native captures, audible/
   tactile output, GNOME48/Plasma6.3 Wayland/X11 matrix, optional input service,
   package installation or release acceptance occurred. F0-01 is accepted;
   D1-01/02 and F1-02 UI/native gates remain pending. Complete local1.0 scope is
   unchanged. No concrete product defect was established by these offline checks.

Public runtime reports, if later produced, accept only the exact versioned fixed
schema. Private logs/text/paths/PIDs/errors/build receipts are never published by
the controller. Prior evidence is never overwritten. A complete private protocol
result would still leave every unsupported native/release gate above open.

## Coordinator integration and review follow-up

The coordinator copied these exact14additions from stagedtree1f5fce5 into the F1
shell branch alongside the pinned observer; original child tree remains unchanged.
Independent Standards review reproduced a P1 cleanup defect: discovery failure
could skip killing retained children. The coordinator now terminates retained
Popen children/pidfds before discovery, retries discovery within the same5second
bound, reaps known children even without acquired pidfds, preserves earlier
cleanup failure and keeps private roots if final descendant absence is unverified.
Three dedicated subprocess regressions cover persistent discovery failure with
detached retained descendants, pidfd acquisition failure and transient recovery.
Only public ordinary Python children are involved, not display/reader processes.

Review also found the signed-source preparation prerequisite had no normative
basis: stack.md requires recorded source revisions/hashes and signed/tagged
releases. Preparation can use a reviewed frozen tree/archive with honest unsigned
status; normal configured Git signing and release signing remain unchanged.
No unsigned commit or native run is introduced by this correction. Final Spec/
security review and any required recheck remain separate outstanding gates.

Security/Spec review of original1f5fce5 also reproduced unsafe Enter on dropped
filter input, same-UID external-path replacement deletion, source additions during
build, and receipt aliases/metadata mutation escaping validation. Coordinator
fixes now require exact sole enabled/current Edit search alias DOM action and its
native button/dialog identity before Enter; bind external lock/socket inode/type/
UID to the retained X-server PID and SO_PEERCRED; compare both sides of the build
inventory including directories; reject receipt symlink/hardlink aliases and pin
its digest independently across execution. Eight JS guard tests, actual ordinary
Unix socket/Python lifecycle tests and synthetic staging regressions cover these
boundaries. Final mapped23unit/55security (48Python checks inside wrapper), full
repository typecheck/lint and plan pass. Actual product/Orca native runs remain0.
Final independent security recheck is required; no clean final review is inferred.

The actual private-Xvfb production alias flow caught a guard mismatch before any
native attempt: canonical decorative icon text is aria-hidden and excluded from
its native name. The guard now strips only hidden DOM content before exact-label
comparison; no prefix/suffix match is accepted. Its synthetic positive fixture
contains the icon and8guard checks pass. Final mapped integration2/2 passes17.76s
(newguard6.181s/legacy10.433s). Six historical PNG recaptures restored unchanged;
no new native screenshot or presentation evidence. Additional hardlink inventory
regression rejects external-cache aliases before chmod, while permitting fully
inventoried internal build hardlinks. Final Python suite48checks; mappedsecurity
55/55 andunit23/23, fulltypecheck/lint pass. Final independent recheck pending.

Final lifecycle hardening also releases a newly acquired pidfd if the subsequent
identity read fails before ownership registration. A dedicated subprocess fault
checks the live descriptor count, retained-child termination and clean teardown.
All48offlinePython cases pass through the mapped wrapper; no native run occurred.
