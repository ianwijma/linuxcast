"""Offline inventory preparation: synthetic files/replies, injected guest syscalls.

NEVER runs a guest program, real CLI, host drop/namespace/privileged operation.
AST-extracted guest definitions are tested with injected metadata/kernel adapters.
Ordinary child fixtures have an independent kernel supervisor from the prior tests.
"""
import ast
import contextlib
import copy
import errno
import io
import inspect
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import lab_inventory_owner as inventory
import lab_owner as owner
import test_lab_owner as native


def probe_definitions():
    tree = ast.parse(inventory.PROBE_SOURCE)
    # No __main__ invocation, metadata collection or syscall at module scope.
    assert all(isinstance(n, (ast.Import, ast.ImportFrom, ast.Assign, ast.ClassDef, ast.FunctionDef, ast.If)) for n in tree.body)
    tree.body = [n for n in tree.body if not isinstance(n, ast.If)]
    scope = {'__name__': 'synthetic_probe_definitions'}
    exec(compile(tree, '<synthetic-guest-definitions>', 'exec'), scope)
    return scope


PROBE = probe_definitions()


def reply():
    return {'schema': 'f102-inventory-probe-v1', 'jobKind': 'inventory-only', 'firstFailure': 'none',
            'facts': {'identity': {'effectiveUid': 0, 'effectiveGid': 0, 'sudoIdentity': 'uid1000'},
                      'os': {'status': 'known', 'id': 'debian', 'version': '13.7', 'architecture': 'amd64'},
                      'packages': {'status': 'known', 'versions': dict.fromkeys(inventory.PACKAGES, '1.2-3')},
                      'paths': dict.fromkeys(inventory.PATHS, True),
                      'controllers': {'status': 'known', 'names': ['cpu', 'memory', 'pids']},
                      'accounts': {'status': 'known', 'uidPresent': False, 'gidPresent': False},
                      'processes': {'status': 'known', 'total': 3, 'uid20000': 0,
                                    'graphicalCandidates': 0, 'testCandidates': 0},
                      'namespaceProbe': {'status': 'observed', 'firstFailure': 'none', 'cleanup': True,
                                         'net': {'self': 'allowed', 'pid1': 'denied', 'same': None},
                                         'pid': {'self': 'allowed', 'pid1': 'unknown', 'same': None}}}}


def permit(root):
    old = native.permit(root)
    return {k: v for k, v in dict(old, jobKind='inventory-only', inventoryOwnerSha256='5' * 64,
                                  inventoryProbeSha256=inventory.PROBE_SHA256,
                                  inventoryAuthorityReviewed=True).items()
            if k not in ('sourceTree', 'archiveSha256', 'receiptSha256', 'nodeSha256',
                         'guestWrapperSha256', 'guestPrerequisitesReviewed')}


def write_permit(root, value=None):
    path = root / inventory.PERMIT
    if path.exists():
        path.chmod(0o600)
    path.write_bytes(owner.encoded(permit(root) if value is None else value))
    path.chmod(0o400)


def prepare(root):
    # Synthetic temporary files only, never a permit under the actual lab root.
    native.prepare(root)
    write_permit(root)


def reserved(root):
    lease = inventory.InventoryReservation(root)
    lease.acquire()
    lease.permit('1' * 64, '5' * 64, inventory.PROBE_SHA256)
    return lease


class FakeLab(native.FakeLab):
    job_seconds = 30

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.reply = owner.encoded(reply())
        self.bounds = []

    def validate_job_reply(self, raw, code, result):
        return inventory.InventoryLab.validate_job_reply(self, raw, code, result)

    def dispatch(self, budget):
        self.bounds.append(budget.remaining())
        return super().dispatch(budget)


