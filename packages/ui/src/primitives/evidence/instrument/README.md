# D1-01 Instrument adoption: shared token and primitive evidence

Scope: canonical [DESIGN.md](../../../../../../docs/design/DESIGN.md) version 2 and
[tokens.json](../../../../../../docs/design/tokens.json) schema version 2, generated CSS/Tailwind bindings,
and the shared host primitives. This is the first bounded increment of the
user-selected Instrument direction. It does not migrate the views renderer,
launcher or feature surfaces (D1-02 and later lanes), and it does not change any ViewModel/IPC contract.

Applicable design sections: Tokens (including Instrument direction), Components → Results and actions,
Controls, keycaps and line icons, States and motion, Accessibility, Review gate.

## Captures (actual component example, bundled Inter / JetBrains Mono, headless Chromium)

All content is public synthetic preview text. No user content, clipboard, settings, credentials,
provider, desktop window or external page is involved.

| File | State |
| --- | --- |
| [dark-opaque.png](dark-opaque.png) | Dark opaque: controls, field focus, rows/captions/tiles, multi-select, block plates, all band kinds |
| [light-opaque.png](light-opaque.png) | Light opaque, same content |
| [rows-dark.png](rows-dark.png) | Hanging rows: selection fill + 2 px rail, keycaps per chord, mono path subtitle |
| [states-dark.png](states-dark.png), [states-light.png](states-light.png) | Error, denied, interrupted, pending, unsupported and success bands |
| [light-reduced-motion.png](light-reduced-motion.png) | OS reduced motion: no transitions, static loading arc |
| [narrow-row-200-percent.png](narrow-row-200-percent.png) | 480 px row at 200% text: trailing accessory words and individual keycaps wrap inside the row (review fix) |
| [text-200-percent.png](text-200-percent.png) | 200% root text at 720 CSS px: rows/captions grow, trailing keys wrap under the title, no horizontal overflow |
| [forced-colors.png](forced-colors.png) | Forced colours: Highlight outline + rail on the selected row, system borders on tiles, fields, buttons, keycaps and bands |

The earlier `../*.png` captures describe the previous appearance and are history only.

## Checks run (1 November 2026, Ubuntu-based amd64 host, pinned Node 24.22.1 / Bun 1.4.4)

| Command | Result |
| --- | --- |
| `bun run test:unit -- D1-01` (`tokens.test.ts`) | 26/26 pass at the original increment: binding drift, baseline preservation, unit handling, contrast for base and every Instrument role/tint/tile, 19 malformed-variant rejections. After review corrections: 152/152, including 125 shared schema cases |
| `bun run test:ui -- D1-01` (`primitives.test.ts`) | 11/11 pass: dark/light axe scans, controlBorder, rows/rail/focus/activedescendant, multi-select, state plates, ghost/keycaps/aria-keyshortcuts, forms, keyboard focus return, reduced motion, 200% text, forced colours |
| `python3 scripts/validate_plan.py` | Pass (schema v2 mirror) |
| `python3 scripts/test_validate_plan.py` | 30/30 pass (9 new token-schema rejections) |
| `bun run typecheck`, `bun run lint` | Pass |
| `bun run test:unit -- D1-02`, `bun run test:ui -- D1-02` | 27/27 and 11/11 pass (renderer consumes the changed primitives) |
| Downstream component UI suites L2-02, L2-03, L2-04, L2-05, L2-06, W2-01, W2-03, U1-01 | All pass |
| L1-01 component UI suite | 76 pass, 1 fail, 13 not run. The failure (`pending fallback read hides without late Form…`) also fails 2/2 with the baseline `b9fefd2` UI sources, so it is pre-existing and not caused by this change |

Incidental downstream screenshot recaptures were restored; only this directory holds new evidence.

## D1-01 criteria mapping (no status change claimed)

- `D1-01-AC01` dark/light/opaque and reduced motion: new component evidence above. The previously recorded Electron shell evidence predates Instrument and does not show the new appearance.
- `D1-01-AC02` keyboard focus, labels, text scaling: component evidence above (focus independent of selection, labels, 200% growth).
- `D1-01-UI` design states and keyboard/accessibility paths: component-level coverage for every plate kind, rows, multi-select, forced colours and reduced motion. Still pending: actual Electron captures of the affected product surfaces after the renderer lane adopts the primitives.
- `D1-01-PRIVACY`: captures contain only synthetic preview text.

## Remaining limitations

- Not run: actual Electron/private-Xvfb product regression for this increment. Product surfaces have not yet adopted Row/GroupCaption/GlyphTile/StatePlate bands (D1-02), so captures would mostly show restyled controls.
- Not evidence of: Debian 13 GNOME/KDE on Wayland/X11, Orca or other native assistive technology, or the full desktop matrix. Headless Chromium is renderer evidence only.
- Fontsource Inter's `cv11`/`ss01` features are requested through the token; if a bundled subset lacks them, Inter's defaults render.

## Review corrections (four P2 findings)

1. Shortcut key names from contract-validated extension data use own-property lookups in both
   name maps, so `__proto__`, `constructor`, `toString`, `hasOwnProperty` and `valueOf` render as plain
   keycaps with truthful labels (regression in `packages/ui/src/views/loading.test.tsx` through
   `viewModelSchema` and the real renderer action panel).
2. The row trailing group, accessory words and individual keycaps wrap within the row; the 480 px /
   200% case passes with `scrollWidth <= clientWidth` and every child inside the row (b40: 508 px).
3. `scripts/validate_plan.py` `token_errors` mirrors `validateTokens` exactly; both run the shared
   cases in `packages/ui/src/tokens/schema-cases.json` (20 valid, 105 invalid). b40 Python disagreed on
   24 cases; b40 TypeScript accepted a string spacing scale.
5. Final token-gate correction: the TypeScript exact-key check compared a comma-joined key list, so a
   single key such as `"medium,regular"` passed for two required keys. It now compares key counts and
   individual sorted keys. 18 shared comma-collision cases cover every exact-key group; the ecfd891
   validator falsely accepted 15 of them (the ratio, motion and shadow-layer cases were already rejected
   by value checks). Python used set comparison and already rejected all 18.
4. `UnavailableState` without `reason` is the unclassified `unavailable` plate (“Unavailable”), not
   “Unsupported in this session”; the credential needs-review regression is in
   `packages/secrets/src/ui/credentials.test.tsx`.
