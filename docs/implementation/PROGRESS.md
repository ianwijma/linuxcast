# Coordinator checkpoint

Updated 2026-10-24 11:25 UTC. Goal ACTIVE: implement all 97 agreed local 1.0 tasks through R1-03. Objective: `/home/ian/.codex/attachments/78a55eec-f708-4e08-b951-d8db53af7f4f/goal-objective.md`. This checkpoint supersedes earlier activity summaries; exact historical evidence remains in the S0 task registry/cards, evidence directories and Git history.

## Integrated state

Develop/origin is `916835fc0feaad3add15910ec6537431eaa9f980`, primary tree clean. F1-01 and S0-02/04/05/06 accepted: 5 done, 2 in progress, 90 planned; 16 passed criteria, 4 conditional not applicable, 369 pending. Plan validation/status rechecked11:24; no other dependency-ready task. Approved PR21 removes only S0-03 from F0-01 prerequisites. S0-01 still blocks F0 integration/freeze. P2-01 and release retain privileged-input gates. No scope reduction, fabricated evidence or physical/host input without specific consent. Optional input service remains disabled/stopped.

User confirmed 1Password unlocked. Normal signed commits/pushes now succeed; no signing configuration changed. Signatures checked using the existing public key and temporary per-command allowed-signers file, then removed. Fingerprint SHA256:izd3tAxNjVzQP/GI/Qg1dDwbJyroHLxZBCvx7jUWbfY. Later signing does not change unsigned-at-execution evidence.

## Worktrees and publication

All under `/home/ian/Projects/ianwijma/linuxcast/.worktrees/`:

- linuxcast-s0-01 / codex/s0-01-launcher: signed published55301bffde97ca3cf2a8bc893f8f39df7d0a3618, clean, draft PR15; planning CI40088644516 success. PR description current. Lane proposes AC01/AC02/PRIVACY passed, UI pending; not integrated.
- linuxcast-f0-01 / codex/f0-01-contracts: remote signed a14131944d62e6ba7c80eb2f44fd1d51544084ae, draft PR19, CI40087621643 success; local signed e8e8ba7 plus this updated checkpoint not yet pushed. Contract source unchanged since9cbf70c.
- linuxcast-s0-01-native-recovery / codex/s0-01-native-recovery: signed42abbda, clean; its six reviewed files cherry-picked as5779554 into S0.
- linuxcast-s0-03 / codex/s0-03-input: publishedeedc502, clean, draft PR13. Physical held-key/compositor recovery and authenticated locked/inactive device-owner gates pending; no selected-device consent.
- linuxcast-f0-01-review / codex/f0-01-manifest-review and linuxcast-s0-01-review / codex/s0-01-reading-review are potentially stale snapshots. Reviews read current implementation branches.

PR15/19 confirmed open drafts11:24, no requested reviewers. No acceptance-based merge yet. Earlier /tmp worktrees disappeared; recovered preserved indexes into persistent paths, backup primary .git/recovery-20261024. Do not prune missing worktrees or infer absent untracked recovery. .worktrees ignored through local .git/info/exclude.

Pinned tools .worktrees/tools/{node,bun}: Node24.22.1 SHAe32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb; Bun1.4.4 SHA10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235. Frozen dependencies restored, host Rust1.95. Normal permitted escalation needed for Cargo subprocess tests/Git writes/Docker.

## F0-01 provisional contracts

Signed9cbf70c publishes reviewed contract continuation; later commits are checkpoint-only. 508 mapped contract checks (including3Rust fixture groups), type/lint/browser bundle/Clippy warnings denied/plan pass; independent incremental and full normative inventory reviews clean. Definitions cover commands/views/capabilities/native IPC, extension package/transport/settings/resources/session lifecycle, workflow values/graphs/subgraphs/NativeResultsV1/nodes, provider/catalog/selection/harness/effects/storage/tools, atomic navigation/revisions/deltas/date fields, eight synthetic AI scenarios. Expected call counts are downstream obligations, not runtime proof. All F0 criteria pending/task planned until S0-01 acceptance and final integration checks.