class Files(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='inventory-owner-offline-')
        self.root = Path(self.temp.name)
        prepare(self.root)
        self.lease = reserved(self.root)

    def tearDown(self):
        self.lease.close()
        self.temp.cleanup()

    def renew(self):
        self.lease.close()
        self.lease = reserved(self.root)

    def test_exact_enumerated_protocol_keys_and_all_three_hashes(self):
        self.assertEqual(len(permit(self.root)), 13)  # frozen protocol enumerates13, request says15
        self.assertNotIn('receiptSha256', self.lease.pin)
        for key in ('ownerSha256', 'inventoryOwnerSha256', 'inventoryProbeSha256'):
            for invalid in ('0' * 64, 'A' * 64, None):
                self.lease.close()
                write_permit(self.root, dict(permit(self.root), **{key: invalid}))
                self.lease = inventory.InventoryReservation(self.root)
                self.lease.acquire()
                with self.subTest(key=key, invalid=invalid), self.assertRaises(owner.Rejected):
                    self.lease.permit('1' * 64, '5' * 64, inventory.PROBE_SHA256)

    def test_closed_permit_rejects_native_foreign_wrong_kind_and_unsafe_values(self):
        changes = [{'nativeRuns': 0}, {'schema': True}, {'jobKind': 'native'}, {'containerId': 'other'},
                   {'labRoot': '/tmp'}, {'labInode': True}, {'labDevice': 0}, {'imageId': 'other'},
                   {'guestAccount': '$(private)'}, {'guestAccount': '-oProxyCommand=bad'},
                   {'guestPrivilege': 'root'}, {'guestPrivilege': 'interactive'},
                   {'inventoryAuthorityReviewed': False}, {'inventoryAuthorityReviewed': 1}]
        for value in [native.permit(self.root), *[dict(permit(self.root), **v) for v in changes]]:
            self.lease.close()
            write_permit(self.root, value)
            self.lease = inventory.InventoryReservation(self.root)
            self.lease.acquire()
            with self.subTest(value=value), self.assertRaises(owner.Rejected):
                self.lease.permit('1' * 64, '5' * 64, inventory.PROBE_SHA256)

    def test_native_cannot_admit_inventory_permit(self):
        self.lease.close()
        native.write_permit(self.root, permit(self.root))
        self.lease = owner.Reservation(self.root)
        self.lease.acquire()
        with self.assertRaises(owner.Rejected):
            self.lease.permit('1' * 64)

    def test_unsafe_permit_objects_and_duplicate_unknown_oversized_bytes(self):
        for kind in ('mutable', 'symlink', 'hardlink', 'fifo', 'duplicate', 'large', 'unknown'):
            self.lease.close()
            path = self.root / inventory.PERMIT
            path.unlink()
            if kind == 'symlink':
                path.symlink_to(self.root / owner.PERMIT)
            elif kind == 'fifo':
                os.mkfifo(path, 0o400)
            else:
                raw = owner.encoded(permit(self.root))
                raw = b'{"schema":1,' + raw[1:] if kind == 'duplicate' else raw
                raw = b'x' * (owner.MAX_BYTES + 1) if kind == 'large' else raw
                raw = owner.encoded(dict(permit(self.root), unknown=True)) if kind == 'unknown' else raw
                path.write_bytes(raw)
                path.chmod(0o600 if kind == 'mutable' else 0o400)
                if kind == 'hardlink':
                    os.link(path, self.root / 'alias')
            self.lease = inventory.InventoryReservation(self.root)
            self.lease.acquire()
            with self.subTest(kind=kind), self.assertRaises((owner.Rejected, OSError)):
                self.lease.permit('1' * 64, '5' * 64, inventory.PROBE_SHA256)

    def test_changed_permit_bytes_and_replaced_binding(self):
        path = self.root / inventory.PERMIT
        raw = path.read_bytes()
        path.chmod(0o600)
        path.write_bytes(raw + b' ')
        path.chmod(0o400)
        with self.assertRaisesRegex(owner.Rejected, 'custody'):
            self.lease.check()
        path.rename(self.root / 'old-permit')
        write_permit(self.root)
        with self.assertRaisesRegex(owner.Rejected, 'custody'):
            self.lease.check()

    def test_foreign_native_marker_cannot_authorize_inventory_cleanup(self):
        self.lease.close()
        old = native.reserved(self.root)
        old.create_marker()
        old.state['mayHaveStarted'] = True
        old.save()
        old.close()
        self.lease = reserved(self.root)
        lab = FakeLab(self.lease)
        result = owner.transact(self.lease, lab)
        self.assertEqual(result['firstFailure'], 'foreign')
        self.assertEqual(lab.calls, [])
        self.assertTrue((self.root / owner.MARKER).exists())

    def test_changed_inventory_permit_cannot_consume_earlier_marker(self):
        self.lease.create_marker()
        self.lease.close()
        write_permit(self.root, dict(permit(self.root), guestAccount='other'))
        self.lease = reserved(self.root)
        lab = FakeLab(self.lease)
        result = owner.transact(self.lease, lab)
        self.assertEqual(result['firstFailure'], 'foreign')
        self.assertEqual(lab.calls, [])

    def test_inventory_marker_cannot_authorize_native_cleanup(self):
        self.lease.create_marker()
        self.lease.close()
        self.lease = native.reserved(self.root)
        lab = native.FakeLab(self.lease)
        self.assertEqual(owner.transact(self.lease, lab)['firstFailure'], 'foreign')
        self.assertEqual(lab.calls, [])

    def test_success_is_inventory_only_with_separate_facts_and_lifecycle(self):
        lab = FakeLab(self.lease)
        result = owner.transact(self.lease, lab)
        self.assertEqual(lab.calls, ['inspect', 'start', 'ready', 'dispatch', 'cleanup'])
        self.assertLessEqual(lab.bounds[0], 30)
        public = inventory.public_result(result)
        self.assertEqual(public['lifecycle']['status'], 'completed')
        self.assertEqual(public['inventory'], reply())
        self.assertEqual(public['jobKind'], 'inventory-only')
        self.assertEqual(public['acceptance'], 'pending')
        self.assertNotIn('nativeRuns', owner.encoded(public).decode())
        self.assertFalse((self.root / owner.MARKER).exists())

    def test_interruption_before_and_after_reply_publication_preserves_first_failure(self):
        method = inventory.InventoryLab.validate_job_reply
        lines, start = inspect.getsourcelines(method)
        for after in (False, True):
            needle = "return reply['firstFailure']" if after else 'owner.require(len(owner.encoded'
            boundary = start + next(i for i, line in enumerate(lines) if needle in line)
            fired = []
            def interrupt(frame, event, _arg):
                if event == 'line' and frame.f_code is method.__code__ and frame.f_lineno == boundary:
                    fired.append(True)
                    sys.settrace(None)
                    raise owner.Rejected('interrupted')
                return interrupt
            previous = sys.gettrace()
            try:
                sys.settrace(interrupt)
                result = owner.transact(self.lease, FakeLab(self.lease))
            finally:
                sys.settrace(previous)
            with self.subTest(after=after):
                self.assertEqual(fired, [True])
                self.assertEqual(result['firstFailure'], 'interrupted')
                self.assertEqual(result['cleanupFailure'], 'none')
                self.assertTrue(result['reservationClean'])
                self.assertFalse((self.root / owner.MARKER).exists())
                self.assertEqual(result['transportResultValid'], after)
                self.assertEqual(result['inventoryReply'], reply() if after else None)
                inventory.InventoryReservation.validate_reply(result)
            self.renew()

    def test_partial_metadata_keeps_facts_and_first_failure_after_cleanup_fault(self):
        lab = FakeLab(self.lease, cleanup=('poweroff', True, True, True))
        value = reply()
        value['facts']['namespaceProbe'] = PROBE['probe_empty']('failed', 'child')
        value['firstFailure'] = 'probe'
        lab.reply, lab.code = owner.encoded(value), 3
        result = owner.transact(self.lease, lab)
        self.assertEqual((result['firstFailure'], result['cleanupFailure']), ('transport', 'poweroff'))
        self.assertTrue(result['transportResultValid'])
        self.assertEqual(result['inventoryReply'], value)
        self.assertTrue((self.root / owner.MARKER).exists())

    def test_same_job_recovery_never_replays_inventory(self):
        self.lease.create_marker()
        self.lease.state.update(mayHaveStarted=True, mayHaveDispatched=True)
        self.lease.save()
        self.renew()
        lab = FakeLab(self.lease)
        result = owner.transact(self.lease, lab)
        self.assertEqual(lab.calls, ['recover', 'cleanup'])
        self.assertEqual(result['status'], 'recovered')
        self.assertIsNone(result['inventoryReply'])

    def test_unknown_children_recovery_preserves_dirty_marker(self):
        self.lease.create_marker()
        self.lease.state.update(mayHaveStarted=True, childrenUncertain=True)
        self.lease.save()
        self.renew()
        lab = FakeLab(self.lease)
        result = owner.transact(self.lease, lab)
        self.assertFalse(result['reservationClean'])
        self.assertFalse(result['ownedChildrenAbsent'])
        self.assertTrue((self.root / owner.MARKER).exists())

    def test_every_operation_fault_has_conservative_accounting_no_replay(self):
        for step, flags in (('inspect', (False, False)), ('start', (True, False)),
                            ('ready', (True, False)), ('dispatch', (True, True))):
            lab = FakeLab(self.lease, fail=step)
            result = owner.transact(self.lease, lab)
            self.assertEqual((result['mayHaveStarted'], result['mayHaveDispatched']), flags)
            self.assertEqual(result['firstFailure'], 'child')
            self.assertEqual(lab.calls.count(step), 1)
            self.renew()

    def test_replaced_marker_is_preserved_after_inventory_reply(self):
        lab = FakeLab(self.lease)
        original = lab.cleanup
        def replace(budget):
            path = self.root / owner.MARKER
            path.rename(self.root / 'held-marker')
            path.write_bytes(b'foreign')
            path.chmod(0o600)
            return original(budget)
        lab.cleanup = replace
        result = owner.transact(self.lease, lab)
        self.assertEqual(result['cleanupFailure'], 'custody')
        self.assertFalse(result['reservationClean'])
        self.assertEqual((self.root / owner.MARKER).read_bytes(), b'foreign')


