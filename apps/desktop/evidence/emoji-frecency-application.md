# L2-06 — local Emoji ranking application evidence

30 October 2026. Bounded application increment, base PR72/c881a66. Task:
`docs/implementation/tasks/L2-06.md`; normative product/builtins, architecture/data,
architecture/security, implementation/testing-release and design/DESIGN.md
(List/Grid/Detail/Form, shell/navigation, states, accessibility) with tokens.json.
No full L2-06, prerequisite, desktop-matrix or release acceptance claim.

## User-visible result

Registered Emoji uses the real pinned Unicode17.0 catalogue (3944 entries).
Relevant matches keep priority; favourites and locally decayed frequency break
same-relevance ties before the100-row result cap, then stable Unicode source order.
The seven-day score is useCount/(1+max(0,now-lastUsedAt)/7days), using main's clock.
Canonical Unicode values are never rewritten. Refreshed results preserve the
selected ID rather than selecting the old row position.

Actions → Emoji ranking opens the shared Form. Pause preserves saved entries but
stops count-based ranking and both private/command-aggregate recording for Emoji
Copy. Resume reuses those entries. Reset ranking has a separate default-false
required confirmation; Cancel returns to Grid without changing query/selection.
Confirmed Reset clears per-Emoji counts/times and keeps pause state. Overall
command aggregates can be cleared through Data settings; the global/selected
Emoji usage-clear transaction also resets private entries and advances their
revision even when absent/empty, fencing stale in-flight CAS writes.

## Actual production application scenario

`apps/desktop/tests/emoji-frecency.integration.test.ts` builds/launches the real
sandboxed Electron application, with real storage utility owner, named preload/
main routes, full production search and native X11 clipboard. Fresh private HOME/
XDG/userData directories and no real session D-Bus are used. No renderer API,
search backend, clipboard writer or persistence result is mocked in this scenario.

PASS9.49s, within the mapped32integration/11file run PASS70.46s. Verified:

- Search registered Emoji, search `milk` (7 real matches), select glass of milk
  while cow face is initially first, explicitly Copy, then observe milk reorder
  first with the selected canonical ID/query retained. Empty query also ranks
  milk first and retains its selected identity; the source cap remains100.
- Three explicit native clipboard writes copy exactly U+1F95B. Search/navigation,
  tracking edits, reset and reopen never modify the clipboard sentinel/content.
  One Copy occurs while paused, so only two uses are recorded.
- Hide/reopen and four Quit/restart cycles preserve durable preferences/counts
  and clear transient frames. Real StorageOwner inspection happens only while
  Electron is closed, preserving the single-owner boundary.
- After first Copy: private revision1/count1 and command aggregate1. Pause:
  revision2/enabledfalse/count1; paused Copy leaves revision/count/aggregate
  unchanged. Resume and Copy: revision4/enabledtrue/count2, canonical UTC instant
  no earlier than prior use, aggregate2, inspected before Reset erases entries.
- Reset Cancel changes nothing; confirmed Reset writes revision5/enabledtrue/
  entries[]; final restart shows the original public order and same saved state.
- Ordinary settings/usage exports omit private setting ID, selected canonical ID,
  glyph/name and public fixture markers. Renderer page HTTP(S) observation is0;
  this page-only observation is not a system-wide network monitor.

## Checks and review

Final assembled mapped701unit,50contract,393security and67browser PASS31.2s.
Mapped32integration includes7 actual sandboxed Electron scenarios,17 real storage
owner cases and8 syntheticclient transport cases. Full pinned direct Node project
TypeScript and scoped ESLint are required and recorded in coordinator tracking.
The final uncertainty text correction additionally runs62controllers and the one
affected browser/capture: tracking could not be confirmed, while Copy remains
known successful. No behavior change to successful actual flows.

New six storage cases comprise5 real-owner cases and1 syntheticclient case:
restart/pause/reset, canonical/private CAS validation, export privacy, global and
selected clear, absent/empty reset epochs, corrupt-state atomic rollback and
exact receipt/no-replay validation. No new table, migration or dependency.

Independent source/contract/storage/search/IPC/UI/assertion/capture review is
required before publication. Findings corrected: absent/empty Clear epoch race;
private-CAS failure incorrectly recording aggregate usage; unknown saved favourite
ID poisoning ordinary public search; truthful uncertainty wording. Existing closed
API/backend fixtures updated only for the new named operation/ranking input and
canonical-ID validation reads. No acceptance criterion promoted from mock evidence.

## Affected-state captures

Actual dark/light ranked Grid and paused Form, all axe0:

- `emoji-frecency-application-ranked-dark.png`
- `emoji-frecency-application-ranked-light.png`
- `emoji-frecency-application-paused-dark.png`
- `emoji-frecency-application-paused-light.png`

Eight NEW shared-browser dark/light/default-false Reset/pending/unknown/paused/
200percent/tracking-uncertain captures and keyboard behavior are documented in
`packages/builtins/emoji/FRECENCY-UI.md`. Those fixtures are explicitly synthetic;
they do not establish production ranking/storage/native clipboard success.
Historical691 tracked screenshots remain unchanged after test recaptures.

## Platform and remaining acceptance

Host Pop!_OS22.04amd64, private Xvfb X11/xclip. Pinned host Node24.22.1/Bun1.4.4;
actual Electron45.0.0, embedded Node24.22.0/ICU78.2. chromiumSandbox:true,
contextIsolation/no renderer Node; no --no-sandbox or real personal profile.
Headless keyboard/axe/screenshots are not GNOME/KDE Wayland/X11, native assistive
technology, high contrast, physical clipboard destinations or Debian13 acceptance.

Full Hunspell checking/StarDict/thesaurus formats, native paste, explicit global
provider semantic lookup, remaining prerequisites/performance/package/release
checks are still required. Full local1.0/all97/R1-03 scope is unchanged.
