"""Offline behavioral controls; never invokes a real controller or fixed host FD3."""
import io
import json
import linecache
from pathlib import Path
import subprocess
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(ROOT / 'apps/desktop/tests/at'))
import test_controller_failures as tests  # noqa: E402

BASE = '00e261702eb70a66ca4a2320ae7a02fa437aadfb'
PATH = 'apps/desktop/tests/at/product_controller.py'
METHODS = (
    'test_interruption_at_deadline_and_preflight_consumption_handoffs_closes_proof',
    'test_main_interruption_at_run_entry_retains_cleanup_ownership',
    'test_ambiguous_proof_close_is_not_retried_and_cleanup_stays_unknown',
)


def module(raw, name):
    # The source is trusted, fixed Git data; __main__ stays inactive. Linecache
    # lets the real boundary tests trace this exact source, without file edits.
    filename = '<' + name + '>'
    linecache.cache[filename] = (len(raw), None, raw.splitlines(True), filename)
    value = types.ModuleType(name)
    value.__file__ = filename
    exec(compile(raw, filename, 'exec'), value.__dict__)
    return value


def run(controller, methods):
    previous = tests.controller
    tests.controller = controller
    stream = io.StringIO()
    try:
        result = unittest.TextTestRunner(stream=stream).run(unittest.TestSuite(
            tests.AttestationTests(name) for name in methods))
    finally:
        tests.controller = previous
    return {'methods': result.testsRun, 'failures': len(result.failures),
            'errors': len(result.errors), 'success': result.wasSuccessful()}


current = tests.controller
raw = subprocess.check_output(['git', 'show', BASE + ':' + PATH], cwd=ROOT).decode()
old = run(module(raw, 'reviewed-custody-base'), METHODS)
fixed = run(current, METHODS)
assert old == {'methods': 3, 'failures': 5, 'errors': 0, 'success': False}, old
assert fixed == {'methods': 3, 'failures': 0, 'errors': 0, 'success': True}, fixed

source = (ROOT / PATH).read_text()
guard = '        if self.attempted:\n            return\n'
assert source.count(guard) == 1
duplicate = run(module(source.replace(guard, '', 1), 'duplicate-close-control'), (
    'test_closed_proof_number_reused_by_later_owner_is_not_closed_again',))
assert duplicate == {'methods': 1, 'failures': 1, 'errors': 0, 'success': False}, duplicate

state = '        self.uncertain = True\n        self.attempted = True\n'
assert source.count(state) == 1
uncertainty = run(module(source.replace(state, state.replace('True', 'False', 1), 1),
                         'untracked-close-control'), (
    'test_interruption_at_close_attempt_cannot_advertise_verified_cleanup',))
assert uncertainty == {'methods': 1, 'failures': 1, 'errors': 0, 'success': False}, uncertainty

print(json.dumps({'reviewedBase': BASE, 'old': old, 'fixed': fixed,
                  'duplicateCloseFaultDetected': duplicate, 'untrackedCloseFaultDetected': uncertainty,
                  'sourceFilesModified': False, 'actualNativeOperations': 0}, sort_keys=True))
