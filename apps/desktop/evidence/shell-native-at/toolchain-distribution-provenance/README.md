# Pinned build-tool distribution provenance

Coordinator host input preparation on 2 November 2026 from approved PR108
`dea300ade7fa211021daef1d4367f04754df2693`, following the repository pins:
Node24.22.1, Bun1.4.4, Rust1.95.0 minimal plus clippy/rustfmt. No tool upgrade,
installer execution, compiler invocation, guest operation or acceptance promotion.
Earlier private Rust inventory remains historical; this is a fresh public corpus
outside the lab, with its own custody and verification records.

## Signature and artifact chain

[Node's pinned-release README](https://github.com/nodejs/node/blob/v24.22.1/README.md#verifying-binaries)
documents signed checksum verification. Its official release-key repository was
resolved to commit `481637f813e912c4aa3622d7964ab426c97b8e8d`; the keyring bytes
are retained separately. The primary signer was checked against the active-key
list in that version's README, rather than accepting an arbitrary key present
in the downloaded keyring.

[Bun's pinned Dockerfile](https://github.com/oven-sh/bun/blob/38afee6c84fcf48c0edb2466aa4b27d287a59c30/dockerhub/distroless/Dockerfile)
contains the release public key and explicit signer fingerprint. Those quoted
key bytes were read as data; the Dockerfile and its commands were not executed.
The signed checksum entries also agree with the published GitHub asset digests.

[Rust Forge](https://forge.rust-lang.org/infra/other-installation-methods.html#standalone-installers)
identifies its standalone signing key. The
[1.95.0 channel manifest](https://static.rust-lang.org/dist/channel-rust-1.95.0.toml)
and detached signature were verified with that first-party key. The manifest
SHA256 `821ff14e4c4a1cbe1e8915f35aff0a3fbbdf8d293ad48ab8f31e3b0440c581f9`
matches the earlier historical manifest, and binds all five component digests.

Isolated GnuPG homes and explicit keyrings were used with trusted host
gpgv2.2.27. No host user keyring, keyserver or private key was accessed.

| Metadata | Checked primary fingerprint | Valid signatures | One-byte tamper |
| --- | --- | ---: | --- |
| Node24.22.1 signed SHASUMS | `5BE8A3F6C8A5C01D106C0AD820B1A390B168D356` | 1 | exit1, BADSIG1, VALIDSIG0 |
| Bun1.4.4 signed SHASUMS | `F3DCC08A8572C0749B3E18888EAB4D40A7B22B59` | 1 | exit1, BADSIG1, VALIDSIG0 |
| Rust1.95.0 channel manifest | `108F66205EAEB0AAA8DD5E1C85AB96E6FA1BE5FE` | 1 | exit1, BADSIG1, VALIDSIG0 |

Key identity is bootstrapped from first-party HTTPS source snapshots and checked
fingerprints. This does not establish an independent out-of-band identity or
web-of-trust root, audit upstream builds, or replace later immutable provisioning
custody. [Exact signature results](signatures.json) preserve that limitation.

The first verifier stopped after valid Bun signature verification because its
plaintext comparison required raw byte equality: the signed payload has one
terminal LF that the separate checksum file omits. A second verifier stopped on
legitimate Node relative Windows checksum paths and a final blank line. Both
scripts, partial outputs and failures remain retained. The final verifier parses
strict unique SHA256/relative-name entries, permits only trailing empty lines,
and verifies Bun's complete checksum maps agree; the raw one-byte difference is
recorded explicitly. Downloads use the signed payload's entries. No signature
check or tamper refusal was bypassed to accommodate these harness assumptions.

Eight exact archives were then acquired:263388790 compressed bytes in3.948s,
without ambient proxy, mirror or retry. Each matches its signed digest. Collection
has a240s hard alarm,20s sockets,128MiB per-file and384MiB total caps. Baseline Bun
was fetched explicitly for comparison; it is not a silently selected fallback.

| Archive | Compressed bytes |
| --- | ---: |
| node-v24.22.1-linux-x64.tar.xz | 32026916 |
| bun-linux-x64.zip | 51794595 |
| bun-linux-x64-baseline.zip | 51794559 |
| rustc-1.95.0-x86_64-unknown-linux-gnu.tar.xz | 80351960 |
| cargo-1.95.0-x86_64-unknown-linux-gnu.tar.xz | 10984780 |
| rust-std-1.95.0-x86_64-unknown-linux-gnu.tar.xz | 29573972 |
| clippy-1.95.0-x86_64-unknown-linux-gnu.tar.xz | 4697128 |
| rustfmt-1.95.0-x86_64-unknown-linux-gnu.tar.xz | 2164880 |

The [archive identities](archives.json) include exact source URLs and SHA256s.
No artifact body, keyring or executable is committed to Git.

## Static inspection and existing host-tool continuity

Bounded data-only inventory checks6155 members and hashes every regular file,
with1058853807 declared
expanded bytes across the eight archives. This includes both Bun variants and
all Node headers/npm/docs; it is not the size of a selected installation.
Node has5888 members, including4797 regular files and three contained symlinks.
Each Bun archive has one directory and one regular binary. The five Rust archives
have263 members/215 regular files/642478515 regular bytes, matching the earlier
historical content counts. No special, sparse, escaping-path or set-ID member
was admitted. This audit is not an approved guest extractor or installer.

There are21 ELF64 little-endian x86-64 files across the corpus. Trusted host
readelf inspected temporary0400 nonexecutable data files with12s child limits
under a180s audit alarm; the files were removed by retained identity. All reader
children returned successfully. No downloaded executable was run or loaded.

| Selected executable | Highest referenced GLIBC symbol |
| --- | --- |
| Node bin/node | GLIBC_2.28 |
| Both Bun variants | GLIBC_2.17 |
| rustc, rustdoc and cargo | GLIBC_2.17 |

The [full ELF report](elf-summary.json) includes libraries, interpreters and
symbol versions. These are requirements observed statically, not complete
library closure, runtime CPU, actual guest ABI, compiler execution or sandbox
proof. No GNU ISA note is treated as a universal instruction-set guarantee.

The existing host tool bytes match signed archive members exactly:

- Node:126879696bytes, SHA256
  `e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb`.
- Bun:107308936bytes, SHA256
  `10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235`.
  **Both standard and baseline release archives contain this identical binary.**
  Their different ZIP hashes reflect different archive contents/layout metadata;
  no CPU fallback or binary substitution was performed.

This supplies upstream-byte continuity for the host tools used in earlier cache
checks. It does not independently rerun those checks or establish that any
existing private lab copy has those bytes. Tool versions were not reprobed by
executing downloaded artifacts in this increment.

## Provisioning boundary and remaining acceptance

Keep the native Node subtree exactly `bin` and `bin/node`; the full Node archive
and npm symlinks must not be copied wholesale into that authority. Rust belongs
under the separately frozen `/opt/linuxcast-f102-lab/rust` prefix. Its component
archives carry `components`/`manifest.in` data and bin/lib/rustlib/share payloads;
actual installation must preserve the sysroot layout, not copy only cargo/rustc.
No downloaded Rust install.sh was executed or granted authority by this report.
A future fixed provisioning implementation must review/validate its exact copy
map, collisions, root ancestry/ownership/modes, payload hashes and cleanup.

The public corpus, static member/readelf reports, verifier scripts, stopped
harness attempts and isolated public verifier homes are sealed outside the lab
in `f102-public-toolchain-provenance-20261102` (0500 directories/0400 files).
[Retained bindings](retained-bindings.json) make those inputs inspectable.
[Static summary](static-summary.json) records inventory and host-byte matches.

No new permit, actual prefix creation, root operation, package/locale install,
dependency lifecycle, compiler/build/receipt, guest/namespace/containment,
provider, desktop, native input or AT operation occurred. Historical guest facts,
capture/cleanup and timeout-descendant uncertainty remain inherited.
Resource admission, exact transfer/materialization, actual CPU/library/ABI/tool
probes, trusted root/UID20000 provisioning, build and full native/session/AT/
release acceptance remain outstanding. Independent review of this evidence is
pending. All97 task definitions, dependencies, historical acceptance states and
the complete local1.0 objective remain unchanged.
