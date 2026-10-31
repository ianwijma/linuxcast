# F1-02 production controller review protocol, version 1

This is implementation and offline preparation for **one future** product AT
attempt. Actual native runs in this assignment: **0**. No display, reader,
product executable, desktop entry or native input test was started. The complete
local 1.0 scope and every outstanding desktop/release gate remain unchanged.

Authority: product `757ce20c650c0f4df6d847f10212c6edeaa016ab`, observer preparation
`fc0fdb2e544c8b7b4aab08611cf1de9dabd416b0`, and coordinator frozen tree
`0dcf462fb338c031effcf35081351444e1338440`. Read the coordinator-owned
observer protocol at `apps/desktop/tests/at/README.md` in the frozen tree before reviewing this separate adaptation. The
observer is absent in this branch; this document does not authorize copying or
editing its files. The controller pins its two executable observer-source hashes.
Integration must supply those exact reviewed files or explicitly review a new
interface and update the pins.

## Components and execution boundary

- `product_controller.py`: inert on import; CLI checks Debian13 amd64, a separate
  network namespace with only loopback, no input/audio devices, exact observer
  sources and an immutable staging receipt. Missing prerequisites stop before
  session construction. Only a separately reviewed lab wrapper may prepare the
  namespace; the controller neither creates one nor falls back to host execution.
- `session_owner.py`: dedicated-process Linux subreaper, retained Popen objects
  and pidfds, minimal environment, umask077, exact private 0700 directories and
  0600 files. Session/AT addresses have exact private Unix paths; the system bus
  address points to a nonexistent private socket. There is no inherited session,
  profile, desktop settings, audio endpoint, SSH agent, clipboard or input device.
- `private_discovery.py`: owned memory-only accessibility discovery on the
  private session bus; the separately owned real registry carries native data.
- `product_driver.ts`: trusted test adapter around the actual production build.
  It uses existing Playwright Electron support, never the spike executable. It
  emits bounded private protocol replies, with no public evidence write path.
- `orca_output.py`: private fresh-output extraction, described below.
- `controller_protocol.py`: strict observer validation and exclusive publication.

The caller must reserve the same existing Debian lab using the coordinator lock,
check a clean baseline, and obtain **independent controller review before any
native attempt**. `--reviewed-controller` records the caller's explicit execution
decision; it is not proof that independent review happened. No invocation of that
CLI occurred during this assignment.

The controller starts authenticated Xvfb on an unused display >=100, with TCP
disabled and no `-ac`. It retains its exact child and verifies the observer's
envelope. Session and AT daemons use empty activation directories. Discovery,
registry, Speech Dispatcher (only dummy module, ALSA null), Orca48.1 and the
production Electron tree are all owned descendants. Readiness has fixed ten-second
bounds; each checkpoint/preparation has one ten-second deadline, contained by a
240-second whole-controller deadline. The observer's own120-second deadline is
also effective and is never extended. No failed input is retried. Geometry uses
a fixed12-frame settle sample, not a retry or timeout extension.

The lab wrapper must make namespace-local proc/sysfs views coherent with the
loopback-only check. Playwright's owned inspector/CDP transports can use loopback
inside that namespace; there must be **no routable network or host listener**.
This is test instrumentation, not production networking acceptance. No optional
input service, host/guest desktop configuration or real audio/input may be enabled.

On every exit, kill all retained live descendants through pidfds, repeatedly
discover adopted/detached descendants, reap them, verify exit, remove the private
tree and the exact two owned X server paths. Cleanup has a separate five-second
termination bound with a six-second hard cleanup alarm. Failure to verify cleanup prevents a clean sequence result and
preserves an earlier failure. Already-retained Popen children and pidfds are
terminated independently of descendant-discovery success. Discovery failures
remain failures even if a later scan recovers. If final descendant absence cannot
be verified, preserve the private profile/socket tree for the outer lab owner
instead of removing it beneath possibly live children. No executable-name-wide process sweep is used.
SIGKILL/kernel/VM loss cannot execute Python finalizers: the reserving lab wrapper
still must verify the baseline and shut down/reap/release the guest in its finally
path. This outer integration is coordinator-owned and remains unexecuted.

