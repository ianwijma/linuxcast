# F2-02 runtime ownership preparation — 1 November 2026

Built on merged PR83 cd7bf0e in codex/f2-02-credential-runtime. This next increment
is in progress; main/UI wiring and independent review remain required.

CredentialRuntime owns one SecretStore and replaceable observed-session children.
Its stable admission adapter denies during generation changes, suspend, close or
storage-owner loss. Old callbacks are identity-checked. Restart coalesces, waits
for old shutdown and never creates a replacement while cleanup is unverified.
Resume drains any older attempt before starting fresh. Explicit custom-factory
failure cannot fall back to the packaged helper. Close coalesces even reentrantly,
starts helper termination/store clearing independently of pending initialization,
retains late-opened ownership, drains operations and rejects unverified shutdown.
Temporary credentials survive a verified session restart unless clear policy says
otherwise; failed/old leases never regain access.

The main-owned storage service now exposes boolean onReadiness notifications for
initial readiness, failure/exit and stop entry. It isolates throwing subscribers,
checks current state for reentrant callbacks and respects removal within a batch.
No renderer channel/repository API or host operation is added by this hook.

Current validation:115mapped F2security (9new runtime+6storage-readiness checks),
fulltypecheck/lint/plan pass. Runtime tests use controlled trusted session doubles
and private real stores; readiness tests use an owned process-event double.
Actual existing production diagnostics Electron smoke passes1/1 in6.16s after
this hook, on pinned Node24.22.1/Bun1.4.4/Electron45/private Xvfb on Pop!_OS22.04.
It proves the existing lifecycle regression only, not use of the new runtime.
Screenshots remain unchanged; no new UI exists here. Parent will integrate the
narrow credential-settings wire and actual setup/status flow before publishing
this next bounded PR. Native/session/keyring/provider and full1.0 acceptance stay
pending. No production instance of CredentialRuntime is wired yet.

Continuation1November2026: the coordinator has now wired this runtime to main
suspend/resume/storage-readiness/shutdown and the dedicated credential setup UI.
The previous paragraphs record the unenabled preparation checkpoint, not the
current application state. See apps/desktop/evidence/credential-settings/README.md
for the bounded current application evidence and remaining native/review gates.
