# Sol candidate — Graphite / precision

Author: GPT 6.1 Sol, high reasoning effort, in the coordinating T3 Code session. Date: 1 November 2026. One design sample, not a model-quality benchmark. Status: **unselected alternative, retained as comparison history**. The user selected [Opus Instrument](../opus/DESIGN.md) in full.

## Direction

Treat Linuxcast as a precise desktop instrument. Use a quiet graphite shell, clear alignment, thin structural dividers, and small outline icons on neutral tiles. Coral marks an explicit primary action or the Linuxcast identity. Titles do the work; avoid coloured full-row selections and decorative workspace cards.

This interprets the [fresh Raycast research](../RESEARCH.md) through the existing [design contract](../../../DESIGN.md). Preserve its Inter/JetBrains Mono typography, semantic palette, density, dimensions and shortcut semantics. The distinction is composition: compact command search; open reading space for chat and notes; more explicit grouping and a structured alternative beside workflow configuration. The HTML is a review artifact with synthetic content and local state only.

## Component rules

| Surface | Specification |
| --- | --- |
| Launcher | 720px width; 56px query header; 40px rows with 20px icon; 36px footer; 16px shell radius. Query, group caption, result title, subtitle/accessory and footer occupy predictable columns. Root search has an explicit Quick AI button. |
| Selection / focus | Neutral `selection` fill; titles retain normal text colour. A separate 2px focus outline uses `focus`, offset 2px. Selection never implies keyboard focus. |
| Actions | 280px grouped overlay anchored above the footer, with searchable actions, primary/secondary shortcuts, and labelled destructive actions. Escape closes it before dismissing another view. Restrict its height to available space and scroll within it. |
| Files | Shared result rows on the left, fine divider, readable document preview and labelled metadata on the right. At narrow widths the preview follows the list. |
| Grid | Consistent equal cells, visible captions, neutral selection, category/search controls. Emoji are actual content, not a substitute icon vocabulary. Unavailable image assets preserve cell dimensions. |
| Chat | Quiet history sidebar; unboxed assistant prose; subdued user message; tool-state strip separated from pending approval; rounded composer with provider/model identity and explicit context preview. A global configuration label never implies a per-chat provider choice. |
| Notes | Same sidebar/title/action system with an open editor. No perpetual success animation; failed autosave offers retry and a local-copy action. |
| Workflows | Searchable palette, central canvas, right inspector. Category name and icon accompany ports; visual edges do not define execution. Structured node list provides a non-drag route. Run is a review-only simulation and never claims execution. |
| Settings / permission | Searchable categories, labelled fields, masked credential placeholder, one provider/model, disabled/stopped keyboard service. Permission card identifies package, operation, resource and once/deny choices; no mock grant persists. |

## Tokens and themes

[tokens.json](tokens.json) is a proposal copy of the complete version-1 canonical token set. There are **no changed base values or additional semantic colour roles**. Derived subtle dividers use the existing border role at reduced decorative opacity; control boundaries and focus retain full semantic values. Inter uses a system fallback when the local artifact has no bundled font. The app rollout must use the existing licensed bundled fonts.

Dark uses graphite surface/raised/selection; light uses neutral white with the same hierarchy. All surfaces are opaque. Review controls sit outside the app shell. Motion uses 100ms state transitions and 160ms panels; reduced motion removes animation. Forced colours use system colours and retain selected/focus outlines. No blur, gradient, external image, network or remote script is required.

## Keyboard and accessibility

Use native inputs/buttons, persistent field labels, visible focus, and full accessible names. Root list arrow navigation preserves the input caret semantics for editable content; prototype Up/Down result navigation runs only in the search input or result controls. Enter selects a review item. Ctrl+K toggles actions; Escape closes actions first; Tab reaches controls without transmitting content. Chat Ctrl+Enter displays a review-only notice. Destructive, denied and unavailable states include text as well as colour.

Production uses stable result IDs and the existing host renderer's focus restoration, cancellation and async selection rules. The prototype demonstrates composition and local control behaviour; it does not replace the production ViewModel renderer, input contracts, permission broker or assistive-technology checks.

## State matrix

The state selector demonstrates each state on every view with view-specific copy. Default shows initial content plus selection/focus affordances. Search with no match shows filtered-empty locally. Loading retains the shell and shows a status. Success in the prototype always says the local preview changed; it never claims a file, paste, network request, permission or workflow completed.

| Surface | Loading / refreshing | Empty / filtered-empty | Error / retry | Denied / unavailable | Interrupted | Disabled / success |
| --- | --- | --- | --- | --- | --- | --- |
| Launcher/actions | Searching commands / action filter | No commands / no matching actions | Registry unavailable, Retry preview | Explain restricted command, Open settings preview | Search cancelled, edit query | Restricted action disabled; selected review item notice |
| Files | Index search status | No indexed files / no matching files | Index unavailable, Retry preview | Grant selected folder / unsupported preview, Copy path preview | Search cancelled; keep query | Open disabled when no backend; preview selection notice |
| Grid | Stable cell placeholders | No saved emoji / no matches | Dataset unavailable, Retry preview | Insertion denied / unavailable, Copy instead preview | Search cancelled | Paste disabled; copy simulation labelled |
| Chat | Waiting / streaming status | Start conversation / no history matches | Keep partial response, Retry preview | Context denied / unsupported model feature, Review context | Partial response labelled interrupted | Send disabled while busy; local preview notice |
| Notes | Loading draft | New note / no matching titles | Autosave failed, Retry or Copy draft preview | Folder access denied / unavailable | Draft retained; no autosave claim | Save disabled while loading; local preview notice |
| Workflows | Loading graph / running preview | Add first node / no palette matches | Node error with inspector remediation | Effect denied / backend unsupported | Run interrupted; review before retry | Run disabled for unavailable effects; local node selection notice |
| Settings | Reading capabilities | No integrations / no category matches | Probe failed, Retry preview | Explicit denied / unsupported capability with remediation | Probe interrupted | Input service disabled/stopped; no real enable control |

All seven views show the same six exceptional state categories: loading, empty, error, permission-denied, unsupported, interrupted. State controls are a documentation harness, not proposed product UI. A backend-specific implementation must derive states from the capability contract rather than this selector.

## Host mapping and adoption

Map query/fields to `TextField`, actions to `Button`/`IconButton`, hints to `Keycap`/`ShortcutHint`, status to shared loading/empty/error primitives, and files/grid/form/action panel to `ViewRenderer`. Extend shared primitives through D1 coordinator review where needed. Notes, workflow, settings and chat workspaces consume the same tokens and controls. Native extension packages supply declarative data, never custom rendered code.

After the user selects elements, record the decision, update canonical DESIGN.md and tokens together if needed, regenerate shared CSS, and implement in bounded UI task PRs. This candidate has no token migration; application composition and icon integration still require work. Existing D1-01/D1-02 and downstream native/accessibility gates remain in progress.

## Validation limits

Coordinator evidence records local Chromium screenshots and checks. Validate contrast, keyboard order, long names, 200% text, forced colours and reduced motion in the final shared implementation, then test actual Electron with assistive technology on supported Debian desktop sessions. Design screenshots cannot establish GNOME/KDE Wayland/X11 integration, real clipboard insertion, keyring security or workflow execution.
