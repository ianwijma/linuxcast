# L2-05: pin/hide saved Quicklinks

Next bounded required application increment after merged PR45/a44bbe6. Existing
shell, sole owner, shared List/Form/Actions and explicit native browser effects.
Complete task/dependency/native/AT/release scope stays unchanged. This contract
supports development; persistence/main/actual acceptance are not implemented by
this document or frozen mocks. No new infrastructure/research/proof/service.

## Frozen UI contract and owned work

QuicklinkSave/Record/Summary gain optional `pinned` and `hidden` booleans.
Absent/false means false; canonical stored projections may omit false flags.
This is local reversible presentation metadata, never URL or permission authority.
No new IPC method: explicit Pin/Unpin/Hide/Show uses existing exact get then full
Save with expectedRevision, preserving name/URL/tags/webSearch/other flag. It
requires an exact next-revision receipt and a complete list acknowledging only
the intended flag change; no implicit navigation/browser/clipboard/launcher Hide.
Tag edit must preserve existing presentation flags; New defaults false.

Dedicated Quicklinks List excludes hidden rows normally. A global shared action
Show hidden Quicklinks / Hide hidden Quicklinks toggles inclusion locally. It is
always reachable with an empty/no-results query; reopening defaults to excluding
hidden rows. Hidden rows show a plain Hidden accessory and offer Show quicklink;
Open is visibly unavailable until shown. Pin/Unpin is explicit, persistent and
shown in the row. Pin ordering applies within the dedicated Quicklinks view;
full root link-provider/frecency/shortcut work remains required separately.

Search the complete500 metadata rows across name/host/tags before100 visible;
sort matching pinned rows before unpinned, then existing stable ID order.
Keep a matching selected ID through metadata changes. Hiding its selected row
chooses an actual remaining result without invoking it; no position-based replay.
Existing Edit/Remove, tags, literal Open and Query→Review→Open remain unchanged.

Reuse persistent metadataUnconfirmed/openUnconfirmed and exact original-context
fences. Missing capability, wrong/missing receipt, unrelated list changes,
stale get/Save, hidden Open and delayed Back/Hide/query/selection/disposing must
not claim success/replay. Unknown metadata blocks more writes/Open until explicit
Reload validates authoritative records; preserve drafts and avoid auto-effects.

Author owns only presentation.ts, fixtures/, presentation/Chromium tests,
evidence/README under packages/builtins/quicklinks/. Root owns contracts,
migration011/repository+tests, main/preload/client receipt and hidden-open fences,
shared files/manifests/lock, registry/integration and actual production tests.
Ask root for any shared change; do not edit another lane's paths.

Required meaningful evidence: old false/absent data, Pin/Unpin order/prefill,
Hide→no-results→show-hidden→Show→explicit existing native Open, hidden Open
unavailable, tags/search and500/100 bounds, stale/mismatched/unknown/delayed
receipt recovery, keyboard/IME/held Enter, affected dark/light. Report partial
AC/UI/privacy evidence and all unfinished scope. Do not mark task complete.
