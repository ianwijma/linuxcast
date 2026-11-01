"""Offline only: injected Docker/SSH replies, private files, ordinary Python.

No real owner CLI, daemon/socket, lab root/key, namespace, guest or native action.
Lifetime/process fixtures execute in disposable dedicated Python subprocesses.
"""
import copy
import contextlib
import ctypes
import importlib
import io
import json
import os
from pathlib import Path
import signal
import resource
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import lab_owner as owner

FIXTURE_ENV = {'PATH': '/usr/bin:/bin', 'HOME': '/nonexistent', 'LANG': 'C', 'LC_ALL': 'C'}


def permit(root):
    info = root.stat()
    return {'schema': 1, 'containerId': owner.CONTAINER, 'imageId': owner.IMAGE,
            'labRoot': str(owner.LAB), 'labDevice': info.st_dev, 'labInode': info.st_ino,
            'ownerSha256': '1' * 64, 'sourceTree': owner.TREE, 'archiveSha256': owner.ARCHIVE,
            'receiptSha256': '2' * 64, 'nodeSha256': '3' * 64, 'guestWrapperSha256': '4' * 64,
            'guestAccount': 'synthetic', 'guestPrivilege': 'sudo-noninteractive',
            'guestPrerequisitesReviewed': True}


def write_permit(root, value=None):
    path = root / owner.PERMIT
    if path.exists():
        path.chmod(0o600)
    path.write_bytes(owner.encoded(permit(root) if value is None else value))
    path.chmod(0o400)


def prepare(root):
    root.chmod(0o700)
    (root / owner.LOCK).touch(mode=0o664)
    (root / owner.LOCK).chmod(0o664)
    write_permit(root)


def reserved(root):
    lease = owner.Reservation(root)
    lease.acquire()
    lease.permit('1' * 64)
    return lease


def wrapper(success=True):
    return {'schema': 'f102-lab-wrapper-v1', 'firstFailure': 'none' if success else 'controller',
            'failedStep': 'none' if success else 'report', 'cleanup': True,
            'controllerMayHaveRun': True,
            'controllerStatus': 'observed-private-sequence' if success else 'incomplete',
            'controllerFirstFailure': 'none' if success else 'native',
            'controllerFailedStep': 'none' if success else 'search', 'controllerCleanup': True,
            'outerLabCleanup': 'outstanding', 'acceptance': 'pending'}


def guest_permit(pin):
    return {'schema': 1, 'machineIdSha256': 'a' * 64, 'productUuidSha256': 'b' * 64,
            'sourceTree': pin['sourceTree'], 'archiveSha256': pin['archiveSha256'],
            'receiptSha256': pin['receiptSha256'], 'nodeSha256': pin['nodeSha256'],
            'wrapperSha256': pin['guestWrapperSha256']}


STOPPED = {'Running': False, 'Status': 'exited', 'Pid': 0, 'ExitCode': 0,
           'Paused': False, 'Restarting': False, 'Dead': False, 'OOMKilled': False}
RUNNING = dict(STOPPED, Running=True, Status='running', Pid=123)


class FakeChildren:
    def __init__(self):
        self.check = lambda: None
        self.preserve_uncertain = False


class FakeLab:
    job_seconds = owner.JOB_SECONDS

    def validate_job_reply(self, raw, code, result):
        return owner.validate_transport(raw, code)

    def __init__(self, lease, check=lambda: None, fail=None, cleanup=('none', True, True, True)):
        self.lease, self.check = lease, check
        self.fail, self.cleanup_value = fail, cleanup
        self.children = FakeChildren()
        self.calls = []
        self.reply, self.code = owner.encoded(wrapper()), 0
        self.state = copy.deepcopy(STOPPED)

    def operation(self, name):
        self.calls.append(name)
        self.check()
        if self.fail == name:
            raise owner.Rejected('child')
        if self.fail == name + '-interrupt':
            raise KeyboardInterrupt('private /canary')

    def inspect(self, _budget):
        self.operation('inspect')
        return self.state

    def command(self, op, _budget):
        self.operation(op)

    def ready(self, _budget):
        self.operation('ready')

    def dispatch(self, _budget):
        self.operation('dispatch')
        return self.code, self.reply

    def recover_children(self):
        self.operation('recover')
        if self.lease.state['childrenUncertain']:
            self.cleanup_value = ('reap', False, True, True)

    def cleanup(self, _budget):
        self.calls.append('cleanup')
        if self.fail == 'cleanup':
            raise OSError('private cleanup /canary')
        return self.cleanup_value


