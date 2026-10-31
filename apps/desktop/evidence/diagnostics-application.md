# F2-02 production diagnostics controls

31 October 2026; coordinator worktree `f2-02-diagnostic-controls`, branch
`codex/f2-02-diagnostic-controls`, based on develop `f461a87`. Dependencies:
F2-01 accepted. [Task card](../../../docs/implementation/tasks/F2-02.md).
The full task, credential/provider setup, native desktop/backend and release gates
remain unfinished. No acceptance status is advanced by this bounded increment.

## Behaviour and authority

The existing private metadata diagnostics service previously had no production
lifecycle or host management actions. Local data now has separate Application logs
and Tool diagnostics categories with export/reset, retention explanations and
category-specific native confirmations. Cancel preserves real files. Main opens a
private root under XDG_STATE_HOME (standard home fallback), records only fixed
main/started metadata, prunes with existing retention policy (including a serialized idle check each minute) and drains operations
before Quit. No tool operation is simulated to fill an empty category.

Exports go from the main-owned service directly to the existing native-dialog
publisher. The renderer receives only a fixed saved/cleared/cancelled outcome or
fixed error, never records, file paths or a logging/secret/repository API. Existing
named IPC gains two exact category enum values, with sender/main-frame/payload
validation unchanged. No migration, new channel, dependency or privileged/input
capability is added. No raw exception, prompt, key, user content or credential is
accepted as diagnostic metadata. Exports are labelled unencrypted JSON, and logical
deletion does not erase old backups or guarantee forensic removal.

Corrupt owned records cannot be exported. Fixed remediation offers an explicit
reset of that category; reset preserves the other category and unrelated files.
Exports exceeding the existing1MiB publisher bound fail completely without
truncation or deletion. New application-start metadata can appear after reset.

## Validation

Pinned Node24.22.1/Bun1.4.4, Electron45.0.0 and Rust1.95.0 on Pop!_OS22.04 amd64,
private authenticated Xvfb1920×1080. Fresh frozen install and SQLite native rebuild
pass. Chromium sandbox/context isolation are enabled, renderer Node/require absent.
No supported Debian GNOME/KDE Wayland/X11, native AT or actual OS preference proof.

- `bun run test:security -- F2-02`:68/68 pass, including existing secrets/storage
  checks and10new real-files/lifecycle/main authority/confirmation regressions.
- `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a -s '-screen 0 1920x1080x24' node scripts/test-runner/run.ts integration F2-02`:
  actual production Electron flow1/1 passes, final5.93s (scenario5.473s).
- `bun run typecheck`; `bun run lint`:pass after correcting a test-only mock tuple
  type; final complete checks pass on the timer/FIFO follow-up.
- Planning validation, registry regeneration and21Python planning regressions:
  all pass. Independent initial review is recorded below.

The actual production scenario seeds one public tool diagnostic using the real
service, then uses the actual Local data renderer/preload/main/filesystem flow to
export both categories, cancel a clear, clear only application logs, recover an
actually corrupted tool record through explicit reset, preserve command usage and
an unrelated file, quit and restart. The tool reset persists; the next main start
creates one new application log. A synthetic private canary in the corrupt file
never reaches the window. Native save/confirmation responses are instrumented;
this is not physical dialog interaction or desktop integration acceptance.

Private HOME/XDG/profile/display/bus isolate the run. No user desktop settings,
clipboard, real credential, audio/input hardware, privileged service or provider
request is touched. Metadata-only tool events in this scenario are seeded fixtures;
current production emission is the fixed application-start event only.

An initial zoom capture exposed a clipped focus outline at the viewport edge.
A stronger actual200% keyboard bounds assertion reproduced the failure. A shared-
token scroll margin fixes it; the final test reserves all4CSS pixels occupied by
the native focus outline and offset. No DOMfocus or scrolling injection is used.

## Design evidence

Applicable DESIGN sections: [tokens](../../../docs/design/DESIGN.md#tokens),
[components](../../../docs/design/DESIGN.md#components),
[settings/permissions](../../../docs/design/DESIGN.md#settings-and-permissions),
[states/motion](../../../docs/design/DESIGN.md#states-and-motion),
[accessibility](../../../docs/design/DESIGN.md#accessibility),
[review gate](../../../docs/design/DESIGN.md#review-gate).
Shared host primitives and canonical tokens are reused. Five states have zero axe
violations and were visually inspected. The scaled image uses native Electron
capturePage; others are actual renderer full-page screenshots.

- [Dark categories](diagnostics-application-dark.png)
- [Light categories](diagnostics-application-light.png)
- [200% keyboard focus](diagnostics-application-200-percent.png)
- [Corrupt diagnostic unavailable](diagnostics-application-unavailable.png)
- [Filtered empty](diagnostics-application-filtered-empty.png)

## Remaining checks

Independent Standards review of frozen initial treea6b4feba found no material
violation or actionable smell and inspected all5captures. Independent Spec/security
review independently passed66checks and found oneP2: retention was opportunistic
and did not expire records during idle residency. The coordinator fixed it with
serialized minute maintenance, no overlapping passes, unref timer and shutdown
cancellation/draining. Fake-clock tests inspect real files after15/31days without
exporting them; application/tool retention and timer cleanup pass. This does not
prove OS suspend/resume integration. A source-found FIFO hazard is also fixed by
nonblocking no-follow opens followed by regular-file checks; an actual FIFO fixture
now fails export promptly, resets and closes. These small follow-ups are coordinator
validated, not a second independent final clean-review claim. Final68security,
actual Electron flow, typecheck/lint pass. The final recaptured dark image was
visually inspected; the other4images are byte-identical to initial reviewed pixels.
Focused publication/PR checks and supported Debian/native accessibility acceptance
remain pending. Normal1Password
Git signing currently fails; no unsigned fallback is authorized. Credential setup
and status UI, complete provider flow, full keyring/backend matrix, native dialog
interaction, portable encrypted backups and all1.0 release tasks remain separate
outstanding work. AC01/UI and overall F2-02 remain pending/in-progress.

Publication update: configured normal signing recovered after the session-worker
commit and F3 draftPR81. This validated diagnostics increment can now be signed
and published for review, preserving every pending native/credential/task gate.
No signing configuration change or unsigned commit fallback occurred.
