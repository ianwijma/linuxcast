# Local colour-conversion contract — L2-04

Frozen coordinator boundary for the next application increment; this document
alone does not implement or accept colour conversion. Existing arithmetic and
92-unit behavior remains required, as do full dates/DST and explicit rate adapters.

Use `evaluateExpression` with one explicit `<colour> to <format>` suffix. Target
format is exactly `hex`, `rgb` or `hsl`; ASCII spaces and the existing512-UTF8-byte
expression bound apply. Hex input accepts #RGB/#RGBA/#RRGGBB/#RRGGBBAA with either
hex letter case. Functional input accepts lowercase rgb/rgba or hsl/hsla aliases,
comma-separated legacy components (optional fourth alpha) or space-separated
modern components with optional `/ alpha`. Never mix comma and slash syntax.
RGB components are all numbers0..255 or all percentages0..100%; HSL saturation
and lightness require percentages0..100%. Hue is a finite number with optional
`deg`, normalized modulo360; bound absolute input hue at1e9 degrees. Alpha is
0..1 or0..100%. Reject out-of-range components instead of silently clamping.
Numeric atoms use finite signed decimal/scientific notation, never arithmetic
or nested functions. No CSS parser/evaluation, DOM/canvas conversion, currentColor,
variables, URLs, named colours, relative/wide-gamut spaces, or external I/O.
Colour attempts with unsupported syntax/ranges yield the fixed `invalid-colour`
error and remediation. `evaluateColourExpression(input)` returns undefined for
non-colour expressions, so existing arithmetic/unit parsing retains ownership.
Never fabricate an opaque black result.

Canonical local success is `{ok:true,kind:'colour',colour:'hex'|'rgb'|'hsl',text}`;
there is no numeric value or unit for a colour. Numeric success retains its old
shape with optional kind:'number'. Shared `calculatorColourValueSchema` admits
only closed canonical text: lowercase6/8-digit hex; `rgb(R G B[ / A])`; or
`hsl(H S% L%[ / A])`. Functional decimal components have at most6fractional
digits, no exponent/negative zero/trailing fractional zeros; hue0<=H<360,
RGB0..255 and S/L0..100, A0..1. Alpha1 is omitted. Hex rounds RGB and alpha
channels to nearest byte; omit alpha hex when rounded alpha byte255. Functional
output rounds at6fractional digits; round hue360 back to0. Achromatic hue is0; at lightness0or100, saturation is also0.
Conversions use encoded sRGB, preserve alpha without compositing, and remain
approximate floating-point values; hex intentionally quantizes to8bits/channel.

`formatCalculationText` validates this shared closed text and copies exactly the
canonical colour string. Copy requests still contain only registry revision and
expression, never renderer result text/format. Main recomputes the same expression
and owns the actual write. Success receipt is strict `{outcome:'copied',text,colour}`
for colour or the unchanged numeric/unit receipt. UI must compare text AND colour
(and unit for numeric); a numeric-looking or differently tagged receipt cannot
confirm colour copy. Pending/deadline/Back/Hide/no-replay/usage/privacy semantics
remain unchanged. No expression/result/colour history or remote requests.

Reference: [W3C CSS Color4,22October2026 draft](https://www.w3.org/TR/2026/CRD-css-color-4-20261022/),
sections4/5/7 for hex/RGB/HSL and encoded-sRGB conversion definitions. This is a
closed calculator grammar, not full CSS parsing: range rejection, the hue bound,
achromatic hue0 and output precision are explicit Linuxcast decisions. Implement
conversion independently and test primary/secondary/grey/alpha/nontrivial fixed
expectations and hostile/invalid/resource bounds; do not merely round-trip the
same implementation. Shared Form/Detail, explicit Evaluate/Copy and typed errors
must remain useful for unsupported input. Actual production/native clipboard
and dark/light keyboard/axe evidence are required before merging the increment.
