"""Hermetic host-only preparation; fixture codecs are NOT composition proof.

Only private ordinary files/children and synthetic public snapshots. No actual
owner CLI, collector source execution, lab, guest or package/config observation.
"""
import ast
import base64
import copy
import errno
import inspect
import io
import json
import os
from pathlib import Path
import shlex
import signal
import stat
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import zlib

import lab_install_metadata_owner as host
import lab_owner as owner
import lab_build_facts as custody
import test_lab_owner as native

CAPTURE = '12345678-1234-4234-8234-123456789abc'
OTHER = '12345678-1234-4234-8234-123456789abd'
PROBE = b'print("synthetic fixture only")\n'
FAILURES = ('none', 'custody', 'package-lock', 'deadline', 'bounds')
# This deliberately small private codec establishes host behavior only. It
# neither implements nor substitutes for the independent real collector.
CODEC_SOURCE = '''import base64
import json
import zlib
FAILURES = ('custody', 'package-lock', 'deadline', 'bounds')
def source_bytes():
    return b'print("synthetic fixture only")\\n'
def validate_snapshot(value):
    if type(value) is not dict or value.get('identity') != {'fixture': True}:
        raise ValueError('fixture schema')
    return value
def decode_packet(raw, code):
    packet = json.loads(raw)
    if packet['status'] == 'unavailable':
        return packet, None, None
    expanded = zlib.decompress(base64.b64decode(packet['data']))
    return packet, json.loads(expanded), expanded
'''.encode()


def codec():
    # Private injection only. Production has no caller factory or alternate path.
    return host._Collector(Path('/synthetic-adjacent/install_metadata.py'), CODEC_SOURCE)


def snapshot():
    return {'schema': 'f102-install-metadata-v1', 'scope': 'first-order-routing-controls-only-not-install-admission',
            'identity': {'fixture': True}, 'os': {'fixture': True},
            'packageState': {'packageCount': 2}, 'files': [{'fixture': 'public-file'}],
            'directories': [{'fixture': 'public-directory'}], 'handlers': [],
            'targetSha256': host.EXPANDED_TARGET_SHA256}


def packet(value=None, expanded=None, failure=None):
    if failure:
        return {'schema': 'f102-install-metadata-packet-v1', 'status': 'unavailable', 'firstFailure': failure,
                'encoding': 'zlib-base64', 'expandedBytes': 0, 'sha256': None, 'data': None}
    raw = owner.encoded(snapshot() if value is None else value) if expanded is None else expanded
    return {'schema': 'f102-install-metadata-packet-v1', 'status': 'observed', 'firstFailure': 'none',
            'encoding': 'zlib-base64', 'expandedBytes': len(raw), 'sha256': owner.digest(raw),
            'data': base64.b64encode(zlib.compress(raw)).decode('ascii')}


def permit(root):
    info = root.stat()
    return dict(schema=1, jobKind='install-metadata-only', captureId=CAPTURE, containerId=owner.CONTAINER,
                imageId=owner.IMAGE, labRoot=str(owner.LAB), labDevice=info.st_dev, labInode=info.st_ino,
                ownerSha256=host.BASE_SHA256, artifactOwnerSha256=host.ARTIFACT_OWNER_SHA256,
                installMetadataOwnerSha256='3' * 64, installMetadataCollectorSha256=owner.digest(CODEC_SOURCE),
                installMetadataTargetsSha256=host.TARGET_SHA256, installMetadataProbeSha256=owner.digest(PROBE),
                guestAccount='linuxcast', guestPrivilege='sudo-noninteractive', installMetadataAuthorityReviewed=True)


def write_permit(root, value=None):
    path = root / host.PERMIT
    if path.exists():
        path.chmod(0o600)
    path.write_bytes(owner.encoded(permit(root) if value is None else value))
    path.chmod(0o400)


class _FixtureSources:
    def __init__(self, root):
        self.expected = {k: permit(root)[k] for k in host.SOURCE_KEYS}
        self.codec = codec()

    def check(self, pin, *, collector=True):
        owner.require(all(pin[k] == v for k, v in self.expected.items()), 'custody')
        return {}, self.codec if collector else None


def prepare(root):
    root.chmod(0o700)
    (root / owner.LOCK).touch(mode=0o664)
    (root / owner.LOCK).chmod(0o664)
    write_permit(root)


def reserved(root):
    lease = host.InstallMetadataReservation(root)
    lease.sources = _FixtureSources(root)
    lease.acquire()
    lease.permit()
    lease.check_sources()
    return lease


class FakeLab(native.FakeLab):
    job_seconds = 30
    validate_job_reply = host.InstallMetadataLab.validate_job_reply

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.reply = owner.encoded(packet())


class Hermetic(unittest.TestCase):
    def setUp(self):
        self.external = patch.object(owner.Children, 'run', side_effect=AssertionError('external dispatch forbidden'))
        self.external.start()
        self.addCleanup(self.external.stop)


