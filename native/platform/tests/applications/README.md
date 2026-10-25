# L1-02 native GIO primary application launch

`applications.rs` implements the one-shot `linuxcast-platform applications` protocol. The coordinator supplies binary routing and the main-only child adapter. This increment discovers installed desktop entries and dispatches their primary action. It does not implement desktop Actions, URI/file/argv/shell actions, run history, permission approval UI, or the complete L1-02 acceptance scope.

The helper reads one JSON line (at most 64 KiB) followed by EOF. It returns one bounded JSON reply (at most 1 MiB). Unknown fields, null optional cursor, unsupported version, invalid IDs and fingerprints fail closed. Titles/descriptions are byte-bounded. IDs are sorted by UTF-8 byte order, unique, and paginated strictly after the cursor. More than 10,000 GIO catalogue entries yields `catalogue-too-large`; the coordinator can impose a smaller aggregate provider bound. GIO itself loads its native catalogue before this count is applied; the main adapter also owns a process deadline.

Discovery uses `g_app_info_get_all`, checks desktop object type and `should_show`/Hidden, and returns only bounded public display metadata plus a SHA-256 fingerprint. A fresh `g_desktop_app_info_new` at launch repeats GIO's executable/TryExec validation and visibility checks. Fingerprints include the desktop identity, source filename, parsed command/name/icon and display properties, and launch-relevant keys including Exec, TryExec, Path, Terminal, DBusActivatable, visibility and startup properties. Launch uses that loaded object after checking the requested fingerprint. It is not a signature of the executable binary or a sandbox for installed applications; same-user modifications after validation remain outside an atomic filesystem snapshot.

Exec quoting, field substitution, terminal handling and D-Bus activation belong to GIO. The helper accepts no command string, arbitrary path, URI or argument array. The main process must supply its reviewed minimal desktop-launch environment, excluding provider keys. `g_desktop_app_info_launch_uris_as_manager_with_fds` receives `/dev/null` for stdin, stdout and stderr; spawn flags do not retain other descriptors. The shared session connection is flushed before this one-shot process exits. Success means GIO accepted dispatch, not application startup completion. D-Bus service availability, real terminal launch and desktop focus still require integrated target-session validation.

## ABI and ownership

Bindings were checked against installed GLib/GIO 2.72.4 public headers (`gio/gappinfo.h`, `gio/gdesktopappinfo.h`, GLib spawn/checksum headers) and upstream source. `gboolean`/flags use C integers; `GType`/`gsize` use pointer-sized integers for the supported amd64 target. GIO list entries are owned object references. Local RAII guards release every list/reference, allocated string and GError; getter strings and icons are borrowed only while the owning object is alive. No raw GError, filename, Exec or environment is returned or logged.

Primary sources:

- [GIO get_all ownership and visibility](https://docs.gtk.org/gio/type_func.AppInfo.get_all.html)
- [Manager launch with explicit standard streams](https://docs.gtk.org/gio-unix/method.DesktopAppInfo.launch_uris_as_manager_with_fds.html)
- [GLib 2.72.4 GDesktopAppInfo source](https://github.com/GNOME/glib/blob/2.72.4/gio/gdesktopappinfo.c): constructor checks at `g_desktop_app_info_load_from_keyfile`; primary dispatch at `g_desktop_app_info_launch_uris_internal`. Its `get_executable` display string uses first-word extraction, so this implementation relies on GIO's constructor parsing rather than incorrectly resolving that display string for paths containing spaces.

## Bounded actual checks

`cargo test -p linuxcast-platform --test applications` — four passed on the development amd64 host with GLib/GIO 2.72.4 and Rust 1.95.0. `cargo clippy -p linuxcast-platform --all-targets -- -D warnings` passed. These are actual native GIO operations under private synthetic XDG/HOME directories, not mocked launch results or Debian session acceptance.

- Generated executable path with spaces; quoted arguments, literal shell-looking text, `%c`, `%%`, empty file/URI field codes; actual generated JSON marker proves argv and stdin EOF. Fixture stdout/stderr cannot pollute the helper protocol.
- Hidden, NoDisplay, OnlyShowIn, NotShowIn, missing TryExec, missing Exec and malformed quoting are excluded; stable paginated IDs are checked.
- Changed Exec, terminal flag, hidden/deleted entry or removed executable rejects an earlier fingerprint without creating a launch marker.
- GIO spawn failure from a nonexistent working directory returns `launch-failed`; invalid versions, extra fields, IDs, booleans/types, fingerprints, oversized and multiple frames are rejected.

Only the fixed public Python fixture is launched. Tests clear the inherited environment, point every XDG directory and HOME at their private temporary root, use a deliberately nonexistent session bus, and remove the root afterward. No host application, desktop session, physical input or private screenshot is involved. Localized display and D-Bus behavior are delegated to inspected GIO source but are not exercised by these four fixtures.

Acceptance mapping: these checks support AC01 for malformed Exec and absence of shell interpolation, and AC02 for spaces/arguments and missing/failed executables. URI actions and the full success/denial/recovery desktop matrix remain pending. UI is owned by the separate application lane. Public synthetic fixtures support the privacy criterion; full task status remains pending coordinator integration and review.
