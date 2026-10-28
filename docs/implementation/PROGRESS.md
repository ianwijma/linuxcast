# Coordinator checkpoint

Updated 29 October 2026. Goal unfinished; application work resumed: complete all 97 agreed local
1.0 tasks through R1-03 and all documented release gates. Objective attachment:
`/home/ian/.codex/attachments/78a55eec-f708-4e08-b951-d8db53af7f4f/goal-objective.md`.

## Constraints

All subagents GPT-6.1 SOL/high; reuse existing SOL agents, no Astra. Small reviewed,
tested application increments and prompt normal merges, explicit unfinished
acceptance. No infrastructure/research/proof expansion for manifest_review_sol.
Complete scope/security/dependencies/native/AT/performance/release gates remain.
No task-choice questions. Existing unchanged 1Password signing works after user
unlock. No physical input/device authorization; actual app checks use owned
private Xvfb/profile only. No user display, --no-sandbox, or credential changes.

## Integrated base

Primary clean develop7aa0d91c8a8c9624c9689fc5101a7f9e0af5fdf6 (PR52).
Exact signed independently reconciledheadb012c84d94f9845f615b41096fc938d67781615c,
CI40436099692 validatePASS14s; no requested GitHub reviews/comments/threads.
Normal exactheadmerge27October2026; frozeninstall/build66assets pass.
Remote rechecked29October: unchangeddevelop, no openPRs.

Recent merged application increments (full evidence in registry/cards/artifacts):
- PR49 https://github.com/ianwijma/linuxcast/pull/49: saved path argument,
  empty Form→exact encoded Review→separate real native browser Open; migration012.
  Source53bb3a9/97e6eed, UI38738f4(authorc68e1264), actualb73ef0b. PASS323units/
  15contracts/49security/45integration(actual13.57s),93targeted/43F2storage;
  author230presentation/52Chromium;12component/fouractualcaptures independently
  clean. Reentrant pending-publication Save/Open P2 fixed. Full task unfinished.
- PR48 https://github.com/ianwijma/linuxcast/pull/48: selected private0600 native
  unencrypted JSON export and required shared IME guard; merge64e9fda.
- PR47 https://github.com/ianwijma/linuxcast/pull/47: root saved-link name/host/tag
  search, exact entry selection and separate Open; merge3a42f93.
- PR46 https://github.com/ianwijma/linuxcast/pull/46: persistent pin/hide and
  empty-state recovery; mergee5da4f8. PR45a44bbe6 tags; PR44e2dec5a8 workflow
  Keyword commands; PR43 actual workflow run/approval/copy/journal; PR42draft
  editor; PR41websearches; PR40literal links. All explicitly unfinished increments.

## Current reviewed application increment: explicit saved-search fallback

Root isolated `.worktrees/linuxcast-application-controls`, branch
`codex/launcher-web-search-fallback` fromf79a345. Freeze9f09aa4, UI d22f1e6
(signed authorc715b6f), actual62eaaee. No new API/migration/process/dependency.
Metadata has only optional literaltrue quicklink.webSearch; no target/query/config.
Unmatched valid root query offers shown/enabled saved search providers only.
Deliberate Search with provider→fresh exact ID/revision/kind→prefilledQuery→local
Review→separate native Open. Ordinary saved entries still start empty. Synthetic
fallback IDs never reach generic Execute/preferences. Cancel/List/Back restore
root query/selection; hidden/stale/converted/unknown/manualReload and original
context fences retained. No browser/network/copy/save/use before explicit Open.

PASS mappedL1:241units/12contracts/114security; mappedL2:361units/16contracts/
50security/45integration(actual16.52s). Suites overlap. Focused403=251presentation+
27routing+125controller; full68launcherChromiumkeyboard/axe including7new. Actual
sandboxed Electron/GIO/privateXvfb verifies saved config→unmatchedUnicode/metachar
rootquery→explicitchoice/prefill→Cancel/List/Back restoration→heldEnterReview(no
Open)→separate exact encoded real browser argv+empty stdin; private export
excludes transient query/target, retained path/prefs/restart/aggregate privacy pass.
Tencomponent/sixactual affected captures independently clean. Type/scopedlint/
plan/diff pass. Exact UI code/tests/fixtures/captures matchauthorc715b6f; rootREADME
only corrects final count breakdown. Independent metadata/UI/exactactual reviews
clean. Converted-kind Reload and reentrant successful-publication/newerReload
findings fixed with meaningful regressions. No pending source finding.