class Files(Hermetic):
    def setUp(self):
        super().setUp()
        self.temp = tempfile.TemporaryDirectory(prefix='install-metadata-host-fixture-')
        self.root = Path(self.temp.name)
        prepare(self.root)
        self.lease = reserved(self.root)

    def tearDown(self):
        self.lease.close()
        self.temp.cleanup()

    def renew(self):
        self.lease.close()
        self.lease = reserved(self.root)

    def observed(self):
        return owner.transact(self.lease, FakeLab(self.lease))

    def test_exact_seventeen_fields_and_every_source_dependency(self):
        self.assertEqual(len(permit(self.root)), 17)
        for key in host.SOURCE_KEYS:
            for wrong in ('0' * 64, 'A' * 64, None, True):
                self.lease.close()
                write_permit(self.root, dict(permit(self.root), **{key: wrong}))
                self.lease = host.InstallMetadataReservation(self.root)
                self.lease.sources = _FixtureSources(self.root)
                self.lease.acquire()
                with self.subTest(key=key, wrong=wrong), self.assertRaises(owner.Rejected):
                    self.lease.permit()

    def test_every_permit_field_is_closed_and_typed(self):
        bad = {'schema': True, 'jobKind': 'build-facts-only', 'captureId': OTHER.upper(),
               'containerId': 'foreign', 'imageId': 'foreign', 'labRoot': '/tmp', 'labDevice': True,
               'labInode': -1, 'guestAccount': 'root', 'guestPrivilege': 'root',
               'installMetadataAuthorityReviewed': 1}
        for key, wrong in bad.items():
            self.lease.close()
            write_permit(self.root, dict(permit(self.root), **{key: wrong}))
            self.lease = host.InstallMetadataReservation(self.root)
            self.lease.sources = _FixtureSources(self.root)
            self.lease.acquire()
            with self.subTest(key=key), self.assertRaises(owner.Rejected):
                self.lease.permit()
        for value in (dict(permit(self.root), extra=True), {k: v for k, v in permit(self.root).items() if k != 'captureId'}):
            self.lease.close()
            write_permit(self.root, value)
            self.lease = host.InstallMetadataReservation(self.root)
            self.lease.acquire()
            with self.assertRaises(owner.Rejected):
                self.lease.permit()

    def test_old_domains_never_admit_new_permit(self):
        for klass, name, args in ((owner.Reservation, owner.PERMIT, ('1' * 64,)),
                                  (custody.BuildFactsReservation, custody.PERMIT, ('1' * 64, '2' * 64, '3' * 64))):
            self.lease.close()
            path = self.root / name
            path.write_bytes(owner.encoded(permit(self.root)))
            path.chmod(0o400)
            previous = klass(self.root)
            try:
                previous.acquire()
                with self.assertRaises(owner.Rejected):
                    previous.permit(*args)
            finally:
                previous.close()

    def test_permit_nofollow_nonblocking_singlelink_mode_duplicate_bounds(self):
        path = self.root / host.PERMIT
        for kind in ('fifo', 'symlink', 'hardlink', 'mutable', 'duplicate', 'large'):
            self.lease.close()
            path.unlink()
            if kind == 'fifo':
                os.mkfifo(path, 0o400)
            elif kind == 'symlink':
                path.symlink_to(self.root / 'absent')
            else:
                raw = owner.encoded(permit(self.root))
                path.write_bytes(b'x' * 65537 if kind == 'large' else b'{"schema":1,' + raw[1:] if kind == 'duplicate' else raw)
                path.chmod(0o600 if kind == 'mutable' else 0o400)
                if kind == 'hardlink':
                    os.link(path, self.root / 'alias')
            self.lease = host.InstallMetadataReservation(self.root)
            self.lease.acquire()
            with self.subTest(kind=kind), self.assertRaises((owner.Rejected, OSError)):
                self.lease.permit()

    def test_replaced_or_rewritten_permit_refuses(self):
        path = self.root / host.PERMIT
        raw = path.read_bytes()
        path.chmod(0o600)
        path.write_bytes(raw + b' ')
        path.chmod(0o400)
        with self.assertRaises(owner.Rejected):
            self.lease.check()
        path.rename(self.root / 'old-permit')
        write_permit(self.root)
        with self.assertRaises(owner.Rejected):
            self.lease.check()

    def test_success_private_artifact_and_actual_compact_public_relay(self):
        lab = FakeLab(self.lease)
        value = owner.transact(self.lease, lab)
        self.assertEqual(lab.calls, ['inspect', 'start', 'ready', 'dispatch', 'cleanup'])
        self.assertEqual(value['status'], 'completed')
        path = self.root / self.lease.artifact_name()
        self.assertEqual(path.read_bytes(), owner.encoded(snapshot()))
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o400)
        self.assertEqual(path.stat().st_nlink, 1)
        self.assertEqual(value['artifact'], {'device': path.stat().st_dev, 'inode': path.stat().st_ino})
        public = host.public_result(value)
        self.assertEqual(set(public), {'schema', 'jobKind', 'lifecycle', 'installMetadata', 'acceptance'})
        self.assertEqual(public['installMetadata'], dict(status='observed', firstFailure='none', captureId=CAPTURE,
                         bytes=len(path.read_bytes()), sha256=owner.digest(path.read_bytes()),
                         packageCount=2, fileCount=1, directoryCount=1, handlerCount=0))
        self.assertLessEqual(len(owner.encoded(value)), 4096)
        self.assertLessEqual(len(owner.encoded(public)), 4096)
        for private in ('device', 'inode', 'public-file', 'public-directory', str(self.root), 'originalStatusSha256'):
            self.assertNotIn(private, owner.encoded(public).decode())
        self.assertFalse((self.root / owner.MARKER).exists())

    def test_fresh_artifact_collision_refuses_before_marker_start(self):
        path = self.root / self.lease.artifact_name()
        for kind in ('regular', 'fifo', 'symlink', 'directory'):
            self.renew()
            if kind == 'fifo':
                os.mkfifo(path)
            elif kind == 'symlink':
                path.symlink_to('missing')
            elif kind == 'directory':
                path.mkdir()
            else:
                path.write_bytes(b'partial')
            lab = FakeLab(self.lease)
            value = owner.transact(self.lease, lab)
            self.assertEqual(value['firstFailure'], 'custody')
            self.assertEqual(lab.calls, ['inspect'])
            self.assertFalse(value['mayHaveStarted'])
            self.assertFalse((self.root / owner.MARKER).exists())
            path.rmdir() if kind == 'directory' else path.unlink()

    def test_valid_recovery_first_even_artifact_exists_and_codec_absent(self):
        self.lease.create_marker()
        self.lease.state.update(mayHaveStarted=True, mayHaveDispatched=True)
        self.lease.save()
        (self.root / self.lease.artifact_name()).write_bytes(b'partial')
        self.renew()
        self.lease.codec = None
        self.lease.check_sources = Mock(side_effect=FileNotFoundError('absent fixture codec'))
        lab = FakeLab(self.lease)
        value = owner.transact(self.lease, lab)
        self.assertEqual(value['status'], 'recovered')
        self.assertEqual(lab.calls, ['recover', 'cleanup'])
        self.lease.check_sources.assert_not_called()
        self.assertEqual((self.root / self.lease.artifact_name()).read_bytes(), b'partial')

    def test_foreign_marker_and_capture_permit_binding_refuse(self):
        self.lease.create_marker()
        self.lease.close()
        write_permit(self.root, dict(permit(self.root), captureId=OTHER))
        self.lease = reserved(self.root)
        lab = FakeLab(self.lease)
        value = owner.transact(self.lease, lab)
        self.assertEqual(value['firstFailure'], 'foreign')
        self.assertFalse(lab.calls)
        self.assertTrue(value['mayHaveStarted'] and value['mayHaveDispatched'])

    def test_missing_codec_refuses_fresh_marker_and_start(self):
        self.lease.check_sources = Mock(side_effect=FileNotFoundError('missing adjacent collector'))
        lab = FakeLab(self.lease)
        value = owner.transact(self.lease, lab)
        self.assertEqual(lab.calls, ['inspect'])
        self.assertFalse(value['mayHaveStarted'] or value['mayHaveDispatched'])
        self.assertFalse((self.root / owner.MARKER).exists())

    def test_oneflight_and_durable_intent_before_fallible_launch(self):
        lab = FakeLab(self.lease, fail='dispatch')
        value = owner.transact(self.lease, lab)
        self.assertTrue(value['mayHaveStarted'] and value['mayHaveDispatched'])
        self.assertEqual(lab.calls.count('start'), 1)
        self.assertEqual(lab.calls.count('dispatch'), 1)
        again = owner.transact(self.lease, lab)
        self.assertEqual(again['firstFailure'], 'reservation')
        self.assertEqual(lab.calls.count('start'), 1)

    def test_intent_save_failure_never_launches_but_preserves_attempt(self):
        real = self.lease.save
        def save():
            if self.lease.state['mayHaveDispatched']:
                raise OSError('synthetic durable intent failure')
            real()
        with patch.object(self.lease, 'save', save):
            lab = FakeLab(self.lease)
            value = owner.transact(self.lease, lab)
        self.assertTrue(value['mayHaveStarted'] and value['mayHaveDispatched'])
        self.assertNotIn('dispatch', lab.calls)
        self.assertNotEqual(value['status'], 'completed')

    def test_unavailable_has_current_capture_and_no_artifact(self):
        lab = FakeLab(self.lease)
        lab.reply, lab.code = owner.encoded(packet(failure='package-lock')), 3
        value = owner.transact(self.lease, lab)
        self.assertEqual(value['firstFailure'], 'transport')
        self.assertEqual(value['installMetadata']['firstFailure'], 'package-lock')
        self.assertTrue(value['transportResultValid'] and value['reservationClean'])
        self.assertIsNone(value['artifact'])
        self.assertFalse((self.root / self.lease.artifact_name()).exists())
        wrong = copy.deepcopy(value)
        wrong['installMetadata']['captureId'] = OTHER
        with self.assertRaises(owner.Rejected):
            self.lease.validate_reply(wrong)
        host.public_result(value, FAILURES)

    def test_all_relay_crossfields_and_hidden_fields(self):
        value = self.observed()
        mutations = [lambda v: v.update(private='raw'), lambda v: v['artifact'].update(path='private'),
                     lambda v: v['installMetadata'].update(private='raw'),
                     lambda v: v.update(transportResultValid=False), lambda v: v.update(mayHaveDispatched=False),
                     lambda v: v['installMetadata'].update(firstFailure='custody'),
                     lambda v: v['installMetadata'].update(captureId='bad'),
                     lambda v: v.update(artifact=None)]
        for key in ('bytes', *host.COUNTS):
            for bad in (True, -1, None, 2**63):
                mutations.append(lambda v, k=key, n=bad: v['installMetadata'].update({k: n}))
        for mutate in mutations:
            changed = copy.deepcopy(value)
            mutate(changed)
            with self.subTest(value=changed), self.assertRaises(owner.Rejected):
                host.validate_relay(changed, FAILURES)
        for status in ('not-received', 'unavailable', 'unknown'):
            changed = copy.deepcopy(value)
            changed['installMetadata']['status'] = status
            with self.assertRaises(owner.Rejected):
                host.validate_relay(changed, FAILURES)

    def test_unavailable_crossfields_and_bool_integer_rejection(self):
        value = self.lease.result()
        value.update(mayHaveStarted=True, mayHaveDispatched=True, transportResultValid=True)
        value['installMetadata'].update(status='unavailable', firstFailure='custody', captureId=CAPTURE)
        host.validate_relay(value, FAILURES)
        for key, wrong in (('firstFailure', 'none'), ('firstFailure', 'foreign-code'), ('captureId', None),
                           ('bytes', 1), ('sha256', '0' * 64), *((k, 0) for k in host.COUNTS)):
            changed = copy.deepcopy(value)
            changed['installMetadata'][key] = wrong
            with self.subTest(key=key), self.assertRaises(owner.Rejected):
                host.validate_relay(changed, FAILURES)

    def test_caller_independently_reopens_checks_bytes_counts_and_samebyte_replace(self):
        value = self.observed()
        self.renew()
        self.assertEqual(self.lease.validate_reply(copy.deepcopy(value)), value)
        for key, wrong in (('packageCount', 1), ('fileCount', 2), ('directoryCount', 2), ('handlerCount', 1),
                           ('bytes', 1), ('sha256', '0' * 64)):
            self.renew()
            changed = copy.deepcopy(value)
            changed['installMetadata'][key] = wrong
            self.assertFalse(self.lease.validate_reply(changed)['transportResultValid'], key)
        self.lease.close()
        path = self.root / self.lease.artifact_name()
        path.rename(self.root / 'original')
        path.write_bytes(owner.encoded(snapshot()))
        path.chmod(0o400)
        self.lease = reserved(self.root)
        changed = self.lease.validate_reply(copy.deepcopy(value))
        self.assertFalse(changed['transportResultValid'] or changed['reservationClean'])
        self.assertEqual(changed['installMetadata'], host.empty_metadata())
        self.assertEqual(path.read_bytes(), owner.encoded(snapshot()))

    def test_direct_publication_cannot_return_identity_for_lying_write(self):
        real = os.pwrite
        def lie(fd, raw, offset):
            return len(raw) if fd == self.lease.artifactfd else real(fd, raw, offset)
        with patch.object(os, 'pwrite', lie), self.assertRaises(owner.Rejected):
            self.lease.publish(owner.encoded(snapshot()))

    def test_short_writes_complete(self):
        real = os.pwrite
        def short(fd, raw, offset):
            return real(fd, raw[:13] if fd == self.lease.artifactfd else raw, offset)
        with patch.object(os, 'pwrite', short):
            self.assertEqual(self.observed()['status'], 'completed')

    def write_failure(self, mode):
        real = os.pwrite
        def write(fd, raw, offset):
            if fd == self.lease.artifactfd:
                if mode == 'partial':
                    if offset:
                        raise OSError('fixture partial write')
                    return real(fd, raw[:17], offset)
                return len(raw) if mode == 'lie' else 0
            return real(fd, raw, offset)
        with patch.object(os, 'pwrite', write):
            value = self.observed()
        self.assertEqual(value['firstFailure'], 'custody')
        self.assertFalse(value['transportResultValid'] or value['reservationClean'])
        self.assertTrue(value['ownedChildrenAbsent'] and value['containerStoppedVerified'])
        self.assertTrue((self.root / self.lease.artifact_name()).exists())
        self.assertTrue((self.root / owner.MARKER).exists())

    def test_zero_write_refuses_retaining_partial(self):
        self.write_failure('zero')

    def test_lying_write_readback_refuses(self):
        self.write_failure('lie')

    def test_partial_write_error_retains(self):
        self.write_failure('partial')

    def test_read_and_each_fsync_failure_refuse(self):
        for mode in ('read', 'file-fsync', 'root-fsync'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                prepare(root)
                lease = reserved(root)
                read, sync = os.pread, os.fsync
                def pread(fd, length, offset):
                    if fd == lease.artifactfd:
                        raise OSError('fixture artifact read')
                    return read(fd, length, offset)
                def fsync(fd):
                    if fd == (lease.artifactfd if mode == 'file-fsync' else lease.rootfd) and lease.artifactfd is not None:
                        raise OSError('fixture fsync')
                    return sync(fd)
                try:
                    with patch.object(os, 'pread', pread if mode == 'read' else read), patch.object(os, 'fsync', fsync):
                        value = owner.transact(lease, FakeLab(lease))
                    self.assertFalse(value['transportResultValid'] or value['reservationClean'])
                    self.assertEqual(value['firstFailure'], 'custody')
                finally:
                    lease.close()

    def test_ambiguous_writer_close_is_not_retried(self):
        original = custody.open_artifact_writer
        calls = []
        class Ambiguous:
            def __init__(self, wrapped):
                self.wrapped = wrapped
            @property
            def closed(self):
                return self.wrapped.closed
            def fileno(self):
                return self.wrapped.fileno()
            def close(self):
                calls.append(1)
                self.wrapped.close()
                raise OSError('fixture close ambiguity')
        with patch.object(custody, 'open_artifact_writer', lambda *a: Ambiguous(original(*a))):
            value = self.observed()
        self.assertEqual(calls, [1])
        self.assertFalse(value['transportResultValid'] or value['reservationClean'])
        self.assertFalse(self.lease.close())
        self.assertEqual(calls, [1])

    def test_replacement_during_write_preserves_foreign_bytes(self):
        real = os.pwrite
        path = self.root / self.lease.artifact_name()
        swapped = []
        def write(fd, raw, offset):
            n = real(fd, raw, offset)
            if fd == self.lease.artifactfd and not swapped:
                path.rename(self.root / 'original')
                path.write_bytes(b'foreign fixture')
                path.chmod(0o400)
                swapped.append(True)
            return n
        with patch.object(os, 'pwrite', write):
            value = self.observed()
        self.assertFalse(value['transportResultValid'] or value['reservationClean'])
        self.assertEqual(path.read_bytes(), b'foreign fixture')

    def test_race_after_admission_never_adopts_preexisting_artifact(self):
        path = self.root / self.lease.artifact_name()
        class Race(FakeLab):
            def dispatch(inner, budget):
                reply = super().dispatch(budget)
                path.write_bytes(b'foreign')
                return reply
        value = owner.transact(self.lease, Race(self.lease))
        self.assertFalse(value['transportResultValid'])
        self.assertEqual(path.read_bytes(), b'foreign')

    def test_operation_first_failure_survives_unknown_cleanup_and_final_close(self):
        lab = FakeLab(self.lease, cleanup=('inspect', True, False, False))
        lab.reply = b'private non-JSON canary'
        value = owner.transact(self.lease, lab)
        self.assertEqual((value['firstFailure'], value['cleanupFailure']), ('protocol', 'inspect'))
        self.assertFalse(value['reservationClean'])
        self.lease.invalidate(value)
        self.assertEqual((value['firstFailure'], value['cleanupFailure']), ('protocol', 'inspect'))
        self.assertTrue(value['mayHaveStarted'] and value['mayHaveDispatched'])
        self.assertNotIn('canary', owner.encoded(host.public_result(value)).decode())

    def test_later_guardian_cleanup_or_close_loss_never_keeps_observation(self):
        original = self.observed()
        for cause in ('guardian-lost', 'stop', 'close'):
            self.renew()
            value = copy.deepcopy(original)
            if cause == 'guardian-lost':
                value.update(status='incomplete', reservationClean=False, firstFailure=cause)
            elif cause == 'stop':
                value.update(status='incomplete', reservationClean=False, cleanupFailure=cause)
            else:
                self.lease.invalidate(value)
            value = self.lease.validate_reply(value)
            self.assertFalse(value['transportResultValid'] or value['reservationClean'])
            self.assertEqual(value['installMetadata'], host.empty_metadata())
            self.assertTrue(value['mayHaveStarted'] and value['mayHaveDispatched'])

    def test_atomic_claim_interruption_before_after_commit_retains_true_reason(self):
        method = host.InstallMetadataLab.validate_job_reply
        lines, start = inspect.getsourcelines(method)
        for after in (False, True):
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                prepare(root)
                lease = reserved(root)
                target = start + next(i for i, line in enumerate(lines) if
                                      ('return snapshot is not None' if after else 'result.update(installMetadata=') in line)
                fired = []
                def trace(frame, event, _arg):
                    if frame.f_code is method.__code__ and event == 'line' and frame.f_lineno == target and not fired:
                        fired.append(True)
                        raise owner.Rejected('interrupted')
                    return trace
                try:
                    try:
                        sys.settrace(trace)
                        value = owner.transact(lease, FakeLab(lease))
                    finally:
                        sys.settrace(None)
                    self.assertEqual(fired, [True])
                    self.assertEqual(value['firstFailure'], 'interrupted')
                    self.assertEqual(value['transportResultValid'], after)
                    self.assertEqual(value['installMetadata']['status'], 'observed' if after else 'not-received')
                    self.assertTrue(value['mayHaveStarted'] and value['mayHaveDispatched'])
                finally:
                    lease.close()

    def alarm_at_writer_close(self, after):
        method = host.InstallMetadataReservation.publish
        lines, start = inspect.getsourcelines(method)
        close_index = next(i for i, line in enumerate(lines) if
                           'os.close(fd)' in line or 'self.artifact_writer.close()' in line)
        close_line = start + close_index
        after_line = start + next(i for i in range(close_index + 1, len(lines)) if
                                 'self.artifactfd = None' in lines[i] or
                                 'owner.require(self.artifact_writer.closed' in lines[i])
        writer, canary, fired = [], [], []
        def alarm(*_):
            if after:
                fd = os.open(self.root / 'unrelated-canary', os.O_CREAT | os.O_EXCL | os.O_RDWR, 0o600)
                canary.append((fd, owner.identity(os.fstat(fd))))
                os.write(fd, b'unrelated')
            raise owner.Rejected('deadline')
        def trace(frame, event, _arg):
            if frame.f_code is method.__code__ and event == 'line':
                if frame.f_lineno == close_line:
                    writer.append((self.lease.artifactfd, self.lease.artifact_id))
                if frame.f_lineno == (after_line if after else close_line) and not fired:
                    fired.append(True)
                    signal.raise_signal(signal.SIGALRM)
            return trace
        previous = signal.signal(signal.SIGALRM, alarm)
        try:
            try:
                sys.settrace(trace)
                result = owner.transact(self.lease, FakeLab(self.lease))
            finally:
                sys.settrace(None)
                signal.signal(signal.SIGALRM, previous)
            self.assertEqual(fired, [True])
            self.assertEqual(len(writer), 1)
            self.assertIsNotNone(writer[0][0])
            self.assertEqual(result['firstFailure'], 'deadline')
            self.assertFalse(result['transportResultValid'] or result['reservationClean'])
            self.assertFalse(self.lease.close())
            if after:
                self.assertEqual(canary[0][0], writer[0][0])
                try:
                    info = os.fstat(canary[0][0])
                except OSError:
                    self.fail('cleanup closed an unrelated descriptor reusing the writer number')
                self.assertEqual(owner.identity(info), canary[0][1])
                self.assertEqual(os.pread(canary[0][0], 9, 0), b'unrelated')
            else:
                with self.assertRaises(OSError) as caught:
                    os.fstat(writer[0][0])
                self.assertEqual(caught.exception.errno, errno.EBADF)
        finally:
            sys.settrace(None)
            signal.signal(signal.SIGALRM, previous)
            # Exact independent cleanup also runs on historical behavioral reds.
            for fd, identity in writer + canary:
                try:
                    if fd is not None and owner.identity(os.fstat(fd)) == identity:
                        os.close(fd)
                except OSError:
                    pass

    def test_hard_alarm_before_writer_close_retires_the_exact_open_writer(self):
        self.alarm_at_writer_close(False)

    def test_hard_alarm_after_writer_close_preserves_a_reused_unrelated_descriptor(self):
        self.alarm_at_writer_close(True)


    def test_writer_constructor_return_alarm_and_cancel_do_not_leak_unretained_fd(self):
        for sig in (signal.SIGALRM, signal.SIGTERM):
            with self.subTest(signal=sig), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                prepare(root)
                lease = reserved(root)
                captured, fired = [], []
                def interrupted(*_):
                    raise owner.Rejected('deadline' if sig == signal.SIGALRM else 'interrupted')
                def trace(frame, event, arg):
                    if frame.f_code is custody.open_artifact_writer.__code__ and event == 'return' and not fired:
                        captured.append((arg.fileno(), owner.identity(os.fstat(arg.fileno()))))
                        fired.append(True)
                        signal.raise_signal(sig)
                    return trace
                previous = signal.signal(sig, interrupted)
                try:
                    try:
                        sys.settrace(trace)
                        value = owner.transact(lease, FakeLab(lease))
                    finally:
                        sys.settrace(None)
                        signal.signal(sig, previous)
                    self.assertEqual(fired, [True])
                    self.assertEqual(value['firstFailure'], 'deadline' if sig == signal.SIGALRM else 'interrupted')
                    self.assertFalse(value['transportResultValid'] or value['reservationClean'])
                    self.assertFalse(lease.close())
                    with self.assertRaises(OSError) as caught:
                        os.fstat(captured[0][0])
                    self.assertEqual(caught.exception.errno, errno.EBADF)
                finally:
                    sys.settrace(None)
                    signal.signal(sig, previous)
                    lease.close()
                    for fd, identity in captured:
                        try:
                            if owner.identity(os.fstat(fd)) == identity:
                                os.close(fd)
                        except OSError:
                            pass

    def test_late_source_loss_invalidates_received_claim_and_final_close(self):
        value = self.observed()
        self.lease.sources.check = Mock(side_effect=owner.Rejected('custody'))
        value = self.lease.validate_reply(value)
        self.assertFalse(value['transportResultValid'] or value['reservationClean'])
        self.assertEqual(value['installMetadata'], host.empty_metadata())
        self.assertTrue(value['mayHaveStarted'] and value['mayHaveDispatched'])
        self.assertEqual(value['firstFailure'], 'custody')
        self.assertFalse(self.lease.close())

    def reader_signal(self, route, signum):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            prepare(root)
            lease = reserved(root)
            if route == 'caller':
                original = owner.transact(lease, FakeLab(lease))
                lease.close()
                lease = reserved(root)
            real_open = os.open
            captured, fired = [], []
            method = host._reader_opener
            def opened(path, flags, *args, **kwargs):
                fd = real_open(path, flags, *args, **kwargs)
                if path == lease.artifact_name() and not flags & os.O_CREAT:
                    captured.append((fd, owner.identity(os.fstat(fd))))
                return fd
            def interrupted(*_):
                raise owner.Rejected('deadline' if signum == signal.SIGALRM else 'interrupted')
            def trace(frame, event, _arg):
                if frame.f_code is method.__code__ and event == 'return' and captured and not fired:
                    fired.append(True)
                    signal.raise_signal(signum)
                return trace
            previous = signal.signal(signum, interrupted)
            try:
                with patch.object(os, 'open', opened):
                    try:
                        sys.settrace(trace)
                        value = owner.transact(lease, FakeLab(lease)) if route == 'publish' else lease.validate_reply(original)
                    finally:
                        sys.settrace(None)
                        signal.signal(signum, previous)
                self.assertEqual(fired, [True])
                self.assertEqual(len(captured), 1)
                self.assertFalse(value['transportResultValid'] or value['reservationClean'])
                self.assertFalse(lease.close())
                with self.assertRaises(OSError) as caught:
                    os.fstat(captured[0][0])
                self.assertEqual(caught.exception.errno, errno.EBADF)
            finally:
                sys.settrace(None)
                signal.signal(signum, previous)
                lease.close()
                for fd, identity in captured:
                    try:
                        if owner.identity(os.fstat(fd)) == identity:
                            os.close(fd)
                    except OSError:
                        pass

    def test_reader_entry_alarm_and_cancellation_during_publication(self):
        for sig in (signal.SIGALRM, signal.SIGTERM):
            self.reader_signal('publish', sig)

    def test_reader_entry_alarm_and_cancellation_during_caller_check(self):
        for sig in (signal.SIGALRM, signal.SIGTERM):
            self.reader_signal('caller', sig)

    def close_signal(self, signum, after):
        value = self.observed()
        stream = self.lease.artifact_reader
        fd, identity = stream.fileno(), owner.identity(os.fstat(stream.fileno()))
        fired, canary = [], []
        method = host._close_stream
        def interrupted(*_):
            if after:
                number = os.open(self.root / 'unrelated-close-canary', os.O_CREAT | os.O_EXCL | os.O_RDWR, 0o600)
                if number != fd:
                    try:
                        os.fstat(fd)
                    except OSError as error:
                        self.assertEqual(error.errno, errno.EBADF)
                    else:
                        raise AssertionError('fixture target still owned')
                    os.dup2(number, fd)
                    os.close(number)
                    number = fd
                canary.append((number, owner.identity(os.fstat(number))))
                os.write(number, b'unrelated')
            raise owner.Rejected('deadline' if signum == signal.SIGALRM else 'interrupted')
        def trace(frame, event, _arg):
            if frame.f_code is method.__code__ and frame.f_locals.get('stream') is stream and not fired:
                # Entry is masked by the caller below; raising a signal here
                # proves delivery waits until the C owner has closed/retired.
                if (not after and event == 'line' and 'stream.close()' in inspect.getframeinfo(frame).code_context[0]) or (after and event == 'return'):
                    fired.append(True)
                    signal.raise_signal(signum)
            return trace
        previous = signal.signal(signum, interrupted)
        try:
            try:
                sys.settrace(trace)
                clean = self.lease.close()
            finally:
                sys.settrace(None)
                signal.signal(signum, previous)
            self.assertEqual(fired, [True])
            self.assertFalse(clean)
            self.lease.invalidate(value)
            self.assertFalse(value['transportResultValid'] or value['reservationClean'])
            if after:
                self.assertEqual(canary[0][0], fd)
                self.assertEqual(owner.identity(os.fstat(fd)), canary[0][1])
                self.lease.close()
                self.assertEqual(os.pread(fd, 9, 0), b'unrelated')
            else:
                with self.assertRaises(OSError):
                    os.fstat(fd)
        finally:
            sys.settrace(None)
            signal.signal(signum, previous)
            for number, expected in [(fd, identity), *canary]:
                try:
                    if owner.identity(os.fstat(number)) == expected:
                        os.close(number)
                except OSError:
                    pass

    def test_reader_close_alarm_and_cancellation_retire_known_descriptor(self):
        self.close_signal(signal.SIGALRM, False)

    def test_reader_close_alarm_after_retirement_preserves_unrelated_reuse(self):
        self.close_signal(signal.SIGALRM, True)

    def test_reader_close_cancellation_after_retirement_preserves_unrelated_reuse(self):
        self.close_signal(signal.SIGTERM, True)

    def test_reader_close_helper_entry_cancellation_cannot_abandon_known_fd(self):
        self.observed()
        fd = self.lease.artifact_reader.fileno()
        fired = []
        def interrupted(*_):
            raise owner.Rejected('deadline')
        def trace(frame, event, _arg):
            if frame.f_code is host._close_stream.__code__ and event == 'line' and not fired:
                fired.append(True)
                signal.raise_signal(signal.SIGALRM)
            return trace
        previous = signal.signal(signal.SIGALRM, interrupted)
        try:
            try:
                sys.settrace(trace)
                clean = self.lease.close()
            finally:
                sys.settrace(None)
                signal.signal(signal.SIGALRM, previous)
            self.assertEqual(fired, [True])
            self.assertFalse(clean)
            with self.assertRaises(OSError) as caught:
                os.fstat(fd)
            self.assertEqual(caught.exception.errno, errno.EBADF)
        finally:
            sys.settrace(None)
            signal.signal(signal.SIGALRM, previous)

    def test_caller_final_close_failure_invalidates_result(self):
        value = self.observed()
        real = host._close_stream
        def ambiguous(stream):
            real(stream)
            raise OSError('synthetic final close ambiguity')
        with patch.object(host, '_close_stream', ambiguous):
            self.assertFalse(self.lease.close())
        self.lease.invalidate(value)
        self.assertEqual(value['installMetadata'], host.empty_metadata())
        self.assertFalse(value['transportResultValid'] or value['reservationClean'])
        self.assertTrue(value['mayHaveStarted'] and value['mayHaveDispatched'])



class Wire(Hermetic):
    def setUp(self):
        super().setUp()
        self.codec = codec()

    def test_independent_wire_roundtrip_and_domain(self):
        p = packet()
        self.assertEqual(host.decode_packet(owner.encoded(p), 0, self.codec), (p, snapshot(), owner.encoded(snapshot())))
        for failure in FAILURES[1:]:
            p = packet(failure=failure)
            self.assertEqual(host.decode_packet(owner.encoded(p), 3, self.codec), (p, None, None))

    def test_packet_all_crossfields_types_domains_and_limits(self):
        bad = [('schema', 'f102-build-facts-packet-v1'), ('status', 'completed'), ('firstFailure', 'custody'),
               ('encoding', 'base64'), ('expandedBytes', True), ('expandedBytes', 0),
               ('expandedBytes', host.MAX_SNAPSHOT + 1), ('sha256', '0' * 64), ('data', '%%%'), ('private', 'raw')]
        for key, wrong in bad:
            p = dict(packet(), **{key: wrong})
            with self.subTest(key=key, wrong=wrong), self.assertRaises(owner.Rejected):
                host.decode_packet(owner.encoded(p), 0, self.codec)
        for code in (3, True, None, -1):
            with self.assertRaises(owner.Rejected):
                host.decode_packet(owner.encoded(packet()), code, self.codec)
        for raw in (b'x' * 60001, b'{"schema":1,"schema":1}', b'{"x":NaN}', b'private canary'):
            with self.assertRaises(owner.Rejected):
                host.decode_packet(raw, 0, self.codec)
        for change in ({'firstFailure': 'none'}, {'data': ''}, {'expandedBytes': True}, {'sha256': '0' * 64}):
            with self.assertRaises(owner.Rejected):
                host.decode_packet(owner.encoded(dict(packet(failure='custody'), **change)), 3, self.codec)

    def test_truncated_trailing_secondstream_noncanonical_and_expansion_lies(self):
        expanded = owner.encoded(snapshot())
        compressed = zlib.compress(expanded)
        for raw in (compressed[:-1], compressed + b'x', compressed + zlib.compress(b'{}')):
            p = packet()
            p['data'] = base64.b64encode(raw).decode()
            with self.assertRaises(owner.Rejected):
                host.decode_packet(owner.encoded(p), 0, self.codec)
        for raw in (json.dumps(snapshot()).encode(), expanded + b' ', b'{"x":1,"x":1}'):
            with self.assertRaises(owner.Rejected):
                host.decode_packet(owner.encoded(packet(expanded=raw)), 0, self.codec)
        p = packet()
        p['expandedBytes'] -= 1
        with self.assertRaises(owner.Rejected):
            host.decode_packet(owner.encoded(p), 0, self.codec)

    def test_adapter_cannot_lie_about_decoding_or_snapshot(self):
        with patch.object(self.codec, 'decode_packet', return_value=(packet(), None, None)), self.assertRaises(owner.Rejected):
            host.decode_packet(owner.encoded(packet()), 0, self.codec)
        with patch.object(self.codec.module, 'validate_snapshot', return_value={'hidden': 'canary'}), self.assertRaises(owner.Rejected):
            host.decode_packet(owner.encoded(packet()), 0, self.codec)

    def test_host_domain_counts_and_frozen_target_independent_of_fixture_codec(self):
        for key, wrong in (('schema', 'old'), ('scope', 'install-ready'), ('targetSha256', '0' * 64),
                           ('files', []), ('directories', []), ('handlers', [None] * 33)):
            s = snapshot()
            s[key] = wrong
            with self.subTest(key=key), self.assertRaises(owner.Rejected):
                host.decode_packet(owner.encoded(packet(s)), 0, self.codec)
        for wrong in (True, 0, 4097):
            s = snapshot()
            s['packageState']['packageCount'] = wrong
            with self.assertRaises(owner.Rejected):
                host.decode_packet(owner.encoded(packet(s)), 0, self.codec)

    def test_adapter_requires_exact_local_functions_bytes_and_failure_set(self):
        for raw in (CODEC_SOURCE.replace(b'return b\'print', b'return \'print'),
                    CODEC_SOURCE.replace(b"FAILURES = (", b"FAILURES = set((").replace(b"'bounds')", b"'bounds'))"),
                    CODEC_SOURCE + b'FAILURES = ("none", "none")\n',
                    CODEC_SOURCE + b'from json import loads as decode_packet\n',
                    CODEC_SOURCE + b'__file__ = "foreign"\n',
                    CODEC_SOURCE + b'def source_bytes():\n    return b"x" * 60001\n'):
            with self.subTest(raw=raw[-70:]), self.assertRaises((owner.Rejected, SyntaxError)):
                host._Collector(Path('/synthetic/install_metadata.py'), raw)

    def test_fixed_quoted_python_route_readiness_and_unchanged_bounds(self):
        pin = {'guestAccount': 'linuxcast', 'guestPrivilege': 'sudo-noninteractive'}
        argv = host.metadata_argv(pin, PROBE)
        self.assertEqual(argv, owner.fixed_ssh_argv(pin, ('/usr/bin/python3', '-I', '-B', '-c', shlex.quote(PROBE.decode()))))
        self.assertEqual(shlex.split(argv[-1]), [PROBE.decode()])
        self.assertEqual(host.metadata_argv(pin, readiness=True), owner.fixed_ssh_argv(pin, ('/usr/bin/true',)))
        self.assertEqual((owner.START_SECONDS, host.InstallMetadataLab.job_seconds, owner.TOTAL_SECONDS,
                          owner.CLEAN_SECONDS, owner.MAX_BYTES, host.MAX_PACKET, host.MAX_SNAPSHOT),
                         (120, 30, 600, 45, 65536, 60000, 2097152))
        self.assertNotIn(owner.WRAPPER, argv)
        with self.assertRaises(owner.Rejected):
            host.metadata_argv(pin, b'x' * 60001)

    def test_readiness_only_true_repeats_and_dispatch_once(self):
        lease = SimpleNamespace(pin={'guestAccount': 'linuxcast', 'guestPrivilege': 'sudo-noninteractive'},
                                check=Mock(), intent=Mock(), check_sources=Mock(), codec=self.codec)
        lab = host.InstallMetadataLab(lease, {})
        run = Mock(side_effect=[(255, b''), (0, b'')])
        lab.children = SimpleNamespace(run=run)
        with patch.object(owner.time, 'sleep'):
            lab.ready(owner.Budget(1))
        self.assertEqual([c.args[0] for c in run.call_args_list], [host.metadata_argv(lease.pin, readiness=True)] * 2)
        run.side_effect = None
        run.return_value = (3, b'')
        lab.dispatch(owner.Budget(1))
        self.assertTrue(lab.dispatch_attempted)
        lease.intent.assert_called_once_with('mayHaveDispatched')
        lease.check_sources.assert_called_once()
        with self.assertRaises(owner.Rejected):
            lab.dispatch(owner.Budget(1))

    def test_source_recheck_failure_blocks_start_dispatch_without_external_call(self):
        lease = SimpleNamespace(pin={}, check=Mock(), intent=Mock(),
                                check_sources=Mock(side_effect=owner.Rejected('custody')))
        lab = host.InstallMetadataLab(lease, {})
        for call in (lambda: lab.command('start', owner.Budget(1)), lambda: lab.dispatch(owner.Budget(1))):
            with self.assertRaisesRegex(owner.Rejected, '^custody$'):
                call()
        self.assertFalse(lab.start_attempted)
        self.assertTrue(lab.dispatch_attempted)
        lease.intent.assert_called_once_with('mayHaveDispatched')

    def test_closed_cli_no_help_paths_environment_or_duplicate_acknowledgements(self):
        flags = ['--reviewed-install-metadata-owner', '--reviewed-install-metadata-probe']
        host.parse_args(flags)
        host.parse_args(list(reversed(flags)))
        with patch.object(host, 'InstallMetadataReservation', side_effect=AssertionError('lease forbidden')):
            for args in ([], flags[:1], ['--reviewed-install-metadata-o', flags[1]], ['--help'],
                         flags + [flags[0]], *(flags + ['--' + k, 'private'] for k in
                         ('path', 'command', 'account', 'backend', 'timeout', 'captureId', 'env'))):
                stderr = io.StringIO()
                with patch('sys.stderr', stderr), self.assertRaises(SystemExit) as caught:
                    host.main(args)
                self.assertEqual(caught.exception.code, 3)
                self.assertEqual(stderr.getvalue(), '')

    def test_module_import_inert_without_source_or_collector(self):
        tree = ast.parse(Path(host.__file__).read_text())
        scope = {'__name__': 'synthetic_inert_host', '__file__': host.__file__}
        with patch.object(os, 'open', side_effect=AssertionError('open')), \
             patch.object(os, 'stat', side_effect=AssertionError('stat')), \
             patch.object(subprocess, 'Popen', side_effect=AssertionError('process')), \
             patch.object(Path, 'read_bytes', side_effect=AssertionError('source')):
            exec(compile(tree, '<inert-fixture>', 'exec'), scope)
        self.assertEqual(scope['PERMIT'], host.PERMIT)

    def test_full_fixed_adapter_cleans_guest_even_after_artifact_failure(self):
        for fail_artifact in (False, True):
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                prepare(root)
                lease = reserved(root)
                obj, inventory = native.inspect_fixture()
                calls = []
                class Client:
                    check = lambda _: None
                    preserve_uncertain = False
                    def run(self, argv, budget, *, capture_stderr=False):
                        if argv == (*owner.DOCKER, 'inspect', '--type', 'container', owner.CONTAINER):
                            calls.append('inspect')
                            return 0, owner.encoded(obj)
                        if argv == (*owner.DOCKER, 'start', owner.CONTAINER):
                            lease.intent('mayHaveStarted')
                            calls.append('start')
                            obj[0]['State'] = copy.deepcopy(native.RUNNING)
                            return 0, b''
                        if argv == host.metadata_argv(lease.pin, readiness=True):
                            calls.append('true')
                            return 0, b''
                        if argv == host.metadata_argv(lease.pin, PROBE):
                            lease.intent('mayHaveDispatched')
                            calls.append('facts')
                            self_budget = budget.remaining()
                            if not 0 < self_budget <= 30:
                                raise AssertionError('job budget')
                            return 0, owner.encoded(packet())
                        if argv == owner.transport_argv(lease.pin, 'poweroff') and capture_stderr:
                            lease.intent('mayHaveStarted')
                            calls.append('poweroff')
                            obj[0]['State'] = copy.deepcopy(native.STOPPED)
                            return 0, b'', b''
                        raise AssertionError('unreviewed command')
                    def reap(self, budget):
                        return True
                lab = host.InstallMetadataLab(lease, inventory)
                lab.children = Client()
                actual = os.pwrite
                def write(fd, data, offset):
                    if fail_artifact and fd == lease.artifactfd:
                        return 0
                    return actual(fd, data, offset)
                try:
                    with patch.object(lease, 'check_sources'), patch.object(owner.os, 'pwrite', write), \
                         patch.object(owner.NativeLab, 'ready', side_effect=AssertionError('native readiness')), \
                         patch.object(owner.NativeLab, 'dispatch', side_effect=AssertionError('native job')):
                        result = owner.transact(lease, lab)
                    self.assertEqual(calls, ['inspect', 'start', 'true', 'facts', 'inspect', 'inspect', 'poweroff', 'inspect'])
                    self.assertTrue(result['ownedChildrenAbsent'] and result['containerStoppedVerified'])
                    self.assertEqual(result['transportResultValid'], not fail_artifact)
                    self.assertEqual(result['reservationClean'], not fail_artifact)
                    self.assertEqual(result['firstFailure'], 'custody' if fail_artifact else 'none')
                finally:
                    lease.close()



class Sources(Hermetic):
    def setUp(self):
        super().setUp()
        self.temp = tempfile.TemporaryDirectory(prefix='install-metadata-source-fixture-')
        self.root = Path(self.temp.name)
        self.root.chmod(0o700)
        self.original = Path(host.__file__)
        for name in ('lab_owner.py', 'lab_build_facts.py', 'lab_install_metadata_owner.py',
                     'install-metadata-targets.json', 'outer-owner-inventory.json'):
            (self.root / name).write_bytes(self.original.with_name(name).read_bytes())
            (self.root / name).chmod(0o600)
        (self.root / 'install_metadata.py').write_bytes(CODEC_SOURCE)
        (self.root / 'install_metadata.py').chmod(0o600)
        self.pin = permit(self.root)
        self.pin['installMetadataOwnerSha256'] = owner.digest((self.root / self.original.name).read_bytes())
        self.patches = [patch.object(host, '__file__', str(self.root / self.original.name)),
                        patch.object(owner, '__file__', str(self.root / 'lab_owner.py')),
                        patch.object(custody, '__file__', str(self.root / 'lab_build_facts.py')),
                        patch.object(host, '_parent_profile', self.private_profile)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.temp.cleanup()

    def private_profile(self, path):
        # Explicit fixture-only parent trust. Production's full ancestor profile
        # is tested separately and never relaxed for an executable entry point.
        owner.require(path.parent == self.root and not self.root.is_symlink(), 'custody')
        info = self.root.stat()
        owner.require(stat.S_IMODE(info.st_mode) == 0o700 and info.st_uid == os.getuid(), 'custody')
        return (info.st_dev, info.st_ino, info.st_mode, info.st_uid)

    def test_complete_six_hash_closure_and_no_module_cache(self):
        sources = host._Sources()
        inventory, adapter = sources.check(self.pin)
        self.assertEqual(inventory['containerId'], owner.CONTAINER)
        self.assertEqual(adapter.source, PROBE)
        self.assertNotIn('_linuxcast_install_metadata_collector', sys.modules)
        sources.check(self.pin)
        self.assertIs(sources.codec, adapter)

    def test_each_source_changed_after_cache_blocks_recheck(self):
        for name in ('lab_owner.py', 'lab_build_facts.py', 'lab_install_metadata_owner.py', 'install_metadata.py',
                     'install-metadata-targets.json', 'outer-owner-inventory.json'):
            sources = host._Sources()
            sources.check(self.pin)
            path = self.root / name
            raw = path.read_bytes()
            path.write_bytes(raw + b' ')
            try:
                with self.subTest(name=name), self.assertRaises(owner.Rejected):
                    sources.check(self.pin)
            finally:
                path.write_bytes(raw)

    def test_samebyte_source_replacement_is_rejected_even_cached(self):
        sources = host._Sources()
        sources.check(self.pin)
        path = self.root / 'install_metadata.py'
        raw = path.read_bytes()
        path.rename(self.root / 'saved')
        path.write_bytes(raw)
        path.chmod(0o600)
        with self.assertRaises(owner.Rejected):
            sources.check(self.pin)

    def test_artifact_owner_is_explicit_dependency_not_covered_by_base(self):
        for key in host.SOURCE_KEYS:
            sources = host._Sources()
            pin = dict(self.pin, **{key: '0' * 64})
            with self.subTest(key=key), self.assertRaises(owner.Rejected):
                sources.check(pin)

    def test_absent_collector_no_import_fallback_but_recovery_profile_available(self):
        (self.root / 'install_metadata.py').unlink()
        sources = host._Sources()
        inventory, adapter = sources.check(self.pin, collector=False)
        self.assertIsNone(adapter)
        self.assertEqual(inventory['containerId'], owner.CONTAINER)
        with patch.dict(sys.modules, {'install_metadata': SimpleNamespace(source_bytes=lambda: PROBE)}):
            with self.assertRaises(FileNotFoundError):
                sources.check(self.pin)

    def test_wrong_origin_and_incompatible_collector_refuse(self):
        sources = host._Sources()
        with patch.object(owner, '__file__', '/foreign/lab_owner.py'), self.assertRaises(owner.Rejected):
            sources.check(self.pin)
        raw = CODEC_SOURCE + b'decode_packet = None\n'
        (self.root / 'install_metadata.py').write_bytes(raw)
        pin = dict(self.pin, installMetadataCollectorSha256=owner.digest(raw))
        with self.assertRaises(owner.Rejected):
            sources.check(pin)

    def test_fifo_symlink_hardlink_mutable_source_nonblocking_preflight(self):
        path = self.root / 'install_metadata.py'
        real = os.open
        seen = []
        def opened(name, flags, *args, **kwargs):
            if Path(name).name == path.name:
                seen.append(flags)
            return real(name, flags, *args, **kwargs)
        for kind in ('fifo', 'symlink', 'hardlink', 'mutable'):
            path.unlink()
            if kind == 'fifo':
                os.mkfifo(path, 0o400)
            elif kind == 'symlink':
                path.symlink_to(self.root / 'lab_owner.py')
            else:
                path.write_bytes(CODEC_SOURCE)
                path.chmod(0o666 if kind == 'mutable' else 0o600)
                if kind == 'hardlink':
                    os.link(path, self.root / 'alias')
            with patch.object(os, 'open', opened), self.subTest(kind=kind), self.assertRaises((OSError, owner.Rejected)):
                host._Sources().check(self.pin)
        self.assertTrue(seen)
        self.assertTrue(all(flags & os.O_NONBLOCK and flags & os.O_NOFOLLOW for flags in seen))

    def test_source_return_hash_types_and_quoted_utf8_bound(self):
        for suffix in (b'def source_bytes():\n    return b""\n', b'def source_bytes():\n    return "str"\n',
                       b'def source_bytes():\n    return b"\\xff"\n',
                       b'def source_bytes():\n    return b"x" * 60001\n',
                       b'def source_bytes():\n    return b"wrong"\n'):
            raw = CODEC_SOURCE + suffix
            (self.root / 'install_metadata.py').write_bytes(raw)
            pin = dict(self.pin, installMetadataCollectorSha256=owner.digest(raw))
            with self.assertRaises((owner.Rejected, UnicodeError)):
                host._Sources().check(pin)

    def test_source_open_alarm_and_cancellation_retire_owning_reader(self):
        for sig in (signal.SIGALRM, signal.SIGTERM):
            captured, fired = [], []
            def interrupted(*_):
                raise owner.Rejected('deadline' if sig == signal.SIGALRM else 'interrupted')
            def trace(frame, event, arg):
                if frame.f_code is host._reader_opener.__code__ and event == 'return' and not fired:
                    captured.append((arg, owner.identity(os.fstat(arg))))
                    fired.append(True)
                    signal.raise_signal(sig)
                return trace
            previous = signal.signal(sig, interrupted)
            try:
                try:
                    sys.settrace(trace)
                    with self.assertRaises(owner.Rejected):
                        host._source(self.root / 'lab_owner.py', 1024 * 1024)
                finally:
                    sys.settrace(None)
                    signal.signal(sig, previous)
                self.assertEqual(fired, [True])
                with self.assertRaises(OSError) as caught:
                    os.fstat(captured[0][0])
                self.assertEqual(caught.exception.errno, errno.EBADF)
            finally:
                sys.settrace(None)
                signal.signal(sig, previous)
                for fd, identity in captured:
                    try:
                        if owner.identity(os.fstat(fd)) == identity:
                            os.close(fd)
                    except OSError:
                        pass

    def test_full_parent_profile_refuses_writable_or_aliased_ancestor(self):
        original = self.patches[-1]
        original.stop()
        try:
            with self.assertRaises(owner.Rejected):
                host._parent_profile(self.root / 'lab_owner.py')
        finally:
            original.start()


def supervise(mode):
    """Independent ordinary fixture supervisor, never an external lab client."""
    guard = native.FixtureGuard()
    code = None
    with tempfile.TemporaryFile() as output:
        def work():
            with patch.object(owner.Children, 'run', side_effect=AssertionError('external forbidden')):
                with tempfile.TemporaryDirectory(prefix='install-owner-ordinary-') as directory:
                    root = Path(directory)
                    prepare(root)
                    lease = reserved(root)
                    caller_pid = os.getpid()
                    fault = root / 'injected-close'
                    try:
                        def factory(held, check):
                            lab = FakeLab(held, check)
                            # Exercise the caller's lazy independent adapter load;
                            # only this private source seam exists in fixtures.
                            held.codec = None
                            held.check_sources()
                            if mode == 'unavailable':
                                lab.reply, lab.code = owner.encoded(packet(failure='package-lock')), 3
                            if mode == 'partial':
                                actual_write = os.pwrite
                                def write(fd, raw, offset):
                                    return 0 if fd == held.artifactfd else actual_write(fd, raw, offset)
                                os.pwrite = write
                            if mode == 'guardian-close' and os.getpid() != caller_pid:
                                close = host._close_stream
                                def failed(stream):
                                    close(stream)
                                    fault.write_text('injected')
                                    raise OSError('fixture guardian close')
                                host._close_stream = failed
                            return lab
                        lease.codec = None
                        if mode == 'caller-close':
                            real_open, real_close = os.pidfd_open, os.close
                            target = []
                            def opened(pid):
                                fd = real_open(pid)
                                if os.getpid() == caller_pid:
                                    target.append(fd)
                                return fd
                            def closed(fd):
                                real_close(fd)
                                if os.getpid() == caller_pid and target and fd == target[0]:
                                    target.clear()
                                    fault.write_text('injected')
                                    raise OSError('fixture caller pidfd close')
                            with patch.object(os, 'pidfd_open', opened), patch.object(os, 'close', closed):
                                result = owner.run_guarded(lease, factory)
                        else:
                            result = owner.run_guarded(lease, factory)
                        value = {'result': host.public_result(result, FAILURES), 'close': lease.close(),
                                 'closeFault': fault.exists()}
                    finally:
                        lease.close()
                    output.write(owner.encoded(value))
                    output.flush()
        try:
            signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(native.FixtureExpired()))
            signal.setitimer(signal.ITIMER_REAL, 2)
            pid = guard.spawn(work)
            end = time.monotonic() + 2
            while time.monotonic() < end:
                found, status = os.waitpid(pid, os.WNOHANG)
                if found:
                    guard.reaped(pid)
                    code = os.waitstatus_to_exitcode(status)
                    break
                time.sleep(.002)
        finally:
            absent = guard.cleanup()
        if not absent or code != 0:
            raise SystemExit(3)
        output.seek(0)
        value = json.loads(output.read(4097))
        print(json.dumps({'value': value, 'independentAbsence': absent}))


class Ordinary(Hermetic):
    def fixture(self, mode):
        result = subprocess.run([sys.executable, '-B', str(Path(__file__).resolve()), '--ordinary-fixture', mode],
                                stdin=subprocess.DEVNULL, capture_output=True, env=native.FIXTURE_ENV, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertEqual(result.stderr, b'')
        value = json.loads(result.stdout)
        self.assertTrue(value['independentAbsence'])
        return value['value']

    def test_actual_guardian_compact_relay_and_caller_private_reopen(self):
        value = self.fixture('observed')
        self.assertEqual(value['result']['lifecycle']['status'], 'completed')
        self.assertEqual(value['result']['installMetadata']['status'], 'observed')
        self.assertTrue(value['close'])
        self.assertNotIn('artifact', value['result'])

    def test_actual_guardian_unavailable_capture_and_first_failure(self):
        value = self.fixture('unavailable')
        self.assertEqual(value['result']['lifecycle']['firstFailure'], 'transport')
        self.assertEqual(value['result']['installMetadata']['firstFailure'], 'package-lock')
        self.assertTrue(value['close'])

    def test_actual_guardian_partial_publication_still_cleans_lifecycle(self):
        value = self.fixture('partial')
        lifecycle = value['result']['lifecycle']
        self.assertEqual((lifecycle['firstFailure'], lifecycle['cleanupFailure']), ('custody', 'custody'))
        self.assertTrue(lifecycle['mayHaveStarted'] and lifecycle['mayHaveDispatched'])
        self.assertTrue(lifecycle['ownedChildrenAbsent'] and lifecycle['containerStoppedVerified'])
        self.assertFalse(lifecycle['transportResultValid'] or lifecycle['reservationClean'])

    def test_actual_guardian_close_after_relay_invalidates_observation(self):
        value = self.fixture('guardian-close')
        lifecycle = value['result']['lifecycle']
        self.assertTrue(value['closeFault'])
        self.assertEqual(lifecycle['firstFailure'], 'guardian-lost')
        self.assertTrue(lifecycle['mayHaveStarted'] and lifecycle['mayHaveDispatched'] and lifecycle['ownedChildrenAbsent'])
        self.assertFalse(lifecycle['transportResultValid'] or lifecycle['reservationClean'])
        self.assertEqual(value['result']['installMetadata'], host.empty_metadata())

    def test_actual_caller_final_pidfd_close_invalidates_received_claim(self):
        value = self.fixture('caller-close')
        lifecycle = value['result']['lifecycle']
        self.assertTrue(value['closeFault'])
        self.assertEqual((lifecycle['firstFailure'], lifecycle['cleanupFailure']), ('cleanup', 'custody'))
        self.assertTrue(lifecycle['mayHaveStarted'] and lifecycle['mayHaveDispatched'] and lifecycle['ownedChildrenAbsent'])
        self.assertFalse(lifecycle['transportResultValid'] or lifecycle['reservationClean'])
        self.assertEqual(value['result']['installMetadata'], host.empty_metadata())


class MutationControls(Hermetic):
    def test_actual_private_source_mutants_fail_intended_behavior_zero_errors(self):
        original = Path(host.__file__)
        raw = original.read_text()
        controls = (
            ('trailing-stream', 'and not decoder.unused_data', 'and True', Wire,
             'test_truncated_trailing_secondstream_noncanonical_and_expansion_lies'),
            ('capture-binding', "metadata['captureId'] == self.pin['captureId']", 'True', Files,
             'test_unavailable_has_current_capture_and_no_artifact'),
            ('artifact-readback', 'self.check_artifact()', 'None', Files,
             'test_direct_publication_cannot_return_identity_for_lying_write'),
            ('source-identity', 'self.bindings[k] == v', 'True', Sources,
             'test_samebyte_source_replacement_is_rejected_even_cached'),
        )
        for name, before, after, klass, test in controls:
            with self.subTest(name=name), tempfile.TemporaryDirectory(prefix='install-owner-mutant-') as directory:
                root = Path(directory)
                for dependency in ('lab_owner.py', 'lab_build_facts.py', 'install-metadata-targets.json', 'outer-owner-inventory.json'):
                    (root / dependency).write_bytes(original.with_name(dependency).read_bytes())
                source = raw.replace(before, after)
                self.assertNotEqual(source, raw)
                path = root / original.name
                path.write_text(source)
                module = SimpleNamespace(__name__='private_mutant', __file__=str(path))
                scope = module.__dict__
                exec(compile(path.read_bytes(), str(path), 'exec'), scope)
                suite = unittest.TestSuite([klass(test)])
                result = unittest.TestResult()
                with patch.dict(globals(), host=module):
                    suite.run(result)
                self.assertEqual(result.testsRun, 1)
                self.assertEqual(result.errors, [], result.errors)
                self.assertEqual(result.skipped, [])
                self.assertEqual(len(result.failures), 1, name)


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--ordinary-fixture':
        supervise(sys.argv[2])
    else:
        unittest.main()
