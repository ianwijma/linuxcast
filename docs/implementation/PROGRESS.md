# Coordinator checkpoint

Updated 2026-10-24 10:50 UTC. Persistent Goal ACTIVE: complete all 97 agreed local 1.0 tasks through R1-03. Objective: `/home/ian/.codex/attachments/78a55eec-f708-4e08-b951-d8db53af7f4f/goal-objective.md`. This is a current checkpoint; historical outcomes and exact provenance remain in the task registry/cards, evidence directories and Git history. No acceptance requirement changed.

## Integrated state and boundaries

Develop/origin remains `916835fc0feaad3add15910ec6537431eaa9f980`; primary tree clean. F1-01 and S0-02/04/05/06 are accepted: 5 done, 2 in progress, 90 planned; main has 16 passed criteria, 4 conditional not applicable and 369 pending. No other task is dependency-ready. Approved PR21 removed only S0-03 from F0-01 prerequisites. S0-01 still blocks F0 integration/freeze; P2-01 and release retain input requirements. No MVP, synthetic system success or physical/host input without specific consent. Optional input service remains disabled/stopped. Model prescriptions remain removed.

The user confirmed 1Password is unlocked. Normal signing and publication now work; no signing configuration changed. Signatures were verified against the existing configured public key with a temporary per-command allowed-signers file, then deleted. Fingerprint: `SHA256:izd3tAxNjVzQP/GI/Qg1dDwbJyroHLxZBCvx7jUWbfY`. Later signing never changes unsigned-at-execution evidence.

## Persistent worktrees and recovery

All active paths are under `/home/ian/Projects/ianwijma/linuxcast/.worktrees/`:

- `linuxcast-f0-01`, `codex/f0-01-contracts`, draft PR19, published signed `5679e6e20f4334711170c12ce462b83f9645b237`. This checkpoint is the only current edit.
- `linuxcast-s0-01`, `codex/s0-01-launcher`, draft PR15, published signed `5ca50bfae3d581872b76dda3ed389a5c0bc44ca4`, clean.
- `linuxcast-s0-03`, `codex/s0-03-input`, draft PR13, published `eedc502`, clean. Physical held-key/compositor recovery and authenticated locked/inactive device-owner gates remain pending; no selected physical-device consent.
- `linuxcast-s0-01-native-recovery`, `codex/s0-01-native-recovery`, based signed `2fcbdae`; active bounded source author lane below.
- Existing `linuxcast-f0-01-review` / `codex/f0-01-manifest-review` and `linuxcast-s0-01-review` / `codex/s0-01-reading-review` are review snapshots, potentially stale. Read current implementation branches for final comparisons.

Prior `/tmp/linuxcast-*` worktrees and private lab backing folders disappeared. Preserved indexes reconstructed the active trees; backups are in primary `.git/recovery-20261024/`. Do not prune missing worktrees or infer recovery of absent unstaged/untracked files. `.worktrees/` is excluded through `.git/info/exclude`.

Pinned tools are `.worktrees/tools/{node,bun}`. Node24.22.1 SHA256 `e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb`; Bun1.4.4 `10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235`. Frozen dependencies restored; host Rust1.95. Cargo subprocess tests require the normal permitted escalation, not weaker checks.

## F0-01 provisional preparation

Signed `9cbf70c` publishes the reviewed contract continuation; `5679e6e` merges develop's checkpoint-only change and records publication, with no contract/native/suite delta. Planning CI40086639831 passes. All 508 mapped contract checks, including three Rust fixture groups, typecheck, lint, browser bundle, native Clippy warnings denied and plan validation pass within their recorded source/platform scope. Independent bounded reviews and final normative interface inventory audit are clean.

Inventory now includes commands/views/capabilities/native IPC and outcomes, extension transport/settings/resources/manifest/integrity/package and session lifecycle, workflow values/graphs/subgraphs/NativeResultsV1/node registry, provider/catalog/selection/harness/effects/storage/tool registry, atomic view navigation/revisions/deltas/date fields and eight shared synthetic AI scenarios. Tests prove contract behavior; scenario expected call counts remain downstream obligations, not runtime engines or system effects. All F0 criteria remain pending/task planned; S0-01 acceptance and final current-head integration gates precede freeze.

## S0-01 evidence and current gaps

Draft PR15 proposes AC01/AC02/PRIVACY passed on its lane only; UI remains pending. Main has not integrated those proposals. Earlier actual isolated GNOME48/KWin6.3 Wayland and bounded X11 lifecycle findings retain exact limits in the card. Full GNOME X11 ordinary Show still leaves the decoy focused; native placement/effective shortcuts/full physical release matrix are not inferred.

Signed `d8e129e` publishes reviewed help-reading/scroll source and historical artifacts. The earlier `reading-incomplete/` run (9af33f checker) remains exit3 at Say All. The separate `reading-completed/` run, 08:15:13–08:16:05 UTC on unsigned checker9313a473, passes four native focus checkpoints, three essential END-callback reading progressions and Escape/Search. Ordinary speech markers establish generation/dispatch attempts only. Exact ten application inputs match the eight dark/light/zoom2/contrast/reduced-motion-emulation scroll images and axe0 audits. All recorded scroll offsets were zero; nonzero restoration and OS-wide preferences are not established. Historical executed README867f1c48 is preserved despite later docs edits. Each focused artifact set has reviewed source, privacy and cleanup evidence.

