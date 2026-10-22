# Coordinator checkpoint

Updated 2026-10-22 21:35 UTC. Continue the complete local 1.0 goal through all 97 tasks and R1-03; no intermediate milestone completes it. Objective: `/home/ian/.codex/attachments/09b70486-6ade-40a1-87c8-782c56ddf478/goal-objective.md`.

Main `/home/ian/Projects/ianwijma/linuxcast` is clean at `fc0b6ee62cda1f783c4318147ea23ec3fc4683f5`: **5 accepted / 92 remaining**, 2 in progress, 90 planned. Plan validates. No new planned task is dependency ready; finish S0-01/S0-03 before F0-01. Historical checkpoints: `/tmp/linuxcast-checkpoint-history-2045.md`, `/tmp/linuxcast-checkpoint-history-2133.md` and signed Git history.

## User boundaries

- Use actual Pop!_OS22.04/GNOME42.9 X11 host for authorized own-window/private-selection checks. This does not replace Debian13/GNOME48/Plasma6.3 release requirements. No physical keyboard stream has been opened or grabbed.
- **Leave host system policy unchanged:** no CPU delegation override, session/service restart, device/group permissions or input grants.
- Public reviewed source and synthetic evidence pushes explicitly approved. Never export keys/disks/private logs/input/clipboard content.
- User unlocked1Password; normal Git signing works. Preserve configuration. Local signature verification lacks an allowed-signers file; commits contain normal SSH signatures, no bypass.

## Accepted integrations and active branches

Accepted F1-01 PR4/5; S0-05 PR7/8; S0-04 PR9/10; S0-06 PR11/12. S0-02 source PR14 merged `ac3e8eba5a604aa31d58b8bd9a6c37dbc96960ce`, completion PR16 merged `fc0b6ee62cda1f783c4318147ea23ec3fc4683f5`. Final source head3244540 CI39854013571/job120087364942; completion head2a33fbd CI39854553291/job120089231561. Independent source/artifact/criteria/metadata/checkpoint review CLEAN; no requested GitHub reviewers/comments/reviews/protection/rulesets. S002 all bounded criteria accepted; unresolved placement SIGSEGV is explicitly carried into F0-01/P1-03/P1-05, production bridges/X11/full release matrix still required.

| Work | Isolated worktree / branch | PR and current state |
|---|---|---|
| S0-01 | `/tmp/linuxcast-s0-01`, `codex/s0-01-launcher` | Draft PR15 published `d8b6f6e8cedfe76e5c97fdac6a0ebe81940f9cab`; current CI39854073475 green |
| S0-03 | `/tmp/linuxcast-s0-03`, `codex/s0-03-input` | Draft PR13 published `3a2bffc53660d946261ede9c47fc4eaaab85bcbe`; new reviewed source/evidence signed5cd8f7b; shared147c7ea committed; merge/push pending |
| S0-02 completion | `/tmp/linuxcast-s002-accepted`, `codex/s0-02-accepted` | PR16 merged; no further work |

Root owns shared Cargo/registry/cards/checkpoint/integration. Agent `/root/review_f1_01` owns S003 input paths except Cargo; `/root/s0_05_provider` owns S001; `/root/s0_06_workflow_ui` performs read-only independent review. Do not regress accepted main metadata when merging older branches. Existing CI is planning-only; full application CI is future work, gh lacks workflow scope; no bypass.

## S0-03: actual outcomes and commit queue

Frozen source diff `/tmp/linuxcast-s003-denial-source.diff` SHA `d83d44dd8d096cbd59cc9e91867ee042ff647605ad22031bd05c3df3b82b3892`, 17 owned inputs, excludes coordinator Cargo. All remain unchanged. Root independently passed23 Rust checks,10 new private helper cases including actual parent-death/7s guard,9 old wrapper cases, clippy/fmt; no skips. Actual kernel peer transport/private mocked sessions are distinguished. Supervisor remains explicitly manufactured synthetic; ordinary-UID denial helper cannot Allow/Arm/Renew. Source/execution was dirty/unsigned atop3a2; later signing must preserve that provenance.

