# Actual Debian Orca48 launcher presentation: passed5/5

Executed22 October2026 UTC (23 October2026 Australia/Sydney) in the coordinator-reserved disposable Debian13 amd64 QEMU guest. The source was38ac0ae plus the independently reviewed task-owned setup diagnostics and exact recorder toggle-button assertion correction; final source hashes are recorded in [source-sha256.txt](source-sha256.txt). The executed checker hash also appears in runtime.json. Frozen Bun1.4.4 installation and explicit pinned Electron setup completed in a separate launcher directory; no lockfile changes or shared source edits were used.

`node spikes/launcher/tests/at/xvfb-orca.ts` returned **exit0**. Actual Electron45.0.0/Chromium156.0.8078.48 and Node24.22.1 ran on Linux6.12.113+deb13-amd64 with Orca48.1/AT-SPI2.56.2/Speech Dispatcher0.12.0. The renderer had sandbox/context isolation/web security enabled, Node absent and no `--no-sandbox` argument.

All five exact, newly observed native focus events passed, followed by fresh Orca generated presentation and matching per-label Speech Dispatcher delivery within each10s deadline:

| Control | Required native role | Generated and delivered |
| --- | --- | --- |
| Search commands | entry | passed |
| Hide launcher in actions | button | passed |
| Restored Actions Ctrl K | button | passed |
| Record shortcut | toggle button (`aria-pressed`) | passed |
| Cancel shortcut change | button | passed |

Both distinct Dismiss setup anchors also have native focus, generated presentation and delivery. Only their setup deadline is30s; the five required per-focus assertions remain10s. Native snapshots retain allowlisted public labels, exact role classes and increasing focus sequence counters. The current observer recognizes a toggle-button explicitly and requires it only for Record; it does not accept an arbitrary role.

Screenshots [dark search](dark-search.png), [dark actions](dark-actions.png) and [light shortcut](light-shortcut.png) capture only the synthetic launcher's own renderer. The author and coordinator independently inspected all three; focus and layout are clear. Raw Orca debug, temporary preferences and private speech/bus/display credentials are deleted, never retained as evidence. [Cleanup](cleanup.json) records no remaining test processes or temporary profile entries. The VM reservation was explicitly released to the coordinator after evidence retrieval.

This proves the actual Electron/native AT/Orca generation and private Speech Dispatcher delivery path using `sd_dummy`/ALSA null. It does **not** establish audible/tactile quality, physical-session interaction, native GNOME/KDE/Wayland integration, portal consent/effective binding, or any of the four target desktop/session matrix entries. The previous [host Orca42 failure](../host-orca42/README.md), [initial Debian setup failure](../debian-orca48-initial/README.md) and [diagnostic role-check failure](../debian-orca48-diagnostic/README.md) remain preserved. S0-01 completion and criterion status are coordinator-owned; outstanding target-session gates remain pending.
