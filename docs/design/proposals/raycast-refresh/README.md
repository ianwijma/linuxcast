# Linuxcast selected design language — Opus Instrument

Decision date: 1 November 2026. **The user selected Opus “Instrument” for all seven surfaces.** Start with the [selected specification](opus/DESIGN.md), [prototype](opus/review.html), and [token additions](opus/tokens.json). Application rollout is pending; the current [DESIGN.md](../../DESIGN.md), [tokens.json](../../tokens.json), shared host primitives and task acceptance remain authoritative until the coordinated implementation migration.

The user requested a fresh Raycast design exploration and independently authored GPT 6.1 Sol high and Opus 5.5 high designs, with a comparison in a PR so individual choices can be selected before rollout.

The [visual comparison](comparison.html) and [written comparison](COMPARISON.md) preserve the alternatives as review history. [Validation evidence](EVIDENCE.md) records artifact checks; [provenance](PROVENANCE.md) records the actual models and high effort configuration. Sol is retained as an unselected alternative; no hybrid is selected.

## Review order

1. Read the [fresh source observations and limitations](RESEARCH.md).
2. Open the candidates' local HTML review artifacts. Both contain seven views, two themes and six exceptional state categories. Their controls only change local review state.
3. Compare composition, icon treatment, hierarchy, recovery copy and larger workspaces. The [shared brief](BRIEF.md) holds baseline geometry, content and security rules constant.
4. Follow the recorded Opus decision below. Earlier suggestions to combine Sol elements are superseded by the user's selection.
5. Implement Instrument through the canonical design contract and shared host primitives in subsequent bounded task PRs, with real application and desktop evidence.

## Candidates

| Candidate | Review artifact | Design specification | Proposal tokens |
| --- | --- | --- | --- |
| **Selected: Opus 5.5 · high** | [Instrument](opus/review.html) | [Component rules and states](opus/DESIGN.md) | [tokens.json](opus/tokens.json) |
| Unselected: GPT 6.1 Sol · high | [Graphite / precision](sol/review.html) | [Component rules and states](sol/DESIGN.md) | [tokens.json](sol/tokens.json) |

These are original Linuxcast artifacts. Source screenshots remain on Raycast's site. Each model produced one sample under a common brief; this is a comparison of these outputs, not a controlled model benchmark or a claim that one model is generally better.

## Decision record

The user stated: “Looking at the designs, I highly prefer what Opus came up with, so let's choose this one.” This selects Instrument as a whole, including its bottom action filter and notes/chat compositions. The machine-readable record is [selection.json](selection.json). It does not mark application migration or implementation acceptance complete.

| Area | Decision | Detail to preserve or change |
| --- | --- | --- |
| Launcher and actions | Opus Instrument | Hanging alignment, category tiles, neutral selection plus rail, status footer, bottom action filter |
| Files and grids | Opus Instrument | Adjustable list/detail split, grouped metadata, compact category grid, capability-aware Copy/Paste |
| Chat and notes | Opus Instrument | Tool/context/approval structure, task controls, slash menu, persistent save/recovery feedback |
| Workflows | Opus Instrument | Category palette, typed canvas edges, canvas/list switch, configure/debug inspector |
| Settings and permission | Opus Instrument | Capability table, verified request scope, labelled untrusted extension reason |
| Colour, typography and motion | Opus Instrument | Preserve canonical base values; adopt scoped Instrument roles/metrics through the shared migration |

## Adoption boundaries

This bounded design-review task owns only `docs/design/proposals/raycast-refresh/`. D1-01 (tokens/primitives) and D1-02 (declarative renderer) remain in progress in the registry; dependent feature designs do not imply those implementations or their native acceptance are complete. No task, manifest, migration, IPC contract or application source is changed here.

Relevant normative sections: [evidence and intent](../../DESIGN.md#evidence-and-intent), [tokens](../../DESIGN.md#tokens), [shell and navigation](../../DESIGN.md#shell-and-navigation), [components](../../DESIGN.md#components), [states and motion](../../DESIGN.md#states-and-motion), [accessibility](../../DESIGN.md#accessibility), and [review gate](../../DESIGN.md#review-gate). Read the [security contract](../../../architecture/security.md) before implementation of permission, provider, credential or input surfaces.

Before rollout, the coordinator migrates Instrument's selected rules into DESIGN.md and canonical tokens together, binds added roles through `packages/ui/src/tokens/`, and updates shared primitives/renderer before downstream workspaces. Native extension views continue to use host primitives. Confirm actual opaque dark/light, keyboard, focus restoration, contrast, text scaling, reduced motion, forced colours and assistive-technology behaviour in Electron. Confirm real supported desktop capability success, denial, unavailable and recovery states when touching their implementation. The bottom filter and other selected interactions still receive normal usability and accessibility validation; this is not an outstanding choice between candidates.

The existing [dark shell](https://github.com/ianwijma/linuxcast/blob/cd7bf0e/apps/desktop/evidence/shell-dark.png) and [light shell](https://github.com/ianwijma/linuxcast/blob/cd7bf0e/apps/desktop/evidence/shell-light.png) are **prior application evidence** at the source baseline, not newly captured before/after application results. Immutable GitHub links keep this documentation package valid in the planning gate's documentation-only fixture. New screenshots in this proposal are explicitly review-prototype captures. No native behaviour or performance result is claimed by this PR.
