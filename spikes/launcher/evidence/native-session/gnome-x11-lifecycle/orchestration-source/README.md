# Unsigned lifecycle snapshot collector: local preparation only

No Docker, SSH, guest, native display, guest staging, signing or push action occurred
in preparing or verifying this bundle. Root/independent006 review and separate
explicit reservation/execution authority are required. A command flag does not
grant permission.

The immutable source is /tmp/linuxcast-s001-lifecycle-immutable/source.tgz, built
from exact git archive of signed d8b6f6e8cedfe76e5c97fdac6a0ebe81940f9cab plus
ONLY the frozen five-file43922 lifecycle overlay. File-for-file comparison proves
455 tracked archive files with exactly five changed files and three changed
runtime inputs: observer_startup.py, run-session.py, protocol.ts. New uncommitted
evidence and all other working-tree state are excluded. New authority pins24
inputs/5overlays/static resources/3outputs and the new raw6ec0 build manifest.
Historical8bf/ed9/51ed/706e archives, source and actual evidence stay unchanged.

Provenance explicitly requires executedRuntimeCommit=null,
runtimeInputsMatchSignedCommit=false, sourceSigned=false, sourceDirty=true,
signedSourceBaselineCommit=d8b6 and reviewedIncrementSha256=43922. The archive is
not a whole signed tree. No fallback accepts the prior signed runtime authority;
normal signing failure does not authorize unsigned commits or configuration
changes. The preserved archive/authority/review patch manifests are the authority
for a possible later explicitly approved unsigned-snapshot execution.

The orchestration remains derived from reviewed706e: exact lc1-eight-character
owned0700 root, same-stage t TMPDIR, numeric path lengths78/96/77/95,max107 and
random suffix precheck; historical/new other-root detection; canonical owner/
inode/no-follow/exclusive copies; fixed Node/Bun hashes before/after; all install/
Electron/XDG/temp caches private; repeated-HUP shield during existing supervisor
teardown. Original45/180/240 native budgets and300/330/920 cleanup guards remain,
with no retries, added readiness waits, query, identity/replay/activation changes.

Host.py verifies exact new source/authority/build-manifest/collector/phase pins,
then creates a private local capsule and uses the reviewed stdin-only fixed
Docker/SSH path. There are no container transfer files or key reads. Guest_phase
owns its new root before extraction/preparation, and always removes it in finally;
collect.py uses the reviewed Supervisor and one unchanged runner invocation.
Only fixed public report/manifest, optional own-renderer/CDP images, strictly
validated provenance/cleanup/release may be exported. Every nested lifecycle
field is validated by the new Python report schema. Raw child output/errors,
private IDs/paths and arbitrary file names never become durable output. A false
clean release, physical matrix or signed-source claim rejects. Failed collection
does not rerun or claim a verified release without a valid response.

The updated source diagnostic records only own compositor Popen state/exit code
and independent EOF/readerAlive/stopRequested facts at reached boundaries. Its
finally sample is after bounded drain close but before outer process teardown,
not post-cleanup proof. No crash/cause label or acceptance closure is inferred.

Harmless local checks:29collector+20orchestration=49 pass, including old-authority
rejection, changed-source rejection, unsigned-to-signed provenance mutations,
lifecycle report/private-field roundtrip, full repeated-HUP resistant-child
cleanup, socket107accept/108+113reject, ownership collisions and cache/tool pins.
The source-only runtime suite separately passes128checks plus strict type/lint/
AST verification. Unix bind fixtures need ordinary approved local permission;
no guest/network/display action is performed by these tests.
