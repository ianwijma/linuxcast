# F1-01 workspace bootstrap

This implements the build workspace and scoped runners required by [F1-01](tasks/F1-01.md). It does not implement a desktop feature or establish the four-session release matrix. The authoritative criterion records remain in [tasks.json](tasks.json).

## Prerequisites and pins

Use Debian 13 amd64, Node 24.22.1, Bun 1.4.4, Python 3 and the Rust 1.95.0 minimal toolchain with rustfmt/clippy. Root `package.json` records the Bun pin and Node engine; `rust-toolchain.toml` records the compiler. Node-based tools run under Node, while Bun manages the workspace and named scripts. Electron retains its own embedded Node; the future isolated extension runtime remains Node 24.

| Tool | Pin | Reason |
| --- | --- | --- |
| Electron | 45.0.0 | Approved baseline; exact runtime archive checksum is supplied by its pinned package |
| React / React DOM | 19.3.1 | Matching renderer/server pair; compiled JSX and escaping smoke checked |
| TypeScript | 6.0.3 | Compatible with the selected ESLint parser and strict NodeNext/erasable TS; no emitted JS from validation |
| Tailwind / Vite plugin | 4.3.3 | Approved major; utility compilation checked |
| Vite | 7.3.7 | Approved build major; explicit in-memory bundling smoke checked |
| esbuild | 0.28.2 | Main/preload bundler and TSX transform smoke checked |
| Forge CLI / Debian maker | 7.11.2 | Approved packaging major, installed only; package production belongs to F1-03 |
| Vitest | 4.1.12 | Actual unit runner; no pass-with-no-tests or focused-only checks |
| Playwright | 1.64.1 | UI/performance runner installed; real Electron scenarios belong to their feature tasks |
| Rust / edition | 1.95.0 / 2024 | Stable pinned compiler, locked dependencies, no nightly features |
| age | 0.12.1 | Approved standard-format library, defaults disabled; build/test only at this stage |

Bun 1.3.9 was rejected during bootstrap: its package-script forwarding dropped `""`, turning an explicitly empty selector into an omitted selector. Bun 1.4.4 preserves it. A regression invokes the public named script with empty/unknown/omitted selectors, rather than testing only the internal argument parser. [Official Bun release](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.4).

`bun.lock` and `Cargo.lock` record transitive resolutions and integrity hashes. [Development inventory](../../scripts/test-runner/dependency-inventory.json) records available installed manifest licenses and lockfile hashes; missing platform/non-registry metadata is explicit. This is not the final package SBOM. Re-run `bun run inventory:bootstrap` after a dependency change. Native license metadata is recorded separately in `scripts/test-runner/rust-dependency-inventory.json`.

## Setup and checks

```sh
bun install --frozen-lockfile
bun run setup:electron
bun run lint
bun run typecheck
bun run test:unit -- F1-01
bun run test:unit
cargo test --workspace --locked
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
python3 scripts/validate_plan.py
python3 scripts/test_validate_plan.py
python3 scripts/plan_status.py
```

Electron 45 downloads its runtime lazily rather than from a package postinstall. `setup:electron` invokes the installed version's checksum-verifying installer explicitly; it does not use an unversioned executable downloader. Only esbuild's required lifecycle script is trusted by Bun. Forge's Vite/webpack templates are transitive development dependencies; the application build will use explicit Vite/esbuild entry points, not those templates or the experimental Forge plugin. [Electron installation](https://www.electronjs.org/docs/latest/tutorial/installation), [Bun lifecycle controls](https://bun.com/docs/install/lifecycle).

The build-only Debian environment is reproducible from `scripts/test-runner/Dockerfile.debian`:

```sh
docker build -t linuxcast-f1-01:debian13 -f scripts/test-runner/Dockerfile.debian .
```

Its Node base is pinned to `node@sha256:016f604a11c4c725f0a4c62e29ff11adab153d297bf97046c9bf2ddb9f1011d3`. Bun's official Linux x64 archive is verified against SHA-256 `bf8ccbfb2b0b80159e0f9a6d15c55317add8077534dbc6130a3edb52fccb395c`. Debian libraries follow security updates; the image is not a claim of byte-for-byte reproducibility. Rust checks used `rust@sha256:f49565f188ee00bc2a18dd418183f2c5f23ef7d6e691890517ed341a598f67c3`. Do not mount a desktop, user home, input devices or secret directories into these build containers.

## Runner contract

