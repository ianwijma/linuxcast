# Activation-help accessibility checks

## Current explicit reading path

On24October2026, one actual private Debian13.7/Xvfb/Orca48.1 focused run
passed all four native focus checkpoints, all three essential utterance
completion checks and Escape/Search restoration. See the exact
[completed reading evidence](../../evidence/activation-help/reading-completed/README.md).
The [earlier incomplete run](../../evidence/activation-help/reading-incomplete/README.md)
remains failed. The default-nine Record presentation failure and native notice/
manual-recovery reproduction remain outstanding; the focused result does not
establish audible output or the desktop matrix. This dated documentation update
followed execution; the executed README hash remains recorded in execution.json.

### Source-only Record receipt observation

The current checker adds `recordFocusEventReceiptObserved` to the existing
success/incomplete Orca reports. It observes only the exact `Record shortcut`
toggle-button focus-gain event in the same fresh slice already used by that
control's presentation checks. Orca48.1 `event_manager.py:232-238` logs the
event before its ignore decisions; `ax_utilities_debugging.py:66-89` formats
its role/name and focus-gain detail. Its public role spelling is `toggle button`.
True means that receipt was observed, not that Orca processed or spoke the
control. False means not observed in this slice, not proven nonreceipt; the
help-only mode skips Record and leaves this boolean false.

This boolean never gates success. Native focus/event/role checks, generated
presentation and dispatch-attempt checks, deadlines, mode routing and cleanup
remain unchanged. Tests cover gain/loss, role/name rejection, stale/nonpublic
input, the actual fresh-offset observation, unchanged success/failure behavior
and boolean-only report serialization. No raw event, log or private path is
exported. This increment has no runtime evidence: the accepted focused run
executed checker `9313a473954c87f14b296a8c8e8587acaa5ffd84a01462257059650639c6ab4b`.
It neither diagnoses the retained default-nine failure nor closes S0-01-UI.

The current `check.ts` keeps all nine native focus/name/role checkpoints (four
in `--activation-help-only` mode). The help landmark no longer requires its
passive accessible name to be announced automatically. After its unchanged
native landmark/focus/event assertions, the runner sends one **KP_Add** through
the existing private-display keyboard helper. Actual Orca must generate and
send each complete essential sentence to Speech Dispatcher:

1. The reason that focus is unconfirmed for this request.
2. The manual app-switcher/click recovery instruction.
3. The automatic-focus companion requirement and the fact none is connected.

The expected text is fixed in the checker; a unit test verifies it equals the
entire application reason and remediation. The log offset is taken immediately
before the command, after native focus passes. Exactly one fresh Say All request
must precede each complete generated context. Its exact matching dispatch
attempt must occur before the next generated context or final reader exhaustion,
whichever occurs first, within the existing ten-second deadline. That iterator
advancement establishes completion for the preceding utterance; dispatch
attempts alone do not pass. Unrelated later document content need not finish.
No partial-sentence, missing-reason, missing-remediation, generation-only,
delivery-only, attempt-only, out-of-order completion, competing-request or
old-log observation can pass. Escape then retains the original
fresh native focus, generated Search presentation and dispatch-attempt assertions.

Both modes report native checkpoints separately from ordinary focus
presentation checkpoints (nine/eight or four/three), plus the three content
reading results. Ordinary focus and Dismiss-anchor reports use
`dispatchAttemptObserved`; the incomplete-run aggregate uses
`anyKnownDispatchAttemptObserved`. These name the pre-send `Speaking` marker
accurately and do not establish receipt. Their native/generated checks and
existing marker requirements are unchanged. Only essential help-reading
`deliveredToSpeechDispatcher` is backed by the completed callback progression
below. Passing the selected source checks does not close S0-01-UI or establish
ordinary-focus delivery; actual screen-reader acceptance remains outstanding. Public output stores only fixed sentence IDs and booleans;
raw text/logs remain in the private temporary profile and are discarded. No
app copy, renderer, native observer, wrapper, artifact schema authority,
manifest/lockfile or task registry is changed by this reading increment.
No fake speech or accessible text is injected: the only new action is the
actual Orca reading key against the owned launcher.

### Source and configuration