class Files(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='outer-owner-offline-')
        self.root = Path(self.temp.name)
        prepare(self.root)
        self.lease = reserved(self.root)

    def tearDown(self):
        self.lease.close()
        self.temp.cleanup()

    def renew(self):
        self.lease.close()
        self.lease = reserved(self.root)

    def test_existing_lock_mode_is_unchanged_and_contended(self):
        before = (self.root / owner.LOCK).stat()
        other = owner.Reservation(self.root)
        try:
            with self.assertRaisesRegex(owner.Rejected, 'reservation'):
                other.acquire()
        finally:
            other.close()
        after = (self.root / owner.LOCK).stat()
        self.assertEqual((before.st_ino, before.st_mode), (after.st_ino, after.st_mode))

    def test_missing_lock_is_never_created(self):
        self.lease.close()
        (self.root / owner.LOCK).unlink()
        with self.assertRaises(FileNotFoundError):
            self.lease.acquire()
        self.assertFalse((self.root / owner.LOCK).exists())

    def test_lock_replacement_is_preserved(self):
        path = self.root / owner.LOCK
        path.rename(self.root / 'saved-lock')
        path.write_bytes(b'foreign')
        with self.assertRaisesRegex(owner.Rejected, 'custody'):
            self.lease.check()
        self.assertEqual(path.read_bytes(), b'foreign')

    def test_root_replacement_is_preserved(self):
        old = self.root.with_name(self.root.name + '-saved')
        self.root.rename(old)
        self.root.mkdir(mode=0o700)
        try:
            with self.assertRaisesRegex(owner.Rejected, 'custody'):
                self.lease.check()
            self.assertEqual(list(self.root.iterdir()), [])
        finally:
            self.root.rmdir()
            old.rename(self.root)

    def test_root_must_be_exact_private_directory(self):
        self.lease.close()
        self.root.chmod(0o750)
        with self.assertRaisesRegex(owner.Rejected, 'custody'):
            self.lease.acquire()

    def test_permit_replacement_and_in_place_mutation_rejected(self):
        path = self.root / owner.PERMIT
        raw = path.read_bytes()
        path.chmod(0o600)
        path.write_bytes(raw + b' ')
        path.chmod(0o400)
        with self.assertRaisesRegex(owner.Rejected, 'custody'):
            self.lease.check()
        path.rename(self.root / 'old-permit')
        path.write_bytes(raw)
        path.chmod(0o400)
        with self.assertRaisesRegex(owner.Rejected, 'custody'):
            self.lease.check()

    def test_strict_permit_schema_identity_account_and_bounds(self):
        bad = [dict(permit(self.root), extra=True), dict(permit(self.root), schema=True),
               dict(permit(self.root), ownerSha256='0' * 64), dict(permit(self.root), sourceTree='0' * 40),
               dict(permit(self.root), labInode=0), dict(permit(self.root), labRoot='/tmp'),
               dict(permit(self.root), guestAccount='-oProxyCommand=private'),
               dict(permit(self.root), guestAccount='$(canary)'), dict(permit(self.root), guestPrivilege='shell'),
               dict(permit(self.root), guestPrivilege='root'),
               dict(permit(self.root), guestPrerequisitesReviewed=False),
               dict(permit(self.root), receiptSha256='missing')]
        for value in bad:
            with self.subTest(value=value):
                self.lease.close()
                write_permit(self.root, value)
                self.lease = owner.Reservation(self.root)
                self.lease.acquire()
                with self.assertRaises(owner.Rejected):
                    self.lease.permit('1' * 64)

    def test_permit_duplicate_symlink_hardlink_mutability_and_size(self):
        for kind in ('duplicate', 'symlink', 'hardlink', 'mutable', 'large'):
            with self.subTest(kind=kind):
                self.lease.close()
                path = self.root / owner.PERMIT
                path.unlink()
                if kind == 'symlink':
                    path.symlink_to('absent')
                else:
                    path.write_bytes(b'{"schema":1,"schema":1}' if kind == 'duplicate' else
                                     b'x' * (owner.MAX_BYTES + 1) if kind == 'large' else owner.encoded(permit(self.root)))
                    path.chmod(0o600 if kind == 'mutable' else 0o400)
                    if kind == 'hardlink':
                        os.link(path, self.root / 'alias')
                self.lease = owner.Reservation(self.root)
                self.lease.acquire()
                with self.assertRaises((owner.Rejected, OSError)):
                    self.lease.permit('1' * 64)

    def test_marker_is_private_durable_and_identity_bound(self):
        self.lease.create_marker()
        before = (self.root / owner.MARKER).stat()
        self.assertEqual(before.st_mode & 0o777, 0o600)
        raw = (self.root / owner.MARKER).read_bytes()
        self.lease.close()
        self.lease = reserved(self.root)
        self.assertTrue(self.lease.load_marker())
        self.assertEqual(owner.encoded(self.lease.state), raw)
        self.lease.remove_marker()
        self.assertFalse((self.root / owner.MARKER).exists())

    def test_marker_same_uid_replacement_is_preserved(self):
        self.lease.create_marker()
        path = self.root / owner.MARKER
        path.rename(self.root / 'interrupted-original')
        path.write_bytes(b'foreign canary')
        path.chmod(0o600)
        for method in (self.lease.save, self.lease.remove_marker):
            with self.assertRaisesRegex(owner.Rejected, 'custody'):
                method()
        self.assertEqual(path.read_bytes(), b'foreign canary')

    def test_marker_in_place_rewrite_is_rejected_without_overwriting(self):
        self.lease.create_marker()
        path = self.root / owner.MARKER
        path.write_bytes(b'foreign in-place canary')
        with self.assertRaisesRegex(owner.Rejected, 'custody'):
            self.lease.save()
        self.assertEqual(path.read_bytes(), b'foreign in-place canary')

    def test_unknown_and_foreign_marker_never_authorizes_stop(self):
        for kind in ('malformed', 'binding', 'unknown', 'boolean', 'unsafe-child'):
            with self.subTest(kind=kind):
                self.lease.close()
                path = self.root / owner.MARKER
                if path.exists():
                    path.unlink()
                self.lease = reserved(self.root)
                self.lease.create_marker()
                state = copy.deepcopy(self.lease.state)
                self.lease.close()
                if kind == 'binding':
                    state['binding']['containerId'] = 'foreign'
                if kind == 'unknown':
                    state['extra'] = True
                if kind == 'boolean':
                    state['mayHaveStarted'] = 1
                if kind == 'unsafe-child':
                    state['children'] = [{'pid': 1, 'start': 2, 'boot': 'a' * 36}]
                path.write_bytes(b'broken' if kind == 'malformed' else owner.encoded(state))
                self.lease = reserved(self.root)
                lab = FakeLab(self.lease)
                result = owner.transact(self.lease, lab)
                self.assertEqual(lab.calls, [])
                self.assertFalse(result['reservationClean'])
                self.assertTrue(result['mayHaveDispatched'])
                self.assertTrue(path.exists())

    def test_success_requires_stop_child_absence_and_removal(self):
        lab = FakeLab(self.lease)
        result = owner.transact(self.lease, lab)
        self.assertEqual(lab.calls, ['inspect', 'start', 'ready', 'dispatch', 'cleanup'])
        self.assertEqual(result['status'], 'completed')
        self.assertTrue(result['reservationClean'])
        self.assertEqual(result['acceptance'], 'pending')
        self.assertNotIn('nativeRuns', result)

    def test_foreign_running_baseline_refuses_without_marker_or_stop(self):
        lab = FakeLab(self.lease)
        lab.state = RUNNING
        result = owner.transact(self.lease, lab)
        self.assertEqual(result['firstFailure'], 'foreign')
        self.assertEqual(lab.calls, ['inspect'])
        self.assertFalse((self.root / owner.MARKER).exists())

    def test_interrupted_start_dispatch_accounting_and_no_replay(self):
        for step, started, dispatched in [('inspect', False, False), ('start', True, False),
                                         ('ready', True, False), ('dispatch', True, True)]:
            with self.subTest(step=step):
                lab = FakeLab(self.lease, fail=step + '-interrupt')
                result = owner.transact(self.lease, lab)
                self.assertEqual((result['mayHaveStarted'], result['mayHaveDispatched']), (started, dispatched))
                self.assertLessEqual(lab.calls.count('start'), 1)
                self.assertLessEqual(lab.calls.count('dispatch'), 1)
                self.renew()

    def test_before_start_and_dispatch_fsync_failure_is_conservative(self):
        for flag in ('mayHaveStarted', 'mayHaveDispatched'):
            with self.subTest(flag=flag):
                original = self.lease.save
                def save():
                    if self.lease.state[flag]:
                        raise OSError('private fsync canary')
                    original()
                with patch.object(self.lease, 'save', save):
                    lab = FakeLab(self.lease)
                    result = owner.transact(self.lease, lab)
                self.assertTrue(result[flag])
                self.assertNotIn('dispatch' if flag == 'mayHaveDispatched' else 'start', lab.calls)
                # The synthetic cleanup established absence/baseline, so this
                # fixture may remove the marker despite failed intent fsync.
                self.assertTrue(result['reservationClean'])
                self.renew()

    def test_operation_failure_survives_cleanup_failure(self):
        lab = FakeLab(self.lease, fail='dispatch', cleanup=('stop', False, False, False))
        result = owner.transact(self.lease, lab)
        self.assertEqual((result['firstFailure'], result['cleanupFailure']), ('child', 'stop'))
        self.assertTrue((self.root / owner.MARKER).exists())

    def test_poweroff_rejection_retains_original_failure_and_dirty_restart_custody(self):
        lab = FakeLab(self.lease, fail='dispatch', cleanup=('poweroff', True, True, True))
        result = owner.transact(self.lease, lab)
        self.assertEqual((result['firstFailure'], result['cleanupFailure']), ('child', 'poweroff'))
        self.assertFalse(result['reservationClean'])
        self.assertTrue(result['mayHaveDispatched'])
        self.renew()
        recovered = FakeLab(self.lease, cleanup=('poweroff', True, True, True))
        result = owner.transact(self.lease, recovered)
        self.assertEqual((result['firstFailure'], result['cleanupFailure']), ('recovery', 'poweroff'))
        self.assertEqual(recovered.calls, ['recover', 'cleanup'])
        self.assertTrue((self.root / owner.MARKER).exists())
        self.assertNotIn('private', owner.encoded(result).decode())

    def test_operation_failure_survives_cleanup_alarm_setup_failure(self):
        lab = FakeLab(self.lease, fail='dispatch')
        with patch.object(owner, 'cleanup_alarm', side_effect=OSError('private cleanup alarm')):
            result = owner.transact(self.lease, lab)
        self.assertEqual(result['firstFailure'], 'child')
        self.assertEqual(result['cleanupFailure'], 'cleanup')
        self.assertTrue((self.root / owner.MARKER).exists())

    def test_complete_fixed_adapter_with_only_injected_commands(self):
        obj, inv = inspect_fixture()
        lease = self.lease
        calls = []
        class Client:
            check = lambda _: None
            preserve_uncertain = False

            def run(self, argv, budget, *, capture_stderr=False):
                self.check()
                budget.remaining()
                if argv[:len(owner.DOCKER)] != owner.DOCKER:
                    raise AssertionError('not fixed transport')
                if 'inspect' in argv:
                    calls.append('inspect')
                    return 0, owner.encoded(obj)
                if 'start' in argv:
                    calls.append('start')
                    self.assert_intent('mayHaveStarted')
                    obj[0]['State'] = copy.deepcopy(RUNNING)
                    return 0, b''
                if 'stop' in argv:
                    calls.append('stop')
                    obj[0]['State'] = copy.deepcopy(STOPPED)
                    return 0, b''
                if argv == owner.transport_argv(lease.pin, 'permit'):
                    calls.append('ready')
                    return 0, owner.encoded(guest_permit(lease.pin))
                if argv == owner.transport_argv(lease.pin, 'wrapper-hash'):
                    calls.append('wrapper-hash')
                    return 0, (lease.pin['guestWrapperSha256'] + '  ' + owner.WRAPPER + '\n').encode()
                if argv == owner.transport_argv(lease.pin):
                    self.assert_intent('mayHaveDispatched')
                    calls.append('dispatch')
                    return 0, owner.encoded(wrapper())
                if argv == owner.transport_argv(lease.pin, 'poweroff'):
                    self.assert_intent('mayHaveStarted')
                    if not capture_stderr:
                        raise AssertionError('shutdown diagnostics not bounded/classified')
                    calls.append('poweroff')
                    obj[0]['State'] = copy.deepcopy(STOPPED)
                    return 0, b'', b''
                raise AssertionError('unexpected fixed command')

            def assert_intent(self, field):
                if not owner.unique_json((lease.root / owner.MARKER).read_bytes())[field]:
                    raise AssertionError('intent not persisted before effect')

            def reap(self, _budget):
                return True

        lab = owner.NativeLab(lease, inv)
        lab.children = Client()
        result = owner.transact(lease, lab)
        self.assertEqual(result['status'], 'completed')
        self.assertEqual(calls, ['inspect', 'start', 'ready', 'wrapper-hash', 'dispatch',
                                 'inspect', 'inspect', 'poweroff', 'inspect'])
        self.assertFalse((lease.root / owner.MARKER).exists())

    def test_cancellation_between_baseline_and_start_never_dispatches(self):
        count = 0
        def cancel():
            nonlocal count
            count += 1
            if count == 2:
                raise owner.Rejected('interrupted')
        lab = FakeLab(self.lease)
        result = owner.transact(self.lease, lab, cancel)
        self.assertEqual(result['firstFailure'], 'interrupted')
        self.assertFalse(result['mayHaveStarted'])
        self.assertNotIn('start', lab.calls)
        self.assertNotIn('dispatch', lab.calls)

    def test_native_adapter_itself_refuses_a_second_start_or_dispatch(self):
        self.lease.create_marker()
        self.lease.state['mayHaveStarted'] = True
        self.lease.save()
        lab = owner.NativeLab(self.lease, {})
        lab.children = SimpleNamespace(run=lambda *_: (0, b''))
        lab.command('start', owner.Budget(1))
        with self.assertRaisesRegex(owner.Rejected, 'reservation'):
            lab.command('start', owner.Budget(1))
        self.lease.state['mayHaveDispatched'] = True
        self.lease.save()
        lab.dispatch(owner.Budget(1))
        with self.assertRaisesRegex(owner.Rejected, 'reservation'):
            lab.dispatch(owner.Budget(1))

    def test_effects_require_durable_intent_even_at_fixed_adapter_boundary(self):
        lab = owner.NativeLab(self.lease, {})
        lab.children = SimpleNamespace(run=lambda *_: self.fail('effect without durable intent'))
        with self.assertRaisesRegex(owner.Rejected, 'custody'):
            lab.command('start', owner.Budget(1))
        self.lease.create_marker()
        self.lease.state['mayHaveDispatched'] = True  # unsaved memory is no authority
        with self.assertRaisesRegex(owner.Rejected, 'custody'):
            lab.dispatch(owner.Budget(1))

    def test_success_is_blocked_by_each_cleanup_failure_or_unknown(self):
        for clean in [('inspect', True, False, False), ('reap', False, True, True),
                      ('kill', True, False, True), ('stop', True, True, True)]:
            with self.subTest(clean=clean):
                lab = FakeLab(self.lease, cleanup=clean)
                result = owner.transact(self.lease, lab)
                self.assertNotEqual(result['status'], 'completed')
                self.assertFalse(result['reservationClean'])
                self.assertTrue((self.root / owner.MARKER).exists())
                self.lease.remove_marker()
                self.renew()

    def test_remove_or_directory_fsync_failure_blocks_clean_reservation(self):
        for target in ('unlink', 'fsync'):
            with self.subTest(target=target):
                lab = FakeLab(self.lease)
                real_remove = self.lease.remove_marker
                def remove():
                    with patch.object(owner.os, target, side_effect=OSError('private cleanup canary')):
                        real_remove()
                with patch.object(self.lease, 'remove_marker', remove):
                    result = owner.transact(self.lease, lab)
                self.assertFalse(result['reservationClean'])
                self.assertEqual(result['cleanupFailure'], 'cleanup')
                if self.lease.markerfd is not None:
                    os.close(self.lease.markerfd)
                    self.lease.markerfd = None
                path = self.root / owner.MARKER
                if path.exists():
                    path.unlink()
                self.renew()

    def test_recovery_stops_before_any_new_work_and_never_replays(self):
        self.lease.create_marker()
        self.lease.state.update(mayHaveStarted=True, mayHaveDispatched=True)
        self.lease.save()
        os.close(self.lease.markerfd)
        self.lease.markerfd = None
        lab = FakeLab(self.lease)
        result = owner.transact(self.lease, lab)
        self.assertEqual(lab.calls, ['recover', 'cleanup'])
        self.assertEqual(result['status'], 'recovered')
        self.assertTrue(result['mayHaveDispatched'])

    def test_one_attempt_per_reservation_even_after_success(self):
        first = FakeLab(self.lease)
        self.assertEqual(owner.transact(self.lease, first)['status'], 'completed')
        second = FakeLab(self.lease)
        result = owner.transact(self.lease, second)
        self.assertEqual(result['firstFailure'], 'reservation')
        self.assertEqual(second.calls, [])

    def test_unknown_prior_descendants_remain_dirty_across_recovery(self):
        self.lease.create_marker()
        self.lease.state.update(mayHaveStarted=True, childrenUncertain=True)
        self.lease.save()
        for _ in range(2):
            if self.lease.markerfd is not None:
                os.close(self.lease.markerfd)
                self.lease.markerfd = None
            lab = FakeLab(self.lease)
            result = owner.transact(self.lease, lab)
            self.assertFalse(result['ownedChildrenAbsent'])
            self.assertFalse(result['reservationClean'])
            self.assertTrue(self.lease.state['childrenUncertain'])
            self.renew()