Exact new probe b6c526b5bb853cab416b27bea36c0b216c2cd11bd946de266dc7e301eef7b7d4; helper f0e96dbc18b9a2726b52f3a80ad9b0b6f8e2973146d849a48c2d90f563b1a9e2; refactored supervisor2e959061d64eff7e2e051cc8ec402d0270512a9dd8bc1cbbd184675604d9953d. Reused earlier accepted worker45fae18d283eee7bfbff39fbe060b29c040d951db248d04bc5aa5eba1ce00eb8/lab9211ceb29ae2373717f2fc74d591544898ac2931c3f83deaf21186b7b6da7e51, no full-rebuild identity claim. Prior supervisor1060b44313a1536926d89303625b9f91272a1f59a5d05ac803e026843e11ef7a restored.

Reviewed8-collector manifest `/tmp/linuxcast-s003-denial-collectors.sha256` SHA `9da26182246f7b1ac8958fbd28ec70e8321279b07693ace23dd62734bb35a170`. Root+006 full review CLEAN; root independently ran harmless cleanup/schema fault tests PASS. Fixes cover independent restoration, owned temp collisions/inodes, exited/reaped leader/orphans via retained pidfds, partial spawn/acquisition failures, cancellation and exact child signal-mask restoration. Do not modify this historical freeze or rerun its experiments.

Actual evidence under `spikes/input/evidence/`:
- Initial missing-runtime preflight48558553 remains failed. Create-only same pinned tools then corrected preflight4e7e86e9 READY, no input/GUI effects.
- ExactlyONE SSH-T capture `denial-guest-ssh.json` SHA8451c675b51eb0aa633ccd40b0c19a8c19515a5930cc30871186cbabeffd2754; exactlyONE SSH-tt capture88d897d1a66775705b4d1dd7bf691951531d75988a37d2cf24df549a509ba708. Each20 strict five-field rows, exit0/stderr0,4941.081/4942.378ms. Decision Pending then latched Remote; evidence later PeerDead; no Arm/revival. Root+006 independently reviewed CLEAN. Device-free negative consumption only, no actual supervisor enforcement.
- Preparation099c742b,17353-file source/package manifest7fb05b9b. ExactlyONE manufactured kernel/mapped run `denial-kernel-regression.json` SHA `f0aab921a8e525a183c2b56fe86c2390ffde3d4113e86a7d892db7828d2b5be8`: native14 scenarios and mapped2/2 PASS/exit0 BUT outer experiment **FAILED_UNRESOLVED**, survivingGroupDetected/phaseFailed true, withinCleanupBudget false. Total elapsed34070.008ms; per-step cleanup duration/child state not recorded. Do not infer zombie/hash-cost cause or call overall gate passed. Other14 end-safety checks true, including process/device absence, marker removal and exact original native artifacts restored.
- Frozen control.release correctly blocked. Separate necessary-release source8db13ffa6520068f95145a856da2b9dcb94d260d2b74592c5d6becf79f05f69f independently reviewed; ran exactlyONCE. `denial-reviewed-release.json` SHA `7242249119ab281d968be18ff12f763c7dad16dbd56be90e02cc6431c85a3e90` PASS resource cleanup only, wrapperGatePassed=false/originalf0a unchanged. Fresh before/after safety/native hashes pass; all5 created tool paths/stages/nonce copies/private state removed. Guest returned CLEAN. Root+006 artifact review CLEAN. No further S003 guest action authorized.

Public reproducible evidence: collector bundleef4426d3/mapping1e620b42 exact11 bounded regular source members; frozen17 diffgzip44d0 decompresses d83; exact Cargo snapshotf111/registrationf7c93 separate13-line target change. Final `denial-actual-results.md` SHAfe94321e314075b85a2b6cb202eecf062649685c3ae1ccd543bc8943538920e2 /JSON42f07442b2632f9cae46803d5fe59d803781ca537b1703a5e3d65b2184c8b0cf map all14 artifact hashes and explicit unsigned execution/earlier binary reuse. Root+006 final notes/provenance/metadata CLEAN.

**Immediate integration queue:** Agent003 signed owned34-file commit5cd8f7b8386f549e12e208a986d4961225b62001, all17source hashes match frozenexecution; signature verified with ephemeral configured-public-key signers file, no configuration change. Slot released. Root shared Cargo/registry/card/checkpoint commit147c7ea is signed. Accepted developfc0 merge is in progress, PROGRESS resolved to this current checkpoint; S002 and accepted tasks preserved. Combined typecheck and21 plan regressions pass; stage resolved files/sign merge/push draftPR13 pending. No task merge/AC closure or new VM/source increment yet.