class Protocols(unittest.TestCase):
    def test_exact_quoting_is_one_python_source_argument_no_stdin(self):
        import shlex
        for mode, account in (('root', 'root'), ('sudo-noninteractive', 'synthetic')):
            pin = {'guestPrivilege': mode, 'guestAccount': account}
            argv = inventory.inventory_argv(pin)
            prefix = ('/usr/bin/sudo', '-n', '--') if mode != 'root' else ()
            remote = (*prefix, '/usr/bin/python3', '-I', '-B', '-c', inventory.PROBE_SOURCE)
            ssh_end = argv.index('127.0.0.1') + 1
            self.assertEqual(tuple(shlex.split(' '.join(argv[ssh_end:]))), remote)
            self.assertEqual(argv[-1], shlex.quote(inventory.PROBE_SOURCE))
            native_power = owner.transport_argv(pin, 'poweroff')
            self.assertEqual(argv[:ssh_end], native_power[:native_power.index('127.0.0.1') + 1])
            self.assertIn('-n', argv)
            self.assertEqual(inventory.inventory_argv(pin, True)[-1], '/usr/bin/true')
            self.assertNotIn(owner.WRAPPER, argv)
            for text in ('/usr/bin/cat', '/usr/bin/sha256sum', '--reviewed-controller', '/bin/sh'):
                self.assertNotIn(text, argv)
        with self.assertRaises(owner.Rejected):
            inventory.inventory_argv(pin, 'arbitrary')

    def test_import_and_closed_cli_do_not_touch_lab(self):
        source = ast.parse(Path(inventory.__file__).read_text())
        self.assertEqual(source.body[-1].test.comparators[0].value, '__main__')
        for args in ([], ['--reviewed-owner', '--reviewed-wrapper', '--reviewed-controller'],
                     ['--reviewed-inventory-owner', '--reviewed-inventory-probe', '--command', '/bin/true'],
                     ['--reviewed-inventory-o', '--reviewed-inventory-p']):
            with patch.object(inventory, 'InventoryReservation') as lease, contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as raised:
                    inventory.main(args)
                self.assertEqual(raised.exception.code, 3)
                lease.assert_not_called()

    def test_inventory_reply_rejects_bad_unknown_types_private_fields_and_native_envelope(self):
        for raw, code in ((b'x' * 4097, 0), (b'{"schema":1,"schema":2}', 0),
                          (owner.encoded(native.wrapper()), 0), (owner.encoded(reply()), 3),
                          (owner.encoded(dict(reply(), private='canary')), 0)):
            with self.subTest(raw=raw[:30]), self.assertRaises(owner.Rejected):
                inventory.validate_inventory(raw, code)
        self.assertEqual(inventory.validate_inventory(owner.encoded(reply()), 0), reply())

    def test_each_fact_object_rejects_unknown_keys(self):
        for key in reply()['facts']:
            value = reply()
            value['facts'][key]['private'] = 'canary'
            with self.subTest(key=key), self.assertRaises(owner.Rejected):
                inventory.validate_inventory(owner.encoded(value), 0)

    def test_bad_and_inconsistent_facts_are_rejected(self):
        cases = [('identity', 'effectiveUid', True), ('identity', 'effectiveUid', 1000),
                 ('identity', 'sudoIdentity', 'private-account'), ('os', 'version', 'private body'),
                 ('packages', 'status', 'unknown'), ('packages', 'versions', {'python3': '1'}),
                 ('controllers', 'names', ['cpu', 'cpu']), ('controllers', 'names', ['unknown']),
                 ('controllers', 'names', ['memory', 'cpu']), ('accounts', 'uidPresent', 0),
                 ('processes', 'total', True), ('processes', 'total', 8193),
                 ('processes', 'uid20000', 4), ('processes', 'uid20000', 1),
                 ('namespaceProbe', 'cleanup', False), ('namespaceProbe', 'firstFailure', 'child'),
                 ('namespaceProbe', 'net', {'self': 'allowed', 'pid1': 'denied', 'same': True}),
                 ('namespaceProbe', 'pid', {'self': 'allowed', 'pid1': 'allowed', 'same': None})]
        for group, key, invalid in cases:
            value = reply()
            value['facts'][group][key] = invalid
            with self.subTest(group=group, key=key, invalid=invalid), self.assertRaises(owner.Rejected):
                inventory.validate_inventory(owner.encoded(value), 0)

    def test_collision_and_denied_unknown_namespaces_are_truthful_facts(self):
        value = reply()
        value['facts']['processes']['uid20000'] = 1
        value['facts']['namespaceProbe'] = PROBE['probe_empty']('uid-in-use')
        inventory.validate_inventory(owner.encoded(value), 0)
        value = reply()
        for kind in ('net', 'pid'):
            value['facts']['namespaceProbe'][kind] = {'self': 'allowed', 'pid1': 'allowed', 'same': False}
        inventory.validate_inventory(owner.encoded(value), 0)

    def test_public_output_and_guardian_relay_reject_false_success(self):
        result = inventory.InventoryReservation.result()
        self.assertIsNone(inventory.public_result(result)['inventory'])
        for change in ({'inventoryReply': reply()}, {'transportResultValid': True}, {'inventoryReply': []},
                       {'status': 'completed'}, {'private': 'canary'}):
            with self.subTest(change=change), self.assertRaises(owner.Rejected):
                inventory.public_result(dict(result, **change))

    def test_source_pins_are_fixed_and_match_embedded_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ('lab_owner.py', 'lab_inventory_owner.py', 'outer-owner-inventory.json'):
                target = root / name
                target.write_bytes(Path(inventory.__file__).with_name(name).read_bytes())
                target.chmod(0o600)
            with patch.object(inventory, '__file__', str(root / 'lab_inventory_owner.py')):
                base_sha, new_sha, probe_sha, inv = inventory.source_pins()
        self.assertEqual(base_sha, owner.digest(Path(owner.__file__).read_bytes()))
        self.assertEqual(new_sha, owner.digest(Path(inventory.__file__).read_bytes()))
        self.assertEqual(probe_sha, owner.digest(inventory.PROBE_SOURCE.encode()))
        self.assertEqual(inv['containerId'], owner.CONTAINER)
        with patch.object(owner, 'read_source', return_value=b'foreign'):
            with self.assertRaises(owner.Rejected):
                inventory.source_pins()

    def test_no_new_timeouts_or_native_authority(self):
        self.assertEqual((owner.START_SECONDS, owner.JOB_SECONDS, owner.CLEAN_SECONDS, owner.TOTAL_SECONDS), (120, 360, 45, 600))
        self.assertEqual(inventory.InventoryLab.job_seconds, 30)
        self.assertIs(inventory.InventoryLab.cleanup, owner.NativeLab.cleanup)
        self.assertIs(inventory.InventoryLab.inspect, owner.NativeLab.inspect)
        self.assertIs(inventory.InventoryLab.poweroff, owner.NativeLab.poweroff)
        self.assertIs(inventory.InventoryLab.recover_children, owner.NativeLab.recover_children)
        lease = SimpleNamespace(pin={'inventoryAuthorityReviewed': True})
        self.assertTrue(inventory.InventoryLab(lease, {}).cleanup_authorized())
        with self.assertRaises(KeyError):
            owner.NativeLab(lease, {}).cleanup_authorized()


