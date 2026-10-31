# F3-01 Saved permissions production evidence

Recorded 31 October 2026 on coordinator branch `codex/f3-01-permissions-ui`, based
on develop `f461a87`. Task: [F3-01](../../../docs/implementation/tasks/F3-01.md).
This is supporting evidence; AC02/UI remain pending final independent review and
applicable supported desktop/accessibility checks. No task completion is claimed.

## Concrete behaviour

Previously, the production workflow debugger could approve once, remember allow
or deny, and reset its own decisions, but there was no global saved-decision
review window. Saved permissions now opens from the command catalogue and lists
bounded pages of actual owner-stored decisions. It identifies the immutable source,
version, operation, resource scope, and remembered choice. Full source labels
remain available to assistive technology and in the confirmation review.

A main-owned opaque snapshot selection identifies the record to remove. The
renderer cannot supply a principal, database record, or record ID. Keep/Escape
preserves the choice. Remove cancels matching live brokers before awaiting durable
storage, drains late writes and cleanup, and compare-deletes the whole selected
record. A newer choice is preserved. Unknown storage outcomes show remediation;
failed cleanup quarantines the source across current and future brokers for this
application session. No operation is replayed and no already-dispatched effect is
claimed undone. Production workflow brokers share this registry.

Existing debugger approvals provide once/persistent/deny for its clipboard effect.
Generic consent cards/settings routes remain D1-03 work. Other effect adapters must
still provide their own fresh validation and durable preparation.

## Executed checks

Pinned Node24.22.1, Bun1.4.4, Electron45.0.0 (Chromium156.0.8078.48,
embedded Node24.22.0), Rust1.95.0; Pop!_OS22.04 amd64 host, private owned Xvfb
1920×1080. SQLite native addon rebuilt for this toolchain. Chromium sandbox is on.
This does not establish Debian13 GNOME/KDE Wayland/X11, Orca, physical keyboard,
package, recovery, or release acceptance.

All commands run in the isolated coordinator worktree with the pinned tools on
PATH. Electron distribution override points to the existing verified Electron45
installation; it does not bypass the application sandbox.

| Command/check | Result |
| --- | --- |
| `bun run test:unit -- F3-01` | 75/75; includes full 5614-command catalogue ceiling |
| `bun run test:contracts -- F3-01` | 2/2 strict permission administration contracts |
| `bun run test:security -- F3-01` | 72/72; actual storage owner/persistence plus broker races, identity, pagination, preload and sender checks |
| `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a -s '-screen 0 1920x1080x24' node scripts/test-runner/run.ts integration F3-01` | 2/2, 17.51s; production build executed by each scenario |
| `bun run typecheck`; `bun run lint` | Pass, no errors or warnings |
| `bun install --frozen-lockfile` | Pass; only existing pinned React and workspace UI dependency added |

The new production scenario (8.254s) creates an actual persistent clipboard grant
through the existing debugger, reviews it through the new sandboxed window,
confirms removal, preserves an unrelated denial byte-for-byte through owner reopen,
and requires approval again before and after application restart. A deliberately
seeded obsolete declaration grant for the same immutable workflow source cannot
approve a current invocation: removing it while the actual run waits for approval
cancels the run and terminates its workflow utility. The private clipboard sentinel
is unchanged. This obsolete choice is a storage fixture, not simulated approval.

The scenario verifies immediate Escape, Keep/Escape confirmation focus restoration,
post-removal Refresh focus, actual 200% Electron zoom and keyboard traversal without
horizontal clipping, all four exposed preload methods, and absence of renderer
Node/require or the shell API. Explicitly removing the remaining denial yields the
actual empty state and final owner inventory is empty.

Unavailable-state evidence kills only the test's owned storage utility, then uses
real Refresh to obtain remediation. Loading-state evidence replaces only the list
handler with a deliberately pending promise; it is a renderer-state fixture, not
storage recovery proof. Forced colours and reduced motion are Chromium media
emulation. All nine captured states have zero axe violations, which is automated
DOM evidence rather than native screen-reader acceptance.

The legacy production workflow test also passes (7.935s): actual approval/receipt,
deny/reset, persisted grant reuse, and utility crash without automatic replay.
Tests isolate HOME/XDG/profile/display/bus and use public synthetic text. No host
clipboard, user desktop settings, input service, or private content is touched.

## Review and regression evidence

Independent Standards and Spec/security reviews examined initial signed `3d127ea`.
Standards found initial keyboard focus outside the window Escape handler and
irreversible source-label truncation. Both are fixed: initial Refresh focus is
covered in the production Escape check; full labels are bounded by the wire budget,
with two same-prefix long-name and page-overflow regressions. Common storage page
shaping is shared instead of duplicated.

Security found a blocking late-write cleanup race: the old broker could quarantine
itself while the shared registry reported removal and admitted a fresh broker to
a surviving grant. Two regressions first reproduced this, including concurrent
broker release. Both now pass: the shared failure callback quarantines and cancels
all matching brokers, draining removal returns unavailable, and future connections
remain blocked. Independent final security/spec and standards/design recheck of frozen staged
tree `c6b83bc5f3e7711298743d0bc736bb20a6544eb6` found no new blockers and
confirmed the P1 and both P2 fixes. It independently passed72security/75unit/
2contract checks and extra in-memory connecting/release/close/callback probes;
all9captures were inspected without rewriting them. Source and index matched
before/after. HEAD was still signed3d127ea because normal signing failed.
This subsequent documentation update does not change reviewed application source.

## Design evidence

Applicable canonical sections: [tokens](../../../docs/design/DESIGN.md#tokens),
[shell/navigation](../../../docs/design/DESIGN.md#shell-and-navigation),
[components](../../../docs/design/DESIGN.md#components),
[settings/permissions](../../../docs/design/DESIGN.md#settings-and-permissions),
[states/motion](../../../docs/design/DESIGN.md#states-and-motion),
[accessibility](../../../docs/design/DESIGN.md#accessibility), and
[review gate](../../../docs/design/DESIGN.md#review-gate).
The window uses shared host primitives/tokens and local bundled assets.

- [Dark saved choices](permissions-application-dark.png)
- [Light saved choices](permissions-application-light.png)
- [Confirmation](permissions-application-confirm-light.png)
- [200% light](permissions-application-200-percent-light.png)
- [Emulated forced colours/reduced motion at 200%](permissions-application-forced-colors.png)
- [Removal receipt](permissions-application-removed-light.png)
- [Actual empty state](permissions-application-empty-light.png)
- [Actual storage unavailable](permissions-application-unavailable-light.png)
- [Deliberately pending read](permissions-application-loading-light.png)

Scaled captures use native Electron `capturePage`; other states use Playwright
full-page screenshots. Visual inspection accompanies the automated checks.

## Remaining acceptance

Final independent source review is clean on the frozen tree above; PR checks/reviews are pending. Normal signed commit failed through the unchanged 1Password signer; final source/evidence are staged, not published. Supported Debian desktop
and native AT evidence remain outstanding. Global reusable consent surfaces and
non-workflow effect integrations are not completed by this window. F3-01 AC02/UI
stay pending, and the full local 1.0 goal remains active.
