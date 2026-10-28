# Explicit Copy text from an indexed file preview

L2-03/L2-02 bounded reviewed/tested unfinished application increment,
29October2026. Based on mergedPR55/develop26c54818. Full tasks, prerequisites,
security, nativeOpen, desktop/AT/performance/package/release remain unfinished.

## Behaviour and boundary

Registered File search → selected file → explicit Preview text → sharedreadonly
literal Text → deliberate Copy text in Actions. PrimaryBack remains; no Copy
onload/query/theme/heldEnter/Back and no automaticretry. Emptytext Copy explicitly
clearsclipboard. Main copies exactly issued preview content; no newsource read.
Knownfailures permit deliberate retry. Malformed/mismatched/rejected/timeout
receipts require checkingclipboard, never replay automatically. PendingBack
and sourceinvalidation preserve unknownoutcome warning; no late success relabels
another view or reverses a write.

NamedAPI takes result/root/generation plus unpredictable previewId only, no
callertext/path/URL/format/options or clipboardcontent in receipt. Main holds
atmostone64KiB preview in memory for5monotonicminutes and exactownedwindow/query/
admittedrow/root context. Query/service/root/windowclose/newpreview/dispose/expiry
clear it. DisplayedUItext clears onBack; mainlease has this separate bounded
lifetime. No contentcache/disk/history/log/network/migration/dependency/native
reader changes. Existingnativeclipboardwriter uses sharedsinglependinggate;
4sreceipt retainsactualslotuntilsettlement, no newwrite afterexpiredpreflight,
postawait fences success. Same deadline repair applies to retainedCopy path.

## Validation and real application evidence

- `bun run test:unit -- L2-03`:232PASS (121controller,29PathCopy presentation,
  3sharedclipboardwriter,79ownednative-transport fixtures).
- `bun run test:contracts -- L2-03`:7PASS.
- `bun run test:security -- L2-03`:85PASS (24newpreviewcopy,28previewread,
  9pathcopy,13fileIPC,11preload).
- Exact UIauthor7bfed5c2:150focusedunits and57Chromiumkeyboard/axePASS
  (47File search including10newCopy cases,10PathCopy). Seven new public affected
  light/dark copied/pending/denied/unknown/missingAPI/empty captures inspected.
- Fulltypecheck/scopedESLint/plan/diffPASS. Productionbuild66assetsPASS.
  Native reader is unchanged; PR55platform20checks remain inherited evidence,
  not a new run or new desktop proof.
- `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a bun run test:integration -- L2-03`:
  actualproduction16.02sPASS; duration is smoke evidence, not a performance gate.
  SandboxedElectron45, actualRust selected-root reader/inotify/sole-ownerSQLite,
  realclipboard writes and independentxclip readback of literalUnicode/Markdown/
  script-looking public text. Source preview is read once before each deliberate
  Copy sequence. Copying while a pausedsource changes still copies exactdisplayed
  snapshot; returning and previewing changedmetadata refuses. Clipboard remains
  unchanged before explicitCopy; unsupported sessionhint branch does not write,
  restoration requires another deliberateCopy. Real processrestart and indexclear
  discard loadedUItext and reject savedcopytoken; sourcebytes remain unchanged.
  Emptyfile Copy is explicit: Electron45 read()/types/readText() show no content,
  and nativeX11TARGETS shows metadataonly or no offered target. A clearedclipboard
  does not offer a zero-lengthSTRING target; no failing xclip read is treated as
  successful text readback. Existing filters/Browse/Copy path/watch/removal/
  Quitwithwatcher flow passes. Only chooser/confirmation choices and unsupported
  sessionhint are instrumented; source reads, owner andclipboard are production.

Initialharness assumed the first ambiguous empty query result was the file,
then assumed emptyCopy leaves a STRING target and used a removed Electron
format API. Corrected to explicitfileselection and actual Electron45 read/type
plus nativeTARGETS checks. No productionworkaround; finalrun passes.

## Review and design

Freeze0b1b55c/PREVIEW-COPY-INCREMENT.md; main/preload4e2588a, mocktype/actual
scenario221b3d8; author7bfed5c23cad2f2be0a0f1983d7281593891fb5c integrated
03e49d7ea7e0214c11379b1931d44145c66ecf1f. Independent serviceagent coreclean.
Independent UIreview P2disposal reentry fixed: inactive/disposed before any
pop/publication, pendingwarning separately projected whileinactive. Two direct
synchronous reentryregressions pass with no newread/write/Textframe. Exactowned
UItree and seven captures independently reconciled clean. Final actualtest/
fiveactual captures reviewed separately before merge. All agents SOL6.1/high.

DESIGN.md Shell/navigation, Results/actions, Views/states/accessibility and
tokens.json; shared readonlyText/session/controls, no CSS or sharedhost changes.
ReadonlyText focusesBack: CtrlEnter from that button retains current host
semantics; explicit Actions / Copy text is supported. Component captures:
file-search/evidence/*preview-copy*.png, *preview-text-copied.png and
light-preview-empty-copied.png. Five actual public captures:
universal-actions/evidence/application-dark-preview-text-copied.png,
application-light-preview-text-copied.png, application-preview-copy-unavailable.png,
application-paused-preview-snapshot-copy.png, application-empty-preview-copy.png.
Unrelated screenshot churn restored. No personaldata/credentials in evidence.

## Remaining acceptance

Partial L2-03 AC01/AC02/UI/privacy only; no fulltask completion. Broader typed
actions/multifilebuffer/large-text/otherpreviews/open/open-with/reveal/move/rename/
trash/conflicts/terminal/paste remain; L2-02 extraction/MIME/recent/optin work
remains. NativeOpen branch8fdc37d stays preserved unavailable/unmerged due
unsafe downstream pathname handoff; no safeOpen success claimed or substituted.
Debian13GNOME/KDEWayland/X11, real native dialogs, nativeAT/200%actualElectron,
installedpackage/performance/broader prerequisite/release acceptance remain.
DevelopmentNode24.22.1/Bun1.4.4/Electron45/SQLite3.53.4/privateXvfbX11 smoke
evidence does not establish those supported matrix gates.