class GuestFacts(unittest.TestCase):
    def test_bounded_packages_selected_versions_only_and_absence(self):
        parse = PROBE['package_versions']
        value = parse('Package: python3\nStatus: install ok installed\nVersion: 3.13.5-1\nDescription: public\n continuation\n\nPackage: unrelated\nStatus: install ok installed\nVersion: private\n')
        self.assertEqual(value['python3'], '3.13.5-1')
        self.assertIsNone(value['orca'])
        self.assertNotIn('unrelated', value)
        for raw in ('Package: python3\nStatus: install ok installed\nVersion: private\n',
                    'Package: python3\nPackage: python3\n',
                    'Package: python3\n\nPackage: python3\n',
                    'malformed', 'X' * 16385, 'X' * (8 * 1024 * 1024 + 1)):
            with self.subTest(size=len(raw)), self.assertRaises(PROBE['Fault']):
                parse(raw)

    def test_missing_or_invalid_package_identity_remains_unknown_before_filtering(self):
        valid = 'Package: python3\nStatus: install ok installed\nVersion: 3.13.5\n'
        for raw in ('Status: install ok installed\nVersion: 3.13.5\n',
                    'Package: \nStatus: install ok installed\n',
                    'Package: InvalidName\nStatus: install ok installed\n',
                    'Package: unrelated name\nStatus: install ok installed\n',
                    ' orphan continuation\n', valid + '\nStatus: install ok installed\n'):
            with self.subTest(raw=raw):
                with self.assertRaises(PROBE['Fault']):
                    PROBE['package_versions'](raw)
                value, _ = self.collect(package_text=raw)
                self.assertEqual(value['firstFailure'], 'packages')
                self.assertEqual(value['facts']['packages'], {'status': 'unknown', 'versions': dict.fromkeys(inventory.PACKAGES)})
                inventory.validate_inventory(owner.encoded(value), 3)
                with self.assertRaises(owner.Rejected):
                    inventory.validate_inventory(owner.encoded(value), 0)
        # Empty separators and unrelated well-formed package names remain valid.
        self.assertEqual(PROBE['package_versions']('\n\n' + valid + '\n\n')['python3'], '3.13.5')

    def test_incomplete_package_or_os_identity_metadata_is_unknown_not_absence(self):
        for status in ('', 'private', 'install ok mystery'):
            with self.assertRaises(PROBE['Fault']):
                PROBE['package_versions']('Package: python3\n' + ('Status: ' + status + '\n' if status else ''))
        held = PROBE['package_versions']('Package: python3\nStatus: hold ok installed\nVersion: 3.13.5\n')
        self.assertEqual(held['python3'], '3.13.5')
        with patch.dict(PROBE, text=lambda *_: 'VERSION_ID="13.7"\n'), self.assertRaises(PROBE['Fault']):
            PROBE['os_facts']()

    def test_empty_proc_directory_does_not_claim_zero_processes(self):
        entries = contextlib.nullcontext(iter(()))
        with patch.dict(PROBE, os=SimpleNamespace(scandir=lambda _: entries)), self.assertRaises(PROBE['Fault']):
            PROBE['process_counts']()
        value = reply()
        value['facts']['processes']['total'] = 0
        with self.assertRaises(owner.Rejected):
            inventory.validate_inventory(owner.encoded(value), 0)

    def test_package_read_failure_is_unknown_not_missing_packages(self):
        value, touched = self.collect(fail='packages')
        self.assertEqual(value['firstFailure'], 'packages')
        self.assertEqual(value['facts']['packages'], {'status': 'unknown', 'versions': dict.fromkeys(inventory.PACKAGES)})
        inventory.validate_inventory(owner.encoded(value), 3)
        self.assertIn('/var/lib/dpkg/status', touched)

    def collect(self, fail=None, collision=False, unknown_proc=False, package_text=None):
        paths = []
        def text(path, limit):
            paths.append(path)
            if path == '/usr/lib/os-release':
                return 'ID=debian\nVERSION_ID="13.7"\n'
            if path == '/var/lib/dpkg/status':
                if fail == 'packages':
                    raise OSError('private error body')
                return package_text if package_text is not None else 'Package: python3\nStatus: install ok installed\nVersion: 3.13.5\n'
            if path == '/sys/fs/cgroup/cgroup.controllers':
                return 'cpu memory pids\n'
            if path == '/etc/passwd':
                return 'public:x:20000:20000::/nonexistent:/usr/sbin/nologin\n'
            if path == '/etc/group':
                return 'public:x:20000:\n'
            raise AssertionError('unapproved metadata read')
        counts = dict(reply()['facts']['processes'])
        counts['uid20000'] = int(collision)
        processes = Mock(return_value=counts, side_effect=OSError() if unknown_proc else None)
        kernel = Mock()
        fake_os = SimpleNamespace(geteuid=lambda: 0, getegid=lambda: 0,
                                  environ={'SUDO_UID': '1000', 'SUDO_GID': '1000'},
                                  uname=lambda: SimpleNamespace(machine='x86_64'),
                                  stat=lambda _: SimpleNamespace(st_mode=0o100755))
        with patch.dict(PROBE, text=text, os=fake_os, process_counts=processes,
                        Ops=kernel, feasibility=lambda _: reply()['facts']['namespaceProbe']):
            value = PROBE['collect']()
        if collision or unknown_proc:
            kernel.assert_not_called()
        return value, paths

    def test_known_uid_collision_refuses_probe_without_drop_or_fork(self):
        value, _ = self.collect(collision=True)
        self.assertEqual(value['facts']['namespaceProbe']['status'], 'uid-in-use')
        inventory.validate_inventory(owner.encoded(value), 0)

    def test_unreadable_proc_refuses_probe_and_does_not_claim_absence(self):
        value, _ = self.collect(unknown_proc=True)
        self.assertEqual(value['firstFailure'], 'proc')
        self.assertEqual(value['facts']['namespaceProbe']['status'], 'uid-unknown')
        for key in ('total', 'uid20000', 'graphicalCandidates', 'testCandidates'):
            self.assertIsNone(value['facts']['processes'][key])
        inventory.validate_inventory(owner.encoded(value), 3)

    def test_collection_reads_only_fixed_public_metadata_and_no_private_data(self):
        value, paths = self.collect()
        self.assertEqual(set(paths), {'/usr/lib/os-release', '/var/lib/dpkg/status', '/sys/fs/cgroup/cgroup.controllers', '/etc/passwd', '/etc/group'})
        inventory.validate_inventory(owner.encoded(value), 0)
        literals = [n.value for n in ast.walk(ast.parse(inventory.PROBE_SOURCE)) if isinstance(n, ast.Constant) and type(n.value) is str]
        for forbidden in ('cmdline', '/environ', '/home/', '/root/', 'machine-id', 'guest-key', 'known_hosts', '/dev/input', '/dev/snd'):
            self.assertFalse(any(forbidden in text for text in literals))

    def test_namespace_denial_unknown_and_equality_expose_no_inodes(self):
        for exception, status in ((PermissionError(), 'denied'), (FileNotFoundError(), 'unknown')):
            fake_os = SimpleNamespace(stat=Mock(side_effect=[SimpleNamespace(st_dev=1, st_ino=42), exception]))
            with patch.dict(PROBE, os=fake_os):
                value = PROBE['ns_fact']('net')
            self.assertEqual(value, {'self': 'allowed', 'pid1': status, 'same': None})
        fake_os = SimpleNamespace(stat=Mock(return_value=SimpleNamespace(st_dev=1, st_ino=42)))
        with patch.dict(PROBE, os=fake_os):
            self.assertEqual(PROBE['ns_fact']('pid'), {'self': 'allowed', 'pid1': 'allowed', 'same': True})

    def test_proc_metadata_errors_and_limit_never_become_zero(self):
        entries = [SimpleNamespace(name='1'), SimpleNamespace(name='2')]
        context = Mock()
        context.__enter__ = Mock(return_value=iter(entries))
        context.__exit__ = Mock(return_value=False)
        fake_os = SimpleNamespace(scandir=lambda _: context)
        def text(path, limit):
            if path == '/proc/2/status':
                raise PermissionError('private detail')
            return 'Name:\tXvfb\nUid:\t20000\t0\t0\t0\n'
        with patch.dict(PROBE, os=fake_os, text=text):
            with self.assertRaises(PermissionError):
                PROBE['process_counts']()
        context.__enter__ = Mock(return_value=iter(entries[:1]))
        with patch.dict(PROBE, os=fake_os, text=text):
            value = PROBE['process_counts']()
        self.assertEqual(value, {'status': 'known', 'total': 1, 'uid20000': 1, 'graphicalCandidates': 1, 'testCandidates': 0})
        for raw in ('Name:\tpublic\n', 'Name:\tpublic\nUid:\t0 0 0 x\n', 'Uid:\t0 0 0 0\nUid:\t0 0 0 0\n'):
            context.__enter__ = Mock(return_value=iter(entries[:1]))
            with patch.dict(PROBE, os=fake_os, text=lambda *_: raw), self.assertRaises(PROBE['Fault']):
                PROBE['process_counts']()
        context.__enter__ = Mock(return_value=(SimpleNamespace(name=str(n)) for n in range(8193)))
        with patch.dict(PROBE, os=fake_os, text=lambda *_: 'Name: public\nUid: 0 0 0 0\n'), self.assertRaises(PROBE['Fault']):
            PROBE['process_counts']()

    def test_bounded_nonblocking_file_reads_close_on_every_error(self):
        for kind in ('oversize', 'read', 'stat', 'nonregular', 'decode'):
            fake_os = SimpleNamespace(O_RDONLY=os.O_RDONLY, O_NONBLOCK=os.O_NONBLOCK, O_CLOEXEC=os.O_CLOEXEC,
                                      O_NOFOLLOW=os.O_NOFOLLOW, open=Mock(return_value=10), close=Mock(),
                                      fstat=Mock(return_value=SimpleNamespace(st_mode=0o100400)),
                                      read=Mock(side_effect=[b'12345', b'']))
            if kind == 'read':
                fake_os.read.side_effect = OSError()
            elif kind == 'stat':
                fake_os.fstat.side_effect = OSError()
            elif kind == 'nonregular':
                fake_os.fstat.return_value.st_mode = 0o010400
            elif kind == 'decode':
                fake_os.read.side_effect = [b'\xff', b'']
            with patch.dict(PROBE, os=fake_os), self.subTest(kind=kind), self.assertRaises((PROBE['Fault'], OSError, UnicodeError)):
                PROBE['text']('/fixed-synthetic', 4)
            fake_os.close.assert_called_once_with(10)
            flags = fake_os.open.call_args.args[1]
            self.assertTrue(flags & os.O_NONBLOCK and flags & os.O_NOFOLLOW)

    def test_metadata_unknown_shapes_and_first_failure_are_strict(self):
        value, _ = self.collect(fail='packages', unknown_proc=True)
        self.assertEqual(value['firstFailure'], 'packages')
        inventory.validate_inventory(owner.encoded(value), 3)
        value['firstFailure'] = 'proc'
        with self.assertRaises(owner.Rejected):
            inventory.validate_inventory(owner.encoded(value), 3)