def inspect_fixture():
    # Entirely synthetic objects: NEVER obtained from Docker in this lane.
    config = {'User': '1000:1000', 'Entrypoint': ['synthetic-entry'], 'Cmd': ['synthetic-command']}
    host = {'Privileged': False, 'ReadonlyRootfs': True, 'CapDrop': ['ALL'],
            'SecurityOpt': ['no-new-privileges'], 'PortBindings': {}, 'Devices': [], 'DeviceRequests': None,
            'NetworkMode': 'bridge', 'AutoRemove': False, 'Memory': 0, 'MemorySwap': 0,
            'NanoCpus': 0, 'CpuQuota': 0, 'CpuPeriod': 0, 'PidsLimit': None}
    mounts = [{'Type': 'bind', 'Source': str(owner.LAB), 'Destination': '/lab', 'Mode': '',
               'RW': True, 'Propagation': 'rprivate'}]
    obj = {'Id': owner.CONTAINER, 'Name': '/linuxcast-native-lab-v4', 'Image': owner.IMAGE,
           'Config': config, 'HostConfig': host, 'Mounts': mounts, 'State': copy.deepcopy(STOPPED),
           'Path': 'synthetic-entry', 'Args': ['synthetic-command'], 'NetworkSettings': {'Ports': {}}}
    inv = {'configSha256': owner.digest(owner.encoded(config)), 'hostConfigSha256': owner.digest(owner.encoded(host)),
           'mountsSha256': owner.digest(owner.encoded(mounts)), 'configUser': '1000:1000',
           'entrypoint': ['synthetic-entry'], 'command': ['synthetic-command'], 'mounts': mounts}
    return [obj], inv


