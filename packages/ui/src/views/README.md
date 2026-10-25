# Declarative host views (D1-02)

`ViewRenderer` renders the frozen, strict `ViewModel` union through shared host
primitives and canonical tokens. `ViewSession` owns a bounded navigation stack,
query, stable selection, primary action and scroll restoration. No model supplies
React, CSS, HTML, executable handlers or a resource URL.

Import `@linuxcast/ui/styles.css` and `@linuxcast/ui/views.css`, place the renderer
inside `ThemeProvider`, and create one `ViewSession` per authenticated command
session. Only trusted application code supplies `ViewHost` callbacks:

```tsx
const session = new ViewSession(initialView, viewId => broker.cancelView(viewId));
<ViewRenderer session={session} host={hostAdapters} />
```

This illustrates the adapter boundary; `broker` and `hostAdapters` are integration
responsibilities, not exports or working operation stubs. Do not construct adapters
from extension data. Session IDs/principals, capability/permission checks and actual
effects remain broker-owned. Returning from an action callback is only receipt of
user intent; the UI never displays operation success based on that return.

## Public API and behavior

- `session.update(viewId, unknown)` delegates snapshots/deltas to the existing
  bounded contract reducer. Stale updates are discarded, revision gaps return
  `request-snapshot`, malformed input leaves the previous valid view and displays
  a fixed error. The caller must send snapshot requests and enforce transport
  identity, 30 updates/second/coalescing and session cancellation.
- `session.navigate(unknown)` delegates push/replace/pop to the shared validator
  (16-view depth, unique IDs and matching source). Closing/replacing invokes the
  supplied cancellation callback. Query, selection, scroll and form drafts remain
  while a parent view is hidden. Removed components clear their local drafts and
  abort their picker/credential work. `session.close()` removes all views; call it when disposing the owning command session.
- Lists use grouped semantic listboxes and stable IDs. Host search filters title,
  subtitle and keywords; extension search emits query changes without local
  filtering. A query revision increments for each accepted change. New results do
  not replace a surviving selection or primary action. Removal selects the first
  available item; disabled items remain readable with their reason.
- Grids use the same selection model with spatial arrow navigation, density,
  captions and stable failed-image cells. Optional item previews share a keyboard
  adjustable divider and become vertically stacked on narrow layouts.
- Detail renders CommonMark, metadata and host-resolved attachments. Text supports
  readonly and local editable drafts. Image views use host-resolved images. PDF
  previews explicitly report unavailable until a sandboxed document viewer is
  integrated; available declared document actions remain usable.
- `Ctrl+K` opens the searchable action dialog, arrows select an action, Enter
  dispatches it, Tab traverses native controls, and Escape closes it and restores
  focus. Outside editable controls declared shortcuts are supported. Enter uses
  the selected primary action; Ctrl+Enter selects the supplied secondary action.
  Escape otherwise pops the view (last pop closes the session view). The broker
  owns actual launcher dismissal. Dirty forms/text request explicit discard.
- Forms cover text, secret, number, date, boolean, enum, file, directory and
  application fields. Persistent labels, descriptions and inline errors remain
  accessible; required/range/type/UTF-8/aggregate-size validation happens before
  submission. New host validation errors remain until corrected. Submit/cancel
  IDs are bound by the schema. Values never submit on change.
- `host.action` receives the current view ID, revision, action ID and selected item
  ID, plus typed values only for explicit form/text submission. Main must
  revalidate current view/revision/item, field values and effect policy before
  dispatch, including destructive confirmations when policy requires them.
- `pickReference(kind, signal)` returns a validated opaque file/application
  reference. Display paths never authorize access. Missing adapters show an
  explanatory disabled control. Denial/invalid results retain the draft and show
  a fixed failure; no raw exception is rendered.
- `sealSecret(value, signal)` and `releaseSecret(handle)` must both exist for a
  nonempty secret submission. Only this dedicated trusted credential adapter sees
  raw input. Ordinary action values receive `{secretHandle}`, never the secret.
  Closed/stale/failed submissions release acquired handles; accepted intents
  transfer handle ownership to the broker. Inputs are masked, never persisted,
  and cleared after accepted intent/close. JavaScript memory is not claimed to
  provide forensic zeroization. Do not forward the raw credential adapter to an
  extension or log its arguments.

