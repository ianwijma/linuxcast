# F1-02 fixed Rust executable routing — preparation only

Implemented against exact base `89feb36f58c37ccd5fc170ab64196db2df49c9c5`
on `codex/f1-02-rust-build-routing`, following the coordinator's already frozen
`apps/desktop/tests/at/rust-build-routing-protocol.md`. No contract, task registry,
manifest, lockfile, source helper, controller, observer, driver, native wrapper or
pin changes belong to this increment. The commit containing this report is the
additive implementation handoff; no parent import, merge, rebase or reset occurred.

## Change and preserved boundaries

Previously the scrubbed build PATH omitted the separately provisioned Rust
directory. `product_staging.prepare` now checks the fixed ordinary directory
`/opt/linuxcast-f102-lab/rust/bin` and both ordinary non-symlink executable files
`cargo` and `rustc`, including effective-caller execute access, before constructing
the build owner or starting any build child. Filesystem failures and absent,
symlinked, special, nonexecutable or inaccessible declared tools reject with the
existing `ControllerRejected('prerequisite')`. No system Rust fallback is admitted
when these prerequisites fail.

PATH is exactly `Node-parent:/opt/linuxcast-f102-lab/rust/bin:/usr/bin:/bin`.
Caller PATH is discarded. This adds no runtime argument, environment option,
shim, downloader, rustup invocation or timeout. The existing Node subtree/mount
still has its separate `bin` and `bin/node` contract; no Rust tool is placed there.
No actual Node/Rust prefix was inspected or modified during this work.

The regression helper proves that reversing only the new prerequisite function,
its fixed constant/call and the PATH expression restores the exact base AST.
Thus cache/header seeding, CARGO_HOME/CARGO_NET_OFFLINE/npm offline routing,
cache immutability, source/lock/output checks, receipt schema and validation,
SessionOwner cleanup, total360s and child180s remain structurally unchanged.
Import is tested with filesystem probes and process creation forbidden.

Routing does not authenticate a distribution, pin a compiler or prove ABI.
Separately reviewed actual provisioning, preserved Rust sysroot layout, root
prefix/ancestor/payload custody, versions, hashes, ELF and distribution provenance
remain mandatory coordinator gates before use.

## Executed validation

Development checkout, ordinary private Python fixtures; pinned PATH was
`/home/ian/Projects/ianwijma/linuxcast/.worktrees/tools:$PATH`.
Node24.22.1, Bun1.4.4 and Python3.10.12 were directly version-checked. Distro,
kernel, lab, desktop/session and host resource facts were not reprobed.
Missing local dependencies were installed with
`bun install --frozen-lockfile --backend=copyfile --ignore-scripts`; no dependency
or lockfile changes, lifecycle script, SQLite setup or product build followed.
No parent cache inventory/warm-up or private lab read was performed.

- Targeted owned staging suite: all15 methods pass (the existing12 plus3 new).
- Full offline discovery: all402 tests pass in9.086s, no skips, failures or errors
  ([captured result](python-tests.txt)); this includes the399 baseline methods.
- `bun run test:security -- F1-02`: all55 checks pass in10.21s. Its unchanged18s
  wrapper completes the402 Python cases without skips/expected failures, taking
  9.186s ([mapped result](mapped-security.txt)). No runner changes.
- Whole-repository no-write `bun run typecheck` and `bun run lint` pass.
- Python AST/syntax, `python3 scripts/validate_plan.py` and `git diff --check`
  pass. [Source hashes](source-hashes.json) bind changed and unchanged inputs.

The new positive child first calls `shutil.which('cargo')` and requires the exact
private fake path before executing it. That ordinary Python fake similarly
requires the exact private rustc path before executing its known Python fake.
The child verifies complete scrubbed PATH, receives an ambient poison PATH, and
also resolves against a private poison system-candidate stand-in. No host cargo,
rustc, compiler, Node build or downloaded tool can be accidentally invoked by
an old-source run. Prefix/tool refusals cover17 fault subcases, including mocked
effective-caller denial without relying on host UID/mount policy.

All staging methods receive valid private Rust files so earlier guards retain
their intended boundaries. Owned staging child tests use a private
`SyntheticSessionOwner` that retains/reaps its exact ordinary Python children,
with no process discovery. The unchanged full suite also includes its existing
dedicated ordinary-child lifecycle/custody fixtures. None is native acceptance.

## Before/after and fault controls

Run `python3 -B apps/desktop/evidence/shell-native-at/rust-build-routing-preparation/check-regressions.py`
from the repository root. [Executed counts](controls.jsonl):

| Source/control | Behavioral failures | Errors |
| --- | ---: | ---: |
| Exact base, three new routing methods (17 refusal subcases plus positive) | 18 | 0 |
| Exact base, original12 staging methods with valid private tool fixtures | 0 | 0 |
| Current source, all15 staging methods | 0 | 0 |
| Exact bbbe813 old cache/header routing, positive child | 1 | 0 |
| Exact 2312fbd old cache receipt-name guard, file/symlink | 2 | 0 |
| Current with only post-build cache guard removed | 1 | 0 |
| Current with only source-addition guard removed | 2 | 0 |
| Current with only effective execute-access check removed | 3 | 0 |
| Current with only Rust PATH segment removed | 1 | 0 |

Every control has zero skips. The initial historical bbbe813 control stopped on
a harness import because that revision predates cache helper names. The final
test-only adapter supplies those unused helper imports from base; old `prepare`
remains byte-intact and fails its actual child cache/header assertions. Positive
fixture rejection is reported as an assertion failure, preserving its success
requirement. This corrected run, not the initial harness error, is the behavioral
evidence. Prior unrelated build-facts/projection/custody historical mutant results
are inherited, not newly rerun by this routing-specific control script.

## Acceptance mapping and limits

| Criterion | This increment | Status/remaining gate |
| --- | --- | --- |
| F1-02-AC01 | Existing mapped renderer/preload security checks rerun; no renderer changes | Historical passed evidence unchanged; no new native claim |
| F1-02-AC02 | Existing mapped dispatch/security checks rerun; no singleton implementation changes | Historical passed evidence unchanged; no new native claim |
| F1-02-PRIVACY | Synthetic public tools, caches, metadata and output; scrubbed routes; unchanged owner/receipt boundary | Historical status unchanged; actual build/session containment and cleanup still require fresh evidence |
| F1-02-UI | No UI change or screenshot | Pending supported UI/native/AT/desktop acceptance |

Independent review and fresh actual provisioning/toolchain custody are required
before use. No real owner CLI, root/namespace/statx/containment, Docker/SSH/guest,
package/locale/resource probe, compiler/build/receipt, provider, product/display/
bus/reader, native input or lab operation occurred. Parent observed metadata,
55-package candidates and JS-input reports are context only; their actual facts,
signatures, private artifacts and cleanup were not independently re-executed here.

No execution pin/permit/stage/cache installation was produced or refreshed.
F0-01 accepted status, historical F1-02 criteria, F1-02 in-progress/UI pending,
native/full-task acceptance, all97 task/dependency/criterion states and complete
local1.0 scope remain unchanged. No push, PR, watch or status promotion.

The single configured signing attempt failed in0.009s with
`1Password: Could not connect to socket. Is the agent running?`; Git created no
commit. The user-authorized per-command `-c commit.gpgsign=false` fallback is used
for this preparation handoff. Signing configuration and release signing gates
remain unchanged; the final handoff records the observed commit header status.
