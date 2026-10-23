# S0-01 exact-owned-XID native control candidate

LOCAL SOURCE ONLY. No desktop, Xlib connection, Electron window, bus, guest,
archive, Git or registry operation was run to prepare this capsule. The only
entry-point process check invoked control.mjs without its required arguments,
which returned fixed unavailable evidence before any session action.

Task: /tmp/linuxcast-s0-01/docs/implementation/tasks/S0-01.md. Normative PLAN,
architecture/linux-integration.md (X11/EWMH), overview.md, security.md and
implementation/testing-release.md apply. Design Shell/navigation, Accessibility,
Review gate and canonical tokens remain required for product UI. F1-01 is
accepted. No existing S0-01 acceptance status changes. Current signed full-tree
HEAD is `09edd2920662b7b6cee749e8c64008fa2ba77d23`; its metadata-only parent source
commit `40a5b9bbd1848033c4bc75011efc1f00a2ff88b6` contains exactly the reviewed c9
application/helper bytes. The coordinator verified that normal signature. This
new separate capsule is unsigned; it claims content equality for the declared
25 runtime inputs plus tokens/desktop entry, not a signed whole mixed candidate.
Historical unsigned-at-execution records remain immutable.

## Scope and fixed sequence

Only a future separately authorized private KWin6.3 X11 control is proposed.
No compositor/bus launcher, host display selection, SSH, package setup, collector,
archive or execution authority is included. A caller must separately review and
pin these sources and preserve the existing private session guards, compositor
identity/startup 45, checker 180, outer 240, collection 300/phase 330/transport 920
bounds, no-retry policy, HUP protection and descendant Supervisor. No existing
full probe or lifecycle-only branch is changed. The signed checkout's ten
reviewed files must remain byte-identical to c9 throughout this local work.

1. Verify fixed source hashes, then validate the disposable Debian13 non-root,
   no-input-marker, canonical private HOME/XDG/keyfile/single-bus/Xauthority/X11
   context before project imports, build, Electron or Xlib. Unknown environment
   values are redacted before the rejecting validator sees them.
2. Build the fixed real launcher once and launch Electron45 sandboxed with
   explicit ozone=x11. Use its exact validated Playwright page. Extract the
   actual reviewed capture/channel/observeOwned definitions from hash-pinned
   check.ts, erasing types only; no replacement observer algorithm is used.
3. Capture that page-associated BrowserWindow identity. Create exactly one fixed
   sandboxed auxiliary BrowserWindow in the same Electron main process, with
   static public text, no preload/Node, no network/scripts, and a nonactivating
   showInactive request. Recheck the original primary page/handle. No broad
   BrowserWindow list, root/window title, foreign class, clipboard or key stream
   is inspected. No ordinary Show, focus, decoy, chord or injection is used.
4. The fixed pair.py pipe control verifies both captured distinct native handles
   are managed EWMH clients with the same retained pidfd/supervised ancestry,
   exact PID and exact class before either geometry is read. A foreign auxiliary
   PID stops before its class or either geometry. Two verified known resources
   means at least those two, never a total count of all process windows.
5. Run actual production observeOwned on the primary. Its strict native target,
   contained frame, exact-target count 1 and no-created-decoy assertions apply.
6. Retain the real original private binding, deliberately substitute only its
   candidate XID/handle with the actual auxiliary values, and run production
   observeOwned again with the original primary page. The page association is
   never retargeted to the auxiliary. Require fixed binding rejection before
   even one helper command/new accepted reply; retain the original binding
   unmodified. A wrapper counts helper-command and trace-reply calls without
   recording their arguments. This tests the comparison, not an assertion that
   the Xlib helper independently knows which page is primary. Negative rejection
   aborts the old helper as production does; there is no rebind/reconnect/retry.
7. Perform one normal Playwright application close, verify process exit 0, and
   leave process-tree/root cleanup proof to the required outer Supervisor.
   No second uncertain Quit is sent. Cleanup is attempted once after failures;
   failed/unconfirmed Quit is terminal and the outer supervisor must reap.

Native steps/captures/pipe actions share the original 8-second observation
budgets, launch remains at most 60 seconds within the same 180-second driver
budget, and selected Quit uses the existing 15-second limit within that budget.
There is no readiness poll or retry for auxiliary mapping: missing required
native properties is a first failure. Future review may find a concrete setup
requirement; none is silently supplied now. There is no native run authorization.

## Result and privacy boundary

core.mjs accepts only fixed public fields/enums and exact completed-step prefixes.
Even all six control steps yield status=incomplete and process exit3. It sets
physicalDesktopMatrixEstablished/fullAcceptanceEstablished/selectedLifecycleEstablished/
focusOrShortcutEstablished=false. A failed phase is terminal, with no continuation
or replay. Unexpected source/entry/run/cleanup rejection produces fixed unavailable
output, not a fabricated completed step list. The exclusive owned-control.json
file is written only after successful postflight source verification; preexisting
paths/symlinks are not overwritten. A future collector must validate this distinct
control schema and separately verify cleanup. No diagnostic is published now.

Private PID/XID/handle/nonce/generation values stay only in memory/private pipes.
Only fixed step names and scope survive. Pair commands are bounded 4096 bytes and
replies 8192; class/property reads use the actual reviewed bounded Xlib decoder.
There are no raw stdout/stderr files, public native IDs, window metadata, private
paths, exception text, credential discovery or host settings changes. The Node
source verifier rejects links/tampered inputs and reads files with no-follow and
an 8 MiB ceiling; this does not increase the existing future whole-archive 8 MiB cap.

## Meaningful preparation checks and limits

Configured Node 24.22.1: 29/29 node:test checks pass, including five nested Python
unittest groups. They execute the real extracted production capture/channel/
observeOwned with a synthetic transport and execute pair.py's real identity/order
function with native getter traps. They check primary/auxiliary swaps, same XID,
foreign PID/class barriers, high bits, managed presence/death/BadWindow, terminal
phase failures/cleanup once, nonzero Quit, no helper command on negative,
source/token/desktop tamper and symlinks, exact output privacy/full-pass rejection,
private-entry ordering and missing-arguments denial. Four Node syntax checks and
two Python AST checks pass. No Xlib is loaded and no native display/session opens
in these checks. Initial entry-denial subprocess test was blocked by local
sandbox EPERM; the identical harmless suite passes with ordinary process
permission (29/29, zero skips). No sandbox/security setting was changed.

S0-01-AC01: this control adds no Wayland focus evidence. S0-01-AC02: even a later
native control success would validate target discrimination only; it would not
prove the separate two-launch Close/UI-Quit/hidden-CLI-Quit lifecycle sequence.
S0-01-UI: no new product UI or accessibility evidence; actual target session and
manual/audible/full focus/shortcut gates remain pending. S0-01-PRIVACY: pure
source/schema canaries support review, while real control artifacts/native
cleanup still require separate execution and independent review. No task or
criterion closure is asserted.

## Primary ABI/API sources

Electron45 documents Linux native handle as unsigned long and showInactive as
non-focusing; actual compositor behavior remains a native assertion:
https://raw.githubusercontent.com/electron/electron/v45.0.0/docs/api/base-window.md
Playwright1.64.1 resolves a Page's DevTools target to WebContents/BrowserWindow,
and its normal close handler sends app.quit then waits for the app-close event:
https://raw.githubusercontent.com/microsoft/playwright/v1.64.1/packages/playwright-core/src/server/electron/electron.ts
The original owned-target proposal records Xlib format32 C-long storage,
WM_CLASS/EWMH shape and XID ABI sources; all production helpers remain pinned
through runtime-authority.json, not copied and independently modified here.
