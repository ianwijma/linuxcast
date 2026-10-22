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

Executed 2026-10-23 on Pop!_OS 22.04 amd64, Linux 7.1.1-76070101-generic; Node 24.22.1, Bun 1.4.4, React 19.3.1, React Flow 12.12.0, Vite 7.3.7, Playwright 1.64.1 / headless Chromium 156.0.8078.4, axe-core Playwright 4.14.0. **Browser renderer proof only.** No Debian desktop, compositor, Wayland/X11, screen-reader or packaged Electron evidence is established by this spike.

`bun run typecheck`, `bun run lint` and `python3 scripts/validate_plan.py` pass. The scoped UI suite has 10 executed tests, no skips, with this mapping:

| Criterion     | Authoritative test evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0-06-AC01    | `keyboard adds configures connects and removes a node` uses only Tab, Enter and native select keys after loading. Asserts node/edge counts, applied label and recovery focus. Additional tests prove layout independence, explicit cancellation, dirty-draft preservation and focus retention.                                                                                                                                                                                           |
| S0-06-AC02    | `rejects unrecognized ViewModel fields versions identities and action revisions` covers top-level/nested code/CSS fields, major versions, duplicate IDs, noninteger revisions, unsupported Form kinds, prototype keys, UTF-8 text/frame limits and stale/unknown action IDs. `edge validator rejects incompatible types ports missing nodes duplicates and cycles` covers all named failure boundaries, with a browser assertion that incompatible connection creation changes no edges. |
| S0-06-UI      | Keyboard editing, arrow navigation, form errors, dirty/cancel/focus, loading/empty/filtered-empty/error/retry/permission/cancelled/disabled Run states; axe WCAG 2 A/AA and 2.1 AA reports zero violations in dark and light; forced colors, reduced motion, 200% body/caption/emphasis text and long CJK/RTL labels remain operable. Screenshots below are from the tested renderer and have been inspected.                                                                            |
| S0-06-PRIVACY | Synthetic fixture source and screenshots contain no personal content or credentials. The privacy test observes only loopback renderer requests, rejects a synthetic private canary without echoing it, and checks fixture text for credential markers. No content is logged or persisted; fixture states do not invoke any backend.                                                                                                                                                      |

Screenshots: [dark ready and focus](evidence/dark-ready.png), [light ready and focus](evidence/light-ready.png), [loading](evidence/dark-loading.png), [empty](evidence/dark-empty.png), [error/retry](evidence/dark-error.png), [permission](evidence/light-permission.png), [cancelled](evidence/light-cancelled.png), [invalid edge](evidence/dark-invalid-edge.png), [forced colors and 200% text](evidence/forced-colors-text-200.png). These are visual evidence, not automatic pixel-diff baselines. Tests also assert semantic states and geometry rather than relying on screenshot resemblance.

Remaining limitations are intentional task boundaries: no persistence/package lifecycle, full node catalogue/registry schemas, live extension process, execution authority, permission grants, desktop effects, production D1 components, real assistive-technology session or Electron text-scaling validation. Those requirements remain assigned to their downstream tasks and release gates. The coordinator owns integration, acceptance status and PR references.
