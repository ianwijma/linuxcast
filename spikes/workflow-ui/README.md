# S0-06: workflow and declarative-view feasibility

Implements the bounded [S0-06 card](../../docs/implementation/tasks/S0-06.md): a controlled **React Flow 12** canvas, a versioned host-rendered List, a versioned configuration Form, and a complete keyboard alternative to graph dragging. Every edit is local to this page's in-memory session. Reload resets the fixtures.

The three illustrative cards are Keyword → Trim Text → Copy Text. They demonstrate typed text ports and host configuration interaction, not runnable native-node definitions. `fixture.number` is a **synthetic, non-executable number-output fixture**, used to prove that incompatible ports are rejected. None of the fixture cards calls a clipboard, extension, script, provider or desktop backend. Run is disabled with an explanation. Permission, loading, error and cancellation selectors render deterministic fixture states; they do not simulate completed system operations.

## Run and validate

Use the repository's pinned Bun and Node runtimes and installed dependencies:

```sh
bun run typecheck
bun run lint
bun run test:ui -- S0-06
bun x vite --config spikes/workflow-ui/vite.config.ts
```

The last command opens a development-only renderer server on loopback. It is not the installed Electron application or extension transport. Tests start and close their own loopback Vite server. A sandbox which prevents local listeners must grant local server access; an unavailable listener is a failed test, never a pass.

## Boundaries and proposed contract shape

`model.ts` contains a strict **spike-local subset**, not production contracts. F0-01 owns the shared schema/registry freeze. W-lane tasks own complete workflow editing, executable configuration and runtime integration. D1 owns production shared host primitives; no such implementation existed at this spike's accepted F1 baseline. `host/Views.tsx` demonstrates one common host List/Form renderer for graph structure and configuration and informs D1. It must not be imported as the production SDK or presented as completed D1 functionality.

The proposal exercised here is:

- `protocolVersion: 1`, stable `viewId`, integer `revision`, and `kind: list | form` select host renderers. Content is data, never a component tree, HTML, CSS or JavaScript.
- List rows have stable IDs, title/subtitle, host search and an optional disabled reason. Form fields are labelled text with a required flag; submit and cancel refer to declared action IDs. Unsupported kinds/fields are rejected, including nested fields. This intentionally does not implement the entire extension ViewModel specification.
- Input/output port types are text or number. Existing nodes and ports, compatibility, duplicate edges and cycles are validated before adding a connection. All graph mutation paths use the same connection validator. Unknown ports, incompatible types, duplicate edges, missing nodes and cycles return visible reasons.
- Layout positions are a separate `Layout`; `ExecutionGraph` has no coordinates. React Flow nodes/edges adapt the authoritative in-memory graph. Moving a node leaves the serialized execution graph unchanged.
- View data is bounded to 500 items, 64 KiB per UTF-8 text field and 1 MiB aggregate. Unsupported major versions, duplicate identities, noninteger revisions and prototype-related object keys are rejected. Rejected payloads are absent from diagnostic text. The prototype has no JSON import/transport and makes no duplicate-JSON-key, production permission-broker or process-isolation claim.
- Configuration updates require Apply. Required values are validated inline, cancellation restores the initial values, unapplied changes prevent accidental navigation, and Apply/Cancel preserve keyboard focus. Removing a node removes its incident connections and restores focus to the palette. A spike limit of 500 nodes keeps its single-page List bounded; the full registry's 1,000-node/pagination contract remains downstream work.

## Design and accessibility

Applicable [DESIGN.md](../../docs/design/DESIGN.md) sections: Tokens; Components / List, grid, detail and form; Components / Workflows; States and motion; Accessibility; Review gate. `tokens.json` directly supplies every theme color, font stack, type scale, radius and spacing variable. Graph selections use a neutral surface plus focus outline. The prototype has compact icon-leading rows, semantic controls, persistent field labels, associated validation errors, status/alert announcements, restrained opaque surfaces and the structured non-drag path. Long names retain complete accessible names and tooltips while visible rows/cards truncate.

Inter 400/600 and JetBrains Mono 400 are loaded from pinned local `@fontsource/*` packages, with no remote requests. Both use SIL OFL 1.1; copies are in `licenses/`. React Flow's MIT licence is included there and its attribution link is retained. Primary API references: [React Flow accessibility](https://reactflow.dev/learn/advanced-use/accessibility), [custom nodes](https://reactflow.dev/learn/customization/custom-nodes), [Vite JavaScript server API](https://vite.dev/guide/api-javascript.html). The coordinator's declaration-only TypeScript compatibility patch is documented in [patches/README.md](../../patches/README.md).

## Acceptance evidence

Executed 2026-10-23 on Pop!_OS 22.04 amd64, Linux 7.1.1-76070101-generic; Node 24.22.1, Bun 1.4.4, React 19.3.1, React Flow 12.12.0, Vite 7.3.7, Playwright 1.64.1 / headless Chromium 156.0.8078.4, axe-core Playwright 4.14.0. **The original scoped suite below is browser-renderer proof only.** It establishes no Debian desktop, compositor, screen-reader or packaged Electron evidence. Additional actual Electron and partial screen-reader evidence is described below; S0-06-UI remains pending until the complete actual screen-reader path passes.

`bun run typecheck`, `bun run lint` and `python3 scripts/validate_plan.py` pass. The scoped UI suite has 13 executed tests, no skips, with this mapping:

| Criterion     | Authoritative test evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0-06-AC01    | `keyboard adds configures connects and removes a node` uses only Tab, Enter and native select keys after loading. Asserts node/edge counts, applied label and recovery focus. Additional tests prove layout independence, unique source-port ordering after edge deletion/reconnection, disabled Form-action enforcement even on native submission, skip-disabled arrow navigation, explicit cancellation, dirty-draft preservation and focus retention.                                                                                                                                                                                           |
| S0-06-AC02    | `rejects unrecognized ViewModel fields versions identities and action revisions` covers top-level/nested code/CSS fields, major versions, duplicate IDs, noninteger revisions, unsupported Form kinds, prototype keys, UTF-8 text/frame limits and stale/unknown action IDs. `edge validator rejects incompatible types ports missing nodes duplicates and cycles` covers all named failure boundaries, with a browser assertion that incompatible connection creation changes no edges. |
| S0-06-UI      | Keyboard editing, arrow navigation, form errors, dirty/cancel/focus, loading/empty/filtered-empty/error/retry/permission/cancelled/disabled Run states; axe WCAG 2 A/AA and 2.1 AA reports zero violations in dark and light; forced colors, reduced motion, 200% body/caption/emphasis text and long CJK/RTL labels remain operable. Screenshots below are from the tested renderer and have been inspected.                                                                            |
| S0-06-PRIVACY | Synthetic fixture source and screenshots contain no personal content or credentials. The privacy test observes only loopback renderer requests, rejects a synthetic private canary without echoing it, and checks fixture text for credential markers. No content is logged or persisted; fixture states do not invoke any backend.                                                                                                                                                      |

Screenshots: [dark ready and focus](evidence/dark-ready.png), [light ready and focus](evidence/light-ready.png), [loading](evidence/dark-loading.png), [empty](evidence/dark-empty.png), [error/retry](evidence/dark-error.png), [permission](evidence/light-permission.png), [cancelled](evidence/light-cancelled.png), [invalid edge](evidence/dark-invalid-edge.png), [forced colors and 200% text](evidence/forced-colors-text-200.png). These are visual evidence, not automatic pixel-diff baselines. Tests also assert semantic states and geometry rather than relying on screenshot resemblance.

Remaining feature boundaries: no persistence/package lifecycle, full node catalogue/registry schemas, live extension process, execution authority, permission grants, desktop effects or production D1 components. Those implementations remain assigned to downstream tasks. Accessibility validation is not waived by those boundaries: current actual Electron and screen-reader results below determine the outstanding S0-06-UI gate. The coordinator owns integration, acceptance status and PR references.

Independent review of f6747c6 found three issues: duplicate source-edge order after deletion, unenforced disabled Form actions, and arrow navigation stopping at disabled rows. Coordinator fixed all three with focused regression checks; the final scoped suite passes13/13. Review and real Electron/assistive-technology acceptance remain separate gates.

## Actual Electron and isolated screen-reader checks

The additional task-local commands are:

```sh
node spikes/workflow-ui/tests/private-session.ts
node spikes/workflow-ui/tests/xvfb-orca.ts
```

The first opens only a disposable synthetic Electron45 window on the authorized GNOME42.9/X11 host. It explicitly enables Playwright's Chromium sandbox, checks the actual process has no `--no-sandbox`, verifies sandbox/context-isolation/no-renderer-Node preferences, and covers keyboard add/configure/connect/remove, dark/light axe, actual 200% Electron zoom, forced colors/reduced motion, and native AT-SPI names/roles/focus events. Theme screenshots and runtime/native reports are in [evidence/electron](evidence/electron/runtime.json). They are actual Electron evidence, not a packaged-client or Debian desktop-matrix pass.

Both commands create new session and accessibility buses, a private0700 runtime directory, a real AT-SPI registry, disposable HOME/preferences and memory-only GSettings. A minimal test-only `org.a11y.Bus` discovery/status service supplies the private address and enabled status at the standard `/org/a11y/bus` path. It does not alter the host service or global accessibility settings. The native observer refuses a bus containing unexpected process IDs before reading any content and traverses only the synthetic Electron process; it records only known fixture labels, roles and focus events.

The second command additionally creates a new Xvfb display, then starts actual installed Orca42 there. Full Orca input hooks cannot affect the user's host display. Speech Dispatcher uses only its dummy module and explicit ALSA `null` device on a private socket; braille is disabled. Only allowlisted booleans for generated presentation after fixed native Xvfb Tab keys are retained; raw Orca debug/preferences are deleted with the private profile. Native AT exposure is distinct from actual Orca event handling, and neither is audible/tactile quality assurance.

Current actual Orca evidence is **incomplete**: startup and native focus succeed, but the host's Orca42 stalls in ancestor-context generation when moving from a connection-list button to `Move node down`. The command returns exit3 rather than calling this a pass. [evidence/electron-xvfb-orca/orca.json](evidence/electron-xvfb-orca/orca.json) records the exact boundary. S0-06-UI remains pending until the complete screen-reader path passes; do not treat this host-version limitation as a waived requirement. Debian13's target assistive-technology version and manual auditory/tactile validation remain distinct checks.

Primary runtime guidance: [Playwright Electron API](https://playwright.dev/docs/api/class-electron), [Electron accessibility](https://www.electronjs.org/docs/latest/tutorial/accessibility), and [Chromium accessibility modes](https://chromium.googlesource.com/chromium/src/+/main/docs/accessibility/overview.md). The installed Orca42 and Speech Dispatcher0.11.1 startup/configuration sources were inspected before running the isolated processes. No host settings, privileged service or session policy was changed.