class SimOps:
    """No processes/FDs/syscalls. All child custody paths advance a fake clock."""
    def __init__(self, fault=None, occurrence=1, persistent=False):
        self.calls, self.counts = [], {}
        self.fault, self.occurrence, self.persistent = fault, occurrence, persistent
        self.now, self.live, self.nextfd, self.gated = 0., False, 10, False
        self.output = [owner.encoded({k: reply()['facts']['namespaceProbe'][k] for k in ('net', 'pid')}), b'']

    def action(self, name, *args):
        self.calls.append((name, *args))
        self.counts[name] = self.counts.get(name, 0) + 1
        if self.fault == name and (self.counts[name] == self.occurrence or self.persistent):
            raise OSError('injected private canary')

    def clock(self):
        self.now += .001
        return self.now

    def pause(self, seconds):
        self.action('pause')
        self.now += seconds

    def pipe(self):
        self.action('pipe')
        fds = self.nextfd, self.nextfd + 1
        self.nextfd += 2
        return fds

    def fork(self):
        self.live = True
        self.action('fork')  # also models an interrupted/lost post-fork return
        return 123

    def pidfd(self, pid):
        self.action('pidfd', pid)
        return 99

    def close(self, fd):
        self.action('close', fd)

    def write(self, fd, raw):
        self.action('write', fd, raw)
        self.gated = True
        return len(raw)

    def poll(self, fd, seconds):
        self.action('poll', fd)
        self.now += seconds
        return self.fault != 'timeout'

    def read(self, fd, maximum):
        self.action('read', fd)
        return self.output.pop(0)

    def wait(self, pid, flags):
        self.action('wait', pid)
        if self.fault == 'wait-timeout':
            return 0, 0
        if not self.live:
            raise ChildProcessError()
        self.live = False
        return 123, 0

    def fd_kill(self, fd, sig):
        self.action('fd_kill', fd)

    def kill(self, pid, sig):
        self.action('kill', pid)


