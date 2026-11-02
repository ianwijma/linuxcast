"""Offline fixed diagnostic controls; no guest or owner CLI invocation."""
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[5]
BASE = 'af55d289782b00c8e3e096a9c9c1cb04fb0ac85c'
METHODS = (
    'Parser.test_status_bounds_identify_only_the_fixed_failing_guard',
    'Codec.test_guest_snapshot_and_compressed_packet_limits',
    'Guest.test_fixed_read_bounds_identify_the_guard_without_exporting_path_or_values',
    'Guest.test_update_entry_bound_is_a_fixed_reason',
    'Files.test_diagnostic_codes_remain_unavailable_without_snapshot_or_replay',
)


if __name__ == '__main__':
    path = ROOT / 'apps/desktop/evidence/shell-native-at/build-facts-preparation/check-review-regressions.py'
    spec = importlib.util.spec_from_file_location('reviewed_regression_harness', path)
    harness = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(harness)
    before = subprocess.check_output(['git', 'show', BASE + ':apps/desktop/tests/at/lab_build_facts.py'], cwd=ROOT)
    after = (ROOT / 'apps/desktop/tests/at/lab_build_facts.py').read_bytes()
    red, red_log = harness.run(before, METHODS)
    green, green_log = harness.run(after, METHODS)
    assert red == 1 and 'failures=25' in red_log and 'errors=' not in red_log, red_log
    assert green == 0 and 'Ran 5 tests' in green_log and green_log.rstrip().endswith('OK'), green_log
    print(json.dumps({'baseline': BASE, 'methods': len(METHODS),
                      'reviewed': {'exit': red, 'failures': 25, 'errors': 0},
                      'diagnostic': {'exit': green, 'failures': 0, 'errors': 0}}))