class Protocols(unittest.TestCase):
    def test_import_is_inert(self):
        with patch('subprocess.Popen') as popen, patch('os.open') as opened, patch('os.fork') as fork:
            importlib.reload(owner)
        popen.assert_not_called()
        opened.assert_not_called()
        fork.assert_not_called()

    def test_cli_is_closed_and_never_echoes_arguments(self):
        for args in ([], ['--reviewed-owner'], ['--reviewed-owner', '--reviewed-wrapper', '--reviewed-controller', '--command', 'private'],
                     ['--reviewed-owner', '--reviewed-wrapper', '--reviewed-controller', '--timeout', '9'],
                     ['--reviewed-o', '--reviewed-wrapper', '--reviewed-controller']):
            with self.subTest(args=args), patch.object(owner, 'Reservation') as lease, patch('sys.stderr', io.StringIO()) as output:
                with self.assertRaises(SystemExit) as rejected:
                    owner.main(args)
                self.assertEqual(rejected.exception.code, 3)
                self.assertNotIn('private', output.getvalue())
                lease.assert_not_called()

    def test_inventory_file_is_pinned_without_lab_access(self):
        raw = Path(owner.__file__).with_name('outer-owner-inventory.json').read_bytes()
        self.assertEqual(owner.digest(raw), owner.INVENTORY_SHA256)
        inv = owner.unique_json(raw)
        self.assertEqual(inv['containerId'], owner.CONTAINER)
        self.assertEqual(inv['imageId'], owner.IMAGE)

    def test_inspect_exact_objects_and_fresh_state(self):
        obj, inv = inspect_fixture()
        self.assertTrue(owner.baseline(owner.validate_inspect(obj, inv)))
        obj[0]['State'] = RUNNING
        self.assertFalse(owner.baseline(owner.validate_inspect(obj, inv)))
        obj[0]['State'] = dict(STOPPED, ExitCode=137)
        self.assertFalse(owner.baseline(owner.validate_inspect(obj, inv)))
        for path, value in [('Id', 'foreign'), ('Image', 'foreign'), ('Name', '/other'),
                            ('Config', {}), ('HostConfig', {}), ('Mounts', []),
                            ('Path', '/bin/sh'), ('Args', []), ('NetworkSettings', {'Ports': {'22/tcp': [{}]}})]:
            bad, _ = inspect_fixture()
            bad[0][path] = value
            with self.subTest(path=path), self.assertRaises(owner.Rejected):
                owner.validate_inspect(bad, inv)

    def test_explicit_security_checks_survive_matching_synthetic_digests(self):
        for key, value in [('Privileged', True), ('ReadonlyRootfs', False), ('CapDrop', []),
                           ('SecurityOpt', []), ('Devices', ['private']), ('DeviceRequests', []),
                           ('PortBindings', {'22': '22'}), ('NetworkMode', 'host'), ('AutoRemove', True),
                           ('Memory', True), ('CpuQuota', -1)]:
            obj, inv = inspect_fixture()
            obj[0]['HostConfig'][key] = value
            inv['hostConfigSha256'] = owner.digest(owner.encoded(obj[0]['HostConfig']))
            with self.subTest(key=key), self.assertRaises(owner.Rejected):
                owner.validate_inspect(obj, inv)

    def test_invalid_state_types_or_unknown_state_fail_closed(self):
        obj, inv = inspect_fixture()
        for key, value in [('Running', 0), ('Pid', False), ('Pid', 2), ('Status', 'created'),
                           ('ExitCode', False), ('OOMKilled', True), ('Paused', True), ('Dead', True)]:
            bad = copy.deepcopy(obj)
            bad[0]['State'][key] = value
            with self.subTest(key=key), self.assertRaises(owner.Rejected):
                owner.validate_inspect(bad, inv)

    def test_fixed_transport_minimal_environment_no_shell_or_key_read(self):
        pin = {'guestAccount': 'synthetic', 'guestPrivilege': 'sudo-noninteractive'}
        job = owner.transport_argv(pin)
        ready = owner.transport_argv(pin, 'permit')
        self.assertEqual(job[:len(owner.DOCKER)], owner.DOCKER)
        self.assertEqual(job[-9:], ('/usr/bin/sudo', '-n', '--', '/usr/bin/python3', '-I', '-B', owner.WRAPPER,
                                   '--reviewed-wrapper', '--reviewed-controller'))
        self.assertEqual(ready[-2:], ('/usr/bin/cat', '/etc/linuxcast-f102-lab/permit.json'))
        self.assertNotIn(owner.WRAPPER, ready)
        self.assertIn('StrictHostKeyChecking=yes', job)
        self.assertIn('IdentityAgent=none', job)
        self.assertIn('ClearAllForwardings=yes', job)
        self.assertEqual(set(owner.ENV), {'PATH', 'HOME', 'LANG', 'LC_ALL'})

    def test_poweroff_and_read_probes_have_only_fixed_root_or_sudo_transports(self):
        remotes = {'poweroff': ('/usr/bin/systemctl', 'poweroff', '--no-block'),
                   'permit': ('/usr/bin/cat', '/etc/linuxcast-f102-lab/permit.json'),
                   'wrapper-hash': ('/usr/bin/sha256sum', owner.WRAPPER)}
        for mode, account in (('root', 'root'), ('sudo-noninteractive', 'synthetic')):
            for probe, remote in remotes.items():
                with self.subTest(mode=mode, probe=probe):
                    argv = owner.transport_argv({'guestPrivilege': mode, 'guestAccount': account}, probe)
                    prefix = ('/usr/bin/sudo', '-n', '--') if mode == 'sudo-noninteractive' else ()
                    self.assertEqual(argv[-len(prefix + remote):], prefix + remote)
                    self.assertEqual(argv[:len(owner.DOCKER)], owner.DOCKER)
                    self.assertIn('IdentityAgent=none', argv)
                    self.assertIn('StrictHostKeyChecking=yes', argv)
                    self.assertIn('ClearAllForwardings=yes', argv)
                    self.assertIn('BatchMode=yes', argv)
                    self.assertEqual('/usr/bin/sudo' in argv, mode == 'sudo-noninteractive')
                    self.assertNotIn('/bin/sh', argv)
        for probe in ('poweroff --force', '../poweroff', '/usr/bin/systemctl', 'reboot', ''):
            with self.subTest(probe=probe), self.assertRaises(owner.Rejected):
                owner.transport_argv({'guestPrivilege': 'root', 'guestAccount': 'root'}, probe)

    def test_guest_readiness_requires_the_independently_retained_source_pins(self):
        with tempfile.TemporaryDirectory() as directory:
            pin = permit(Path(directory))
        raw = owner.encoded(guest_permit(pin))
        owner.validate_guest_permit(raw, pin)
        for key in ('sourceTree', 'archiveSha256', 'receiptSha256', 'nodeSha256', 'wrapperSha256'):
            value = guest_permit(pin)
            value[key] = '0' * (40 if key == 'sourceTree' else 64)
            with self.subTest(key=key), self.assertRaises(owner.Rejected):
                owner.validate_guest_permit(owner.encoded(value), pin)
        for value in (dict(guest_permit(pin), private='canary'), dict(guest_permit(pin), schema=True)):
            with self.assertRaises(owner.Rejected):
                owner.validate_guest_permit(owner.encoded(value), pin)

    def test_wrapper_reply_is_strict_bounded_redacted_and_no_native_count(self):
        self.assertTrue(owner.validate_transport(owner.encoded(wrapper()), 0))
        self.assertFalse(owner.validate_transport(owner.encoded(wrapper(False)), 3))
        for raw, code in [(b'x' * 4097, 0), (b'{"schema":1,"schema":2}', 0),
                          (owner.encoded(dict(wrapper(), private='canary')), 0),
                          (owner.encoded(wrapper()), 3), (owner.encoded(dict(wrapper(), cleanup=False)), 0),
                          (owner.encoded(dict(wrapper(), controllerMayHaveRun=False)), 0)]:
            with self.subTest(code=code), self.assertRaises(owner.Rejected):
                owner.validate_transport(raw, code)

    def test_result_rejects_unknown_text_types_and_false_success(self):
        for change in ({'private': 'canary'}, {'status': 'completed'}, {'mayHaveDispatched': True},
                       {'containerStoppedVerified': True}, {'firstFailure': 'private'},
                       {'ownedChildrenAbsent': 1}, {'reservationClean': True}, {'acceptance': 'passed'}):
            with self.subTest(change=change), self.assertRaises(owner.Rejected):
                owner.validate_result(dict(owner.empty_result(), **change))

    def test_deadlines_do_not_extend_parent(self):
        with patch.object(owner.time, 'monotonic', return_value=10):
            parent = owner.Budget(1)
            child = owner.Budget(120, parent)
            self.assertEqual(child.end, 11)
        with patch.object(owner.time, 'monotonic', return_value=12):
            with self.assertRaisesRegex(owner.Rejected, 'deadline'):
                child.remaining()

    def test_spawn_critical_section_does_not_block_hard_alarm(self):
        before = signal.pthread_sigmask(signal.SIG_BLOCK, set())
        with owner.blocked_signals():
            current = signal.pthread_sigmask(signal.SIG_BLOCK, set())
            self.assertNotIn(signal.SIGALRM, current - before)
            self.assertIn(signal.SIGTERM, current)
        self.assertEqual(signal.pthread_sigmask(signal.SIG_BLOCK, set()), before)

    def test_failed_reap_does_not_replace_original_post_spawn_error(self):
        lease = SimpleNamespace(state={'childrenUncertain': False, 'children': []}, save=lambda: None)
        children = owner.Children(lease)
        child = SimpleNamespace(pid=999999999, stdout=io.BytesIO(), stderr=io.BytesIO())
        with patch.object(owner.subprocess, 'Popen', return_value=child), \
                patch.object(owner.os, 'pidfd_open', return_value=999999998), \
                patch.object(owner, 'process_identity', side_effect=owner.Rejected('output')), \
                patch.object(children, 'reap', side_effect=owner.Rejected('reap')):
            with self.assertRaisesRegex(owner.Rejected, '^output$'):
                children.run(('synthetic-not-executed',), owner.Budget(1))
        self.assertTrue(children.fault)
        self.assertTrue(lease.state['childrenUncertain'])


