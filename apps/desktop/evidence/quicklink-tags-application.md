# Saved Quicklink tags: application evidence

L2-05 bounded unfinished increment on merged PR44, 27 October 2026.
Frozen2881204/dbfabde, sole-owner integration8762dcc, UI ec0da28 (signed author
75bcdcc), shared pending Form fixd00f8f4, bounds regression62cc997 (authorc3a6bfd).
Complete agreed local1.0 scope and all outstanding task/release gates remain.

## Concrete behaviour

New/Edit includes optional comma-separated Tags using the shared Form. Saved
labels appear in the existing List; each local search word can match name, host
or tags. The full500 summaries are searched before the100-visible projection;
selection remains a stable saved ID. Edit prefills current labels; clear removes
them. Save/navigation/search never open a browser or perform clipboard actions.
Existing explicit literal Open and query→review→Open search remain the effect
boundary. Tags cannot become URL structure, templates, scripts or grants.

At most8 labels, each32 UTF16 units and64 UTF8 bytes after NFKC+trim. Raw
controls/lone surrogates/comma and normalized case-insensitive duplicates are
rejected. Empty/absent means no tags. Complete maximum metadata fits1MiB.
Migration010 adds local labels with [] default and leaves existing saved IDs,
revisions, names, canonical URLs, search configuration and times unchanged.
CAS, corrupt-source rejection and exact ordered-tag acknowledgements apply in
the sole owner, main, preload and UI. A changed/missing receipt is unconfirmed;
no mutation or external effect is automatically replayed. Explicit Reload
retains a draft for review. Ordinary local definitions are not encrypted.

## Recorded checks

Linuxamd64 Node24.22.1/Bun1.4.4/Electron45/SQLite3.53.4/GIO2.72.4. Actual app uses
owned private Xvfb X11, private HOME/profile/XDG and real sandboxed production
code. A private registered browser handler records only explicit argv/empty
stdin; native dialog choices are instrumented. No user display/profile/device,
provider, network, keyring content or private fixtures are accessed.

- `bun run test:unit -- L2-05`:187 PASS (120presentation,3rootrouting,
  39templateparser,25URLbuilder).
- `bun run test:contracts -- L2-05`:11 PASS; `test:security -- L2-05`:29 PASS,
  including raw invalid tags, canonical exact labels and mismatched receipts.
- `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a bun run test:integration -- L2-05`:
  36 PASS (25domainSQLite,7owner/client,3web-search owner,1actualproduction5.77s).
  Actual registered launcher→Quicklinks→New/tag/save→tag/name/host search→Arrow/
  explicit Open gives exact real browser-handler argv with empty stdin. Edit
  prefills/clears labels and removes old tag matches. Tagged web search expands
  only the selected query component, reviews before native Open, survives usage
  clear/restart, and starts with empty transient query. Final owner confirms
  tagged search persistence; aggregate usage export excludes labels/URLs/queries.
- Real owner9→10 test verifies consistent schema9 snapshot before upgrade,
  unchanged old definition and tag persistence after confirmed reopen, usage
  clear and file-index clear. Historical6/7 fixtures are inspected directly;
  current repositories run only after current migration, with no fallback shim.
- `bun run test:integration -- F2-01`:43 existing owner/migration/recovery PASS.
- Author `bun run test:ui -- L2-05`:32 Chromium keyboard/axe PASS, plus6 focused
  post-review cases. New tag states include prefill/clear, invalid/duplicate/
  bounds, unknown/mismatched Save+explicit Reload, IME/held Enter and200%.
- Shared `test:unit -- D1-02`:17 PASS; `test:ui -- D1-02`:11 Chromium PASS.
- Full typecheck, scoped source lint, plan validation and diff checks PASS.
- Independent SOL/high root boundary and UI/source/capture reviews clean. A
  pending Save clipping finding is fixed by scrolling the existing action row
  into view without moving focus. Real browser assertions require both Save/
  Cancel rectangles completely inside the viewport, Cancel enabled/unfocused,
  no held-Enter Cancel and exactly one Save. Exact author/integrated owned trees
  independently reconciled; no remaining actionable findings.

## Design and visual evidence

DESIGN.md Results and actions / shared Form / focus and accessibility, canonical
semantic tokens and shared primitives. No new visual system. Nine new component
captures plus three affected pending/web-search captures were inspected, and six
actual dark/light Form/List/search-preview captures were inspected. Actual
capture requests reduced motion so theme pixels are stable rather than catching
an intermediate100ms button background transition.

Actual affected files: `quicklinks-application-{dark,light}-{form,list,search-preview}.png`.
Component affected files: `packages/builtins/quicklinks/evidence/*tags*.png`,
`dark-quicklinks-save-pending.png` and `{dark,light}-web-search-definition.png`.
These use public synthetic example domains, Unicode labels and text only.

## Outstanding acceptance

These checks establish a reviewed/tested unfinished application increment,
not full L2-05 or native desktop/AT/performance/release acceptance. Native GIO
receipt means dispatch requested, not browser page completion/focus. Full
snapshot/context/cursor/snippet/argument/component builder, file/registered URI,
browser/open-with, pin/hide/native export and full prerequisite/session/AT/
release requirements remain mandatory. Existing denied/unavailable browser,
foreign-frame, storage failure, stale ID/revision, unknown and Reload recovery
remain covered; no silent capability fallback or successful simulation.
