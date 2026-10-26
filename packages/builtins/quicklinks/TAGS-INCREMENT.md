# L2-05: saved tags in the existing Quicklinks flow

Bounded application increment on merged PR44 / e2dec5a. Complete task scope,
security and native/release gates remain unchanged. This adds the task's
specified tags using actual existing shell, shared List/Form, owner and browser
path. No new service, permission, research or proof lane.

## Frozen UI contract

`QuicklinkSave`, `QuicklinkRecord`, `QuicklinkSummary` now have optional `tags`.
Absent/empty means no tags; at most8, each1–32 UTF16 units and64 UTF8 bytes after
NFKC normalization and trim. No comma, controls or lone surrogate. Normalized
case-insensitive duplicates are invalid. Shared `quicklinkTagsSchema` parses
input into canonical saved labels. Order is user order. Tags are local metadata,
not template instructions, target authority or permission grants.

UI owns only presentation.ts and its fixtures/tests/evidence/README beneath
packages/builtins/quicklinks/. Reuse shared Form text field `Tags` (optional),
comma-separated labels, helper text and inline validation. Empty is no tags.
Prefill Edit from actual record; Save sends canonical tags (omit when empty).
Validate exact save/get receipts including tags; preserve all existing ID,
revision/name/URL/host/type fences and persistent uncertainty recovery.

Dedicated Quicklinks search matches every typed word against name, host and
tags; tags are visible plain accessories/metadata, no HTML or target inference.
Respect full500-loaded/100-visible behaviour and stable ID selection. Creating,
editing, searching and navigating never opens browser or copies anything.
Existing explicit literal Open and search Query→Review→Open stay unchanged.

Required affected states: no tags/old definition, tagged literal and web search,
edit/prefill/clear, invalid/duplicate/over-bound tags, delayed/mismatched receipts,
unknown Save + Reload, keyboard/IME/held Enter and dark/light; no claimed native
Wayland/AT evidence. Author report maps to AC01/AC02/UI/privacy only where proven.

## Coordinator ownership

Contracts/index, migrations/schema assets, repository.ts, main/preload receipt
checks, shared manifests/lockfiles, registry/integration routing and actual
production integration. Migration010 adds validated JSON tag labels to the
existing saved record; no query history, tag analytics or background operation.
Actual app acceptance must create tags→save→search tags→edit/clear→explicit
native browser action→restart/reopen and preserve definitions under usage clear.
Full placeholder, browser/open-with, pin/hide/export, native/AT/release acceptance
remains outstanding. No whole-task completion claim.