Signed `2fcbdae` adds only fixed `recordFocusEventReceiptObserved`, never a success predicate. Checker `ebce9905b85dc29841e28830ba7ca720aa8d832856a004e72c47d28c297e9ef8`, test `64637fa1135e2d5388f64980d707ab4663251ec7382b24b368ef20319214378f`, README `5bc594abed4159811626fa3e834ba0223e0f8aa763635ce97499373f2e39c591`; 71 mapped units including35 AT/type/lint and independent review pass.

Exactly ONE default-nine run on that signed subset ran10:41:50–10:43:07 UTC, exit3/incomplete at `focus:View activation help`. First five native/generated/dispatch-attempt checkpoints, including Record and Cancel, pass; Record receipt=true. Sixth native focus passes but fresh generated/attempt=false. Heading/landmark/SayAll/Escape are unreached. The old Record failure remains separate and undiagnosed. No retry or overall pass.

Signed `5ca50bf` publishes `spikes/launcher/evidence/activation-help/default-nine-help-transition-incomplete/`, accurate registry/card and three own-app dark/light screenshots. Independent artifact/prose review is clean; all13 public JSON/PNG copies/hashes match, all15 private checksums,335 signed Git blobs and five transferred archive entries verify.419 preserved evidence paths are explicitly excluded;754 is an integrity-entry count, not754 application source files or a whole signed checkout. `execution.priorReadinessSha256` identifies original fresh-guest readiness91d687, copied unchanged as `original-readiness.json`, not the current resume baseline. Planning CI40087481040 passes; PR15 description is current. No GitHub reviews/requested reviewers/review threads were present at prior inspection. Both PR15/19 stay draft and attached; no merge to develop.

Precise UI gaps: full default-nine accessibility sequence, now failing fresh help-button presentation after Record/Cancel pass; actual native visible-but-unfocused notice and manual desktop-selection recovery. Do not invent audible QA or full physical release prerequisites for the focused result, or weaken the four-session S0 exercise and later release gates.

## Active agents and next actions

`reading_review` is now authoring the minimal native-recovery increment in the new isolated native-recovery worktree. Owns only `spikes/launcher/tests/native-session/{check.ts,protocol.ts,artifacts.py,preparation.test.ts,artifact-canary.py,README.md}`. No app, compositor observer, new mode, shared manifest/lock or registry changes. The unchanged GNOME-X11 ordinary-show assertion must still fail overall/incomplete3. A separate diagnostic may send ONE private Alt+Tab only after fresh exact own launcher visible/unfocused, decoy focused, actual component-required state and visible notice. Recovery requires native same-launcher focus, decoy-not-focused, actual focused/available state and notice removal; retain before/after app-only images and original failure. No runtime authorized. Meaningful source/negative tests and independent review precede any reservation.

`launcher_reading` performs READ-ONLY investigation of the new help-button presentation failure using exact Orca48 source. Current sequence: focus Cancel without activating it; Escape to Search (DOM focus only); synthetic notice insertion; Dismiss anchor passes native/generated (attempt also observed); Tab reaches help natively but presentation fails. Available booleans establish no suppression branch/cause. Agent is proposing the smallest target-bound existing-log diagnostic; no edits or run authorized.

`manifest_review` completed final public evidence review clean and is idle. Root owns shared registry/cards, public evidence, integration and this checkpoint. Continue these bounded source tasks; no criterion promotion until required evidence exists.

## Private lab — stopped, no active reservation

Persistent mode0700 `.worktrees/private-lab`; container `linuxcast-native-lab-v4`, ID `674cd884c30e07cdaa12e8d238209adbb1af03fb18e92ea9fa80586d0c7f5098`. Ordinary QEMU/TCG2vCPU2GiB, outer UID1000/capdropALL/noNewPrivs/read-only-root/mem4g/cpus2/pids512, only private lab mount, no host devices/home/sockets/published ports. Container-loopback SSH only;3h boot limit. Old v2/v3 remain stopped with lost backing evidence.

Fresh Debian13.7 cloud kernel6.12.113+deb13-cloud-amd64 guest lacks the old generic-kernel/GNOME/KWin desktop packages. Orca48.1-1+deb13u2, AT-SPI2.56.2, SpeechDispatcher0.12, Electron45 hash `b36c3ce9b423098a7854f4912f730b0654b41ae183818f887b8f1cd0a90725eb`; 13 installed Orca sources match official48.1. Dummy speech provides no audible proof. Guest source `/home/linuxcast/preparation/source`; frozen651 dependencies, pinned runtime hashes above.

