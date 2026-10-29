# U1-01 — explicit Markdown export application increment

29 October 2026. Reviewed and tested follow-on based on the integrated Notes
create/edit prerequisite: [PR57](https://github.com/ianwijma/linuxcast/pull/57),
develop fd39fde16081a6b3c40a5e57ceef66a13897a9c0. Export branch
`codex/notes-markdown-export` is prepared for its separate PR; integration is
recorded in the coordinator checkpoint and task registry after GitHub confirms it.
The complete U1-01 task and every acceptance criterion remain pending.

## Concrete behavior

In the registered Notes workspace, Export Markdown stores the latest local draft
without changing its separate saved version. Main reads the exact stored id and
revision, derives bounded Markdown, opens an explicitly unencrypted native Save
dialog, and rechecks the current owner and stored content before publication.
Renderer accepts no file path, caller Markdown or generic filesystem authority.
Editing, Save, selection and normal Close/Quit cannot race a pending export.

Publication uses held non-symlink directory descriptors, a checked private 0700
staging directory and a 0600 file, sync and exclusive atomic destination creation.
Existing names are refused rather than overwritten. Cancellation and source
changes are checked before publication. A publication deadline aborts the work;
the actual operation slot remains occupied until settlement. Unknown outcomes
say to check the selected file and are never automatically replayed.

Matching MIT Tiptap Markdown 3.32.0 and marked 17.0.6 are pinned in the lock and
development inventory. A bounded adapter handles literal block markers, code
fences and whitespace. Multiline inline code exports as plain text to preserve
line breaks; UI and file notice disclose that styling loss, font/color/layout/
undo loss, LF normalization and plaintext. The source note is unchanged. This is
an explicit plaintext export, not the encrypted full backup.

## Validation and review

Host: Pop!_OS 22.04 Linux amd64, Node 24.22.1, Bun 1.4.4, Electron 45.0.0,
SQLite 3.53.4. An owned private Xvfb X11 display/profile and public synthetic data
were used. This does **not** establish Debian 13 GNOME/KDE Wayland/X11 or native AT
acceptance. No user display, profile, documents or devices were used.

- `bun run test:unit -- U1-01`: 202 PASS, including 12 serializer fixtures,
  7 export-controller cases and existing Notes/launcher/search regressions.
- `bun run test:contracts -- U1-01`: 13 PASS, including rejection of renderer
  file/content authority and distinct cancellation/publication receipts.
- `bun run test:security -- U1-01`: 51 PASS. Includes sender/frame checks, exact
  receipt checks, owner/content/revision changes, pending close/write gates,
  cancellation/deadline and retained actual publication slot, known existing-name
  refusal, unknown outcomes, no replay, redacted errors and seven actual private
  filesystem tests. The latter exercise ancestor replacement, stage substitution,
  exclusive no-overwrite, symlink denial, permissions, cancellation and cleanup.
- `bun run test:ui -- U1-01`: 19 PASS (15.0 s), including existing rich editor/
  recovery/keyboard/200% cases plus dark/light export, chooser cancellation,
  pending controls and close recovery, unknown/check-file feedback and axe.
- `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a bun run test:integration -- U1-01`:
  8 PASS, comprising seven actual SQLite owner cases and one production Electron
  application scenario (7.37 s). The native chooser **choice is instrumented** to
  a private temporary path; actual dialog interaction is not acceptance evidence.
  Serializer, renderer, main IPC, file writer, SQLite and process recovery are
  real. The test opens registered Notes, edits a checked rich task and Unicode/
  literal script-looking text, exports the latest draft into a real 0600 file,
  checks unchanged saved content and existing destination bytes, cancels another
  chooser, searches actual current draft title/body, flushes native Close/Quit,
  restarts, forces only private owner/application processes to stop after draft
  acknowledgement and recovers exact saved/draft/revision. No remote request or
  note content in command-usage export is observed.

The first application attempt needed the pinned SQLite addon built locally. The
first browser export assertion selected two status roles, and an application
search assertion still used the pre-export title. These harness/setup issues were
corrected; the final results above cover the assembled flow. A final type check
caught an optional-property annotation in the compatibility copy; it was corrected
without changing export behavior and the 12 serializer cases reran successfully.

Independent source/security review closed staging-directory substitution, main
Close admission, whitespace suffix backtracking and multiline code text-loss
findings. Independent UI/source/capture review closed unknown-error classification
and disabled-control findings. No remaining actionable bounded review finding.
Full typecheck, scoped lint, plan validation and diff checks are recorded in the
coordinator checkpoint after completion.

## Captures

All content is public synthetic material. The 14 baseline component and five
baseline application captures were regenerated because export adds visible UI.
Seven affected export captures were independently inspected:

- `packages/notes/evidence/dark-notes-export.png`
- `packages/notes/evidence/light-notes-export.png`
- `packages/notes/evidence/dark-notes-export-pending.png`
- `packages/notes/evidence/light-notes-export-unknown.png`
- `apps/desktop/evidence/notes-export-application-dark.png`
- `apps/desktop/evidence/notes-export-application-light.png`
- `apps/desktop/evidence/notes-export-application-existing-name.png`

Applicable design sections: Shell/navigation, Results/actions, List/detail/form,
Chat and notes, States/motion and Accessibility; existing host primitives/tokens.

## Explicit unfinished acceptance

The serializer fixtures check selected text/task cases through the matching
official reader; this is **not** complete Markdown import/roundtrip acceptance.
Native chooser interaction, supported Debian desktop/session matrix, native AT,
high contrast, performance and packaged/release checks remain required. Tiptap's
Markdown API is beta; full import/fidelity acceptance remains an open gate.

Pin/archive/trash/restore, revision restore, attachments, root Notes provider and
Quick note remain required. Full D1-02/native AT is unfinished; no prerequisite or
whole-task completion is inferred from reused primitives. Ordinary private SQLite
is not encrypted at rest; unacknowledged local edits may be lost on forced crash.
The full agreed local 1.0 scope and security/release gates are unchanged.
