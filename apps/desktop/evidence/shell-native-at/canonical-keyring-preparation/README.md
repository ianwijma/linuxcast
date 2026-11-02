# Debian13 canonical public keyring correction

Offline correction after the [actual projection capture](../projection-actual-20261102/README.md)
returned unavailable/keyring. The coordinator froze the explicit fixed-path
correction in commit586045d before changing code. That actual result did not
identify file type, size, permissions or a particular read failure.

Debian's [2025.1 Makefile](https://sources.debian.org/src/debian-archive-keyring/2025.1/Makefile/)
creates the regular `.pgp` keyring and a relative `.gpg` compatibility symlink,
and preserves that alias on installation. Its
[README](https://sources.debian.org/src/debian-archive-keyring/2025.1/README/)
names `/usr/share/keyrings/debian-archive-keyring.pgp` as the active keyring.
The current [trixie file list](https://packages.debian.org/trixie/all/debian-archive-keyring/filelist)
includes both names. These primary sources establish the packaging layout,
not the actual guest's state or authentication of its key material.

## Change and boundaries

Exactly two production literals change from fixed `.gpg` to fixed `.pgp`:
the public keyring read and that path's existing bounds-reason map entry.
Replacing those two literals back makes the complete production source
byte-identical to frozen586045d. No symlink is followed, no compatibility
fallback is added, and no command, path parameter or new read is admitted.
Existing no-follow/nonblocking/root-owned/regular/single-link/mode/identity,
256KiB maximum, readback/final consistency and descriptor-close checks remain.
Packet/snapshot/public shapes, unknown semantics, parser projection, other
metadata reads, source/permit binding, writer/reader custody, guardian, native
admission and all deadlines remain unchanged.

## Executed checks

Linux x86_64, Python3.10.12, pinned Node24.22.1/Bun1.4.4:

- 104 focused tests pass in1.399s; no skips/expected failures.
- 55 mapped F1-02 security checks pass in10.56s. The unchanged18s wrapper discovers
  and successfully executes all399 Python cases without skips/expected failures;
  its Vitest case takes9.420s. This is offline evidence, not guest execution.
- Full no-write TypeScript and whole-repository ESLint pass.
- The four new regression methods produce4 behavioral failures/zero errors with
  exact586045d source, then pass current source in private copies. The broader
  first red run produced7 failures, including3 existing tests retargeted to the
  canonical path; no failing production assertion was removed.
- The documented alias fixture uses a real relative symlink and private files,
  drives production collector→codec→independent host validation, checks the
  expected public-key hash/version and proves the alias was never opened.
- No-fallback, FIFO/directory/empty/wrong-owner/writable-mode and same-byte path
  replacement cases are covered. Existing symlink/hardlink/size/permission and
  read-bound tests now exercise the canonical path. All owned FDs are retired.
- The general synthetic filesystem also retains a regular compatibility-name
  fixture so unrelated historical source controls continue to exercise their
  original defect. The dedicated Debian-layout case replaces it with the actual
  relative alias shape; it does not relax the production allowlist.
- Historical projection6 failures/materializing-mutant3, diagnostics25 and
  custody11/2/4 controls all retain their expected old failures/zero errors and
  current green results. Source-literal scope, AST/syntax, current/input hashes,
  plan validation and whitespace pass.

[Repeatable private-source controls](check-regressions.py) execute no owner CLI,
guest entry point, host package/resource/keyring probe or lab command. No new
dependency, timeout or assertion weakening. Current signing uses the user's
authorized per-command unsigned fallback while the configured1Password socket is
unavailable; signing configuration and release requirements are unchanged.

## Acceptance and next gate

Independent initial Standards and Security/Spec reviews are clear as recorded
below. No corrected source has been sealed, permitted or executed in the guest. The packaging defect
and synthetic reproduction do not prove this was the actual guest failure's
cause, or that a fresh capture will succeed. Existing used sources, permits and
results remain preserved; the lab was independently verified stopped after the
last capture. Fresh review/approval, protected source and permit are required
before one further fixed metadata capture.

There is still no complete package baseline, resolved/installable Debian package
closure, installation/build/receipt, namespace/rootdrop/statx/containment/native
product/Orca, supported desktop/session or release acceptance. Historical unknown
timeout-descendant absence remains unknown. F1-02 stays in-progress/UI pending;
all97 task/dependency/criterion states and complete local1.0 scope are preserved.


## Initial independent reviews

Both reviews covered exactcc158ab53f0fd30a0a46091d4f1bb9be7119a81d against
approved0a363239473cfc81c2c3d4895d1d5c3df2f4fe87, all16 paths/four commits.
The final reports were read in full. Standardsa86c6617 and Security/Spec3beb9a22
found no introduced actionable findings. They independently verified the exact
two-literal production change and all preserved guards, private fixture behavior,
public evidence consistency, full97 registry invariants and honest limits.

Each executed104 focused/55mapped/all399Python under unchanged18s, canonical
4-old-failures/currentgreen and historical projection6/mutant3/diagnostic25/
custody11/2/4 controls, typecheck/lint/plan/whitespace. Standards added8 synthetic
probes and29 bindings; Security/Spec added12 probes and27 file/provenance plus2
embedded bindings. Their isolated checkouts remained clean with unchanged
fingerprints. Dependency setup used frozen copyfile with lifecycle scripts
suppressed; manifests/lockfile stayed unchanged. Actual capture/cleanup remained
inherited; neither accessed private lab state or ran a guest/native command.
Publication metadata preserves reviewed production, tests, helper and contracts.