## Immutable source and actual product build

The coordinator supplies a fresh archive of the reviewed frozen Git tree and
records its exact tree/revision, archive SHA256 and actual signature status
privately. Reviewed unsigned test preparation is allowed with that explicit
provenance; it is not a signed commit or signed release. Preserve normal Git
signing configuration and all signed/tagged release requirements. Never stage the
parent's dist, host Electron override, spike bundle or prior result directories.
Extract into a new private staging directory; install only the frozen dependencies
there using pinned Node24.22.1/Bun1.4.4 and the reviewed guest toolchain/cache.
Use a copy installation backend so dependency files do not remain hardlinked to
an outside package cache; inventory permits hardlinks only when all links are
inside the staging tree, before any read-only chmod.
No live checkout or dependency symlink escaping staging is accepted.

`product_staging.prepare(staging, node, source_tree, archive_sha256)` operates on
that **already extracted** tree: it rejects an existing dist/receipt or `.git`,
inventories inputs, runs `apps/desktop/setup-sqlite.ts` then
`apps/desktop/build.ts` in that staging cwd under owned bounded child lifetimes,
rejects source/lock changes, inventories generated outputs, and makes source,
dependencies, outputs and receipt read-only. Its separate build deadline is360s
and each build command is bounded at180s. It performs no dependency installation,
download or checkout. A failed/partial build is not reusable as a fresh build.

The receipt privately retains the source/archive identifiers, Node hash and all
file/symlink hashes, including the actual Electron runtime, addon, helper and
renderer assets. Validation checks the full immutable inventory before and after
the session under its total deadline. Receipt creation does **not** verify a Git
signature or establish package provenance on its own. The archive/tree integrity, honest signature status and guest package/version
recording remain mandatory caller gates. Offline rebuild
headers, Cargo cache/toolchain provisioning, network namespace wrapper and build
receipt creation in the lab were **not exercised here**. Missing resources fail;
there is no online or host-runtime fallback. The caller retains/removes its owned
staging input after verification; the controller never deletes someone else's
pre-existing source tree.

The driver launches `dist/main.cjs` through a private wrapper, preserves the real
`shell:get-state` handler for restoration, and attests the exact
`linuxcast-app://shell/index.html` URL, actual main PID, Electron45.0.0, one window,
sandbox, isolation, web security, renderer noNode/noRequire, and absence of
no-sandbox/disable-web-security. The PID must also belong to the controller tree.
It sets actual webContents zoom2. DOM geometry separately verifies stable viewport,
footer, nonzero body, no horizontal/document overflow and selected-row bounds;
native capture dimensions must match the complete content bounds. Pixels are
discarded in memory. Geometry never establishes native focus.

## Fixed catalogue and keyboard protocol

Only `Public AT result`, `Public AT result alternate` and120 numbered public
filler entries are installed in the private data catalogue. They have no Comment,
so the existing canonical result name remains `Public AT result Installed
application`. Exec references the installed `/usr/bin/false` so GLib indexes them;
the controller **never invokes a desktop entry**. Enter is permitted only after
native and DOM guards establish action-input or untouched Cancel focus. There is
no DOM `focus()` anywhere in the adapter. The only activation operation is a
single X window focus request on the attested private product handle.

After the observer is ready, Tab establishes a native listbox anchor. Before
each subsequent transition save a validated native sequence and a separate fresh
Orca offset. Query/action-filter typing is bounded preparation before the relevant
presentation offset, excluding typed-key echoes. It cannot count as a checkpoint.

