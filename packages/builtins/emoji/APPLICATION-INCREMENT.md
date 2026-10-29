# L2-06 — registered offline Emoji search and explicit Copy

Base PR66/develop42afa6ba397f77f079fc057ac2c2f9f3d08d87cc. Read full task
 docs/implementation/tasks/L2-06.md, PLAN.md, normative data.md/builtins.md/
 testing-release.md/security.md and DESIGN.md/tokens. Actual integrated L1registry,
 shared D1ViewSession/renderer/Grid and fixed clipboardwriter reused. Full L1/D1/
 nativeAT acceptance pending under approved unfinished application increments.
 Full dictionary/Emoji/full1.0 remains required, no separate foundation/proofPR.

Coordinator frozen packages/contracts/src/emoji.ts:
- named optional EmojiApi.searchEmoji({revision,query,group?}) -> closed reply with
  value {revision,searchId,datasetVersion:'17.0',query,group:null|string,groups:
  [{id,name,count}]<=16,records:[{id,value,name,group,subgroup,version}]<=100}.
- query<=512UTF16units/2048UTF8bytes, noCc/Cs/BidiControl, tested beforeencoding;
  group exact officialgroup<=96bytes; IDs emoji:<lowercase4..6digitcodepoints>.
  Canonical sequence source tokens minimum4digitpadding; retain exact VS16/ZWJ/
  modifiers/tags. Only main imports full offline dataset; renderer gets bounded
  metadata. Search local only, never provider/network/history/logs.
- copyEmoji({revision,searchId,query,group?,id}) returns {ok:true,value:{outcome:
  'copied',revision,searchId,query,group:null|string,id,value}} only on confirmed
  exact canonical clipboardwriter outcome. Main resolves ID; no caller clipboard
  text, provider request, arbitrary command/path/SQL/permissions. Source issued
  newest search choices bind current owner/frame/catalogue/metadata generation.
- releaseEmojiSearch({revision,searchId}) -> {ok:true,value:{outcome:'released',
  searchId}}. Only matching owned handle is invalidated; stale release cannot
  invalidate a newer search. Pop/dispose/queryreplacement release old search,
  including late valid search reply after UI lifetime ends. Release/caller deadline
  never releases an actual dispatched clipboardwrite slot before backendsettles.
- Shared host icon adds bounded {kind:'glyph',value:string} inerttext only using
  existing Grid/token icon sizing; no custom feature visualsystem or remoteassets.
  Coordinator owns shared contracts/renderer change, not feature lane.

Actual flow: registered fixed linuxcast:emoji -> shared nested Grid title Emoji,
 initial load real100boundedresults -> type local search/category -> stable Arrow
 selection -> explicit Copy emoji -> real clipboard readback receipt. Copy only,
 no automatic insertion/paste. Missing clipboard or denied/unsupported explains
 manual recovery; never label Copy as Paste. Grid cap100/refine search disclosed.
 Category chooser and comfortable/compact density use shared Form/Actions/Grid;
 no new controls/visualsystem. Existing shared Esc actionpanel/back/root dismissal.

UI class EmojiFlow({session,api,viewId,revision}) in owned src/presentation.ts;
 methods open(fromViewId), query(viewId,query), handle(intent), closed(viewId):bool,
 dispose(); getters active, owns(viewId). Parent coordinator owns launcher hooks.
 Use current frame/revision/item/query/generation and original root selection/
 query/lifetime guards on every async boundary; reserve explicitCopy synchronously
 before callbacks. Repeated Enter cannot dispatch twice. Never copy on search,
 selection, opening, reload, initial mount or cancel. While pending prevent newcopy
 and queueing; popping releases context, no late toast/Hide/replay. Unknown copy
 keeps visible explicit recovery, requires deliberate Reload/newsearch before new
 explicitCopy; fresh read never automatically copies. Stale/invalid receipt doesn't
 claim success. Successful Copy stays in Grid, displays actual name/copy fallback,
 no automatic Hide needed. Group/settings cancel preserves query/selection.

Owned paths: data lane ONLY data/,src/data.ts,src/search.ts,tests/search.test.ts,
README.md. UI lane ONLY src/presentation.ts, tests/presentation.test.ts,
tests/emoji.ui.test.ts, fixtures/,evidence/,UI.md. No stage/commits. No shared
contracts/manifests/lock/registry/routing/renderer edits by featureagents. Coordinator
owns main/preload/registry/actualproduction/checks/routing and final integration.
UI fixtures contain small public examples and fake transport labelled synthetic;
production must use full3944 licenseddata, not fixturedata.

Evidence: meaningful lifecycle/generation/query/category/selection/exactreceipt/
 unknown/late/dispose/release/denial/unavailable/bounds/keyboard regressions; actual
 shared Grid dark/light/loading/empty/error/pending/unknown/unavailable/200percent
 captures inspected and browser/axe. Coordinator actualregisteredlauncher/search/
 Unicodecopy-readback/category/back/Hide/reopen/privacy plus independentreviews.
 No browser/privateXvfb=>Debian13GNOME/KDE Wayland/X11/Orca/highcontrast claim.
 Keep all fulltask criteria pending until complete required evidence exists.
