# S0-05 acceptance evidence

Recorded 23 October 2026. Worktree `/tmp/linuxcast-s0-05`, branch `codex/s0-05-provider`, base `23488c0` (F1-01 already integrated through PR 4 / develop `e3f9a769467a903d5d257c644d1afcd06d0afb50`, with accepted prerequisite tracking). Implementation scope is `spikes/ai/` only; the coordinator supplies shared TypeScript include/test-runner mappings.

## Platform and commands

Observed host: Pop!_OS 22.04 LTS, Linux x86_64, Node 24.22.1, Bun 1.4.4, TypeScript 6.0.3, Vitest 4.1.12. This is **headless host/transport evidence**, not Debian desktop/session, packaged-client, Wayland or X11 proof.

| Command/check | Result |
| --- | --- |
| `BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/linuxcast-s0-05-bun bun install --frozen-lockfile --ignore-scripts` | Exit 0; 627 pinned packages installed. Restricted-network attempt failed DNS, authorized network retry succeeded. No manifest/lockfile change; dependency lifecycle hooks were deliberately not needed for this broker-only check. |
| `bun run typecheck` | Exit 0, includes all spike sources through coordinator include. |
| `bun run lint` | Exit 0, zero warnings. |
| `bun run test:contracts -- S0-05` | Exit 0; 63 executed tests, two files, no skip/todo. Includes actual local HTTP native-fetch success/drop/cancel fixture. Sandbox initially denied local bind; successful run used authorized loopback networking. |
| `bun run test:security -- S0-05` | Exit 0; 26 OAuth boundary checks. |
| `node spikes/ai/live-smoke.ts` with no opt-in | Exit 3 with actionable unavailable message; no credential lookup or request. |
| `python3 scripts/validate_plan.py` | Exit 0; local planning integrity passed (279 sources, 57 features, 97 tasks). |

The public commands used the pinned Node/Bun executables via the temporary task PATH. Local loopback fixture traffic uses only `synthetic-key`, public hand-authored text and an inert synthetic tool; nothing uses a real provider account. The one real-network fixture has assertions on visible provisional content before cancellation/disconnect, rather than merely testing a parser's expected output.

## Criterion mapping

| Criterion | Direct evidence |
| --- | --- |
| `S0-05-AC01` | `provider.contract.test.ts`: UTF-8 fragmentation (1/2/7/8192-byte chunks), CRLF/multi-line SSE, comments/accounting frame; partial EOF/transport throw/disconnection, malformed JSON/UTF-8, errors after headers, HTTP 401/429/502, missing/duplicate terminal, late data, unknown delta, output/timeout limits, and cancellation. Failures/cancellation preserve provisional text without `committedText`; terminal event is mutually exclusive and sequenced. The real HTTP fixture verifies native fetch does not commit after partial TCP loss. |
| `S0-05-AC02` | `provider.contract.test.ts`: incomplete/unoffered/invalid tool arguments never execute; completed valid request pauses; denial, revoked policy and cancelled approval execute zero times; concurrent/repeated approvals and reconnect execute one time; restart with dispatching outcome never replays; failed dispatch-intent persistence prevents execution; cancellation/failure during effects remains outcome-unknown and requires review. A hanging tool that ignores abort settles at its persisted deadline and neither late resolution nor reconnect can commit/replay it. |
| `S0-05-UI` | Proposed not-applicable: host-only feasibility code, tests and opt-in developer CLI. No product UI, renderer or user-facing application behavior is introduced. `DESIGN.md` review gate and relevant chat interrupted/approval states were read; actual UI evidence belongs to later integration. |
| `S0-05-PRIVACY` | All checked-in fixtures are explicitly hand-authored public synthetic strings. No traffic recording, file/CLI credential discovery, credential persistence, browser cookies, real keys, account data or screenshots. Tests seed synthetic secret strings into transport/provider/tool/verifier errors and verify safe classifications/no credential or prompt in host run metadata and no tokens in OAuth metadata. Smoke emits an operational allowlist only. |

Official OAuth feasibility checks cover new versus returning client IDs, host reuse, exact resource/scopes/redirect, fresh PKCE/state/nonce, listener assertions, invalid/duplicate callback state, denial, replay, account mismatch, verifier failure, issuer/audience/nonce/safe-integer-expiry checks (including NaN/Infinity/fractional rejection) and independent plan-scope permission. Official source references and exact implementation boundary are in [README.md](README.md).

## Limitations and downstream gates

- No opt-in credential was supplied, so **remote OpenRouter inference and account-specific eligibility were not tested**. The smoke route exists and is deliberately unavailable by default. No paid request was sent.
- OAuth documentation establishes a supported registration route, not successful registration of Linuxcast or any real user's eligibility. This spike does not exchange real codes, ship a real JWKS verifier/listener/refresh/revocation implementation or call plan inference. Its verifier/listener seams are explicit fixtures; no result says ready for inference.
- The fixture journal demonstrates approval/reconnect state behavior; durable SQLite transactions, recovery after an actual process crash, global permission persistence and multi-process coordination belong to shared storage/permission/A1 integration.
- No secure credential persistence is implemented. Production integration must use the shared trusted SecretStore with real GNOME/KDE keyring tests and session-only fallback. It must reject insecure `basic_text`; upstream plaintext-file examples are not authorization to add such storage.
- No product UI/desktop integration, provider catalog/capability negotiation, harness, full provider matrix or release acceptance is claimed. No result here closes a future real-account, desktop, security or packaging gate.
- Independent review, coordinator integration, GitHub checks and task-registry acceptance recording remain coordinator-owned. This file does not mark S0-05 or the overall release complete.
