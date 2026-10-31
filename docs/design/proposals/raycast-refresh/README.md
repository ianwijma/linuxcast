# Linuxcast design-language comparison

Proposal date: 1 November 2026. **Nothing here is adopted by the application.** The current [DESIGN.md](../../DESIGN.md), [tokens.json](../../tokens.json), shared host primitives and task acceptance remain authoritative.

The user requested a fresh Raycast design exploration and independently authored GPT 6.1 Sol high and Opus 5.5 high designs, with a comparison in a PR so individual choices can be selected before rollout.

Start with the [visual comparison](comparison.html), [written comparison](COMPARISON.md), and [validation evidence](EVIDENCE.md). [Provenance](PROVENANCE.md) records the actual models and the orchestrator-confirmed high effort configuration for each.

## Review order

1. Read the [fresh source observations and limitations](RESEARCH.md).
2. Open the candidates' local HTML review artifacts. Both contain seven views, two themes and six exceptional state categories. Their controls only change local review state.
3. Compare composition, icon treatment, hierarchy, recovery copy and larger workspaces. The [shared brief](BRIEF.md) holds baseline geometry, content and security rules constant.
4. Record choices by surface. The decision can combine specific elements; it need not select one entire candidate.
5. Implement the selected direction through the canonical design contract and shared host primitives in subsequent bounded task PRs, with real application and desktop evidence.

## Candidates

| Candidate | Review artifact | Design specification | Proposal tokens |
| --- | --- | --- | --- |
| GPT 6.1 Sol · high | [Graphite / precision](sol/review.html) | [Component rules and states](sol/DESIGN.md) | [tokens.json](sol/tokens.json) |
| Opus 5.5 · high | [Instrument](opus/review.html) | [Component rules and states](opus/DESIGN.md) | [tokens.json](opus/tokens.json) |

These are original Linuxcast artifacts. Source screenshots remain on Raycast's site. Each model produced one sample under a common brief; this is a comparison of these outputs, not a controlled model benchmark or a claim that one model is generally better.

## Decision record

No selection has been made. This PR preserves both candidates for review.

| Area | Decision | Detail to preserve or change |
| --- | --- | --- |
| Launcher and actions | Pending user choice | Query, selection, metadata, keycaps, action positioning |
| Files and grids | Pending user choice | List/detail hierarchy, icon treatments, cells |
| Chat and notes | Pending user choice | Sidebar, reading measure, composer, draft recovery |
| Workflows | Pending user choice | Palette, canvas, inspector, structured keyboard route |
| Settings and permission | Pending user choice | Field boundaries, capability state, scope presentation |
| Colour, typography and motion | Pending user choice | Preserve baseline or explicitly accept proposed extensions |

## Adoption boundaries

This bounded design-review task owns only `docs/design/proposals/raycast-refresh/`. D1-01 (tokens/primitives) and D1-02 (declarative renderer) remain in progress in the registry; dependent feature designs do not imply those implementations or their native acceptance are complete. No task, manifest, migration, IPC contract or application source is changed here.

Relevant normative sections: [evidence and intent](../../DESIGN.md#evidence-and-intent), [tokens](../../DESIGN.md#tokens), [shell and navigation](../../DESIGN.md#shell-and-navigation), [components](../../DESIGN.md#components), [states and motion](../../DESIGN.md#states-and-motion), [accessibility](../../DESIGN.md#accessibility), and [review gate](../../DESIGN.md#review-gate). Read the [security contract](../../../architecture/security.md) before implementation of permission, provider, credential or input surfaces.

Before rollout, the coordinator records the selected elements, updates DESIGN.md and canonical tokens together where needed, binds any added roles through `packages/ui/src/tokens/`, and updates shared primitives/renderer before downstream workspaces. Native extension views continue to use host primitives. Confirm actual opaque dark/light, keyboard, focus restoration, contrast, text scaling, reduced motion, forced colours and assistive-technology behaviour in Electron. Confirm real supported desktop capability success, denial, unavailable and recovery states when touching their implementation.

The existing [dark shell](../../../../apps/desktop/evidence/shell-dark.png) and [light shell](../../../../apps/desktop/evidence/shell-light.png) are **prior application evidence**, not newly captured before/after application results. New screenshots in this proposal are explicitly review-prototype captures. No native behaviour or performance result is claimed by this PR.