class Feasibility(unittest.TestCase):
    def test_successful_retained_gate_reap_and_closed_output(self):
        ops = SimOps()
        value = PROBE['feasibility'](ops)
        self.assertEqual(value['status'], 'observed')
        self.assertTrue(value['cleanup'])
        self.assertFalse(ops.live)
        names = [v[0] for v in ops.calls]
        self.assertLess(names.index('pidfd'), names.index('write'))
        self.assertEqual(names.count('fork'), 1)
        self.assertIn(('wait', -1), ops.calls)
        self.assertNotIn('123', owner.encoded(value).decode())

    def test_each_pipe_fork_retention_gate_read_wait_close_fault(self):
        for fault, count in (('pipe', 1), ('pipe', 2), ('fork', 1), ('pidfd', 1),
                             ('close', 1), ('close', 2), ('write', 1), ('close', 3),
                             ('poll', 1), ('read', 1), ('read', 2), ('wait', 1),
                             ('wait', 2), ('close', 4), ('close', 5)):
            ops = SimOps(fault, count)
            value = PROBE['feasibility'](ops)
            with self.subTest(fault=fault, count=count):
                self.assertEqual(value['status'], 'failed')
                self.assertNotEqual(value['firstFailure'], 'none')
                if ops.counts.get('fork'):
                    self.assertFalse(ops.live)
                if fault in ('fork', 'pidfd'):
                    self.assertFalse(ops.gated)
                self.assertLess(ops.now, 6)

    def test_timeout_bad_status_malformed_duplicate_and_oversized_output(self):
        for kind in ('timeout', 'status', 'bad-json', 'duplicate', 'unknown-key', 'oversize', 'inconsistent'):
            ops = SimOps('timeout' if kind == 'timeout' else None)
            if kind == 'status':
                original = ops.wait
                ops.wait = lambda pid, flags: (lambda row: (row[0], 3 << 8))(original(pid, flags))
            if kind == 'bad-json':
                ops.output = [b'private canary', b'']
            if kind == 'duplicate':
                ops.output = [b'{"net":{},"net":{},"pid":{}}', b'']
            if kind == 'unknown-key':
                ops.output = [b'{"private":"canary"}', b'']
            if kind == 'oversize':
                ops.output = [b'x' * 513]
            if kind == 'inconsistent':
                ops.output = [b'{"net":{"self":"allowed","pid1":"denied","same":true},"pid":{}}', b'']
            value = PROBE['feasibility'](ops)
            with self.subTest(kind=kind):
                self.assertEqual(value['status'], 'failed')
                self.assertTrue(value['cleanup'])
                self.assertFalse(ops.live)
                self.assertNotIn('canary', owner.encoded(value).decode())

    def test_kill_pidfd_fallback_and_reap_faults_preserve_first_failure(self):
        for kind in ('pidfd', 'fd_kill', 'kill', 'wait', 'wait-timeout', 'pause'):
            ops = SimOps(kind, persistent=True)
            ops.output = [b'x' * 513]
            if kind == 'pause':
                original_wait = ops.wait
                waits = []
                def wait(pid, flags):
                    waits.append(pid)
                    return (0, 0) if len(waits) == 1 else original_wait(pid, flags)
                ops.wait = wait
            if kind == 'kill':
                ops.fd_kill = Mock(side_effect=OSError())
            value = PROBE['feasibility'](ops)
            with self.subTest(kind=kind):
                self.assertFalse(value['cleanup'])
                self.assertEqual(value['status'], 'failed')
                self.assertEqual(value['firstFailure'], 'retain' if kind == 'pidfd' else 'output')
                if kind in ('pidfd', 'fd_kill', 'kill'):
                    self.assertIn(('kill', 123), ops.calls)
                if kind not in ('wait', 'wait-timeout'):
                    self.assertFalse(ops.live)
                self.assertLess(ops.now, 6)

    def test_clock_fault_after_fork_never_skips_exact_termination_and_reap(self):
        for count in (1, 2, 3):
            ops = SimOps()
            original_clock = ops.clock
            clocks = []
            def clock():
                clocks.append(True)
                if len(clocks) == count:
                    raise OSError('injected bookkeeping clock fault')
                return original_clock()
            ops.clock = clock
            value = PROBE['feasibility'](ops)
            self.assertEqual(value['status'], 'failed')
            self.assertFalse(ops.live)
            self.assertIn(('wait', -1), ops.calls)

    def test_partial_gate_write_and_short_child_result_fail_closed(self):
        for kind in ('gate-short', 'output-empty'):
            ops = SimOps()
            if kind == 'gate-short':
                ops.write = Mock(return_value=0)
            else:
                ops.output = [b'']
            value = PROBE['feasibility'](ops)
            self.assertEqual(value['status'], 'failed')
            self.assertTrue(value['cleanup'])
            self.assertFalse(ops.live)

    def test_deadline_propagates_after_exact_child_cleanup(self):
        ops = SimOps()
        ops.read = Mock(side_effect=PROBE['Deadline']())
        with self.assertRaises(PROBE['Deadline']):
            PROBE['feasibility'](ops)
        self.assertFalse(ops.live)
        self.assertIn(('fd_kill', 99), ops.calls)

    def test_drop_sequence_and_every_drop_operation_fault_are_mocked(self):
        calls = []
        def record(name, value=None):
            calls.append((name, value))
        fake_os = SimpleNamespace(setgroups=lambda v: record('groups', v),
                                  setresgid=lambda *v: record('gid', v),
                                  setresuid=lambda *v: record('uid', v),
                                  getppid=lambda: 123,
                                  getresuid=lambda: (20000,) * 3, getresgid=lambda: (20000,) * 3,
                                  getgroups=lambda: [])
        status = 'CapInh: 0\nCapPrm: 0\nCapEff: 0\nCapBnd: 0\nCapAmb: 0\nNoNewPrivs: 1\n'
        ops = PROBE['Ops'].__new__(PROBE['Ops'])
        ops.prctl = lambda op, val: record('prctl', (op, val))
        ops.lib = SimpleNamespace(capset=lambda *_: (record('capset'), 0)[1])
        def text(path, limit):
            return '1\n' if path.endswith('cap_last_cap') else status
        with patch.dict(PROBE, os=fake_os, text=text):
            ops.drop(123)
        self.assertEqual(calls[:7], [('prctl', (24, 0)), ('prctl', (24, 1)), ('prctl', (47, 4)),
                                     ('prctl', (38, 1)), ('groups', []), ('gid', (20000,) * 3), ('uid', (20000,) * 3)])
        self.assertEqual(calls[7:9], [('prctl', (4, 0)), ('prctl', (1, signal.SIGKILL))])
        operations = len(calls)
        for failure_at in range(operations):
            counter = 0
            def fail(name, value=None):
                nonlocal counter
                index = counter
                counter += 1
                if index == failure_at:
                    raise OSError('injected drop failure')
            with patch.dict(PROBE, os=fake_os, text=text):
                # Closures above retain record from this function; bind explicit adapters.
                fake_os.setgroups = lambda v: fail('groups', v)
                fake_os.setresgid = lambda *v: fail('gid', v)
                fake_os.setresuid = lambda *v: fail('uid', v)
                ops.prctl = lambda op, val: fail('prctl', (op, val))
                ops.lib.capset = lambda *_: (fail('capset'), 0)[1]
                with self.subTest(failure_at=failure_at), self.assertRaises(OSError):
                    ops.drop(123)

    def test_failed_capset_identity_caps_nnp_and_parent_death_never_pass(self):
        good = 'CapInh: 0\nCapPrm: 0\nCapEff: 0\nCapBnd: 0\nCapAmb: 0\nNoNewPrivs: 1\n'
        for kind in ('capset', 'uid', 'gid', 'groups', 'parent', 'capabilities', 'nnp', 'last-cap', 'read'):
            fake_os = SimpleNamespace(setgroups=Mock(), setresgid=Mock(), setresuid=Mock(),
                                      getppid=lambda: 1 if kind == 'parent' else 123,
                                      getresuid=lambda: (0,) * 3 if kind == 'uid' else (20000,) * 3,
                                      getresgid=lambda: (0,) * 3 if kind == 'gid' else (20000,) * 3,
                                      getgroups=lambda: [0] if kind == 'groups' else [])
            ops = PROBE['Ops'].__new__(PROBE['Ops'])
            ops.prctl = Mock()
            ops.lib = SimpleNamespace(capset=Mock(return_value=-1 if kind == 'capset' else 0))
            def text(path, limit):
                if kind == 'read':
                    raise OSError()
                if path.endswith('cap_last_cap'):
                    return '64' if kind == 'last-cap' else '0'
                return good.replace('CapEff: 0', 'CapEff: 1') if kind == 'capabilities' else good.replace('NoNewPrivs: 1', 'NoNewPrivs: 0') if kind == 'nnp' else good
            with patch.dict(PROBE, os=fake_os, text=text), self.subTest(kind=kind), self.assertRaises((PROBE['Fault'], OSError)):
                ops.drop(123)

    def test_child_arms_independent_bound_parentdeath_and_checks_gate_before_drop(self):
        fake_signal = SimpleNamespace(**{k: getattr(signal, k) for k in ('SIGALRM', 'SIG_DFL', 'ITIMER_REAL', 'SIG_SETMASK', 'SIGKILL')},
                                      pthread_sigmask=Mock(), signal=Mock(), setitimer=Mock())
        fake_resource = SimpleNamespace(RLIMIT_CORE=resource_value('RLIMIT_CORE'), RLIMIT_CPU=resource_value('RLIMIT_CPU'), setrlimit=Mock())
        fake_os = SimpleNamespace(getppid=lambda: 123)
        ops = PROBE['Ops'].__new__(PROBE['Ops'])
        ops.prctl, ops.drop, ops.poll = Mock(), Mock(), Mock(return_value=True)
        ops.read, ops.close, ops.write = Mock(return_value=b'G'), Mock(), Mock(side_effect=lambda _, raw: len(raw))
        with patch.dict(PROBE, os=fake_os, signal=fake_signal, resource=fake_resource,
                        ns_fact=lambda _: reply()['facts']['namespaceProbe']['net']):
            ops.child(10, 13, 123)
        fake_signal.setitimer.assert_called_once_with(signal.ITIMER_REAL, 2)
        ops.prctl.assert_called_once_with(1, signal.SIGKILL)
        ops.drop.assert_called_once_with(123)
        for kind in ('mask', 'alarm', 'rlimit', 'pdeath', 'parent', 'poll', 'read', 'gate-close', 'drop', 'namespace', 'write', 'short-write', 'output-close'):
            ops.prctl, ops.drop, ops.poll = Mock(), Mock(), Mock(return_value=True)
            ops.read, ops.close, ops.write = Mock(return_value=b'G'), Mock(), Mock(side_effect=lambda _, raw: len(raw))
            fake_signal.pthread_sigmask, fake_signal.setitimer = Mock(), Mock()
            fake_resource.setrlimit = Mock()
            fake_os.getppid = lambda: 1 if kind == 'parent' else 123
            ns = Mock(return_value=reply()['facts']['namespaceProbe']['net'])
            target = {'mask': fake_signal.pthread_sigmask, 'alarm': fake_signal.setitimer,
                      'rlimit': fake_resource.setrlimit, 'pdeath': ops.prctl, 'poll': ops.poll,
                      'read': ops.read, 'drop': ops.drop, 'namespace': ns, 'write': ops.write}.get(kind)
            if target:
                target.side_effect = OSError()
            if kind == 'short-write':
                ops.write.side_effect = None
                ops.write.return_value = 0
            if kind in ('gate-close', 'output-close'):
                ops.close.side_effect = OSError() if kind == 'gate-close' else [None, OSError()]
            with patch.dict(PROBE, os=fake_os, signal=fake_signal, resource=fake_resource, ns_fact=ns), self.subTest(kind=kind), self.assertRaises((PROBE['Fault'], OSError)):
                ops.child(10, 13, 123)
            if kind in ('mask', 'alarm', 'rlimit', 'pdeath', 'parent', 'poll', 'read', 'gate-close'):
                ops.drop.assert_not_called()


