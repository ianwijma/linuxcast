# S0-05: streaming and approval feasibility

This host-only spike implements real OpenRouter-compatible SSE parsing and a journal-driven run/tool lifecycle. It introduces no product UI, renderer, IPC, extension entry point or credential persistence. Its types are explicitly provisional input to F0-01's shared-contract freeze; they are not a second production broker contract.

## Behavior

- Each run snapshots the global profile/model/revision supplied by its trusted caller. Requests use that model, HTTPS, credential-bearing headers and `redirect: error`; no reroute/retry/fallback occurs.
- UTF-8, SSE delimiters/comments/multi-line data, content/tool fragments, final accounting frames and terminal markers are parsed incrementally. A finished choice, `[DONE]` and clean EOF are all required. Malformed, truncated, oversized, failed or cancelled streams retain provisional text and never set `committedText`.
- Complete arguments must match an offered trusted tool validator. The run then pauses for approval without executing. Denial or a revoked policy prevents dispatch. Tool state and a bounded deadline are journaled before dispatch; repeated approval/reconnect cannot redispatch it. Cancellation/deadline settles the run even if the backend ignores abort. An uncertain effect becomes interrupted and requires review; cancellation cannot claim an already dispatched effect was undone.
- Event schema version, run ID and increasing sequences are stored; a run has one terminal state. Reconnect reads existing state; it never resends inference or effects. A restart interrupts unfinished transport/effects while preserving pending approvals.
- Input/output/time/tool-count bounds keep this bounded. The example only supports text and approved function tools; unsupported provider delta variants fail explicitly. It is not the complete A1 provider/capability/catalog implementation.

`FixtureJournal` is an in-memory **test store**, not a shipped database. `Journal.put` documents the atomic-before-dispatch seam for the future single-writer storage service. Restart fixtures reuse that store across broker instances; they do not establish crash-safe SQLite persistence, cross-process coordination or exactly-once external effects.

## Official OAuth registration feasibility

`oauth.ts` builds the documented open-source Sign in with ChatGPT dynamic registration and subsequent issued-client reauthorization requests. It binds a selected 127.0.0.1 callback URI, opaque stable host UUID, Linuxcast name, fresh state/nonce and S256 PKCE. It rejects wrong/duplicate callback state, denial, missing bootstrap-issued ID, mismatched returning client/account and replay. The exchange uses the issued ID, same resource/URI and no client secret. Identity acceptance requires a trusted signature/JWKS verifier seam and checks issuer/audience/expiry/nonce/account identity; decoded JWT claims alone are insufficient. Plan scope permission is distinct from actual account eligibility.

This is an executable registration **feasibility adapter**, not a completed OAuth integration: no listener/browser launch, token exchange, real JWT/JWKS verifier, refresh, revocation, provider registration, signed-in account or entitlement has been exercised. The listener argument is a host assertion used by fixtures, not proof a real listener exists. No inference consumes its returned metadata. Future A1 integration must supply these pieces and the shared trusted SecretStore. No plaintext credential files are written, regardless of upstream storage examples. No CLI credentials, browser sessions or ambient key variables are read.

Primary protocol sources retrieved 23 October 2026:

- [OpenRouter streaming](https://openrouter.ai/docs/api_reference/streaming): SSE comments, final usage frame, errors before/after headers and provider-dependent upstream cancellation.
- [Official registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in): dynamic client, issued registration, loopback/state/nonce/PKCE and exact scope/resource contract.
- [Official accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions): protected storage, registration isolation, refresh and sign-out obligations for later production integration.

## Checks and explicit live opt-in

The coordinator maps the two contract files into `bun run test:contracts -- S0-05`. Run with Node 24.22.1 and Bun 1.4.4:

```sh
bun run typecheck
bun run lint
bun run test:contracts -- S0-05
```

One fixture test binds a temporary loopback HTTP server and uses native `fetch` to test success, dropped connections and cancellation. A sandbox without loopback-bind permission must report the failure and run with authorized local networking; it must never skip the check and call the suite passed. All traffic is synthetic local fixture traffic. No desktop/backend integration is claimed.

The optional smoke executable defaults to exit 3 (unavailable) and makes **no request**. To intentionally send one possibly billable request, set `LINUXCAST_AI_LIVE=openrouter` and `LINUXCAST_AI_MODEL` to the exact user-selected model, then supply the API key on standard input to `node spikes/ai/live-smoke.ts` from a secret manager or private interactive pipe. Never put a key in shell history/arguments. It sends one public synthetic prompt with a 64-token cap. Its output includes only backend/state/error classification/response byte count. No key discovery, automatic live CI traffic, output capture or billing fallback exists. Local cancellation terminates delivery; upstream processing/billing cancellation depends on the actual OpenRouter provider.

## Acceptance evidence

See [evidence.md](evidence.md) for commands, outcomes, platform and exact limitations. S0-05's UI criterion is conditionally inapplicable: no product UI changes are introduced. Design review gate, chat interrupted-state and approval requirements were read; later product integration must use shared host primitives and cover the documented visual/keyboard/accessibility states.
