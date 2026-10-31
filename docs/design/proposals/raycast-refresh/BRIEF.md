# Shared comparison brief

Create an original Linuxcast design-language candidate informed by [the fresh research](RESEARCH.md). Both model candidates receive this same scope. This is a proposal PR to choose from before application rollout. Do not edit application code, canonical tokens, task status, dependency manifests, or another candidate's directory.

Read `AGENTS.md`, `docs/PLAN.md`, `docs/design/DESIGN.md`, `docs/design/tokens.json`, `docs/architecture/security.md`, and D1-01/D1-02 task cards. Existing baseline: Inter/JetBrains Mono, 720px launcher, 56px header, 40px result rows, 36px footer, 16/12/8/4 radii, 100/160ms motion. Preserve this common baseline for a fair comparison. Make the direction distinct through hierarchy, composition, icon treatment and restrained surface details. Shared primitives remain the adoption path.

## Deliverables in your owned candidate directory

- `DESIGN.md`: direction, source interpretation, exact component rules, dark/light treatment, keyboard behaviour, accessibility, state matrix, mapping to host primitives, rollout implications and remaining validation.
- `tokens.json`: complete proposal token set retaining current baseline keys/values; any additional semantic roles must be described and scoped to the proposal. No live token changes.
- `review.html`: polished self-contained HTML/CSS/JS design-review prototype. No server, CDN, remote fonts, network calls, external application effects or dependencies. Use inline SVG for original small icons. No Raycast marks or macOS traffic-light controls. Use local system fallback font stacks with Inter first.
- Include seven selectable views: launcher with action panel; file list/detail; emoji grid; AI chat; notes; workflow editor with palette/canvas/inspector plus non-drag structured list; settings with capability and permission card.
- Include dark/light toggle and selectable loading, empty, error, permission-denied, unsupported and interrupted states, with meaningful view-specific copy. Label synthetic content and all simulated actions. Controls in the review prototype may change local view/selection only.
- Use the same example content: “Search files”, “Clipboard history”, “Quicklinks”, `Launch checklist.md`, `~/Documents/Linuxcast/`, workflow “Morning brief”, note “Launch checklist”, chat “Summarise the launch checklist”. AI identity must say “Configured provider / configured model”, not an independent per-chat selector.
- Allow 720px native launcher geometry on wide review canvases and responsive review at 390px. Prototype controls must have accessible names, visible focus, working buttons and overflow handling. Reduced motion and forced colours must be considered. Do not label the entire product accessible based on the mock.
- Document every surface's initial/loading/empty/filtered-empty/error/retry/unavailable/permission/selected/focused/disabled/success or not-applicable state. Clipboard fallback is “Copy”, not “Paste”. Privileged input remains disabled and stopped.

Each candidate is one model sample, not a benchmark of model quality. Record the actual model and effort used, and any launch failures. The coordinator renders screenshots, validates the package, writes a grounded comparison and creates one PR. No child PRs, commits, pushes, delegates, monitoring or task-status changes.
