# L2-06 — configured local definitions application increment

Base PR70/develop13d8eb6. Read complete task card/normative PLAN/data/builtins/
security/testing-release/DESIGN/tokens. Integrated L1/D1/storage/root paths are
used; full prerequisite/native acceptance pending under authorized unfinished
increments. Complete Hunspell/StarDict/Emoji/local1.0 scope remains required.

Existing Dictionary installed-entry List gains Local definitions. The nested
shared List searches one explicitly configured local StarDict source; primary
Read definition opens shared Detail. Native Choose source + confirmation records
an existing settingsCAS preference, no renderer path or direct filesystem grant.
Forget source clears only configuration, never source files. Query/selection/
Back/Hide/reset/restart, missing/unavailable/changed/unsupported source guidance
are required. No definition Copy is added; existing installed-entry Copy remains.

Coordinator owns packages/contracts/src/dictionary-definitions.ts wire contract,
private existing settings key dictionary.definitionSource (canonical JSON config
or null), native dialogs, main/preload/root/storage/integration/status. Private
ifoPath is never in renderer replies or ordinary settings exports; Forget provides
removal. No new migration/table/dependency/download/format importer/plugin.

Four optional named APIs: searchDictionaryDefinitions({revision,query}) returns
issuedsearch context, preference revision/sourceState/publicsource|null and<=100
opaqueentry rows; readDictionaryDefinition binds fullissuedcontext+sourceID/
snapshot/entry and returns exactword+<=32plaintextparts/64KiBtotal; configure binds
issuedcontext+actionchoose|forget and returns exactold/newCAS revisions with
configured/forgotten/cancelled; matching release invalidates only its handle.
Only trusted main receives the chosen .ifo path; native confirmation sees public
source metadata and explicitly selects Use source. Cancellation changes nothing.
Main reserves actual dialogs/writes through underlying settlement, exactcontext/
visibility/currentpreference/source checks, monotonic deadlines/noreplay. Reads
have bounded actual slots; no late definition publishes into another frame.

Reader ownership only stardict.ts/stardict.test.ts/STARDICT.md. File-local source
interface: openStarDictSource({ifoPath})->metadata{id,name,wordCount,snapshotId},
search({query})->{query,records:[{id,word}]<=100,truncated},definition({id})->{id,
word,parts:[{kind:meaning|phonetic,text}]},close(). Fixed exact paired files of
selected real directory; descriptor/race/byte/decompression/offset/Unicode checks;
no directory crawl/resources/execution/network. Primary format reference:
https://github.com/huzheng001/stardict-3/blob/master/dict/doc/StarDictFileFormat .
Supported plain UTF8 meaning/phonetic fields; unsupported markup/media/tree/
locale encoding/synonyms explicit, complete support remains unfinished.

UI ownership dictionary definitions.ts/presentation wrapper/tests/newfixture/
DEFINITIONS-UI.md/8NEWdefinitioncaptures. Shared List/Detail/host tokens only;
render definition content literally (escape all Markdown punctuation, no active
source HTML/links/images/instructions). Paginate long text without dropping data;
12000 Unicode scalar chunks keep escaped Markdown below64KiB shared text limit.
Show PageNofM with read-only Next/Previous. Enter on list Read definition;
CtrlEnter read-only Back. Choose/Forget only explicit Actions, no key inference.
Source path never enters fixture UI/diagnostics. Existing baseflow APIs/fixtures
remain usable with unavailable optional definition methods; no historical PNG
churn. Fullchecking unavailable remains visible; baseflow should refer to Local
 definitions when APIs exist instead of claiming definitions are unimplemented.

Meaningful boundary/unit/storage/UI +actualproduction config/search/read/Back/
Hide/restart/forget/sourcechange/usageprivacy checks and affected dark/light/200%
images. Public authored fixtures only; injected native-dialog answers are labeled
synthetic consent, not real OS/native acceptance. No silent success for unavailable
or unconfigured source. Full task/nativeAT/Debianmatrix/release gates pending.
