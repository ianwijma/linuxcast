# Coordinator integration checkpoint

Integrated the author checkpoint `a87058dc692deefc3094a310533b8154974ea04f`
onto the frozen inventory-preparation branch. No production, guest or native job
was invoked. Initial independent Standards and Security/Spec reviews remain
outstanding; the prescribed Codex provider reported exhausted usage during a
separate review. No review approval or native acceptance is implied.

The frozen inventory protocol enumerates **13 fields**. That exact set is the
contract; the assignment's “15-key” wording was a counting error. No fields,
protocol authority, native permit or receipt requirements were changed.

Coordinator validation on the development host (pinned Node24.22.1/Bun1.4.4):

- `bun run test:security -- F1-02`: all55 mapped checks passed; the offline
  Python check completed in16.986s under its unchanged18s subprocess bound.
- Four changed/new Python modules parsed successfully; the new manifest's
  file/input hashes and the two refreshed owner/test hashes match.
- `python3 scripts/validate_plan.py` and `python3 scripts/plan_status.py` passed;
  all97 tasks and existing criterion states remain unchanged.

Only the two owner/test entries were refreshed in the old outer-owner manifest.
Its historical `unchangedInputs` protocol hash differs from current source on
both approved `b23a3cc` and this branch; the current protocol is unchanged from
that approved base and matches the manifest's separate `coordinatorContract`
hash `3ce7f3293602b5539acd12dbad8db5f9ff6134e3e03cdf13d274ee09c174e18a`.
Historical snapshots are retained; this is no claim all old sections describe
current files.

Actual transport/privilege/poweroff, dedicated-UID/PID1 feasibility,
immutable Debian build/receipt, actual containment/native AT, supported sessions
and full local1.0/release acceptance remain pending. No real permit was created.


## Provisioned account — user-confirmed 1 November 2026

The user confirmed the exact v4 guest account and requested its use for the
reviewed inventory command:

- `guestAccount`: `linuxcast`, provisioned UID1000.
- `guestPrivilege`: `sudo-noninteractive` (passwordless sudo,
  `ALL=(ALL) NOPASSWD:ALL`).
- SSH uses key authentication. Root login and SSH password authentication are
  disabled; neither is an alternate route.

The user cites their provisioning user-data line3 as verification. The coordinator
did not read that private file, SSH key material or a guest home. This is supplied
provisioning evidence, not an executed authentication/sudo/poweroff test. The fixed
transport must use `-l linuxcast` and the existing `/usr/bin/sudo -n --` prefix.
No account guessing, password prompt or root-login fallback is introduced.

The user explicitly chose **wait for Codex quota**, declining the proposed alternate
provider. The later user report of98% remaining GPT quota corrects the coordinator
inference: the historical delegated usage-limit error did not establish current
account-wide exhaustion. Keep GPT-6.1 SOL/high on the same Codex provider and retry
a fresh review; no alternate provider/model or authentication change is authorized
or needed for that retry. The provider-session error cause remains unknown. Initial Standards and
Security/Spec reviews, reviewed-source custody and permit binding remain required
before inventory execution. No real permit, SSH command, guest start or native job
was created/executed by this account update. Native/build/receipt/full-task gates
remain unchanged. The closed inventory implementation and frozen protocol were
not edited.


## Initial reviews received; corrected source requires final recheck

Standards002b32cf and Security/Specf502bf17 completed onabff18ac. Their distinct
P2s (malformed package identity and cancellation during reply publication) are
coordinator-fixed with old-source failing regressions. The default5s production
cleanup and18s mapped timeout remain unchanged; two test-only clocks advance only
after actual owned-child reaping, preserving all failure/absence assertions.
Current57inventory/9session-owner/55mapped checks pass;265 Python cases11.860s.
A fresh independent recheck must cover both corrections and the test-clock change.
F2 capture Security/Spec47865d99 separately completed clear ona411f882 with165/86/3
checks,12extra probes and three failing controlled faults; separate Standards is
still required. These successful Codex runs invalidate the earlier account-wide
quota assumption; no provider change occurred.

The prepared host candidate from exactabff comprised lab_owner.py (SHA d3b5c60d...),
lab_inventory_owner.py (56c12732...) and fixed inventory (a7f1095d...), each0400
under a0500 private directory. Source bytes were copied from Git, independently
hashed and synced; the existing lock inode/mode were retained. Fresh host-only
Docker metadata matched pinned Config/HostConfig/Mounts/container/image and exited
PID0/exit0. This establishes no guest/SSH/probe/native proof. On review findings,
that exact directory was renamed to
`/home/ian/Projects/ianwijma/linuxcast/.worktrees/private-lab/f102-inventory-candidate-abff18a-rejected`
with inode/bytes preserved and its former path retired. No real permit was created
or owner invoked. Do not reuse it; corrected reviewed source needs fresh pins and
custody. Private user-data/key files stayed unread.


## Publication readiness

Fresh final reviewer dc86be7a completed at exacta744b7b/baseabff18ac: Standards and
Security/Spec clear, bothP2s closed, no new actionable findings. Independently
55mapped/265Python11.759s under18s,57inventory/88owner/9SessionOwner, both old-source
negative controls, both suppressed-termination controls,4publication/cleanup and
14grammar probes,4AST/24inventory hashes/legacy test pin/plan/whitespace pass.
The code reviewed at a744b7b is unchanged by publication metadata. Actual public
host source candidate remains rejected; fresh approved immutable custody and exact
permit are still required before a first real inventory invocation.
