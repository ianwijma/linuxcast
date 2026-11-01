# Public Debian build metadata preparation

Coordinator staging on 2November2026 Sydney (1November UTC), after the corrected
actual guest inventory established missing compilers/development packages. This
is metadata custody evidence only: no package installation, guest operation,
build, ABI test or new native execution occurred.

## Executed verification

The host has Ubuntu's archive keyring and no installed Debian archive keyring.
Five public Debian12/13 automatic/security/stable key files were downloaded over
HTTPS from the official FTP-master endpoint. Their primary fingerprints match
the current official published fingerprints. The isolated temporary GnuPG home
never read or changed the user's keyring, host APT state or guest trust anchors.
This is an explicitly **HTTPS-bootstrapped candidate**, not independent packaged
Debian-keyring continuity. Reconcile the actual guest's packaged trust anchor
before authorizing installation.

GnuPG2.2.27 `gpgv` returned0 for each of trixie, trixie-updates and
trixie-security InRelease, using only those explicit public keys. Stable has
three valid signatures; updates and security each have two. A private temporary
copy with one changed cleartext byte failed verification (one BADSIG, zero
VALIDSIG), leaving cached sources unchanged.

The authenticated Release payloads pin both compressed and expanded SHA256/size
of the three main/amd64 Packages indexes. Indexes were fetched by their signed
content hash, and both forms verified independently within explicit size bounds:
base9,678,380 compressed/56,620,099 expanded bytes; updates1,108/2,351;
security291,652/2,112,942. Dates are not future; explicit Valid-Until fields
were current. Base Release has no explicit Valid-Until; none was invented.
Updates expires8November08:09:02UTC, security8November12:12:11UTC. Freshness must
be revalidated before any use; no expiry/trust bypass is authorized.

One initial staging assertion assumed every Components label contains literal
`main`. Signed security metadata says `updates/main` while its SHA256 paths are
`main/...`. It stopped before index downloads. The exact partial files were
retained and cryptographically reverified; collection now checks the observed
suite-specific label and the explicit authenticated main/amd64 index paths.
This changes no application parser, install policy or production guard.

## Artifacts and boundaries

Only small verification records and selected candidate facts are committed:

- `keys-and-releases.json`: URLs, key fingerprints/hashes, signature outcomes.
- `indexes.json`: signed Release and compressed/expanded index hashes/bounds.
- `selected-candidates.json`: eight selected package records from those indexes,
  including exact versions, archive paths, hashes and declared dependencies.
- `signature-control.json`: changed-cleartext rejection result.

Immutable public candidates remain outside Git in the private0500 directories
`/home/ian/Projects/ianwijma/linuxcast/.worktrees/f102-public-debian13-metadata-20261101`
and sibling `f102-public-debian13-indexes-20261101`, with single-link0400 files.
No lab root, SSH key, private user-data, guest disk/log or live process data was
read. Public Debian metadata contains no application/user content.

Selected records are **not a resolved dependency closure** and no `.deb` was
downloaded. They cover build-essential, pkg-config and the six development
packages in the inventory. Package completeness, actual installed versions,
effective upgrades, maintainer-script effects, dependency ordering and exact
offline install/provisioning authority remain to be reviewed and implemented.
Host Ubuntu tools/binaries are not Debian build or runtime ABI evidence.

Primary source: https://ftp-master.debian.org/keys.html . Artifact URLs and
signed validity times are recorded in the JSON. The official announcement URL
returned403 in the web reader; no independent announcement verification claimed.

All F1-02/task/native/AT/full97/local1.0 gates and historical limitations remain
unchanged. Namespace proof implementation and offline provisioning research are
separate active lanes. This staging cannot create a native/build permit or
replace the actual current Debian build, source/archive custody and receipt.
