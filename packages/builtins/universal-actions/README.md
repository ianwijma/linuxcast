# Indexed-result Copy path — bounded L2-03 increment

`IndexedPathCopy` supplies a shared host action, loading state and scoped status
for exactly one current indexed file-search result. The coordinator places Copy
path after Show details in the Results list and makes it primary in the read-only
Detail. Rendering, selecting, searching, opening details and navigating Back do
not copy. The component creates no window or independent visual system.

Only an explicit Copy path intent calls the optional named
`FileSearchApi.copyPath({resultId, rootId, generation})`. No clipboard text or raw
path enters that request. The main process derives its path from an admitted
result and selected root. Display metadata is not filesystem authority. The
shared `formatIndexedPath` formatter validates the expected absolute indexed
path without opening, resolving, reading or inspecting the original file.

A strict copied receipt must match every result/root/generation identity and the
expected path before the UI says “Path copied.” Status is scoped by view,
selected result, generation and root display path. Stale selections, unavailable
folders, invalid/outdated indexed metadata and a missing clipboard API disable
Copy path with remediation. Paused indexed metadata remains readable/copyable;
copying does not start an indexer or imply that the original still exists.

One pending request disables repeated and different-result copies through the
same instance. The five-second presentation bound limits waiting for a receipt;
it does not cancel or undo the native clipboard write. Unknown, malformed,
mismatched, lost or rejected receipts say to check the clipboard before choosing
Copy path again. Known stale-result failures require refreshing/reselecting;
known unavailable/denied/cancelled writes have fixed clipboard recovery guidance.
No failure exposes raw service details or automatically replays a copy.

The host supplies `isCurrent(context)` to fence the actual active view and
selection before dispatch and after receipt. It must compare context values,
including root/generation/path freshness, rather than relying on object
reference identity. `onChange` republishes presentation transitions. Hosts call
`invalidate()` on selection/query/navigation changes; it clears scoped status,
invalidates pending replies and reports whether copying was pending. On Back,
the host can then show “Copy may have occurred. Check your clipboard before
copying again.” Disposal invalidates presentation without claiming clipboard
cancellation. The host still validates action view/revision and cardinality.

## Validation and design

The synthetic fixture uses the existing `ViewSession`, `ViewRenderer`, shared
fonts, tokens, List/Detail/actions and status semantics. Its CSS only positions
the labelled fixture and request observer. Applicable DESIGN.md sections are
Shell and navigation, Results and actions, List/grid/detail/form, States and
motion, Accessibility and Review gate.

29 passing focused presentation checks cover exact one-result requests, absence of copy on
model access, missing/stale/unavailable capability, paused metadata, known and
unknown failures, strict identity/path receipts, pending duplicates/different
rows, timeout, status scoping, synchronous navigation, late replies and disposal.
10 passing Chromium/keyboard/axe checks exercise keyboard secondary/primary actions, unchanged clipboard
request count before explicit intent, Back and current-selection invalidation,
unknown/mismatched/pending/missing/unavailable states, accessibility and dark/light
screenshots. Fixtures observe requests without touching the host clipboard.
Nine screenshots cover dark/light Results and copied Details, unknown/pending,
missing API and known unavailable states. Dark copied/unknown/pending and light
Results/missing/unavailable were visually inspected. Typecheck, scoped lint,
plan validation and diff checks pass on Node 24.22.1/Bun 1.4.4. The shared footer
focus fix preserves Escape navigation while its primary action is unavailable.
Only public synthetic `/public/Files` metadata enters screenshots or diagnostics.
No file contents, path history, persistence, remote requests or extension grants
are introduced.

These checks provide partial L2-03-AC01 one-result cardinality, partial AC02
non-mutating original-file boundary, UI and privacy evidence. They do not
establish full task acceptance or native clipboard operation. Coordinator main,
preload and file-search integration checks separately establish actual path
derivation and private native clipboard behavior. GNOME/KDE Wayland/X11,
assistive technology, installed packages and full release acceptance remain
pending. The broader L2-02/F3-01/D1-02 dependencies remain in progress.

Full L2-03 still requires typed text/URL/file-list actions, ordered multi-file
buffer, preview/large-text windows, open/open-with/reveal, move/rename/trash with
conflict/restore policy, terminal actions and required deletion confirmations.
No preview/index-cache deletion path or original-file mutation is added here.
The complete local 1.0 scope is unchanged.

## Integrated application evidence

Coordinator checks on the pinned runtime pass:63mapped units (29presentation,
31file-search controller,3shared native writer),18main/preload security,
3contracts and10Chromium keyboard/axe. Shared host changes additionally pass
16shared units,10shared-view/12file-search/19calculator browser regressions,
and43calculator main/preload security checks. Typecheck/lint/frozeninstall and
plan/diff validation pass. Independent GPT-6.1 SOL/high final source review is
clean. Its two UI publication findings now have regression assertions: Detail
Copy is enabled immediately under a stable paused root, and pending List→Folders
Back immediately publishes the uncertainty warning without waiting for an event.
The shared primary action remains focusable with aria-disabled while pending;
dispatch is guarded, and Escape works after pointer activation.

Actual production Electron45/SQLite3.53.4 and packaged native index/helper run in
an owned private Xvfb/X11 profile. The5.50second file flow uses a separate native
xclip reader to verify no copy on query/Details, explicit absolute path copying
from both Detail and List, known unsupported session without writes and manual
recovery. Real rename watching, resident close/reopen, full process restart paused
and fresh query/copy are covered. Paused index clear removes rows proactively;
a saved old result identity is rejected without another write. Original sources
survive clearing and both folder-removal outcomes; Quit closes an active watcher.
Native folder chooser/confirmation choices alone are instrumented. Actual
`evidence/application-{dark,light}-indexed-path.png` captures were inspected and
axe passes. The existing packaged calculator flow also passes in5.52seconds
through the same native clipboard guard. Durations are smoke observations, not
performance acceptance. No user's display or private clipboard is touched.

The request exposes no clipboard payload or path argument. Main caches only the
latest bounded admitted metadata and rechecks selected-root state before deriving
the canonical path. A shared main-only native writer rejects concurrent effects
rather than queuing them. A4second main receipt deadline retains its slot until
the native effect settles; closing does not undo a possible write. Error replies
and UI status remain fixed safe text. Copying does not create path history,
resolve symlinks, verify existence, open a source or grant extension authority.
Native desktop denial/session/AT, installed-package and full release gates remain
outstanding along with all other full L2-03 actions/buffer/previews.
