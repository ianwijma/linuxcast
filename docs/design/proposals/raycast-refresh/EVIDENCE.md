# Review-package evidence

Validation date: 1 November 2026 (Australia/Sydney). Source baseline: `cd7bf0e`. Scope: `docs/design/proposals/raycast-refresh/` only. These results validate documentation artifacts, not application task acceptance.

## Recorded environment

- Pop!_OS 22.04 LTS amd64; Linux `7.1.1-76070101-generic`.
- Node `v26.11.1` (host runtime, **not** the application's pinned Node 24).
- Existing Playwright `1.64.1`, read from another local checkout; no dependency installation or manifest/lockfile change.
- Headless Chromium `156.0.8078.4`, executable from the existing Playwright cache.
- 1440 × 1000 CSS-pixel desktop review viewport; 390 × 844 narrow artifact viewport. The comparison page was also checked at 728px and 390px.
- Inter/JetBrains Mono are unavailable on this host (`fc-match` returns DejaVu Sans); artifacts use their declared local fallback stacks. No bundled-font or final typography claim.

## Reproduce

The harness takes paths to an existing Playwright ESM entry and Chromium executable, so reviewing documentation does not alter application dependencies. The paths below are the actual local paths used; point the two variables at equivalent existing installations on another machine.

```sh
LINUXCAST_REVIEW_PLAYWRIGHT=/home/ian/.t3/worktrees/linuxcast/f2-02-diagnostic-controls/node_modules/.bun/node_modules/playwright/index.mjs \
LINUXCAST_REVIEW_CHROMIUM=/home/ian/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome \
node docs/design/proposals/raycast-refresh/verify.mjs sol opus

node --check docs/design/proposals/raycast-refresh/verify.mjs
node /home/ian/.t3/worktrees/linuxcast/f2-02-diagnostic-controls/node_modules/.bun/node_modules/eslint/bin/eslint.js \
  --config /home/ian/.t3/worktrees/linuxcast/f2-02-diagnostic-controls/eslint.config.mjs \
  docs/design/proposals/raycast-refresh/verify.mjs
python3 scripts/validate_plan.py
python3 scripts/test_validate_plan.py
git diff --check
```

The candidates have distinct deep-link formats. Sol uses query parameters (`sol/review.html?view=workflows&state=interrupted&theme=light`); Opus uses a hash (`opus/review.html#view=workflow&state=interrupted&theme=light&mode=list`). The harness translates these formats and asserts the actual rendered view, state and theme. It reloads the Opus page between hash cases, because changing the hash alone does not re-run its boot function.

The harness syntax check, ESLint (using the existing checkout's matching repository configuration), documentation validator and diff whitespace check pass. The complete application test suites are not needed for a proposal-only directory and were not run.

## Coordinator results

See the machine-readable [verification results](verification-results.json) and [review harness](verify.mjs).

| Check | Sol | Opus |
| --- | --- | --- |
| Seven views × seven states × two themes | 98 rendered combinations pass | 98 rendered combinations pass |
| Script exceptions / external HTTP(S) requests | 0 / 0 | 0 / 0 |
| 390px page-level horizontal overflow, all seven default views | None | None |
| Canonical base token keys and values | Equal to canonical | Equal to canonical; additions isolated under `proposal` |
| Base text/muted/focus/accent-text contrast pairs | Pass configured thresholds | Pass configured thresholds |
| Added selection rail, control border and white glyph/category pairs | No additions | Pass configured thresholds |
| Launcher baseline width / current fixture height | 720 / 454px | 720 / 538px |
| Action filter Ctrl+K focus; Escape restores invoking control/query; Shift+Tab reaches a control | Pass | Pass |
| Forced colours + reduced motion | Render smoke check; screenshot inspected | Render smoke check; screenshot inspected |
| Committed prototype screenshots | 24 | 24 |

The comparison page loads all 28 default app images, displays two matching candidate screenshots for every surface/theme, fits 728px/390px without page overflow, updates its per-surface choice summary, and produces no script exceptions. All choices are in-memory review state; closing/reloading the page resets them. There is no save, network submission or application adoption operation.

Screenshots in `sol/screenshots/` and `opus/screenshots/` include:

- Seven default app surfaces in dark/light, cropped to their app frames (14 images per candidate).
- Launcher with actions in dark/light (2).
- Loading files, empty emoji, error notes, denied settings, unsupported launcher and interrupted workflow with review chrome (6).
- Narrow launcher and forced-colours/reduced-motion launcher (2).

The coordinator visually inspected launcher/action dark/light, chat, workflow, light permission, narrow captures, and a contact sheet covering files, grid, notes, denial, error, interrupted workflow and forced colours. Scrollable workspaces retain their authored viewport; content below that viewport remains available by scrolling in the prototype. These are screenshots of original review artifacts, never new installed-app evidence.

## Integration fixes and interpretation

- Sol's selected workflow button initially aligned differently from the other nodes; the coordinator made all canvas nodes block-level with a consistent width before final captures.
- The harness initially checked Tab after the last footer control and hit the browser boundary. It now checks Escape's actual restored focus and Shift+Tab to a prior control.
- Opus shortcuts are scoped to its preview stage. The harness focuses its query before exercising Escape/Ctrl+K, matching an in-app interaction rather than sending keys to the page body.
- Initial CI exposed that the planning-gate unit tests construct a documentation-only fixture without `apps/`. The coordinator changed the two prior-app screenshot references to immutable baseline GitHub links and ran the complete planning-gate tests. No validator or fixture behaviour was changed.
- The author's Opus validation notes predate the coordinator's forced-colours/reduced-motion smoke check. The record here supplements them; it does not establish Electron or screen-reader acceptance.
- [Provenance](PROVENANCE.md) corroborates the requested/returned Opus `effort: high` launch option. Internal model compute is not measurable from these artifacts.

## Remaining limits

No actual Electron, Orca, supported Debian desktop, Wayland/X11, clipboard backend, provider account, keyring, privileged-input or workflow execution test was run for this proposal. No native focus, latency, security or capability-success claim follows from these captures. The privileged input service remains a disabled/stopped synthetic fixture, not a probed machine state.

Fixed normal-size prototype rows do not establish 200% text usability. Full text growth, CJK/RTL/long-name coverage, final font layout, screen-reader announcements and actual backend-derived recovery states remain implementation work. Sol's baseline border is not a sufficient independent control boundary on every surface; the chosen shared controls need measured contrast. The Opus proposed stronger control-border role addresses that specification issue but is not bound into the app.

The current application, canonical design files, shared primitive contracts, task registry, dependencies, native integrations and feature status are unchanged. No task was marked complete. The PR is ready for design selection; rollout still requires a recorded decision and bounded implementation acceptance.