class Cleanup(unittest.TestCase):
    def setUp(self):
        self.now = 100.0
        clock = patch.object(owner.time, 'monotonic', lambda: self.now)
        sleep = patch.object(owner.time, 'sleep', self.advance)
        clock.start()
        sleep.start()
        self.addCleanup(clock.stop)
        self.addCleanup(sleep.stop)

    def advance(self, seconds):
        self.now += seconds

    def make_lab(self, states, fail=None, absent=True, reply=(0, b'', b''), owned=True):
        lease = SimpleNamespace(state={'mayHaveStarted': True, 'childrenUncertain': False, 'children': []},
                                check=lambda: None, intent=lambda _flag: None,
                                pin={'guestPrerequisitesReviewed': True, 'guestAccount': 'synthetic',
                                     'guestPrivilege': 'sudo-noninteractive'})
        lease.state['mayHaveStarted'] = owned
        lab = owner.NativeLab(lease, {})
        lab.calls = []
        lab.bounds = []
        states = iter(states)
        last = None

        def inspect(budget):
            nonlocal last
            lab.calls.append('inspect')
            lab.bounds.append(('inspect', budget.remaining()))
            value = next(states, last)
            last = value
            if isinstance(value, Exception):
                raise value
            return value

        def command(op, budget):
            lab.calls.append(op)
            lab.bounds.append((op, budget.remaining()))
            if op == fail:
                raise owner.Rejected(op)

        def run(argv, budget, *, capture_stderr=False):
            self.assertEqual(argv, owner.transport_argv(lease.pin, 'poweroff'))
            self.assertTrue(capture_stderr)
            lab.calls.append('poweroff')
            lab.bounds.append(('poweroff', budget.remaining()))
            if fail == 'poweroff':
                raise owner.Rejected('poweroff')
            return reply

        lab.children = SimpleNamespace(reap=lambda _budget: absent, run=run)
        lab.inspect, lab.command = inspect, command
        return lab

    def test_success_requires_fresh_inspection_after_stop(self):
        lab = self.make_lab([RUNNING, RUNNING, STOPPED])
        self.assertEqual(lab.cleanup(owner.Budget(45)), ('none', True, True, True))
        self.assertEqual(lab.calls, ['inspect', 'inspect', 'poweroff', 'inspect'])

    def test_stop_failure_retained_even_if_later_baseline_is_clean(self):
        lab = self.make_lab([RUNNING, RUNNING, STOPPED], fail='stop')
        lab.graceful_stop = lambda _budget: (_ for _ in ()).throw(owner.Rejected('stop'))
        self.assertEqual(lab.cleanup(owner.Budget(45)), ('stop', True, True, True))
        self.assertIn('stop', lab.calls)

    def test_kill_identity_reinspect_and_forced_exit_are_not_success(self):
        lab = self.make_lab([RUNNING, RUNNING, RUNNING, dict(STOPPED, ExitCode=137)])
        lab.graceful_stop = lambda _budget: (_ for _ in ()).throw(owner.Rejected('deadline'))
        self.assertEqual(lab.cleanup(owner.Budget(45)), ('deadline', True, False, True))
        self.assertEqual(lab.calls, ['inspect', 'inspect', 'stop', 'inspect', 'kill', 'inspect'])

    def test_stop_failure_survives_failed_kill_and_inspect(self):
        lab = self.make_lab([RUNNING, RUNNING], fail='kill')
        lab.graceful_stop = lambda _budget: (_ for _ in ()).throw(owner.Rejected('stop'))
        original = lab.command
        def command(op, budget):
            if op == 'stop':
                raise owner.Rejected('stop')
            return original(op, budget)
        lab.command = command
        self.assertEqual(lab.cleanup(owner.Budget(45)), ('stop', True, False, False))

    def test_unknown_identity_never_authorizes_stop_or_kill(self):
        lab = self.make_lab([owner.Rejected('configuration'), owner.Rejected('configuration')])
        self.assertEqual(lab.cleanup(owner.Budget(45)), ('configuration', True, False, False))
        self.assertEqual(lab.calls, ['inspect', 'inspect'])

    def test_child_absence_failure_blocks_even_clean_stop(self):
        lab = self.make_lab([RUNNING, RUNNING, STOPPED], absent=False)
        self.assertEqual(lab.cleanup(owner.Budget(45)), ('reap', False, True, True))

    def test_already_clean_stopped_needs_no_guest_or_docker_effect(self):
        lab = self.make_lab([STOPPED])
        self.assertEqual(lab.cleanup(owner.Budget(45)), ('none', True, True, True))
        self.assertEqual(lab.calls, ['inspect'])

    def test_foreign_running_without_owned_start_never_dispatches_poweroff(self):
        lab = self.make_lab([RUNNING], owned=False)
        self.assertEqual(lab.cleanup(owner.Budget(45)), ('foreign', True, False, False))
        self.assertEqual(lab.calls, ['inspect'])

    def test_poweroff_itself_rechecks_identity_and_skips_concurrent_stop(self):
        lab = self.make_lab([RUNNING, STOPPED])
        self.assertEqual(lab.cleanup(owner.Budget(45)), ('none', True, True, True))
        self.assertEqual(lab.calls, ['inspect', 'inspect'])

    def test_invalid_identity_at_poweroff_probe_never_sends_guest_command(self):
        lab = self.make_lab([RUNNING, owner.Rejected('configuration'), STOPPED])
        self.assertEqual(lab.cleanup(owner.Budget(45)), ('configuration', True, True, True))
        self.assertNotIn('poweroff', lab.calls)
        self.assertNotIn('stop', lab.calls)

    def test_delayed_graceful_stop_waits_without_replaying_any_effect(self):
        lab = self.make_lab([RUNNING, RUNNING, RUNNING, RUNNING, STOPPED])
        self.assertEqual(lab.cleanup(owner.Budget(45)), ('none', True, True, True))
        self.assertEqual(lab.calls.count('poweroff'), 1)
        self.assertNotIn('stop', lab.calls)
        self.assertGreater(self.now, 100)
        self.assertLessEqual(self.now, 111)

    def test_exact_ssh_disconnect_needs_fresh_exit0_not_an_acknowledgement(self):
        for message in owner.SSH_SHUTDOWN_DISCONNECTS:
            with self.subTest(message=message):
                lab = self.make_lab([RUNNING, RUNNING, STOPPED], reply=(255, b'', message))
                self.assertEqual(lab.cleanup(owner.Budget(45)), ('none', True, True, True))
                self.assertNotIn('stop', lab.calls)

    def test_denial_unknown_disconnect_and_extra_output_remain_failures_after_exit0(self):
        for reply in ((1, b'', b'sudo: denied'), (255, b'', b'Permission denied (publickey).\r\n'),
                      (255, b'', b''), (255, b'', b'unknown private canary'),
                      (0, b'private unexpected output', b''), (0, b'', b'private warning'),
                      (255, b'', next(iter(owner.SSH_SHUTDOWN_DISCONNECTS)) + b'denied')):
            with self.subTest(reply=reply):
                lab = self.make_lab([RUNNING, RUNNING, STOPPED], reply=reply)
                self.assertEqual(lab.cleanup(owner.Budget(45)), ('poweroff', True, True, True))
                self.assertEqual(lab.calls.count('poweroff'), 1)

    def test_stuck_guest_reserves_fallback_then_retains_nonzero_kill(self):
        lab = self.make_lab([RUNNING])
        original = lab.inspect
        def inspect(budget):
            if 'kill' in lab.calls:
                lab.calls.append('inspect')
                return dict(STOPPED, ExitCode=137)
            return original(budget)
        lab.inspect = inspect
        self.assertEqual(lab.cleanup(owner.Budget(45)), ('deadline', True, False, True))
        self.assertEqual(lab.calls.count('poweroff'), 1)
        self.assertEqual(lab.calls.count('stop'), 1)
        self.assertEqual(lab.calls.count('kill'), 1)
        self.assertLessEqual(self.now, 111.001)
        self.assertTrue(all(left <= (5 if op == 'poweroff' else 10 if op == 'stop' else 3)
                            for op, left in lab.bounds))

    def test_fallback_exit0_does_not_erase_failed_graceful_phase(self):
        lab = self.make_lab([RUNNING])
        original = lab.inspect
        def inspect(budget):
            return STOPPED if 'stop' in lab.calls else original(budget)
        lab.inspect = inspect
        self.assertEqual(lab.cleanup(owner.Budget(45)), ('deadline', True, True, True))
        self.assertIn('stop', lab.calls)

    def test_failed_kill_still_gets_fresh_absence_inspection_without_erasing_failure(self):
        lab = self.make_lab([RUNNING], fail='kill')
        original = lab.inspect
        def inspect(budget):
            if 'kill' in lab.calls:
                lab.calls.append('inspect')
                return dict(STOPPED, ExitCode=137)
            return original(budget)
        lab.inspect = inspect
        self.assertEqual(lab.cleanup(owner.Budget(45)), ('deadline', True, False, True))
        self.assertEqual(lab.calls[-2:], ['kill', 'inspect'])

    def test_disconnect_and_acknowledgement_without_shutdown_never_succeed(self):
        for reply in ((0, b'', b''), (255, b'', next(iter(owner.SSH_SHUTDOWN_DISCONNECTS)))):
            lab = self.make_lab([RUNNING], reply=reply)
            failure, absent, stopped, terminated = lab.cleanup(owner.Budget(45))
            self.assertEqual(failure, 'deadline')
            self.assertTrue(absent)
            self.assertFalse(stopped or terminated)
            self.assertIn('stop', lab.calls)
            self.assertIn('kill', lab.calls)

    def test_cleanup_does_not_borrow_fallback_reservation_from_shorter_caller_budget(self):
        lab = self.make_lab([RUNNING, RUNNING, dict(STOPPED, ExitCode=143)])
        self.assertEqual(lab.cleanup(owner.Budget(20)), ('deadline', True, False, True))
        self.assertNotIn('poweroff', lab.calls)
        self.assertIn('stop', lab.calls)
        self.assertEqual((owner.CLEAN_SECONDS, owner.TOTAL_SECONDS), (45, 600))

    def test_missing_reviewed_poweroff_authority_fails_before_guest_action(self):
        lab = self.make_lab([RUNNING, STOPPED])
        lab.lease.pin['guestPrerequisitesReviewed'] = False
        self.assertEqual(lab.cleanup(owner.Budget(45)), ('prerequisite', True, True, True))
        self.assertNotIn('poweroff', lab.calls)

    def test_graceful_nonzero_exit_and_prior_reap_failure_are_not_normalized(self):
        for absent, expected in ((True, 'stop'), (False, 'reap')):
            lab = self.make_lab([RUNNING, RUNNING, dict(STOPPED, ExitCode=143)], absent=absent)
            self.assertEqual(lab.cleanup(owner.Budget(45)), (expected, absent, False, True))
            self.assertNotIn('stop', lab.calls)

    def test_poweroff_is_single_attempt_even_after_uncertain_disconnect(self):
        lab = self.make_lab([RUNNING], reply=(255, b'', next(iter(owner.SSH_SHUTDOWN_DISCONNECTS))))
        self.assertIsNone(lab.poweroff(owner.Budget(5)))
        with self.assertRaisesRegex(owner.Rejected, 'reservation'):
            lab.poweroff(owner.Budget(5))
        self.assertEqual(lab.calls.count('poweroff'), 1)

    def test_interrupted_owner_descendant_uncertainty_survives_graceful_container_exit(self):
        lab = self.make_lab([RUNNING, RUNNING, STOPPED])
        lab.lease.state['childrenUncertain'] = True
        lab.recover_children()
        self.assertEqual(lab.cleanup(owner.Budget(45)), ('reap', False, True, True))
        self.assertTrue(lab.children.preserve_uncertain)

    def test_poweroff_requires_owned_durable_marker_before_any_probe(self):
        lab = self.make_lab([RUNNING])
        lab.lease.intent = lambda _: (_ for _ in ()).throw(owner.Rejected('custody'))
        with self.assertRaisesRegex(owner.Rejected, 'custody'):
            lab.poweroff(owner.Budget(5))
        self.assertEqual(lab.calls, [])


