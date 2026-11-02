"""Trusted private-source controls for bounded discarded-field projection."""
import ast
import copy
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[5]
BASE = 'ef5549cadb7ef156cca19255707d4726504fd6c2'
SOURCE = 'apps/desktop/tests/at/lab_build_facts.py'
METHODS = (
    'Parser.test_long_discarded_fields_are_not_materialized_and_projection_is_identical',
    'Parser.test_discarded_fields_keep_duplicate_syntax_line_and_stanza_guards',
    'Guest.test_long_discarded_metadata_roundtrips_without_exporting_its_value',
)


def embedded(text):
    values = {}
    tree = ast.parse(text)
    for node in tree.body:
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id in (
                'FIELDS', 'FOLDED', 'FAILURES', 'FILESYSTEMS', 'CAPACITY', 'PROBE_SOURCE'):
            exec(compile(ast.Module(body=[node], type_ignores=[]), '<fixed-source-data>', 'exec'), {'repr': repr}, values)
    return values['PROBE_SOURCE']


if __name__ == '__main__':
    path = ROOT / 'apps/desktop/evidence/shell-native-at/build-facts-preparation/check-review-regressions.py'
    spec = importlib.util.spec_from_file_location('reviewed_regression_harness', path)
    harness = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(harness)
    before = subprocess.check_output(['git', 'show', BASE + ':' + SOURCE], cwd=ROOT)
    current = (ROOT / SOURCE).read_bytes()
    red, red_log = harness.run(before, METHODS)
    green, green_log = harness.run(current, METHODS)
    assert red == 1 and 'failures=6' in red_log and 'errors=' not in red_log, red_log
    assert green == 0 and 'Ran 3 tests' in green_log and green_log.rstrip().endswith('OK'), green_log

    # A tempting but incorrect "fix" retains the old accumulator and merely
    # raises its field cap. Projection output is identical, yet values remain
    # materialized. The live-local storage assertion must expose that defect.
    old_guest = ast.parse(embedded(before.decode()))
    old_parser = copy.deepcopy(next(node for node in old_guest.body if isinstance(node, ast.FunctionDef) and node.name == 'package_records'))
    changes = 0
    for node in ast.walk(old_parser):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'need' and len(node.args) == 2:
            if isinstance(node.args[1], ast.Constant) and node.args[1].value == 'bounds-status-field':
                assert isinstance(node.args[0], ast.Compare) and node.args[0].comparators[0].value == 16384
                node.args[0].comparators[0] = ast.Constant(131072)
                changes += 1
    assert changes == 1
    guest = ast.parse(embedded(current.decode()))
    guest.body = [old_parser if isinstance(node, ast.FunctionDef) and node.name == 'package_records' else node for node in guest.body]
    host = ast.parse(current)
    for node in host.body:
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id == 'PROBE_SOURCE':
            node.value = ast.Constant(ast.unparse(ast.fix_missing_locations(guest)))
    mutant = ast.unparse(ast.fix_missing_locations(host)).encode()
    fault, fault_log = harness.run(mutant, METHODS[:1])
    assert fault == 1 and 'failures=3' in fault_log and 'errors=' not in fault_log, fault_log
    print(json.dumps({'baseline': BASE, 'methods': 3, 'oldFailures': 6, 'oldErrors': 0,
                      'currentFailures': 0, 'currentErrors': 0,
                      'materializingAccumulatorControl': {'failures': 3, 'errors': 0}}))
