# Actual read-only first-order install metadata capture

One coordinator-supervised invocation ran on 2 November 2026 UTC after approved
PR111 merge `1c39172dcd710f738c8eafc3be007656e4dfb7fc`, using exact reviewed
`88a2e4d4db78e3e77a373e893eba5f85c447aeb9` source bytes. Initial collector
Standards `12c56474` and Security/Spec `4ee8dec3`, initial composed-owner
Standards `d2de0ad7` and Security/Spec `7e2125e8`, and final correction recheck
`253e2de0` are separate historical reviews. Findings were corrected before
publication; final bounded Standards and Security/Spec were clear. This actual
execution and its evidence were not part of those earlier reviews.

**Result: observed, exit 0.** Capture
`ae9a03d8-76a7-4156-b813-b0c659ef94b4` ran from
10:48:48.419185 to 10:49:22.678468 UTC. The monotonic interval from just after
the UTC start through exact caller wait return was **34.242 seconds**; the UTC
end follows output fsync. These clock boundaries differ. Automatic retries: 0.
The private canonical snapshot is **23,547 bytes**, SHA256
`f462573e5a8e30eaebb46fa2279d883e9ef2c9fd1631b6e5fab02435dfcd4692`,
with **767 package records, 14 file records, three directories and three
first-order handlers**. A file record can explicitly report absence; independent
consumer validation counted 13 present files and one absent file.

## Admission, invocation and cleanup

The six-file candidate is under protected home ancestry, with a 0500 directory
and 0400 regular files. The original project and `.t3` ancestry did not pass the
source protection gate; no shared permissions were changed. Candidate source
commit/tree/blob identities, sizes, SHA256 and the real source gate passed.
This relies on the trusted preparation UID, not kernel immutability. Its earlier
report remains unchanged with `executionApproved=false`; it is historical
preparation evidence, not the later execution permit.

Under the original 0664 reservation lock, a fresh full pinned stopped-baseline
inspection preceded creation of the separate 0400, 17-key/six-hash metadata
permit. No prior permit existed in this domain. Other job-domain permits were
untouched. The reviewed account is `linuxcast`, UID1000, SSH key authentication
and noninteractive passwordless sudo; no root SSH or SSH password login was
used. The fixed host CLI used `/usr/bin/python3 -E -s -S -B` with the protected
owner path and its two required reviewed flags, a scrubbed environment, and no
caller-supplied guest command. The guest command remains the reviewed fixed
`/usr/bin/python3 -I -B -c` source route.

The supervisor retained exact caller custody and an independent subreaper. It
allowed one invocation under the existing owner/guardian deadlines and retained
a separate 660-second caller wait with bounded termination fallback. That
fallback was not used. This was the coordinator actual-use harness, not the
tests-only FixtureGuard. The retained harness hash is in the invocation record.

The owner reports completed/none, cleanup none, valid transport, stopped and
terminated container, absent owned children and clean reservation. Independent
postflight verified exact caller reaping and ECHILD; a fresh full pinned
container inspection found exited/not running/PID0/exit0. The ownership marker
was absent and the original lock was reacquired. Six source file identities,
modes and hashes matched preflight. Permit bytes/hash and protected binding
were rechecked; the supervisor did not separately record a preflight permit
inode, so it supplies no independent before/after permit-inode comparison.
Stderr was empty. A retained reservation independently reopened the exact
artifact, validated canonical bytes/schema/counts and reproduced the original
public result, then closed successfully.

- [Unmodified public owner result](owner-result.json).
- [Invocation and clock boundaries](invocation.json).
- [Independent postflight](postflight.json).
- [Source, probe and permit provenance](source-provenance.json).
- [Safe aggregate consumer result](consumer-summary.json).
- [Public evidence hashes](sha256.json).

The actual snapshot stays private, mode 0400. Raw package lists, original status
digest, configuration/registry/handler bodies, private paths and filesystem
identities are excluded from these public records. The consumer summary is
separate evidence; it does not extend the closed owner result schema.

## What this establishes and what remains

A subsequent read-only host consumer acquired a fresh retained reservation,
rechecked the six sources and permit, and independently revalidated the same
artifact without dispatch. It counted zero held, broken or pending package
records. It also independently validated the prior private build-facts artifact
for capture `b19313d2-06eb-4077-b5cb-8075ee206a4e`, including its recorded
247,006-byte canonical SHA256. The two validated snapshots record equal original
dpkg status size and SHA256. This links the original status bytes to the earlier
full package projection; the package count alone would not establish that link.
It does not revalidate all earlier machine, capacity, locale or keyring facts.

This is successful read-only metadata collection and normal cleanup. It is not
installation admission, an executed install, interruption-recovery proof or a
build receipt. First-order handler controls still require closed helper/runtime,
configuration and recursive-trigger analysis. Writer exclusion, capacities,
enforced network denial, activation suppression, installation/locale generation,
toolchain/sysroot/ABI custody, build, containment/rootdrop/statx, native AT,
supported GNOME/KDE Wayland/X11 sessions and release gates remain outstanding.
Native/product/AT runs: **0**. Historical timeout-descendant absence remains
unknown; the current ECHILD observation does not close that historical gap.

Host consumer: Linux x86_64/Python 3.10.12. The reviewed guest collector reports
Debian13 amd64 with root effective identity through the reviewed UID1000 sudo
route; package/configuration/handler contents were read as data only. No package
installation, maintainer script, compiler or downloaded runtime was executed by
this capture. Source/test/protocol/lockfile/execution pins are unchanged.
F1-02 stays in-progress with UI pending; historical criterion states and all
97 tasks/full local 1.0 scope remain unchanged. Public validation passes: closed result/lifecycle schema, cross-record identity
and count relationships, six source bindings against reviewed/current Git, the
returned guest source hash/size, privacy allowlist checks, all local file hashes,
15 corrupted-record controls and unchanged non-evidence fields across all 97
tasks. Plan validation, generated cards, status reporting and whitespace checks
pass. These checks do not replay the real operation; historical 533 Python/55
mapped security and type/lint results remain inherited for unchanged code.
Initial independent Standards `d8679dd1` and Security/Spec `88e052b5` reviews
are clear at `2f4a1bf` against approved PR111 merge `1c39172`. Both verified
the ten-path/two-commit range, public schemas/source/probe/hash/privacy and
cross-record bindings, generated cards and unchanged non-evidence task fields.
Standards ran 34 corruption controls; Security/Spec ran 23 public-record and
23 codec controls. Actual execution and private-artifact comparison remain
inherited observations in those reviews. Publication updates only review
metadata and hashes; it changes no result, source, contract or acceptance.