class ActualPython(unittest.TestCase):
    def fixture(self, kind):
        # This test helper has no code path to NativeLab, Docker, SSH or CLI.
        command = [sys.executable, '-B', str(Path(__file__).resolve()), '--python-fixture', kind]
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=12, env=FIXTURE_ENV, cwd='/', check=False)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
        value = json.loads(result.stdout)
        self.assertTrue(value.pop('_fixtureGuardAbsent'))
        return value

    def test_independent_guard_reaps_after_false_inner_cleanup_success(self):
        value = self.fixture('guard-broken-return')
        self.assertTrue(value['innerClaim'])
        self.assertGreaterEqual(value['signalled'], 1)
        self.assertFalse(value['timedOut'])
        self.assertTrue(value['parentImplementationBroken'])

    def test_independent_parent_bounds_broken_inner_cleanup_and_lifetime(self):
        value = self.fixture('guard-broken-hang')
        self.assertTrue(value['innerClaim'])
        self.assertTrue(value['timedOut'])
        self.assertGreaterEqual(value['signalled'], 2)
        self.assertTrue(value['parentImplementationBroken'])

    def test_independent_guard_reaps_gated_bookkeeping_failure(self):
        value = self.fixture('guard-bookkeeping')
        self.assertTrue(value['failed'])
        self.assertFalse(value['gateOpened'])

    def test_caller_sigkill_lifetime_eof_guardian_holds_lock_through_cleanup(self):
        value = self.fixture('caller-death')
        self.assertTrue(value['cleanup'])
        self.assertTrue(value['lockHeld'])
        self.assertTrue(value['markerRemoved'])
        self.assertTrue(value['reaped'])

    def test_guardian_death_caller_adopts_and_reaps_then_stops(self):
        value = self.fixture('guardian-death')
        self.assertEqual(value['firstFailure'], 'guardian-lost')
        self.assertTrue(value['mayHaveDispatched'])
        self.assertTrue(value['ownedChildrenAbsent'])
        self.assertTrue(value['reservationClean'])

    def test_exact_child_and_detached_grandchild_are_reaped(self):
        value = self.fixture('descendants')
        self.assertTrue(value['absent'])
        self.assertTrue(value['echild'])

    def test_successful_spawn_then_bookkeeping_failure_is_reaped(self):
        value = self.fixture('bookkeeping')
        self.assertTrue(value['failed'])
        self.assertTrue(value['absent'])

    def test_pidfd_failure_after_spawn_still_reaps_exact_direct_child(self):
        value = self.fixture('pidfd')
        self.assertTrue(value['failed'])
        self.assertTrue(value['absent'])

    def test_output_is_bounded_without_leaving_python_child(self):
        value = self.fixture('output')
        self.assertEqual(value['failure'], 'output')
        self.assertTrue(value['absent'])

    def test_shutdown_diagnostics_keep_combined_output_bound_and_reap(self):
        value = self.fixture('stderr-output')
        self.assertEqual(value['failure'], 'output')
        self.assertTrue(value['absent'])

    def test_readonly_preflight_child_works_before_marker_creation(self):
        value = self.fixture('readonly')
        self.assertEqual(value['code'], 0)
        self.assertEqual(value['output'], 'synthetic')
        self.assertTrue(value['absent'])
        self.assertFalse(value['marker'])

    def test_live_guardian_handles_caller_loss_before_and_after_start(self):
        for phase in ('caller-before-start', 'caller-after-start'):
            with self.subTest(phase=phase):
                value = self.fixture(phase)
                self.assertTrue(value['cleanup'])
                self.assertTrue(value['lockHeld'])
                self.assertTrue(value['markerRemoved'])
                self.assertTrue(value['reaped'])

    def test_caller_handles_guardian_loss_before_and_after_start(self):
        for phase in ('guardian-before-start', 'guardian-after-start'):
            with self.subTest(phase=phase):
                value = self.fixture(phase)
                self.assertEqual(value['firstFailure'], 'guardian-lost')
                self.assertTrue(value['ownedChildrenAbsent'])
                self.assertTrue(value['reservationClean'])

    def test_independent_alarm_interrupts_noncooperative_guardian_job(self):
        value = self.fixture('deadline')
        self.assertEqual(value['firstFailure'], 'deadline')
        self.assertTrue(value['reservationClean'])
        self.assertTrue(value['mayHaveDispatched'])

    def test_caller_hard_bound_kills_noncooperative_guardian_and_reaps(self):
        value = self.fixture('caller-hard')
        self.assertEqual(value['firstFailure'], 'deadline')
        self.assertTrue(value['ownedChildrenAbsent'])
        self.assertTrue(value['reservationClean'])

    def test_failed_guardian_bookkeeping_never_opens_start_gate(self):
        value = self.fixture('guardian-bookkeeping')
        self.assertTrue(value['ownedChildrenAbsent'])
        self.assertFalse(value['reservationClean'])
        self.assertEqual(value['cleanupFailure'], 'recovery')

    def test_original_transport_failure_survives_later_guardian_exit_failure(self):
        value = self.fixture('guardian-after-report')
        self.assertEqual(value['firstFailure'], 'transport')
        self.assertTrue(value['transportResultValid'])
        self.assertFalse(value['reservationClean'])

    def test_fifo_permit_is_rejected_without_a_writer_or_retained_lock(self):
        value = self.fixture('permit-fifo')
        self.assertEqual(value, {'reason': 'custody', 'lockReacquired': True})

    def test_fifo_source_is_rejected_before_reading(self):
        value = self.fixture('source-fifo')
        self.assertEqual(value['reason'], 'custody')

    def test_preflight_has_a_deliverable_independent_deadline(self):
        value = self.fixture('preflight-deadline')
        self.assertEqual(value['reason'], 'deadline')
        self.assertLess(value['elapsed'], .5)

    def test_final_pidfd_close_failure_keeps_successful_dispatch_accounting(self):
        value = self.fixture('guardian-final-close-success')
        self.assertTrue(value['mayHaveStarted'])
        self.assertTrue(value['mayHaveDispatched'])
        self.assertTrue(value['transportResultValid'])
        self.assertTrue(value['ownedChildrenAbsent'])
        self.assertEqual(value['firstFailure'], 'cleanup')
        self.assertEqual(value['cleanupFailure'], 'custody')
        self.assertFalse(value['reservationClean'])

    def test_final_pidfd_close_failure_keeps_the_original_transport_failure(self):
        value = self.fixture('guardian-final-close-transport')
        self.assertTrue(value['mayHaveStarted'])
        self.assertTrue(value['mayHaveDispatched'])
        self.assertTrue(value['transportResultValid'])
        self.assertTrue(value['ownedChildrenAbsent'])
        self.assertEqual(value['firstFailure'], 'transport')
        self.assertEqual(value['cleanupFailure'], 'custody')
        self.assertFalse(value['reservationClean'])

    def test_expired_preflight_budget_cannot_be_reset_before_the_guardian(self):
        with patch.object(owner.os, 'fork') as fork:
            with self.assertRaisesRegex(owner.Rejected, 'deadline'):
                owner.run_guarded(None, None, owner.Budget(.001))
            fork.assert_not_called()


