#!/usr/bin/python3
"""Harmless local schema/filesystem/owned-child checks; no display/bus/guest."""
import copy
import importlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import collect

SOURCE = pathlib.Path('/tmp/linuxcast-s0-01/spikes/launcher/tests/native-session')
sys.path.insert(0, str(SOURCE))
artifacts = importlib.import_module('artifacts')
supervision = importlib.import_module('supervision')


class Checks(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='linuxcast-collector-test-')
        self.root = pathlib.Path(self.temporary.name)
        self.report = artifacts.fallback_result('gnome-x11')
        self.report.update(privateProcessTreeCleanupVerified=True, packages=['gnome-shell 48.7'])

    def tearDown(self):
        self.temporary.cleanup()

    def test_valid_incomplete_report(self):
        self.assertEqual(collect.public_report(self.report, artifacts), self.report)

    def test_unknown_top_and_nested_private_fields(self):
        for field in ('private', 'observerStartup'):
            value = copy.deepcopy(self.report)
            value[field] = {'private': '/private/canary'}
            with self.assertRaises(ValueError):
                collect.public_report(value, artifacts)

    def test_forged_physical_true(self):
        self.report['physicalDesktopMatrixEstablished'] = True
        with self.assertRaises(ValueError):
            collect.public_report(self.report, artifacts)

    def capture_fixture(self):
        manifest = json.loads((SOURCE / 'dist/manifest.json').read_text())
        authority = json.loads(pathlib.Path('/tmp/linuxcast-s001-prevalidation-51ed-immutable/authority.json').read_text())
        (self.root / 'report.json').write_text(json.dumps(self.report))
        (self.root / 'source-manifest.json').write_text(json.dumps(manifest))
        return authority, manifest

    def test_capture_first_incomplete_without_invented_screenshots(self):
        authority, manifest = self.capture_fixture()
        files, result = collect.capture(self.root, authority, artifacts, 3, manifest)
        self.assertEqual(set(files), {'report.json', 'source-manifest.json'})
        self.assertEqual(result, manifest)

    def test_capture_cannot_promote_nonzero_or_zero_mismatch(self):
        authority, manifest = self.capture_fixture()
        for status in (0, -9, 4):
            with self.assertRaises(ValueError):
                collect.capture(self.root, authority, artifacts, status, manifest)

    def test_capture_rejects_forged_output_hash_and_unknown_manifest_key(self):
        authority, manifest = self.capture_fixture()
        for private in (False, True):
            forged = copy.deepcopy(manifest)
            if private:
                forged['private'] = '/private/canary'
            else:
                forged['outputSha256']['extension.js'] = '0' * 64
            (self.root / 'source-manifest.json').write_text(json.dumps(forged))
            with self.assertRaises(ValueError):
                collect.capture(self.root, authority, artifacts, 3, manifest)

    def test_postrun_build_rejects_self_consistent_manifest_or_output_change(self):
        directory = self.root / 'dist'
        directory.mkdir()
        original = (SOURCE / 'dist/manifest.json').read_bytes()
        (directory / 'manifest.json').write_bytes(original)
        manifest = json.loads(original)
        altered = copy.deepcopy(manifest)
        altered['outputSha256']['extension.js'] = '0' * 64
        runner = types.SimpleNamespace(verify_build=lambda _directory: altered)
        with self.assertRaises(ValueError):
            collect.verify_unchanged_build(self.root, runner, manifest)
        (directory / 'manifest.json').write_text(json.dumps(altered))
        with self.assertRaises(ValueError):
            collect.verify_unchanged_build(self.root, runner, altered)

    def test_capture_rejects_bad_or_symlink_screenshot(self):
        authority, manifest = self.capture_fixture()
        image = self.root / 'dark-launcher.png'
        image.write_bytes(b'private-canary')
        with self.assertRaises(ValueError):
            collect.capture(self.root, authority, artifacts, 3, manifest)
        image.unlink()
        image.symlink_to(self.root / 'report.json')
        with self.assertRaises(ValueError):
            collect.capture(self.root, authority, artifacts, 3, manifest)

    def test_authority_rejects_tampered_actual_renderer_input(self):
        original = pathlib.Path('/tmp/linuxcast-s001-prevalidation-51ed-immutable')
        authority = json.loads((original / 'authority.json').read_text())
        stage = self.root / 'source'
        stage.mkdir()
        paths = {str(collect.RELATIVE / name) for name in authority['sourceSha256']}
        paths.update(authority['reviewedPatchedFileSha256'])
        paths.update(('docs/design/tokens.json', 'spikes/launcher/resources/io.github.ianwijma.Linuxcast.desktop'))
        for name in paths:
            destination = stage / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(pathlib.Path('/tmp/linuxcast-s0-01') / name, destination)
        collect.verify_authority(stage, original / 'source.tgz', original / 'authority.json')
        (stage / 'spikes/launcher/src/renderer/main.tsx').write_text('private-canary')
        with self.assertRaises(ValueError):
            collect.verify_authority(stage, original / 'source.tgz', original / 'authority.json')

    def test_cleanup_and_package_types(self):
        for field, value in (('privateProcessTreeCleanupVerified', 1), ('packages', ['/private/canary']),
                             ('packages', ['gnome-shell 48.7'] * 6), ('packages', ['gnome-shell 48.7'] * 2)):
            report = copy.deepcopy(self.report)
            report[field] = value
            with self.assertRaises(ValueError):
                collect.public_report(report, artifacts)

    def test_regular_bounds_and_symlink(self):
        file = self.root / 'file'
        file.write_bytes(b'public')
        link = self.root / 'link'
        link.symlink_to(file)
        self.assertEqual(collect.regular_bytes(file, 6), b'public')
        for target, size in ((file, 5), (link, 6), (self.root, 100)):
            with self.assertRaises(ValueError):
                collect.regular_bytes(target, size)

    def test_publish_collision_preserves_existing_content(self):
        destination = self.root / 'result'
        destination.mkdir()
        canary = destination / 'canary'
        canary.write_text('retained')
        with self.assertRaises(ValueError):
            collect.publish(destination, {'report.json': b'{}'})
        self.assertEqual(canary.read_text(), 'retained')

    def test_publish_symlink_and_unknown_name(self):
        target = self.root / 'target'
        target.mkdir()
        destination = self.root / 'result'
        destination.symlink_to(target)
        with self.assertRaises(ValueError):
            collect.publish(destination, {'report.json': b'{}'})
        destination.unlink()
        with self.assertRaises(ValueError):
            collect.publish(destination, {'raw-private-log.txt': b'/private/canary'})
        self.assertFalse(destination.exists())

    def test_publish_exclusive_mode(self):
        destination = self.root / 'result'
        collect.publish(destination, {'report.json': b'{}'})
        self.assertEqual((destination / 'report.json').stat().st_mode & 0o777, 0o600)
        self.assertEqual(destination.stat().st_mode & 0o777, 0o700)

    def test_cleanup_only_recorded_inode(self):
        file = self.root / 'owned'
        file.write_text('owned')
        expected = collect.identity(file)
        file.rename(self.root / 'original')
        file.write_text('collision')
        self.assertFalse(collect.cleanup_owned([(file, expected, False)]))
        self.assertEqual(file.read_text(), 'collision')

    def test_cleanup_owned_stage_and_symlink_target_survives(self):
        stage = self.root / 'stage'
        stage.mkdir()
        outside = self.root / 'outside'
        outside.write_text('retained')
        (stage / 'link').symlink_to(outside)
        self.assertTrue(collect.cleanup_owned([(stage, collect.identity(stage), True)]))
        self.assertEqual(outside.read_text(), 'retained')

    def test_minimal_environment_omits_inherited_secrets(self):
        with patch.dict(os.environ, {'DISPLAY': ':0', 'DBUS_SESSION_BUS_ADDRESS': 'private-canary',
                                     'OPENAI_API_KEY': 'private-canary', 'LD_PRELOAD': 'private-canary'}):
            env = collect.runner_environment(self.root)
        self.assertFalse({'DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'OPENAI_API_KEY', 'LD_PRELOAD'} & set(env))
        self.assertNotIn('private-canary', json.dumps(env))

    def test_baseline_requires_exact_zero_two_and_marker_absent(self):
        value = {'fixedProcessCounts': collect.EXPECTED_COUNTS.copy(), 'privateMatrixRootsAbsent': True, 'inputLabMarkerAbsent': True}
        self.assertTrue(collect.clean_baseline(value))
        for key in ('privateMatrixRootsAbsent', 'inputLabMarkerAbsent'):
            candidate = copy.deepcopy(value)
            candidate[key] = False
            self.assertFalse(collect.clean_baseline(candidate))
        value['fixedProcessCounts']['dbus-daemon'] = 3
        self.assertFalse(collect.clean_baseline(value))
        self.assertFalse(collect.clean_baseline(None))

    def test_timeout_has_one_invocation_and_owned_descendant_cleanup(self):
        counter = self.root / 'counter'
        code = ('import pathlib,subprocess,sys,time; '
                'pathlib.Path(sys.argv[1]).write_text("one"); '
                'subprocess.Popen([sys.executable,"-c","import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(30)"],start_new_session=True); '
                'time.sleep(30)')
        outcome, status = collect.invoke_once([sys.executable, '-c', code, str(counter)],
                                             {'PATH': '/usr/bin:/bin'}, self.root,
                                             lambda: supervision.Supervisor(grace=0.1), ceiling=0.2)
        self.assertEqual((outcome, status), ('runner-timeout', None))
        self.assertEqual(counter.read_text(), 'one')
        self.assertEqual(supervision.Supervisor.descendants(), {})

    def test_exception_after_spawn_still_cleans_owned_process(self):
        real = subprocess.Popen
        called = []

        def broken_wait(*args, **kwargs):
            child = real(*args, **kwargs)
            called.append(child.pid)
            child.wait = lambda **_kwargs: (_ for _ in ()).throw(OSError('private-canary'))
            return child

        with patch.object(collect.subprocess, 'Popen', broken_wait):
            with self.assertRaises(OSError):
                collect.invoke_once([sys.executable, '-c', 'import time; time.sleep(30)'],
                                    {'PATH': '/usr/bin:/bin'}, self.root,
                                    lambda: supervision.Supervisor(grace=0.1), ceiling=0.2)
        self.assertEqual(len(called), 1)
        self.assertFalse(pathlib.Path('/proc', str(called[0])).exists())
        self.assertEqual(supervision.Supervisor.descendants(), {})

    def test_post_snapshot_failure_does_not_escape(self):
        with patch.object(collect, 'snapshot', side_effect=OSError('private-canary')):
            self.assertIsNone(collect.safe_snapshot(self.root))

    def test_process_counter_drops_unmatched_private_comm(self):
        for index, name in enumerate(('node', 'dbus-daemon', 'dbus-daemon', 'private-canary'), 10):
            directory = self.root / str(index)
            directory.mkdir()
            (directory / 'comm').write_text(name + '\n')
        counts = collect.process_counts(self.root)
        self.assertEqual(counts['node'], 1)
        self.assertEqual(counts['dbus-daemon'], 2)
        self.assertNotIn('private-canary', json.dumps(counts))

    def test_bad_entry_never_invokes_child(self):
        with patch.object(sys, 'argv', ['collector']), patch.object(collect, 'invoke_once') as invoke:
            with self.assertRaises(ValueError):
                collect.main()
            invoke.assert_not_called()


if __name__ == '__main__':
    unittest.main(verbosity=2)
