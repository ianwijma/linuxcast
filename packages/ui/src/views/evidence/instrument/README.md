# Instrument shared-view captures (D1-02)

Actual Chromium captures of the production `ViewRenderer` mounted by the existing
Vite/Playwright fixture (`../../fixtures/`), produced by `bun run test:ui -- D1-02`
(Node 24.22.1, Bun 1.4.4, Playwright 1.64.1, bundled Chromium). Public synthetic
content only. These are component evidence, not Electron, Debian/GNOME/KDE or native
assistive-technology acceptance. Earlier captures in `../` are historical.

| Files | State |
| --- | --- |
| `{dark,light}-list.png`, `-grid.png`, `-detail.png`, `-form.png` | Instrument rows/captions/tiles, grid, detail metadata, shared Form |
| `{dark,light}-split.png`, `dark-split-pdf-band.png`, `dark-split-narrow.png` | List/detail separator at 42%, PDF unavailable band beside rows, stacked below 600 px |
| `text-200-split-{720,800}.png` | 200% root text: the container cannot hold the scaled list + detail minima, so the preview stacks below the list without horizontal overflow |
| `{dark,light}-glyph-grid.png` | Compact emoji grid, grouped rows, bottom selection rail, footer context |
| `{dark,light}-action-panel.png`, `dark-actions-filtered.png` | 280 px panel, bottom filter, destructive-last group |
| `dark-action-panel-grown.png` | Panel re-anchored inside the shell after a live revision grows the actions to 25 (800×600 viewport) |
| `dark-text-editing-footer.png`, `dark-text-view-footer.png` | Editable text: no Enter/Ctrl+Enter keycaps while the textarea has focus (560 px, labels stay visible); keycaps return on the view surface |
| `dark-loading.png`, `dark-refreshing.png`, `dark-empty.png`, `dark-error.png`, `dark-permission.png` | Loading plate/hairline, refresh keeping rows, empty plate, error and caller-copy warning bands |
| `dark-form-validation.png`, `dark-discard-draft.png` | Inline validation and discard confirmation |
| `text-200-actions.png`, `text-200-480-actions.png` | 200% text at 720 px and 480 px with every panel control reachable |
| `forced-colors.png`, `forced-colors-grid.png` | Forced colours: Highlight selection outline/rail |
