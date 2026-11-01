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

Current account/transport/privilege/poweroff, dedicated-UID/PID1 feasibility,
immutable Debian build/receipt, actual containment/native AT, supported sessions
and full local1.0/release acceptance remain pending. No real permit was created.
