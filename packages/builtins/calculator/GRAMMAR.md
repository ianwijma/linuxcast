# Local arithmetic evaluator — bounded L2-04 increment

`evaluateExpression(input: string): Calculation` is a pure, synchronous local
function shared by trusted main and the presentation layer. It returns either
`{ok: true, value: number, text: string}` or a fixed failure with code
`invalid-expression`, `limit-exceeded`, or `domain-error`. Invalid runtime types
are rejected without coercion. No expression or result is persisted, transmitted,
or interpreted as JavaScript. There are no runtime imports, external dependencies,
I/O, network requests, clock reads, randomness, or user-selected property access.

## Syntax

Syntax is ASCII and case-sensitive. ASCII space is the only whitespace. Control
characters, DEL, non-ASCII characters, and unpaired UTF-16 surrogates are rejected.
There is no normalization of Unicode operators such as `×`, `÷`, or `−`.

```text
expression = sum
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

## Resource and failure boundaries

Input is capped at 512 UTF-8 bytes. A length check rejects oversized strings
before encoding or tokenizing; encoding is bounded to at most 512 UTF-16 units.
The lexer emits at most 256 tokens, excluding the end marker. Recursive semantic
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

## Evidence and unfinished scope

The evaluator tests use independent arithmetic/function expectations, exact
precedence examples, percent semantics, domain/overflow cases, malformed and
JavaScript-like syntax, runtime-invalid types, token/byte/depth boundaries, and
numeric clipboard-contract checks. Fixtures contain only synthetic expressions.
Typecheck and scoped lint apply to this increment. These are pure logic checks;
no desktop behavior is established by them.

This increment supports part of `L2-04-AC01` (a deterministic parser with no
execution or background transmission) and `L2-04-PRIVACY` (synthetic fixtures and
fixed diagnostics). Ordinary launcher search routing, UI/copy behavior, and full
acceptance are owned by integration work. Units, dates/durations/timezones and
DST, colours, and explicit opt-in currency/crypto rate adapters with timestamped
stale/offline states remain unimplemented here. `L2-04-AC02`, UI acceptance, and
full Debian 13 GNOME/KDE Wayland/X11/native acceptance remain pending. This slice
does not mark L2-04 complete or reduce its agreed scope.
