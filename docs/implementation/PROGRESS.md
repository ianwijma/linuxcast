# Coordinator checkpoint

The complete local 1.0 goal remains active; no application task has completed integration and acceptance.

- Integrated prerequisites: criterion-level acceptance tracking PR #2 (`a7d8d18`); approved Bun workspace documentation PR #3 (`4cf9504`). All 389 criteria were pending on that baseline.
- Active task: F1-01, `docs/implementation/tasks/F1-01.md`; worktree `/tmp/linuxcast-f1-01-bun`; branch `codex/f1-01-bun`, based on develop `4cf9504`.
- Earlier work preserved: `/home/ian/.codex/worktrees/f1-01-bootstrap/linuxcast` contains uncommitted pnpm bootstrap files; superseded by the approved Bun task. Do not overwrite or use its old package manager contract.
- Implemented in active worktree: pinned Bun workspace/lockfile, Electron 45/React 19/TypeScript 6/Tailwind 4 toolchain, scoped Vitest/Playwright runner, strict invalid/unavailable selector failures, Rust 2024 workspace pinned to 1.95.0 and age 0.12.1 smoke check.
- Evidence so far: plan validation and 21 Python regressions pass; local lint/typecheck pass. Frozen dependency install resolves in a clean Debian 13.7 amd64 container using Bun 1.4.4 and Node 24.22.1; lint/typecheck, scoped/full 20-test suites and explicit empty-selector rejection pass. AC01/AC02/PRIVACY have evidence; UI is conditionally not applicable. F1-01 remains in-progress until independent review and integration.
- Rust: Debian 13 container `rust@sha256:f49565f188ee00bc2a18dd418183f2c5f23ef7d6e691890517ed341a598f67c3`; `cargo test --workspace` passed age passphrase round trip and corrupted-stream rejection; Cargo.lock generated. This proves build compatibility, not backup feature acceptance.
- Debian Node build image: `node@sha256:016f604a11c4c725f0a4c62e29ff11adab153d297bf97046c9bf2ddb9f1011d3`. Container access and network dependency installation require normal environment escalation; authorization is in the goal objective.
- Next: independent review of the complete F1-01 change; open a focused PR, inspect current-head CI/reviews, then integrate. Record the resulting integrated commit before marking F1-01 done.
- Limitations: real GNOME/KDE Wayland/X11, keyboard devices, packaging, native-addon rebuild and product UI checks remain outstanding in their owning tasks. Empty suites/package commands return explicit unavailable errors, never success.

- Bun 1.3.9 was rejected after the public command dropped an empty selector; the pin is now 1.4.4, verified by the public-script regression. The Debian build image is local ID `6188a7225ee2`; exact source/verification recipe is in `scripts/test-runner/Dockerfile.debian`.
- Review evidence: `docs/implementation/bootstrap.md`, development/Rust inventories, recorded audit (18 advisories; not clean), and `scripts/test-runner/evidence/F1-01-debian.log`. Native tests/rustfmt/clippy also pass.
