# Model and artifact provenance

Both candidates were authored against [the same brief](BRIEF.md), source observations and canonical design baseline at commit `cd7bf0e`.

| Candidate | Actual execution | Effort configuration | Limits |
| --- | --- | --- | --- |
| Sol — Graphite / precision | Coordinating Codex session, `gpt-6.1-sol` | Runtime identifies high reasoning effort; inherited orchestrator settings returned `reasoningEffort: high` | The coordinator also wrote comparison and verification infrastructure. Internal compute is not independently observable. |
| Opus — Instrument | T3 delegated Claude provider `claudeAgent`, model `claude-opus-5-5`; completed 31 October 2026 14:58:27 UTC / 1 November 2026 01:58:27 Australia/Sydney | Requested `effort: high`; the delegate tool returned the same option with the actual provider/model | The author correctly could not inspect its internal effort. The coordinator corroborates the launch configuration, not internal compute. No launch failure or provider substitution occurred. |

The Opus author had no inherited conversation and owned only `opus/`. The Sol artifact was drafted while that candidate ran. The comparison was written after both outputs existed. Later coordinator changes are limited to review integration and fixes documented in [EVIDENCE.md](EVIDENCE.md); conceptual differences are preserved.

This is a qualitative comparison of two single samples. Different execution duration, output length and amount of prototype behaviour are not evidence of general model superiority, cost, performance or user preference. There was no blind review, repeated trial, equal compute budget or measured usability study.

Sources are official public pages and product imagery documented in [RESEARCH.md](RESEARCH.md). No Raycast binary, proprietary source, logo or third-party product illustration is redistributed. The committed SVG glyphs are original inline artwork; emoji use the local platform font. No new font assets are redistributed. Both artifacts request Inter and JetBrains Mono and fall back locally; final product typography must use the licensed bundled assets from the shared host foundation.
