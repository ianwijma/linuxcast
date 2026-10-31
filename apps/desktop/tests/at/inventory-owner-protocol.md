# F1-02 inventory-only lab reservation — coordinator contract

This narrowly extends the reviewed outer ownership infrastructure with a separate
inventory-only entry point. It addresses a real prerequisite cycle: the native
owner must require a completed build receipt, but that receipt cannot prove the
preparation guest's current identity, packages or namespace feasibility. Never
supply a placeholder receipt or relax native admission to start preparation.
Implementation and independent review precede invocation. No permission to start
a guest follows from this document alone. All full-task/release gates remain.

## Exact authority

Retain every fixed container/image/configuration/root/lock/guardian/deadline/
cleanup/recovery rule in outer-owner-protocol.md and its pinned inventory. Reuse
the reviewed code through small internal typed seams; do not duplicate a weaker
process owner. The existing native CLI/permit and its actual tree/archive/receipt/
Node/wrapper checks remain unchanged. An internal Python subclass is trusted test
infrastructure, never a plugin/configuration/CLI-selected arbitrary job runner.

Add only a separate closed inventory CLI. It admits review acknowledgements only,
no caller command/path/identity/account/backend/program/timeout overrides. Its
private0400 permit is `f102-inventory-permit.json` under the same existing0700 lab
root. Exact key set: `schema` (integer1), `jobKind` (`inventory-only`), `containerId`,
`imageId`, `labRoot`, `labDevice`, `labInode`, `ownerSha256`, `inventoryOwnerSha256`,
`inventoryProbeSha256`, `guestAccount`, `guestPrivilege`, `inventoryAuthorityReviewed`.
The existing fixed identities/root and numeric device/inode must match. Digests
are lowercase SHA256 of the independently reviewed base owner/new owner/embedded
probe. Account has the existing safe identifier grammar; privilege is exactly
root (account root) or sudo-noninteractive. The final field is true only after
coordinator review of these exact inventory/cleanup actions. It is not a claim
that guest transport/account/privileges are already established; that distinction
is the purpose of this separate permit. No native receipt/source approval is
inferred. Never create a permit in the implementation assignment.

Use the same retained ownership marker. Its binding includes the exact permit
bytes so another job/permit cannot consume a foreign interrupted lease. Unknown,
replaced or cross-job custody refuses admission; only this reviewed same-job
owner may recover its interrupted marker. Preserve existing historical uncertainty.
A successful inventory cannot mint a native permit or native build receipt.

## One read-only guest job

The only effectful operations outside guest process lifetime are the existing
fixed start and cleanup poweroff/stop/kill of this pinned lab. Use exactly the
current container-local SSH transport/key/host checking, no agent/forwarding or
ambient environment. There is no account guessing or alternate credential retry.
The trusted coordinator supplies the one account value; a failed login fails.
Readiness may repeat only a fixed `/usr/bin/true` connection probe within120s.
It is never authentication/permission/native proof.

The one inventory job is fixed `/usr/bin/python3 -I -B -c <embedded-source>` with
the configured fixed noninteractive sudo prefix if needed. Safely shell-quote the
constant source for SSH's remote command construction; there is no caller text.
The exact bytes are pinned independently in the inventory permit before start.
No guest module installation, stdin program, SFTP/SCP, download, shell script,
dependency installer, arbitrary file operation or build command is admitted.
Root entry is needed for the narrow dedicated-UID feasibility child below.
The script is inert data on import and has no invocation on the host.

Collect only bounded, fixed facts: Debian ID/version and architecture; effective
root UID/GID; configured account UID1000 through sudo's trusted identity when using
that route; selected package versions from the bounded dpkg status file (Python,
Orca/AT-SPI/D-Bus/speech/Xvfb/xauth/xdotool, compiler/build and cgroup prerequisites);
required fixed executable existence; cgroup-v2 resource-controller names;
dedicated UID/GID20000 account presence and whether any process uses that UID;
and owned graphical/test-process absence using bounded proc metadata only. Do
not read process environments/command lines, file bodies from homes, credentials,
keys, clipboard, desktop buses or display/input/audio devices. No global settings
or service state is changed. Package parsing and output sizes have explicit bounds.
Never turn unavailable facts into zeros/absence or advertised native readiness.

A single fixed feasibility child may drop groups/capabilities to UID/GID20000,
set no-new-privileges and read only its own namespace inode and `/proc/1/ns/net`
and `/proc/1/ns/pid` identities. It creates no account/file/socket/device and does
not change any namespace. Report allowed/denied/unknown separately; denial does
not relax the current native wrapper/controller checks. Parent-death/retained
identity, short independent deadline, exact termination/reaping and bounded pipe
output are mandatory on every exit, including post-fork bookkeeping faults.
Never leave a UID20000 child because inventory otherwise failed. Refuse the
child probe when that UID is already in use, and report the reason truthfully.
No root helper capability is retained by the child. Mock/pure tests do not prove
these actual guest facts; tests must never perform the real drop on the host.

The inventory job budget is at most30s within the existing owner600s total;
startup120s and cleanup45s are unchanged, no wrapper/native execution or retry.
Graceful shutdown uses exactly the existing fixed systemctl poweroff under this
inventory authority, followed by the unchanged fresh stopped/exit0 and owned-host
child-absence requirements. A denied action, unknown SSH disconnect, forced stop,
nonzero exit or uncertain recovery remains failure/dirty custody, never normalized.

## Results and checks

Strictly validate a versioned bounded guest reply before considering transport
successful. Only fixed facts/versions/booleans/counts and fixed failure codes;
no raw stderr, process names/paths/PIDs, machine IDs, private user identities or
arbitrary exception text. Public result schema explicitly identifies inventory-only
and separates the retained lifecycle result from facts. It contains no native-run
count or native success claim. Write no result into an earlier native evidence
folder; actual invocation/publication remains coordinator-owned.

Own new `lab_inventory_owner.py`, `test_lab_inventory_owner.py`, and a new
`evidence/shell-native-at/inventory-owner-preparation/` only. Limited changes to
`lab_owner.py` and `test_lab_owner.py` may expose internal permit-name, fixed SSH
composition, reply-validation and cleanup-authority seams needed to reuse the
same owner. Preserve native behavior and all existing tests/closed CLI. No other
controller/observer/parser/namespace/staging/provenance/manifest/registry edits.
Coordinator owns this protocol and runner mapping. No dependency or timeout bump.

Offline regressions: strict foreign/native/wrong-kind/replaced permit rejection;
unchanged native admission; exact fixed transport quoting/root/sudo; no native
job/input; lifecycle dirty recovery and closed output; bad/oversized/unknown facts,
package/proc read failures; dedicated UID collision/denial/unknown; all feasibility
child startup/drop/read/write/death/reap/timeout faults with injected adapters;
and source/permit hash checks before any start. Actual process fixtures use only
ordinary unprivileged Python with independent custody, never host setuid/unshare.
Keep the full mapped Python suite inside its existing18s bound without skips or
weakened assertions. Record actual versus inherited evidence and acceptance gaps.

Historical metadata establishes UID1000/Debian13.7 and a previous accepted guest
shutdown, not the current account name or fresh transport/poweroff proof. Public
older spike orchestration uses `debian` in a different lab; that is a lead only.
Do not read private user-data/keys or guess current account authority. The
coordinator will reconcile that fact before any real invocation. No guest/native/
build/namespace/display/bus/input/audio/provider/keyring operation is permitted
in the implementation/review assignment. No push/PR/status/publication or children.
