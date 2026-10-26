# Saved text workflow application increment

Tasks W1-02/W1-03/W2-03. Applicable design: DESIGN.md Workflows, Forms,
keyboard/focus, tokens, capability/error states and dark/light appearance.
Implementation branch codex/workflow-text-run, engine e900235 (author e7b1c7f),
UI c3d53f9 (author a1e38dc), exact-run Cancel contract1e96fe2.

Before: saved valid workflow editing existed, with Run visibly unavailable.
After: Run saved workflow opens the input/status/result panel for the last
explicitly saved version. Unsaved draft changes are excluded and described.
Keyword/Transform/Copy computation runs in a fixed dedicated utility; main
fresh-loads saved authority, mediates permission and alone writes the clipboard.

## Evidence

Node24.22.1/Bun1.4.4/Electron45/SQLite3.53.4, Linuxamd64. Production check uses an
owned private Xvfb X11 display, private HOME/profile/XDG and an intentionally
unavailable session bus. No user display, no --no-sandbox. This is actual Electron
and clipboard/SQLite evidence, not Debian GNOME/KDE Wayland/X11/nativeAT acceptance.

`LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a bun run test:integration -- W1-03`:
actual registered launcher→editor→create/connect/save graph→Run/input→exact
approval→deny/persistent deny without effect→scoped reset→Allow once→actual
trimmed clipboard with read receipt→persistent grant→complete restart→explicit
new Run reuses saved grant; opening never runs. Back/reopen preserves run/prompt.
Native editor Close cancels without writing. Abrupt main crash while awaiting
approval recovers interrupted metadata after restart; no input/output/replay.
Distinct worker PID and absence of HOME/display/bus/provider keys/loader env are
checked. Renderer has no require/process. Aggregate export and journal exclude
synthetic input/output/labels. UI and actual paths never expose generic grants,
copy-text, executable/argv, storage or principal authority.

Full-page dark approval and light successful result captures are inspected:
workflow-run-application-dark-approval.png and
workflow-run-application-light-result.png. Axe passes both actual states.
Captures use the browser's real reduced-motion preference to avoid sampling
shared Button's100ms transition midpoint; final token colors are unchanged.
The eleven component captures/14 Chromium cases additionally cover both themes,
200% text, IME, held Enter, keyboard scrolling, denial, unknown and bounded output.

Controlled host tests use the real engine and validating SQLite client/owner
with an injected transport/backend: exact run cancellation, late timeout Allow
blocked, stale saved revisions, denial/reset/once, reset waits settled, known
unsupported/busy distinct from unknown, first completed/second uncertain Copy,
forged/mismatched node identities, and deferred permission-inventory frame/revision
changes fenced before reset revocation. These backend cases are not native evidence.
Five owner journal tests cover dispatched/unknown/completed crash gaps, privacy,
CAS/terminal fencing and idle retention; six wire contracts and five IPC/preload
checks cover named authority/schema/subscription boundaries.

## Outstanding acceptance

Full async/script generations/error routes/loops/calls/retry; complete bindings,
settings/groups/palette, multiple workflows/packages/ten examples; debugger
history/breakpoints/per-node captured values/large-value handles; scheduler and
all remaining task-card scope stay required. Full F3/W1/W2 prerequisite acceptance
is pending under user-approved unfinished application increments. Capability
backend here is the registered main adapter with actual support/receipt checked
per call; it does not establish a native session capability. Unsupported/busy
returns actionable unavailable; uncertain effect needs clipboard review and has
no Retry or replay. No full task/native/AT/performance/package/release gate is
claimed. The complete agreed local1.0 scope is unchanged.
