# Local arithmetic and unit evaluator — bounded L2-04 increments

`evaluateExpression(input: string): Calculation` is a pure, synchronous local
function shared by trusted main and the presentation layer. It returns either
`{ok: true, value: number, text: string, unit?: CalculatorUnit}` or a fixed failure
with code `invalid-expression`, `limit-exceeded`, `domain-error`,
`unsupported-unit`, or `incompatible-units`. Invalid runtime types
are rejected without coercion. No expression or result is persisted, transmitted,
or interpreted as JavaScript. The arithmetic parser imports only its fixed local
unit implementation at runtime. There are no external runtime dependencies, I/O,
network requests, clock reads, randomness, or user-selected property access.

## Syntax

Syntax is ASCII and case-sensitive. ASCII space is the only whitespace. Control
characters, DEL, non-ASCII characters, and unpaired UTF-16 surrogates are rejected.
There is no normalization of Unicode operators such as `×`, `÷`, or `−`.

```text
expression = sum [space unit space "to" space unit]
space      = " " {" "}
sum        = product { ("+" | "-") product }
product    = unary { ("*" | "/") unary }
unary      = ("+" | "-") unary | power
power      = postfix [ "^" unary ]
postfix    = primary { "%" }
primary    = number | "pi" | "e" | "(" sum ")"
           | function "(" sum { "," sum } ")"
number     = (digits ["." [digits]] | "." digits)
             [("e" | "E") ["+" | "-"] digits]
digits     = digit {digit}
digit      = "0" … "9"
```

Only the fixed function names below are accepted. Constants `pi` and `e` are
binary floating-point approximations. There is no implicit multiplication, member
access, assignment, string literal, array, hexadecimal/binary literal, JavaScript
operator, or executable source syntax. Ordinary words are invalid expressions.

| Expression | Result or behavior |
| --- | --- |
| `2 + 3 * 4` | `14` |
| `-2^2` | `-4`; exponentiation binds before unary minus |
| `2^3^2` | `512`; powers associate to the right |
| `2^-2` | `0.25`; a signed exponent is supported |
| `50%` | `0.5`; every postfix `%` divides by 100 |
| `100+20%` | `100.2`; `%` is never relative to the preceding amount |
| `2^3%` | `2^0.03`; postfix `%` binds before exponentiation |
| `2(3)` / `2pi` | Invalid; multiplication requires `*` |

## Fixed functions and numeric behavior

| Function | Arity and meaning |
| --- | --- |
| `sqrt`, `abs` | One argument; square root or absolute value |
| `floor`, `ceil` | One argument; round toward negative or positive infinity |
| `round` | One argument; nearest integer, with half ties toward positive infinity |
| `min`, `max` | Between one and 16 arguments |
| `log`, `ln` | One positive argument; base-10 or natural logarithm |
| `exp` | One argument; exponential with base `e` |
| `sin`, `cos`, `tan` | One argument in radians |

All calculations use IEEE 754 binary64 numbers and the fixed standard `Math`
functions. Division by positive or negative zero, `0^0`, negative square roots,
nonpositive logarithms, non-real powers, and any nonfinite literal/intermediate
result return `domain-error`. Overflow is rejected. Underflow may produce zero.
Trigonometric arguments, including `pi`, are approximations; values near a tangent
pole can produce a large finite approximation rather than an exact-pole claim.
The evaluator does not infer rational exponents or perform symbolic mathematics.

`value` is the finite result before display rounding. `text` is numeric text with
up to 15 significant decimal digits, without grouping or locale dependence, using
ordinary or scientific notation. Negative zero is normalized to `0` in both
fields. If nearest 15-digit decimal rounding would overflow an otherwise finite
extreme value, display rounding moves one decimal unit toward zero to retain a
finite 15-digit number. For example, the maximum finite binary64 value displays
as `1.79769313486231e+308`.

