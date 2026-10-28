# Bounded indexed text preview — L2-03 / L2-02 integration

Frozen coordinator interface, 29 October 2026. Based on PR54 develop. This is a
required read-only application increment; it does not replace native Open.
Open branch codex/indexed-file-open at 8fdc37d is preserved, unavailable and
unmerged because downstream document-portal consumers can reopen host paths.

## Interface and ownership

FileSearchApi.previewText?(selection: {resultId,rootId,generation}) returns strict
IndexedTextPreviewReply: {ok:true,value:{outcome:'previewed',resultId,rootId,
generation,text}} or safe RpcFailure. Named channel file-search:preview-text.
No caller path/URI/MIME/argv/options. Main requires exactly one admitted current
file result in the visible owned workspace, refreshes selected root state before
read and before publication, and fences query/root/owner changes. One pending
read per workspace, deadline four seconds; backend slot retained until settlement.
No retry/replay, logging, content indexing, history, storage or mutation.

Main-only existing applications helper operation preview-text receives
{protocolVersion:1,operation:'preview-text',rootPath,relativePath,size,modifiedMs}.
Reply {protocolVersion:1,ok:true,value:{outcome:'previewed',text}} or existing
applicationFailureSchema (invalid-request / unavailable / stale-application).
Transport uses its existing 2.5 second process deadline, no shell/new service.

Native: root descriptor from / with openat2 BENEATH/NO_SYMLINKS; selected relative
file openat2 BENEATH/NO_SYMLINKS/NO_XDEV, O_RDONLY|O_NONBLOCK|O_NOFOLLOW.
No fallback/reopen/path handoff. Regular non-executable files only, case-insensitive
.txt/.text/.md/.csv/.json/.log extension allowlist (plain-text presentation only);
maximum64KiB, UTF-8 only, reject NUL/other C0 except TAB/LF/CR and DEL. Native
checks expected indexed size/mtime milliseconds, then exact fd metadata
(dev/ino/size/mtime_ns/ctime_ns) before/after bounded read; rejects changed data.
No parsing/Markdown execution/network/external application/cache. Symlink and
rename tests, large/binary/invalid UTF8/FIFO refusal and unchanged sources required.

## Application lane

manifest_review_sol owns packages/builtins/file-search/ presentation/tests/fixtures/
evidence and may add packages/builtins/previews/ source only without dependency
manifest changes. Existing shared Text ViewModel editable:false, literal text.
Explicit Preview text secondary file action only; existing primary Details,
directory Browse, Copy path and query/selection/focus semantics preserved.
May support results only to keep depth<=3, with clear Details guidance if needed.
No read on appearance/selection/query. Pending, unavailable/manual retry, invalid/
stale/late receipts safe; cancel/navigation discards read completion and text.
Root/query/selection change invalidates; preview closes on removal/index clear.
Use current shared host primitives/tokens, no feature CSS. Public synthetic
light/dark loading/error/empty/literal-markup captures, keyboard/Escape restoration
and axe required. All success fixtures labelled mocks.

Coordinator owns contracts, native transport, main/preload/workspace routing,
application integration tests, mappings/registry/cards. Native service lane owns
native/platform/src/text_preview.rs, native/platform/src/applications.rs and
native/platform/tests/text_preview.rs only; no interface/dependency changes.
All use isolated codex/ branches from this freeze and SOL6.1/high.

## Scope and evidence limits

L2-03 AC01/cardinality, AC02/source preservation, UI/privacy and L2-02 AC02 gain
partial evidence only. Full tasks/dependencies remain unfinished under authorized
small increment sequencing. Root content-index opt-in/extraction/recent/MIME
search and all native Open/buffer/mutation actions remain required. No Debian13
GNOME/KDE Wayland/X11/nativeAT/package/performance/release acceptance claimed.
