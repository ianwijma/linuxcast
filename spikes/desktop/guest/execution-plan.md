# S0-02 guest package and execution request

Prepared offline while the VM was reserved for S0-01 accessibility work. The coordinator subsequently released the guest explicitly for S0-02, allowing inventory, source transfer and package simulation. **No package installation or compositor/helper execution is authorized until the coordinator reviews the actual resolved transaction.** This plan does not claim acceptance.

## Exact requested direct packages

Official Debian trixie package pages checked on 23 October 2026 (Australia/Sydney):

| Direct package | Requested version | Purpose |
|---|---|---|
| [gnome-shell](https://packages.debian.org/trixie/gnome-shell) | `48.7-0+deb13u2` | Actual Shell48 extension host |
| [mutter](https://packages.debian.org/trixie/mutter) | `48.7-0+deb13u1` | Matching native compositor and Meta API |
| [gjs](https://packages.debian.org/trixie/gjs) | `1.82.3-1` | Native GJS support |
| [kwin-wayland](https://packages.debian.org/trixie/amd64/kwin-wayland) | `4:6.3.6-1` | Actual KWin6.3 native Wayland virtual compositor |
| [kwin-x11](https://packages.debian.org/trixie/amd64/kwin-x11) | `4:6.3.6-1` | Actual KWin6.3 X11 window manager |
| [wl-clipboard](https://packages.debian.org/trixie/wl-clipboard) | `2.2.1-2` | Bounded native data-control transport experiment |
| [libgl1-mesa-dri](https://packages.debian.org/trixie/libgl1-mesa-dri) | `25.0.7-2+deb13u1` | CPU software GL implementation |
| [libegl-mesa0](https://packages.debian.org/trixie/libegl-mesa0) | `25.0.7-2+deb13u1` | Software EGL platform support |
| [mesa-utils](https://packages.debian.org/trixie/amd64/mesa-utils) | `9.0.0-2+b2` | GL/EGL inspection tools; depends on mesa-utils-bin |
| [xauth](https://packages.debian.org/trixie/xauth) | `1:1.1.2-1.1` | Private xvfb-run authentication |

Existing GTK3/PyGObject/Xvfb/private D-Bus prerequisites must be rechecked after release. No display manager, desktop metapackage, recommended package set, backports, external apt source or host package change is requested. GNOME Shell does have substantial mandatory dependencies (including settings-daemon/control-center libraries); the actual apt simulation, disk space and service changes require coordinator review. KWin's mandatory xwayland dependency does not establish any native Wayland result. The test clients explicitly select GDK Wayland and the native Wayland compositor socket; X11 evidence remains separately labelled.

After release, collect guest `/etc/os-release`, `uname -r`, package candidates and installed versions, available disk/RAM, CPU model/count and current load using fixed read-only queries. Confirm no other graphical task is active. Then run this **simulation only**, retain its complete package transaction and inspect before installation:

```sh
sudo apt-get --simulate --no-install-recommends --no-remove install \
  gnome-shell=48.7-0+deb13u2 mutter=48.7-0+deb13u1 gjs=1.82.3-1 \
  kwin-wayland=4:6.3.6-1 kwin-x11=4:6.3.6-1 wl-clipboard=2.2.1-2 \
  libgl1-mesa-dri=25.0.7-2+deb13u1 libegl-mesa0=25.0.7-2+deb13u1 \
  mesa-utils=9.0.0-2+b2 xauth=1:1.1.2-1.1
```

No complete dependency transaction can be asserted offline without the reserved guest's actual package database. If an exact pin is unavailable or the transaction removes packages, requests a distro transition or starts/enables an unexpected display manager/service, stop and report the concrete difference. Do not silently upgrade a compositor generation or substitute a mock. Following explicit coordinator approval of that resolved transaction, the install command replaces `--simulate` with `--yes` and keeps every other flag and exact package argument. Capture installed versions and package actions; do not enable a display manager or persistent desktop autostart. Package maintenance is confined to the disposable guest.

## Archive, runtime and execution order

Build locally from the reviewed task source. `manifest.json` records all runtime source hashes and an allowlist of built file hashes. Stage only those files, the manifest and the pinned Node24 executable in a fresh private directory, then generate archive hashes. No node_modules, credentials, SSH files, host environment, private logs or arbitrary directory tree enter the archive. Pinned Node is a development-harness runtime, not a production dependency claim.

After release and approved provisioning, extract only the staged controlled archive into a new private guest directory. Verify its transport hash, every built-file hash and the pinned Node hash before execution. Run as ordinary guest UID1000. Each invocation creates fresh HOME/config/data/cache/runtime and a private session bus, clears inherited display/bus/Xauthority addresses, then supervises its entire process tree. No guest system input marker or input experiment is needed.

Run sequentially, retaining each bounded public JSON/exit result even on failure:

1. `gnome-wayland`: actual headless Mutter/Shell48, native Wayland GTK canary.
2. `gnome-wayland-nested`: separately labelled actual native Wayland Mutter with its private Xvfb parent, if the explicit headless experiment is unavailable. This never silently replaces its result.
3. `gnome-x11`: actual Shell48 on private Xvfb; private named selection only.
4. `kwin-wayland`: actual KWin virtual native Wayland, current real window/queue adapters plus packaged data-control source.
5. `kwin-x11`: actual KWin on private Xvfb; private named selection only.
6. Both KWin backends again with `--restart-scenario`: actual helper process SIGKILL, lost real D-Bus reply, native watchdog unavailable, no automatic reconnect, fresh helper instance/generation, stale-handle rejection, explicit script unload/reload and fresh native geometry acknowledgement.

Use the invocation forms in [README](README.md), with `LINUXCAST_S002_NODE` set to the verified staged Node executable. Run only one compositor experiment at a time. Never use the ordinary `CANARY_COMPLETED` end-of-experiment reply as restart evidence.

## Evidence and limitations

Record exact Debian/kernel/Shell/Mutter/GJS/KWin/wl-clipboard/GTK/Mesa/Node versions, native client display backend, compositor mode, output dimensions/scale, requested software rendering, and observed renderer/vendor where the native inspection tool can obtain it. GL/EGL probes must use the fresh private display only; never inherited host/session sockets. `LIBGL_ALWAYS_SOFTWARE=1` is a request, not proof of the compositor's renderer. Missing renderer identification must remain explicit. Report no GPU passthrough and the actual virtual CPU/RAM/load; do not infer physical GPU, hardware display, latency or four complete desktop sessions from a CPU-rendered API experiment.

For each backend, distinguish success, permission/denial, unsupported MIME/version, native cancellation/size limit, missing component and actual restart/recovery evidence. GNOME's distinct private Meta.Selection manager proves native Meta owner/transfer APIs; it is not production clipboard-history bridge proof for arbitrary external application owners. KWin data-control evidence requires the exact v2 binding boolean, successful public byte transfer, owner change, cancellation and size bounds. Mark unavailable paths with their fixed actionable reason; an exit3 or missing observation cannot become a pass.

No screenshots are required for this engineering-only harness. If an affected-state screenshot later becomes useful, capture only the synthetic app surface with public labels; no desktop or private logs. Export bounded allowlisted JSON with public own-window geometry, opaque fixture IDs, operational booleans and component metadata. Raw compositor/protocol logs remain inside the private temporary root and are deleted.

Normal completion, deadline and SIGTERM/SIGINT use reviewed subreaper/pidfd cleanup across detached sessions. Require no owned descendants before declaring cleanup; verify private sockets/directories are gone after each run. Retain public cleanup outcomes with the result. Forcibly killing the outer supervisor itself with SIGKILL is outside that cooperative cleanup guarantee. After all experiments, release the VM explicitly; preserve installed guest packages only as the coordinator directs. No acceptance/status/PR merge change follows automatically from running this plan.