Evidence `apps/desktop/evidence/launcher-web-search-fallback-application.md`.
PR50 https://github.com/ianwijma/linuxcast/pull/50 mergedb72d364 as above. Clean
primary frozen install/production build66assets pass. No pending review/CI/signing
blocker; full task/native acceptance unclaimed.

## Current reviewed application increment: local calculator query result

Root `.worktrees/linuxcast-application-controls`, branch
`codex/launcher-calculator-query` fromb72d364. Freezececb394/03eb428, UI904a16c
(signed author8ac184b), actualb6cd69b. Existing pure evaluator/formatter offers
one local canonical result for explicitly mathematical successful unmatchedquery,
shown/enabled Calculator only. Ordinary words/constants/invalid/matchingcommands
retain search behavior; stable syntheticID cannot Execute/preferences/persist.
Deliberate choice reevaluates→existingResult, separate expression-only Copy API
mainrecomputes canonical text. No new grammar/API/dependency/migration/service/
research/proof. Edit/Cancelrootquery+selectionrestore, Hideclear, genericempty;
origin/immediate post-publication Copy guards close stale/reentrant effects.

PASS mappedL1:269units; L2:628units/4contracts/74security/1actualproduction8.15s.
Author262focused,8newrootChromium+29retainedCalculatorChromium pass. Native
independent xclip confirms root42/7000m/HSL and8retainedcopies, noCopy fromtyping/
heldEnter/choice, Edit/Cancel, Hide/reopen/noreplay/genericblank; owneraggregate
count11/allowlistedexportkeys/noexpressions/results. Firstactual assertion matched
retainedroot+Detailtextcount2; scoped visibleDetail only and finalmappedpass.
Twelvecomponent/fouractualcaptures independentclean; type/scopedlint/plan/diff
pass. UIcode/tests/fixtures/README/captures exactauthor. Independent signedUI/
exactintegratedactual review clean atb6cd69b; no pending source findings.
Evidence apps/desktop/evidence/launcher-calculator-query-application.md.

PR51 https://github.com/ianwijma/linuxcast/pull/51 merged4612ec0 as above, clean
primary frozeninstall/build66assets pass. Full dates/DST/rates/providers/
prerequisites/nativeAT/release remain pending.

## Current reviewed application increment: explicit zoned date/time

Root `.worktrees/linuxcast-application-controls`, branch
`codex/calculator-zoned-datetime` from4612ec0, signed core/freeze76d4121.
Historical-offset P2 fix staged in DATE-TIMES.md/src/date-times.ts/tests; exact
object source offset matching and exact target localfields+offset+zone avoid
Temporal minute-rounding compatibility. Three Paris regressions;119targeted/
type/lint pass, file_search re-review closes P2, no further finding.

Reviewed author UI integrated exactly from staged binary patch SHA256
`d0942a065024c86acef1a99e629661911f02bac11ce6b142f478c998ab6626ad`.
Original patch `/tmp/linuxcast-date-time-ui-owned.patch`, byte hashes
`/tmp/linuxcast-date-time-ui-owned-hashes.json`. Owned20paths only, source stable.
Existing Form/rootResult/Supported date-time help/error recovery/exclusiveReceipt
UI; no additional infrastructure/research/proof. Fullscope remains unchanged.

