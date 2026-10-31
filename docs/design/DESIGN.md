# Linuxcast design system

**Normative for every user-facing implementation task.** Version 2, 1 November 2026 (version 1: 22 October 2026). Read with [tokens.json](tokens.json), [visual examples](assets/README.md), and [the feature specification](../product/builtins.md).

Version 2 adopts the user-selected **Instrument** direction for all seven surfaces (launcher, files, grid, chat, notes, workflows, settings); see the [decision record](proposals/raycast-refresh/README.md#decision-record) and the [selected proposal](proposals/raycast-refresh/opus/DESIGN.md). This document and `tokens.json` are the production contract. The proposal is design history: its prototype limitations (fixed-height rows, simulated effects, fallback fonts) are not part of this contract. Shared host primitives implement the contract; surfaces adopt it lane by lane, and earlier appearance evidence does not prove adoption.

## Evidence and intent

The Raycast website and current v2 launcher, emoji/grid and chat screenshots were inspected during research. The website uses a near-black background, white type, red/coral graphics, generous marketing spacing, Inter, and monospace keyboard/code details. The client references show graphite/translucent shells, fine outlines, compact icon-leading rows, neutral selections, restrained hover, keyboard hints, separate tool windows, and a compact action footer. The chat reference uses a navigation sidebar, largely unboxed assistant prose, and a rounded composer. [Website](https://www.raycast.com/), [v2 client references](https://manual.raycast.com/new-in-v2), [technical design discussion](https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast).

Those are visual observations, not extracted proprietary client CSS or pixel-perfect measurements. The dimensions and colours below are **original Linuxcast decisions**. Do not copy Raycast logos, macOS traffic-light controls, proprietary artwork, or its website's promotional gradients into ordinary desktop surfaces. The reference artwork remains hosted by its owners; the committed mockups are original SVG specifications.

## Principles

- Keyboard-first, with complete mouse and assistive-technology support.
- One consistent command/result/action language across built-ins, extensions and workflows.
- Dense enough for quick scanning, with predictable alignment and restrained decoration.
- Visible permission and capability states. Never show a successful action when a backend is unavailable.
- Separate larger workspaces for chat, notes, settings and workflow editing; keep the launcher transient and focused.
- Appearance must work without compositor blur. Opaque themes are a first-class rendering path.

### Instrument direction

Linuxcast reads like a well-calibrated tool: every row aligns to the same columns, type and alignment carry most hierarchy, colour marks only a kind of object or a state, and surfaces stay opaque and quiet with fine edge detail.

1. **Hanging alignment.** Rows share tracks: 32 px glyph track, title and subtitle, accessory, keys. Group captions start on the title column so glyphs hang left of one clean text edge.
2. **Nouns get tiles, verbs get lines.** Objects (commands, files, notes, workflows, chats, nodes) get a 20 px category glyph tile. Actions get monochrome 16 px line icons.
3. **Selection rail.** The selected/current item uses the neutral `selection` surface plus a 2 px `selectionRail`. Accent never floods a row. Keyboard focus is a separate `focus` signal.
4. **Footer as status line.** Left: the selected object (small tile, title, type). Right: primary verb with `Enter`, optional secondary with `Ctrl` `Enter`, then Actions with `Ctrl` `K`.
5. **Shape-coded states.** Every non-default state uses one state plate: a glyph whose shape encodes the state, an eyebrow word, title, body, optional detail and caller-owned actions.
6. **Edge detail instead of blur.** Shells use an outer shadow and a 1 px inner highlight; regions are separated by the decorative `divider`. No translucency, gradient or illustration.

## Tokens

`tokens.json` (schema version 2) is the single machine-readable source. Generated `tokens.css` and Tailwind semantic aliases derive from it; component CSS uses only those variables. Features do not introduce ad-hoc colours, spacing, shadows or extra theme roles. Every group has an exact key set; the canonical validators (`packages/ui/src/tokens/index.ts` and `scripts/validate_plan.py`) reject unknown roles, raw CSS strings, translucent opaque roles, off-scale spacing and custom-property collisions.

| Token family | Choice |
|---|---|
| UI font | Inter, then system sans-serif; bundled licensed assets (400/500/600), `cv11` and `ss01` features |
| Code/key font | JetBrains Mono (bundled 400/500), then system monospace; tabular numerals for counts and metadata |
| Emoji font | Local Noto Color Emoji, then Twemoji Mozilla; never fetched remotely |
| Type | 12/16 caption, 14/20 body, 16/24 emphasis, 20/28 panel title, 28/36 workspace title, 14/24 prose; weights 400/500/600; caption tracking 0.02em, group caption 0.06em, workspace title −0.01em |
| Spacing | 4 px base, 8/12/16/20/24/32 px scale. Prototype sub-grid offsets (3, 5, 6, 10, 14 px) snap to this scale |
| Launcher | 720 px default width; responsive to usable monitor area; at most 560 px tall; 56 px query header; 40 px minimum result row; 36 px footer; 280 px action panel |
| Row geometry | 32 px glyph track, 20 px tile (16 px small), 14/12 px tile glyph, 16 px line icon, 2 px rail inset 4 px, 28 px minimum group caption, keys column up to 96 px |
| Controls | 32 px minimum control height (28 px compact footer verbs), 20 px minimum keycap, 2 px focus, 1 px hairline, 36 px action row, 44 px action filter, 520 px state plate measure |
| Workspaces | 56 px header, 240 px sidebar, 300 px inspector, 880 px minimum, 680 px prose measure, 96 px composer minimum, 208 px workflow node, 10 px port, 16 px canvas dot grid, 600 px narrow breakpoint |
| List/detail | 42% list by default, between 30% and 60% in 2% steps; list at least 240 px, detail at least 280 px; grid cells at least 72 px |
| Radius | 16 shell, 12 popover/composer, 8 row/control, 4 keycap/tile |
| Elevation | Per-theme shell and popover shadows plus a 1 px inner highlight, stored as structured layers |
| Accent | Coral for primary emphasis and the selection rail, never the sole indicator of state |
| Motion | 100 ms state, 160 ms panel, one standard easing, 4 px panel rise; reduced motion removes translation/scale |

Units are deliberate. Type, spacing, radii and layout dimensions are emitted in rem so they follow the user's text size. List/detail proportions are dimensionless ratios. Glyph strokes (1.5 px) are device-independent pixels with non-scaling strokes. Shadows are pixel offsets. Only the modal `scrim` carries alpha; every other theme role and every glyph tile is opaque.

Dark surfaces use graphite, light surfaces use warm neutral white; both retain separate background/surface/raised/selection/border roles. Text, muted text, destructive, warning, success and focus roles have independent values. Instrument adds these semantic roles in both themes:

| Role | Purpose and rule |
|---|---|
| `divider` | Decorative hairline between regions of one surface. Below the control-boundary contrast by design; never the only boundary of an interactive control. |
| `controlBorder` | Outline of editable fields, buttons, checkboxes, radios and segmented controls. At least 3:1 against background, surface, raised and selection. The baseline `border` stays for decorative containers and keycaps. |
| `selectionRail` | 2 px rail inside the selected row/cell/node. At least 4.5:1 against `selection`; always paired with the neutral selection surface and ARIA state. |
| `userMessage`, `toolSurface` | Subdued user chat turns; collapsible tool-activity and approval blocks. Assistant prose stays unboxed. |
| `canvas`, `canvasDot` | Workflow canvas field and its decorative dot grid. |
| `scrim` | Behind modal confirmations only; never behind the transient launcher. |
| `tintDanger`, `tintWarning`, `tintSuccess`, `tintInfo` | Inline state bands. Tone, text and muted text keep at least 4.5:1 on each tint. `tintSuccess` is never used for simulated results. |
| `glyphOnTile` | Glyph stroke on category tiles. |

Glyph tiles form a **closed vocabulary** of eight categories: `command`, `files`, `clipboard`, `quicklink`, `ai`, `workflow`, `notes`, `system`. They keep the same colours in both themes and at least 4.5:1 against their white glyph. Hue aids scanning only; type is also given by glyph shape and text. Unknown categories fall back to `system`. Extensions and workflow packages may at most name a category through a validated contract; they cannot supply colours, CSS, SVG markup or components. Adding a category or a wire field is a coordinator-owned contract change.

Contrast is checked against the actual token values in `packages/ui/src/tokens/tokens.test.ts`; decorative mockups are not accessibility test evidence.

## Shell and navigation

Launcher: query header with optional back button and mode/breadcrumb; grouped results; a scrollable content region; bottom action footer. The query is 16/24 at weight 500; while focused a 2 px `focus` underline spans the field. Loading shows a 1 px accent progress hairline on the header divider (static under reduced motion) while existing rows stay in place. Default height follows content up to 560 px, never beyond the work area's safe margin. Preserve selection by stable result ID when async results arrive. Do not move the primary action unexpectedly because a slow provider completed.

`Escape` closes the action panel first, then pops a nested view, then dismisses the launcher. `Enter` invokes the selected primary action; `Ctrl+Enter` invokes an explicitly supplied secondary action. `Ctrl+K` opens the action panel; `Tab` moves between interactive controls or the explicit AI affordance in root search, never silently transmits a query. Arrow keys navigate lists/grids while text caret behaviour remains native inside editable fields. Shortcut labels use Linux Ctrl/Alt/Super names, not macOS glyph assumptions.

Global launcher shortcut defaults to `Alt+Space` only if available; onboarding records the user-approved portal/desktop shortcut when reserved. Conflict states offer a recorder and `linuxcast --toggle` fallback. A tray is optional and cannot be the only way to reopen or quit on GNOME.

## Components

### Results and actions

Rows use hanging alignment: a 32 px glyph track (20 px category tile, line icon or multi-select checkbox), title (weight 500) with inline muted subtitle (12 px monospace for paths), optional 12 px muted accessory, and right-aligned keycaps. Rows have a 40 px *minimum* height and grow with text; when space is short the accessory and keys wrap under the title instead of truncating it to nothing. Group captions are 12 px uppercase muted type with 0.06em tracking, start on the title column, and carry an optional right-aligned monospace count; sidebars and palettes use flush captions. Captions are presentational; groups carry accessible names.

The selected or current item uses the neutral `selection` surface plus the `selectionRail`, together with `aria-selected` or `aria-current`; accent is not a full-row flood. Hover mixes half of `selection` into the surface and never reveals the only copy of an action. Truncate long names visually but expose complete accessible names/tooltips. Checkbox multi-selection is distinct from the keyboard cursor: checkboxes record choice, the rail follows the cursor only, and multi-select never reuses the rail.

The action panel is a 280 px searchable popover anchored above the footer hint that opened it, with 36 px action rows (line icon, label, keys), groups separated by `divider` lines and the 44 px filter at the bottom. Destructive actions are last in their own group, use `danger` text/icon, end their accessible name with “(destructive)”, and are labelled and visually differentiated. Confirmation is required when specified by the action's effect policy, not for every reversible navigation. The footer is a status line: selected-item context (small tile, title, type) on the left and primary/secondary/action-panel verbs with keycaps on the right; at the narrow breakpoint labels hide visually and remain in accessible names.

### Controls, keycaps and line icons

`Button` variants are `secondary` (raised fill, `controlBorder`), `primary` (accent fill, accent text), `danger` (`danger` text), and borderless `ghost`/`quiet` for toolbar and footer verbs. Icon-only buttons are square ghost controls with a required accessible name. Controls are at least 32 px tall and grow with text. Busy controls stay focusable and suppress activation; disabled controls use native disabled state. Text fields have a persistent 12 px label, `controlBorder` outline, caller-owned validation, and help/error descriptions linked by ID.

Keycaps are display-only: 20 px minimum, 12 px monospace at weight 500 in `muted`, `raised` fill, 1 px `border` with a 2 px bottom edge. Each key of a chord is its own cap. Labels always use Linux names (`Ctrl`, `Alt`, `Shift`, `Super`, `Enter`, `Escape`, `Tab`, `Delete`); macOS glyphs are normalised. Inside primary buttons caps become transparent with an accent-text outline. A keycap never registers a shortcut; the owning control carries `aria-keyshortcuts` only when the caller actually binds it.

Line icons are original 16-unit glyphs drawn in `currentColor` with 1.5 px round non-scaling strokes. They are static host artwork, decorative, and never caller-supplied.

### List, grid, detail and form

List/detail uses a movable divider and a minimum readable detail width. Grids support image/icon cells, captions, category filters and keyboard navigation; image failures retain a stable cell. Detail renders sanitized Markdown, metadata (a two-column definition list with `divider` rows, tabular numerals and monospace paths), code and safe links. The list/detail separator is focusable (`role="separator"` with value), moves in 2% steps with `Left`/`Right`, jumps with `Home`/`End`, and also supports pointer drag. A preview failure renders a band above the last-known metadata and never blanks the pane. Grid cells keep a stable footprint while loading or after image failure; the selected cell uses `selection` plus a short bottom rail. Forms have persistent labels, inline validation, dirty-state handling, keyboard order and clear submit/cancel actions. Plugin ViewModels render through these same primitives.

### Chat and notes

Chat uses a project/history sidebar and a reading pane. User messages have a subdued `userMessage` surface; assistant prose remains largely unboxed on a 680 px measure at 14/24, under a quiet “Assistant · configured model” line. Tool activity is collapsible with readable status and inspectable arguments. Pending approvals remain visible after navigation and require explicit action. Tool blocks use `toolSurface` with a `divider` outline and keep results as metadata unless content logging is explicitly allowed. The composer presents attachments and the active provider/model as a read-only identity chip (one global provider/model, no per-chat selector or hidden fallback); show the exact data sources before sending contextual material. With no configured provider, the identity says so and sending is disabled. Chat is selected for later AI implementation; prototype chat flows are not product behaviour.

Notes use the same typography and action system with a calm editor surface, slash-command menu, task lists and searchable titles/content. Autosave state is visible on error, not a perpetual success animation; quiet text such as “Saved locally”, “Not saved” or “Recovered draft” plus a state glyph. Autosave failure, export denial, recovery and dictation unavailability appear as bands at the top of the document.

### Workflows

The editor has a left searchable node palette, a central pannable canvas, and a right configuration/debug inspector. Header shows name, save state, run/test and package actions. Use semantic node categories with glyph tiles and text; colour alone cannot encode type. Nodes are 208 px `raised` cards with category, title and one configuration line; the selected node uses `selection`, the rail and `aria-pressed`. The canvas uses `canvas` with a decorative 16 px `canvasDot` grid; edges use `controlBorder`, invalid edges are dashed `danger` with a text label. Ports show type and compatibility. Invalid edges explain the reason. Keyboard users can add, select, configure, connect and remove nodes through an accessible structured-list alternative to dragging.

The debugger exposes run status, selected node input/output, duration and redacted errors. Secrets are handles/redacted values. Canvas coordinates are presentation data, not execution semantics. See [workflow specification](../architecture/workflows.md).

### Settings and permissions

Settings has searchable categories and stable deep links. The category sidebar uses the shared row with line icons and `aria-current`; pending decisions come first on a page. Capability rows show name, status (glyph plus word), backend and one remediation action. AI provider credentials and model selection are separate controls. Secrets are masked and never echoed in diagnostics. Optional integrations show state, capability impact and an enable/disable action.

The keyboard-service onboarding explicitly describes physical keyboard observation/injection, selected devices, separate Hyper/snippet toggles, and the emergency disarm chord. Do not suggest it can universally identify password fields. Permission cards show requesting package, operation, resource scope and once/persistent/deny choices supported by policy, under a `tintInfo` header band; an extension's stated reason is quoted and labelled as written by the extension, which cannot grant itself access. Unavailable capabilities explain remediation without jargon-heavy product text.

## States and motion

Every component implements initial/loading, streaming/refreshing, empty, filtered-empty, error/retry, unavailable/permission, selected/focused, disabled and success states where relevant. Keep layout stable while loading. A partial AI response is labelled interrupted on error. A clipboard copy fallback is not labelled as a paste.

Non-default states use one **state plate**. Kinds and their shape, eyebrow word and tone:

| Kind | Glyph shape | Eyebrow | Tone |
|---|---|---|---|
| loading | open ring with arc (static under reduced motion) | Loading | muted |
| empty | dotted circle | Empty | muted |
| filtered-empty | magnifier with a dash | No matches | muted |
| error | triangle with a bar | Error | danger |
| permission denied | circle with a diagonal slash | Permission denied | warning |
| unsupported | dashed square | Unsupported in this session | muted |
| interrupted | pause bars in a circle | Interrupted | warning |
| approval needed | shield with a mark | Approval needed | focus |
| success | check in a circle | Done | success |

A **block** plate centres in an empty region (520 px measure). A **band** fills the width of a list or document on the matching tint and never replaces results that still work. Content is eyebrow, title, muted body, an optional monospace detail naming the backend or error code (never secrets or user content), and at most one primary and one secondary action plus an optional ghost. Plates present caller-owned copy and actions only: they never retry, grant, cancel or claim an effect. Success appears only after the backend confirms a real result. Colour is never the only signal.

Use short opacity/background transitions with the standard easing; panels fade in 160 ms with a 4 px rise, opacity-only under reduced motion. Avoid theatrical scaling, spinning gradients or continuous idle animation. Respect OS reduced-motion and text scaling. Provide opaque rendering if transparency harms contrast or is unsupported.

## Accessibility

Use semantic buttons/inputs/lists and accessible names, announce asynchronous status sparingly (loading may use a polite status; errors are not live-announced on every render), restore focus to the invoking control, and maintain visible focus against every surface. Focus is a 2 px `focus` outline with 2 px offset, inset inside lists; it is independent of selection. Rows, captions and controls use minimum, not fixed, heights so 200% text grows rather than clips. In forced-colours mode, selection becomes a `Highlight` outline and rail, tiles become `Canvas` with `CanvasText` borders and glyphs, and buttons, fields, keycaps and bands keep system-colour borders. Target WCAG AA text contrast and 3:1 component/focus contrast. Provide a non-drag workflow path. Test keyboard-only, screen reader, 200% text scaling, high contrast, and reduced motion on the actual Electron build.

Default content actions must not depend solely on hover. Pointer cursor is reserved for conventional links where appropriate; use platform-standard control cursors rather than web-style pointers on every launcher row.

## Assets and provenance

Use the original [Linuxcast icon](assets/linuxcast-icon.svg) as the planning identity. It depicts a command prompt and rising cards; it is not a Raycast-logo variation. The Instrument line icons and state glyphs are original Linuxcast artwork shipped as static host primitives. Lucide may still supply additional application UI icons during implementation, with licence attribution and a coordinator-approved dependency, drawn to the same 16-unit line rules. Decorative SVG diagrams/mockups are documentation artifacts, not application components.

The approved [project icon](assets/linuxcast-project-icon.svg) is used for the repository identity: an original coral penguin with a command-prompt beak and diagonal casting rays. Its [asset record](assets/README.md#project-icon) includes a PNG export, provenance and dark/light previews. The earlier command-card icon remains part of the planning examples.

The [asset index](assets/README.md) distinguishes original mockups from source references. Its examples cover the launcher/actions, chat/workflows, component states, and light/permission surfaces. Later screenshots must be from the implemented application and labelled with the tested session/theme.

## Review gate

Every UI task links this document's relevant sections. Every UI PR uses shared tokens/primitives and includes affected-state screenshots. Review dark/light appearance, keyboard path, empty/loading/error/permission states and text overflow; run visual snapshots and accessibility checks. A screenshot resembling a reference is insufficient if behaviour or accessibility differs from the specification.

Update tokens and this document together; regenerate bindings with `node packages/ui/src/tokens/generate.ts`. The coordinator reviews cross-component visual changes before downstream features adopt them. No feature-specific design language or raw custom React tree from extensions is allowed in v1.
