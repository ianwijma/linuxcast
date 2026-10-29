# L2-06 — installed Dictionary base-entry application increment

Read docs/implementation/tasks/L2-06.md and PLAN/data/builtins/testing-release/
security/DESIGN/tokens normative references. Base develop0696e1d/PR69. Integrated
L1registry/D1host/sharedList/Form/clipboard/storage application paths are used;
full prerequisites/native desktop acceptance remain pending under user-approved
unfinished increments. Complete dictionary/Emoji/local1.0 scope is unchanged.

Dictionary command opens a shared List; first available installed language is
chosen, Choose language Form supports explicit read-only changes, and a selected
canonical source base entry has a separate explicit Copy word/manual-paste action.
No keystroke network, download, install, AI, generic filesystem API or full source
array in renderer. Definitions and full Hunspell affix/forbidden/compound checking
remain visibly unfinished; browsing source base entries is not spelling validation.
No installed language data is redistributed as project fixtures/artifacts.

Coordinator-owned packages/contracts/src/dictionary.ts is the wire contract:
- three named optional APIs searchDictionary/copyDictionaryWord/releaseDictionarySearch;
- search exact revision/query/optional languageId; reply requestedLanguageId echoes
  exact supplied ID or null, language object|null, at most64languages plus honest
  languagesTruncated, snapshotId|null, records<=100{id,word}, truncated;
- IDs language:<64lowerhexSHA256>, word:<64lowerhexSHA256>; snapshot64lowerhex;
  language names ASCIIbasenames<=64; fixedsafe messages<=512, encoding<=32;
- query512UTF16/2048UTF8/noCcCsBidi; words128Unicode scalars/512bytes/no whitespace/
  controls/bidi/unpairedsurrogate. Preserve source Unicode; no silent normalization;
- named Copy binds revision/searchId/query/languageId/snapshotId/id and returns same
  context+canonicalword/outcome only after existing clipboardwriter confirms;
- matching owned release invalidates only that search. Caller expiry/release never
  releases an actual dispatched clipboardwrite slot until underlying settlement.

Main: schema checks before dispatch, current owner/frame/visibility/catalogue/
metadata generation checks, fresh visibility authorization, latest issued choices,
bounded4actual reads/no queue, monotonic deadlines; Copy reserves global existing
busy lane synchronously, rechecks authorization before dispatch, no blind replay.
Search canonicalwords live only in trusted main installedreader and issued map.
Use missing/unsupported/invalid language guidance; never fake an empty available
source or successful missing backend. Aggregate usage only after confirmed Copy.
No query/word/sourcepath history/export/logging. All new storage source settings
are deferred, not simulated; no migration, newexternaldependency or privilege.

UI owner only dictionary presentation/tests/fixture/new affectedPNG/UI.md. Data
owner only installed.ts/installed.test.ts/HEADWORDS.md. Coordinator owns contracts,
manifest/lock/routing/main/preload/status/integration. Freeze patches with exact
owned/production hashes and evidence; independent review before prompt normalmerge.

Required bounded evidence: source/security/unit/controller/contract tests,
sharedkeyboard/Form/cancel/loading/empty/unavailable/unknown/dark/light/200%/axe,
actual registered app installedlanguage/search/explicitnativeCopy/Hide/restart/
usageprivacy and no implicit clipboard effect. Private Xvfb is not target Debian13
GNOME/KDE Wayland/X11/nativeAT/highcontrast/performance/package/release acceptance.
No full task criterion promoted without full evidence; unsupported paste fallback
and complete Hunspell/StarDict/semantic/full1.0 remain required later.