class PythonLab(FakeLab):
    """Ordinary-Python-only lifetime fixture, never uses a native adapter."""
    def __init__(self, lease, check, mode):
        super().__init__(lease, check)
        self.children = owner.Children(lease, check)
        self.mode = mode

    def pause(self):
        (self.lease.root / 'dispatched').write_text(str(os.getpid()))
        if self.mode.startswith('guardian-'):
            os.kill(os.getpid(), signal.SIGKILL)
        while True:
            self.check()
            time.sleep(.01)

    def command(self, op, budget):
        if op == 'start' and self.mode.endswith('before-start'):
            self.pause()
        super().command(op, budget)

    def ready(self, budget):
        if self.mode.endswith('after-start'):
            self.pause()
        super().ready(budget)

    def dispatch(self, budget):
        (self.lease.root / 'dispatched').write_text(str(os.getpid()))
        if self.mode.startswith('guardian-final-close-'):
            success = self.mode.endswith('success')
            return (0 if success else 3), owner.encoded(wrapper(success))
        if self.mode == 'guardian-after-report':
            return 3, owner.encoded(wrapper(False))
        if self.mode == 'caller-hard':
            signal.signal(signal.SIGALRM, signal.SIG_IGN)
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            while True:
                time.sleep(.1)
        if self.mode == 'deadline':
            while True:
                time.sleep(.1)  # deliberately no cooperative lifetime checks
        if self.mode == 'guardian-death':
            # Spawn first so the real caller must adopt/reap an exact ordinary
            # child after abrupt guardian loss.
            original_save = self.lease.save
            def save():
                original_save()
                if self.lease.state['children']:
                    os.kill(os.getpid(), signal.SIGKILL)
            self.lease.save = save
        self.children.run([sys.executable, '-B', '-c', 'import time; time.sleep(8)'], budget)
        raise owner.Rejected('child')

    def cleanup(self, budget):
        held = False
        other = owner.Reservation(self.lease.root)
        try:
            other.acquire()
        except owner.Rejected as error:
            held = str(error) == 'reservation'
        finally:
            other.close()
        absent = self.children.reap(owner.Budget(2, budget))
        (self.lease.root / 'cleaned').write_text(json.dumps({'lockHeld': held, 'cleanup': absent}))
        return ('none' if absent else 'reap'), absent, True, True


def wait_file(path):
    end = time.monotonic() + 4
    while not path.exists():
        if time.monotonic() > end:
            raise RuntimeError('synthetic fixture deadline')
        time.sleep(.01)


def python_fixture(kind):
    owner.subreaper()
    with tempfile.TemporaryDirectory(prefix='outer-owner-python-') as directory:
        root = Path(directory)
        prepare(root)
        if kind in ('permit-fifo', 'source-fifo', 'preflight-deadline'):
            if kind == 'preflight-deadline':
                start = time.monotonic()
                with patch.object(owner, 'TOTAL_SECONDS', .03):
                    try:
                        with owner.operation_deadline():
                            time.sleep(5)
                    except owner.Rejected as error:
                        value = {'reason': str(error), 'elapsed': time.monotonic() - start}
                    else:
                        raise RuntimeError('missing independent deadline')
            else:
                lease = owner.Reservation(root)
                lease.acquire()
                path = root / (owner.PERMIT if kind == 'permit-fifo' else 'synthetic-source')
                if path.exists():
                    path.unlink()
                os.mkfifo(path, 0o400)
                try:
                    try:
                        if kind == 'permit-fifo':
                            lease.permit('1' * 64)
                        else:
                            owner.read_source(path, 100)
                    except owner.Rejected as error:
                        value = {'reason': str(error)}
                    else:
                        raise RuntimeError('nonregular source accepted')
                finally:
                    if not lease.close():
                        raise RuntimeError('fixture descriptor cleanup')
                if kind == 'permit-fifo':
                    next_lease = owner.Reservation(root)
                    try:
                        next_lease.acquire()
                        value['lockReacquired'] = True
                    finally:
                        if not next_lease.close():
                            raise RuntimeError('fixture lock cleanup')
        elif kind.startswith(('caller-', 'guardian-')) or kind == 'deadline':
            if kind.startswith('caller-') and kind != 'caller-hard':
                caller = os.fork()
                if caller == 0:
                    lease = reserved(root)
                    try:
                        owner.run_guarded(lease, lambda held, check: PythonLab(held, check, kind))
                    finally:
                        lease.close()
                    os._exit(0)
                wait_file(root / 'dispatched')
                os.kill(caller, signal.SIGKILL)
                os.waitpid(caller, 0)
                wait_file(root / 'cleaned')
                end = time.monotonic() + 4
                while owner.own_children():
                    os.waitpid(-1, os.WNOHANG)
                    if time.monotonic() > end:
                        raise RuntimeError('synthetic guardian did not exit')
                    time.sleep(.01)
                value = json.loads((root / 'cleaned').read_text())
                value.update(markerRemoved=not (root / owner.MARKER).exists(), reaped=not owner.own_children())
            else:
                lease = reserved(root)
                try:
                    if kind == 'deadline':
                        owner.TOTAL_SECONDS, owner.CLEAN_SECONDS = 1.2, .6
                    if kind == 'caller-hard':
                        owner.TOTAL_SECONDS, owner.CLEAN_SECONDS, owner.GUARDIAN_GRACE_SECONDS = 1, .5, .05
                    if kind == 'guardian-after-report':
                        actual_guardian = owner.guardian
                        def bad_exit(*args):
                            actual_guardian(*args)
                            os._exit(3)
                        owner.guardian = bad_exit
                    if kind.startswith('guardian-final-close-'):
                        actual_open, actual_close = os.pidfd_open, os.close
                        retained = []
                        def capture(pid):
                            fd = actual_open(pid)
                            retained.append(fd)
                            return fd
                        def fail_final(fd):
                            actual_close(fd)
                            if retained and fd == retained[0]:
                                retained.clear()
                                raise OSError('synthetic final pidfd close failure')
                        with patch.object(owner.os, 'pidfd_open', capture), patch.object(owner.os, 'close', fail_final):
                            value = owner.run_guarded(lease, lambda held, check: PythonLab(held, check, kind))
                    elif kind == 'guardian-bookkeeping':
                        actual_open = os.pidfd_open
                        calls = 0
                        def fail_first(pid):
                            nonlocal calls
                            calls += 1
                            if calls == 1:
                                raise OSError('synthetic post-fork bookkeeping')
                            return actual_open(pid)
                        with patch.object(owner.os, 'pidfd_open', fail_first):
                            value = owner.run_guarded(lease, lambda held, check: PythonLab(held, check, kind))
                    else:
                        value = owner.run_guarded(lease, lambda held, check: PythonLab(held, check, kind))
                finally:
                    lease.close()
        else:
            lease = reserved(root)
            if kind != 'readonly':
                lease.create_marker()
            children = owner.Children(lease)
            script = 'import time; time.sleep(8)'
            seconds = .15
            if kind == 'descendants':
                script = ('import subprocess,sys,time; subprocess.Popen([sys.executable,"-B","-c",'
                          '"import time; time.sleep(8)"],start_new_session=True); time.sleep(8)')
            if kind == 'output':
                script = 'import os,time; os.write(1,b"x"*70000); time.sleep(8)'
                seconds = 2
            if kind == 'stderr-output':
                script = 'import os,time; os.write(1,b"x"*35000); os.write(2,b"y"*35000); time.sleep(8)'
                seconds = 2
            if kind == 'readonly':
                script = 'print("synthetic")'
                seconds = 2
            failed, failure = False, 'none'
            try:
                if kind == 'bookkeeping':
                    real_save = lease.save
                    def save():
                        if lease.state['children']:
                            raise OSError('synthetic post-spawn publication')
                        real_save()
                    lease.save = save
                context = patch.object(owner.os, 'pidfd_open', side_effect=OSError('synthetic pidfd allocation')) if kind == 'pidfd' else __import__('contextlib').nullcontext()
                with context:
                    reply = children.run([sys.executable, '-B', '-c', script], owner.Budget(seconds),
                                         capture_stderr=kind == 'stderr-output')
                    code, output = reply[:2]
            except BaseException as error:
                failed, failure = True, owner.reason(error)
            finally:
                # Restore only the injected journal failure, not process state.
                if kind == 'bookkeeping':
                    lease.save = real_save
                children.reap(owner.Budget(2))
                value = {'failed': failed, 'failure': failure, 'absent': not owner.own_children()}
                if kind == 'readonly' and not failed:
                    value.update(code=code, output=output.decode().strip(), marker=(root / owner.MARKER).exists())
                try:
                    os.waitpid(-1, os.WNOHANG)
                    value['echild'] = False
                except ChildProcessError:
                    value['echild'] = True
                lease.close()
        print(json.dumps(value))


