# F1-02 native AT checkpoint — 31 October 2026

**Blocked before native execution. F1-02-UI remains pending.** The current
production launcher's native search/action/result/form/recovery presentation is
still unproven. No product Electron, Xvfb, Orca, bus, compositor, audio or input
test instance was started in this increment. Actual runs: **zero**.

Prepared checkout: `/home/ian/.t3/worktrees/linuxcast/t3-86a755f4`, renamed in
place from runtime branch `t3/86a755f4` to
`codex/f1-02-native-at-evidence`. No additional checkout/worktree was created.
Reviewed product checkpoint: `757ce20c650c0f4df6d847f10212c6edeaa016ab`, including
source changes `566a9b3` and `abe53ee`; subsequent source-parent commits are docs.
Runtime is GPT-6.1 SOL/high; all work performed directly, no delegated agents.
This increment is for the coordinator's complete local 1.0 objective. It does
not mark the Goal, F1-02, D1-01 or D1-02 complete and does not watch/merge/push a PR.

## Access/platform finding

Read-only host checks found Pop!_OS 22.04 x86_64, kernel
`7.1.1-76070101-generic`, host Orca `42.0-1ubuntu2`, AT-SPI `2.44.0-3`,
python3-pyatspi `2.38.2-1` and Xvfb `2:21.1.4-2ubuntu1.7~22.04.16`.
These are package metadata reads, not an attached desktop or native AT run.
No host display, accessibility setting, clipboard, audio, window or input was
accessed. The host is not the Debian 13/Orca 48 target.

The existing private-lab directory and documented Docker/QEMU arrangement were
found. `docker ps -a --filter name=linuxcast ...` showed all four historical
Linuxcast lab containers stopped. A selected final check at
`2026-10-31T10:10:25Z` returned:

```text
/linuxcast-native-lab-v4 running=false status=exited exit=0
```

Historical local reconstruction metadata says that v4's guest was shut down
and the container stopped on `2026-10-24T10:44:42.94744667Z`. Its historical
readiness records Debian 13.7, kernel `6.12.113+deb13-cloud-amd64`, Orca
`48.1-1+deb13u2`, AT-SPI `2.56.2-1+deb13u2`, pyatspi `2.46.1-1`, GI
`3.50.0-4+b1`, Speech Dispatcher `0.12.0-5`, Xvfb
`2:21.1.16-1.3+deb13u4`, Node 24.22.1 and Bun 1.4.4. These values are **not**
fresh runtime verification. The old `linuxcast-s0-04-vm` SSH command in archived
host orchestration is not a live endpoint or authority to access another guest.
No SSH attempt, key read, lab start/resume, disk write or reconstruction occurred.

The blocker is absence of an active, reserved supported guest/session, followed
by missing product-controller integration. To unlock it, the coordinator can
reserve/resume the existing v4 lab, verify the fresh no-test/no-input baseline,
check current Debian/Orca/package/runtime/source integrity and guest access
using its existing identity without exposing it, then review/adapt the private
controller for the product as described in the
[preparation protocol](../../tests/at/README.md). The product's Rust helper,
SQLite rebuild, complete build inputs and runtime need fresh staging and hashes;
historical spike builds and another worktree's dist cannot satisfy this.

## Final-source audit and objections

Read the complete F1-02 card, PROGRESS, PLAN, architecture overview/security/
Linux integration/stack, testing-release, DESIGN and tokens; checked task graph
dependencies. F0-01 is accepted/integrated; D1-01/02 remain in progress. Reviewed
the F1-02 source diff against `e265dc6` and relevant current lifecycle,
commands/assets/IPC/preload, renderer sizing/fallback and shared launcher/view
focus/selection/form code, together with the actual product integration scenario
and its evidence, rather than relying on acceptance labels.

**No blocking production-source defect found in this bounded F1-02 audit.**
This is a fresh independent inspection of the final product checkpoint, not a
submitted GitHub review or a full review of unrelated product families. The
following source/evidence distinctions remain material objections to acceptance:

| Contract | Source/evidence assessment |
| --- | --- |
| AC01/security | `startResidentShell` enables sandboxing; secure preferences retain context isolation, disabled Node/webviews and web security. Asset/session/navigation denial, exact contents/main-frame/URL checks, strict payloads and named validated preload methods remain. Fresh 54 mapped security tests pass. Native observer metadata grants no device authority. No new native runtime AC01 claim. |
| AC02/lifecycle | Exact show/toggle links and single-instance payload parsing, coalesced creation, resident Hide, explicit Quit and bounded teardown remain. Native zoom conversion uses the trusted webContents factor and work-area/token caps, suppressing duplicate resizes. Fresh 15 mapped unit tests pass. No new actual secondary-process, native focus or Quit evidence here. |
| UI/design | The follow-up source constrains shell/body flex height, measures intrinsic body overflow, permits shrink/grow, reserves footer space with long context, and gives fallback states an h1 and initial error Hide focus. Shared tokens/primitives and canonical design remain. Current production integration checks those DOM/pixel paths, including final-result geometry and Save/Cancel order, but was not rerun here. |
| Native accessibility | ARIA names/active descendants and DOM keyboard assertions do not establish actual AT-SPI roles/events or Orca presentation. Collection focus and selected option are distinct. New native mappings/name assumptions and the GLib adapter still require an actual target run. No source-only finding can resolve the assignment's product AT question. |
| Fallback/recovery | Existing loading/error replies are injected; media preferences are emulated. Initial-error focus source is present; actual native fallback focus/presentation and recovery remain unexecuted. A future injected-state recovery result must remain labelled as such. |
| Privacy | Existing evidence is synthetic; new observer emits fixed IDs/role/state/event-sequence data only. Foreign application PIDs are checked before any tree content; unknown/suffixed names never publish. Offline negative fixtures pass. No private AT logs were created; no runtime privacy acceptance is added. |

