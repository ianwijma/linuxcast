# Bounded local command search — L1-01 increment

This pure package ranks metadata received from the trusted main command registry.
It cannot register a handler, execute an effect or discover an extension. The
registry contains built-in commands and opaque application identities. Main owns
all handler and GIO dispatch authority.

Queries stay local. Exact explicit aliases precede exact/prefix/substring title,
keyword token and fuzzy title matches. Unicode normalization and case folding
are deterministic. Favourites and decayed local frequency/recency break match
ties. A zero count contributes no history even if an old timestamp remains.
Empty-query ties retain trusted registry order, exposing Local data first on a
new installation. Missing usage falls back to that order without disabling the
commands. Bounds are 512 query code units, 4,100 registered metadata records,
20 results per command/application provider and at most 100 merged results; duplicate IDs reject. No remote fallback is made.

A schema-valid explicit HTTP/HTTPS query locally matches an already registered
`linuxcast:open-url` entry. This ephemeral match does not add aliases to saved
metadata or create a command. No matching operation dispatches, resolves or
fetches an address; the trusted main and an explicit shared Form submission own
browser handoff. Invalid addresses remain correctable in the dedicated Form
reached through the command name. The 512-code-unit root query bound remains;
the dedicated Form uses the independent bounded URL schema.

Query generations abort the previous token and reject stale completions even if
a producer ignores cancellation. Selection belongs to a stable result identity,
not a row index. A still-matching selected ID remains in its provider projection
within the existing result limit; mismatched or removed identities are released. Further providers, provider discovery, ranking
administration, argument flows and configured fallback/AI actions remain later
L1-01 work; this slice does not redefine the task or the local 1.0 scope.