class FixtureExpired(Exception):
    pass


class FixtureGuard:
    """Independent kernel custody. NO implementation-under-test cleanup/helpers.

    Dedicated single-thread supervisor, initially childless. Its proc reads cover
    only direct/adopted children. Unreaped children cannot have reused PIDs.
    """
    def __init__(self):
        if ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0) != 0 or self.children():
            raise RuntimeError('fixture custody unavailable')
        self.slots = {}
        self.gate = None
        self.attempted = self.released = False
        self.signalled = 0

    @staticmethod
    def children():
        with open(f'/proc/self/task/{os.getpid()}/children', 'rb') as stream:
            raw = stream.read(4097)
        if len(raw) > 4096:
            raise RuntimeError('fixture child bound')
        return [int(pid) for pid in raw.split()]

    def keep(self, pid):
        row = self.slots.setdefault(pid, {'fd': None, 'start': None})
        if row['fd'] is None:
            row['fd'] = os.pidfd_open(pid)
        with open(f'/proc/{pid}/stat', 'rb') as stream:
            raw = stream.read(4097)
        fields = raw[raw.rindex(b')') + 2:].split()
        if len(raw) > 4096 or int(fields[1]) != os.getpid() or int(fields[19]) <= 0:
            raise RuntimeError('fixture child identity')
        row['start'] = int(fields[19])

    def spawn(self, operation, fail_bookkeeping=False):
        readfd, self.gate = os.pipe2(os.O_CLOEXEC)
        old = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGTERM, signal.SIGINT, signal.SIGHUP})
        try:
            self.attempted = True  # even a lost fork return requires ECHILD
            pid = os.fork()
            if pid == 0:
                os.close(self.gate)
                try:
                    signal.pthread_sigmask(signal.SIG_SETMASK, old)
                    if os.read(readfd, 1) != b'G':
                        os._exit(4)
                    os.close(readfd)
                    operation()
                    sys.stdout.flush()
                    os._exit(0)
                except BaseException:
                    os._exit(3)
            self.slots[pid] = {'fd': None, 'start': None}  # before fallible work
            self.keep(pid)
            if fail_bookkeeping:
                raise RuntimeError('synthetic supervisor bookkeeping failure')
            self.released = True  # conservative if gate write itself fails
            if os.write(self.gate, b'G') != 1:
                raise RuntimeError('fixture gate')
            return pid
        finally:
            os.close(readfd)
            os.close(self.gate)
            self.gate = None
            signal.pthread_sigmask(signal.SIG_SETMASK, old)

    def reaped(self, pid):
        row = self.slots.pop(pid, None)
        if row is not None and row['fd'] is not None:
            os.close(row['fd'])

    def cleanup(self):
        # Independent hard cleanup alarm and monotonic bound; every outcome,
        # including gated fork/pidfd/identity failure, reaches this method.
        for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            signal.signal(sig, signal.SIG_IGN)
        signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(FixtureExpired()))
        signal.setitimer(signal.ITIMER_REAL, 2)
        end = time.monotonic() + 2
        bad = False
        try:
            if self.gate is not None:
                try:
                    os.close(self.gate)
                except OSError:
                    bad = True
                self.gate = None
            while time.monotonic() < end:
                try:
                    pids = set(self.children()) | set(self.slots)
                except BaseException:
                    bad, pids = True, set(self.slots)
                for pid in pids:
                    try:
                        self.keep(pid)
                        signal.pidfd_send_signal(self.slots[pid]['fd'], signal.SIGKILL)
                        self.signalled += 1
                    except ProcessLookupError:
                        pass
                    except BaseException:
                        bad = True
                        # A retained direct/adopted child is still unreaped by
                        # this sole waiter, so this exact PID is safe on fd error.
                        try:
                            os.kill(pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        except BaseException:
                            bad = True
                echild = False
                while True:
                    try:
                        pid, _ = os.waitpid(-1, os.WNOHANG)
                        if pid == 0:
                            break
                        self.reaped(pid)
                    except ChildProcessError:
                        echild = True
                        break
                if echild and not self.children() and not self.slots:
                    return not bad
                time.sleep(.005)
        except BaseException:
            return False
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
        return False


def supervise_fixture(kind):
    """Bounded independent parent around ordinary-Python-only inner fixtures."""
    guard = FixtureGuard()
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP, signal.SIGALRM):
        signal.signal(sig, lambda *_: (_ for _ in ()).throw(FixtureExpired()))
    special = kind in ('guard-broken-return', 'guard-broken-hang', 'guard-bookkeeping')
    seconds = .2 if kind == 'guard-broken-hang' else (.35 if kind in ('permit-fifo', 'source-fifo', 'preflight-deadline') else 7)
    code, timed_out = None, False
    with contextlib.ExitStack() as faults, tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
        if kind.startswith('guard-broken-'):
            # Break the shared implementation in THIS supervisor too, before
            # fork. Kernel custody below must not use either patched helper.
            faults.enter_context(patch.object(owner.Children, 'reap', return_value=True))
            faults.enter_context(patch.object(owner, 'own_children', return_value=[]))
        def operation():
            os.dup2(output.fileno(), 1)
            os.dup2(errors.fileno(), 2)
            resource.setrlimit(resource.RLIMIT_FSIZE, (65536, 65536))
            if kind.startswith('guard-broken-'):
                # Deliberately false inner cleanup/discovery, plus a detached
                # ordinary child. The independent parent must still reap both.
                if os.fork() == 0:
                    os.setsid()
                    time.sleep(8)
                    os._exit(0)
                claimed = owner.Children(SimpleNamespace(state=None)).reap(None) and not owner.own_children()
                print(json.dumps({'innerClaim': claimed}), flush=True)
                if kind == 'guard-broken-hang':
                    time.sleep(8)
            else:
                python_fixture(kind)
        try:
            signal.setitimer(signal.ITIMER_REAL, seconds)
            pid = guard.spawn(operation, fail_bookkeeping=kind == 'guard-bookkeeping')
            end = time.monotonic() + seconds
            while time.monotonic() < end:
                found, status = os.waitpid(pid, os.WNOHANG)
                if found:
                    guard.reaped(pid)
                    code = os.waitstatus_to_exitcode(status)
                    break
                time.sleep(.005)
            if code is None:
                timed_out = True
        except FixtureExpired:
            timed_out = True
        except BaseException:
            code = 3
        finally:
            absent = guard.cleanup()
        if not absent or (not special and code != 0):
            raise SystemExit(3)
        output.seek(0)
        raw = output.read(4097)
        if len(raw) > 4096:
            raise SystemExit(3)
        value = json.loads(raw) if raw else {}
        if special:
            value.update(timedOut=timed_out, gateOpened=guard.released,
                         signalled=guard.signalled, failed=code != 0,
                         parentImplementationBroken=kind.startswith('guard-broken-'))
        value['_fixtureGuardAbsent'] = absent
        print(json.dumps(value))


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--python-fixture':
        supervise_fixture(sys.argv[2])
    else:
        unittest.main()
