# Shared host primitives

D1-01 implements the [design contract](../../../../docs/design/DESIGN.md): Tokens,
States and motion, Accessibility, and Review gate. These are production React
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
Use `type="submit"` intentionally. `busy` keeps the button focusable while blocking
activation; ordinary `disabled` uses the native disabled control. Provide an
explicit progress label when busy. `IconButton` requires a textual `label`.
Refs and native attributes are forwarded to the underlying control.

`TextField` requires a persistent `label`, generates unique label/help/error IDs,
and combines its descriptions with any caller-provided `aria-describedby`.
Validation is caller-owned; an `error` sets `aria-invalid` and displays the
message without announcing every keystroke. Native editable caret behavior is
preserved. `ShortcutHint` and `Keycap` only display Linux key names; they do not
register shortcuts.

`LoadingState`, `EmptyState`, `ErrorState`, and `UnavailableState` accept explicit
public copy and caller-owned actions. They perform no retry, cancellation,
permission or backend operation themselves. Loading announces politely by
default; error announcements are opt-in via `announce`. Do not pass raw errors
or secret-bearing diagnostics as copy. Permission/unsupported outcomes must
remain accurately described by the calling feature.

`useFocusRestore(active, scopeRef)` captures the invoking element when a surface
opens and restores it when the surface closes, provided focus remains inside
that surface or has fallen back to the document body. It does not steal focus
from another control, install a focus trap, or manage modal keyboard behavior.
The caller moves initial focus after opening its surface.

## Validation and evidence

`primitives.test.ts` runs the actual React components in headless Chromium through
a temporary loopback Vite example server. Seven checks passed: dark/light opaque
rendering and axe scans, labels/validation/submit/cancel, keyboard activation and
focus return, busy suppression/disabled tab order, live OS theme/reduced motion,
200% root text scaling at 720 CSS px, and forced-colors focus/boundaries. This is
browser renderer evidence, not Electron, Orca, native compositor, or full desktop
acceptance. The D1-01 prerequisite/integration and actual Electron accessibility
gates remain separately tracked by the coordinator.

Actual screenshots from the component example (all public synthetic content):

- [Dark opaque](evidence/dark-opaque.png)
- [Light opaque](evidence/light-opaque.png)
- [Reduced motion](evidence/light-reduced-motion.png)
- [200% text](evidence/text-200-percent.png)
- [Forced colors](evidence/forced-colors.png)

The example labels all actions as local preview behavior. It is not a replacement
for application integration. No user content, clipboard, settings, credentials,
desktop window or external page is used in screenshots.

Task mappings requested from the coordinator:
`test:ui -- D1-01` → `packages/ui/src/primitives/primitives.test.ts`;
`test:unit -- D1-01` → `packages/ui/src/tokens/tokens.test.ts`.
Strict TypeScript and targeted ESLint checks also pass.
