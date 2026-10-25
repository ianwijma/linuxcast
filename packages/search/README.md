# Bounded local command search — L1-01 increment

This pure package ranks metadata received from the trusted main command registry.
It cannot register a handler, execute an effect or discover an extension. The
initial application registry contains only Local data, Hide Linuxcast and Quit
Linuxcast, all backed by existing main handlers.

Queries stay local. Exact explicit aliases precede exact/prefix/substring title,
keyword token and fuzzy title matches. Unicode normalization and case folding
are deterministic. Favourites and decayed local frequency/recency break match
ties. A zero count contributes no history even if an old timestamp remains.
Empty-query ties retain trusted registry order, exposing Local data first on a
new installation. Missing usage falls back to that order without disabling the
commands. Bounds are 512 query code units, 100 registered metadata records and
20 results for this provider; duplicate IDs reject. No remote fallback is made.

Query generations abort the previous token and reject stale completions even if
a producer ignores cancellation. Selection belongs to a stable result identity,
not a row index. Full multi-provider merging, provider discovery, ranking
administration, argument flows and configured fallback/AI actions remain later
L1-01 work; this slice does not redefine the task or the local 1.0 scope.
