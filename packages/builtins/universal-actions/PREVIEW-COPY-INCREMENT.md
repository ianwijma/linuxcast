# Explicit Copy text from the current preview — L2-03

Frozen coordinator contract29October2026 from mergedPR55/develop26c54818.
Taskcard L2-03 with L2-02 controller integration. Keep full scope/security and
explicit unfinished desktop/AT/release acceptance. No new native reader/service,
research/proof, dataset, dependency, migration, network, storage/history or paste.

## Application interface

Existing FileSearchApi.previewText strict success gains optional previewId:UUID.
Main now issues it only with one successful exact current preview. Optional is
for additive compatibility; missing token/copyAPI means visible unavailable Copy.
FileSearchApi.copyPreviewText?(selection:{resultId,rootId,generation,previewId})
returns strict {ok:true,value:{outcome:'copied',resultId,rootId,generation,previewId}}
or safe RpcFailure. Channel file-search:copy-preview-text; protocolVersion1.
Caller cannot supply text/path/URL/clipboardformat/options. UI must validate exact
identity/token before claiming success. No clipboard text is returned in receipt.

Main holds at most one64KiB previewtext in memory with unpredictable UUID,
query/admission/root/owner identity and five-minute monotonic expiry. Clear on
newpreview/query/rootserviceevent/close/dispose/expiry. No disk/cache/history/log.
Copy writes exactly issued preview text, never rereads a potentially changedfile.
A changedroot/index/query/owner or expired/unissued token refuses before dispatch.
Recheck trusted foreground and freshrootstate before nativewrite; one pending
copy gate and existing async nativeclipboard writer,4sreceipt retainsactualslot.
Known unavailability/denial/conflict/cancel mean notcopied; generic/internal/
deadline/malformed/mismatchedreply means unknown/checkclipboard, no replay.
Main returns success only if exacttoken/context still current after write.
Native Open remains unavailable/unmerged and required, independent of preview.

## UI lane: bounded useful application action

manifest_review_sol isolated .worktrees/linuxcast-l1-01 NEWbranch
codex/indexed-preview-copy-ui from thisfreeze (previouspreviewUIpreserved).
Own ONLY packages/builtins/file-search/{src,tests,fixtures,evidence,README.md};
no sharedcontracts/main/native/manifests/mappings/registry changes.
Read full cards L2-03/L2-02 + their normative security/data/extensions/linux
integration/builtins/testing refs, DESIGN.md/tokens.json. Broader dependencies
remain incomplete under user-authorized reviewed/tested smallincrement sequencing.

Existing readonly Text preview: Back to results remains primary (Enter).
Explicit Copy text secondary action (including normal shared CtrlEnter if
applicable), only when confirmedsuccessfulloadedpreview + token + copyAPI.
Keep displayedliteraltext, query/selection/focus/theme/Back behaviour unchanged.
Do not copy on open/query/theme/load/heldEnter or automaticallyretry.
Pending Copy keeps Back usable. Closing/back/sourceinvalidation must preserve
truthful unknowncopy warning/checkclipboard in Results if effect pending; late
reply cannot relabel a different view/token copied or undo a real write.
Allow explicit manual retry after fixed safe failure; never replay unknowncopy.
Loadedemptytext can be copied deliberately (clipboardcleared); advertiseempty.
Unavailable/missingtoken/missingAPI states actionable. Same sharedprimitives,
no featureCSS. Main expiry/conflict tells user returnResultsandPreviewagain.

Unit/browser publicfixtures meaningful boundaries: exactidentity/token copied,
forged/valuebearing/stale/unselected/unknown/mismatched/timeout/rejected replies,
doubleinvoke blocked, pendingBack/clear/disposal, no automaticcopy, correct
empty/Unicode/literal text display. Capture only new dark/light copied/pending/
failed/unknown/unavailable affectedstates and keyboard/axe; restore irrelevant
PNGchurn. No tests of imaginary nativewrite success; labelfixtures.
Report partial AC01/AC02/UI/privacy, exactsignedcommit/checks/limits promptly.
Coordinator owns strictpreload/main/cache/writer binding, actual privateXvfb
Electron/nativeclipboard/source-preservation and ownerprivacy checks, mappings,
registry/PR/integration. Independent review/CI before prompt normal merge.
