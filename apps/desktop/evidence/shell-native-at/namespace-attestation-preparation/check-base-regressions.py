"""Offline red control: load only the two inert modules from the assigned base."""
import linecache
from pathlib import Path
import subprocess
import sys
import types
import unittest

BASE = 'bd5873823d4ca4a6919e4ad3eace9aa6610feef7'
ROOT = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(ROOT / 'apps/desktop/tests/at'))
import test_lab_namespace as wrapper_tests
import test_controller_failures as controller_tests


def main():
    for name, tests in [('lab_namespace', wrapper_tests), ('product_controller', controller_tests)]:
        source = subprocess.check_output(['git', 'show', BASE + ':apps/desktop/tests/at/' + name + '.py'], cwd=ROOT).decode()
        module = types.ModuleType('baseline_' + name)
        module.__file__ = '<assigned-base>/' + name + '.py'
        sys.modules[module.__name__] = module
        linecache.cache[module.__file__] = (len(source), None, source.splitlines(True), module.__file__)
        exec(compile(source, module.__file__, 'exec'), module.__dict__)
        if name == 'lab_namespace':
            wrapper_tests.lab = module
        else:
            controller_tests.controller = module
    suite = unittest.TestSuite([
        wrapper_tests.NamespaceAttestation('test_post_drop_valid_root_memory_allows_pid1_denial_before_staging'),
        controller_tests.AttestationTests('test_valid_proof_allows_pid1_denial_and_is_closed_before_stage'),
        controller_tests.AttestationTests('test_missing_proof_stops_real_preflight_before_stage')])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    expected = (result.testsRun == 3 and len(result.errors) == 2 and len(result.failures) == 1 and not result.skipped
                and all('PermissionError: synthetic PID1 denial' in detail for _, detail in result.errors)
                and "Expected 'receipt_digest' to not have been called" in result.failures[0][1])
    print('Expected behavioral red control:', expected, '; base:', BASE)
    return 0 if expected else 1


if __name__ == '__main__':
    raise SystemExit(main())
