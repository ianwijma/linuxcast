# Notes workspace — Instrument composition (U1-01 bounded UI refresh)

Component captures from the existing Notes browser fixtures (`packages/notes/fixtures/`), with the real
Tiptap 3.32.0 editor in headless Chromium (Playwright 1.64.1, Node 24.22.1, Bun 1.4.4). The persistence,
chooser and native-close effects in these fixtures are synthetic in-memory stand-ins, and all content is
public synthetic text. These captures are **not** Electron, native session, Orca or Debian GNOME/KDE
Wayland/X11 evidence. The actual-application captures are in
[`apps/desktop/evidence/instrument-notes/`](../../../../apps/desktop/evidence/instrument-notes/README.md).

Every historical capture in `packages/notes/evidence/*.png` is byte-identical to the base and records
the previous appearance.

Design references: [DESIGN.md](../../../../docs/design/DESIGN.md) Instrument direction (hanging alignment,
nouns get tiles, selection rail, edge detail), Tokens, Workspaces, Results and actions,
Controls/keycaps/line icons, Chat and notes, States and motion, Accessibility. Selected proposal
`docs/design/proposals/raycast-refresh/opus/`, Notes surface (`notes-dark.png`, `notes-error.png`). The
proposal's invented actions (dictation, Actions panel, Insert date, Link to note, word counts) are not
adopted.

| Capture | Test (`notes.ui.test.ts` unless noted) | State |
|---|---|---|
| `dark-list-editor.png`, `light-list-editor.png` | Instrument list and editor … | Selected row with rail; Save carries the bound `Ctrl` `S` keycap; prose is unboxed on the measure; axe 0 |
| `dark-dirty-draft.png` | Instrument draft state … | Draft persisted (not Saved): "Draft differs from the last saved version."; no band |
| `dark-confirmed-save.png` | same | After `Ctrl+S` from the focused Save button the fixture observes the save: "Matches the last saved version." |
| `light-recovery.png` | Instrument recovery band … | Uncertain Save: unclassified warning band above the title, with Reload stored note before the title; no success tone; axe 0 |
| `dark-unavailable.png` | same | Missing Pin capability: Pin disabled, unavailable note next to the actions, no write |
| `dark-trash-collection.png` | Instrument collections … | Show trashed notes collection with flags, selected trashed row; axe 0 |
| `light-revision-preview.png` | same | Saved revisions panel, selected revision rail, read-only preview |
| `light-keyboard-focus.png` | Instrument keyboard order … | Tab order New note → search → collections → row; Trash confirmation's Keep note focused, with an `Escape` keycap only where Escape is bound |
| `dark-200-percent.png` | Instrument 200 percent … | Root text at 200% at a 1120 px viewport: the container query stacks the panes, no horizontal overflow, focused Save in view |
| `dark-narrow.png` | same | 560 px viewport at 100%: stacked, library capped at 16rem and scrollable |
| `light-forced-colors-reduced-motion.png` | Instrument forced colours … | Emulated forced colours and reduced motion: selected-row outline, system-colour boundaries, no transitions |
| `light-import-preview.png` | `import.ui.test.ts` Instrument import preview … | Read-only import review; `Escape` keycap only on Cancel import; disabled formatting tools; axe 0 |
