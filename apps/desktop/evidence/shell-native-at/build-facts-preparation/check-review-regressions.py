"""Compare fixed tests with trusted reviewed source in private temporary copies.

No lab/guest/owner CLI is executed. The sole process fixture uses FixtureGuard.
Git baseline is fixed, never accepted from caller input.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[5]
AT = ROOT / 'apps/desktop/tests/at'
BASE = 'aafd1bf7ff60e637d25a414633988a1287cd912b'
METHODS = (
    'Files.test_unavailable_relay_requires_the_permit_capture_identity',
    'Parser.test_multiarch_same_requires_a_concrete_architecture_on_host',
    'Parser.test_host_preserves_absent_half_installed_metadata_as_broken',
    'Guest.test_partial_half_installed_records_survive_collection_and_decode',
    'Guest.test_multiarch_same_with_all_or_missing_architecture_is_malformed',
    'Files.test_cancellation_before_writer_close_retains_exact_descriptor_for_cleanup',
    'OrdinaryProcesses.test_guardian_final_close_failure_invalidates_handed_off_observation',
)


def run(source):
    with tempfile.TemporaryDirectory(prefix='f102-review-regression-') as directory:
        private = Path(directory)
        (private / 'lab_build_facts.py').write_bytes(source)
        (private / 'test_lab_build_facts.py').write_bytes((AT / 'test_lab_build_facts.py').read_bytes())
        # Ordinary-process fixtures intentionally drop PYTHONPATH. Their same
        # private directory must therefore contain the unchanged base modules.
        for name in ('lab_owner.py', 'test_lab_owner.py'):
            (private / name).write_bytes((AT / name).read_bytes())
        environment = dict(PATH='/usr/bin:/bin', LANG='C', LC_ALL='C', HOME='/nonexistent',
                           PYTHONPATH=str(private) + os.pathsep + str(AT), PYTHONDONTWRITEBYTECODE='1')
        result = subprocess.run([sys.executable, '-B', '-m', 'unittest',
                                 *('test_lab_build_facts.' + method for method in METHODS)],
                                cwd=private, env=environment, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10, check=False)
        return result.returncode, result.stderr.decode('utf-8')


if __name__ == '__main__':
    reviewed = subprocess.check_output(['git', 'show', BASE + ':apps/desktop/tests/at/lab_build_facts.py'], cwd=ROOT)
    old_code, old_log = run(reviewed)
    new_code, new_log = run((AT / 'lab_build_facts.py').read_bytes())
    assert old_code == 1 and 'failures=11' in old_log and 'errors=' not in old_log, old_log
    assert new_code == 0 and 'Ran 7 tests' in new_log and new_log.rstrip().endswith('OK'), new_log
    print(json.dumps({'baseline': BASE, 'methods': len(METHODS),
                      'reviewed': {'exit': old_code, 'failures': 11, 'errors': 0},
                      'fixed': {'exit': new_code, 'failures': 0, 'errors': 0}}))