The seven existing zoom captures and historical artifacts were left untouched.
Their source record correctly distinguishes private Pop!_OS/Xvfb, Chromium media
emulation and injected replies from Debian/native/session acceptance. A future
private Debian Xvfb/Orca pass would still not close the four GNOME 48/Plasma 6.3
Wayland/X11 entries, OS text/high-contrast preference integration, audible output,
physical hardware, performance, installed packaging or release gates.

No application patch or production regression fix is proposed from this audit.
If a future native checkpoint fails, preserve its first failure and propose a
production regression to the coordinator; do not alter main/preload/renderer,
relax the expected native role/name or rerun to obtain a favorable result.

Nonblocking documentation finding: `apps/desktop/src/main/README.md:9` still
says the entry starts no storage/workflow service, although current
`index.ts:122` supplies `createServices` and starts storage. Its line 22 also
describes the main integration test as a deterministic Electron adapter, while
the current mapped integration scenarios launch actual product Electron. These
stale baseline descriptions should be updated by the parent; they are not
production runtime defects or evidence that the old documentation is current.

## Implemented preparation and validation

New files under `apps/desktop/tests/at/`:

- `native_at.py`: fail-closed private-envelope checks and a bounded read-only
  product native observer, separately gated from startup/imports.
- `observations.py`: allowlisted projection and fresh native focus/selection
  checkpoint logic, including collection-versus-option focus.
- `test_observations.py`: 14 offline tests with negative ownership, stale-event,
  duplicate/hidden/wrong-role, suffix/privacy, bounds, host-display rejection,
  private socket/profile and Xvfb-command cases. No native imports or inputs.
- `README.md`: existing infrastructure inventory, exact observer interface,
  one-run product question/sequence and honest missing controller/Orca parser/
  native runtime boundaries.

Commands from this checkout, Node 24.22.1/Bun 1.4.4:

```sh
bun install --frozen-lockfile
node scripts/test-runner/run.ts unit F1-02
node scripts/test-runner/run.ts security F1-02
python3 -B -m unittest discover -s apps/desktop/tests/at -p 'test_*.py' -v
bun run typecheck
bun run lint
python3 scripts/validate_plan.py
git diff --check
```

Frozen install passed (805 packages; manifests/lock unchanged); mapped units
15/15, security 54/54 and new offline Python tests 14/14 pass. Full typecheck,
lint, planning validation and diff checks are recorded in `validation.json`.
No browser/integration/actual AT run occurred; no production dist was generated.
The [source manifest](source-manifest.json) identifies the reviewed product,
normative inputs, dependency/build authority and tools. It is a preparation
manifest, **not executed Electron source/output provenance**. Test-preparation
file hashes are in `preparation-sha256.json`; no runtime artifact hash exists.

Cleanup: all offline test subprocesses exited, temporary Unix sockets/profiles
were closed/deleted by their contexts, and scoped test-runner report directories
were removed. No lab/display/reader/bus was started, so no native process teardown
claim is inferred. Dependencies installed only in this checkout's ignored paths.
Normal commit signing is used without changing 1Password or signing settings.

## Proposed coordinator-owned changes

1. Add the exact Python preparation command above to the appropriate validation
   job/test-runner support and map it to **F1-02 preparation only**. The existing
   `scripts/test-runner/suites.json` accepts JS test files, so merely adding the
   Python path there is not valid wiring. Keep actual native prerequisites as a
   separate non-skippable gate; missing infrastructure reports unavailable.
2. Review/adapt the existing private lab/session controller to launch a fresh
   **product** build and this observer; implement/review the Orca fresh-output
   parser and strict public publisher before a single actual run. Reuse the
   private discovery, null speech and owned-process cleanup design, not the
   spike executable or its historical success status. No controller is claimed
   ready by this increment.
3. Reference this checkpoint/commit in coordinator PROGRESS and F1-02-UI evidence
   as **blocked/native preparation, zero native runs**. Keep F1-02-UI pending and
   AC01/AC02/privacy's existing acceptance unchanged. Do not update task/Goal
   completion, shared contracts, dependencies or registry on this evidence.
4. Refresh `apps/desktop/src/main/README.md:9` to describe the current trusted
   service factory/storage wiring and line 22 to distinguish actual Electron
   integration from deterministic unit adapters. Preserve the native/session
   acceptance limitations when correcting those baseline descriptions.
