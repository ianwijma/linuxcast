# Offline preparation evidence

Executed23 October2026 Australia/Sydney on the Pop!_OS22.04 amd64 host with pinned Node24.22.1/Bun1.4.4, without opening any compositor, display/window, clipboard, portal or input device:

- `bunx --no-install vitest run spikes/launcher/tests/native-session/preparation.test.ts`:6/6 checks passed, verified run start04:45:23 Australia/Sydney, duration1.15s. Guard/backend/schema/manifest cases are deterministic preparation checks; the two cancellation cases use real harmless detached Python child/grandchild processes and verify their absence after SIGTERM/SIGINT.
- `bun run typecheck`, `bun run lint`, Python AST parsing of all owned native-session Python sources, `python3 scripts/validate_plan.py`, and `git diff --check`: passed.
- `node spikes/launcher/tests/native-session/build.ts`: offline output generation passed. Generated hooks/metadata/source manifest are ignored build outputs, not target execution or acceptance artifacts.
- Copied reviewed process-local supervisor SHA256: `0d26ee0a9e4f581bb53be2dd59576cd82976e66f3403e1fae3a1113d225c45bb`, identical to S0-02 b066f4a. No cross-task file imports or changes.

`S0-01-AC01`: native identity/backend/focus/geometry observers and visible actionable Wayland component assertions are prepared; all four target runs remain pending. `S0-01-AC02`: actual launcher close/resident, singleton show/toggle, UI Quit and hidden CLI Quit scenarios are prepared; none was executed by this increment. `S0-01-UI`: target dark/light screenshots and visible remediation checks await actual execution; earlier host/Orca evidence remains separate. `S0-01-PRIVACY`: new code observes only matched own PIDs/app IDs and selected scalar diagnostics; independent source review remains required before execution. No registry/criterion state changes were made by this lane.

The coordinator must review the stable source and reserve the VM after the exclusive S0-02 session before authorizing these commands. No Debian guest command, GNOME/KWin startup, host-display probe, new package/dependency installation or physical-device operation was performed for this increment.