| Fixed ID | Input/operation | Native/presentation requirements |
| --- | --- | --- |
| search | Shift+Tab from the explicit anchor | fresh search entry focus and Search commands generation/attempt |
| result | type the exact query, then Tab | focused search listbox, selected canonical option and fresh selection/active-descendant event, generation/attempt |
| away | ArrowDown | exact alternate selection in DOM; current canonical option deselected and native listbox focused |
| back | ArrowUp | canonical option selected plus fresh native event and generation/attempt |
| actions | Shift+Tab, Ctrl+K | native Actions dialog and fresh Find an action entry focus/generation/attempt |
| form | type Edit search alias, Enter | fresh Search alias entry focus/generation/attempt |
| save | Tab | fresh Save alias button focus/generation/attempt; do not activate |
| cancel | Tab | fresh Cancel button focus/generation/attempt |
| restore | Enter on untouched Cancel | fresh Search commands entry focus/generation/attempt |
| hide | Escape | actual invisible window, primary remains owned; native controls no longer showing |
| reopen | actual secondary executable --show, same wrapper/profile | secondary exits0, same primary PID, one visible window, fresh native search focus/generation/attempt |
| loading | replace fixed main reply with pending promise, reload | visible native application heading/loading status; separate footer/pixel bounds |
| error | fixed failed reply, reload | native error heading and fresh Hide button focus/generation/attempt, separate bounds |
| recovery | restore captured real handler, reload | real successful state response and fresh native Search focus/generation/attempt |

Away has **no claimed fresh alternate event**: the frozen observer excludes that
name. Its current deselection and DOM selection checks are explicitly weaker than
the back checkpoint. The public `freshEvent` flag remains false for away, loading
and hide; `native` there means only the documented current-state check. If review
requires native alternate-event evidence, the coordinator must add an exact fixed
alternate ID to the observer, its negative tests, protocol and source pins before
execution; do not silently widen the observer or mark that stronger path complete.
End/final-row native identity/scroll coverage likewise needs an independently
reviewed observer ID and extra checkpoint; filler count alone proves none of it.

Loading/error are **injected renderer-state** observations. Recovery restores the
real validating handler, rather than cached synthetic success, and proves only
recovery from those injections. No media emulation occurs (`mediaEmulated=false`);
this sequence makes no high-contrast/reduced-motion or dual-theme capture claim.

## Fresh Orca interpretation and primary-source authority

On31October the existing reserved lab was resumed solely to read installed
`speech.py`, `speechdispatcherfactory.py`, `ssml.py` and `debug.py`. Their hashes
match the coordinator's13-source baseline in `product_controller.ORCA_HASHES`.
No display/reader/product was started. The guest was shut down and the container
waited to exit0/PID0; historical source/results and signing configuration were
untouched. The ephemeral source-inspection record remains private outside Git.

Installed Orca48.1 `speech.py:140–158` logs `SPEECH OUTPUT` before calling the
server. `speechdispatcherfactory.py:305–313` logs SSML `Speaking` before
`_send_command`; lines190–199 can swallow errors. Lines452–472 also emit an earlier
`as string` diagnostic. Only the exact SSML record counts as an **attempt**, and
only after the same exact whole generated label. The earlier diagnostic alone
counts as neither attempt nor delivery.

The SayAll callback mapping at lines137–141 and326–354 applies to SayAll, not this
ordinary-focus protocol. No ordinary-focus receipt or completion signal was
proved. Thus every `completion` and `completionValidated` value is fixed false;
there is no delivery or audible claim. Dummy/null speech cannot establish audible
output in any case. No invented callback marker or generic “Speaking means
delivered” inference is accepted.

The parser binds each single-use offset to a regular owned0600 file's device/inode
and hashed immutable prefix; every incremental read verifies all previously read
bytes. It rejects replacement, truncation/regrowth/rewrite, symlinks/hardlinks,
stale offsets, partial offset boundaries, invalid UTF8, unknown/suffix/private
speech records, out-of-order/duplicate candidates, arbitrary XML and unknown
voice fields. Only source-defined numeric word-position marks with validated
positions/ranges are removable. Exact labels are frozen in `UTTERANCES`; small
whole neutral role/position utterances are also explicit. Unknown real phrasing
must fail and return to review, never be learned during the run. An unterminated
record cannot pass. Bounds:8MiB total log,256KiB per-step slice,8192-byte line.