This is approximate arithmetic. Decimal operations and transcendental functions
can accumulate rounding error, and integers outside the safe integer range are
not exact. For example, literal `9007199254740993` has binary64 value
`9007199254740992` and display text `9007199254740990`. The evaluator provides no
arbitrary-precision, exact-large-integer, or exact-financial-arithmetic claim.
Successful `text` satisfies `calculatorResultTextSchema`; trusted main recomputes
from the expression before its separately authorized numeric clipboard action.

## Explicit unit conversions

A conversion is one explicit suffix: `<arithmetic expression> <source> to <target>`.
For example, `sqrt(81) ft to in` produces numeric text `108` and closed unit `in`;
`100+20% m to cm` produces `10020 cm`. Spaces around the scalar and between suffix
parts may repeat. Only a single conversion is allowed, at the top level. Nested
conversions, implicit units, compound dimensional algebra, and arbitrary unit
expressions are unsupported. Canonical speed identifiers such as `m/s` are fixed
names, not user-composed division expressions.

The private unit `Map` contains exactly these 92 case-sensitive identifiers:

| Dimension | Canonical identifiers |
| --- | --- |
| length | `m km cm mm um nm in ft yd mi nmi` |
| mass | `kg g mg ug t lb oz` |
| duration | `s ms us ns min h d wk` |
| temperature | `K degC degF` |
| angle | `rad deg turn` |
| data | `B kB MB GB TB KiB MiB GiB TiB bit kbit Mbit Gbit Tbit Kibit Mibit Gibit Tibit` |
| area | `m2 km2 cm2 mm2 in2 ft2 yd2 acre ha` |
| volume | `m3 L mL uL in3 ft3 US_gal US_qt US_pt US_fl_oz imp_gal imp_fl_oz` |
| speed | `m/s km/h mph kn` |
| energy | `J kJ Wh kWh cal_th kcal_th` |
| power | `W kW MW hp_mech` |
| pressure | `Pa kPa MPa bar mbar atm psi` |

`getUnitCatalogue()` returns frozen display entries with `id`, `label`, and
`dimension`; both its array and each entry are frozen. Callers receive no mutable
conversion definitions or lookup `Map`. Unknown identifiers and ambiguous names
such as `C`, `F`, `gallon`, `KB`, `month`, or `year` return `unsupported-unit`.
There are no aliases, inferred prefixes, case folding, or Unicode unit symbols:
use `um` rather than `µm`, for example. Known units of different dimensions return
`incompatible-units`. A bare arithmetic success keeps its original shape without
an extra `unit` property.

Linear conversions compute `value * (sourceScale / targetScale)` so a finite
same-unit or representable extreme conversion does not overflow an unnecessary
base-unit intermediate. Signed values are permitted; underflow can produce zero.
All physical factors use the fixed definitions below, evaluated with binary64
rounding, not a claim of exact decimal arithmetic:

- International inch = 0.0254 m, foot = 0.3048 m, yard = 0.9144 m, mile =
  1609.344 m, and nautical mile = 1852 m. The legacy US survey foot is unsupported.
- Avoirdupois pound = 0.45359237 kg; ounce = 1/16 pound; `t` is a metric tonne.
- Duration day = 86400 s and week = 604800 s. These are fixed elapsed durations,
  not civil days, calendar weeks, or timezone/DST calculations.
- Hectare = 10000 m2; acre = 43560 international square feet. Cubic and square
  units derive from the same international length definitions.
- US liquid gallon = 231 cubic inches; quart = 1/4 gallon, pint = 1/8 gallon,
  fluid ounce = 1/128 gallon. Imperial gallon = 4.54609 L and imperial fluid
  ounce = 1/160 imperial gallon. `oz` is mass, not fluid volume.
- One byte = 8 bits. Decimal prefixes use powers of 1000; IEC binary prefixes use
  powers of 1024. For example, `1 kB` = 1000 B and `1 KiB` = 1024 B.
- `cal_th` = 4.184 J and `kcal_th` = 4184 J. Watt-hour = 3600 J.
  Mechanical horsepower = `550 * 0.3048 * 0.45359237 * 9.80665` W.
