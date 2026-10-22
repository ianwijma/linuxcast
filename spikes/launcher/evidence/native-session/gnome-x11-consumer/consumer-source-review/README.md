# S0-01 consumer-only source review

Source-only, unsigned and uncommitted. No archive authority, guest, native, GUI, signing, staging or publication is established by this bundle. The historical lifecycle439/216370/3f084a and executed artifacts remain unchanged.

`increment.diff` is exactly five owned paths over the frozen lifecycle439 worktree state. `combined.diff` is eight owned paths over signed d8b6f6e8cedfe76e5c97fdac6a0ebe81940f9cab, including that prior reviewed lifecycle increment. Copies here are the five consumer paths.

`consumerRead` stores only the last own bounded request serial, pollCount and exactly five outcome counts: missing, other-serial, matching, parse-rejected and poll-error. Metadata lstat errors record poll-error and rethrow the identical exception; original native trace remains request-written. Missing serial and non-null scalar JSON retain the prior nonmatching behavior. Matching counts a valid observation OR a terminal typed hook failure and is not success evidence.

Counts saturate together after 255 recorded callbacks. Sum(outcomes) always equals pollCount; pollsCapped is set only when additional callbacks occur. A value255 with pollsCapped=false means exactly255 recorded callbacks; true means at least256. Existing polling continues unchanged after diagnostic saturation. Own hrtime subtraction exports only integer milliseconds capped at180000; elapsedCapped=true requires that exact saturated value. Absolute clock origins, cross-process comparisons, file mtimes, rejected values and error text are never exported.

The exact production observe function is type-only stripped into a VM fixture with synthetic FS spies and a deterministic poll scheduler. Cases cover zero callbacks, missing/old/missingserial/scalar/null/malformed/invalidschema, oversize, read errors, same-instance metadata error rethrow, valid observations, typed hook failure and300 callbacks with unchanged300 FS call counts. Strict TS/Python schemas reject private fields, wrong types/ranges and inconsistent count/cap relations before artifact publication. Last-own-request and clock saturation fixtures exercise state reset without clock leakage.

Configured Node24/Vitest preparation163/163 passed5.11s; strict root TS, affectedTS lint, Python AST, git diff check and Node24 native type-stripping protocol import passed. These are preparation results, not native desktop proof.
