# Coordinator checkpoint — 31 October 2026

Full local 1.0 remains active and unfinished. Current coordinator implementation:
F3-01, worktree `/home/ian/.t3/worktrees/linuxcast/f3-01-permissions-ui`, branch
`codex/f3-01-permissions-ui`, based on fresh develop f461a87 (includes approved
penguin icon PR79; no dependency on draft PR80). F0-01/F2-01 dependencies accepted.

F1-02 zoom fix remains draft PR80 https://github.com/ianwijma/linuxcast/pull/80,
parent worktree `/home/ian/.t3/worktrees/linuxcast/t3-d1b99cbd`, branch
`codex/f1-02-shell-accessibility`, signed head757ce20; current-head planning CI
41191111144 passed. Not merged: native/UI acceptance remains pending. Its tests
15unit/54security/2actualPop!_OS/privateXvfb integration and7captures pass.

Native follow-up completed signed fc0fdb2 on `codex/f1-02-native-at-evidence`,
worktree `/home/ian/.t3/worktrees/linuxcast/t3-86a755f4`. Exact final-source audit
found no blocking defect;14offline observer tests and15unit/54security/typecheck/
lint/hash/plan checks pass. Nine new files are reviewable but NOT integrated or
pushed. Native actual runs ZERO: v4 Debian/Orca VM lab stopped. Coordinator can
reserve/resume existing lab, verify fresh baseline, then complete reviewed product
controller/Orca-parser integration and one bounded native run. No permission
question or physical/input service authority follows from a stopped lab. See its
apps/desktop/evidence/shell-native-at/README.md and tests/at/README.md. Two stale
parent main README descriptions await correction. Do not relabel offline proof.

F3-01 implementation now adds owner-bounded cross-principal inventory and whole-
record compare-delete without migration; shared registry cancels every matching
broker before storage and holds new admission through late grant-write cleanup.
All production workflow brokers share it. UI removes only main-owned opaque
snapshot selections with confirmation and explicit unknown/stale remediation.
Existing workflow once/persistent/deny approval stays in its debugger. Reusable
D1-03 settings/consent surfaces are not silently transferred; this foundational
window is under F3's packages/permissions ownership with coordinator main/preload/
renderer/build/storage/contracts/wiring. Package/lock add only existing React/UI
workspace dependencies; no new third-party version.

Preliminary PASS:4controller,2contract,68security (includes actual owner storage
and persistence), full pinned typecheck/lint and72-asset production build. New
window actual Electron E2E, independent source/security/design review, affected
screenshots and publication remain. Next: implement production permission UI
scenario, review races/authority/snapshot selection, close findings and publish
focused PR. Keep F3-01 AC02/UI pending until scoped evidence exists; no task done.

Registry remains8done/20inprogress/69planned,56passed/325pending/8justifiedN/A.
No privileged service, physical keyboard, host desktop setting, user clipboard
or private content touched. Full Debian GNOME/KDE Wayland/X11/AT, physical recovery,
all feature families, performance, packaging and R1 release gates remain required.