## Safe content boundary

CommonMark uses pinned MIT `react-markdown` 10.1.0 with a fixed tag allowlist,
`skipHtml`, no plugins and no Markdown images. External URLs pass the shared URL
schema (no credentials, file/data/javascript or unknown schemes). Links have no
navigable `href`; keyboard/click activation calls the trusted `openLink` adapter.
Rendering performs no external link/image requests. Code blocks are inert text.
Official dependency provenance: [release](https://github.com/remarkjs/react-markdown/releases/tag/10.1.0),
[documentation](https://github.com/remarkjs/react-markdown/blob/10.1.0/readme.md),
[MIT license](https://github.com/remarkjs/react-markdown/blob/10.1.0/license).

`resolveImage` accepts opaque asset/file references and returns a broker-created
packaged `linuxcast-app://shell/` image URL. Credentials, ports, queries, fragments, escapes, traversal and other schemes are rejected. Blob images remain unavailable under the current production `img-src 'self'` CSP; this lane does not broaden that policy. It is a
trusted adapter that must enforce grants, MIME/decoded-size limits, cancellation,
the packaged resource protocol. It must not return a URL
obtained from a model. Missing/broken images remain explicit stable placeholders.
PDF documents are never embedded in an iframe/object or parsed in this component.
The fixed builtin icon vocabulary has an inert fallback for unknown names.

## Validation and acceptance mapping

Executed 25 October 2026 on Linux x86_64 with pinned Node 24.22.1, Bun 1.4.4,
React 19.3.1, Playwright 1.64.1 and its bundled headless Chromium 156.0.8078.4. These are production
components mounted by the existing Vite/Playwright fixture harness, **not a native
Electron/Orca or desktop-session acceptance run**.

- **AC01:** strict malformed/executable/non-JSON/oversized model rejection, safe URL
  checks; actual browser hostile Markdown shows no script/image/frame or outgoing
  request. Prototype-like field IDs remain ordinary own data. No renderer Node or
  effect implementation is introduced.
- **AC02:** 16 unit checks across `session.test.ts` and `form.test.tsx` cover
  revision gaps/staleness, stable selection/primary action, navigation/cancellation,
  UTF-8 bounds, typed references, validation, raw-secret exclusion and late-handle
  release. Ten browser checks exercise list/grid arrows, primary/secondary actions,
  searchable actions/Escape/focus return, drafts and explicit submit/discard.
- **UI:** browser checks include dark/light List/Grid/Detail/Form, zero axe
  violations in checked states, ActionPanel, loading/empty/error/permission,
  multilingual/long names, 200% text, forced colors and reduced motion. Canonical
  DESIGN sections: Tokens; Shell and navigation; Results and actions; List, grid,
  detail and form; States and motion; Accessibility; Review gate.
- **PRIVACY:** fixtures are public synthetic content. Credential tests use only a
  synthetic transient string; no screenshot is taken while it is entered. The
  example output records action IDs/revision/field count only, never values.
  Production code does not log content, exceptions, drafts or credentials.

Full TypeScript validation and owned ESLint checks pass. The coordinator mapped these files to `bun run test:unit -- D1-02` and
`bun run test:ui -- D1-02` using the existing runners; no new harness was added.
`python3 scripts/validate_plan.py` and diff whitespace checks pass.

Screenshots in `evidence/` are actual browser captures: both themes for all four
views; both action panels, dark filtered actions, loading, empty, error, permission, inline form validation
and discard dialog; 200% text action panel and forced colors. They contain only
public fixture UI. They are review evidence, not a claim of native assistive
technology, Wayland or X11 integration.

D1-01's actual native accessibility/UI acceptance remains pending, so D1-02 is not
marked complete. Actual Electron screen-reader/text-scaling/high-contrast/reduced-
motion checks and host adapters remain integration work. No VM, host display,
physical input, privileged service or real filesystem operation was exercised.
