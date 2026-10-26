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
commands. Bounds are 512 query code units, 4,102 registered metadata records,
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

Hidden metadata defaults to shown for older snapshots. Root ranking removes hidden
commands before name/alias matching, favourites/frecency, provider caps, and
selected-ID retention. `preserveSelection` likewise never restores a hidden ID,
even if it is the only row or was previously selected. Hiding is a root preference,
not permission revocation, uninstall, or a change to pin/alias/use metadata.

`rankManagedCommands(commands, query, selectedId?)` provides a separate local
management projection over every collected command, including hidden and
unavailable rows. It retains original metadata for action labels, uses ordinary
match tier then title/ID order without favourites/frecency or HTTP URL inference,
and displays at most 100 rows. It searches the complete bounded registry before
that cap, allowing a refining query to reach later pages. A still-matching selected
ID can replace the final row within the cap; removed or nonmatching selections
are released. Management rows grant no execution authority, and management UI
must not use root `preserveSelection` to choose its hidden rows.

The companion renderer catalogue validates visibility availability across all
pages. Its visibility acknowledgement merge accepts only a fully recollected
catalogue at exactly the next revision with the same registered ID set,
visibility editing available, and unchanged descriptors/other hidden states.
The requested hidden value must match; pins/aliases are preserved while owner use
counts/timestamps may advance or be cleared. Legacy pin/alias acknowledgements
also preserve visibility availability and cannot change hidden metadata. Recovery
Hide/Quit cannot be hidden; global Manage commands is separately owned by UI.

Focused search/catalogue regressions provide partial L1-01 selected-identity,
ranking, and synthetic-fixture privacy evidence. Persistence, main execution
checks, and management UI integration remain coordinator-owned. Full providers,
configured fallback/AI, native desktop/assistive-technology, and release acceptance
remain pending; pure tests do not establish those gates.