The small repository-owned runner validates the task ID against the authoritative registry, resolves exact files from `scripts/test-runner/suites.json`, rejects missing/escaping/symlinked test paths, and launches the underlying tool with a fixed configuration. Add a task's actual files to that coordinator-owned map as it is implemented; do not add placeholder passes.

| Invocation | Result at the F1-01 baseline |
| --- | --- |
| `bun run test:unit -- F1-01` | 20 tests across three files |
| `bun run test:unit` | All mapped unit files; 20 tests at this baseline |
| `bun run test:unit -- NO-SUCH-TASK` | Exit 2, unknown selector |
| `bun run test:unit -- ""` | Exit 2, explicitly empty selector |
| `bun run test:contracts -- F1-01` | Exit 3, checks unavailable |
| `bun run test:ui -- F1-01` | Exit 3, checks unavailable |
| `bun run test:integration -- F1-01` | Exit 3, checks unavailable |
| `bun run test:security -- F1-01` | Exit 3, checks unavailable |
| `bun run test:perf` | Exit 3, checks unavailable |
| `bun run package:deb` | Exit 3, packaging unavailable until F1-03 |

A missing applicable desktop/backend must remain a failed/unavailable check. A zero tool exit is insufficient: the runner checks the JSON report, rejects zero executed tests, skipped/todo checks, failures and flaky Playwright outcomes. Focused-only tests are forbidden. SIGINT/SIGTERM cancel the suite process group, escalate after one second, clean up descendants and return interruption (130). The regression verifies a live descendant exits, using only synthetic fixture processes. This is not privileged-input recovery evidence.

Both lint and typecheck are no-write commands. Tests use disposable fixtures/reports; Vite's smoke build writes no bundles. A local restricted execution environment can deny nested test spawns with EPERM. Run the checks in the described build container or an execution context that permits ordinary process-group tests; never record that denial as a product pass.

## Acceptance evidence and limitations

Validation date: 23 October 2026 (Australia/Sydney). Build platform: Debian 13.7 x86_64 container, Node 24.22.1 and Bun 1.4.4. Host: Pop!_OS 22.04 x86_64; it is not substituted for the target platform. The clean Node build copied source into a fresh container directory without host node_modules, target artifacts or caches.

- AC01: frozen clean install, explicit verified Electron download, and Electron 45.0.0 headless Node-mode loading succeed on Debian. Embedded Node is 24.22.0 and Chromium is 156.0.8078.48. This checks native library loading, not window focus or compositor behavior.
- AC02: scoped and full unit suites pass all 20 checks. Public empty/unknown selector rejection and actual failure, skip/todo/only rejection, missing mappings, path confinement and process cancellation are covered. Unimplemented suites/package commands return actionable nonzero outcomes.
- UI: not applicable; this task changes build tooling and creates no user-facing application view. No UI screenshot or keyboard-accessibility acceptance is claimed.
- PRIVACY: committed fixtures use public synthetic strings and contain no real credentials, input streams, private files or screenshots. Reports/inventories contain dependency/version metadata only.
- Rust: passphrase-stream round trip and authenticated corrupted-stream rejection pass with the pinned age library; rustfmt and clippy pass. Reference age/rage interoperability, bounded KDF/restore behavior and full backup security belong to F2-03 and remain unverified.

The [recorded Bun audit](../../scripts/test-runner/dependency-audit.json) exits 1: 18 advisories across braces, extract-zip, sprintf-js, tar and tmp in development tool dependencies. Forge 7's rebuild/packaging dependency tree includes these older tools. This bootstrap does not accept arbitrary user archives or ship these development tools as application code. Do not describe this as a clean audit or reuse these libraries for extension installation. Before package/release acceptance, upgrade or replace affected build paths with reviewed compatible versions and repeat security/license review; no untested major override was used to erase findings. Rust transitive vulnerability review and complete shipped-content licensing remain release work.

No application CI, native-addon ABI rebuild, .deb, real GNOME/KDE Wayland/X11 integration, screen-reader check or physical keyboard recovery is established by this bootstrap. Existing GitHub CI validates documentation/acceptance tooling; application checks above were run separately in the target build environment. Adding a build workflow requires a GitHub credential with workflow write scope; the current CLI credential has repo/read:org/gist scopes only.

The coordinator expanded F1-01 ownership to include its required Rust workspace files, lint configuration and this evidence document. That corrects an ownership omission in a card whose existing implementation step already required the Rust workspace; it does not change its requirements or dependencies.
