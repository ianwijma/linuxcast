# Explicit arithmetic calculator — bounded L2-04 increment

`CalculatorFlow` uses the existing launcher's shared `ViewSession` and host
`ViewRenderer`. It pushes a Calculator Form onto the supplied parent view, then
a Calculation Detail after a successful explicit Evaluate. It creates no new
window, root query provider or visual system. The host supplies a unique view ID
prefix and current command registry revision and forwards close notifications
synchronously through `closed(viewId)`.

Typing and opening the Form do not evaluate, copy or transmit expressions.
Evaluate is a local read action against the separate pure `evaluateExpression`
module. The Expression label and draft persist through fixed inline syntax,
domain and size/complexity errors. Requests are bounded to 512 UTF-8 bytes and
exclude controls/unpaired surrogates. A successful local result is plain metadata:
Expression and Result. Detail Markdown is static and explains floating-point
approximation, up to 15 significant digits and `%` dividing by 100. Expressions
cannot supply HTML, Markdown, links or executable content.

**Copy result** is a separate primary write action. It uses only the optional
named `copyCalculatorResult({revision, expression})` API. Main re-evaluates the
expression and copies numeric result text; the renderer has no arbitrary
clipboard interface. A strict copied receipt must carry exactly the result text
shown in the Detail before the UI reports “Result copied.” No automatic copy,
hide, persistence, expression history or remote request is introduced.

Pending copy disables duplicates and has a five-second presentation bound.
Known failures have fixed recovery guidance. Unknown, malformed, mismatched or
lost receipts tell the user to check the clipboard before explicitly choosing
Copy result again. Nothing is replayed automatically. Edit expression or Escape
while a copy is pending invalidates its receipt and warns on the remaining Form
that copying may have occurred; navigation/cancellation cannot undo a clipboard
write. Disposal discards pending presentation work without claiming cancellation
undid the write. A missing API disables Copy with remediation while local
arithmetic remains usable.

Edit expression and Escape return Detail → Form → launcher, preserving the shared
form draft/focus and the launcher's root query/selection. Dirty cancellation uses
the shared discard UI. Action handling validates current owned view/revision,
absence of item selection, allowed intent keys and the exact single Expression
form value. Stale, hidden, malformed and disposed intents cannot evaluate/copy.

Design references: DESIGN.md Shell and navigation; Results and actions; List,
grid, detail and form; States and motion; Accessibility; Review gate. Production
presentation contains only semantic ViewModels and existing host primitives,
tokens/fonts. `fixtures/preview.css` only lays out the labelled fixture.

## Evidence and remaining scope

`tests/presentation.test.ts` has 29 passing presentation checks and
`tests/calculator.ui.test.ts` has 10 passing Chromium keyboard/axe checks covering
explicit Form and Detail transitions, draft errors/domain/oversize, clipboard unavailability,
unknown/mismatched/pending replies, back/dirty cancel/focus, stale/disposed actions
and local readonly metadata. `fixtures/` explicitly observes clipboard requests
without touching the host clipboard. Public arithmetic expressions alone enter
test screenshots; no user content, secrets or external requests are used.
Nine screenshots cover dark/light Form, result and validation plus unknown,
unavailable and missing-copy states. Dark Form/validation/unknown and light result
were visually inspected. Development checks use Node 24.22.1/Bun 1.4.4.
Typecheck, scoped lint and plan validation pass. Browser checks require a local
fixture server and real Chromium processes; they are not native clipboard proof.

This presentation contributes bounded L2-04-AC01, UI and privacy evidence. The
separate evaluator lane owns parser and numeric correctness. Coordinator main/
preload/launcher routing owns sender validation, recomputation, actual clipboard
and production Electron integration. Full L2-04 remains incomplete: units,
dates/timezones/DST, colours, configured currency/crypto adapters, timestamped
fixture-backed cache and stale/offline rate behavior remain required. Debian
GNOME/KDE Wayland/X11, native assistive technology and full release acceptance
remain pending. The complete local 1.0 scope is unchanged.

## Integrated application evidence

Coordinator checks on Node24.22.1, Bun1.4.4, Electron45.0.0 and SQLite3.53.4
pass:188calculator unit checks (157evaluator,29presentation,2launcherrouting),
41main/preload security checks,2contract checks,10Chromium keyboard/axe checks,
typecheck/lint/plan/diff. The existing108launcher unit checks pass.
The production application check completes in2.39seconds using a private Xvfb
profile, real packaged Electron/SQLite and a separate native xclip reader. It
verifies that ordinary words do not select Calculator; typing and Evaluate do
not change the clipboard; explicit Copy copies14and521 into the actual private
CLIPBOARD; invalid expressions/division byzero do not copy; an unavailable
session returns a known failure and only explicit retry after recovery writes.
Hide removes both nested calculator views; real single-instance reopen shows
the launcher and preserves the clipboard without replay. After Quit, the actual
sole owner exports only aggregate calculator usage count2, without expressions
or result history. The actual dark/light screenshots in evidence/application-
{dark,light}-result.png were inspected and axe passes both themes. No clipboard
operation uses the user's display or private content.

Existing actual application/URL/alias/pin/data/restart regression passes7.18seconds.
These synthetic smoke durations are not performance acceptance measurements.
Independent GPT-6.1 SOL/high source review is clean across evaluator, contract,
main/preload, presentation and launcher hide/back/stale-revision lifecycle. The
clipboard action uses Electron45's async system clipboard promises, awaits
write/readback, and retains an unresolved write's slot after its four-second
unknown-outcome receipt so another copy cannot overtake it. Hide/Quit remain
available. No automatic replay, paste, PRIMARY or clipboard-history read is
added; native GNOME/KDE Wayland/X11, assistive-technology, installed package and
release acceptance remain pending.
