# Writer ownership across hard-alarm interruption

Final independent recheck `9ed544ac` of
`f15abda86b71acfd1736b41def4b100571f01968` resolved four initial P2s and reported
one remaining P2 in writer close custody. Standards had no material findings.
The report was read in full. Real SIGALRM before the close call lost an open
writer; after close but before Python retirement, cleanup could close an unrelated
descriptor reusing the writer number. Correct dirty-custody reporting did not
repair either ownership defect. This is not a clean final recheck.

The coordinator replaces that Python number handoff with one `io.FileIO` owner.
It exclusively creates the0400 writer relative to the retained directory using
a C `functools.partial(os.open, ...)` opener. There is no Python opener holding
an unowned return descriptor. Before close, the file object owns the open writer;
after close, its C-maintained closed state retires the number, including syscall
error paths. The numeric compatibility accessor derives the open writer number
from that object and falls back only to the existing separately retained reader.
Cleanup closes the writer object, never a saved closed writer number.

No signal, including SIGALRM, is masked by the writer close. Deadlines remain
unchanged. A close error keeps publication uncertain; the closed object prevents
an ambiguous numeric-descriptor retry. The existing ambiguous-close test now
injects an exception after the actual file-object close and verifies cleanup
does not invoke it again. Existing readback, path/inode/mode, fsync, private
partial-file preservation, first-failure and guardian checks remain in place.

Creation uses FileIO's `x+` O_CREAT|O_EXCL semantics. On Linux this refuses
symlinks regardless of their targets, as well as existing FIFO/directory/file
objects; it never follows an existing final link. Explicit O_NOFOLLOW remains on
the later independent reader open. The relative filename remains the fixed
validated capture UUID under the retained private directory. This changes the
creation mechanism, not the no-follow/exclusive0400 contract. Existing collision,
symlink/FIFO/directory and dispatch-race regressions still pass.

Primary implementation evidence read for this mechanism:

- [CPython3.10.12 FileIO](https://raw.githubusercontent.com/python/cpython/v3.10.12/Modules/_io/fileio.c)
  and [CPython3.13.5 FileIO](https://raw.githubusercontent.com/python/cpython/v3.13.5/Modules/_io/fileio.c):
  `internal_close` retires the object's number in C around its one close syscall;
  the constructor owns exclusive-create flags, supplied opener results and error
  cleanup. The first version is the executed offline runtime; the second matches
  earlier guest-version metadata, without claiming guest execution here.
- [Linux open(2)](https://man7.org/linux/man-pages/man2/open.2.html): O_CREAT with
  O_EXCL refuses existing symbolic links, supporting the unchanged no-follow
  guarantee. This is source evidence, not a network or installation authority.

Two permanent owned-file tests deliver real SIGALRM through the published signal
handler at both close boundaries. The first requires the exact writer to be
EBADF after cleanup. The second opens an unrelated canary on the retired number
inside the signal handler, then requires its identity and contents to survive
cleanup. Exact independent fixture cleanup also runs on historical reds. Both
tests fail reviewed f15abda with two behavioral failures, zero errors, and pass
fixed code. No process-name actions or host descriptor sweeps are used.

The [repeatable controls](check-review-regressions.py) now verify both baselines:
seven original methods produce eleven failures/zero errors on aafd1bf, and these
two signal methods produce two failures/zero errors on f15abda. All nine methods
pass current source in private temporary copies. The existing ordinary guardian
fixtures retain independent FixtureGuard ownership/reaping.

Coordinator executed on Linux x86_64, CPython3.10.12 and pinned
Node24.22.1/Bun1.4.4:91 focused tests pass1.291s;55 actual mapped security checks
pass11.49s, with the complete386-case Python payload10.184s under unchanged18s.
Explicit complete Python discovery, historical/current hashes, AST, plan and
whitespace checks are recorded separately. Previous full typecheck/lint results
remain unchanged-TypeScript evidence from f15abda, not a fresh run for this
Python-only correction. The remaining writer P2 is coordinator-verified fixed;
a fresh independent recheck is still required before publication/execution.

All three earlier manifests remain historical at their named commits. The new
coordinator-writer-sha256.json records current owner/tests/helper/this report and
the unchanged embedded guest source. No older signature, execution authority or
acceptance is inferred. Actual permit, capture, CLI, lab/guest, install/build,
privileged/native/Orca operations remain zero for this preparation. All97 tasks,
current acceptance states and historical unknown timeout absence remain intact.
