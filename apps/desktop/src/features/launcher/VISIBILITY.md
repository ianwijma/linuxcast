# Command visibility — bounded L1-01 contract

Frozen interface for application implementation; this document alone does not
implement persistence or establish acceptance. Full root providers/fallback/AI,
remaining ranking controls and native/UI/release gates remain required.

`LauncherCommandMetadata.hidden?: boolean` defaults to false for old metadata.
Root ranking excludes hidden commands before matching, frecency, provider caps or
selected-ID retention. Hiding is a root-launcher preference, not a permission
revocation or uninstall. Pin/alias/usage values are preserved. The recovery IDs
`linuxcast:hide` and `linuxcast:quit` cannot be hidden and remain available when
visibility storage is unavailable. Their management rows explain Always shown
for recovery; generic Escape/Hide remains available.

Global root **Manage commands** is always offered in Actions, even for empty
query/no matching results, and cannot itself be hidden. It pushes one shared List
(maxdepth2), shows both shown/hidden registered commands, and exposes only explicit
Hide command / Show command actions plus Back/Reload, never primary execution.
Queries stay local. Filter all collected registered metadata, display at most100
matching management rows with refinement instructions, preserve selected IDs and
root query/selection on Back. Recovery rows and unavailable storage have actionable
disabled reasons. Ordinary root rows add Hide command beside existing pin/alias.
No ad-hoc CSS or parallel visual system.

`LauncherApi.setLauncherHidden?({commandId,revision,hidden})` returns the existing
strict LauncherCommandsReply. It is a narrow named preload method. Hidden state
changes only after a validated current acknowledgement; do not optimistically
remove a row or infer success from dispatch. Snapshot `visibilityAvailable?:boolean`
is separate from ranking availability; writes require true plus the API. Legacy
missing availability means unsupported visibility editing, not a persisted false.

Coordinator main admits only current registered non-recovery IDs and sender/frame.
Persistence uses a separate sole-owner visibility table/methods, with no query,
path, permission or command execution authority. It preserves usage/pins/aliases
and survives command-usage clearing and restart. Main enforces hidden state before
root-command effects, including direct URL/calculator routes; stored state loss is
an actionable unavailable result, never a successful simulated effect. Recovery
Hide/Quit remain independent of preference storage.

A successful visibility write advances catalogue revision and returns a **full
first page**, not updateOnly. UI consumes that reply then all indicated pages via
getLauncherCommands; verify consistent revision/availability/IDs and the requested
hidden state, including targets beyond page1. Do not silently replace a complete
catalogue with one partial page. No metadata/query/old-provider reply may confirm
a different request. Root fresh reads fence metadata generations, and visibility
changes invalidate older cursors/effects. Reload obtains authoritative state.

Failure/unknown/pending uses the existing metadata-unconfirmed gate across
pin/alias/visibility. Leave Reload available; no retries/replay. Escape/Back/Hide
can leave a pending management view: warn visibility may have changed, discard
late presentation success and require Reload before another metadata write. Owner
writes may already have happened. Keep actual main/owner serialization until the
backend settles; do not count a visibility edit as command use.

Pure search lane exports `rankManagedCommands(commands,query,selectedId?)` for the
bounded100-row local management projection (includes hidden/unavailable, stable
matching/title/id order), and `mergeVisibilityCatalogue(current,next,id,hidden)`
for a fully collected, newer acknowledged catalogue with the same registered IDs.
It checks target hidden state/availability and rejects unrelated metadata changes;
authoritative use totals may change, pin/alias are preserved. Existing catalogue
collection/alias/pin merges preserve and validate visibility availability. Root
`rankCommands`/`preserveSelection` never restore a hidden selection. Management
retains original hidden metadata for action labels; it does not falsify visibility.

Required bounded evidence: real owner persistence, malformed identity/method and
no-replay boundaries, root hidden alias/favourite/cap filtering, later-page restore,
keyboard/axe and dark/light management/empty/error states, actual application
Hide→absence→Manage→Show→execution/restart with usage/pin/alias preserved. Browser
fixtures remain labelled request observations; native/session/AT gates stay open.
