# F1-02 product native AT preparation

This directory contains offline preparation for the **production** launcher's
native observation leg: the observer, session controller, fresh Orca parser,
immutable build validation and guest namespace wrapper. It contains no successful
native product run. The authoritative controller sequence and remaining execution
prerequisites are in [controller-protocol.md](controller-protocol.md); wrapper
preparation is recorded in
[lab-wrapper-preparation](../../evidence/shell-native-at/lab-wrapper-preparation/README.md).
The original observer-only 31 October checkpoint in
[the evidence directory](../../evidence/shell-native-at/README.md) records the
stopped Debian lab and the unexecuted presentation/recovery gates at that time.
The observer contribution and protocol below are historical preparation context,
not a claim that the later controller/parser files are absent.

## Instrument integration gate

The Instrument renderer changes the root query from `searchbox` to `combobox`
and result title markup from `.lc-result-copy` to `.lc-row-title`. The current
`product_driver.ts` query selectors and `driver_guards.ts` final-row selectors
still target the earlier renderer. They must be adapted and reviewed, together
with native role/name assumptions and source pins, before any native attempt
using the Instrument product. Passing offline guards against the earlier fixture
does not establish compatibility. Do not relax native freshness, ownership,
exact action/selection, first-failure or cleanup requirements to accommodate it.
The namespace wrapper's approved product authority and a fresh immutable source
archive/build receipt must also match the reviewed Instrument revision. No native
execution or acceptance is established by the renderer's Chromium/Xvfb evidence.

Run the offline checks from the repository root:

```sh
python3 -B -m unittest discover -s apps/desktop/tests/at -p 'test_*.py' -v
```

These tests use synthetic native objects and temporary Unix sockets. They do
not import GI/pyatspi, connect to a bus, start a display or reader, or send keys.
Success is test-preparation evidence only. The mapped `bun run test:security -- F1-02` includes a Node wrapper that runs
this exact Python suite and fails on missing Python, skipped checks or any failure.
It remains offline preparation; native prerequisites are a separate non-skippable gate.

## Existing infrastructure inspected

- `spikes/launcher/tests/at/{xvfb-orca.ts,private-session.ts,check.ts}` creates
  private Xvfb, session/AT buses, discovery, reader and null/dummy speech output.
  Its driver imports `buildLauncher` and executes **spike** source. Its hardcoded
  `check.ts` target and result paths cannot execute or publish product evidence.
- `spikes/launcher/tests/at/{native-at.py,private-a11y.py}` shows the existing
  native observer/discovery separation. Discovery enables only the private bus;
  the actual AT-SPI registry carries native data. The new observer below retains
  that distinction but knows the product's controls, selection and fixed IDs.
- `spikes/launcher/tests/native-session/` and the archived short-layout
  `orchestration-source/host.py` demonstrate private runtime authority, strict
  publication and cleanup. Their launcher assumptions and archived endpoint
  names are not current product/lab authority.
- `apps/desktop/tests/shell-accessibility.integration.test.ts` is the product
  build/launch, zoom, sizing and alias-form reference. Its nonexistent bus and
  DOM checks do not observe native AT. Its loading/error replies are injections.

No existing source/artifact was edited. No new controller, dependency, guest
reconstruction or host Orca fallback was added in this blocked increment.

## Observer interface and limitations

`native_at.py` is an optional child of a future product controller. It accepts
the exact live product main PID and exact owned Orca PID; neither is published:

```sh
python3 -B apps/desktop/tests/at/native_at.py PRODUCT_PID ORCA_PID
```

The controller supplies `LINUXCAST_F102_AT_ROOT=/tmp/linuxcast-f102-at-HEX`, owned
mode 0700, with `HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME` and
`XDG_RUNTIME_DIR` pointing to its mode-0700 `home/config/cache/data/runtime`
children. Set `XDG_SESSION_TYPE=x11`, `GSETTINGS_BACKEND=memory`, no Wayland
display, an owned display numbered at least 100, and `LINUXCAST_F102_XVFB_PID`.
`XAUTHORITY` must be its mode-0600 `runtime/Xauthority`. Session and AT addresses
must be exactly `unix:path=ROOT/runtime/session-bus` and
`unix:path=ROOT/runtime/at-bus`, owned existing sockets. The Xvfb command must
match that display/auth file, disable TCP listening and omit `-ac`.

`--check-envelope` checks only these local prerequisites and never connects to
AT. The native route additionally refuses non-Debian-13 platforms before GI
imports. This is a fail-closed test guard, not protection against malicious
same-UID processes. The future controller still must retain live pidfds/owned
child handles, verify Orca 48.1 and source hashes, attest the actual product URL
and sandbox, own the buses/registry/discovery, and enforce process-tree cleanup.

On `ready`, send `inspect\n` for one bounded snapshot or `quit\n` to exit. EOF
stops the observer. Invalid input, native failures, a foreign application/node,
duplicate/absent target or a 120-second deadline ends it incompletely. Reports
contain only fixed IDs, role categories, four state booleans and bounded event
sequence records. They omit text/value/description reads, IDs/PIDs, object paths,
exceptions, raw events and logs. Unknown names and suffix matches are excluded.
The exact result names are `Public AT result Installed application`,
`Public AT result alternate Installed application` and
`Public AT filler 119 Installed application`; any different native name/role is an unmet checkpoint, not a reason to loosen the
match during the run. Native role mappings themselves remain runtime-unverified.

`observations.checkpoint` requires a unique, showing, visible native control,
its current focused/selected state and a matching event newer than the saved
pre-input sequence. Result selection requires a focused search listbox and a
fresh selection/active-descendant event; it does not invent option focus. It
does not establish Orca presentation, actual pixel bounds or audible output.

## One future controlled product question