[GNOME's Reading Commands](https://help.gnome.org/orca/commands_reading.html)
documents Desktop-layout KP Plus as Say All from the current position.
The inspected [official Orca 48.1 source archive](https://download.gnome.org/sources/orca/48/orca-48.1.tar.xz)
has SHA256 `66c6f09822149da243a4633a7d84a7b1dbaaf14534a9feb9df2bfe01a505178a`.
Within it:

- `src/orca/scripts/default.py:233-247` binds unmodified single KP_Add to
  `sayAllHandler`; `settings.py:145,172,203,234,280` fixes Desktop=1,
  sentence reading=1 and the default profile.
- `settings_manager.py:131-158` and `backends/json_backend.py:34-62,120-140`
  establish the private default JSON configuration and profile overrides. The
  checker requires Orca48.1, the generated default Desktop/sentence settings,
  and no custom bindings/pronunciations before any native reading steps. No
  user preference is changed. Other runtime versions remain unvalidated.
- `scripts/web/script.py:575-591` generates utterances, logs each generated
  `SayAllContext` and yields it to the speech server. `speechserver.py:89-92`
  defines the `SAY ALL` context format. `debug.py:58-69,99-105` defines its
  timestamp and token rendering. The matcher requires the complete generated
  utterance field, not `WEB SAY ALL CONTENT` inspection text.
- `SayAllContext.__str__` formats its object directly with `%s`. The official
  [PyGObject 3.50 source](https://github.com/GNOME/pygobject/blob/3.50.0/gi/pygobject-object.c#L1091-L1116)
  defines its ordinary quote-free object representation. Standalone Orca48.1
  does not import the observer's separate `pyatspi` process or its formatting
  patches. Exact target matching rejects ambiguous quoted object fields and
  prefixed utterances; it cannot promote a matching suffix to a full sentence.
  Fixtures use synthetic PyGObject representations, not captured runtime
  addresses. The next-context boundary separately accepts arbitrary utterance
  text, including apostrophes/empty text and the source's signed `%i` offsets,
  so those contexts cannot be skipped to use a later dispatch attempt. An
  unrecognized or multiline next-context marker fails closed; the checker
  cannot skip it to claim completion from a later context or exhaustion.
- `speech.py:128-138` only uses `SPEECH OUTPUT` for Say All when **no** speech
  server exists. Requiring that ordinary marker here would test the wrong path.
- `speechdispatcherfactory.py:304-357` consumes the context and passes its
  utterance through `_speak`; `ssml.py:139-190` inserts word-position marks.
  The delivery matcher removes only those exact numeric `<mark>` tags inside
  the logged `<speak>` payload and requires the full expected sentence. The
  existing `SPEECH DISPATCHER: Speaking` marker records the dispatch call path;
  it does not itself prove receipt: the marker precedes a call that can swallow
  errors. In the active-server route, `_say_all` resumes the generator after
  each yield only on Speech Dispatcher `END`
  (`speechdispatcherfactory.py:140,351-352`). The next generated `SayAllContext`
  or final `WEB: textLines complete. Verifying SayAll status` marker therefore
  establishes completion of the preceding utterance. The exact full dispatch
  attempt must lie strictly between its generation and that first advancement;
  a matching attempt from a later context cannot satisfy it. This proves neither
  audible output nor physical speaker behavior. The no-server iterator path
  cannot pass because matching dispatch attempts are also required.
- `input_event.py:620-625,710-716,738` cancels prior presentation on the pressed
  key before calling its handler; `scripts/default.py:995-1006` logs the Say All
  request before passing the generator to speech. The fresh slice must contain
  exactly one such request, so separate readers cannot be combined. The test
  does not inject speech or add Orca instrumentation to obtain completion.

The same sandbox/private buses, native focus/event role assertions, fixed
Dismiss anchors and cleanup remain. No timeout increase, diagnostic/retry
framework or live-desktop run is part of this increment. The preserved heading
receipt boolean and all historical failures below retain their original meaning.

### Bounded local validation and acceptance mapping

The existing mapped `activation-help-mode.test.ts` now covers the new actual
routing, three complete-copy requirements, exact source-supported markers,
configuration rejection, and one-command fresh-output/failure scenarios,
including attempts with no completion, attempts arriving after their context
advanced, malformed/inspection markers, completion before the final expected
utterance and a competing request. A successful fixture reads all three required
sentences and advances to later content without exhausting the whole document.
Independent review found the initial attempt-only delivery gap before any real
run. The current correction uses per-utterance completion instead of requiring
whole-document exhaustion. The retained actual incomplete run stays failed;
this source correction does not diagnose its cause or reinterpret its booleans. It
uses no display, bus, speech or input devices. Existing mapping suffices; no
shared suite change is requested. The Python observer fixtures remain unchanged.

This adds source/test preparation for **S0-01-UI** only. It establishes no new
AC01 focus/companion result or AC02 lifecycle result. The focused execution linked
above separately supplies actual reading, screenshot and privacy/cleanup evidence.
Reports contain fixed public IDs/booleans and raw logs are deleted. Acceptance
statuses remain coordinator-owned; the Record presentation failure, native notice/
manual-recovery reproduction and wider release gates remain outstanding.
Prior failures are not passes.

## Historical automatic-name runner and retained failures

The following sections describe earlier source variants and their evidence.
Their nine/four automatic-name speech assertions are superseded only for the
landmark by the explicit content-reading path above; historical outcomes are
unchanged. Historical `delivered`/`deliveredToSpeechDispatcher` and
`anyKnownDelivered` fields recorded the earlier pre-send marker observation;
their names alone do not establish receipt. The original artifacts and wording
below are retained without retroactively changing their recorded outcomes.

The earlier Debian13.7/Orca48.1 capture predates the unconfirmed-activation
notice. Its five native focus/role checks and five fresh generated/delivered
presentations cover search, actions and shortcut controls, not the new help.
The subsequent structural-navigation UI run passed all eight dark/light views,
including actual Electron zoom2 plus forced-colors/reduced-motion emulation,
exact child-top/parent-scroll restoration, End scrolling, keyboard Escape and
axe. That own-renderer evidence does not establish screen-reader presentation,
native GNOME activation or OS-wide display settings.

This increment reuses those two existing checkers. No application, native-session
observer, transport, dependency, shared contract or task status changes are made.
The applicable DESIGN sections are Accessibility, States and motion, shared
Tokens and Review gate. Existing host primitives/tokens remain unchanged.

## Small affected-state change

`check.ts` retains all five prior assertions and adds four fresh native focus,
role, generated-presentation and Speech Dispatcher delivery assertions:

1. Tab from the fixed Dismiss anchor to **View activation help** (button).
2. Enter opens **Launcher capabilities** and moves focus to its heading.
3. Tab from the same Dismiss anchor reaches **Launcher capability details**
   (landmark). Layout and End scrolling are checked by the independent UI run.
4. Escape restores **Search commands** (entry).

Only a fixed public synthetic unconfirmed-X11 state is sent to the owned
renderer. It does not establish actual GNOME focus or companion availability.
The same private Xvfb, session/AT buses, actual Orca and dummy Speech Dispatcher
are used; no host display, audio, settings or physical input is accessed.
Raw Orca logs remain private and are removed with the owned profile. The observer
adds only three fixed public names and exact heading/landmark roles. Chromium's
[Linux role mapping](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/ui/accessibility/platform/ax_platform_node_auralinux.cc)
provides the expected heading and region/landmark mapping; actual installed
Electron/AT-SPI observations must still pass, without accepting another role.
The child process is retained immediately after launch so the existing cleanup
catch never queries a disposed Playwright process accessor.

`../activation-help-ui.ts` keeps its standard dark/light assertions and repeats
both appearances at actual Electron zoom factor2, with Chromium forced-colors
and reduced-motion emulation. It checks the applied zoom/media state, no
horizontal overflow, the named region's keyboard scroll/focus/Escape path,
visible outline and disabled transition/animation, and unchanged WCAG axe rules.
Eight affected views are planned (standard/combined accessibility mode, each
with dark/light notice/help), saved under
`evidence/activation-help/affected-accessibility/`. Existing historical evidence
is not overwritten. Combined mode is a deliberate stress case, not proof of
an OS-wide high-contrast/text-scale preference or separate compositor support.

## Checks performed for this source increment

- Four no-GI/no-bus tests execute the actual Python observer definitions with
  fixed fake nodes: new role/name classification, unknown-label nonexport,
  foreign-application refusal before traversal, and own fresh focus-event gating.
- Strict TypeScript, affected ESLint, Python AST and diff whitespace checks pass.
- Two earlier source variants did run on private Debian Xvfb/Orca48.1. The first
  (checker66d600c4/archive4fe58dcc) returned3 before Record shortcut: three
  focus/presentation/delivery checks passed. The newly focusable Shortcut details
  region made the old single-Tab path stale; an explicit intermediate DOM-focus
  assertion now preserves the unchanged Record native/presentation assertion.
- The second (checker100a2c7f/archive2823fb76) returned3 after eight strict native
  focus/presentation/delivery checks, including help button, heading and region.
  It stopped in the subsequent redundant layout/End-scroll block before Escape.
  The retained report does not distinguish which assertion failed; no Orca
  interception or application defect is established. Its independent UI run
  returned1 before retaining any UI output. Both stages were cleaned, source
  checks unchanged, pinned tools verified and the private baseline restored.
- This revised source keeps all nine strict AT focus/presentation assertions,
  including Escape/search, and puts the still-required overflow/End-scroll
  assertions exclusively in the existing independent UI checker. It adds fixed
  operational-stage failure reporting before cleanup, including build/dependency
  resolution/launch failures. It stores no caught error or raw payload.
- Both local module-resolution contexts currently resolve the same Electron45
  module. This does not establish the historical guest UI failure cause, and no
  speculative dependency or app change was made. The first local preflight's
  ten-package/eleven-count assertion failure is also preserved separately.
- The subsequent default-nine AT run (checker4290c532) reached Record with
  native focus/event proof but lacked its fresh generated/delivered presentation.
  It remained incomplete. No Record success, nine-check pass or cause is inferred.
  At that historical checkpoint the help-only mode had not had an actual Orca run. Earlier baseline
  and eight-check observations retain their exact scope.

## Fixed affected-help mode

`node spikes/launcher/tests/at/xvfb-orca.ts --activation-help-only` forwards only
that exact flag through the existing private wrappers. No flag retains the
default nine-check path; other or repeated arguments are rejected before effects.
The focused mode skips exactly the legacy five checkpoints (Search commands,
Hide launcher, Actions Ctrl K, Record shortcut and Cancel shortcut change) and
runs the four help checkpoints above. Its report names the mode, exact expected
checkpoints and skipped legacy checkpoints. A four-check pass cannot be read as
nine-check success or resolve the earlier Record presentation failure.

Both modes use the identical `focusCheck` native event-sequence/role/focus,
fresh Orca-generated presentation and Speech Dispatcher dispatch-attempt assertions.
The same fixed Dismiss anchors, private display/buses/profile, original deadlines
and cleanup apply. No observer, app, native-session, dependency or task-status
change is needed for this mode. Five harmless source-extracted fixtures exercise
the exact argument guards and actual default-nine/help-four routing with mocked
focus calls; these establish source routing only, never real AT presentation.

The fixed heading checkpoint also retains one
`headingFocusEventReceiptObserved` boolean from the same fresh private debug-log
slice already used for presentation checks. Installed Orca48's
`event_manager._ignore` logs `EVENT MANAGER:` plus the event before its ignore
decisions; its formatter includes focus-gained detail1 and the exact heading
role/name. A true match establishes that receipt marker was observed, not why
presentation succeeded or failed. False means only not observed in that slice;
it does not prove Orca never received the event. Raw lines remain private and
every native focus, fresh presentation and delivery assertion stays unchanged.

## Existing commands and dependencies for the next reviewed run

From the staged repository root, using the pinned Node24.22.1/Bun1.4.4 toolchain:

```
python3 -B -m unittest discover -s spikes/launcher/tests/at -p 'test_*.py' -v
node spikes/launcher/tests/at/xvfb-orca.ts --activation-help-only
LINUXCAST_PRIVATE_UI_DISPLAY=1 xvfb-run -a -s '-screen 0 1280x900x24 -nolisten tcp' node spikes/launcher/tests/activation-help-ui.ts
```

The first command is harmless local preparation. The last two require an
explicitly scheduled disposable Debian VM reservation and source review first;
this document grants no execution permission. Reuse installed Electron45,
Playwright/axe, Python3+GI/pyatspi/dbus, Orca48.1, AT-SPI registry,
Speech Dispatcher/dummy module, dbus-daemon/dbus-run-session, Xvfb/xauth and
xdotool. No package install, host service/policy change or new controller is
needed. Preserve the actual first outcome and copy the fixed public reports/
images before removing the owned stage. A failed assertion remains failed.
