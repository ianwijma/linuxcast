# Quicklink path arguments: application evidence

L2-05 bounded unfinished increment, 27 October 2026, based on merged PR48
(64e9fda). Contract and pure builder: 53bb3a9. Persistence/main/preload:
97e6eed. UI: 38738f4 (signed author c68e1264). Actual application: b73ef0b.

## Result

A saved Quicklink can use Type “Path argument link”. Its literal HTTP(S) URL is
its base. Selecting the registered saved command opens the existing Quicklinks
List, then an empty Argument form. Review link builds a local preview containing
the argument and exact encoded target. A separate deliberate Open link action
hands that target to the default browser. Edit argument retains the local value;
after Hide/reopen or application restart, the argument is empty. No argument is
copied from root search, saved in the definition, or exported.

The fixed typed configuration binds only `vars.query` as one path segment. Values
cannot alter authority, existing path, query or fragment. Slash, backslash,
percent-looking strings, Unicode and template-like text remain data; standalone
`.` and `..` are refused before review. Final URL size and existing input bounds
are enforced. There is no raw template interpolation, implicit context access,
recursive rendering, network lookup, or added dependency/service.

Additive migration 012 stores the exclusive path configuration. Existing literal
and web-search links retain their shapes. Definition CAS, conversions, tags,
pin/hide and selected native JSON export preserve the current kind. Main derives
the target from the fresh stored definition, checks current frame/parent/revision,
and denies hidden Open. Exact receipts distinguish literal, query and path kinds.
Uncertainty requires Reload and never silently replays. Save/Open now also check
the original context immediately after synchronous pending-state publication;
a subscriber cannot invalidate the view and still start those effects.

## Checks and evidence

Linux amd64; Node 24.22.1, Bun 1.4.4, Electron 45, SQLite 3.53.4, GIO 2.72.4.
Actual production checks use a sandboxed Electron application with private HOME,
profile and XDG directories on an owned private Xvfb X11 display. The GIO handler
is a real private process receiving URL argv and empty stdin. Only file-dialog
choices are instrumented; no user display, profile, device or provider is used.

- `bun run test:unit -- L2-05`: 323 passed, including 230 presentation tests,
  19 path-builder tests and retained parser/query-builder/routing coverage.
- `bun run test:contracts -- L2-05`: 15 passed.
- `bun run test:security -- L2-05`: 49 passed.
- `LINUXCAST_PRIVATE_DISPLAY=1 xvfb-run -a bun run test:integration -- L2-05`:
  45 passed. The production app flow passed in 13.57 seconds: save path definition,
  root tag search and exact entry selection, empty argument, dot refusal,
  held-Enter review without Open, separate explicit native Open with the exact
  encoded Unicode/metacharacter target, prefs/hidden selected export with mode
  0600, full restart, empty invocation argument and aggregate usage privacy.
- 93 targeted repository/owner/main/preload checks and 43 existing F2-01 storage
  integration checks passed. Real schema 11→12 consistent snapshot/reopen retains
  old definitions and metadata; old snapshot has no new column. Conversions and
  usage/index clearing preserve saved configuration.
- Author verified 52 Chromium keyboard/axe cases: retained 44 in the full run and
  all eight affected cases after narrowing an ambiguous fixture search. IME,
  held Enter, error/unknown/recovery and 200% footer containment are covered.
  Two synchronous pending-publication regressions prove zero Save/Open/Hide
  after query invalidation. Browser fixtures do not establish native acceptance.
- Full typecheck, scoped lint, plan validation and diff checks pass. Independent
  GPT-6.1 SOL/high boundary, final UI and actual integration/capture reviews are
  clean at b73ef0b; the cancellation P2
  is closed. Exact integrated UI source/tests/captures match signed author c68e1264.

Twelve component captures and four actual affected dark/light captures were
inspected. Actual files: `quicklinks-application-{dark,light}-{path-definition,path-preview}.png`.
Component files: `packages/builtins/quicklinks/evidence/*path-argument*.png`.
Applicable DESIGN sections: List/Grid/Detail/Form, Results/actions, shell/navigation,
states and accessibility. Existing shared primitives/tokens remain in use. Public
synthetic names, Unicode text and example.invalid URLs only. Aggregate usage and
selected definition export exclude transient arguments and expanded targets.

## Still unfinished

This is partial L2-05 AC01/UI/privacy evidence, not whole-task completion. Full
snapshot/context acquisition, other documented placeholder/argument components,
recursive/missing/unsupported cursor remediation, nonrecursive snippet inclusion,
file/registered URI/browser/open-with targets and complete prerequisite acceptance
remain required. Native GNOME/KDE Wayland/X11, assistive technology, performance,
package and release gates remain pending. Native browser dispatch does not prove
browser page completion or focus. Instrumented dialog choice does not establish
native dialog/session acceptance. The complete agreed local 1.0 scope is unchanged.
