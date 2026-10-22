# Linuxcast design system

**Normative for every user-facing implementation task.** Version 1, 22 October 2026. Read with [tokens.json](tokens.json), [visual examples](assets/README.md), and [the feature specification](../product/builtins.md).

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

## Tokens

`tokens.json` is the single machine-readable source. Tailwind semantic variables and component CSS must derive from it. Features do not introduce ad-hoc colours, spacing or shadow values.

| Token family | Initial choice |
|---|---|
| UI font | Inter, then system sans-serif; bundle licensed font assets during UI foundation |
| Code/key font | JetBrains Mono, then system monospace |
| Type | 12 caption, 14 body, 16 emphasis, 20 panel title, 28 workspace title |
| Spacing | 4 px base, 8/12/16/20/24/32 px scale |
| Launcher | 720 px default width; responsive to usable monitor area; 56 px query header; 40 px result row; 36 px footer |
| Radius | 16 shell, 12 popover/composer, 8 row/control, 4 keycap |
| Accent | Coral for primary emphasis, never the sole indicator of state |
| Motion | 100 ms state, 160 ms panel; reduced motion removes translation/scale |

Dark surfaces use graphite, light surfaces use warm neutral white; both retain separate background/surface/raised/selection/border roles. Text, muted text, destructive, warning, success and focus roles have independent values. Check actual contrast in implementation; decorative mockups are not accessibility test evidence.

## Shell and navigation

Launcher: query header with optional back button and mode/breadcrumb; grouped results; a scrollable content region; bottom action footer. Default height follows content up to 560 px, never beyond the work area's safe margin. Preserve selection by stable result ID when async results arrive. Do not move the primary action unexpectedly because a slow provider completed.

`Escape` closes the action panel first, then pops a nested view, then dismisses the launcher. `Enter` invokes the selected primary action; `Ctrl+Enter` invokes an explicitly supplied secondary action. `Ctrl+K` opens the action panel; `Tab` moves between interactive controls or the explicit AI affordance in root search, never silently transmits a query. Arrow keys navigate lists/grids while text caret behaviour remains native inside editable fields. Shortcut labels use Linux Ctrl/Alt/Super names, not macOS glyph assumptions.

Global launcher shortcut defaults to `Alt+Space` only if available; onboarding records the user-approved portal/desktop shortcut when reserved. Conflict states offer a recorder and `linuxcast --toggle` fallback. A tray is optional and cannot be the only way to reopen or quit on GNOME.

## Components

### Results and actions

Rows align a 20 px icon, title/subtitle, optional accessories, and shortcut hint. Group captions use muted 12 px type. Selection uses a neutral surface and a clear focus indication; accent is not a full-row flood. Truncate long names visually but expose complete accessible names/tooltips. Checkbox multi-selection is distinct from the keyboard cursor.

The action panel is a 280 px searchable popover with grouped actions, icons, shortcuts and optional submenus. Destructive actions are labelled and visually differentiated. Confirmation is required when specified by the action's effect policy, not for every reversible navigation. The footer shows selected-item context on the left and primary/action-panel hints on the right.

### List, grid, detail and form

List/detail uses a movable divider and a minimum readable detail width. Grids support image/icon cells, captions, category filters and keyboard navigation; image failures retain a stable cell. Detail renders sanitized Markdown, metadata, code and safe links. Forms have persistent labels, inline validation, dirty-state handling, keyboard order and clear submit/cancel actions. Plugin ViewModels render through these same primitives.

### Chat and notes

Chat uses a project/history sidebar and a reading pane. User messages have a subdued surface; assistant prose remains largely unboxed. Tool activity is collapsible with readable status and inspectable arguments. Pending approvals remain visible after navigation and require explicit action. The composer presents attachments and the active provider/model; show the exact data sources before sending contextual material.

Notes use the same typography and action system with a calm editor surface, slash-command menu, task lists and searchable titles/content. Autosave state is visible on error, not a perpetual success animation.

### Workflows

The editor has a left searchable node palette, a central pannable canvas, and a right configuration/debug inspector. Header shows name, save state, run/test and package actions. Use semantic node categories with icons and text; colour alone cannot encode type. Ports show type and compatibility. Invalid edges explain the reason. Keyboard users can add, select, configure, connect and remove nodes through an accessible structured-list alternative to dragging.

The debugger exposes run status, selected node input/output, duration and redacted errors. Secrets are handles/redacted values. Canvas coordinates are presentation data, not execution semantics. See [workflow specification](../architecture/workflows.md).

### Settings and permissions

Settings has searchable categories and stable deep links. AI provider credentials and model selection are separate controls. Secrets are masked and never echoed in diagnostics. Optional integrations show state, capability impact and an enable/disable action.

The keyboard-service onboarding explicitly describes physical keyboard observation/injection, selected devices, separate Hyper/snippet toggles, and the emergency disarm chord. Do not suggest it can universally identify password fields. Permission cards show requesting package, operation, resource scope and once/persistent/deny choices supported by policy. Unavailable capabilities explain remediation without jargon-heavy product text.

## States and motion

Every component implements initial/loading, streaming/refreshing, empty, filtered-empty, error/retry, unavailable/permission, selected/focused, disabled and success states where relevant. Keep layout stable while loading. A partial AI response is labelled interrupted on error. A clipboard copy fallback is not labelled as a paste.

Use short opacity/background transitions. Avoid theatrical scaling, spinning gradients or continuous idle animation. Respect OS reduced-motion and text scaling. Provide opaque rendering if transparency harms contrast or is unsupported.

## Accessibility

Use semantic buttons/inputs/lists and accessible names, announce asynchronous status sparingly, restore focus to the invoking control, and maintain visible focus against every surface. Target WCAG AA text contrast and 3:1 component/focus contrast. Provide a non-drag workflow path. Test keyboard-only, screen reader, 200% text scaling, high contrast, and reduced motion on the actual Electron build.

Default content actions must not depend solely on hover. Pointer cursor is reserved for conventional links where appropriate; use platform-standard control cursors rather than web-style pointers on every launcher row.

## Assets and provenance

Use the original [Linuxcast icon](assets/linuxcast-icon.svg) as the planning identity. It depicts a command prompt and rising cards; it is not a Raycast-logo variation. Lucide may supply the application UI icon vocabulary during implementation, with licence attribution. Decorative SVG diagrams/mockups are documentation artifacts, not application components.

The [asset index](assets/README.md) distinguishes original mockups from source references. Its examples cover the launcher/actions, chat/workflows, component states, and light/permission surfaces. Later screenshots must be from the implemented application and labelled with the tested session/theme.

## Review gate

Every UI task links this document's relevant sections. Every UI PR uses shared tokens/primitives and includes affected-state screenshots. Review dark/light appearance, keyboard path, empty/loading/error/permission states and text overflow; run visual snapshots and accessibility checks. A screenshot resembling a reference is insufficient if behaviour or accessibility differs from the specification.

Update tokens and this document together. The coordinator reviews cross-component visual changes before downstream features adopt them. No feature-specific design language or raw custom React tree from extensions is allowed in v1.
