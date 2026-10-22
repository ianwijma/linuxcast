# Design examples and provenance

These are **original Linuxcast planning mockups**, created 22 October 2026 with the deterministic [render script](../../../scripts/render_design.py). They illustrate intended design; they are not screenshots of an implemented application and are not copied Raycast assets. Linuxcast-authored SVGs are GPL-3.0-only.

![Launcher and actions](launcher-actions.svg)

![Chat and visual workflows](workspaces.svg)

![Components and states](components.svg)

![Light settings and input consent](settings-light.svg)

![Notes and calendar](productivity.svg)

![Original Linuxcast application icon](linuxcast-icon.svg)

## Source observations

The research inspected the [Raycast website](https://www.raycast.com/), launcher, emoji grid and chat imagery in [New in v2](https://manual.raycast.com/new-in-v2), and the [technical design discussion](https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast). The [Alfred workflow page](https://www.alfredapp.com/workflows/) and [editor documentation](https://www.alfredapp.com/help/workflows/getting-started/editor-and-palette/) establish interaction references for workflow editing. The original reference images remain on their owners' sites; none is distributed as a Linuxcast icon or product asset.

Observed traits and original proposed measurements are separated in [DESIGN.md](../DESIGN.md). SVG illustration coordinates are explanatory compositions rather than an alternate token source. Implementation derives actual dimensions from [tokens.json](../tokens.json).

Regenerate originals with `python3 scripts/render_design.py`. Validate with `python3 scripts/validate_plan.py`. Preview them in a browser before accepting changes. During application implementation, add genuine light/dark state screenshots to PRs; do not substitute these illustrations for runtime evidence.
