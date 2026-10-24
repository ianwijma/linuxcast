# Debian diagnostic attempt: incomplete

Run on22 October2026 UTC in the reserved disposable Debian13 amd64 VM with actual Orca48.1, Electron45.0.0 and Node24.22.1. Executed checker SHA256 `753d9c8e727397b1cef77250467936bbe8cbd5bfd9898dfbc54998e571a9444f`.

The command returned exit3 at `focus:Record shortcut`. Actual sandbox assertions, both distinct Dismiss setup anchors, and the first three exact native focuses plus newly generated Orca presentations and per-label Speech Dispatcher deliveries passed: Search commands, Hide launcher and restored Actions Ctrl K. Record shortcut did not satisfy the native role check; its presentation and the fifth control were not reached.

The harness incorrectly expected a native push-button for the recorder. The unchanged real control has `aria-pressed`, so the final harness explicitly requires `ROLE_TOGGLE_BUTTON` for Record shortcut; other exact role requirements remain unchanged. This attempt is incomplete and does not pass S0-01-UI.

Screenshots capture only the synthetic launcher's own renderer on private Xvfb, with public command labels. They were visually inspected for dark search/actions and visible focus. No raw Orca debug or private preferences persist. No audible/tactile or native compositor/session proof is claimed.
