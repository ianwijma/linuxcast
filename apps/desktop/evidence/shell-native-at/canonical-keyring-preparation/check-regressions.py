"""Private synthetic controls for the fixed Debian13 canonical keyring path."""
import ast
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[5]
BASE = '586045d1a4bea6b9b64b505dc5a51ce2aa4ef364'
SOURCE = 'apps/desktop/tests/at/lab_build_facts.py'
METHODS = (
    'Guest.test_debian_canonical_keyring_with_compatibility_alias_roundtrips',
    'Guest.test_missing_canonical_keyring_never_falls_back_to_regular_alias',
    'Guest.test_canonical_keyring_fifo_directory_empty_owner_and_mode_refuse',
    'Guest.test_canonical_keyring_replacement_is_rejected_by_final_custody',
)

if __name__ == '__main__':
    path = ROOT / 'apps/desktop/evidence/shell-native-at/build-facts-preparation/check-review-regressions.py'
    spec = importlib.util.spec_from_file_location('private_regression_harness', path)
    harness = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(harness)
    before = subprocess.check_output(['git', 'show', BASE + ':' + SOURCE], cwd=ROOT)
    current = (ROOT / SOURCE).read_bytes()
    canonical = b'/usr/share/keyrings/debian-archive-keyring.pgp'
    alias = b'/usr/share/keyrings/debian-archive-keyring.gpg'
    assert current.count(canonical) == before.count(alias) == 2
    assert current.replace(canonical, alias) == before
    ast.parse(current)
    red, red_log = harness.run(before, METHODS)
    green, green_log = harness.run(current, METHODS)
    assert red == 1 and 'failures=4' in red_log and 'errors=' not in red_log, red_log
    assert green == 0 and 'Ran 4 tests' in green_log and green_log.rstrip().endswith('OK'), green_log
    print(json.dumps({'baseline': BASE, 'methods': 4, 'oldFailures': 4, 'oldErrors': 0,
                      'currentFailures': 0, 'currentErrors': 0,
                      'onlyProductionChange': 'two fixed-path literal replacements; all guards unchanged'}))
