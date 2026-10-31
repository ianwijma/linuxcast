"""OFFLINE SIMULATION ONLY. No namespace, elevation, native or guest invocation.

Pure plans plus synthetic syscall/process adapters and private temporary files.
Patching a Python object is test injection; the real CLI has no test switch.
"""
import ast
import copy
import importlib
import io
import json
import os
from pathlib import Path
import signal
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import lab_namespace as lab


class Adapter:
    def __init__(self, fail=None, cleanup=True):
        self.calls = []
        self.fail = fail
        self.clean = cleanup

    def __getattr__(self, name):
        if name not in lab.STEPS:
            raise AttributeError(name)

        def operation():
            self.calls.append(name)
            if name == self.fail:
                raise RuntimeError('private canary /secret/AT-content')
            return {'status': 'observed-private-sequence', 'firstFailure': 'none', 'failedStep': 'none', 'cleanup': True} if name == 'report' else None
        return operation

    def cleanup(self):
        self.calls.append('cleanup')
        if self.clean == 'raise':
            raise RuntimeError('private cleanup canary')
        return self.clean


class Plans(unittest.TestCase):
    def test_import_does_not_construct_or_run_any_real_adapter(self):
        with patch('os.fork') as fork, patch('ctypes.CDLL') as lib, patch('os.open') as opened:
            importlib.reload(lab)
        fork.assert_not_called()
        lib.assert_not_called()
        opened.assert_not_called()

    def test_closed_cli_and_actual_controller_cli(self):
        self.assertEqual(lab.CONTROLLER_ARGV[:4], ('/usr/bin/python3', '-I', '-B', '-c'))
        tree = ast.parse(lab.BOOTSTRAP)
        assignments = [n for n in tree.body if isinstance(n, ast.Assign)]
        argv = ast.literal_eval(assignments[0].value)
        self.assertEqual(argv, [lab.CONTROLLER, '--reviewed-controller', '--staging', str(lab.STAGING),
                               '--node', str(lab.NODE), '--new-evidence', '/output/controller', '--display', '193'])
        self.assertEqual(set(lab.ENV), {'PATH', 'LANG', 'LC_ALL', 'HOME', 'TMPDIR', 'XDG_RUNTIME_DIR', 'DBUS_SYSTEM_BUS_ADDRESS'})
        self.assertEqual(lab.ENV['PATH'], '/usr/bin:/bin')
        for args in ([], ['--reviewed-wrapper'], ['--reviewed-controller'],
                     ['--reviewed-wrapper', '--reviewed-controller', '--command', '/bin/sh'],
                     ['--reviewed-wrapper', '--reviewed-controller', '--node', '/home/node'],
                     ['--reviewed-wrapper', '--reviewed-controller', '--reviewed-w']):
            with self.subTest(args=args), patch.object(lab, 'Guest') as guest, patch('sys.stderr'):
                with self.assertRaises(SystemExit):
                    lab.main(args)
                guest.assert_not_called()

    def test_cli_rejection_never_echoes_arbitrary_arguments(self):
        output = io.StringIO()
        with patch('sys.stderr', output), patch.object(lab, 'Guest') as guest:
            with self.assertRaises(SystemExit) as error:
                lab.main(['--reviewed-wrapper', '--reviewed-controller', '--secret', 'private canary'])
        self.assertEqual(error.exception.code, 3)
        self.assertNotIn('canary', output.getvalue())
        self.assertNotIn('--secret', output.getvalue())
        guest.assert_not_called()

    def test_coherent_mounts_preserve_pid_and_absolute_receipt_paths(self):
        plan = lab.mount_plan()
        self.assertEqual([m.source for m in plan if m.target == '/sys'], ['sysfs'])
        self.assertEqual([m.source for m in plan if m.target == '/proc'], ['proc'])
        self.assertTrue(all(m.flags & lab.RDONLY for m in plan if m.target in ('/sys', '/proc', '/usr', str(lab.STAGING), str(lab.BASE / 'node'))))
        stage = next(m for m in plan if m.target == str(lab.STAGING))
        self.assertEqual(stage.target, stage.source)
        writable = {m.target for m in plan if not m.flags & lab.RDONLY}
        self.assertEqual(writable, {'/tmp', '/run', '/home/at', '/dev/shm', '/output'})
        self.assertTrue(all(not m.flags & lab.REC for m in plan))
        self.assertEqual({m.target for m in plan if m.target.startswith('/dev/') and m.kind == 'bind'},
                         {'/dev/null', '/dev/zero', '/dev/random', '/dev/urandom'})
        kernel = Mock()
        setup = lab.Setup(SimpleNamespace(kernel=kernel, root_name='synthetic'))
        setup.unshare()
        kernel.call.assert_called_once_with('unshare', lab.NEWNS | lab.NEWNET | lab.NEWIPC | lab.NEWUTS)
        self.assertFalse(kernel.call.call_args.args[1] & 0x20000000)  # no NEWPID
        setup.private()
        kernel.mount.assert_called_once_with('', '/', '', lab.PRIVATE | lab.REC)

    def test_bind_is_nonrecursive_and_explicitly_remounted_readonly(self):
        kernel = Mock()
        setup = lab.Setup(SimpleNamespace(kernel=kernel, root_name='synthetic'))
        setup.binds()
        self.assertEqual(len(kernel.mount.call_args_list), 10)
        for first, second in zip(kernel.mount.call_args_list[::2], kernel.mount.call_args_list[1::2]):
            self.assertEqual(first.args[3], lab.BIND)
            self.assertEqual(second.args[3] & (lab.REMOUNT | lab.BIND | lab.RO), lab.REMOUNT | lab.BIND | lab.RO)
        setup.proc()
        setup.sys()
        self.assertEqual(kernel.mount.call_args.args[2], 'sysfs')
        self.assertTrue(kernel.mount.call_args.args[3] & lab.RDONLY)

    def test_layout_only_touches_private_fresh_root_and_fails_on_existing(self):
        with tempfile.TemporaryDirectory() as temporary:
            setup = lab.Setup(SimpleNamespace(kernel=Mock(), root_name='synthetic'))
            setup.root_path = Path(temporary)
            setup.layout()
            self.assertFalse((Path(temporary) / 'etc/shadow').exists())
            self.assertEqual((Path(temporary) / 'bin').readlink(), Path('usr/bin'))
            self.assertIn('type null', (Path(temporary) / 'etc/asound.conf').read_text())
            self.assertFalse((Path(temporary) / 'dev/input').exists())
            for p in (Path(temporary) / 'etc').iterdir():
                self.assertEqual(stat.S_IMODE(p.stat().st_mode), 0o555 if p.is_dir() else 0o444)
            with self.assertRaises(FileExistsError):
                setup.layout()

    def test_worker_failure_after_every_setup_step_stops_without_fallback(self):
        for step in lab.SETUP:
            with self.subTest(step=step):
                calls = []
                setup = Mock()
                for name in lab.SETUP:
                    def action(n=name):
                        calls.append(n)
                        if n == step:
                            raise lab.Rejected('setup')
                    getattr(setup, name).side_effect = action
                with patch.object(lab, 'Setup', return_value=setup), patch('os.umask'):
                    with self.assertRaises(lab.Rejected):
                        lab.worker(object())
                self.assertEqual(calls, list(lab.SETUP[:lab.SETUP.index(step) + 1]))

    def test_fixed_loopback_ioctl_never_spawns_a_command(self):
        sock = Mock()
        sock.fileno.return_value = 42
        context = Mock()
        context.__enter__ = Mock(return_value=sock)
        context.__exit__ = Mock(return_value=False)
        import struct
        with patch('socket.socket', return_value=context), patch('fcntl.ioctl', return_value=struct.pack('16sH22x', b'lo', 8)) as ioctl:
            lab.Setup(SimpleNamespace(kernel=Mock(), root_name='synthetic')).loopback()
        self.assertEqual([call.args[1] for call in ioctl.call_args_list], [0x8913, 0x8914])
        self.assertEqual(struct.unpack('16sH22x', ioctl.call_args.args[2]), (b'lo\0' + b'\0' * 13, 9))


