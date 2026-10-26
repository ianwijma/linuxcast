# L2-05: export one selected Quicklink

Next bounded application increment after merged PR47/3a42f93. Existing shell,
List/Actions, sole owner and safe native-dialog JSON writer. No new process,
package/dependency, migration or research/proof lane. Full complete local 1.0 and
all task/native/AT/release requirements stay mandatory.

## Frozen public UI contract

Optional QuicklinkApi.exportQuicklink({id,revision}) returns the strict reply:
`{ok:true,value:{id,revision,outcome:'exported'|'cancelled'}}` or the existing
fixed RpcFailure. New named quicklinks:export channel uses existing strict
protocolVersion1+QuicklinkSelection request; no paths/URLs/content from renderer.
Root owns main/preload/security and actual application integration. Contract
freeze alone does not implement the channel or establish export acceptance.

Selected row action: Export quicklink (unencrypted JSON). Show an accessible
plain explanation that the file contains the saved name, full URL, tags and
preferences and is not encrypted. Do not create a new visual system/workspace.
Use existing shared action/status primitives. Include shown and recovered hidden
rows; export does not Open a hidden link. Root search entries remain Open-only;
this action lives in the dedicated Quicklinks List.

Only explicit action invokes native chooser; ID/revision is the sole renderer
input. Fresh exact Get validates the current full definition before requesting
export; main rechecks again after native path choice before publishing the file.
Success requires exact ID/revision/outcome, shown only while original context is
current. Cancel is explicit, no success/no replay. Mismatched/unknown outcomes
say export may have completed and require explicit Reload before another export.
Retain that uncertainty across Hide/reopen through existing flow state; do not
block unrelated browser operations solely from uncertain export. Existing unknown
metadata blocks export until Reload. No browser/copy/launcher Hide/navigation,
definition Save/remove, usage/history or root-query capture from exporting.

Pending export blocks repeat Export and conflicting definition actions. Query,
selection, Back, Hide or dispose rejects late success and never repeats it.
Native chooser consent or a publication already dispatched cannot be undone by
renderer Back; describe uncertain completion truthfully rather than claiming it
was cancelled. Missing capability explains reopen/remediation; no fake success.
Explicit Reload clears export uncertainty after authoritative definitions reload,
without automatically invoking another export. Preserve tags/config/flags/drafts.

Root export payload is a versioned native JSON object
`{format:'linuxcast.quicklinks',formatVersion:1,records:[QuicklinkRecord]}` with one
fresh saved definition only. It includes stable IDs/revision/times/tags/config/
preferences. No transient argument/expanded URL, query/use history, grants,
credentials or executable package content. Label plaintext; this is interoperability
export, not the encrypted portable-backup feature. Reuse saveDataExport with
private0600/exclusive atomic publication; existing files never silently replaced.
Exporting never activates/imports/executes a definition. Bulk export/import is outside this increment; no import behaviour is implemented.

## Ownership and required evidence

manifest_review_sol owns only packages/builtins/quicklinks presentation.ts,
fixtures/presentation+keyboard tests/evidence/README. Root owns shared contracts,
main/preload/backend/native-dialog/writer routing, actual integration, registry,
manifests/locks and all other paths. Ask root for any shared change; do not edit
another lane or add infrastructure/research/proof.

Read docs/PLAN.md, docs/implementation/tasks/L2-05.md and all linked normative
refs; especially docs/architecture/{security,data}.md plaintext-export rules,
docs/product/builtins.md and docs/design/DESIGN.md/tokens.json. Existing interfaces
are integrated; full dependency acceptance remains pending under user-approved
unfinished application increments, not waived.

Meaningful checks: explicit selected literal/search/hidden export, exact fresh
Get, absent capability, wrong/missing/mismatched/cancelled/unknown receipt,
stale definition, pending repeats, original-context invalidation, retained unknown
and explicit Reload, no extra native effects/Save/use, keyboard/IME/held Enter,
affected light/dark pending/cancelled/success/unknown states and axe. Mocks are
component development only. Coordinator verifies actual native path choice,
private file JSON/content/permissions, cancellation, existing-file refusal and
stale-context/source refusal with production code. Report bounded partial UI/
privacy evidence and explicit full-task/native/AT/release limitations.
