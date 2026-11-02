# Ownership-marker and first-failure correction

This corrects the two owner P2s from the initial Security/Spec review at
`c1783c931951a0b3729948790d4192090a4e3b36`. The review was delivered and read
in full. The collector framing and real-codec adapter passed that recheck; they
remain unchanged here. The initial owner Standards review is separate.

No actual capture, permit, owner CLI, lab, guest, installer, compiler or native
operation occurred. Tests use owned private source/filesystem fixtures and fake
Lab lifecycle; external transport is forbidden. All97/full local1.0, F0-01
accepted and F1-02 in-progress/UI-pending states remain unchanged.

## Custody before marker removal

The initial reviewer changed the actual private fixture collector during
cleanup. Reply validation rejected the observation, but inherited transaction
cleanup had already deleted its ownership marker. The protocol requires custody
loss to prevent clean reservation release.

The [new owner](../../../../tests/at/lab_install_metadata_owner.py) now checks
the admitted source closure before fresh marker removal, then delegates to the
unchanged artifact/marker checks. `load_marker` records whether a valid prior
marker was loaded by `transact`, whose existing `used` flag is set before that
load. Normal prior-marker recovery still needs no collector. A caller taking
over after guardian loss has not run `transact`; it conservatively checks the
closure even without a cached codec before removing the marker. If unavailable,
shutdown/reaping may complete but the dirty marker remains for recovery.

There is no new preflight marker read, marker schema, source allowance or
cleanup command. A failed check never adopts/removes an artifact, retries a
capture, resets attempt accounting or prevents exact shutdown/reaping.

New actual-composition regressions show source loss during cleanup retains the
marker and private artifact; a fresh uncached caller also refuses release after
source replacement. The positive recovery control removes a valid prior marker
with the collector absent and no `check_sources` call. The fake lifecycle still
has only one start/dispatch and its existing cleanup behavior.

## Known causes remain distinct from cleanup

Both source and artifact reply-validation handlers now pass their caught error
to invalidation. Only an allowlisted owner reason is retained; unknown errors
map to custody, and raw exception text is not emitted. An existing first failure
is preserved. Cleanup uncertainty is separate. A tiny signal-masked section
contains only fixed reason selection and one C dictionary update, with no I/O,
shutdown or waiting. It clears observation and clean-reservation claims together.

The same audit exposed loss of known causes across `close()`'s boolean return.
The owner now retains its first fixed close reason internally. Final invalidation
reports a new close-only failure as `firstFailure=cleanup` with that separate
cleanup reason; an earlier operation cause is preserved. All existing owning
FileIO retirement, ambiguous-close non-retry and descriptor-reuse checks remain.
The internal reason is not a new wire/permit field or authority.

Real SIGALRM/SIGTERM fixtures cover actual source validation, artifact reply
validation, source close and artifact close. Deadline/interruption remains
visible, earlier transport failure stays first, all known attempt flags remain,
and no observation/clean release survives. Earlier-failure controls reuse an
already invalidated lease without clearing its uncertainty or claiming admission.

## Executed evidence

Linux x86_64, Python3.10.12; pinned Node24.22.1/Bun1.4.4:

- **69 owner tests pass**,0.791s; **9 actual-composition tests pass**,2.856s.
  Collector source/test are unchanged from the reviewed53-case correction and
  are included in the full suite.
- Seven new methods against private in-memory exact `c1783c9` owner source
  yield **14 behavioral failures, zero errors/skips**. Current counterparts
  pass. Missing-collector prior recovery and earlier transport controls remain
  positive; source/artifact signal handlers are restored after each probe.
- **55 mapped F1 security tests pass**,17.77s; full Python wrapper16.742s
  under the unchanged18s deadline. No skips/expected failures or widened limits.
- The exact automatic wrapper payload separately completes **533 Python tests**
  in **16.782s**, nativeRun false; [record](python-check.json).
- Typecheck/lint passed for unchanged TypeScript. AST, plan, whitespace,
  historical/current source hashes and unchanged seams pass; current bindings
  are [separate](source-hashes.json) from the preserved
  [earlier snapshot](../coordinator-composition/source-hashes.json).

Only the new owner and its two test files change among the13 prior code/input
bindings. Collector/probe, base owner, imported artifact owner, both frozen
protocols, targets, inventory, wrapper, suite mapping and native execution pins
remain unchanged. The source-probe binding stays48814 returned bytes/48848
quoted bytes, SHA256
`8de614aa1dc4fd4855bae2c18da19b1584c93a2f235d91986762bb5cc8eb7492`.

Fresh independent bounded recheck is required before publication or use.
Protected immutable source custody and a fresh reviewed17-key/six-hash capture
permit still precede actual read-only collection. Trigger/helper/recursive
closure, writer exclusion, capacity/network/activation, install/locale/build/
containment/native/AT/session/release remain unproved. Old guest/APT observations
and historical timeout-descendant absence remain inherited, not established by
these new signal or lifecycle fixtures. No task/criterion promotion, push or PR.
Integration commits use the authorized per-command unsigned fallback, with no
signing configuration change.
