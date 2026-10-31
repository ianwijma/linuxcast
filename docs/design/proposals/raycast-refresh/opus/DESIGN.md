# Linuxcast selected design: “Instrument” (Opus)

**Status: selected by the user on 1 November 2026; application adoption pending.** Instrument is the chosen direction for all seven surfaces; see the [decision record](../README.md#decision-record). Sol and hybrid suggestions are comparison history. This selected specification is not yet the canonical runtime contract: it changes no application code, canonical [DESIGN.md](../../../DESIGN.md), canonical [tokens.json](../../../tokens.json), task status or manifest. The coordinator migrates the selected document and tokens together before shared implementation rollout.

Files in this directory:

- `DESIGN.md`: this document.
- [`tokens.json`](tokens.json): every canonical key and value, byte-identical, plus a scoped `proposal` block.
- [`review.html`](review.html): a self-contained review prototype. It has seven views, seven states, dark/light themes, a reduced-motion toggle and a 390 px responsive layout.

## Provenance

| Item | Record |
| --- | --- |
| Model | Opus 5.5, `claude-opus-5-5`, run as a design sub-agent in Claude Code |
| Requested effort | high |
| Actual effort | **Not verified.** The agent cannot inspect or confirm its own reasoning-effort setting from inside the session. Treat “high” as requested, not measured. |
| Launch failures | None |
| Inputs read | `AGENTS.md`, `docs/PLAN.md`, `docs/design/DESIGN.md`, `docs/design/tokens.json`, `docs/architecture/security.md`, the D1-01 and D1-02 task cards, `../BRIEF.md`, `../RESEARCH.md`, the `packages/ui/src/primitives` exports and README (read-only), and the generic frontend-design skill. Repository instructions override that skill. The skill’s advice to avoid Inter was not followed because the brief fixes Inter. |
| Date | 1 November 2026 |
| Sources | Only the material in `RESEARCH.md`. This agent fetched no Raycast pages, binaries or images. |

## Direction

The direction is called **Instrument**: Linuxcast should read like a well-calibrated tool. Every row aligns to the same columns. Type and alignment carry most of the hierarchy. Colour carries meaning only where it marks a kind of object or a state. Surfaces stay opaque and quiet, with fine detail at the edges.

It keeps the shared baseline: Inter and JetBrains Mono, a 720 px launcher, a 56 px header, 40 px rows, a 36 px footer, 16/12/8/4 radii and 100/160 ms motion. It differs from the current baseline through six visible choices.

1. **Hanging alignment.** Every row uses the same tracks: a 32 px glyph track, then title and subtitle, then an accessory, then keys. Group captions start on the **title** column, not the icon column, so the glyph tiles hang to the left of one clean text edge. Captions are 12 px uppercase with 0.06em tracking. A right-aligned monospace count sits on the same line.
2. **Nouns get tiles, verbs get lines.** Objects get a 20 px colour **glyph tile**: commands, files, notes, workflows, AI chats and nodes. Actions get monochrome 16 px **line icons**: in the action panel, buttons, the slash menu and toolbars. You can tell an object from a verb before reading it.
3. **Selection rail.** The selected row uses the neutral `selection` surface plus a 2 px accent **rail**, inset 4 px from the left edge. The rail measures at least 4.6:1 against the selection surface in both themes. Accent never floods the row. Keyboard focus is a separate signal in the `focus` colour.
4. **Footer as status line.** The left side shows the selected object: its tile, title and type. The right side shows the primary verb with `Enter`, an optional secondary verb with `Ctrl` `Enter`, then `Actions` with `Ctrl` `K`. Simple dividers separate the groups.
5. **Shape-coded states.** Every non-default state uses one **state plate**. It has a 20 px glyph whose *shape* encodes the state, an uppercase eyebrow word, a title, a body, an optional monospace detail line, and at most one primary and one secondary action. Plates come as a centred block or as a tinted inline band inside a list.
6. **Edge detail instead of blur.** Shells get an outer shadow and a 1 px inner top highlight. Regions are separated by a lower-contrast decorative `divider` hairline. There is no translucency, gradient or illustration.

## Source interpretation

| Research synthesis (`RESEARCH.md`) | How Instrument interprets it |
| --- | --- |
| 1. The query and the selected command are the strongest landmarks | The query is set at 16 px, weight 500. A 2 px focus underline appears under the field while it has keyboard focus. The selected row is the only element with the rail. Category, path and shortcut use 12–14 px muted type but stay at least 4.5:1. |
| 2. One vocabulary for built-ins, extensions and workflows | The same Row, GlyphTile, Keycap and StatePlate primitives appear in the launcher, sidebars, the action panel, the workflow palette, workflow nodes and the structured list. Workspaces change the composition, not the vocabulary. |
| 3. Actions stay close to the selection, with a visible keyboard path | The action panel opens bottom-right above the footer hint that summoned it. Its filter field sits at the bottom of the panel, next to that hint. Shortcuts use Linux `Ctrl`, `Alt` and `Super` keycaps. |
| 4. Chat prose breathes; tools and approvals stand apart; one model | Assistant prose is unboxed on a 680 px measure with a 24 px line height. Tool activity is a collapsible block on `toolSurface`. A pending approval blocks the response and has explicit buttons. The identity chip is read-only and says “Configured provider / configured model”. |
| 5. Loading, denied, unsupported and interrupted states are designed surfaces | Every one of them uses the StatePlate. Copy names the backend and the next action. No plate claims a system operation happened. |
| 6. Original identity; opaque baseline; no transplanted branding | The icons are original 16-unit SVG glyphs. There is no Raycast mark, no macOS window control and no promotional gradient. Workspace window controls are left to the GNOME or KDE decoration and are not drawn. |

Not taken from the research: blur, red promotional artwork, and a full-row colour selection.

## Baseline preserved

| Token | Value (unchanged) |
| --- | --- |
| UI and mono fonts | Inter → system sans; JetBrains Mono → monospace. The prototype adds local fallbacks (Cantarell, Noto Sans, Noto Sans Mono, DejaVu Sans Mono). |
| Type scale | 12 / 14 / 16 / 20 / 28 |
| Spacing | 4, 8, 12, 16, 20, 24, 32 |
| Launcher | 720 wide, at most 560 tall, header 56, row 40, footer 36, action panel 280 |
| Radius | shell 16, popover 12, row/control 8, keycap 4 |
| Motion | 100 ms state, 160 ms panel, reduced motion is opacity-only or none |
| Theme colours | All 13 dark and 13 light roles, unchanged |

## Proposal-only additions

All of these live under `proposal` in [tokens.json](tokens.json), each with a written description.

- **Theme roles:**
  - `divider`: decorative only, below 3:1.
  - `controlBorder`: at least 3:1 on every surface. The canonical `border` measures only 1.3–2.0:1, so it cannot identify a control by itself.
  - `selectionRail`
  - `userMessage`, `toolSurface`
  - `canvas`, `canvasDot`
  - `scrim`
  - `tintDanger`, `tintWarning`, `tintSuccess`, `tintInfo`
  - `glyphOnTile`
- **Glyph tiles:** command, files, clipboard, quicklink, ai, workflow, notes and system. Every tile measures 4.61–5.58:1 against its white glyph.
- **Layout:** glyph track 32, tile 20, glyph stroke 1.5, rail 2 (inset 4), group caption 28, key column up to 96, action row 36, action filter 44, workspace sidebar 240, inspector 300, prose measure 680, workflow node 208, list/detail default 42% (list at least 240, detail at least 280), grid cell at least 72.
- **Type metrics:** weights, line heights, letter-spacing, tabular numerals.
- **Elevation:** shadow strings and the shell highlight.
- **Easing:** one easing curve and a 4 px panel offset.

These additional contrast figures were computed with the same WCAG formula as `packages/ui/src/tokens/tokens.test.ts`:

| Pair | Dark | Light |
| --- | --- | --- |
| `selectionRail` against `selection` | 4.66 | 4.97 |
| `controlBorder` against background, surface, raised and selection | 4.77 / 4.29 / 3.84 / 3.06 | 3.37 / 3.74 / 3.49 / 3.11 |
| `danger`, `warning`, `success` and `focus` text against their tint | 7.10 / 9.52 / 8.86 / 8.00 | 5.78 / 6.42 / 6.00 / 5.64 |
| `muted` against `userMessage` | 6.51 | 6.18 |

## Component rules

Every measurement is a token. Features do not add their own values.

### Query header (56 px)

- **Layout:** 16 px left padding and 12 px right padding. From left to right:
  - a 20 px search glyph, or a 28 px back button in nested views;
  - an optional **scope chip**: 28 px tall, 8 px radius, `raised` fill, `border` outline, a 16 px tile and the command name;
  - the query field;
  - the **Ask AI** affordance: muted 12 px text and a `Tab` keycap.
- **Query text:** 16/24, weight 500. The placeholder uses `muted`.
- **Focus:** a 2 px `focus` underline spans the field width while the field is focused. The search glyph switches from `muted` to `text`.
- **Loading:** a 2 px accent hairline moves along the bottom divider. Under reduced motion it is a static 40% bar. Existing rows stay in place.
- **Nested views:** `Escape` pops back to the parent view. So does the back button, whose accessible name is “Back to root search (Escape)”.

### Group caption (28 px)

- 12/16 type, weight 500, uppercase, 0.06em tracking, `muted`.
- The caption aligns to the bottom of its 28 px box with 6 px of padding below.
- Left padding is 48 px, so the caption starts on the title column.
- The count on the right is 12 px monospace with tabular numerals. Captions inside sidebars and palettes are flush at 12 px.

### Row (40 px)

- **Grid:** `32px | minmax(0,1fr) | auto | auto`, with 8 px column gaps, 8 px left padding, 10 px right padding and an 8 px radius.
- **Content:**
  - The title is 14 px, weight 500, and truncates first at up to 70% of its column. When there is no subtitle it takes 100%.
  - The subtitle sits inline at 14 px in `muted`. When it is a path, it is 12 px monospace.
  - The accessory is 12 px `muted` text, or a state glyph plus its word.
  - Keys are right-aligned keycaps.
- **Selected:** `selection` fill, plus a rail 10 px from the top and bottom, plus `aria-selected="true"`, or `aria-current` in navigation lists.
- **Hover:** `selection` mixed 50% into the surface. Hover never reveals the only copy of an action.
- **Truncation:** truncated text keeps its full value in `title` and in the accessible name.
- **Multi-select (when specified):** uses a checkbox in the glyph track. It never reuses the rail.

### Glyph tile and line icons

- **Tile:** 20 × 20, radius 4 (`radius.keycap`), filled with its category colour. It holds a 14 px glyph with a white 1.5 px non-scaling stroke.
- **Small tiles:** the footer, scope chip and chat “who” line use a 16 px tile with a 12 px glyph. This is the only allowed size step.
- **Line icons:** 16 px, `currentColor`, 1.5 px stroke, round caps and joins, drawn on a 16-unit grid.
- **Categories for extensions:** an extension may pick one of the eight categories for a command. It cannot supply colours, raw SVG or CSS. Unknown categories fall back to `system`.
- **Forced colours:** tiles become `Canvas` with a `CanvasText` border and glyph.

### Keycap and shortcut hint

- **Keycap:** 20 px tall, at least 20 px wide, 5 px horizontal padding, 12 px monospace text at weight 500 in `muted`.
- **Edges:** a 1 px `border` outline with a 2 px bottom edge on a `raised` fill.
- **Chords:** each key is its own cap, with 3 px gaps between caps.
- **Labels:** always Linux names: `Ctrl`, `Alt`, `Shift`, `Super`, `Enter`, `Escape`, `Tab`, `Delete`. Never macOS glyphs.
- **Inside primary buttons:** the cap becomes transparent with an `accentText` outline at 45%.
- **Display only:** a keycap never registers a shortcut. The owning control carries `aria-keyshortcuts`.

### Footer (36 px)

- **Background and padding:** `raised` fill, a `divider` top rule, 12 px left padding and 4 px right padding.
- **Left context:** a 16 px tile, the title in `text` at weight 500, and the type in `muted`, all at 12 px. It never wraps.
- **Right actions:** footer buttons are 28 px tall with an 8 px radius: the label, then its keycaps. `vsep` dividers separate them.
- **Disabled:** if nothing is selected, or the backend is loading or denied, the primary button is a disabled native button in `muted`.
- **Narrow layouts (≤ 600 px):** labels hide and keycaps remain. Accessible names keep the labels.

### Action panel (280 px popover)

- **Position:** anchored 8 px above the footer and 8 px from the right. Its maximum height is the content region minus 16 px.
- **Surface:** `raised` fill, `border` outline, 12 px radius, popover shadow and highlight.
- **Header:** 32 px, showing the selected object’s title in `muted` 12 px.
- **List:** 36 px rows with a `24px | 1fr | auto` grid. Each row has a line icon, a label and keys. The selected row gets `selection` plus a rail.
- **Groups:** separated by `divider` lines rather than captions, which keeps the panel short.
- **Destructive actions:** go last in their own group. Text and icon use `danger`, and the accessible name ends “(destructive)”. Invoking one goes through the effect policy’s confirmation. It is never one keystroke straight into an effect.
- **Filter:** a 44 px field at the **bottom**. Focus shows as a 2 px inset `focus` top rule.
- **Keyboard:** typing filters. `Up`/`Down` move, `Enter` runs the action, and `Escape` or `Ctrl` `K` closes. Focus then returns to the query field.
- **Motion:** opens with a 160 ms fade and a 4 px rise, opacity only under reduced motion. It does not re-animate while you move through it.

### State plate

- **Block:** a `20px | 1fr` grid with 16 px padding and a maximum width of 520 px, centred in the empty region.
- **Band:** fills the full width of a list or document, with an 8 px radius, a `tint*` fill and 12/14 px padding. A band never replaces surrounding results that still work.
- **Content:**
  - eyebrow: 12 px uppercase, weight 600, in the tone colour;
  - title: 16/24, weight 600;
  - body: 14 px `muted`;
  - detail: 12 px monospace. It names the backend or error code and never contains secrets or content.
  - actions: one primary and one secondary, plus an optional ghost third.
- **Glyph shapes:**

| Kind | Glyph | Tone |
| --- | --- | --- |
| loading | open ring with a rotating arc, static under reduced motion | muted |
| empty | dotted circle | muted |
| filtered-empty | magnifier with a dash | muted |
| error | triangle with a bar | danger |
| permission denied | circle with a diagonal slash | warning |
| unsupported | dashed square | muted |
| interrupted | pause bars in a circle | warning |
| approval needed | shield with a mark | focus |
| success | check in a circle | success |

Colour is never the only signal. The eyebrow word and the shape always appear with it.

### List and detail

- **Columns:** `minmax(240px, ratio) | 9px separator | minmax(280px, 1fr)`. The ratio defaults to 42% and stays between 30% and 60%.
- **Separator:** a focusable `role="separator"` with `aria-valuenow`. `Left`/`Right` change it in 2% steps, `Home` and `End` jump to the limits, and pointer drag also works.
- **Detail preview:** sanitized Markdown with 16/20 padding.
- **Metadata:** a two-column definition list with `divider` hairlines between rows. Values are right-aligned with tabular numerals, and paths are monospace.
- **Preview failures:** a preview error or unsupported type renders a band *above* the last-known metadata. It never blanks the pane.

### Grid

- **Cells:** `repeat(auto-fill, minmax(72px, 1fr))` with 4 px gaps. Cells are 72 px tall with an 8 px radius, and emoji render at 32 px from the local emoji font.
- **Selected cell:** `selection` fill plus a 20 × 2 px rail centred 6 px above the bottom edge. This is the grid version of the row rail.
- **Loading:** placeholder cells keep the same footprint. Section captions use flush caption styling.
- **Images:** a failed image keeps its cell, with a glyph and caption.

### Workspace frame (chat, notes, workflow, settings)

- **Window:** an opaque shell with a 16 px radius and the same border and shadow as the launcher. The prototype uses 1180 × 680; the real size is user-resizable.
- **Header:** 56 px, containing a 20 px tile, a 16/24 title at weight 600, and quiet status text and action buttons.
- **No drawn window controls:** the desktop decoration supplies them.
- **Sidebar:** 240 px on the `background` fill, with the content area on `surface`. The darker sidebar sets the hierarchy without borders everywhere. Sidebars use the same Row primitive.
- **Page titles:** 28/36, weight 600, −0.01em tracking. Only document and settings page titles use this size.

### Chat

- **User turn:** right-aligned, at most 86% wide, on `userMessage` with a 12 px radius and a 12 px muted “You” label.
- **Assistant turn:** a 12 px “who” line with a 16 px AI tile and the text “Assistant · configured model”. The prose is unboxed at 14/24.
- **Tool block:** a `details` element on `toolSurface` with a `divider` outline and an 8 px radius.
  - The 36 px summary row holds a chevron, a line icon, the tool name in bold, the argument in monospace, and a status (glyph plus word) on the right.
  - Expanding it shows the arguments as monospace JSON and the result as metadata only: “content not logged”.
- **Pending approval:** an expanded tool block with **Allow once** (primary) and **Deny**. The response stays paused until you decide, and the approval stays visible if you switch chats.
- **Sources:** a chip row under the answer that says how each source was accessed.
- **Composer:**
  - 12 px radius, `raised` fill, `controlBorder` outline, and a focus ring that follows the composer while it has focus;
  - top row: attachment chips plus “Will send: your message + this file”, which states the exact data first;
  - bottom row: Attach, the read-only identity chip “Configured provider / configured model”, and Send with `Enter`.
- **No model selector in chat:** there is no per-chat provider or model selector. If no provider is configured, the identity reads “No provider configured” and Send is disabled.

### Notes

- **Header:** shows the save state as quiet text plus a glyph: “Saved locally”, “Not saved” or “Recovered draft”. It never runs a perpetual success animation.
- **Editor:** a 680 px measure with a 28/36 title, a 12 px muted metadata line and 16/24 section headings.
- **Tasks:** native checkboxes in the `accent` colour, with 32 px hit rows. A checked task is struck through in `muted`.
- **Slash menu:** reuses the action-panel row and list styling. It opens above the line so the end of the document never clips it.
- **Failures:** autosave failure, export denial, recovery and dictation unavailability appear as bands at the top of the document.

### Workflow editor

- **Columns:** palette 240 | canvas | inspector 300.
- **Header:** the name, save state (“Draft · 2 unsaved changes”), Package…, Test run (`Ctrl` `Enter`) and Save (`Ctrl` `S`, primary).
- **Palette:** captioned groups (Triggers, Inputs, AI, Logic, Outputs). Each item is a 36 px row with a category tile, a name and a `+` line icon. An unavailable item shows the unsupported glyph plus “Unavailable” and is `aria-disabled`.
- **Canvas:** a `canvas` fill with a 16 px `canvasDot` grid, scrollable for panning. Coordinates are presentation only.
- **Nodes:**
  - 208 px wide on `raised`, with a `border` outline and an 8 px radius;
  - content: a tile, an uppercase 12 px category, a 14 px title at weight 600, and one 12 px configuration line;
  - ports are 10 px circles at the top centre (input) and bottom centre (output);
  - the selected node gets `selection`, the rail and `aria-pressed`.
- **Edges:** 1.5 px curves in `controlBorder`, each labelled with a monospace type (“Trigger”, “Text”).
- **Invalid edge:** dashed `danger` with a label (“✕ Text → Notification”). The inspector explains the reason and offers a fix.
- **Toolbar:** a segmented control switches between **Canvas** and **Structured list**.
- **Structured list:**
  - an ordered list of steps; each step shows its index, tile, name, category and “in … from … · out … to …”;
  - actions: Connect…, Move up, Move down and Remove (`danger`, with confirmation), plus Add node… (`Ctrl` `Shift` `A`);
  - it covers the whole non-drag path.
- **Inspector:**
  - a header with a tile and the node name, and a Configure/Debug segmented control;
  - AI steps show the model as read-only: “Configured provider / configured model”;
  - each step lists its declared effects;
  - Debug shows run status, duration and input/output metadata, with secrets as handles (`secret:provider-key`).

### Settings, capabilities and permissions

- **Navigation:** the category sidebar uses Row with a 16 px line icon and `aria-current`, and has a search field. Deep links have the form `linuxcast://settings/<category>`.
- **Order:** pending decisions come first. On the Permissions page the permission card sits above the capability card, unless the current state concerns capabilities (loading, error, unsupported, interrupted).
- **Capability row:** name | status (glyph plus word) | backend in monospace | one remediation button. The action column is a fixed 140 px so the status column lines up across rows.
- **Permission card:**
  - a `tintInfo` header band with the approval glyph, a “Permission request” eyebrow and a title;
  - a definition list: requesting package (name, version, id), operation (`files.read` plus plain words), resource scope (exact path, recursion, read-only), and the extension’s stated reason;
  - the reason is shown as a quotation labelled “Written by the extension. It can’t grant itself access.”;
  - a radio fieldset: Allow once / Allow for version 1.2.0 / Deny, each with a consequence line;
  - Cancel, plus Confirm (or **Deny access** when Deny is chosen).
- **AI page:** the provider and credential form one card. The credential is masked and stored in the keyring, or marked session-only. The model is a separate card. Local speech is a third card and is never a fallback.
- **Privileged input:** always shows **Disabled · stopped**. Setup requires administrator authentication. The page names the emergency disarm chord (Left Ctrl + Right Ctrl + Escape) and makes no claim of universal password-field detection.

## Dark and light treatment

Both themes use the unchanged canonical colours.

| Aspect | Dark | Light |
| --- | --- | --- |
| Shell | `surface` #1C1D22 on `background` #111216 | `surface` #FFFFFF on `background` #F2F3F6 |
| Shadow | Deep, nearly black | Soft, ink at 8–18% alpha |
| Shell highlight | 6% white inner top line | 80% white inner top line |
| Sidebar | `background` | `background` |
| Rail, accent and primary fill | Coral #FF786E with `accentText` #151519 | Red #B92F32 with white `accentText` |
| Focus | Periwinkle #A6B9FF | Blue #3258BD |
| Bands | Dark tints (#2C2124 / #2A2620 / #1E2A24 / #20243A) | Pale tints (#FCEDEE / #FBF3E2 / #E9F5EE / #ECF0FB) |
| Glyph tiles | Same colours in both themes | Same colours in both themes |

The tiles are the one deliberate brand-colour element, and they keep 4.6:1 or better against their white glyph.

No surface depends on blur or transparency. `scrim` is only for modal confirmations, never behind the transient launcher.

## Keyboard behaviour

| Context | Keys |
| --- | --- |
| Launcher query | `Up`/`Down` move the selection (with `aria-activedescendant`). `Enter` runs the primary action and `Ctrl` `Enter` the secondary. `Ctrl` `K` opens the action panel and focuses its filter. `Tab` reaches **Ask AI** and never sends anything. `Escape` closes the action panel, then clears the query, then dismisses the launcher. |
| Nested launcher views (files, emoji) | `Escape` closes the action panel first, then pops to root search and returns focus to the query. |
| Action panel filter | Typing filters. `Up`/`Down` move, `Enter` runs the action, and `Escape` or `Ctrl` `K` closes and restores focus. |
| Emoji search field | `Up`/`Down` move by grid row. `Left`/`Right` keep native caret movement. |
| Emoji grid | Roving tabindex; all four arrows move, using geometry so movement crosses section captions. `Enter` and `Ctrl` `Enter` run the primary and secondary actions. |
| List/detail separator | `Left`/`Right` in 2% steps; `Home` and `End` jump to the limits. |
| Notes slash line | Typing `/` opens the menu. `Up`/`Down` move, `Enter` inserts, `Escape` closes. `Space` toggles a task. |
| Chat composer | `Enter` sends; `Shift` `Enter` adds a new line. |
| Workflow | `Tab` moves between nodes, which are buttons. `Enter` or `Space` selects. The structured list provides Connect, Move and Remove. `Ctrl` `Shift` `A` adds a node. |
| Review tabs (prototype only) | `Left`/`Right`, `Home` and `End`. |

Async results keep the selection by stable ID, as the canonical document already requires. The prototype rebuilds the DOM after every input but restores focus and caret position.

## Accessibility

- **Semantics:**
  - the launcher is a `combobox` controlling a `listbox` of `option` rows, grouped by `role="group"` with names;
  - the action panel is a `dialog` with a `combobox` filter and a `listbox`;
  - the emoji grid uses `grid` and `gridcell`;
  - nodes are `button` elements with `aria-pressed`;
  - sidebar navigation uses `aria-current`;
  - the permission choices are a native radio `fieldset`.
- **Names:** every control has an accessible name. Truncated titles keep full names. Keycaps have matching `aria-keyshortcuts` on their controls.
- **Focus:**
  - focus is a 2 px `focus` outline with a 2 px offset, inset inside lists;
  - the query field shows the 2 px underline instead;
  - focus contrast is at least 5.3:1 on every canonical surface.
- **Announcements:** only loading states use `role="status"`. Errors are not live-announced on every render; this follows the canonical rule to “announce asynchronous status sparingly”.
- **Contrast:**
  - all text pairs use canonical roles that already pass the contrast test;
  - new roles were checked against the same formula, as listed above;
  - the decorative `divider` is never the only boundary of a control. Fields and segmented controls use `controlBorder`.
- **Forced colours:**
  - selection becomes a `Highlight` outline plus a `Highlight` rail;
  - tiles, keycaps, buttons and fields get system-colour borders;
  - the invalid edge uses `Mark`.
- **Reduced motion:** no transitions, a static loading arc, a static progress bar, and an opacity-only panel fade. The prototype follows `prefers-reduced-motion` and also offers a manual toggle.
- **Text scaling:** layout uses token heights, but text containers truncate rather than clip. At 200% text the 40 px rows would need to grow. This remains an implementation check (see Remaining validation).
- **This mock is not accessibility evidence for the product.**

## State matrix

Abbreviations: **band** means an inline StatePlate band; **block** means a centred StatePlate. “n/a” means the state does not apply to that surface. ✓ means the state is shown in `review.html`.

### Launcher root

| State | Treatment |
| --- | --- |
| Initial | Empty query; groups are Commands, Files, Notes and workflows, Ask AI; the first row is selected (the prototype’s default shows the file row selected with the action panel open). ✓ |
| Loading | 2 px hairline; existing groups stay; the Files group shows “searching…” and two static skeleton rows; the selected note row is kept; polite status. ✓ |
| Empty (no history) | Commands remain, so root search is never fully empty. n/a |
| Filtered-empty | Block “No results for ‘lanch chekclist’” with **Search files for it** (`Enter`), **Ask AI** (`Tab`; nothing is sent) and Clear query. ✓ |
| Error | The Files group is replaced by a danger band “File search stopped responding” with a worker detail line, **Retry file search** and Open diagnostics. Other groups keep working. ✓ |
| Retry | Retry re-runs only the failed provider; the selection is kept. Shown as a simulated action. |
| Unavailable | “Switch windows” has an unsupported accessory and a band explaining the GNOME Wayland limit and the optional companion. `Enter` runs nothing. ✓ |
| Permission | The extension command “Find checklists” has a “No folder access” accessory and a warning band, with Review permission and Keep denied. ✓ |
| Selected | `selection` fill + rail + `aria-selected`. ✓ |
| Focused | Query underline; the list never takes focus away from the query. ✓ |
| Disabled | The footer primary is disabled when nothing is selected during loading. |
| Interrupted | The Ask AI row shows a warning band “Quick answer stopped part-way” with the partial text marked, Retry, Continue in Chat and **Copy partial text** (Copy, never Paste). ✓ |
| Success | No success toast for navigation. Effects report their real result only after the backend confirms it. The prototype shows a “Simulated” notice instead. |

### Action panel

| State | Treatment |
| --- | --- |
| Initial | First action selected; filter empty. ✓ |
| Loading | n/a. Actions are static for a given object; slow submenus show a loading row. |
| Filtered-empty | Row “No actions match ‘…’”. ✓ |
| Error | A failed action closes the panel and shows an error band in the owning view. |
| Unavailable | An action whose capability is missing is listed with the unsupported glyph and is `aria-disabled`; choosing it explains why. |
| Permission | An action that needs a grant opens the permission card; it never runs an effect directly. |
| Selected and focused | Rail plus `selection`; DOM focus stays in the filter. ✓ |
| Disabled | `aria-disabled`, with text in `muted` plus a reason in the accessible name. |
| Destructive | `danger` text and icon, in the last group, with confirmation according to the effect policy. ✓ |

### Files list and detail

| State | Treatment |
| --- | --- |
| Initial | `~/Documents/Linuxcast/` listed with six files; Launch checklist.md selected; Markdown preview plus metadata. ✓ |
| Loading | Six static skeleton rows; the detail is a skeleton; “indexing…” count; hairline. ✓ |
| Empty | Folder has no files: block “This folder is empty” with Choose another folder (spec only). |
| Filtered-empty | Block “No files match ‘checklst’” with Search all of Home and Clear search. ✓ |
| Error | Detail band “Preview failed” above the last-known metadata, with Retry preview and Open in Text Editor. ✓ |
| Unavailable | Launch deck.odp selected; band “No preview for presentations”, naming the missing conversion worker, with Open in default app. ✓ |
| Permission | List block “Can’t read ~/Documents/Linuxcast/” (EACCES), with no elevation offered; the detail shows “Nothing selected”. ✓ |
| Interrupted | Band “Search stopped early” above the four partial results, with Search again. ✓ |
| Selected, focused and disabled | Row rail; query underline; the footer primary is disabled when nothing is selected. ✓ |
| Success | Open and reveal return control to the desktop; nothing extra is shown. |

### Emoji grid

| State | Treatment |
| --- | --- |
| Initial | Recently used (synthetic), Smileys, Animals and nature, Objects; 🐧 Penguin selected; primary **Paste into Text Editor**, secondary **Copy**. ✓ |
| Loading | 24 placeholder cells; disabled primary. ✓ |
| Filtered-empty | Block “No emoji match ‘penguinn’” with Search “penguin” and Clear. ✓ |
| Error | Block “Emoji data didn’t load” (integrity check), with Retry and Open diagnostics. ✓ |
| Permission | Band “Paste into other apps was declined”; the primary becomes **Copy**. ✓ |
| Unavailable | Band “Direct paste isn’t supported in this session” (no RemoteDesktop portal); the primary becomes **Copy**. ✓ |
| Interrupted | Band “Copy didn’t finish” (clipboard ownership lost; nothing was pasted), with Copy again. ✓ |
| Selected and focused | Cell fill plus a bottom rail; focus ring inset. ✓ |
| Disabled | Primary disabled while loading or after an error. ✓ |
| Success | A real copy may show a brief “Copied” only after the clipboard confirms. Never “Pasted” for a copy. |

### AI chat

| State | Treatment |
| --- | --- |
| Initial | History sidebar; conversation “Summarise the launch checklist”; completed tool block (approved once); answer; source chip. ✓ |
| Loading | Tool block “Waiting for your approval” with Allow once and Deny; status line “Response paused…”; the composer shows **Stop**. ✓ |
| Streaming | Prose appears progressively under the who line; Stop is available. Specified; the interrupted state shows the partial form. |
| Empty | New chat: block “Ask about your notes, files or workflows” with two suggestions that fill the composer without sending. ✓ |
| Error | Danger band “The configured provider rejected the request” (401). No provider or model fallback. Retry and Open AI settings. ✓ |
| Permission | Tool block “Denied by you”, an assistant reply without the file, and a warning band with Ask again. ✓ |
| Unavailable | Block “No AI provider is configured” (no hosted fallback); the composer is disabled and the identity reads “No provider configured”. ✓ |
| Interrupted | Partial prose ending in “…”, then a warning band “Response interrupted — partial answer” with Retry and Copy partial text. ✓ |
| Selected | Sidebar row rail plus `aria-current`. ✓ |
| Focused | The composer outline turns `focus`. ✓ |
| Disabled | Send is disabled while there is no provider or while waiting for an approval. ✓ |
| Success | The answer simply renders. No celebratory treatment. |

### Notes

| State | Treatment |
| --- | --- |
| Initial | Note list; “Launch checklist” open; tasks; slash menu open on the last line. ✓ |
| Loading | Skeleton title and lines; “Opening…” status. ✓ |
| Empty | Block “No note selected” (Ctrl+N to create). ✓ |
| Filtered-empty | Sidebar block “No notes match ‘brief retro’” with Create “brief retro”. ✓ |
| Error | Header shows “Not saved” with the error glyph; persistent danger band with Retry save and Copy note text. ✓ |
| Permission | Band “Export to ~/Documents/Linuxcast/ was denied” with Choose another folder. ✓ |
| Unavailable | Band “Dictation isn’t set up” (local speech only; no silent remote fallback); the mic button is `aria-disabled` with a reason. ✓ |
| Interrupted | Band “Recovered unsaved changes” with Compare, Keep recovered and Discard recovered (`danger`). ✓ |
| Selected and focused | Sidebar rail; native checkbox focus. ✓ |
| Disabled | Dictation control (as above). ✓ |
| Success | Quiet “Saved locally” text. ✓ |

### Workflow editor

| State | Treatment |
| --- | --- |
| Initial | Four nodes (Schedule → Read note → Summarise → Show notification); Summarise selected; inspector open on Configure. ✓ |
| Loading | Dashed skeleton nodes; skeleton inspector; Save disabled. ✓ |
| Empty | Canvas block “Start with a trigger” with Add Schedule trigger and Use structured list; the structured list shows “No steps yet”. ✓ |
| Error | Dashed, labelled invalid edge; the target node shows “Input invalid”; inspector band with the reason and a fix. ✓ |
| Permission | Band “Automatic runs are off — effects not approved”, listing each effect; workflows cannot approve themselves. ✓ |
| Unavailable | Band “Clipboard-change trigger isn’t supported here”; the palette item shows the unsupported glyph and is `aria-disabled`. ✓ |
| Interrupted | Debug tab: “Run stopped at Summarise — outcome unknown”; no automatic resend; Review and re-run. Summarise is marked Interrupted and Show notification “Not run”. ✓ |
| Selected | Node fill + rail + `aria-pressed`; structured-list row rail. ✓ |
| Focused | Node and button focus rings. ✓ |
| Disabled | Move up on the first step, Move down on the last. ✓ |
| Success | Debug shows “Succeeded · 1.4 s (synthetic)”. ✓ |

### Settings

| State | Treatment |
| --- | --- |
| Initial | Permissions and capabilities page; permission card first, then capabilities. ✓ |
| Loading | Capability rows become skeletons; “Checking…” status; `aria-busy`. ✓ |
| Filtered-empty | Sidebar and page blocks for “hyprland”. ✓ |
| Error | Keyring row “Not responding” plus a danger band; credentials are session-only until resolved. ✓ |
| Permission | Decision recorded: “You denied Release Notes Helper access…” with Change decision and Remove extension…. ✓ |
| Unavailable | Credential storage “Session only” (`basic_text`) plus a band; nothing is written to disk. ✓ |
| Interrupted | “Privileged input setup was cancelled”; the service stays disabled and stopped. ✓ |
| Selected | Category `aria-current` plus rail; the chosen radio has a `selection` fill. ✓ |
| Focused | Native focus rings. ✓ |
| Disabled | n/a in this mock. |
| Success | A capability that becomes available after re-checking shows “Available” with the check glyph. ✓ |

## Mapping to host primitives

The existing `@linuxcast/ui` exports, from `packages/ui/src/primitives` and `views`, remain the adoption path. Nothing here needs extension or renderer code to style itself.

| Instrument element | Host primitive | Change needed if adopted |
| --- | --- | --- |
| Theme roles, tiles, metrics | `tokens.json` → `tokens.css` / `tailwind.css` via `generate.ts` | The coordinator adds the `proposal` roles to the canonical tokens and regenerates. The contrast test gains `selectionRail`, `controlBorder`, the tints and the tile/glyph pairs. |
| Button / IconButton | `Button`, `IconButton` | Add a `ghost` variant; switch the outline to `controlBorder`; render the keycap inside the primary button. |
| TextField | `TextField` | Use `controlBorder` for the outline; no other change. |
| Keycap / ShortcutHint | `Keycap`, `ShortcutHint` | Add the 2 px bottom edge; render each key of a chord as its own cap. |
| State plate | `LoadingState`, `EmptyState`, `ErrorState`, `UnavailableState` | Keep these, backed by one internal `StatePlate` with `kind` (adding `filtered`, `denied`, `interrupted`, `pending`, `success`) and `variant: block \| band`. Callers still own the copy and the actions. |
| Row, GroupCaption, GlyphTile, selection rail | `ViewRenderer` list/grid items | Add the shared Row and GroupCaption with hanging alignment. Add GlyphTile, which takes a category from the validated ViewModel. Add the rail. |
| Action panel, footer | `ViewRenderer` action panel / footer | Move the filter to the bottom; put destructive actions last with the “(destructive)” name suffix; build the footer as a status line. |
| List/detail separator | `ViewRenderer` detail | Add a focusable separator with min/max widths. |
| Safe Markdown | `SafeMarkdown` | Unchanged; the preview and chat prose use it. |
| Focus restore | `useFocusRestore` | Unchanged; the action panel and slash menu use it. |
| Workspace frame, chat, notes, workflow and settings compositions | Feature lanes, using the primitives above | These compositions belong to feature lanes, not new primitives. |

Extensions and workflow packages keep their declarative, validated ViewModels. The only new field they could use is a glyph category chosen from a closed enum. They cannot supply colour, CSS, SVG markup or components.

## Rollout implications

1. **Coordinator-owned token change.** The `proposal` roles move into canonical `tokens.json` and DESIGN.md together, in one coordinator PR. Generated CSS and Tailwind bindings are regenerated. `tokens.test.ts` extends its contrast assertions to the new pairs.
2. **Primitive PR (D1-01 lane).** Change Button, Keycap and TextField as above, and add `StatePlate`. Update the dark, light, forced-colours and 200% visual fixtures.
3. **Renderer PR (D1-02 lane).** Add Row, GroupCaption, GlyphTile and the rail; reorder the action panel; add the footer status line and the separator. This affects every launcher screenshot fixture, so the baselines must be regenerated and reviewed.
4. **Feature lanes.** Adopt the workspace compositions only after steps 1–3 merge. No lane hard-codes tile colours.
5. **Risk.** The hanging caption alignment and the bottom-placed action filter change muscle memory compared with the current build. Validate both with keyboard users before freezing them.
6. **No scope change.** Nothing here reduces the agreed 1.0 scope or changes any security, permission or AI-routing contract.

## Remaining validation and known limitations

What was done:

| Check | Result |
| --- | --- |
| Headless Google Chrome 156 screenshots at 1300 px and 390 px, dark and light | Inspected by the agent for every view and a sample of states |
| Scripted Chrome DevTools Protocol smoke test (all 7 views × 7 states × 2 themes, at 1300 px and 390 px) | No script exceptions and no network requests other than the local file |
| Accessible names | Present on every button, option, tab, field and separator except the decorative action-panel separators, which need none |
| `aria-activedescendant` targets | All resolve |
| Duplicate IDs | None |
| Launcher geometry | Measured at 720 / 56 / 40 / 36 and no taller than 560 |
| Horizontal overflow at 390 px | None |
| Keyboard paths (scripted) | Action-panel navigation; `Escape` order (panel, then nested view, then dismiss notice); `Ctrl` `K` reopen; query filtering with caret kept; root → Files → `Escape` → root with focus restored; emoji grid arrows; separator resize |
| Baseline tokens | The proposal file without its `proposal` block equals canonical `tokens.json` |

Limitations:

- **Fonts.** Inter and JetBrains Mono are **not installed** on the validation host, so the screenshots used fallback faces. Final appearance with bundled Inter will differ slightly in width. Emoji render with the host’s Noto Color Emoji.
- **Not emulated or tested:**
  - forced colours;
  - 200% text scaling;
  - a screen reader (Orca);
  - Electron;
  - GNOME or KDE on Wayland or X11.

  Headless Chrome is not evidence of desktop integration or assistive-technology behaviour.
- **Prototype shortcuts.** The prototype rebuilds the DOM on every input, which real implementations should not do. All system effects in it are simulated notices.
- **Text growth.** Rows have fixed 40 px heights. Under 200% text, the implementation must let rows and captions grow. This mock does not demonstrate that.
- **Wording.** State copy and backend names (for example the `RemoteDesktop` portal and `basic_text`) follow the repository’s security and integration documents. Final wording still needs product and editorial review.
- **Synthetic content.** All content is synthetic, including sizes, counts, times and request IDs.
