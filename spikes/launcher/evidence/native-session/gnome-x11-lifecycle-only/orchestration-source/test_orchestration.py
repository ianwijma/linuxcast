#!/usr/bin/python3
"""Harmless offline wrapper/parser tests. Docker/SSH/main are never invoked."""
import base64
import copy
import hashlib
import io
import json
import os
import pathlib
import signal
import sys
import tarfile
import tempfile
import types
import threading
import time
import unittest
from unittest.mock import patch

import collect
import guest_phase
import host
import test_collect


class Checks(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='linuxcast-orchestration-test-')
        self.root = pathlib.Path(self.temporary.name)
        self.authority = json.loads((host.IMMUTABLE / 'authority.json').read_text())
        self.manifest = json.loads((host.IMMUTABLE / 'build-manifest.json').read_text())
        self.snapshot = {'fixedProcessCounts': collect.EXPECTED_COUNTS.copy(), 'privateMatrixRootsAbsent': True, 'inputLabMarkerAbsent': True}

    def tearDown(self):
        self.temporary.cleanup()

    def response(self):
        dated = {**self.snapshot, 'checkedUtc': '2026-10-23T00:00:00+00:00'}
        cleanup = {'beforeExecution': dated, 'afterRunner': dated, 'afterRelease': dated,
                   'ownGuestSourceArchivesAndCachesRemoved': True, 'cleanReleaseVerified': True,
                   'hostSettingsOrDisplaysChanged': False, 'physicalDesktopMatrixEstablished': False}
        provenance = {'task': 'S0-01', 'backend': 'gnome-x11', 'probeMode': collect.PROBE_MODE, 'selectedChecksCompleted': False, 'collectorOutcome': 'completed',
            'startedUtc': '2026-10-23T00:00:00+00:00', 'finishedUtc': '2026-10-23T00:00:01+00:00', 'exitCode': 3,
            'executedRuntimeCommit': None, 'runtimeInputsMatchSignedCommit': False,
            'verifiedSignedBaselineCommit': collect.SIGNED_BASELINE, 'unsignedRuntimeInputs': list(collect.UNSIGNED_RUNTIME_INPUTS), 'sourceStatusScope': collect.SOURCE_SCOPE, 'sourceSigned': False, 'sourceDirty': True, 'reviewedIncrementSha256': collect.INCREMENT,
            'archiveRepresentsWholeSignedTree': False, 'collectorSha256': host.COLLECTOR_HASH,
            'privateSocketPathMaxBytes': 107, 'privateSocketPathLengths': collect.socket_layout(pathlib.Path('/home/debian/lc1-xxxxxxxx/source')),
            'archiveConstruction': dict(collect.ARCHIVE_CONSTRUCTION),
            'archiveSha256': collect.ARCHIVE_HASH, 'sourceArchiveAuthoritySha256': collect.AUTHORITY_HASH,
            'sourceInputsVerified': 24, 'sourceSha256': self.authority['sourceSha256'], 'outputSha256': self.manifest['outputSha256'],
            'designTokensSha256': self.authority['designTokensSha256'], 'launcherDesktopFileSha256': self.authority['launcherDesktopFileSha256'],
            'sourceUnchangedDuringRun': True, 'rendererPixelsCaptured': False, 'screenshotKind': 'not-captured', 'physicalDesktopMatrixEstablished': False}
        report = test_collect.artifacts.fallback_result('gnome-x11','lifecycle-only')
        report.update(privateProcessTreeCleanupVerified=True, packages=['gnome-shell 48.7'])
        files = {'provenance.json': provenance, 'cleanup.json': cleanup, 'report.json': report, 'source-manifest.json': self.manifest}
        return {'phase': 'native-attempted', 'collectorExitCode': 3,
                'files': {name: base64.b64encode(json.dumps(value).encode()).decode() for name, value in files.items()},
                'before': self.snapshot, 'release': self.snapshot, 'ownedGuestCapsuleRemoved': True,
                'expectedToolSha256': guest_phase.TOOL_HASHES, 'toolsVerifiedBeforeAndAfter': True}

    def validate(self, value):
        return host.public_response(json.dumps(value).encode(), collect, self.authority, test_collect.artifacts, self.manifest)

    def edit_file(self, response, name, edit):
        value = json.loads(base64.b64decode(response['files'][name]))
        edit(value)
        response['files'][name] = base64.b64encode(json.dumps(value).encode()).decode()

    def test_valid_first_incomplete_and_clean_release(self):
        files, release = self.validate(self.response())
        self.assertEqual(len(files), 4)
        self.assertTrue(release['guestReleaseVerified'])
        self.assertEqual(release['collectorExitCode'], 3)

    def test_extra_outer_and_nested_private_metadata_rejected(self):
        value = self.response()
        value['private'] = '/private/canary'
        with self.assertRaises(ValueError):
            self.validate(value)
        for name in ('report.json', 'source-manifest.json', 'cleanup.json', 'provenance.json'):
            value = self.response()
            self.edit_file(value, name, lambda item: item.update(private={'nested': '/private/canary'}))
            with self.assertRaises(ValueError):
                self.validate(value)

    def test_unknown_file_and_bad_base64_rejected(self):
        for name, data in (('raw-private.log', 'canary'), ('report.json', '!!')):
            value = self.response()
            value['files'][name] = data
            with self.assertRaises(ValueError):
                self.validate(value)

    def test_forged_physical_or_whole_archive_signed_claim(self):
        for key in ('physicalDesktopMatrixEstablished', 'archiveRepresentsWholeSignedTree'):
            value = self.response()
            self.edit_file(value, 'provenance.json', lambda item: item.update({key: True}))
            with self.assertRaises(ValueError):
                self.validate(value)

    def test_strict_unsigned_runtime_and_mixed_archive_claims_are_exact(self):
        mutations = {'executedRuntimeCommit': collect.SIGNED_BASELINE, 'runtimeInputsMatchSignedCommit': True,
                     'sourceSigned': True, 'sourceDirty': False, 'signedRuntimeCommit': collect.SIGNED_BASELINE,
                     'verifiedSignedBaselineCommit': 'a'*40, 'unsignedRuntimeInputs': [], 'probeMode': 'full', 'sourceStatusScope': 'whole-archive', 'reviewedIncrementSha256': '0'*64}
        for key, changed in mutations.items():
            value = self.response()
            self.edit_file(value, 'provenance.json', lambda item: item.update({key: changed}))
            with self.assertRaises(ValueError):self.validate(value)
        for key, changed in {'baselineCommit': 'a'*40, 'signedOverlaySourceCommit': 'a'*40,
                             'reviewedUnsignedIncrementSha256': '0'*64, 'reviewedUnsignedIncrementManifestSha256': '0'*64, 'unsignedWhenPrepared': False, 'private': 'private-canary'}.items():
            value = self.response()
            self.edit_file(value, 'provenance.json', lambda item: item['archiveConstruction'].update({key: changed}))
            with self.assertRaises(ValueError):self.validate(value)

    def test_unconfirmed_or_changed_invocation_has_no_executed_commit(self):
        for outcome, unchanged in (('collector-rejected', True), ('runner-timeout', True), ('cancelled', True), ('completed', False)):
            value = self.response()
            def change(item):item.update(collectorOutcome=outcome, sourceUnchangedDuringRun=unchanged, executedRuntimeCommit=None)
            self.edit_file(value, 'provenance.json', change)
            files, _ = self.validate(value)
            saved = json.loads(files['provenance.json'])
            self.assertIsNone(saved['executedRuntimeCommit']);self.assertEqual(saved['verifiedSignedBaselineCommit'], collect.SIGNED_BASELINE)
            self.edit_file(value, 'provenance.json', lambda item: item.update(executedRuntimeCommit=collect.SIGNED_BASELINE))
            with self.assertRaises(ValueError):self.validate(value)

    def test_lifecycle_public_report_roundtrip_and_nested_private_rejection(self):
        state = {'compositor': {'state': 'running', 'exitCode': None},
                 'drain': {'eofObserved': True, 'readerAlive': False, 'stopRequested': True}}
        observer = {'latest': {'checkpoints': [], 'requests': [], 'extensionInfo': {'status': 'INFO_UNAVAILABLE'}},
                    'lifecycle': {'finally': state}}
        value = self.response()
        self.edit_file(value, 'report.json', lambda item: item.update(observerStartup=observer))
        files, _ = self.validate(value)
        self.assertEqual(json.loads(files['report.json'])['observerStartup'], observer)
        self.edit_file(value, 'report.json', lambda item: item['observerStartup']['lifecycle']['finally']['drain'].update(private='synthetic-private-canary'))
        with self.assertRaises(ValueError):
            self.validate(value)

    def test_consumer_public_report_roundtrip_at_explicit_saturation(self):
        consumer = {'request': 2, 'pollCount': 255,
                    'outcomes': {'missing': 0, 'other-serial': 255, 'matching': 0, 'parse-rejected': 0, 'poll-error': 0},
                    'pollsCapped': True, 'elapsedMs': 180000, 'elapsedCapped': True}
        value = self.response()
        self.edit_file(value, 'report.json', lambda item: item.update(consumerRead=consumer))
        files, release = self.validate(value)
        self.assertEqual(json.loads(files['report.json'])['consumerRead'], consumer)
        self.assertEqual(release['collectorExitCode'], 3)
        self.assertEqual(json.loads(files['report.json'])['status'], 'incomplete')

    def test_consumer_public_report_rejects_private_types_counts_and_forged_caps(self):
        consumer = {'request': 2, 'pollCount': 0,
                    'outcomes': {'missing': 0, 'other-serial': 0, 'matching': 0, 'parse-rejected': 0, 'poll-error': 0},
                    'pollsCapped': False, 'elapsedMs': 1, 'elapsedCapped': False}
        mutations = [lambda row: row.update(private='synthetic-private-canary'),
                     lambda row: row['outcomes'].update(private='synthetic-private-canary'),
                     lambda row: row.update(pollCount=True), lambda row: row.update(request=True),
                     lambda row: row.update(pollsCapped=True), lambda row: row.update(elapsedCapped=True),
                     lambda row: row['outcomes'].update(missing=1),
                     lambda row: row['outcomes'].update(matching='synthetic-private-canary')]
        for change in mutations:
            value = self.response()
            altered = copy.deepcopy(consumer)
            change(altered)
            self.edit_file(value, 'report.json', lambda item: item.update(consumerRead=altered))
            with self.assertRaises(ValueError):
                self.validate(value)

    def test_previous_lifecycle_provenance_is_not_a_consumer_run(self):
        previous = json.loads(pathlib.Path('/tmp/linuxcast-s001-lifecycle-immutable/authority.json').read_text())
        mutations = {'reviewedIncrementSha256': previous['reviewedIncrementSha256'],
                     'archiveSha256': previous['archiveSha256'],
                     'sourceArchiveAuthoritySha256': hashlib.sha256(pathlib.Path('/tmp/linuxcast-s001-lifecycle-immutable/authority.json').read_bytes()).hexdigest(),
                     'collectorSha256': '466f7358200055c3a7d29eaab7ef43b88995d4dcb982d02c9ad63523a57a3aff'}
        for name, old in mutations.items():
            value = self.response()
            self.edit_file(value, 'provenance.json', lambda item: item.update({name: old}))
            with self.assertRaises(ValueError):
                self.validate(value)

    def test_previous_signed_readiness_anchor_is_not_this_focus_candidate(self):
        old = json.loads(pathlib.Path('/tmp/linuxcast-s001-readiness-immutable/authority.json').read_text())
        mutations = {'executedRuntimeCommit': old['signedRuntimeCommit'], 'signedRuntimeCommit': old['signedRuntimeCommit'],
                     'verifiedSignedBaselineCommit': old['verifiedRuntimeCommit'], 'archiveSha256': old['archiveSha256'],
                     'sourceArchiveAuthoritySha256': hashlib.sha256(pathlib.Path('/tmp/linuxcast-s001-readiness-immutable/authority.json').read_bytes()).hexdigest(),
                     'reviewedIncrementSha256': old['reviewedIncrementSha256']}
        for key, changed in mutations.items():
            value = self.response()
            self.edit_file(value, 'provenance.json', lambda item: item.update({key: changed}))
            with self.assertRaises(ValueError):self.validate(value)
        value = self.response()
        self.edit_file(value, 'provenance.json', lambda item: item['archiveConstruction'].update(signedOverlaySourceCommit=old['signedRuntimeCommit']))
        with self.assertRaises(ValueError):self.validate(value)

    def test_forged_zero_exit_cannot_promote_incomplete(self):
        value = self.response()
        value['collectorExitCode'] = 0
        with self.assertRaises(ValueError):
            self.validate(value)

    def test_bad_release_snapshot_is_preserved_as_unverified(self):
        value = self.response()
        value['release']['fixedProcessCounts']['node'] = 1
        _, release = self.validate(value)
        self.assertFalse(release['guestReleaseVerified'])

    def test_false_clean_release_claim_rejected(self):
        value = self.response()
        self.edit_file(value, 'cleanup.json', lambda item: item['afterRelease'].update(inputLabMarkerAbsent=False))
        with self.assertRaises(ValueError):
            self.validate(value)

    def test_unavailable_transport_no_raw_response_published(self):
        value = {'phase': 'entry-rejected', 'collectorExitCode': None, 'files': {}, 'before': None,
                 'release': None, 'ownedGuestCapsuleRemoved': False,
                 'expectedToolSha256': guest_phase.TOOL_HASHES, 'toolsVerifiedBeforeAndAfter': False}
        files, release = self.validate(value)
        self.assertFalse(files)
        self.assertFalse(release['guestReleaseVerified'])

    def test_guest_preparation_failure_always_removes_internally_owned_root(self):
        values = {'collect.py': b'raise ValueError("private-canary")', 'source.tgz': b'fixture', 'authority.json': b'fixture'}
        payload = {'files': {name: base64.b64encode(value).decode() for name, value in values.items()},
                   'sha256': {name: hashlib.sha256(value).hexdigest() for name, value in values.items()}}
        original_read = pathlib.Path.read_text

        def read(path, *args, **kwargs):
            return 'ID=debian\nVERSION_ID="13"\n' if str(path) == '/etc/os-release' else original_read(path, *args, **kwargs)

        with patch.object(guest_phase, 'HOME', self.root), patch.object(guest_phase, 'PAYLOAD', payload, create=True), \
             patch.object(guest_phase.os, 'getuid', return_value=1000), patch.object(guest_phase.os, 'geteuid', return_value=1000), \
             patch.object(guest_phase.os, 'uname', return_value=types.SimpleNamespace(release='6.12.113+deb13-amd64')), \
             patch.object(pathlib.Path, 'read_text', read), patch.object(guest_phase, 'snapshot', return_value=self.snapshot), patch.object(guest_phase, 'verify_tools', return_value=True), \
             patch.object(guest_phase.subprocess, 'Popen') as spawn:
            value = guest_phase.execute()
        spawn.assert_not_called()
        self.assertEqual(value['phase'], 'preparation-failed')
        self.assertTrue(value['ownedGuestCapsuleRemoved'])
        self.assertFalse(list(self.root.iterdir()))
        self.assertNotIn('private-canary', json.dumps(value))

    def test_guest_entry_rejects_before_root_creation(self):
        with patch.object(guest_phase.os, 'getuid', return_value=0), patch.object(guest_phase.tempfile, 'mkdtemp') as mkdir:
            with self.assertRaises(ValueError):
                guest_phase.execute()
        mkdir.assert_not_called()

    def test_extraction_rejects_traversal_link_duplicate(self):
        for name, kind in (('../private-canary', tarfile.REGTYPE), ('link', tarfile.SYMTYPE), ('duplicate', tarfile.REGTYPE)):
            buffer = io.BytesIO()
            with tarfile.open(fileobj=buffer, mode='w:gz') as archive:
                member = tarfile.TarInfo(name)
                member.type = kind
                archive.addfile(member, io.BytesIO())
                if name == 'duplicate':
                    archive.addfile(member, io.BytesIO())
            with self.assertRaises(ValueError):
                guest_phase.extract(buffer.getvalue(), self.root)
            self.assertFalse(list(self.root.iterdir()))

    def test_extraction_exclusive_collision_retained(self):
        file = self.root / 'public'
        file.write_text('retained')
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode='w:gz') as archive:
            member = tarfile.TarInfo('public')
            archive.addfile(member, io.BytesIO())
        with self.assertRaises(FileExistsError):
            guest_phase.extract(buffer.getvalue(), self.root)
        self.assertEqual(file.read_text(), 'retained')

    def test_bounded_pipe_private_overflow_is_discarded(self):
        command = [sys.executable, '-c', 'import sys; sys.stdin.buffer.read(); sys.stdout.buffer.write(b"x"*(25*1024*1024))']
        with self.assertRaises(ValueError):
            host.bounded_response(command, b'public', lambda: test_collect.supervision.Supervisor(grace=0.1))
        self.assertEqual(test_collect.supervision.Supervisor.descendants(), {})

    def test_bounded_pipe_safe_single_response(self):
        command = [sys.executable, '-c', 'import sys; sys.stdin.buffer.read(); print("{}")']
        self.assertEqual(host.bounded_response(command, b'public', lambda: test_collect.supervision.Supervisor(grace=0.1)), b'{}\n')

    def test_pinned_tools_owned_regular_digest_and_changes(self):
        tools = self.root / 'linuxcast-tools/bin'
        tools.mkdir(parents=True)
        hashes = {}
        for name in ('node', 'bun'):
            (tools / name).write_bytes(name.encode())
            (tools / name).chmod(0o700)
            hashes[name] = hashlib.sha256(name.encode()).hexdigest()
        with patch.object(guest_phase, 'HOME', self.root), patch.object(guest_phase, 'TOOL_HASHES', hashes):
            self.assertTrue(guest_phase.verify_tools())
            (tools / 'node').write_bytes(b'changed')
            with self.assertRaises(ValueError):
                guest_phase.verify_tools()
            (tools / 'node').write_bytes(b'node')
            (tools / 'node').chmod(0o722)
            with self.assertRaises(ValueError):
                guest_phase.verify_tools()
            (tools / 'node').unlink()
            (tools / 'node').symlink_to(tools / 'bun')
            with self.assertRaises(ValueError):
                guest_phase.verify_tools()

    def test_all_install_cache_paths_are_private_children(self):
        stage = self.root / 'source'
        stage.mkdir(mode=0o700)
        env = guest_phase.preparation_environment(stage)
        for name in ('TMPDIR', 'BUN_TMPDIR', 'BUN_INSTALL_CACHE_DIR', 'electron_config_cache', 'XDG_CACHE_HOME'):
            path = pathlib.Path(env[name])
            self.assertEqual(path.parent, stage)
            self.assertEqual(path.stat().st_mode & 0o777, 0o700)
        collision_stage = self.root / 'collision'
        collision_stage.mkdir()
        (collision_stage / '.install-tmp').symlink_to(self.root)
        with self.assertRaises(FileExistsError):
            guest_phase.preparation_environment(collision_stage)

    def test_guest_failed_assignment_after_spawn_still_cleans_tree_and_root(self):
        values = {'collect.py': b'fixture', 'source.tgz': b'fixture', 'authority.json': b'fixture'}
        hashes = {name: hashlib.sha256(value).hexdigest() for name, value in values.items()}
        payload = {'files': {name: base64.b64encode(value).decode() for name, value in values.items()}, 'sha256': hashes}
        collector = types.SimpleNamespace(ARCHIVE_HASH=hashes['source.tgz'], AUTHORITY_HASH=hashes['authority.json'],
                                          RELATIVE=collect.RELATIVE, verify_authority=lambda *_args: None)
        original_read, original_spawn = pathlib.Path.read_text, guest_phase.subprocess.Popen
        children = []

        def read(path, *args, **kwargs):
            return 'ID=debian\nVERSION_ID="13"\n' if str(path) == '/etc/os-release' else original_read(path, *args, **kwargs)

        def spawned_but_assignment_fails(*_args, **_kwargs):
            child = original_spawn([sys.executable, '-c', 'import time; time.sleep(30)'], start_new_session=True)
            children.append(child)
            raise OSError('private-canary')

        def loader(_file, name):
            return collector if name == 'linuxcast_s001_collector' else test_collect.supervision

        with patch.object(guest_phase, 'HOME', self.root), patch.object(guest_phase, 'PAYLOAD', payload, create=True), \
             patch.object(guest_phase.os, 'getuid', return_value=1000), patch.object(guest_phase.os, 'geteuid', return_value=1000), \
             patch.object(guest_phase.os, 'uname', return_value=types.SimpleNamespace(release='6.12.113+deb13-amd64')), \
             patch.object(pathlib.Path, 'read_text', read), patch.object(guest_phase, 'snapshot', return_value=self.snapshot), \
             patch.object(guest_phase, 'verify_tools', return_value=True), patch.object(guest_phase, 'load', loader), \
             patch.object(guest_phase, 'extract'), patch.object(guest_phase, 'preparation_environment', return_value={}), \
             patch.object(guest_phase.subprocess, 'Popen', spawned_but_assignment_fails):
            value = guest_phase.execute()
        self.assertEqual(len(children), 1)
        children[0].poll()
        self.assertFalse(pathlib.Path('/proc', str(children[0].pid)).exists())
        self.assertEqual(test_collect.supervision.Supervisor.descendants(), {})
        self.assertTrue(value['ownedGuestCapsuleRemoved'])
        self.assertFalse(list(self.root.iterdir()))
        self.assertNotIn('private-canary', json.dumps(value))

    def test_full_guest_repeated_hup_reaps_detached_resistant_child_before_delete(self):
        values = {'collect.py': b'fixture', 'source.tgz': b'fixture', 'authority.json': b'fixture'}
        hashes = {name: hashlib.sha256(value).hexdigest() for name, value in values.items()}
        payload = {'files': {name: base64.b64encode(value).decode() for name, value in values.items()}, 'sha256': hashes}
        collector = types.SimpleNamespace(ARCHIVE_HASH=hashes['source.tgz'], AUTHORITY_HASH=hashes['authority.json'],
                                          RELATIVE=collect.RELATIVE, verify_authority=lambda *_args: None)
        original_read = pathlib.Path.read_text
        original_spawn = guest_phase.subprocess.Popen
        original_remove = guest_phase.shutil.rmtree
        closing = threading.Event()
        deleted = threading.Event()
        ready = self.root / 'ready'
        repeats = []
        errors = []
        children = []

        class ObservableSupervisor(test_collect.supervision.Supervisor):
            def __init__(self):
                # Fixture duration only; production reviewed grace stays eight.
                super().__init__(grace=0.3)

            def close(self):
                closing.set()
                return super().close()

        def read(path, *args, **kwargs):
            return 'ID=debian\nVERSION_ID="13"\n' if str(path) == '/etc/os-release' else original_read(path, *args, **kwargs)

        def spawn(_command, **kwargs):
            resistant = ('import pathlib,signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); '
                         f'pathlib.Path({str(ready)!r}).write_text("ready"); time.sleep(30)')
            parent = ('import subprocess,sys,time; '
                      f'subprocess.Popen([sys.executable,"-c",{resistant!r}],start_new_session=True); time.sleep(30)')
            child = original_spawn([sys.executable, '-c', parent], **kwargs)
            children.append(child)
            return child

        def remove(path, *args, **kwargs):
            if pathlib.Path(path).name.startswith('lc1-'):
                # Critical ordering assertion: no rmtree while any owned child
                # (including an adopted detached TERM-resistant one) remains.
                self.assertEqual(test_collect.supervision.Supervisor.descendants(), {})
                deleted.set()
            return original_remove(path, *args, **kwargs)

        def hup_sender():
            deadline = time.monotonic() + 3
            while not ready.exists() and time.monotonic() < deadline:
                time.sleep(0.005)
            if not ready.exists():
                errors.append('fixture-not-ready')
                return
            os.kill(os.getpid(), signal.SIGHUP)
            if not closing.wait(timeout=1):
                errors.append('teardown-not-entered')
                return
            for _ in range(5):
                if deleted.is_set():
                    errors.append('teardown-ended-before-repeat')
                    return
                if signal.getsignal(signal.SIGHUP) != signal.SIG_IGN:
                    # Fail safely if the regression returns: do not send a
                    # repeat that could abort cleanup and leak this fixture.
                    errors.append('repeat-hup-not-masked')
                    return
                os.kill(os.getpid(), signal.SIGHUP)
                repeats.append(True)
                time.sleep(0.02)

        def loader(_file, name):
            return collector if name == 'linuxcast_s001_collector' else types.SimpleNamespace(Supervisor=ObservableSupervisor)

        sender = threading.Thread(target=hup_sender)
        with patch.object(guest_phase, 'HOME', self.root), patch.object(guest_phase, 'PAYLOAD', payload, create=True), \
             patch.object(guest_phase.os, 'getuid', return_value=1000), patch.object(guest_phase.os, 'geteuid', return_value=1000), \
             patch.object(guest_phase.os, 'uname', return_value=types.SimpleNamespace(release='6.12.113+deb13-amd64')), \
             patch.object(pathlib.Path, 'read_text', read), patch.object(guest_phase, 'snapshot', return_value=self.snapshot), \
             patch.object(guest_phase, 'verify_tools', return_value=True), patch.object(guest_phase, 'load', loader), \
             patch.object(guest_phase, 'extract'), patch.object(guest_phase, 'preparation_environment', return_value={}), \
             patch.object(guest_phase.subprocess, 'Popen', spawn), patch.object(guest_phase.shutil, 'rmtree', remove):
            sender.start()
            value = guest_phase.execute()
            sender.join(timeout=1)
        self.assertFalse(sender.is_alive())
        self.assertFalse(errors)
        self.assertEqual(len(repeats), 5)
        self.assertEqual(len(children), 1)
        children[0].poll()
        self.assertTrue(deleted.is_set())
        self.assertTrue(value['ownedGuestCapsuleRemoved'])
        self.assertEqual(value['phase'], 'preparation-failed')
        self.assertEqual(test_collect.supervision.Supervisor.descendants(), {})
        self.assertFalse(list(self.root.glob('lc1-*')))


if __name__ == '__main__':
    unittest.main(verbosity=2)
