# Sol and Opus: which elements to choose

**Recommendation:** start with Opus's launcher, shared controls, state plates and workflow structure. Consider Sol's quieter notes composition and its simpler reading hierarchy for chat. Keep the action-filter placement open for a keyboard trial: Opus's bottom filter is distinctive, but Sol's top filter follows the current layout more closely.

This is a judgment about these two proposals, not about the models in general. Both were configured at high effort; see [provenance](PROVENANCE.md). Neither changes the running application. Open the [interactive visual comparison](comparison.html) to browse matched views/themes and record a choice for each surface. Choices exist only in that page session and can be copied from its text summary.

## What is held constant

Both preserve the canonical theme colours, font families, type scale, spacing scale, 720px launcher width, 56px header, 40px rows, 36px footer, 280px action panel, radii and motion timing. Both are opaque, use original inline glyphs, Linux shortcut names, one global AI identity and explicit simulated actions. These common constraints keep the comparison useful but mean this is not an unconstrained redesign competition.

Screenshots were captured with the same Chromium build and 1440px viewport. Launcher screenshots use the same 720px app width. Workspaces retain each author's composition: Sol is 1080px wide and content-sized vertically; Opus is 1180px wide and generally 680px high. Images fit the comparison width without cropping and retain their original pixel dimensions in the linked files. System fallback fonts were used. No font or geometry difference is presented as a measured usability advantage.

## Concrete differences

| Area | Sol — Graphite / precision | Opus — Instrument | Suggested choice / tradeoff |
| --- | --- | --- | --- |
| Launcher hierarchy | One quiet result group; monochrome outline icons on neutral tiles; small inline sources | Typed groups with counts; hanging title/caption alignment; coloured object glyphs; denser metadata | Opus for scanning a mixed registry; Sol if minimal visual weight matters most. Test long names with either. |
| Selection and focus | Neutral fill; separate focus outline | Neutral fill plus a coral rail; separate blue focus | Opus adds a clear non-text selection landmark. The rail adds emphasis; prefer Sol if it feels too busy. |
| Actions | Top search field, simple action list, explicit Close; footer shows view context | Bottom filter next to the invoking hint; richer grouped actions; selected-object footer context | Keep Opus's context footer and action grouping. Trial both filter positions before changing muscle memory. |
| Files | Calm document preview, open metadata and simple file list | Resizable divider, stronger metadata structure, preview-error band that preserves last-known metadata | Opus's divider and partial-failure treatment are more complete; Sol's document composition is quieter. |
| Emoji | Larger breathing room and consistently visible captions | Denser category sections, separate recent group, keyboard grid navigation and explicit Copy/Paste capability states | Opus for frequent use; Sol for visual clarity. Real insertion availability still comes from the backend. |
| Chat | Prominent conversation heading, readable open prose, simple attachment/tool line | Tool disclosures, source provenance, exact context-to-send line, persistent approval treatment | Keep Opus's tool/context/approval structure. Sol's simpler reading composition can reduce the amount of secondary chrome. |
| Notes | Open draft editor and broad writing area | Native task controls, slash menu, save/recovery state and more detailed list navigation | Sol's calm document framing with Opus's save/recovery and task controls is a coherent mix. |
| Workflow editor | Simple vertical chain; structured list and inspector visible together | Palette categories, free-positioned typed edges, canvas/list switch, richer inspector/debug and invalid-edge treatment | Opus for the full editor. Sol's always-visible structured route may improve discoverability; validate with keyboard users. |
| Settings and permission | Simple global AI fields and an explicit selected-file request | Capability table, request attribution, untrusted extension reason, precise once/persistent/deny structure | Opus's scope and capability hierarchy. Avoid exposing implementation terms in final product copy unless they help a decision. |
| Recovery states | Large centred block; stable shell; direct remediation | Shape-coded block or inline band; working results remain visible during partial failure | Opus's inline bands for partial failure; Sol's centred empty surfaces where nothing can be shown. |
| Shared tokens | Exact canonical copy; no additional theme roles | Canonical values preserved, plus 13 theme roles and explicit object-tile colours/metrics | Sol has less token adoption work. Opus specifies control-boundary contrast and state surfaces more precisely. Neither is implemented by this PR. |

## Dark and light previews

| Candidate | Dark launcher/actions | Light launcher/actions | Chat | Workflow |
| --- | --- | --- | --- | --- |
| Sol | [Dark](sol/screenshots/launcher-actions-dark.png) | [Light](sol/screenshots/launcher-actions-light.png) | [Light](sol/screenshots/chat-light.png) | [Dark](sol/screenshots/workflows-dark.png) |
| Opus | [Dark](opus/screenshots/launcher-actions-dark.png) | [Light](opus/screenshots/launcher-actions-light.png) | [Light](opus/screenshots/chat-light.png) | [Dark](opus/screenshots/workflows-dark.png) |

The [Sol prototype](sol/review.html) and [Opus prototype](opus/review.html) let you inspect interactions and all recovery states. Review the full [Sol specification](sol/DESIGN.md) and [Opus specification](opus/DESIGN.md) before adopting a detail that affects the shared renderer.

## Limits that affect the choice

- A local prototype notice does not implement a file action, permission grant, clipboard operation, provider request, autosave or workflow run. All apparent success content is synthetic.
- Sol uses a smaller set of interactive demonstrations; Opus implements more local review interactions. That is a difference in these artifacts, not evidence of production quality or reliability.
- Both use fixed normal-size geometry in the mock. Full 200% text growth, final bundled-font layout, actual Electron/Orca and supported desktop sessions remain implementation gates.
- The current base border role is decorative on some surfaces. Sol retains it; Opus adds a stronger `controlBorder`. Adopt a measured control-boundary treatment through shared primitives before calling a final UI accessible.
- A mixed choice must still result in one shared row, focus, action, keycap and state language. Do not give extensions, workflows or individual features separate visual systems.

No decision is recorded yet. Use the [decision table](README.md#decision-record) as the durable record once the user has selected elements. Merging this proposal PR only stores design artifacts; subsequent implementation requires the chosen direction and the normal task acceptance evidence.
