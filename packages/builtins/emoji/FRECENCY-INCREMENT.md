# L2-06 — Emoji local ranking application increment

Base c881a66/PR72. Task docs/implementation/tasks/L2-06.md; normative PLAN,
architecture/data.md, architecture/security.md, product/builtins.md,
implementation/testing-release.md, design/DESIGN.md and tokens.json. Existing
integrated L1/D1/storage is used under approved unfinished increments; full
prerequisite/native/release acceptance remains pending. Complete 1.0 unchanged.

Use existing private revisioned settings CAS, no new table/migration/dependency.
Setting emoji.frecency canonical JSON {enabled:boolean,entries:[{id,useCount,
lastUsedAt}]}; entries sorted unique canonical Emoji IDs, <=4096/512KiB,
count1..1e9 saturated, canonical UTC ISO instant. Missing = enabled true/empty.
Ordinary exports omit this private usage; global command-usage Clear also resets
these counts, preserving enabled and incrementing revision (no ABA).

Frozen wire in packages/contracts/src/emoji.ts. Search metadata optional
frecency {available:true,revision,enabled,entryCount}|{available:false}; no raw
usage records/paths exposed to renderer. Existing selected context is unchanged.
updateEmojiFrecency exact search context (revision/searchId/query/group/tone/
favouritesOnly), frecencyRevision, action pause|resume|reset. Reply echoes context,
outcome updated, exact next frecencyRevision, enabled and entryCount. Pause/resume
preserve entries, reset keeps enabled but clears entries; same-state pause/resume
is conflict. Exact fresh pre-write snapshot/canonical membership/current-owner/
frame/generation authorization; reserve actual work through settlement/deadline/
Hide, no automatic replay or optimistic success. Fresh read confirms status.

Main backend frecency.read()->snapshot; write({expectedRevision,enabled,entries})
->snapshot. Backend search gains internal main-only frecency:{entries,now:number}
and favouriteIds:string[]. Search caller validates these bounded plain snapshots;
clock milliseconds finite/safe; no renderer ranking fields. Same-match relevance
rank first, then favourite boolean, then useCount/(1+max(0,now-lastUsedAt)/7days),
then stable Unicode source order. Ranking BEFORE limit/category/tone filtering
result cap; filters and canonical scalar values preserved. No new event/query
history. Only confirmed explicit Copy increments usage once and lastUsedAt;
when paused skips both private count and builtin command aggregate recordUse,
and omits count-based ranking while retaining entries for Resume. Unreadable
tracking state also skips both counts, preserving privacy preference uncertainty.
Unavailable ranking preserves ordinary public search/Copy with visible warning.

Copy reply optional frecency recorded|paused|unavailable. If clipboard is known
written but ranking persistence fails, report copied with unavailable ranking,
never invent tracking success. Deadline/Hide after dispatched effects follows
existing conservative unknown rules and actual-slot lifetime. After normal Copy,
read-only refresh may update ordering while keeping selected canonical ID;
never auto-copy on fresh results. Failed/denied Copy/navigation/search/edit/fav
writes do not increment counts. Main clock/IDs only.

UI adds shared Form/action for Emoji ranking, pause/resume and explicit Reset
with confirmation in shared UI. Disclose local aggregate counts/time only,
privacy/reset implications, storage unavailable/unknown states and recovery.
Do not add a separate visual system. Preserve query/category/tone/favourites/
density/selection across Cancel and apply/read; Hide/reset frames safely. Exact
next revision + enabled + entryCount refresh verification, newer state neutral,
late results released/no replay. Missing optional API visible disabled/recovery.

Meaningful unit/contracts/security/real storage/UI checks; affected NEW dark/
light/200%/pending/recovery screenshots/axe. Actual sandboxed Electron scenario:
copy actual canonical entry, reordering and stable selectedID, Hide/restart,
pause->Copy no count, resume->Copy count, Reset cancel/confirm/restart, privacy.
Label Xvfb vs Debian matrix, synthetic APIs vs actual operations accurately.
No complete task/criterion claim; no standalone proof/infrastructure PR.

Ownership: coordinator contracts/storage/main assembly/preload allowlist/routing/
suite maps/registry. Search lane only src/search.ts, tests/frecency-search.test.ts,
FRECENCY-SEARCH.md. UI lane src/presentation.ts/tests/frecency*.ts/fixtures and
NEW frecency evidence. IPC lane main/emoji-ipc.ts/preload/emoji.ts plus named new
boundary tests; no shared contract/storage/routing edits. Independent review
required before publication.