def resource_value(name):
    import resource
    return getattr(resource, name)


class OrdinaryOps(PROBE['Ops']):
    """Real parent custody of an ORDINARY stand-in; never calls guest child/drop."""
    def __init__(self, mode):
        self.mode, self.opens = mode, 0

    def clock(self):
        return time.monotonic() * 30  # fixture-only .1s output / .067s cleanup

    def poll(self, fd, seconds):
        import select
        return bool(select.select([fd], [], [], min(seconds, .002))[0])

    def child(self, gate, output, parent):
        import select
        if not select.select([gate], [], [], .2)[0] or os.read(gate, 2) != b'G':
            os._exit(3)
        os.close(gate)
        if self.mode in ('timeout', 'broken-cleanup'):
            time.sleep(8)  # independent supervisor owns this ordinary Python child
        os.write(output, owner.encoded({k: reply()['facts']['namespaceProbe'][k] for k in ('net', 'pid')}))
        os.close(output)

    def pidfd(self, pid):
        self.opens += 1
        if self.mode == 'retain' and self.opens == 1:
            raise OSError('injected post-fork bookkeeping')
        return os.pidfd_open(pid)

    def fd_kill(self, fd, sig):
        if self.mode != 'broken-cleanup':
            signal.pidfd_send_signal(fd, sig)

    def kill(self, pid, sig):
        if self.mode != 'broken-cleanup':
            os.kill(pid, sig)

    def wait(self, pid, flags):
        if self.mode == 'broken-cleanup':
            raise ChildProcessError()  # deliberate false implementation report
        return os.waitpid(pid, flags)


def supervise_ordinary(mode):
    # The already-reviewed fixture supervisor uses its OWN libc/pidfd/children/
    # ECHILD cleanup, never the feasibility adapter or owner's cleanup helpers.
    guard = native.FixtureGuard()
    code = None
    with tempfile.TemporaryFile() as output:
        def work():
            if mode == 'inventory-guardian':
                with tempfile.TemporaryDirectory() as directory:
                    root = Path(directory)
                    prepare(root)
                    lease = reserved(root)
                    try:
                        value = owner.run_guarded(lease, lambda held, check: FakeLab(held, check))
                    finally:
                        lease.close()
            else:
                value = PROBE['feasibility'](OrdinaryOps(mode))
            output.write(owner.encoded(value))
            output.flush()
        try:
            signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(native.FixtureExpired()))
            signal.setitimer(signal.ITIMER_REAL, 1)
            pid = guard.spawn(work)
            end = time.monotonic() + 1
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
        print(json.dumps({'result': value, 'independentAbsence': absent, 'signalled': guard.signalled}))


