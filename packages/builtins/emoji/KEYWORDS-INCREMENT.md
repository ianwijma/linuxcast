# L2-06 — local custom Emoji keyword application increment

Based on integrated PR69 favourites / PR70 develop13d8eb6, independent of staged
Dictionary definitions awaiting normal user-side signing. Full local1.0 scope,
task dependencies and acceptance remain unchanged. Read PLAN, complete L2-06 card,
data/security/builtins/testing-release/DESIGN/tokens before edits.

Open registered Emoji, choose a canonical entry, explicitly Edit search keywords
in Actions. Shared Form has one multiline field, one phrase per line; trim each
line explicitly in UI with disclosure, omit blank lines, retain exact phrase text
otherwise. Up to16 unique phrases, each64 Unicode scalars/256UTF8 bytes; ordinary
spaces allowed, no controls/bidi/surrogates, leading/trailing whitespace or empty/
punctuation-only phrases. Save replaces the selected entry's full list; empty list
removes its custom keywords. Cancel/Escape does not write. Preserve Grid query,
category/tone/density/selection; after confirmed Save release old handle and search
fresh. Only exact next preference revision + source-confirmed selected keyword list
may show named success. Unknown writes require deliberate fresh read; no optimistic
success or replay. Actual promise remains fenced after timer/navigation until
settlement; Copy/favourite/another keyword Save must not race it. Hide resets Form
and transient state; restart keeps local keywords. Keyword edits/queries/Forms
never copy or count usage; only separate explicit canonical Copy uses clipboard.

Coordinator owns contracts/storage/main/preload/root/status/manifests. Contracts
are packages/contracts/src/emoji.ts exported through existing index. New optional
search metadata keywords:{available:true,revision}|{available:false}; available
records have customKeywords:string[] (empty allowed), absent otherwise. Old mocks
without keywords remain supported with Edit visibly disabled. Existing search/copy/
favourite/release input shapes stay intact. Optional setEmojiKeywords takes same
exact selected search context as copy + keywords:string[] + keywordsRevision;
reply echoes context/id/keywords and exact next keywordsRevision. Named channel
launcher:set-emoji-keywords. No generic storage/path/IPC exposed to renderer.

Private existing setting emoji.keywords holds canonical JSON sorted array of
{id,keywords}; omit empty lists, <=4096 entries and512KiB encoded total. IDs must
resolve to real source entries in main. Existing settingsCAS only, no table/schema/
migration/dependency or dataset addition. No setting in ordinary export allowlist;
explicit edits can clear data; encrypted complete-backup coverage remains pending.
No user keywords/query text in diagnostics, aggregate usage, fixtures or screenshots
except clearly authored public examples. Storage unavailable disables keyword
operations and discloses that custom keyword matching is unavailable; ordinary
public search/Copy may remain useful.

Internal main-owned searchEmoji input gains customKeywords?:readonly
{id:string,keywords:readonly string[]}[]; never renderer input. Validate bounded
plain canonical entries/getters/ownundefined/knownIDs before normalization. Merge
custom phrase words/phrases with public aliases before filtering/ranking/capping;
all query terms match across name/aliases/source keywords/custom phrases. Exact
custom phrase ranks with exact source keywords; preserve pinned source order ties.
Do not mutate canonical dataset/Unicode or synthesize variants. Existing group/
tone/favourite filters apply before cap; custom keyword can match any of3944 IDs.

Search/main issuer stores exact keyword snapshot; fresh CAS revision/content and
canonical row identity checks before issuing search and before explicit Copy/
favourite/keyword effects reject stale matching context. Synchronous global effect
reservation and four actual read slots/deadlines remain. Keyword updates validate
full stored snapshot, exact current selected context, newer canonical source and
exact persisted revision/value. No write auto-retry.

Bounded meaningful reader/search + contract/main/preload/storage + controller/
component checks, dark/light affected Form/Grid/error/200% captures, then actual
production app edit/search/Copy/Cancel/Hide/restart/remove/privacy evidence. Native
AT/Debian GNOME/KDE Wayland/X11/fulltask/release gates stay pending. No infrastructure,
research or standalone proof PR.
