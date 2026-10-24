# Canonical token bindings and fonts

`index.ts` imports [tokens.json](../../../../docs/design/tokens.json), the sole
value authority. `generate.ts` emits `tokens.css` and the optional Tailwind v4
`tailwind.css` semantic aliases. Regenerate with pinned Node:

```sh
node packages/ui/src/tokens/generate.ts
```

Type, spacing, radii, and layout dimensions use rem units relative to the user's
root text size (canonical pixel values divided by the browser's 16 px baseline).
Theme colors remain exact canonical values. Generated bindings are checked for
drift. Contrast tests verify text/state colors at AA and focus at 3:1 against all
four semantic surfaces, plus accent text against its primary-action background.

Import `tokens.css` for CSS variables, or the primitives CSS entry which includes
it. For Tailwind, import the installed Tailwind stylesheet, token CSS, then
`tailwind.css`; utilities such as `bg-surface`, `text-muted`, `font-ui`, and
`rounded-row` resolve through the same scoped `--lc-*` variables. This follows
the [Tailwind v4 theme-variable API](https://tailwindcss.com/docs/theme).

`fonts.css` bundles locally installed, pinned Fontsource assets: Inter 5.3.0
(normal 400/500/600) and JetBrains Mono 5.3.0 (normal 400), including their supplied
language subsets. System font fallbacks remain available. Bundling resolves
the CSS font URLs into local build assets; no Google Fonts/CDN request is used.
Both fonts use SIL OFL 1.1. Unmodified license copies are included in `licenses/`
and must accompany the bundled fonts in the final package. The coordinator owns
package/resource wiring and the release license inventory.

React accessible-ID and external-preference subscriptions follow the official
[useId](https://react.dev/reference/react/useId) and
[useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
APIs; these source references do not establish native accessibility acceptance.