class OrdinaryProcesses(unittest.TestCase):
    def fixture(self, mode):
        child = subprocess.run([sys.executable, '-B', str(Path(__file__).resolve()), '--ordinary-fixture', mode],
                               stdin=subprocess.DEVNULL, capture_output=True, env=native.FIXTURE_ENV,
                               timeout=5, check=True)
        value = json.loads(child.stdout)
        self.assertTrue(value['independentAbsence'])
        return value

    def test_existing_real_guardian_relays_inventory_reply_without_native_dispatch(self):
        value = self.fixture('inventory-guardian')
        self.assertEqual(value['result']['status'], 'completed')
        self.assertEqual(value['result']['inventoryReply'], reply())
        inventory.InventoryReservation.validate_reply(value['result'])

    def test_real_ordinary_success_gate_and_output_reap(self):
        value = self.fixture('success')
        self.assertEqual(value['result']['status'], 'observed')
        self.assertTrue(value['result']['cleanup'])

    def test_real_ordinary_postfork_retention_failure_cannot_release_job(self):
        value = self.fixture('retain')
        self.assertEqual(value['result']['firstFailure'], 'retain')
        self.assertEqual(value['result']['status'], 'failed')

    def test_real_ordinary_timeout_terminates_exact_child(self):
        value = self.fixture('timeout')
        self.assertEqual(value['result']['firstFailure'], 'output')
        self.assertTrue(value['result']['cleanup'])

    def test_independent_custody_still_reaps_when_implementation_claims_false_absence(self):
        value = self.fixture('broken-cleanup')
        self.assertTrue(value['result']['cleanup'])  # deliberately broken adapter
        self.assertGreaterEqual(value['signalled'], 1)


class FixedAdapter(unittest.TestCase):
    def test_readiness_retries_only_fixed_true_and_closed_empty_output(self):
        lease = SimpleNamespace(pin={'guestAccount': 'synthetic', 'guestPrivilege': 'sudo-noninteractive'}, check=Mock())
        lab = inventory.InventoryLab(lease, {})
        lab.children = SimpleNamespace(run=Mock(side_effect=[(255, b''), (0, b'')]))
        with patch.object(owner.time, 'sleep'):
            lab.ready(owner.Budget(120))
        self.assertEqual(lab.children.run.call_count, 2)
        for args in lab.children.run.call_args_list:
            self.assertEqual(args.args[0], inventory.inventory_argv(lease.pin, True))
            self.assertLessEqual(args.args[1].remaining(), 8)
        for code, raw in ((0, b'extra'), (255, b'extra'), (1, b'')):
            lab.children.run = Mock(return_value=(code, raw))
            with self.assertRaises(owner.Rejected):
                lab.ready(owner.Budget(120))
            lab.children.run.assert_called_once()

    def test_job_dispatch_is_fixed_once_and_capped_at_thirty(self):
        lease = SimpleNamespace(pin={'guestAccount': 'root', 'guestPrivilege': 'root'}, check=Mock(), intent=Mock())
        lab = inventory.InventoryLab(lease, {})
        lab.children = SimpleNamespace(run=Mock(return_value=(0, b'')))
        with patch.object(lab, 'check_sources') as checked:
            lab.dispatch(owner.Budget(360))
            checked.assert_called_once()
        lease.intent.assert_called_once_with('mayHaveDispatched')
        args = lab.children.run.call_args.args
        self.assertEqual(args[0], inventory.inventory_argv(lease.pin))
        self.assertLessEqual(args[1].remaining(), 30)
        with self.assertRaisesRegex(owner.Rejected, 'reservation'):
            lab.dispatch(owner.Budget(360))
        lab.children.run.assert_called_once()

    def test_source_mutation_blocks_start_and_dispatch_before_any_client(self):
        for op in ('start', 'dispatch'):
            pin = {'ownerSha256': '1' * 64, 'inventoryOwnerSha256': '5' * 64,
                   'inventoryProbeSha256': inventory.PROBE_SHA256}
            lease = SimpleNamespace(pin=pin, check=Mock(), intent=Mock())
            lab = inventory.InventoryLab(lease, {})
            lab.children = SimpleNamespace(run=Mock())
            with patch.object(inventory, 'source_pins', return_value=('0' * 64, '5' * 64, inventory.PROBE_SHA256, {})), self.assertRaisesRegex(owner.Rejected, 'custody'):
                if op == 'start':
                    lab.command('start', owner.Budget(120))
                else:
                    lab.dispatch(owner.Budget(30))
            lab.children.run.assert_not_called()

    def test_route_identity_mismatch_and_native_wrapper_reply_never_validate(self):
        lab = inventory.InventoryLab(SimpleNamespace(pin={'guestPrivilege': 'root'}), {})
        with self.assertRaises(owner.Rejected):
            lab.validate_job_reply(owner.encoded(reply()), 0, {})
        value = reply()
        value['facts']['identity']['sudoIdentity'] = 'absent'
        result = {}
        self.assertTrue(lab.validate_job_reply(owner.encoded(value), 0, result))
        self.assertEqual(result['inventoryReply'], value)
        with self.assertRaises(owner.Rejected):
            lab.validate_job_reply(owner.encoded(native.wrapper()), 0, {})

    def test_complete_fixed_adapter_reuses_cleanup_under_inventory_authority_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            prepare(root)
            lease = reserved(root)
            obj, inv = native.inspect_fixture()
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
                    if argv == inventory.inventory_argv(lease.pin, True):
                        calls.append('true')
                        return 0, b''
                    if argv == inventory.inventory_argv(lease.pin):
                        lease.intent('mayHaveDispatched')
                        calls.append('inventory')
                        return 0, owner.encoded(reply())
                    if argv == owner.transport_argv(lease.pin, 'poweroff') and capture_stderr:
                        lease.intent('mayHaveStarted')
                        calls.append('poweroff')
                        obj[0]['State'] = copy.deepcopy(native.STOPPED)
                        return 0, b'', b''
                    raise AssertionError('unreviewed command')
                def reap(self, budget):
                    return True
            lab = inventory.InventoryLab(lease, inv)
            lab.children = Client()
            try:
                with patch.object(lab, 'check_sources'), patch.object(owner.NativeLab, 'ready', side_effect=AssertionError('native readiness')), patch.object(owner.NativeLab, 'dispatch', side_effect=AssertionError('native job')):
                    result = owner.transact(lease, lab)
                self.assertEqual(result['status'], 'completed')
                self.assertEqual(calls, ['inspect', 'start', 'true', 'inventory', 'inspect', 'inspect', 'poweroff', 'inspect'])
                self.assertNotIn('guestPrerequisitesReviewed', lease.pin)
            finally:
                lease.close()

    def test_inventory_poweroff_denial_retains_dirty_custody_and_first_failure(self):
        fixture = native.Cleanup()
        fixture.setUp()
        try:
            lab = fixture.make_lab([native.RUNNING, native.RUNNING, native.STOPPED], reply=(1, b'', b'sudo: denied'))
            lab.__class__ = inventory.InventoryLab
            lab.lease.pin.pop('guestPrerequisitesReviewed')
            lab.lease.pin['inventoryAuthorityReviewed'] = True
            self.assertEqual(lab.cleanup(owner.Budget(45)), ('poweroff', True, True, True))
            self.assertEqual(lab.calls.count('poweroff'), 1)
        finally:
            fixture.doCleanups()


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--ordinary-fixture':
        supervise_ordinary(sys.argv[2])
    else:
        unittest.main()
