# Saved Quicklinks in launcher search: application evidence

L2-05 / L1-01 bounded unfinished application increment, 27 October 2026,
on merged PR46/e5da4f8. Contract dddcce3; main ea24f20/543bee9/c52f1c5/0fba577;
UI b58fcc4 (signed author 5669223); actual production integration 60b40bb.

## Behaviour and boundaries

Root launcher searches actual shown saved Quicklinks by name, full host and tags.
Main supplies bounded read-only metadata with stable quicklink:UUID and exact
saved ID/revision; no URL/query/code enters that catalogue. Existing registry
paging/revision/envelope/duplicate limits include at most 500 saved links within
5604 total commands. Search stays local. Selecting the root row opens the existing
Quicklinks List with that exact fresh, shown saved identity selected, including
identities beyond the 100-row projection. Entry never invokes native Open,
generic execution, clipboard, launcher Hide or argument filling.

The user separately chooses literal Open, or web-search Query→Review→Open.
Stale/deleted/hidden/missing entries show Reload/Back recovery with no fallback
row/action. Root query/selection is retained on Back, never copied into the web
argument. Query/selection/Back/Hide/dispose invalidates late entry reads. Unknown
metadata/native outcomes retain existing explicit Reload fences. Parent hidden
or unavailable state disables the UI route; main still checks current parent
visibility and the fresh owner target before native effects. Generic saved-entry
Execute/pin/alias/hide requests are denied. Preference editing uses existing
Quicklinks controls; root unified pin/frecency/shortcut controls remain pending.

A post-mutation Reload joining an older metadata read must start a fresh read;
it cannot publish discarded cached entries as confirmed. Controlled regression
covers old List→completed Hide Save→new Reload, cancelled old result and exactly
one fresh authoritative List excluding the hidden row. Parent visibility changes
only the parent descriptor, preserving existing exact visibility acknowledgements.
Storage failure disables cached entries and leaves Quicklinks recovery actionable.

## Validation

Linux amd64, Node24.22.1/Bun1.4.4/Electron45/SQLite3.53.4/GIO2.72.4. Production
sandboxed app uses owned private Xvfb X11 and private HOME/profile/XDG directories.
A real private registered browser handler receives only explicit URL argv and
empty stdin. Only native dialog choices are instrumented; no user display,
profile/device/provider/private content is accessed.

- L2-05 mapped unit: 245 passed (171 presentation, 10 root routing, 39 parser,
  25 URL builder). Contracts 13 and main/preload security 39 passed.
- L2-05 mapped integration: 41 passed, including actual production 9.24 seconds.
  Actual root name/tag search→Arrow/Enter selects the saved entry; no browser on
  navigation. Dedicated filter and search argument start empty. Hidden link is
  absent from refreshed root results. Separate literal/search Open reaches exact
  real browser-handler argv/empty stdin. Existing preference recovery, full
  restart and aggregate export privacy assertions remain passing.
- L1-01 mapped unit 214, security 74, contracts 2 and owner integration 19 passed.
- Author focused controller/routing 306 and Chromium keyboard/axe 98 passed
  (61 launcher, 37 Quicklinks), plus four final focused composition/recovery cases.
- Full typecheck, scoped source lint, plan validation and diff checks passed.
- Six component and two actual dark/light affected captures independently
  inspected clean. Actual axe passed. Applicable DESIGN.md Shell/navigation,
  Results/actions, List/Form, States and Accessibility; shared primitives/tokens.
- Independent GPT-6.1 SOL/high main/search and UI/actual source/capture review
  clean. Integrated owned UI trees exactly match reviewed author5669223.
- Initial production attempt reached the root capture then hit its 60s test
  deadline with old unbounded locator waits. Five-second page waits and explicit
  selected-row enabled readiness passed the targeted production rerun9.08s and
  final mapped run9.24s. No specific broader environmental cause is established.

Actual captures: `quicklinks-application-{dark,light}-launcher-entry.png`.
Component captures: `apps/desktop/src/features/launcher/evidence/{dark,light}-quicklink-entry-{root,selected,stale}.png`.
All contain public synthetic names, labels and example domains only.

## Explicitly unfinished

Both tasks remain in progress. These checks do not establish native GNOME/KDE
Wayland/X11, assistive technology, performance or release acceptance. Native GIO
acknowledges handoff, not browser focus/page completion. Full provider/fallback/AI
merging, saved-entry frecency/shortcuts/unified preference ranking, snapshot/context/
cursor/snippet/argument/component builders, file/registered URI/open-with targets,
native export and all prerequisite/release gates remain required. Complete agreed
local 1.0 scope and security requirements are unchanged.