Next bounded source increment after current commit: trusted root-to-ordinary helper bootstrap and live veto in actual supervisor BEFORE device/worker bootstrap. Preserve parent authentication, trusted accepted-peer duplicate/generation, empty groups/caps/env, FD allowlist, no Allow and fixed6s engineering lifetime/nonblocking watchdog. Current supervisor starts worker before client and uses fixture context. AC01 physical-held/compositor recovery and AC02 locked/inactive graphical enforcement remain required; sandbox socket denial evidence must survive. No host policy changes.

## S0-01: reviewed runtime, pending collector cancellation fix

Both actual native Wayland launcher paths pass strict own PID/app/backend/geometry and resident Close/reopen/singleton/toggle/quit, with own-renderer dark/light screenshots. Signed coordinator6a8cc5f records partial AC01 focus-or-component-requirement evidence on branch; AC02/UI/task remain pending for X11/other gates. Host52/52 and DebianOrca48 five focus/presentation/delivery checks are separate. Public PR15 body matches d8b and stays draft.

Last actual GNOME X112111 run20:30 failed initial identity, no parsed observer response; startup through first tick but no validated requests, INFO_UNAVAILABLE. No cause/Close remedy inferred. Prior13b initial-success/post-Close failure and398c initial failure preserved; KWin X11 ambiguous own-PID candidates safely inspect neither. No new native run yet.

New prevalidation runtime11 patched files/24 runtime inputs match signed d8b and are independently reviewed CLEAN;123/123 preparation pass. Eight fixed categories preserve same polls/default decoder/strict target/no replay, no raw values. Manifest56f2e4270f49b516c3f4d52581310040288f346560730a5bff55e9798b02faf9 (24inputs/3outputs). Immutable `/tmp/linuxcast-s001-prevalidation-51ed-immutable/source.tgz` SHA8bf63ea7ca5ba79932a60095c1172a6422642a304a2d2cf137a9f09d87bef28d, authorityed9ea0711b1d797ab9179a8803a9131949ac09b7b3265352f6735c1357332b83; original constructiona3+51ed dirty/unsigned, whole archive is NOT signed d8 Git tree. No changes to immutable authority.

Concrete collector/orchestration bundle `/tmp/linuxcast-s001-collector-review` first manifest87989d,40 harmless checks passed. Root+006 reviewed authority/export/schema/cache/tool pinning/postrun raw+verified manifest checks. Sole remaining006P2: repeatedHUP can interrupt Supervisor teardown before root removal. Agent001 fixes orchestration only and adds full guest-phase harmless detached TERM-resistant descendant/repeatedHUP regression; must refreeze code/tests/pins and obtain root+006 CLEAN BEFORE execution. **NO S001 guest/staging/native permission yet.** After CLEAN schedule exactlyONE GNOME X11 on immutable51ed, original45/180/240 budgets, no retries/readiness waits/widening/source edits. KWin X11 own native-XID/getClient membership remains proposal only.

## Lab and tools

Guest reservation is now ROOT/free after verified S003 release; no active test processes/marker/staging. Container linuxcast-s0-04-vm started19:15:11UTC and expires22:15UTC. Coordinate clean shutdown/restart before expiry; never interrupt experiment. Future boot defaults cloud kernel unless guest-only one-boot generic selection is set. No host policy change.

`/tmp/linuxcast-vm-lab`: unprivileged/capdropALL/NNP QEMU TCG2CPU2GiB, no host devices/home/session/cgroup/Docker socket mounts or published ports. Debian13.7 generic6.12.113, systemd257.13/libevdev1.13.4, GNOME48.7/KWin6.3.6/GJS1.82.3/Mesa25.0.7. Transport fixed docker exec SSH loopback2222, /lab/test-key/known_hosts; never read key contents/disks/seed/raw serial.

Persistent S001/S002 guest tools `/home/debian/linuxcast-tools/bin/{node,bun}` are distinct from S003 temporary fixed paths, now all5MISSING after owned release. Host Node24.22.1 `/tmp/linuxcast-node24/node` SHAe32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb; Bun1.4.4 `/tmp/linuxcast-bun144/bun-linux-x64/bun` SHA10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235. Guest /tmp987MiB; use owned home staging for large installs. Rust1.95 image linuxcast-s0-03-context-build:debian13 SHAd99e0a39fcbca61433ce22b65842f7dc8c81b3df0f5ffd04b2ad767c879d557a/cache/tmp/linuxcast-s003-cargo-cache.

Continue goal actively: publish reviewed progress, finish remaining feasibility mechanisms/proofs, freeze contracts, then all features/release gates. Do not mark goal complete or blocked while useful authorized work remains.