class Validation(unittest.TestCase):
    def permit(self):
        facts = {'os': ('debian', '13', 'x86_64'), 'uids': (0, 0, 0), 'gids': (0, 0, 0),
                 'dedicatedUidIdle': True, 'vendor': 'QEMU', 'product': 'Standard PC (Q35 + ICH9, 2009)',
                 'machineId': b'public synthetic machine', 'productUuid': b'public synthetic uuid', 'sameInitialNamespaces': True}
        permit = {'schema': 1, 'sourceTree': lab.APPROVED_TREE, 'archiveSha256': 'a' * 64,
                  'machineIdSha256': lab.sha(facts['machineId']), 'productUuidSha256': lab.sha(facts['productUuid']),
                  'receiptSha256': 'b' * 64, 'nodeSha256': 'c' * 64, 'wrapperSha256': 'd' * 64}
        return permit, facts

    def test_guest_root_and_identity_requirements_no_host_fallback(self):
        permit, facts = self.permit()
        self.assertEqual(lab.validate_permit(permit, facts), permit)
        for key, bad in (('os', ('ubuntu', '22.04', 'x86_64')), ('os', ('debian', '13', 'aarch64')),
                         ('uids', (1000,) * 3), ('uids', (0, 1000, 0)), ('gids', (0, 0, 1000)),
                         ('dedicatedUidIdle', False), ('dedicatedUidIdle', 1), ('vendor', 'host'),
                         ('product', 'Laptop'), ('machineId', b'other'), ('productUuid', b'other'),
                         ('sameInitialNamespaces', False)):
            with self.subTest(key=key, bad=bad), self.assertRaises(lab.Rejected):
                lab.validate_permit(permit, {**facts, key: bad})

    def test_permit_rejects_unapproved_tree_missing_and_unknown_pins(self):
        permit, facts = self.permit()
        for key in permit:
            changed = {**permit}
            del changed[key]
            with self.subTest(missing=key), self.assertRaises(lab.Rejected):
                lab.validate_permit(changed, facts)
        for changes in ({'sourceTree': '6176bdd039c68324538d2f3e60414b7c6ae1edc1'}, {'schema': True},
                        {'nodeSha256': 'C' * 64}, {'receiptSha256': '../private'}, {'command': '/bin/sh'}):
            with self.subTest(changes=changes), self.assertRaises(lab.Rejected):
                lab.validate_permit({**permit, **changes}, facts)

    def test_path_metadata_rejects_foreign_writable_special_and_linked(self):
        def info(mode=stat.S_IFREG | 0o444, uid=20000, links=1):
            return SimpleNamespace(st_mode=mode, st_uid=uid, st_nlink=links)
        lab.check_info(info(), 20000, single=True)
        for item in (info(uid=1000), info(mode=stat.S_IFLNK | 0o444), info(mode=stat.S_IFIFO | 0o444),
                     info(mode=stat.S_IFREG | 0o644), info(links=2), info(mode=stat.S_IFREG | 0o444 | stat.S_ISUID)):
            with self.assertRaises(lab.Rejected):
                lab.check_info(item, 20000, single=True)

    def test_no_follow_descriptor_staging_receipt_and_infrastructure_pins(self):
        with tempfile.TemporaryDirectory() as temporary, patch.object(lab, 'UID', os.getuid()):
            root = Path(temporary)
            directory = root / 'apps/desktop/tests/at'
            directory.mkdir(parents=True)
            files = {}
            for name in ('product_staging.py', 'controller_protocol.py', 'session_owner.py', 'product_controller.py'):
                path = directory / name
                path.write_bytes(b'# public inert fixture\n')
                files[str(path.relative_to(root))] = lab.sha(path.read_bytes())
            permit, _ = self.permit()
            receipt = {'schema': 1, 'sourceTree': lab.APPROVED_TREE, 'archiveSha256': permit['archiveSha256'],
                       'nodeSha256': permit['nodeSha256'], 'files': files}
            raw = json.dumps(receipt).encode()
            (root / 'f102-build-receipt.json').write_bytes(raw)
            permit['receiptSha256'] = lab.sha(raw)
            for path in root.rglob('*'):
                path.chmod(0o500 if path.is_dir() else 0o400)
            fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                lab.pinned_infrastructure(fd, permit)
                for pin in ('receiptSha256', 'nodeSha256', 'archiveSha256'):
                    with self.subTest(pin=pin), self.assertRaises(lab.Rejected):
                        lab.pinned_infrastructure(fd, {**permit, pin: 'e' * 64})
                bad = directory / 'product_staging.py'
                bad.chmod(0o600)
                bad.write_bytes(b'# changed fixture')
                bad.chmod(0o400)
                with self.assertRaises(lab.Rejected):
                    lab.pinned_infrastructure(fd, permit)
                directory.chmod(0o700)
                bad.unlink()
                bad.symlink_to('/etc/passwd')
                directory.chmod(0o500)
                with self.assertRaises(OSError):
                    lab.staged_file(fd, 'apps/desktop/tests/at/product_staging.py', 1024)
                for relative in ('../escape', '/etc/passwd', 'apps//x', 'apps/./x'):
                    with self.subTest(relative=relative), self.assertRaises(lab.Rejected):
                        lab.staged_file(fd, relative, 1024)
                with self.assertRaises(lab.Rejected):
                    lab.staged_file(fd, 'f102-build-receipt.json', 1)
            finally:
                os.close(fd)
                for path in root.rglob('*'):
                    if not path.is_symlink():
                        path.chmod(0o700 if path.is_dir() else 0o600)

    def test_duplicate_json_and_oversize_rejected(self):
        for raw in (b'{"schema":1,"schema":1}', b' ' * 65537):
            with self.assertRaises(lab.Rejected):
                lab.unique_json(raw)

    def test_preexisting_or_foreign_paths_never_chmod_or_delete(self):
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary)
            foreign = parent / 'foreign'
            foreign.mkdir()
            (foreign / 'public').write_text('untouched')
            g = lab.Guest()
            g.basefd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY)
            g.root_name = 'foreign'
            g.root_identity = (0, 0, 0, 0, 0)
            try:
                with self.assertRaises(lab.Rejected), patch.object(lab, 'remove_tree_at') as remove:
                    g.remove_owned()
                remove.assert_not_called()
                self.assertEqual((foreign / 'public').read_text(), 'untouched')
            finally:
                os.close(g.basefd)

    def test_root_ancestor_walk_refuses_relative_traversal_and_foreign_paths(self):
        for path in ('relative', '/opt/../etc/passwd'):
            with self.subTest(path=path), self.assertRaises(lab.Rejected):
                lab.open_chain(path)
        with tempfile.TemporaryDirectory() as temporary:
            link = Path(temporary) / 'link'
            link.symlink_to('/etc/passwd')
            # /tmp is deliberately an unsafe ancestor regardless of the leaf.
            with self.assertRaises(lab.Rejected):
                lab.open_chain(link)


