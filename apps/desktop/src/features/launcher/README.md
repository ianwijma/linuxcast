# Launcher commands and applications — bounded L1-01/L1-02 increments

`Launcher` uses the existing shared `ViewRenderer` and `ViewSession`. Main supplies
`LauncherApi` and a named Hide callback; the renderer receives only metadata and
sends a selected command ID with the registry revision. Main retains all actual
handlers, sender validation, current availability checks and usage persistence.
No shell, provider, file or generic repository interface is added to rendering.

The initial registry exposes Local data, Hide Linuxcast and Quit Linuxcast. Cold
empty-query ordering follows main's useful default order. Local saved favourites,
usage and aliases are read through main, and query text stays in the renderer.
New query generations invalidate old work; accepted refreshes preserve selected
identity through reordering. A newer metadata response supersedes older replies.
Loading blocks execution. Disabled rows remain discoverable with their reason.
Only an explicit current item action can dispatch; stale revisions, hidden views,
unknown IDs and duplicate in-flight requests cannot. Requests have a five-second
presentation deadline; unknown outcomes show an error and never auto-replay.
A Quit or application-launch receipt is never displayed as proof of a completed
system operation. Explicit deadline-exceeded replies retain unknown-outcome
wording; the user checks the result before attempting another launch.

Design: DESIGN.md Shell and navigation, Results and actions, States and motion,
Accessibility, and Review gate. The shared list provides arrows from the query,
Home/End on the list (native caret Home/End in the query), Enter, Ctrl+K actions,
Escape panel dismissal before launcher dismissal, visible focus and disabled
reasons. Reopening focuses the query. A failed Hide restores the view instead of
leaving an empty window. Shared fonts, colours, spacing and opaque surfaces are
unchanged; this feature introduces no second visual system.

## Pin and unpin commands

The selected enabled command has an explicit secondary **Pin command** or
**Unpin command** action. The original Open/Hide/Quit remains primary. Pin state
uses the existing accessible Pinned accessory and star icon. A pending change
blocks pin/execute duplicates and refresh races; it does not change the badge or
claim saved state. Only a validated authoritative reply from
`setLauncherPinned({commandId, revision, pinned})` changes the metadata. It must
contain the matching command and requested saved value at a current revision.
Ranking then updates while the shared view preserves selected identity and the
primary action.

Pinning never executes a command or records use. The coordinator's single owner
updates only the pinned field, preserving count, timestamp and alias. Unavailable
ranking storage disables this edit and offers Reload commands. A rejected,
malformed or uncertain acknowledgement retains prior metadata and requires an
explicit reload before another pin edit; no mutation is replayed automatically.
Reload remains available even if a later ordinary command succeeds. Hidden or
cancelled replies are ignored; reopening fetches authoritative state again.

## Application catalogue

Main supplies pages of at most 100 metadata rows at one registry revision. The
controller validates all pages, consistent availability, unique IDs, cursor
revision/offset and bounded total count/bytes before replacing the live catalogue.
Failed, stale or hidden refreshes do not publish a mixed partial snapshot. Search
stays local over up to 4,099 rows, takes the first 20 per provider, and presents a
separate Applications section using existing shared list primitives. Application
primary actions say Open; built-in Open/Hide/Quit retain their meaning. No desktop
ID, executable path, shell command or native fingerprint reaches presentation.

Application pins use the same explicit metadata actions. A validated one-row
`updateOnly` acknowledgement merges the matching target without losing other
pages; a partial full-snapshot reply rejects. Unavailable application discovery
keeps built-ins usable and offers Reload commands. Selection remains a stable ID
across query results and pin reordering.

## Evidence and limits

- `packages/search/tests/search.test.ts`: nine bounded ranking/generation tests.
- `tests/controller.test.ts`: 21 current registry/selection/action/failure tests, including pin acknowledgements.
- `tests/catalogue.test.ts`: 11 atomic pagination and pin-merge checks.
- `tests/launcher.ui.test.ts`: 14 Chromium component checks covering keyboard,
  action-panel focus, disabled states, loading, filtered-empty, errors and axe.
- `evidence/`: actual dark/light component screenshots plus affected states;
  viewed for layout. These use the three real command names and public synthetic applications with an explicitly
  labelled request-observing API fixture and in-memory pin metadata. They do not
  execute system operations or establish SQLite persistence. The pin increment
  includes dark/light pinned, unconfirmed and unavailable affected states. The
  application slice adds dark/light application lists, unavailable discovery and
  unknown launch outcomes. These checks ran with Node 24.22.1/Bun 1.4.4.

Generated fixture data only; no user content, secret values, query logging or
remote requests. Unit/browser checks are development evidence. The coordinator
owns the actual main/preload/storage/Electron flow and its validation. Debian
GNOME/KDE Wayland/X11 and native assistive-technology acceptance remain pending,
along with full L1 providers, ranking controls and explicit fallbacks. F1/D1
native gates remain pending. Typed URI/file/argv/shell flows, desktop actions and run-history controls remain
outstanding in L1-02. This slice does not mark all L1-01 or L1-02 complete.