Question: **at zoom 2, does the current production launcher expose the native
search/action/form focus and selected-result transitions, and does real Orca
freshly present them, including return to search and fallback recovery controls?**

Before execution, reserve/resume the existing Debian lab and verify its current
baseline. Review the controller adaptation before making one actual attempt.
Transfer an immutable source archive at the recorded commit plus the reviewed
test preparation, frozen lockfile and pinned tools. Build the product using
`apps/desktop/setup-sqlite.ts` and `apps/desktop/build.ts` **inside that staging
tree**; do not copy the parent's dist or the spike build. Record complete build
inputs, generated output/addon/helper hashes, runtime/package versions, actual
renderer URL `linuxcast-app://shell/index.html` and runtime security booleans.

Use a fresh profile and synthetic desktop catalogue only. Include the fixed
`Public AT result` desktop entry with no Comment (subtitle is then `Installed
application`), a second `Public AT result alternate` entry for a real away/back
selection transition, and enough public filler entries for a scrolling body.
Never launch a desktop entry or touch clipboard/network/audio hardware. Null
audio and private Speech Dispatcher/Orca configuration follow the existing AT
infrastructure; do not inherit host Pulse/PipeWire sockets or host environment.

The future controller should run this fixed sequence, stopping on its first
unmet condition. Take both a native event sequence and private Orca log offset
before each keyboard step. Keep the existing ten-second per-checkpoint bound;
do not retry inputs, extend timeouts or reconfigure the reader after failure.

| Step | Product operation | Required observations |
| --- | --- | --- |
| Search | Initial product window; set actual webContents zoom factor 2; check native focus after the next explicit search-focus transition | Native `search` entry, fresh focus and Orca Search presentation. DOM/BrowserWindow checks separately establish zoom 2 and viewport geometry. |
| Result | Type `Public AT result`, Tab to search list, move selection away and back with fixed keys | Native focused `search` listbox and fresh `public-result` selected/active-descendant event, plus fresh Orca result presentation. Scrolling/End coverage additionally needs an exact fixed final-row identity and pixel bounds. |
| Actions | Shift+Tab to search, Ctrl+K | Native `action-search` entry and Actions dialog; fresh Find an action presentation. |
| Form | Type `Edit search alias`, Enter | Native `alias-field` entry with fresh Search alias presentation. Do not modify/save user data. |
| Form order | Tab, Tab | Fresh native `save-alias`, then `cancel` button focus and their fresh presentations. |
| Restore | Enter on untouched Cancel | Fresh native `search` entry and Search presentation. |
| Reopen | Escape; actual secondary invocation `--show` with same private profile | Native Search focus/event and fresh presentation; record actual singleton/visibility separately. |
| Loading | Inject the existing product test's fixed pending `shell:get-state` reply; reload | Native application heading/loading status and fitting footer. Explicitly injected renderer-state evidence, not a real outage. |
| Error | Inject the existing fixed failed state reply; reload | Fresh native `fallback-hide` button focus, error heading and fresh Hide presentation; check footer bounds separately. |
| Recovery | Restore the real state handler, hide/reopen or reload via explicit controlled test operation | Fresh native Search focus/presentation and real state response. This proves recovery from an injected test state only. |

The result row is **not** necessarily focused; the collection owns focus and
`aria-activedescendant`. The future driver must not call a DOM `focus()` to make
a failed keyboard checkpoint pass. If focus is already on a control, arrange a
single documented away/back transition before the saved offset, rather than
accepting a stale startup event. Check meaningful full result/control names in
fresh Orca generated-output records, then record a separate matching Speech
Dispatcher **attempt**. The historical `Speaking` marker is pre-send and must
not be called delivery. A separately validated completion/callback signal is
needed for delivery; audible output is outside this null-audio run. This
increment deliberately supplies no new Orca-log parser or completion assertion.

Public publication must reject arbitrary fields/text, preserve the first
failure, retain per-step native/generated/attempt/completion distinctions, and
write into a new evidence subdirectory exclusively. Raw AT/Orca logs stay in
the private profile and are discarded after extracting allowlisted booleans.
Always stop/reap and verify all owned descendants, buses, sockets, display,
profiles and staging; an unverified cleanup blocks a clean release statement.
Leave all earlier failures untouched. Even a complete private run cannot close
GNOME 48/Plasma 6.3 Wayland/X11, D1-01/02 or audible/hardware acceptance.

## Fresh infrastructure checkpoint

The coordinator resumed/reserved the existing lab on31October, verified fresh
Debian13.7/Orca48.1, clean owned baseline and all13reviewed Orca source hashes,
then shut it down cleanly. See
[preflight evidence](../../evidence/shell-native-at/lab-resume-preflight/README.md).
No product/native run occurred. The earlier access blocker was resolved at that
checkpoint; the controller/parser/publication preparation was added subsequently.
Actual product execution and the current Instrument integration gate above remain
outstanding.


## Coordinator version2 alternate/final preparation

The original fc0fdb2 manifest and14-test record are historical provenance. Current
coordinator code adds only exact public-alternate/public-final IDs for the fixed
names above; PID-before-content, fixed role/state/event rules and all privacy
bounds remain. The strict controller protocol is now version2 and rejects v1
reports. Away requires its own fresh native selection and Orca generation/
pre-send attempt. Final filters entries100–119 through the unchanged20-row
provider projection, establishes a native/DOM collection anchor, then uses End
once to reach row119. Native current selection/fresh event and independent DOM
scroll/footer/row/pixel bounds are required. No input launch occurs; alias and
Cancel Enter guards remain. Current pins are in controller-preparation's
coordinator-sha256.json. These new IDs/checkpoints are offline preparation and
require independent review, fresh guest build and actual native execution; no
native acceptance, completion, delivery or audible result is claimed.
