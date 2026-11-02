# Packaged Debian keyring continuity and fresh metadata verification

Coordinator preparation after the first [observed private build-facts snapshot](../canonical-keyring-actual-20261102/README.md).
No guest invocation, package installation or filesystem extraction occurred in
this step. The prior public metadata was bootstrapped from HTTPS-published Debian
fingerprints; this step reconciles it with the recorded guest packaged keyring.

## Executed verification

1. Revalidated the retained0400 private snapshot's exact247006bytes/SHA4fc728c0
   and strict host schema. Read only its recorded packaged-keyring hash/size and
   installed version for comparison; no guest keyring bytes or private keys.
2. Rechecked all cached trixie/updates/security Packages.xz compressed/expanded
   SHA256 and sizes against the committed signed-index provenance. Release dates
   are not future and explicit Valid-Until fields remain current; stable has no
   explicit expiry, and none was invented. Selected exactly the public package
   matching the recorded installed keyring version, not a newer replacement.
3. Downloaded Debian's public `debian-archive-keyring_2025.1_all.deb`,179244bytes,
   and verified its SHA256 against that authenticated index entry. Debian archive
   packages are authenticated by Release→Packages→artifact hashes, not individual
   package signatures. No package installer, maintainer script or hook ran.
4. Inspected bounded ar/tar members in memory without extracting to a filesystem.
   The canonical `.pgp` is root-owned regular; `.gpg` is its relative compatibility
   symlink. The canonical55918bytes/hash exactly match the retained guest fact.
   This establishes byte continuity with that fact, not a new trust grant or proof
   of the earlier guest failure's exact cause.
5. Reverified all three cached InRelease signatures with this exact matching
   public packaged keyring, using isolated GnuPG home and no user keyring:
   gpgv exits0, with3/2/2 valid signatures. Verified each signed cleartext payload
   byte-equals the separately hashed cached Release. Rechecked dates/expiry.
6. A private copy with one cleartext byte changed fails gpgv: exit1, one BADSIG,
   zero VALIDSIG. Original metadata/artifacts are unchanged. Own direct verifier
   children returned and were reaped; no guest/build/native process was started.

The raw public `.deb`, canonical keyring and verification record remain in
private0500 `f102-public-debian13-keyring-reconciled-20261102` outside the lab,
payloads0400. No host or guest APT/keyring state was modified. Only small public
verification/hashes and the negative control are committed here. Initial source
bootstrap and guest-image trust remain their recorded assumptions; matching
hashes do not establish an independently audited trust root or package safety.

- [Exact package, hash chain, signatures and freshness](verification.json).
- [One-byte signature rejection](signature-control.json).
- Normative primary context: [Debian apt-secure](https://manpages.debian.org/trixie/apt/apt-secure.8.en.html)
  and the [2025.1 packaging source](https://sources.debian.org/src/debian-archive-keyring/2025.1/Makefile/).

## Private downstream solver inputs

A separate0500 private directory `f102-private-solver-baseline-20261102` contains
0400 `status`, `facts.json`, and `provenance.json`. The status is a projection of
the validated767 package records, preserving every captured relationship field;
it omits discarded descriptions/metadata. Its SHA is distinct from both the
canonical snapshot SHA and the captured original guest dpkg-status SHA. Those
identities are recorded separately. **Never write this projection back to the
guest dpkg database or use its hash as the original status identity.**

These inputs admit unprivileged isolated offline dependency resolution only.
They grant no install/repair/provision/build/native authority. No package closure
has yet been resolved. Preserve installed state, holds/architecture constraints,
and reject removals/downgrades/unreviewed upgrades; account for missing en_US.UTF-8
and measured capacity before a later separately reviewed transaction. Use exact
Debian APT tooling and isolated configuration, not the earlier failed host-APT
simulation or a handwritten dependency selector as final proof.

All97 tasks/dependencies/criteria and full local1.0 scope remain unchanged.
Native/session/AT/build/release and historical timeout-descendant uncertainty
remain outstanding. This preparation is not installation or acceptance.


## Initial independent evidence reviews

Both final reports were read in full. Standardsa16ef09e and Security/Spec57698dc2
are clear at exactd70ecc9aea1764c7b4092c804ef5f812953e13e2 against approved
bf4b49261abab0ac3e8424fabc4afafdd5e93eda: three commits,13 paths (the initial
brief's14-path count was corrected from Git). No production/test/protocol change.

Both independently verified public package/keyring/alias, signed index compressed/
expanded hashes/sizes, freshness, all3 InRelease3/2/2 signatures, exact Release
payloads and one-byte tamper rejection. Standards checked35 bindings plus probe,
public relay/schema and25 malformed/privacy controls, full registry/regeneration.
Security/Spec checked10 new evidence files and pins,19 focused synthetic tests,
28 additional malformed/cross-record controls and tamper cases in all3 suites.
Plan/whitespace pass, no private LAB/solver access, all97 definitions/criteria
unchanged. Their isolated worktrees and public cache fingerprints stayed clean.
Actual private capture/cleanup/baseline and permit/harness observations remain
inherited; historical104/55/399 and type/lint were not rerun. No acceptance or
new authority follows. Publication retains reviewed raw evidence/source bytes.