Native replies require exact fields, bounded counts, fixed IDs/roles, real
booleans, nondecreasing sequences and contiguous bounded event history. Duplicate
JSON keys, arbitrary native names/text/paths/errors, malformed/oversized/partial
messages and child death stop the sequence. Fresh native event plus current state
is still required through the frozen `observations.checkpoint`; a DOM assertion
never substitutes for it.

## Publication and acceptance mapping

`f102-native-controller-v1` permits only fixed IDs, booleans, enumerated failure/
status values and native-run count0/1. It records every finished step and the
fixed-flag partial failed step. `firstFailure` is immutable even after cleanup
failure. Arbitrary fields are rejected **before** creating a directory. Publication
creates a new0700 directory and report0600 with exclusive creation, never overwrites
prior failures. Public output contains no logs, names, values, screenshots,
PIDs, paths, exception strings or source/build receipts. All raw runtime data is
discarded with the private session tree. Only a complete ordered local protocol
with verified cleanup can say `observed-private-sequence`; this is never task or
release acceptance, and its explicitly limited away checkpoint is not promoted
to fresh alternate evidence.

| Criterion | What this increment provides | Remaining acceptance |
| --- | --- | --- |
| F1-02-AC01 | Actual-product URL/security/noNode attestation code; source/build integrity checks | No new runtime execution; existing AC01 evidence is unchanged; navigation denials remain in existing security/integration suite |
| F1-02-AC02 | Same-profile secondary --show, retained primary PID, hide/reopen checks | No new singleton/native result; malformed CLI/deep-link/explicit Quit coverage remains existing suite responsibility |
| F1-02-UI | Canonical focus/selection/form order, zoom2 geometry, loading/error/recovery controller and fresh parser | Independent review, fresh guest build and actual run; stronger alternate/final-row native IDs; dark/light captures, audible/tactile, GNOME48/Plasma6.3 Wayland/X11 and D1-01/02 remain pending |
| F1-02-PRIVACY | Minimal environment, private profiles/buses/display, bounded protocol, strict publisher and negative privacy fixtures | Actual descendant/socket/root cleanup and private-session containment must still be verified in the future lab attempt; outer lab wrapper review remains mandatory |

Applicable design sections: tokens, shell/navigation, results/actions,
list/detail/form, states/motion, accessibility and review gate. No UI/product
source or token changes were made. No new screenshots are warranted as evidence
of an unexecuted run. F0-01 is accepted; D1-01 and D1-02 native/UI acceptance stays
pending. No registry/status, shared contract, dependency or runner changes belong
to this lane.

## Offline review commands

```sh
python3 -B -m unittest discover -s apps/desktop/tests/at -p 'test_*.py' -v
python3 scripts/validate_plan.py
git diff --check
```

These tests use synthetic log/native replies/files and disposable ordinary Python
children. They never import GI or start a native/display/reader/product run. After
coordinator integration the existing mapped Python wrapper should discover both
observer and controller tests. Shared runner wiring remains coordinator-owned.

## Coordinator security corrections after initial review

Before Enter, the driver now requires the exact complete filter, sole exact enabled
current alias action, focused action input, and the controller's current native
Edit search alias button/dialog observation. Dropped typing cannot activate Open.
External X paths are bound while the retained server is live using its PID lock,
SO_PEERCRED and exact device/inode/type/UID; replacement paths are preserved and
cleanup reports incomplete. Build comparison includes added/deleted files and
directories outside explicit rebuild/output locations. Receipt aliases are refused,
its regular private single-link bytes are bounded/no-follow read, and a separately
retained digest is required for validation before/after execution. These revisions
are coordinator-validated and await final independent recheck before any native run.