## Current S0 evidence and source

Actual isolated GNOME48/KWin6.3 Wayland and bounded KWin X11 lifecycle results support lane AC01/AC02; physical/full-session/portal gates remain separate. Relevant new UI still needs full default-nine accessibility and actual visible-unfocused notice/manual recovery.

Historical help reading runs preserved separately under spikes/launcher/evidence/activation-help/: reading-incomplete (checker9af33f, exit3 at SayAll); reading-completed (unsigned9313a473,08:15:13–08:16:05UTC, exit0 focused mode). Focused pass establishes4nativefocus,3ordinarygenerated/dispatch attempts,3essential END-callback-driven reading completions and Escape/Search, not audible/ordinary speech receipt or full sequence. Six fixed JSON and own light help PNG independently reviewed. Prior eight affected-state/zoom2/contrast/motion-emulation screenshots match all10app inputs; scroll offsets all0, OS-wide preferences unproven.

Signed2fcbdae adds observation-only Record focus receipt. Exactly one default-nine run10:41:50–10:43:07 exits3 at focus:View activation help. First5native/generated/attempt checkpoints pass including Record/Cancel; Record receipt=true. Help nativefocus passes but generated/attempt=false; heading/landmark/SayAll/Escape unreached. Earlier Record failure remains separate/undiagnosed. Signed5ca50bf publishes13fixed JSON/PNG artifacts plus SHA/README in default-nine-help-transition-incomplete/. Exact335signed2f inputs+419preserved evidence exclusion provenance, three own images and clean cleanup independently reviewed. priorReadinessSha25691d687 references copied original-readiness.json, not latest baseline. Private result record-receipt-default-nine-20261024T103936Z; shutdown10:44:42 exit0/pid0. No criterion changed.

Native source5779554 / registry18cc4d9 adds only six native-session files: check.ts,protocol.ts,artifacts.py,preparation.test.ts,artifact-canary.py,README.md. Strict original ordinary-show failure retained and overall incomplete/exit3 remains. Fresh same-live-native-window/decoy/actual-state/visible-notice conditions precede dark/light captures, repeated conditions then ONE private Alt+Tab. Separate recovery needs same native launcher focused, decoy not focused, actual available state, notice removal/recovered image/finalfocus. No retry/newmode/app/observer/runner/dependency change. Initial467fixtures(396existing+71new); final72changed independently pass after fixing overstrict earlier-decoy publication assumption, type/lint/AST/plan clean. No native run yet. Native check d4e10bddfc0d855b2f13f2203c7f58e7ef515fa24b73e28d61264a38991d7660.

Signed55301bf adds four observation-only helpFocusEvent booleans: receiptObserved,queuedObserved,dequeuedObserved,processingCompletedObserved. Exact descriptor/queue identity stay in memory. Unique fresh ordered receipt/Queued/Dequeued/blank+START/first canonicalTOTAL+immediate matchingFINISHED required; ambiguity/malformed/interleaving/truncation fails closed. Polls recompute rather than latch. No success/deadline/mode/cleanup change. Processing completion alone is not presentation. Author86mapped/50AT/type/lint/plan; independent original86 and final50AT delta pass. Final checker ec0bd47b0c225db2cab2d1e70ec8fbaef0b320283674bb4d0c5727f34f52e462, test8e646c39e3e29683f3e3a2e8d25e10656e93fae382e216dfd47aa26472f5157c, README99d14706bb9913b14d47ce9e21c18cb104805ade1b5c0d18625b470537f0a146. Five official48.1 Orca hashes prospectively verified installed; old13authority unchanged (3additional unique files).

## Private guest and active reservation

