# Electron 45 runtime input preparation

Coordinator host preparation on 2 November 2026, from approved PR107 merge
`d5651a05aabb686ef3b6b3432d1ad076aaf90dc9`. This is public input and host cache
evidence, not an installed Electron runtime, Debian build or native acceptance.
No production, test, lockfile, execution pin or permit changes.

## Archive identity and static inspection

The frozen Bun lock SHA256 `42c4f16359d53c21beaa08ae5568c55808fedd0adfad45f6ad012cfef6528c93`
selects Electron45.0.0 and its downloader `@electron/get`5.1.0. Both npm archives
were rechecked directly against their locked SHA512 integrity before reading
the package manifests, installer, checksum map and downloader source as data.
The installed host package files used below also match those archives.

The checksum map inside that locked Electron archive selects exactly
`electron-v45.0.0-linux-x64.zip` with SHA256
`22f6a10bd3f7fef987ddbb379d3375ce664ad0c98a9a50f80c89f1718a0c3e3a`.
The downloader's default release URL is
[the official GitHub release asset](https://github.com/electron/electron/releases/download/v45.0.0/electron-v45.0.0-linux-x64.zip).
Collection followed one HTTPS redirect to `release-assets.githubusercontent.com`,
without ambient proxy, mirror, fallback or retry. The 123909792-byte archive
matches the pinned checksum. Acquisition took5.440s under a120s hard alarm,
20s socket timeout and256MiB compressed cap. This links bytes to the existing
lock integrity; it does not independently verify a release signature or establish
the original trust of that lock.

Static ZIP reading verifies CRCs and hashes all72 regular members,286798592
expanded bytes, including `version` equal to45.0.0. There are no directory,
symlink, special, encrypted, duplicate, escaping-path or set-ID entries.
The audit enforces member/path/per-file/total bounds and never installs payloads.

Six files have ELF64 little-endian x86-64 headers. Their bytes were temporarily
materialized as nonexecutable0400 data for bounded `/usr/bin/readelf -h -l -d -V -n`,
then the exact temporary files were removed. Readelf is the trusted reader;
none of these downloaded binaries was executed or dynamically loaded.

| File | Bytes | Highest referenced GLIBC symbol version |
| --- | ---: | --- |
| electron | 234483016 | GLIBC_2.25 |
| libffmpeg.so | 2794080 | GLIBC_2.17 |
| libvk_swiftshader.so | 4575144 | GLIBC_2.17 |
| libvulkan.so.1 | 2509496 | GLIBC_2.16 |
| chrome_crashpad_handler | 1683256 | GLIBC_2.17 |
| chrome-sandbox | 15216 | GLIBC_2.4 |

These symbol versions and DT_NEEDED names are static requirements, not a complete
CPU, library-closure, dynamic-loader, sandbox or guest ABI proof. Interpreter
records name `/lib64/ld-linux-x86-64.so.2`; the full library/version/property
inventory is in [elf-summary.json](elf-summary.json). Absence of a GNU ISA-needed
note is not proof that all instructions run on a particular CPU. Actual guest
loading and Chromium sandbox support remain untested.

## Host downloader cache controls

The pinned downloader5.1.0 hashes the default release directory URL, excluding
the filename, query and fragment. Its cache component is
`f22ed746d6afe4413723c1ec95408e33d6635bf7d817a70edb1df9220a236ab0`.
A separate read-only seed contains one independent single-link copy of the ZIP
under `<cache>/<component>/electron-v45.0.0-linux-x64.zip`.

An ordinary host Node24.22.1 child imports the actual pinned downloader library
from the earlier fresh Bun source copy. All39 regular Electron/get package files
were compared byte-for-byte with the locked archives before use and hash-checked
afterward. This executes downloader JavaScript, including its dependencies;
it does **not** execute Electron, the Electron installer, extraction binding,
SQLite compilation, lifecycle scripts, downloaded binaries or application code.
The package cache and source copies are not a Debian runtime installation.

The child receives scrubbed HOME/TMP/XDG/PATH, explicit linux/x64/version,
the bundled checksum map, private cache/temp paths and an injected downloader
that always throws. Exact API controls:

| Case | Result |
| --- | --- |
| Valid seed with bundled checksums | Returns exact verified seed path; zero downloader calls |
| Empty cache | One default-URL downloader call; injected refusal propagates |
| Valid seed with deliberately wrong checksum | Checksum rejects; one downloader call; injected refusal propagates |

This establishes checksum-checked cache consumption and exposes fallback:
the library attempts a download on a miss or mismatch. It is not an offline-only
API, and read-only cache mode likewise does not promise offline operation.
A later guest worker must enforce network denial; no kernel network denial was
installed or verified in this host test. No actual transfer was performed by
the injected downloader. No mirror/remote-checksum/override flag was used.

The three controls pass in0.593s. Existing FixtureGuard independently retains
pidfds, supervises the exact child and verifies reaping/ECHILD, with a30s child
alarm and2s cleanup bound. The seed inode/mode/hash and all checked package bytes
remain unchanged; the API temporary directory is empty. No broad process scan,
host desktop, guest, lab reservation or privileged operation occurred.

## Retained evidence and remaining work

- [Artifact and locked-source bindings](artifact.json).
- [Measured summary and controls](summary.json).
- [Retained collector, auditor, readelf and host fixture bindings](retained-bindings.json).

Public artifacts/static reports are sealed outside the lab in
`f102-public-electron45-runtime-20261102` and
`f102-public-electron45-audit-20261102`. Own host fixture records/seed are in
`f102-host-electron-cache-controls-20261102`. Raw archive bodies and extracted
runtime payloads are not committed. Helpers are retained prototype evidence,
not a new approved guest transfer/extraction authority or production installer.

Capacity admission must include the124MB ZIP,287MB runtime, cache copies,
compiler/JS inputs and scratch; these sizes alone prove no capacity gate.
Transfer/materialization custody, enforced offline behavior, installer/extractor
review, upstream toolchain authentication, actual guest CPU/library/ABI/sandbox,
immutable source/build/receipt and native/session/AT/recovery/release gates remain
pending. Historical timeout-descendant absence remains unknown.

F1-02 AC01/AC02/privacy statuses remain historical and unchanged. UI/full-task
acceptance remains pending; all97 tasks and complete local1.0 scope are preserved.
Independent review is still required for this preparation evidence.
