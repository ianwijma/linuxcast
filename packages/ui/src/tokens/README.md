# Canonical token bindings and fonts

`index.ts` imports [tokens.json](../../../../docs/design/tokens.json), the sole
value authority. `generate.ts` emits `tokens.css` and the optional Tailwind v4
`tailwind.css` semantic aliases. Regenerate with pinned Node:

```sh
node packages/ui/src/tokens/generate.ts
```

Schema version 2 (selected Instrument direction) has exact key sets per group;
`validateTokens` rejects unknown theme roles or groups, raw CSS colour/shadow
strings, alpha on opaque roles, unsafe font text, off-scale spacing, out-of-range
ratios and generated custom-property collisions. Importing the module throws if
the canonical file is invalid, so neither generation nor the renderer can run on
an invalid contract. `scripts/validate_plan.py` mirrors the schema for docs CI.

Units are deliberate. Type, line heights, spacing, radii and layout dimensions
use rem relative to the user's root text size (canonical px ÷ 16). `ratio.*` is
dimensionless (`--lc-ratio-list-detail: 0.42`). `strokePx.*` stays px for
non-scaling icon strokes. Elevation layers are structured `{y, blur, spread,
color, inset?}` objects emitted as px shadows per theme. Theme colours and the
eight closed `glyphTiles` categories are exact canonical values; only
`themes.*.scrim` carries alpha. `glyphCategories`/`GlyphCategory` export the
closed category enum.

Generated bindings are checked for drift. Contrast tests verify text/state
colors at AA and focus at 3:1 against all four semantic surfaces, accent text on
accent, and the Instrument roles: `controlBorder` ≥3:1 on every surface,
decorative `divider` below `controlBorder`, `selectionRail` ≥4.5:1 on
`selection`, tone/text/muted ≥4.5:1 on each tint, text/muted/focus on
`userMessage`/`toolSurface`/`canvas`, white glyph ≥4.5:1 on every tile, and a
bounded scrim alpha. Malformed-variant tests cover each rejection class.

Import `tokens.css` for CSS variables, or the primitives CSS entry which includes
it. For Tailwind, import the installed Tailwind stylesheet, token CSS, then
`tailwind.css`; utilities such as `bg-surface`, `text-muted`, `font-ui`, and
`rounded-row`, `bg-tile-command`, `shadow-shell`, `leading-prose` and `tracking-group-caption` resolve through the same scoped `--lc-*` variables. This follows
the [Tailwind v4 theme-variable API](https://tailwindcss.com/docs/theme).

`fonts.css` bundles locally installed, pinned Fontsource assets: Inter 5.3.0
(normal 400/500/600) and JetBrains Mono 5.3.0 (normal 400/500; keycaps use 500), including their supplied
language subsets. System font fallbacks remain available. Bundling resolves
the CSS font URLs into local build assets; no Google Fonts/CDN request is used.
Both fonts use SIL OFL 1.1. Unmodified license copies are included in `licenses/`
and must accompany the bundled fonts in the final package. The coordinator owns
package/resource wiring and the release license inventory.

React accessible-ID and external-preference subscriptions follow the official
[useId](https://react.dev/reference/react/useId) and
[useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
APIs; these source references do not establish native accessibility acceptance.
