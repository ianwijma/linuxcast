# U1-01 explicit Markdown export increment

This is the separately reviewed follow-on to Notes create/edit, merged in PR57
(https://github.com/ianwijma/linuxcast/pull/57), develop
fd39fde16081a6b3c40a5e57ceef66a13897a9c0. Worktree
.worktrees/linuxcast-text-preview-native, branch codex/notes-markdown-export,
now based on that integrated prerequisite. The original temporary staged seed
was reconciled against the byte-identical merged tree without changing follow-on
file bytes. F2-01 storage is accepted; full D1/nativeAT remains pending under the
approved smaller unfinished-increment sequence. All four U1 criteria stay pending.

Bounded application flow: selected Notes draft -> explicit Export Markdown ->
flush latest local draft without Save -> native Save dialog labelled unencrypted
Markdown -> exact current owner id/revision/content revalidation -> bounded atomic
exclusive plaintext publication -> exported/cancelled/known-error/unknown feedback.
The owner derives all exported content. Named API accepts only id+revision, never
renderer Markdown/path/HTML. Matching MIT Tiptap Markdown3.32.0 + marked17.0.6 pinned/locked; its documented beta serialization behavior must pass the bounded content/task tests. No new services, native helper, model,
network, source deletion or infrastructure/research/proof assignment.

All current closed version1 document nodes/marks serialize: title, paragraphs,
headings1/2/3, bold/italic/strike/code, lists/tasks (checked state), quotes, hard
breaks, codeblocks and dividers. Escape literal Markdown/HTML and preserve literal
Unicode/text; escaping and code fences are delegated to the matching maintained serializer. Do not silently discard
unsupported nodes/attrs. Declare editor font/color/layout/undo metadata not exported
in the UI and file notice; multiline inline code becomes plain text to preserve LF. This export is not the encrypted full backup.
Markdown import/roundtrip acceptance remains required and unclaimed in this
increment; no text/task loss may be accepted merely to pass a small test. Official API: https://tiptap.dev/docs/editor/markdown/api/markdown-manager ; CommonMark https://spec.commonmark.org/0.31.2/ ; GFM task syntax https://github.github.com/gfm/#task-list-items-extension- .

The native-dialog destination is opened component by component with directory
O_NOFOLLOW handles, then all staging/publish/cleanup are descriptor-relative.
Private0700 staging,0600 file, file+parent fsync, atomic hard-link exclusive publish;
existing names/symlinks are not overwritten. No late publish after cancellation,
keep the actual operation slot until settlement, never automatically replay an
unknown outcome. No arbitrary path or generic filesystem API reaches renderer.
While exporting, freeze note edits/navigation and reject close until export is
finished/cancelled; native owner destruction invalidates pending work. The native
chooser can wait for the user; publication is bounded; owner reads retain the existing storage transport deadlines. Native
Close/Quit do not silently discard a pending export.

Follow card docs/implementation/tasks/U1-01.md and normative data/builtins/security/
testing-release/DESIGN Chat-and-notes, Forms, States, Accessibility/tokens. Reuse
shared Button/theme. Dark/light/cancel/error/pending/unknown captures and keyboard/
axe, exact serializer text/tasks/escaping, real selected-file write/no-overwrite/
symlink/cancellation and production Electron SQLite/export/reopen privacy evidence
are required. Distinguish mocked chooser from actual filesystem/Electron evidence.
Full U1-01/Markdown roundtrip, other Notes actions and Debian13 GNOME/KDE Wayland/
X11/nativeAT/performance/package/release acceptance remain pending.
