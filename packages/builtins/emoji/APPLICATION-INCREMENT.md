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

## Next bounded increment — skin-tone selection, base PR67

Coordinator codex/emoji-tone reuses .worktrees/linuxcast-emoji-search, base981d4b2.
Existing catalogue/data assets stay unchanged; no infrastructure/research/proof.
Optional `tone` on search/copy input and success values is a closed enum:
unmodified, light, medium-light, medium, medium-dark, dark. Omitted meansAll tones;
no null or all token on wire. All replies echo presence/value exactly. Search
filters BEFORE limit/ranking; unmodified means no U+1F3FB..1F3FF; each other choice
means CONTAINS that selected modifier (mixed-tone sequences may match multiple
choices). Use canonical source sequences, never synthesize modifier variants.
Contracts export EmojiTone/emojiToneSchema/emojiMatchesTone helper. Main issued
search/copy/preload exactbinding includes tone; wrong/missing/extra echo never
authorizes effect or success. Existing query/group/lifetime/heldslot/noReplay
semantics remain. New source API searchEmoji({query,group?,tone?,limit?}).

UI adds shared Skin tone enum Form via Choose skin tone action; optionsAll tones,
Unmodified, Light, Medium-light, Medium, Medium-dark, Dark. Explain it filters
sequences containing chosen modifier. Apply retains query/category/density,
invalidates/releases old handle, reloads read only and retains selection only if
still present; Cancel/Escape changes nothing. No automatic Copy/Paste. Active
filter visible in Grid/status; All restores mixed/all sequences. Form lifecycle
same maxdepth as category; Hide/pop/dispose/reopen clearsfilters. No persistence,
newtable/preferences,downloads,providerrequests or fabricated Unicode.

UI owns presentation/tests/fixtures/newtonecaptures+TONE-UI.md; data owns only
src/search.ts/tests/search.test.ts and README smalladdendum; boundary lane only
existing emoji contract/main/preload tests. Coordinator owns allshared changes,
actualapp integration/routingtests/mapping/status. Freeze patch+perfilehashes;
meaningful tests dark/light/keyboard/Cancel/Apply/empty/pending/stale tone/malformed
echo/currentcanonicalCopy. FullL2-06/dictionary/favourites/nativepaste/nativeAT/
Debian/release remain pending.

## Persistent favourites increment — base PR68/6227ef0

Coordinator codex/emoji-favourites in .worktrees/linuxcast-emoji-search. Reuse
existing revisioned StorageOwner settings (`emoji.favourites` canonical JSON
sorted uniqueID array, max4096 supports entire3944catalogue); no migration/table/
dataset/deps. Privateuserpreference exported through existingexplicitsettings
export, never usage/queryhistory. Absentsetting genuinelymeansrevision0/empty;
unavailable/invalidstore mustneverbeempty-success. MainonlyresolvescanonicalIDs.

Frozencontracts emoji.ts: search/copy input+reply optional `favouritesOnly:true`
(omit=All; false/null/ownundefinedinvalid); exactecho. Search success optional
`favourites:{available:true,revision:number>=0}|{available:false}`; missing means
unavailable for compatibility. Ifavailable, each returnedrecord hasboolean
`favourite`; ifunavailable/missing no favouritefield and no write/filteravailable.
FavouritesOnly successrequiresavailable and onlytruefavourite records; otherwise
failedrequest, never pretendempty. Groups/rowcap100/sourcecanonicaldata unchanged.

New optional named `setEmojiFavourite` takes Copy input context +`favourite:boolean`
and`favouritesRevision` from currentsearch. Newfixedchannel launcher:set-emoji-favourite.
Receipt exactcontext+id+desiredboolean+`outcome:updated`+`favouritesRevision=old+1`.
No fullpreferenceIDs returned to renderer. Main bindsissuedchoiceowner/frame/
catalogue/query/group/tone/favouritesOnly/prefrevision; verifiescanonicalcurrent
row andfreshpreferenceCAS, holdsactualwriterbusy untilunderlyingstorage settles,
reauthorizes beforedispatch; stale/released/cancelledpre-dispatch hasnoeffect.
Late/unknownwrite never success/replay, requiresfreshread. Successinvalidatesold
handle and UI readreloads; never automaticCopy/Paste or usageincrement. Existing
Copy and favourite writes serialize against eachother and metadata.

Mainbackendsearchinternal accepts optional `ids:readonlystring[]` ONLY for main
resolvedfavourites, validatedstrict/sortedunique/4096; filterBEFOREcap/rank in
source search. Omittedall; []genuinelyempty; never inputrecordpayload fromrenderer.
Source data/metadata unchanged. Main backend optionalfavourites.read/write use
Snapshot{revision,ids}; settingsCAS/writeexactreceipts; storageclient validates
newsettingid/value/revision. No genericsettings method exposedinpreload.

UI per-row Add to favourites / Remove from favourites (effectwrite); top-level
Show favourites / Show all emoji (effectread) retainsquery/category/tone/density,
releasesoldsearch+readreloads andkeepsselectedID ifstillpresent. Clearlymark
Favourite usingexistingaccessory/tag; no visualsystem. Copy staysprimaryEnter;
favouritechange onlyexplicitActionsselection. Emptyfavourites actionableShow all.
Unavailablefaves keepsordinarycataloguebrowsable/Copy and explainsstorage/reload;
filters/write disabledvisibly. Successreceipt shows exactname+savedstate after
readrefresh; uncertainmutationnooptimisticstar andno repeated/queued/auto write.
Guardpendingactualmutation acrossquery/pop/Hide/dispose/lateack; resetfilteronopen;
persistidsafterrestart. Category/tone/density neverimplyfavouritechange.

Ownership: UI ONLYpresentation/tests/fixtures/new*favourite*.png/FAVOURITES-UI.md;
data ONLYsearch.ts/search.test.ts/READMEaddendum; independenttestlane ONLYexisting
emoji contracts/main/preload/api tests +newstoragefavourites tests. Coordinator
allproductionstorage/contracts/main/preload/manifests/routing/status/actualapp.
ReadfullL2-06card+PLAN/data/builtins/security/testing-release/DESIGN/tokens; prior
actualL1/D1/storageintegratedbutcompleteacceptancepending userapprovedincrements.
AllagentsSOL/high. Freezeownedpatch/hashes/results/platform/limits, no stage/commit.
No infrastructure/research/proof expansion. FullL2-06/dictionary/customkeywords/
frecency/nativepaste/semanticAI/nativeDebianAT/platform/release remainrequired.