- Standard atmosphere = 101325 Pa; bar = 100000 Pa; psi =
  `0.45359237 * 9.80665 / 0.0254^2` Pa.

These fixed definitions follow the coordinator-verified primary references:
[NIST SP 811 conversion factors, including B.8](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors),
[NIST Handbook 44 Appendix C definitions](https://www.nist.gov/system/files/documents/2023/01/30/appc-23-HB44.pdf),
and [NIST binary prefixes](https://pml.nist.gov/cuu/Units/binary.html).

`K`, `degC`, and `degF` represent absolute temperatures, never intervals. Source
values below 0 K, -273.15 degC, or -459.67 degF return `domain-error`, including
same-unit conversions. Validation compares the source scale directly before any
affine conversion. Direct pair formulas preserve familiar anchors such as
`32 degF to degC = 0` and `273.15 K to degF = 32`. Exact source boundaries map
directly to exact target boundaries. Valid-source output is clamped to its target
lower boundary only to prevent a spurious below-absolute-zero value from binary64
roundoff. Output overflow remains an error.

For converted results, `text` is still finite numeric text with up to 15 significant
digits; `unit` is separate closed metadata. Existing `formatCalculationText`
combines them as `<numeric text> <canonical unit>`, and trusted main recomputes
before copying. No renderer-supplied result or unit becomes clipboard authority.

## Resource and failure boundaries

Input is capped at 512 UTF-8 bytes. A length check rejects oversized strings
before encoding or tokenizing; encoding is bounded to at most 512 UTF-16 units.
The scalar lexer emits at most 256 tokens, excluding the end marker. A conversion
adds only its fixed source/`to`/target suffix outside that scalar token budget; the
whole expression, including suffix and spaces, still shares the 512-byte limit. Recursive semantic
depth is at most 32, counting each nested parenthesis/function argument, recursive
unary sign, or right-hand exponent together. Flat sums/products/postfix operations
use loops. Each arithmetic operator, unary sign, `%`, and function call consumes
one of at most 256 evaluation operations. Function argument lists are capped at
16. These bounds apply to invalid inputs as well as valid expressions.

Failures contain only one of these fixed messages, never the expression or raw
runtime error:

- `invalid-expression`: “Enter a supported mathematical expression.”
- `limit-exceeded`: “This expression exceeds the calculator limits.”
- `domain-error`: “This calculation has no finite real result.”
- `unsupported-unit`: “Use a supported, unambiguous unit identifier.”
- `incompatible-units`: “Choose units with the same dimension.”

## Evidence and unfinished scope

The evaluator tests use independent arithmetic/function expectations, exact
precedence examples, percent semantics, domain/overflow cases, malformed and
JavaScript-like syntax, runtime-invalid types, token/byte/depth boundaries, and
numeric clipboard-contract checks. Fixtures contain only synthetic expressions.
The unit suite adds independent anchored definitions for all 92 identifiers, all
12 dimensions, explicit suffix and scalar behavior, decimal/binary bit/byte
distinctions, physical temperature boundaries, overflow, and immutable catalogue
checks. The 157 baseline arithmetic tests and 214 unit cases pass together.
Typecheck, scoped lint, and planning validation pass. These are pure logic checks;
no desktop behavior is established by them.

The unit increment provides partial `L2-04-AC02` evidence for fixed unit fixtures
and preserves the reviewed `L2-04-AC01`/`L2-04-PRIVACY` parser boundaries (no
execution/transmission, synthetic fixtures, fixed diagnostics). Unit UI/copy
integration and full acceptance remain coordinator-owned. Calendar dates,
durations with civil/timezone/DST semantics, colours, and explicit opt-in
currency/crypto rate adapters with timestamped stale/offline states remain
unimplemented here. `L2-04-AC02`, UI acceptance, and
full Debian 13 GNOME/KDE Wayland/X11/native acceptance remain pending. This slice
does not mark L2-04 complete or reduce its agreed scope.