Persistent0700 .worktrees/private-lab. Container linuxcast-native-lab-v4, ID674cd884c30e07cdaa12e8d238209adbb1af03fb18e92ea9fa80586d0c7f5098, outerimage sha256a1805464d68589e26be87a26cf7f8577a0b0dc494c88b1d14cb9cf7f155c4d10. TCG2vCPU/2GiB; outerUID1000/capdropALL/noNewPrivs/read-only root/mem4g/cpus2/pids512; private-lab mount only, no host devices/home/sockets/ports. Loopback-container SSH only;3h boot bound. Keys/seeds/serial/raw logs/profiles/disks PRIVATE never print/commit.

Guest /home/linuxcast/preparation/source; pinned runtimes in preparation, frozen651packages. Electron45 SHA b36c3ce9b423098a7854f4912f730b0654b41ae183818f887b8f1cd0a90725eb. Debian13.7, Orca48.1-1+deb13u2/AT-SPI2.56.2/SpeechDispatcher0.12 dummy (no audible proof). OfficialOrca48.1 archive66c6f09822149da243a4633a7d84a7b1dbaaf14534a9feb9df2bfe01a505178a.

Reviewed preparation completed pinned GNOME Shell/Mutter48.7-0+deb13u2/u1,GJS1.82.3-1,MesaEGL25.0.7-2+deb13u1,linux-image-amd64 6.12.113-1:217new,0upgrades/removals,4held,noGDM. Temporarypolicy-rc.d101 restored absent, dpkgclean,multi-user.target. Oldcloudkernel retained. One-shot GRUB generic selected and actual6.12.113+deb13-amd64 withDRM verified. v4currently running since11:15:56.717676686Z,pid1144197. One-shot consumed; futureboot not verified. Six preparation JSON/SHA independently verified in results/native-preparation-20261024T110028Z/. Handoff22b8a6e6e392e259eed8cc893118a67c0ec4574a2c46a47212860aa3b34bf7d6.

EXCLUSIVE GUEST OWNER launcher_reading. Fresh11:22 baseline all335old signed2f+419preserved/runtime/packages/old13+new5Orca match,18owned counts0/systemDBusUID996only/private roots+inputmarkerabsent. Only11approved changed existing100644 files+manifest transferred from locally verified prepared-source-55301bf. Final11:23:39 readiness all335 match signed553,419unchanged,runtimes/Orca/zero-owned baseline unchanged; manifest6665f4d3a62d2273af7fbcee7f3b1db5c683de3ede9dc433a7ebc1e24e06a30c. Exactly ONE default-nine xvfb-orca.ts now started, unchanged inner deadlines/outer290s+10grace. Result root results/help-event-default-nine-20261024T112114Z. No retry/source edit/diagnostic expansion/host access. Environment kernel/package difference must remain explicit, no A/B or historical-cause claim. Operator exports fixed JSON/own PNGs normally before cleanup; verifies source/runtime/Orca and owned cleanup, then hands guest running briefly if clean. No concurrent guest calls.

## Next actions and agents

manifest_review ready for independent final AT artifact review; no incomplete/raw-log inspection or guest access. Root owns public evidence, registry/cards, PRs and checkpoint.

reading_review finished read-only native execution plan and is idle, with NO guest reservation. After clean AT handoff, authorize separately ONE native GNOME-X11 full run. Use fresh real0700 staging copy of335verified signed files (no hardlinks/source-dir symlinks), only stage/node_modules symlink to trusted frozen existing dependencies; reverify source and resolve Electron/esbuild/Playwright. Build with pinned Node minimalenv; run existing run-session.py gnome-x11 --private-guest once, unchanged180sdriver/240souter. Publisher derives output from real HERE, so staging prevents overwriting419historical evidence. Normally copy stage's published report.json/source-manifest.json plus actually present allowlisted dark-launcher/light-capabilities/notice-dark/notice-light/notice-recovered-light PNGs before removing exact owned stage. Never feed already-published report through raw schema. Preserve strict original failure/overall exit3 even if separate recovery succeeds; source/manifest/images/exit/cleanup verified, old335+419unchanged. No native execution authorized until root's separate message.

Goal remains active. No task/criterion promotion or merge from source tests, successful CI or incomplete runtime results.
