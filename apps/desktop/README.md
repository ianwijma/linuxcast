# Resident application foundation

This is application source, separate from `spikes/`. The resident Electron shell
uses the shared UI primitives, an isolated preload, and a single trusted storage
utility process. Search, command dispatch, settings and other product features
are still being implemented; the preview says so explicitly.

From the repository root with the pinned Node/Bun toolchain:

```sh
bun install --frozen-lockfile
bun run setup:electron
bun run setup:sqlite
bun run build:desktop
bun run start:desktop
```

`setup:sqlite` requires the normal Linux native build prerequisites and rebuilds
better-sqlite3 for the pinned Electron version. The build also compiles the existing Rust platform helper against system GLib/GIO (development headers required), then copies that packaged executable, the addon and
the reviewed SQL migrations into `apps/desktop/dist`; it fails if the rebuilt
addon is absent. No runtime code download or developer Node process is used by
the launched application. Debian package installation remains F1-03 work.

The launcher searches installed applications discovered through native GIO alongside Local data, Hide Linuxcast and Quit Linuxcast. Exact aliases, local title/keyword matching, saved usage and stable keyboard selection are implemented. Enter executes the selected action; Ctrl+K opens actions; Escape closes actions before dismissing the launcher. Queries remain local and never enter IPC. Application metadata is loaded in bounded pages and ranked locally; no other provider or unavailable system action is simulated. Main maps opaque IDs to its own desktop identities and fingerprints, rechecks through GIO, and reports a dispatch receipt rather than focus/completion. Applications that change or become unavailable require Reload commands. Successful dispatch hides the launcher and records clearable usage.

Open URL is a separate registered command and shared form. A valid HTTP/HTTPS address in the query offers it locally and prefills the canonical address; opening or cancelling the form never dispatches. Only explicit submission reaches the narrow URL IPC and current native GIO default scheme handler. Credentials, other schemes, malformed addresses and oversized input are refused. Known missing defaults preserve the draft for manual retry after browser settings are repaired; uncertain outcomes require checking the browser and explicit Reload without replay. A validated dispatch receipt is followed by the named Hide operation; a Hide failure does not relabel the browser handoff. Only command-use totals are saved, with no address history in this increment.

Actions also exposes Pin command/Unpin command for the selected result. Pinning is saved through the sole SQLite owner without executing the command or increasing usage. A visible Pinned label identifies saved favourites; empty-query ordering respects them while preserving selection. An unconfirmed save requires Reload commands before another metadata change; it is never replayed automatically.

Edit search alias opens the shared form for the selected command. Save a short alias or leave it empty to remove it; exact alias searches stay local and still execute only the registered trusted command. Collisions are shown inline, while stale/unavailable or uncertain changes offer explicit Reload. Saving changes only the existing owner alias field, preserves pins and usage, and survives restart.

Hide and Escape dismiss it while services remain resident.
A second invocation toggles the existing window. `--show`, `--toggle`, `--quit`,
and exact `linuxcast://launcher/show` / `linuxcast://launcher/toggle` links are
accepted. Quit closes storage and verifies child exit; failures produce a
nonzero exit rather than claiming graceful shutdown. No global shortcut,
compositor placement or desktop activation guarantee is implemented here.

Storage is initialized only by the primary instance, after Electron readiness.
Its fixed private directory is `$XDG_DATA_HOME/linuxcast`, falling back to
`$HOME/.local/share/linuxcast` when the XDG value is absent or relative. The addon
path and migration assets are trusted packaged resources. Storage failures use
fixed diagnostic codes and disable that child without replay or crash looping.
Storage recovery UI is not yet wired. Local data has category clearing and explicitly unencrypted JSON exports through a separate narrow preload. Successful launcher actions record usage through the actual owner; unavailable ranking does not block recovery commands. Renderer load plus a ready storage owner
confirms a successful launch for migration snapshot retention.

All renderer resources are built locally, enumerated in `assets.json`, and served
from the fixed `linuxcast-app://shell/` origin with a restrictive CSP. The
renderer has no Node, arbitrary IPC, database client or remote resource access.
Design sections: tokens, shell and navigation, states and motion, accessibility,
and review gate in `docs/design/DESIGN.md`. Fonts and controls come from
`@linuxcast/ui`; no separate visual system is introduced.

Evidence under `evidence/` is synthetic application content. Private-Xvfb
Electron checks establish actual query/selection/action execution, Local data clear/export, bundled renderer isolation and lifecycle, not
GNOME/KDE, Wayland focus, Orca or the full release desktop matrix. Shared UI
component screenshots and browser evidence are recorded in
`packages/ui/src/primitives/README.md`.

L1-02 primary application launch is a bounded increment. Native desktop Actions, additional scoped URI/file/argv/shell entry and complete clearable URL/run-history administration, native session/assistive-technology and package-release acceptance remain unfinished. The actual GIO test target is a private generated executable that records arguments; this is real process dispatch, not proof of GTK/Qt/terminal rendering or focus.