PASS final706mappedL2units/5contracts/77security, fulltype/scopedlint/diff.
Author136focused/39calculatorChromium+1rootcase pass;11componentcaptures clean.
Actual sandboxed production/privateXvfb/native xclip10.89s PASS: rootSydney
previousdayUTC, bothNYfolds, historicalParis exactseconds, fourrefusals/manualhelp/
draftfocus/heldEnter/Hide/reopen; all11retainedcopies+4dates=15. Realownerexport
count15/allowlistedkeys/noexpressions/results. Electron45.0.0/ICU78.2/tz2026e;
unitNode24.22.1/ICU78.3/tz2026e. Sixactualcaptures root+alias independently clean.
Incidental oldtrackedcapture churn restored only. Exactactualtestsource clean.
Evidence `apps/desktop/evidence/calculator-datetime-application.md`.
Registry/card partialevidence appended; plan/statuspass, AC02/UI remainpending.

## Current required application increment: calendar/elapsed arithmetic

Root `.worktrees/linuxcast-application-controls`, branch
`codex/calculator-calendar-arithmetic` frommergedPR52/7aa0d91. DATE-DURATIONS.md
freezes bounded oneISOduration +/-, calendarY/M/W/D first with overflowreject and
no implicit missing/repeated calendarresult, then exactelapsedH/M/S/fractions.
Existing zonedresult/receipt/request unchanged. Two fixed localfailurecodes.
No new IPC/dependency/migration/process/research/proof. Fullscope unchanged.

Root core125datefixtures+66maincopychecks=191focusedPASS, fulltype/scopedlint/diff
PASS after adding newcodes to evaluator's closedmessage table. Existing50date
cases retained. Newcases fixedspring/fallday-vs24h, subtraction, LordHowe30min,
foldsourceidentity/elapsedfold, mixedfields/months/leap/nanosecond/large/refusal/
limits; mainrecomputes exactoutput, errors noCopy/use. UI/actualproduction notyet
implemented/accepted. Core signing/freeze next; reviewfile_search assigned.

PR52 integratedsource/evidence complete as above; historicalP2closed at2c08f6e.
Prior signererrors resolved after userunlock; normal signing unchanged. No live
signing oractualtest sessions. Corechecksession57503 completed, no reruns needed.
Next signedcore→author UI→reviewed integration→actualnativecopy→focusedPR/CI/merge.

## Agents

All GPT-6.1 SOL/high, reuse existingagents only:
- manifest_review_sol: bounded L2-04/L1-01 calendar/elapsedUI assignment sent;
  `.worktrees/linuxcast-l1-01`, newbranch`codex/l2-04-calendar-arithmetic-ui`
  from7aa0d91 after verifying/preserving then removing ONLY already-integrated
 20fileoldstagedpatch. Own calculatorpresentation/fixtures/tests/README/evidence
 +necessaryexistinglaunchertests/fixtures/README/evidence only; no sharedfiles.
  Existing Form/rootResult/Detail/Supporteddatehelp/Edit/separateCopy, relevant
  recovery/keyboard/200%/axe/darklight. Root tosend signedcoreSHA; noinfra/proof.
- file_search_service_sol: independent bounded arithmeticcore source review
  assigned, no edits/research/broadreruns. Fullacceptance/nativeUI unclaimed.
- alias_review_sol: PR52 exactsignedtree+20hashes/actualsource/17captures clean;
  idle pending newUI source/capture review when authorready.

## Acceptance and runtime

Registry8done/18in-progress/71planned;56passed/325pending/8not-applicable. No fully
accepted ready tasks. Approved unfinished increments do not waive dependencies.
Full asynchronous providers/file/AI fallback/ranking and documented context/
placeholder/argument/target/browser/open-with flows remain required; native Debian
GNOME/KDE Wayland/X11, AT/performance/packages/release gates stay pending. No MVP.

PATH `.worktrees/tools:$PATH`, BUN_TMPDIR=/tmp; Node24.22.1/Bun1.4.4/Electron45/
SQLite3.53.4/GIO2.72.4. Escalation required for Git signing/network/private app and
abstract owner sockets (ordinary sandbox EPERM is not a regression). Mapped runner
takes one task ID; targeted LINUXCAST_TEST_FILES is JSON. Serialize actual tests
sharing dist. No live root test handles. Historical native lab remains stopped;
no new device/VM/proof work. See Git/registry/evidence for earlier acceptance.
