# Source preparation verification — not guest acceptance

On the Pop!_OS 22.04 host, using pinned Node 24.22.1 / Bun 1.4.4:

- `bun run test:integration -- S0-02`: **71/71 passed**, three test files, Vitest start `2026-10-23 04:07:18 Australia/Sydney` (`2026-10-22 17:07:18 UTC`). This comprises 63 deterministic adapter/transport/preparation checks, six restart/supervision/pipe preparation checks, and two existing actual host native canaries.
- `bun run typecheck`, `bun run lint`, Python compilation of all guest Python files, and `python3 scripts/validate_plan.py`: passed.
- The two host native checks use the synthetic own GTK/X11 window with a private named selection, and a private Gio D-Bus fixture. They establish neither GNOME 48 nor KWin 6.3 target-session proof.
- The six preparation checks exercise actual separate Node helper processes, queue state and fresh-instance identity; harmless detached Python descendants under SIGTERM/SIGINT; and actual child stdout/stderr drain, byte cap and cancellation. Native acknowledgements in these preparation checks are fixtures.
- The direct GNOME callback regression verifies positive integer dimensions for subpixel input and rejects invalid dimensions before calling the API-shaped Meta fixture; KWin fractional-geometry checks remain passing.

No Debian guest command or compositor/helper execution was performed for this restart scenario. The prepared live driver must still prove real KWin D-Bus reply loss, watchdog failure, no replay and explicit reload recovery. GNOME/KWin Wayland/X11 live API, clipboard and full physical desktop/session matrix acceptance remain outstanding. All harness protocols remain provisional spike code, not F0 contract acceptance or production backends. No UI acceptance claim is added by this source-only change.

## Invocation guard revision

Source 95c329d adds sixteen preparation cases: a valid exact context, an actual harmless private pathname bus, and rejection/order checks for external HOME/XDG directories, dconf, bus fallback/abstract/external addresses, loader overrides, symlinks/shared modes, inherited displays and root/non-Debian/input-marker contexts. These are local guards, not guest compositor acceptance.

On 23 October 2026 at 05:11:18 Australia/Sydney (22 October 18:11:18 UTC), the two affected files pass **85/85**: 63 transport plus 22 preparation checks, no skipped/todo checks. The previous 71-check mapped result remains historical and includes two host native checks not repeated by this local run.

## Reviewed crash diagnostic revision

The mapped suite on 23 October 2026 at 05:32:11 Australia/Sydney (22 October 18:32:11 UTC) passes **89/89**: 63 transport, 24 preparation/privacy and two actual host private Gio/own GTK-X11 checks. The host GTK resize completes in 315ms. Typecheck, lint, guest build and all Python syntax checks pass. [Recorded command outcome](../evidence/integration-debugger-source.json) identifies parent commit, dirty source and exact reviewed patch SHA; the runner's temporary JSON report was removed automatically. This does not establish Debian compositor acceptance.

The [child-only guest debugger result](../evidence/kwin-wayland-child-debugger.json) captures an actual SIGSEGV with inspection successful and 16 fixed frame categories. The first four frames are QT_GUI; later frames include KWIN_WAYLAND_COMPOSITE. No arbitrary symbol/argument/address/core data is exported, and no specific cause is established. The [release check](../evidence/guest-release.json) confirms all graphical/debugger processes absent, baseline D-Bus count restored, no private run roots/input marker, and the staged harness removed.

## Finer category extension — native run remains unexecuted

On 23 October 2026 at 05:43:45 Australia/Sydney (22 October 18:43:45 UTC), only the preparation/privacy file was rerun: **24/24 passed**, no skipped/todo checks. This run includes synthetic assertions for the finer fixed Qt function families and the existing strict rejection of raw/private fields. It uses no GUI or guest. The build fixture covers 24 runtime-source and 18 output hashes; the final local build also verifies those hashes against current source. [Exact source/hash outcome](../evidence/preparation-finer-categories.json) identifies the tested filter and test file. No updated native crash trace or geometry control result is claimed for these finer categories. The full 89-check result above applies to the earlier exact 7a source patch, before this classifier-only extension.
