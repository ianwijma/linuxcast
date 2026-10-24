# Activation-help navigation and scroll evidence

One actual affected-UI check ran on isolated Debian 13.7 amd64/private Xvfb X11 (no window manager), sandboxed Electron 45.0.0, from 2026-10-23 10:46:17.040285 to 10:46:51.019995 UTC and exited 0. The [unchanged UI report](ui-check.json), [axe audit](accessibility-audit.json), eight own-application screenshots and [ten-source manifest](source-manifest.json) retain its exact scope. [Execution and cleanup](execution-cleanup.txt) is a curated public summary; raw execution/transport data is excluded.

The tested source was baseline `632982ece67224b749d096d80e90285411853bc5` plus six reviewed **unsigned** overlays: `src/renderer/App.tsx` (`411fe05d`), `src/renderer/style.css` (`07591ed1`), `tests/launcher.ui-fixture.test.tsx` (`a95a5d41`), and the three owned-control authority-maintenance files `production.mjs` (`fb4fd77a`), `public.py` (`d90d104e`), `runtime-authority.json` (`0f29abe5`). Source remained unchanged during execution. `sourceSigned=false`, `sourceDirty=true` and `executedSourceCommit=null` remain execution facts; the baseline is not a signed-tested commit. The archive excludes tracked evidence and is not a whole signed tree. No AT working-tree overlays were included.

All four dark/light navigation paths opened the child at its top and returned focus to Search on Escape. Exact recorded offsets are below; zero is retained as observed, without implying a nonzero-offset case.

| Mode | Appearance | Parent before focus | Parent at entry | Child at entry | Parent after Escape |
| --- | --- | ---: | ---: | ---: | ---: |
| Standard | Dark | 0 | 0 | 0 | 0 |
| Standard | Light | 0 | 0 | 0 | 0 |
| 200% / forced colors / reduced motion | Dark | 0 | 0 | 0 | 0 |
| 200% / forced colors / reduced motion | Light | 0 | 0 | 0 | 0 |

The checker verifies keyboard help/region scrolling/Escape, parent-return/child-entry state, no horizontal overflow, visible focus outline, and synthetic focus recovery/later blur. Eight axe audits have zero violations. Combined accessibility mode uses actual Electron zoom factor 2 plus Chromium forced-colors and reduced-motion emulation; standard mode uses zoom 1 with both media features off. The images show notice/help in both appearances and modes. Applicable DESIGN sections are Accessibility, States and motion, shared Tokens and Review gate.

These are real own-renderer UI checks with synthetic activation states, not native GNOME focus, companion activation, an OS-wide display preference, screen-reader presentation or full UI acceptance. No AT invocation occurred in this run. The [existing AT README](../../../tests/at/README.md) preserves the default-nine Record presentation failure and earlier partial outcomes; this UI result neither replaces nor resolves them. No task/criterion status changes follow.

The owned application/profiles/stage were removed, source/tool checks stayed unchanged and clean release was verified. Before/after graphical/Electron/Node/GDB counts were 0, DBus remained at its established count 2, and private matrix roots/input marker were absent. No host display, settings, clipboard or input was used. `SHA256SUMS` covers all public files here except itself; original actual artifacts are copied byte-for-byte.
