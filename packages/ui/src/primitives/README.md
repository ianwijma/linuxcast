# Shared host primitives

D1-01 implements the [design contract](../../../../docs/design/DESIGN.md) version 2
(selected Instrument direction): Tokens, Components (Results and actions;
Controls, keycaps and line icons), States and motion, Accessibility, and Review gate. These are production React
components for the trusted host renderer; no Node, filesystem, network,
permission-granting or global keyboard API is exposed.

Import `@linuxcast/ui/styles.css` once and wrap the renderer in `ThemeProvider`.
Import components from `@linuxcast/ui` (the package exports this directory's
`index.ts`). The provider owns a scoped theme, defaults to the OS
appearance, and follows OS reduced-motion changes. `appearance` plus
`onAppearanceChange` supports a controlled preference; `defaultAppearance` and
`useTheme().setAppearance` support local state. Preference persistence belongs
to the host settings service. Every surface is opaque and requires no blur.

`Button` preserves native Enter/Space/form behavior and defaults to `type="button"`.
Use `type="submit"` intentionally. Variants: `secondary` (default, `controlBorder`
outline), `primary`, `danger`, and borderless `ghost` (additive) / `quiet`.
`busy` keeps the button focusable while blocking activation; ordinary `disabled`
uses the native disabled control. Provide an explicit progress label when busy.
The optional `shortcut` prop renders one decorative keycap per key and sets
`aria-keyshortcuts` (for example `Control+K`); it never registers a handler, so
pass it only when the caller binds that shortcut. `IconButton` requires a
textual `label` and now defaults to the `ghost` variant (pass `variant` to keep
a bordered treatment). Refs and native attributes are forwarded.

`TextField` requires a persistent `label`, generates unique label/help/error IDs,
and combines its descriptions with any caller-provided `aria-describedby`.
Validation is caller-owned; an `error` sets `aria-invalid` and displays the
message without announcing every keystroke. Native editable caret behavior is
preserved. `Keycap` and `ShortcutHint` only display keys; each key of a chord is
its own cap and labels are normalised to Linux names (`linuxKeyLabel`: ⌘/Cmd/Meta
→ Super, ⌥/Option → Alt, Return → Enter, Esc → Escape, single letters upper-case).
`ariaKeyShortcuts` builds the matching ARIA value.

`StatePlate` is the shared state surface: `kind` is `loading`, `empty`, `filtered`,
`error`, `denied`, `unsupported`, `interrupted`, `pending` or `success`; each has a
fixed glyph shape, eyebrow word and tone so colour is never the only signal.
`layout="block"` centres in an empty region; `layout="band"` is a tinted inline
strip that must not replace working results. Optional `detail` is a monospace
backend/error-code line and must never contain secrets or user content. The
existing `LoadingState`, `EmptyState` (`filtered` for filtered-empty),
`ErrorState` and `UnavailableState` (`reason: 'unsupported' | 'denied'`) remain
exported and render through `StatePlate`; `LoadingState` stays a compact inline
row with the `.lc-loading` hook. Every state accepts explicit public copy and
caller-owned actions and performs no retry, cancellation, permission or backend
operation itself. Loading announces politely by default; error announcements are
opt-in via `announce`. Never render `success` for a simulated or unconfirmed
effect, and never pass raw errors or secret-bearing diagnostics as copy.

`Row`, `GroupCaption` and `GlyphTile` freeze the shared row vocabulary for the
renderer lane. `Row` is presentational (`leading | title + subtitle | accessory |
keys`): callers own its role (`option`, link, button…), ARIA state, handlers and
shortcut binding. Its rail/selection fill follow `aria-selected`/`aria-current`,
or an explicit `current` for multi-select lists where `aria-selected` reports the
checkbox choice. Rows have minimum (not fixed) heights; under narrow widths or
200% text the trailing accessory/keys wrap below the title. Truncated text keeps
its full value in the tooltip and accessible name. `GroupCaption` starts on the
title column (or `flush`) with an optional tabular count; it is presentational,
so the group element carries the accessible name. `GlyphTile` accepts one of the
eight closed `glyphCategories` (unknown values resolve to `system` via
`resolveGlyphCategory`) and an optional host `LineIcon` name. There is no prop
for colours, CSS, SVG markup or components; tiles are decorative and rely on text
for meaning. `LineIcon` renders original static 16-unit glyphs. These primitives
do not change ViewModel contracts: a glyph-category wire field remains a
coordinator proposal.

`useFocusRestore(active, scopeRef)` captures the invoking element when a surface
opens and restores it when the surface closes, provided focus remains inside
that surface or has fallen back to the document body. It does not steal focus
from another control, install a focus trap, or manage modal keyboard behavior.
The caller moves initial focus after opening its surface.

## Validation and evidence

`primitives.test.ts` runs the actual React components in headless Chromium through
a temporary loopback Vite example server with the bundled Inter/JetBrains Mono.
Eleven checks cover dark/light opaque rendering with axe scans and computed
`controlBorder`, rows (hanging caption alignment, neutral selection plus 2 px rail,
independent query focus with `aria-activedescendant`, truncation with full names,
closed-category fallback, filtered-empty), multi-selection checkbox versus cursor,
every state-plate kind's eyebrow/glyph and announcement policy, ghost/primary
keycaps with `aria-keyshortcuts` and no registered handlers, labels/validation/
submit/cancel, keyboard activation and focus return, busy suppression/disabled tab
order, live OS theme/reduced motion (static loading arc, no transitions), 200%
root text at 720 CSS px (rows/captions grow, no clipping or horizontal overflow),
and forced colors (focus, control boundaries, selected-row outline, tile and band
borders). This is browser renderer evidence, not Electron, Orca, native
compositor, or full desktop acceptance.

Instrument captures (public synthetic content only) are recorded in
[evidence/instrument/](evidence/instrument/README.md). Earlier captures in
`evidence/*.png` document the previous appearance and are kept as history; they
do not establish Instrument adoption.

The example labels all actions as local preview behavior. It is not a replacement
for application integration. No user content, clipboard, settings, credentials,
desktop window or external page is used in screenshots.

Task mappings: `test:ui -- D1-01` → `packages/ui/src/primitives/primitives.test.ts`;
`test:unit -- D1-01` → `packages/ui/src/tokens/tokens.test.ts`.