class Lifetimes(unittest.TestCase):
    def test_positive_and_failure_after_each_acquisition_always_cleanup(self):
        good = Adapter()
        result = lab.transact(good)
        self.assertEqual(good.calls, [*lab.STEPS, 'cleanup'])
        self.assertEqual((result['firstFailure'], result['cleanup']), ('none', True))
        self.assertEqual(result['outerLabCleanup'], 'outstanding')
        for step in lab.STEPS:
            with self.subTest(step=step):
                adapter = Adapter(step)
                result = lab.transact(adapter)
                self.assertEqual(adapter.calls, [*lab.STEPS[:lab.STEPS.index(step) + 1], 'cleanup'])
                self.assertEqual((result['firstFailure'], result['failedStep']), ('setup', step))
                self.assertNotIn('canary', json.dumps(result))
                self.assertEqual(result['controllerMayHaveRun'], lab.STEPS.index(step) >= lab.STEPS.index('release'))

    def test_cleanup_failure_and_unknown_preserve_first_failure(self):
        for state in (False, None, 'raise', 1):
            with self.subTest(state=state):
                value = lab.transact(Adapter('admit', state))
                self.assertEqual((value['firstFailure'], value['failedStep'], value['cleanup']), ('setup', 'admit', False))
                self.assertEqual(lab.transact(Adapter(cleanup=state))['firstFailure'], 'cleanup')

    def test_fixed_reasons_including_interrupt_and_timeout(self):
        for reason in lab.REASONS - {'none'}:
            adapter = Adapter()
            adapter.start = Mock(side_effect=lab.Rejected(reason))
            value = lab.transact(adapter)
            self.assertEqual(value['firstFailure'], reason)
            self.assertTrue(value['cleanup'])
        for error in (KeyboardInterrupt(), FileNotFoundError('missing command'), PermissionError('setup denied')):
            adapter = Adapter()
            adapter.preflight = Mock(side_effect=error)
            result = lab.transact(adapter)
            self.assertEqual(adapter.calls, ['cleanup'])
            self.assertFalse(result['controllerMayHaveRun'])

    def guest(self):
        g = lab.Guest()
        g.pid = 1234
        g.pidfd = 55
        g.cgfd = 44
        g.fds = [44]
        return g

    def test_cleanup_kills_exact_owned_cgroup_and_retained_pid_then_verifies(self):
        g = self.guest()
        with patch.object(g, 'write_cgroup') as kill, patch.object(g, 'cgroup_empty', return_value=True), \
             patch.object(g, 'remove_owned') as remove, patch('os.waitpid', side_effect=ChildProcessError), \
             patch('signal.pidfd_send_signal') as pidkill, patch('os.close') as close, \
             patch('signal.signal'), patch('signal.setitimer'):
            self.assertTrue(g.cleanup())
        kill.assert_called_once_with('cgroup.kill', '1')
        pidkill.assert_called_once_with(55, signal.SIGKILL)
        remove.assert_called_once()
        self.assertEqual([call.args[0] for call in close.call_args_list], [44, 55])

    def test_kill_error_retains_failure_even_when_absence_is_verified(self):
        g = self.guest()
        with patch.object(g, 'write_cgroup', side_effect=OSError), patch.object(g, 'cgroup_empty', return_value=True), \
             patch.object(g, 'remove_owned'), patch('os.waitpid', side_effect=ChildProcessError), \
             patch('signal.pidfd_send_signal'), patch('os.close'), patch('signal.signal'), patch('signal.setitimer'):
            self.assertFalse(g.cleanup())

    def test_gate_close_failure_cannot_skip_owned_cgroup_termination(self):
        g = self.guest()
        g.gate = 42
        def close(fd):
            if fd == 42:
                raise OSError('synthetic close fault')
        with patch.object(g, 'write_cgroup') as kill, patch.object(g, 'cgroup_empty', return_value=True), \
             patch.object(g, 'remove_owned'), patch('os.waitpid', side_effect=ChildProcessError), \
             patch('signal.pidfd_send_signal'), patch('os.close', side_effect=close), \
             patch('signal.signal'), patch('signal.setitimer'):
            self.assertFalse(g.cleanup())
        kill.assert_called_once_with('cgroup.kill', '1')

    def test_unknown_or_populated_cgroup_preserved_without_name_sweep(self):
        for fault in (True, False):
            g = self.guest()
            with self.subTest(fault=fault), patch.object(g, 'write_cgroup'), \
                 patch.object(g, 'cgroup_empty', side_effect=PermissionError if fault else None, return_value=False), \
                 patch.object(g, 'remove_owned') as remove, patch('os.waitpid', side_effect=ChildProcessError), \
                 patch('signal.pidfd_send_signal'), patch('os.close'), patch('signal.signal'), patch('signal.setitimer'), \
                 patch('time.monotonic', side_effect=[0, 9]):
                self.assertFalse(g.cleanup())
                remove.assert_not_called()

    def test_pidfd_acquisition_failure_still_retains_pid_for_exact_kill(self):
        g = self.guest()
        g.pidfd = None
        with patch.object(g, 'write_cgroup'), patch.object(g, 'cgroup_empty', return_value=True), \
             patch.object(g, 'remove_owned'), patch('os.waitpid', side_effect=ChildProcessError), \
             patch('os.kill') as kill, patch('os.close'), patch('signal.signal'), patch('signal.setitimer'):
            self.assertTrue(g.cleanup())
        kill.assert_called_once_with(1234, signal.SIGKILL)

    def test_setup_fault_before_fork_never_reaps_unowned_children(self):
        g = lab.Guest()
        with patch('os.waitpid') as wait, patch('signal.signal'), patch('signal.setitimer'):
            self.assertTrue(g.cleanup())
        wait.assert_not_called()

    def test_foreign_replacement_and_unverified_output_are_preserved(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            base = root / 'owned'
            base.mkdir()
            (base / 'root').mkdir()
            (base / 'output').mkdir()
            g = lab.Guest()
            g.basefd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            g.rootfd = os.open(base, os.O_RDONLY | os.O_DIRECTORY)
            g.root_name = 'owned'
            g.root_identity = lab.identity(base.stat())
            g.out_identity = (0, 0, 0, 0, 0)
            try:
                with self.assertRaises(lab.Rejected):
                    g.remove_owned()
                self.assertTrue((base / 'output').is_dir())
            finally:
                os.close(g.basefd)
                os.close(g.rootfd)

    def test_owned_temp_output_cleanup_does_not_follow_external_symlinks(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            sentinel = base / 'foreign-public'
            sentinel.write_text('preserved')
            owned = base / 'owned'
            (owned / 'output').mkdir(parents=True)
            (owned / 'root').mkdir()
            (owned / 'output/alias').symlink_to(sentinel)
            g = lab.Guest()
            g.basefd = os.open(base, os.O_RDONLY | os.O_DIRECTORY)
            g.rootfd = os.open(owned, os.O_RDONLY | os.O_DIRECTORY)
            g.root_name = 'owned'
            g.root_identity = lab.identity(owned.stat())
            g.out_identity = lab.identity((owned / 'output').stat())
            try:
                with patch.object(lab, 'UID', os.getuid()):
                    g.remove_owned()
                self.assertFalse(owned.exists())
                self.assertEqual(sentinel.read_text(), 'preserved')
            finally:
                os.close(g.basefd)
                os.close(g.rootfd)

    def test_closed_public_projection_and_incomplete_is_never_success(self):
        from controller_protocol import Report
        value = Report().public()
        self.assertEqual(lab.project_report(value, 3)['status'], 'incomplete')
        for changed in ({**value, 'status': 'private canary'}, {**value, 'extra': '/secret'},
                        {**value, 'nativeRuns': True}, {**value, 'status': 'observed-private-sequence'}):
            with self.assertRaises(lab.Rejected):
                lab.project_report(changed, 0)
        adapter = Adapter()
        adapter.report = Mock(return_value={'status': 'incomplete', 'firstFailure': 'orca', 'failedStep': 'result', 'cleanup': False})
        result = lab.transact(adapter)
        self.assertEqual(result['firstFailure'], 'controller')
        self.assertEqual((result['controllerFirstFailure'], result['controllerFailedStep'], result['controllerCleanup']), ('orca', 'result', False))


class FaultBoundaries(unittest.TestCase):
    def test_node_must_be_readonly_root_owned_executable_amd64_elf(self):
        header = bytearray(64)
        header[:6] = b'\x7fELF\x02\x01'
        header[18:20] = (62).to_bytes(2, 'little')
        info = SimpleNamespace(st_mode=stat.S_IFREG | 0o555, st_uid=0, st_nlink=1)
        lab.validate_node_header(header, info)
        for changed in (bytes(64), header[:4], header[:18] + b'\xb7\x00' + header[20:]):
            with self.subTest(changed=changed), self.assertRaises(lab.Rejected):
                lab.validate_node_header(changed, info)
        for attributes in ({'st_uid': lab.UID}, {'st_mode': stat.S_IFREG | 0o755},
                           {'st_mode': stat.S_IFREG | 0o550}, {'st_nlink': 2}):
            with self.subTest(attributes=attributes), self.assertRaises(lab.Rejected):
                lab.validate_node_header(header, SimpleNamespace(**{**vars(info), **attributes}))

    def test_missing_setup_syscall_never_succeeds_or_exposes_errno_text(self):
        library = Mock()
        library.unshare.return_value = -1
        with patch('ctypes.CDLL', return_value=library):
            kernel = lab.Kernel()
            with self.assertRaisesRegex(lab.Rejected, '^setup$'):
                kernel.call('unshare', 123)
        library.unshare.assert_called_once_with(123)

    def test_mount_faults_stop_at_each_real_plan_operation(self):
        for failure_at in range(1, 11):
            kernel = Mock()
            count = 0
            def mount(*args):
                nonlocal count
                count += 1
                if count == failure_at:
                    raise lab.Rejected('setup')
            kernel.mount.side_effect = mount
            setup = lab.Setup(SimpleNamespace(kernel=kernel, root_name='synthetic'))
            with self.subTest(failure_at=failure_at), self.assertRaises(lab.Rejected):
                setup.binds()
            self.assertEqual(count, failure_at)

    def test_privilege_drop_order_and_bounds_with_no_real_identity_change(self):
        calls = []
        kernel = Mock()
        kernel.prctl.side_effect = lambda *args: calls.append(('prctl', *args))
        guest = SimpleNamespace(kernel=kernel, root_name='synthetic', parent_pid=999)
        with patch.object(Path, 'read_text', return_value='2'), patch('os.setgroups', side_effect=lambda x: calls.append(('groups', x))), \
             patch('os.setresgid', side_effect=lambda *x: calls.append(('gid', *x))), \
             patch('os.setresuid', side_effect=lambda *x: calls.append(('uid', *x))), \
             patch('os.getppid', return_value=999), patch('resource.setrlimit') as limits, patch('os.umask') as mask:
            lab.Setup(guest).drop()
        self.assertEqual(calls[:5], [('prctl', 24, 0), ('prctl', 24, 1), ('prctl', 24, 2), ('prctl', 47, 4), ('prctl', 38, 1)])
        self.assertEqual(calls[5:8], [('groups', []), ('gid', lab.GID, lab.GID, lab.GID), ('uid', lab.UID, lab.UID, lab.UID)])
        self.assertEqual(calls[8:], [('prctl', 4, 0), ('prctl', 1, signal.SIGKILL)])
        self.assertEqual(len(limits.call_args_list), 3)
        mask.assert_called_once_with(0o077)

    def test_root_or_wrong_uid_fails_before_staging_import_or_execution(self):
        setup = lab.Setup(SimpleNamespace(kernel=Mock(), root_name='synthetic'))
        for uids in ((0, 0, 0), (lab.UID, 0, lab.UID), (1000, 1000, 1000)):
            with self.subTest(uids=uids), patch('os.getresuid', return_value=uids), \
                 patch.object(Path, 'read_text') as read, patch('os.execve') as execute:
                with self.assertRaises(lab.Rejected):
                    setup.verify()
                read.assert_not_called()
                execute.assert_not_called()

    def test_proc_pid1_denial_or_same_network_stops_before_any_staging_import(self):
        setup = lab.Setup(SimpleNamespace(kernel=Mock(), root_name='synthetic'))
        status = '\n'.join(key + ': 00000000' for key in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb')) + '\nNoNewPrivs: 1'
        for fault in (True, False):
            with self.subTest(denied=fault), patch('os.getresuid', return_value=(lab.UID,) * 3), \
                 patch('os.getresgid', return_value=(lab.GID,) * 3), patch('os.getgroups', return_value=[]), \
                 patch.object(Path, 'read_text', return_value=status), \
                 patch.object(Path, 'stat', side_effect=PermissionError if fault else None, return_value=SimpleNamespace(st_ino=123)), \
                 patch('os.execve') as execute, patch('product_staging.validate') as validate:
                with self.assertRaises((lab.Rejected, PermissionError)):
                    setup.verify()
                execute.assert_not_called()
                validate.assert_not_called()

    def test_exec_has_no_shell_or_inherited_environment_even_if_unavailable(self):
        setup = lab.Setup(SimpleNamespace(kernel=Mock(), root_name='synthetic'))
        with patch.dict(os.environ, {'SSH_AUTH_SOCK': '/private', 'NODE_OPTIONS': '--inspect', 'DISPLAY': ':0'}), \
             patch('os.execve', side_effect=FileNotFoundError) as execute:
            with self.assertRaises(FileNotFoundError):
                setup.exec()
        execute.assert_called_once_with('/usr/bin/python3', lab.CONTROLLER_ARGV, lab.ENV)
        self.assertNotIn('NODE_OPTIONS', execute.call_args.args[2])
        self.assertNotIn('SSH_AUTH_SOCK', execute.call_args.args[2])

    def test_reservation_collision_does_not_touch_preexisting_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            name = 'linuxcast-f102-ns-' + '00' * 16
            (root / name).mkdir()
            sentinel = root / name / 'public'
            sentinel.write_text('foreign')
            g = lab.Guest()
            g.basefd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                with patch('os.urandom', return_value=bytes(16)), self.assertRaises(FileExistsError):
                    g.reserve()
                with self.assertRaises(lab.Rejected):
                    g.remove_owned()
                self.assertEqual(sentinel.read_text(), 'foreign')
            finally:
                os.close(g.basefd)

    def test_fork_failure_closes_read_end_and_retains_gate_for_cleanup(self):
        g = lab.Guest()
        with patch('os.pipe2', return_value=(41, 42)), patch('os.fork', side_effect=OSError), patch('os.close') as close:
            with self.assertRaises(OSError):
                g.start()
        close.assert_called_once_with(41)
        self.assertEqual(g.gate, 42)
        self.assertIsNone(g.pid)

    def test_post_fork_pidfd_failure_retains_exact_unreaped_child(self):
        g = lab.Guest()
        with patch('os.pipe2', return_value=(41, 42)), patch('os.fork', return_value=1234), \
             patch('os.pidfd_open', side_effect=OSError), patch('os.close'):
            with self.assertRaises(OSError):
                g.start()
        self.assertEqual((g.pid, g.gate, g.pidfd), (1234, 42, None))

    def test_cgroup_admission_must_confirm_exact_child_before_release(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'cgroup.procs').write_text('foreign')
            g = lab.Guest()
            g.pid = 1234
            g.cgfd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                with patch.object(g, 'write_cgroup') as write:
                    with self.assertRaises(lab.Rejected):
                        g.admit()
                write.assert_called_once_with('cgroup.procs', '1234')
                (root / 'cgroup.procs').write_text('1234\n')
                with patch.object(g, 'write_cgroup'):
                    g.admit()
            finally:
                os.close(g.cgfd)

    def test_cgroup_missing_controls_and_symlinks_fail_without_new_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            g = lab.Guest()
            g.cgfd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            sentinel = root / 'public'
            sentinel.write_text('unchanged')
            try:
                with self.assertRaises(FileNotFoundError):
                    g.write_cgroup('pids.max', '256')
                self.assertFalse((root / 'pids.max').exists())
                (root / 'cgroup.kill').symlink_to(sentinel)
                with self.assertRaises(OSError):
                    g.write_cgroup('cgroup.kill', '1')
                self.assertEqual(sentinel.read_text(), 'unchanged')
            finally:
                os.close(g.cgfd)

    def test_cgroup_events_unknown_is_never_empty(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            g = lab.Guest()
            g.cgfd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                for data, expected in (('populated 0\nfrozen 0\n', True), ('populated 1\n', False)):
                    (root / 'cgroup.events').write_text(data)
                    self.assertIs(g.cgroup_empty(), expected)
                for data in ('', 'populated unknown\n', 'private unstructured extra field\n', 'populated 1\npopulated 0\n', 'populated 0\nunknown 0\n'):
                    (root / 'cgroup.events').write_text(data)
                    with self.assertRaises((lab.Rejected, ValueError)):
                        g.cgroup_empty()
            finally:
                os.close(g.cgfd)

    def test_unknown_output_type_and_identity_are_preserved(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            os.mkfifo(root / 'unknown')
            fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                info = (root / 'unknown').lstat()
                with self.assertRaises(lab.Rejected):
                    lab.remove_tree_at(fd, 'unknown', lab.identity(info), os.getuid())
                with self.assertRaises(lab.Rejected):
                    lab.remove_tree_at(fd, 'unknown', (0, 0, 0, 0, 0), os.getuid())
                self.assertTrue((root / 'unknown').exists())
            finally:
                os.close(fd)

    def test_complete_report_requires_all_exact_ordered_step_flags(self):
        from controller_protocol import Report, STEPS, FLAGS, SPEECH_STEPS
        report = Report()
        for step in STEPS:
            report.add(step, {flag: (False if flag == 'completion' else step != 'hide' if flag == 'geometry'
                                   else step in SPEECH_STEPS if flag in ('freshEvent', 'generated', 'attempt') else True) for flag in FLAGS})
        report.native_runs = 1
        report.cleaned = True
        value = report.public()
        self.assertEqual(lab.project_report(value, 0)['status'], 'observed-private-sequence')
        for field, bad in (('id', 'private canary'), ('native', False), ('completion', True), ('generated', 1)):
            changed = copy.deepcopy(value)
            changed['steps'][0][field] = bad
            with self.subTest(field=field), self.assertRaises(lab.Rejected):
                lab.project_report(changed, 0)


if __name__ == '__main__':
    unittest.main()
