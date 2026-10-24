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
better-sqlite3 for the pinned Electron version. The build copies that addon and
the reviewed SQL migration into `apps/desktop/dist`; it fails if the rebuilt
addon is absent. No runtime code download or developer Node process is used by
the launched application. Debian package installation remains F1-03 work.

The window's Hide button and Escape dismiss it while services remain resident.
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
Storage recovery UI is not yet wired; no content feature currently reports a
save or success through this preview. Renderer load plus a ready storage owner
confirms a successful launch for migration snapshot retention.

All renderer resources are built locally, enumerated in `assets.json`, and served
from the fixed `linuxcast-app://shell/` origin with a restrictive CSP. The
renderer has no Node, arbitrary IPC, database client or remote resource access.
Design sections: tokens, shell and navigation, states and motion, accessibility,
and review gate in `docs/design/DESIGN.md`. Fonts and controls come from
`@linuxcast/ui`; no separate visual system is introduced.

Evidence under `evidence/` is synthetic application content. Private-Xvfb
Electron checks establish bundled renderer isolation and lifecycle only, not
GNOME/KDE, Wayland focus, Orca or the full release desktop matrix. Shared UI
component screenshots and browser evidence are recorded in
`packages/ui/src/primitives/README.md`.