Latest private result `.worktrees/private-lab/results/record-receipt-default-nine-20261024T103936Z/`. Cleanup10:44:14:12 owned counts0, private roots/input marker absent;335 selected source+419 preserved evidence/runtime/13Orca/packages unchanged. Normal poweroff; root independently confirmed Docker stopped10:44:42.94744667Z,exit0,pid0. No guest reservation is active. Earlier focused private results and checksums remain preserved. Keys, seeds, serial, raw logs/profiles and disks must never be committed or printed. Host services/settings/groups/devices unchanged.

## Active continuation after 10:50 checkpoint

Checkpoint published signed a14131944d62e6ba7c80eb2f44fd1d51544084ae on PR19; planning CI40087621643 passes. S0 published5ca50bf/CI40087481040 unchanged.

Native-recovery author completed six-file source preparation,467fixtures (396existing+71new)/type/lint/AST/plan/diff pass. Independent reviewer ran71changedfixtures and found one publication mismatch: prior singleton-show did not require focused decoy, but new publisher did, potentially discarding a valid later recovery report. Author is aligning the old-row validation with its actual guarantees while retaining strict originalFailure/freshbefore/after proof, and adding the transient-prior-decoy regression. No runtime execution/acceptance. Narrow re-review needed after fix.

reading_review now also has exclusive PREPARATION-ONLY v4 reservation. Stopped/container-isolation preflight passed; ordinary v4 boot started, initial SSH banner timed out. No guest source/package change and no command active at last report. Agent will verify old335selected+419evidence/runtime/13Orca baseline and inspect Debian official apt simulation; package/boot plan goes to coordinator before installation. No compositor/Electron/AT/native test authorized. This supersedes stopped/no-reservation above.

launcher_reading now implements four fixed help-focus receipt/queued/dequeued/processing-completed observation booleans only in S0 implementation AT check.ts, activation-help-mode.test.ts and README.md. Exact event descriptor/queue identity remain private in memory; completion must follow matching complete frame, ambiguous sequences fail closed. No route enum, generic framework, mode/deadline/success-predicate changes or guest access. Relevant additional Orca source hashes must be verified prospectively; do not rewrite prior13sourceauthority. Root shared registry/evidence unchanged pending independently reviewed source.

## Reviewed increments and guest preparation in progress

Native publication mismatch fixed and independently re-reviewed clean:72changedfixturespass,396earlierunchanged fixtures retain prior pass. Six files signed42abbda in native-recovery lane and copied by signed cherry-pick5779554 into S0; all six blobs match. Evidence-only18cc4d9 published with planning CI40088254365 passing. Native-recovery worktree is clean; no native run.

AT four-boolean increment independently reviewed against exact officialOrca48.1 formatting/processing sources. Final first-boundary tightening rejects malformed/interleaved START/FINISH/TOTAL instead of skipping to a later finish. Author86mappedunit/type/lint/plan/diff and independent final50AT pass; earlier independent86pass predates final narrow delta. Signed/published55301bffde97ca3cf2a8bc893f8f39df7d0a3618 includes3AT files plus accurate source-onlyregistry/card; S0worktreeclean. Final check ec0bd47b0c225db2cab2d1e70ec8fbaef0b320283674bb4d0c5727f34f52e462, tests8e646c39e3e29683f3e3a2e8d25e10656e93fae382e216dfd47aa26472f5157c, README99d14706bb9913b14d47ce9e21c18cb104805ade1b5c0d18625b470537f0a146. PR15descriptionupdated; headplanningCI40088644516passes. Signature18cc/553verifiednormalkey. Noactualrun/acceptancepromotion. Launcher author and manifest reviewer idle.

Exclusive VMpreparation remains reading_review. Concrete apt plan was reviewed/authorized: official pinned GNOME Shell48.7-0+deb13u2,Mutter48.7-0+deb13u1,GJS1.82.3-1,MesaEGL25.0.7-2+deb13u1,linux-image-amd64 6.12.113-1;217new,0upgrades,0removals,4held, nogdm3. CloudkernelDRMdisabled;generic6.12.113+deb13-amd64 is capability preparation, not a diagnosed requirement/fix. Temporary guestpolicy-rc.d101 suppresses servicestarts and must restore priorabsence. Guestmulti-user.target; inspectgeneratedGRUB/selectgenericonce, orderlypoweroff/samecontainerrestart, verifyreadonlymetadata thenstop. Agentreports165unpacked/0configured,lastboundedcheck,nodownloaderrors; no source sync/tests. Source2f335selected/419preservedevidence remainsunchanged. Prospectively compare five ATREADME Orca hashes (threeadditional toold13) separately. Records private-lab/results/native-preparation-20261024T110028Z/ contain baseline/proposal. Rawlogs/seeds/keys/serialprivate. No compositor/Electron/AT/native run is authorized yet.

Root prepared local-only `.worktrees/private-lab/prepared-source-55301bf/` with335signedGitblobmanifest and eleven changed existing source/doc files in signed-changes.tar plus SHA256SUMS. All member modes match Git100644. Source55301bffde97ca3cf2a8bc893f8f39df7d0a3618; prior2f manifest hash205efa27.419excludedpreservedevidencepaths remain explicit; no guest transfer/test authorization. Preparation agent knows the package is for later reservation only.
