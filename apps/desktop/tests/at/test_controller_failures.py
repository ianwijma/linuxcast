"""Operational error boundaries with injected adapters, never a native run."""
import json
import inspect
import copy
import builtins
import ctypes
import importlib
import errno
import fcntl
import os
import stat
from contextlib import ExitStack, contextmanager
from types import SimpleNamespace
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

from controller_protocol import ControllerRejected
from orca_output import OutputRejected
import product_controller as controller


class FakeOwner:
    cleaned = 0
    clean_result = True

    def cleanup(self):
        self.cleaned += 1
        return self.clean_result


class FakeProof:
    uncertain = False

    def close(self):
        pass


class FailureTests(unittest.TestCase):
    def setUp(self):
        self.signals = {sig: signal.getsignal(sig) for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP, signal.SIGALRM)}
        self.addCleanup(lambda: [signal.signal(sig, handler) for sig, handler in self.signals.items()])
        # These older lifecycle fixtures replace preflight entirely and have no
        # inherited proof. Keep their fake custody separate from any host FD3.
        custody = patch.object(controller, 'ProofCustody', return_value=FakeProof())
        custody.start()
        self.addCleanup(custody.stop)

    def test_each_failure_stops_and_cleans_without_publishing_private_payload(self):
        for error, reason in ((ControllerRejected("deadline"), "deadline"), (OutputRejected("private canary"), "orca"),
                              (RuntimeError("private canary"), "prerequisite"), (KeyboardInterrupt(), "prerequisite")):
            with self.subTest(reason=reason), tempfile.TemporaryDirectory() as temporary:
                owner = FakeOwner()

                def fail(*args):
                    report = args[-1]
                    report.failed_step = "result"
                    raise error

                with patch.object(controller, "preflight"), patch.object(controller, "SessionOwner", return_value=owner), \
                     patch.object(controller, "infrastructure", return_value=(None, None)), \
                     patch.object(controller, "sequence", side_effect=fail) as sequence, patch.object(controller, "validate") as validate:
                    code = controller.run(Path("/unused"), Path("/unused/node"), Path(temporary) / "new", 193)
                self.assertEqual(code, 3)
                self.assertEqual(owner.cleaned, 1)
                self.assertEqual(sequence.call_count, 1)
                validate.assert_not_called()
                data = (Path(temporary) / "new/report.json").read_text()
                self.assertNotIn("canary", data)
                self.assertEqual(json.loads(data)["firstFailure"], reason)
                self.assertEqual(json.loads(data)["steps"], [])

    def test_cleanup_failure_preserves_original_failure_and_cannot_publish_success(self):
        with tempfile.TemporaryDirectory() as temporary:
            owner = FakeOwner()
            owner.clean_result = False
            with patch.object(controller, "preflight"), patch.object(controller, "SessionOwner", return_value=owner), \
                 patch.object(controller, "infrastructure", side_effect=ControllerRejected("child")):
                code = controller.run(Path("/unused"), Path("/unused/node"), Path(temporary) / "new", 193)
            value = json.loads((Path(temporary) / "new/report.json").read_text())
            self.assertEqual(code, 3)
            self.assertEqual((value["firstFailure"], value["cleanup"], value["nativeRuns"]), ("child", False, 0))

    def test_missing_precondition_never_constructs_session_or_starts_product(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(controller, "preflight", side_effect=ControllerRejected("prerequisite")), \
                 patch.object(controller, "SessionOwner") as owner:
                code = controller.run(Path("/unused"), Path("/unused/node"), Path(temporary) / "new", 193)
            owner.assert_not_called()
            value = json.loads((Path(temporary) / "new/report.json").read_text())
            self.assertEqual((code, value["nativeRuns"], value["firstFailure"]), (3, 0, "prerequisite"))

    def test_post_spawn_identity_failure_records_launch_before_report_publication(self):
        # An ordinary Python stand-in, never a real reader/display invocation.
        program = r'''
import json,sys,tempfile
from pathlib import Path
from unittest import mock
from session_owner import SessionOwner
from product_controller import launch_reader
from controller_protocol import Report,publish
owner=SessionOwner();report=Report();refresh=owner.refresh;calls=0
def fail_after_launch():
 global calls
 calls+=1
 if calls>1:raise PermissionError('synthetic post-launch identity failure')
 refresh()
try:
 with mock.patch.object(owner,'refresh',side_effect=fail_after_launch):
  try:launch_reader(owner,[sys.executable,'-c','import time;time.sleep(30)'],report)
  except PermissionError:report.fail('prerequisite','setup')
 report.cleaned=owner.cleanup()
 with tempfile.TemporaryDirectory() as temporary:
  target=Path(temporary)/'synthetic-report';publish(target,report.public())
  value=json.loads((target/'report.json').read_text())
 print(json.dumps({'oneActualStandInLaunch':len(owner.children)==1,'countPreserved':value['nativeRuns']==1,'failurePreserved':value['firstFailure']=='prerequisite','clean':value['cleanup']}))
finally:
 for child in owner.children:
  if child.poll() is None:child.kill()
  child.wait(timeout=2)
'''
        result = subprocess.run([sys.executable, "-B", "-c", program], cwd=Path(__file__).resolve().parent,
                                env={"PATH": "/usr/bin:/bin"}, capture_output=True, timeout=9)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertTrue(all(json.loads(result.stdout).values()))



class ProofHarness:
    """Synthetic kernel metadata/IO only; never closes a host FD or starts work."""
    seals = fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL
    kinds = {'net': 0x40000000, 'mnt': 0x20000, 'pid': 0x20000000, 'user': 0x10000000}

    def __init__(self):
        self.initial = {n: [4, 100 + i] for i, n in enumerate(self.kinds)}
        self.isolated = copy.deepcopy(self.initial)
        self.isolated['net'][1] += 10
        self.isolated['mnt'][1] += 10
        self.value = {'schema': 'f102-namespace-v1', 'initial': self.initial, 'isolated': self.isolated,
                      'subject': {'pid': 123, 'startTicks': 456}}
        self.raw = None
        self.meta = {}
        self.seal = self.seals
        self.access = os.O_RDONLY
        self.link = '/memfd:linuxcast-f102-namespace (deleted)'
        self.maps = {'uid_map': '0 0 4294967295\n', 'gid_map': '0 0 4294967295\n'}
        self.current = copy.deepcopy(self.isolated)
        self.closed = []
        self.reads = 0
        self.chunk = 4096
        self.io_fault = None
        self.close_fault = None
        self.missing = False
        self.pid1_denied = True
        self.after = {}
        self.opened = {}

    @contextmanager
    def active(self):
        raw = self.raw if self.raw is not None else json.dumps(self.value).encode()
        def info(fd):
            if fd == 3:
                if self.missing:
                    raise OSError(errno.EBADF, 'synthetic')
                return SimpleNamespace(**{**dict(st_mode=stat.S_IFREG | 0o400, st_uid=0, st_gid=0,
                    st_nlink=0, st_dev=5, st_ino=900, st_size=len(raw)), **self.meta,
                    **(self.after if self.reads else {})})
            pair = self.current[self.opened[fd]]
            return SimpleNamespace(st_dev=pair[0], st_ino=pair[1])
        def opened(path, _flags):
            name = path.rsplit('/', 1)[1]
            fd = 20 + list(self.kinds).index(name)
            self.opened[fd] = name
            return fd
        def read(fd, count, offset):
            self.reads += 1
            if self.io_fault:
                return self.io_fault(fd, count, offset)
            return raw[offset:offset + min(count, self.chunk)]
        def close(fd):
            self.closed.append(fd)
            if self.close_fault == fd:
                raise OSError('synthetic close fault')
        def text(path, *args, **kwargs):
            name = path.name
            if name in self.maps:
                return self.maps[name]
            if name == 'stat':
                return '123 (public ) process) S ' + '0 ' * 18 + '456 0'
            if name == 'status':
                return '\n'.join(k + ': 0' for k in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb')) + '\nNoNewPrivs: 1'
            raise AssertionError('unexpected fixed proc read')
        def flags(fd, cmd, *args):
            if cmd == fcntl.F_GET_SEALS:
                return self.seal
            if cmd == fcntl.F_GETFL:
                return self.access
            raise AssertionError('unexpected fcntl')
        with ExitStack() as stack:
            for target, kwargs in (
                ('os.fstat', {'side_effect': info}), ('os.open', {'side_effect': opened}),
                ('os.pread', {'side_effect': read}), ('os.close', {'side_effect': close}),
                ('os.readlink', {'return_value': self.link}), ('os.set_inheritable', {}),
                ('os.getpid', {'return_value': 123}), ('os.getuid', {'return_value': 20000}),
                ('os.getresuid', {'return_value': (20000,) * 3}), ('os.getresgid', {'return_value': (20000,) * 3}),
                ('os.getgroups', {'return_value': []}), ('fcntl.fcntl', {'side_effect': flags}),
                ('fcntl.ioctl', {'side_effect': lambda fd, op: self.kinds[self.opened[fd]]})):
                stack.enter_context(patch(target, **kwargs))
            stack.enter_context(patch.object(Path, 'read_text', text))
            stack.enter_context(patch.object(controller, 'proc_text', lambda name: Path('/proc/self/' + name).read_text(), create=True))
            yield self

    @contextmanager
    def preflight(self):
        # Exercise real preflight with all unrelated immutable-input gates valid.
        # Any attempt to dereference PID1 is denied, as measured in the guest.
        def metadata(path, *args, **kwargs):
            if str(path).startswith('/proc/1/'):
                if self.pid1_denied:
                    raise PermissionError('synthetic PID1 denial')
                return SimpleNamespace(st_ino=20)
            return SimpleNamespace(st_ino=10)
        with self.active(), ExitStack() as stack:
            stack.enter_context(patch.object(controller.platform, 'freedesktop_os_release', return_value={'ID': 'debian', 'VERSION_ID': '13'}))
            stack.enter_context(patch.object(controller.platform, 'machine', return_value='x86_64'))
            stack.enter_context(patch.object(controller, 'HERE', Path('/stage/apps/desktop/tests/at')))
            stack.enter_context(patch.object(Path, 'stat', metadata))
            stack.enter_context(patch.object(Path, 'exists', return_value=False))
            stack.enter_context(patch.object(Path, 'iterdir', return_value=iter([Path('lo')])))
            stack.enter_context(patch.object(Path, 'read_bytes', return_value=b'public'))
            stack.enter_context(patch.object(controller, 'ORCA_HASHES', {}))
            stack.enter_context(patch.object(controller.hashlib, 'sha256', side_effect=[
                SimpleNamespace(hexdigest=lambda: '43621e33f07e165ad29a17bc2e23860ecafeb8f40a5537f201413aadb9600d5b'),
                SimpleNamespace(hexdigest=lambda: '93e618b4cd2d9a0405c75f7b9ab4779707a6eb1194a5889978b32694dcdc29c6')]))
            digest = stack.enter_context(patch.object(controller, 'receipt_digest', return_value='public-pin'))
            validate = stack.enter_context(patch.object(controller, 'validate'))
            yield digest, validate


class AttestationTests(unittest.TestCase):
    def test_interruption_at_deadline_and_preflight_consumption_handoffs_closes_proof(self):
        call_codes = {'deadline': controller.Deadline.__init__.__code__,
                      'preflight': controller.preflight.__code__,
                      'consume': controller.consume_attestation.__code__}
        source, first = inspect.getsourcelines(controller.run)
        call_line = first + next(i for i, line in enumerate(source) if 'receipt_pin = preflight(' in line)
        for boundary in (*call_codes, 'before-preflight'):
            h = ProofHarness()
            fired = []
            def interrupt(frame, event, _arg):
                match = (event == 'call' and frame.f_code is call_codes.get(boundary))
                match = match or (boundary == 'before-preflight' and event == 'line'
                                  and frame.f_code is controller.run.__code__ and frame.f_lineno == call_line)
                if match:
                    fired.append(boundary)
                    sys.settrace(None)
                    raise ControllerRejected('child')
                return interrupt
            with self.subTest(boundary=boundary), h.preflight() as (digest, validate), \
                 patch.object(controller, 'SessionOwner') as owner, patch.object(controller, 'publish') as publish, \
                 patch('signal.signal'), patch('signal.setitimer'):
                previous = sys.gettrace()
                try:
                    sys.settrace(interrupt)
                    code = controller.run(Path('/stage'), Path('/node'), Path('/unused'), 193)
                finally:
                    sys.settrace(previous)
                self.assertEqual(fired, [boundary])
                self.assertEqual(code, 3)
                self.assertEqual(h.closed.count(3), 1)
                owner.assert_not_called()
                digest.assert_not_called()
                validate.assert_not_called()
                result = publish.call_args.args[1]
                self.assertEqual((result['firstFailure'], result['nativeRuns'], result['cleanup']), ('child', 0, True))

    def test_main_interruption_at_run_entry_retains_cleanup_ownership(self):
        fired = []
        def interrupt(frame, event, _arg):
            if event == 'call' and frame.f_code is controller.run.__code__:
                fired.append(True)
                sys.settrace(None)
                raise ControllerRejected('child')
            return interrupt
        argv = ['controller', '--reviewed-controller', '--staging', '/stage', '--node', '/node',
                '--new-evidence', '/unused', '--display', '193']
        with patch.object(sys, 'argv', argv), patch.object(Path, 'resolve', lambda p: p), \
             patch('signal.signal'), patch('signal.setitimer'), patch('os.close') as close, \
             patch.object(controller, 'SessionOwner') as owner, patch.object(controller, 'publish') as publish, \
             patch('builtins.print'):
            previous = sys.gettrace()
            try:
                sys.settrace(interrupt)
                self.assertEqual(controller.main(), 3)
            finally:
                sys.settrace(previous)
        self.assertEqual(fired, [True])
        close.assert_called_once_with(3)
        owner.assert_not_called()
        publish.assert_not_called()

    def test_ambiguous_proof_close_is_not_retried_and_cleanup_stays_unknown(self):
        h = ProofHarness()
        h.close_fault = 3
        with h.preflight(), patch.object(controller, 'SessionOwner') as owner, \
             patch.object(controller, 'publish') as publish, patch('signal.signal'), patch('signal.setitimer'):
            self.assertEqual(controller.run(Path('/stage'), Path('/node'), Path('/unused'), 193), 3)
        self.assertEqual(h.closed.count(3), 1)
        self.assertFalse(publish.call_args.args[1]['cleanup'])
        owner.assert_not_called()

    def test_closed_proof_number_reused_by_later_owner_is_not_closed_again(self):
        h = ProofHarness()
        fresh = {'alive': False}
        def close(fd):
            h.closed.append(fd)
            if fd == 3 and fresh['alive']:
                fresh['alive'] = False
        def owner():
            self.assertEqual(h.closed.count(3), 1)
            fresh['alive'] = True  # synthetic FD3 now belongs to a different resource
            return FakeOwner()
        with h.preflight(), patch('os.close', side_effect=close), \
             patch.object(controller, 'SessionOwner', side_effect=owner), \
             patch.object(controller, 'infrastructure', side_effect=ControllerRejected('child')), \
             patch.object(controller, 'publish'), patch('signal.signal'), patch('signal.setitimer'):
            self.assertEqual(controller.run(Path('/stage'), Path('/node'), Path('/unused'), 193), 3)
        self.assertTrue(fresh['alive'])
        self.assertEqual(h.closed.count(3), 1)

    def test_interruption_at_close_attempt_cannot_advertise_verified_cleanup(self):
        h = ProofHarness()
        source, first = inspect.getsourcelines(controller.ProofCustody.close)
        attempt = first + next(i for i, line in enumerate(source) if 'os.close(3)' in line)
        fired = []
        def interrupt(frame, event, _arg):
            if (event == 'line' and frame.f_code is controller.ProofCustody.close.__code__
                    and frame.f_lineno == attempt):
                fired.append(True)
                sys.settrace(None)
                raise ControllerRejected('child')
            return interrupt
        with h.preflight(), patch.object(controller, 'publish') as publish, \
             patch.object(controller, 'SessionOwner') as owner, patch('signal.signal'), patch('signal.setitimer'):
            previous = sys.gettrace()
            try:
                sys.settrace(interrupt)
                self.assertEqual(controller.run(Path('/stage'), Path('/node'), Path('/unused'), 193), 3)
            finally:
                sys.settrace(previous)
        self.assertEqual(fired, [True])
        self.assertFalse(publish.call_args.args[1]['cleanup'])
        self.assertEqual(h.closed.count(3), 0)  # no retry of an uncertain close attempt
        owner.assert_not_called()

    def test_valid_proof_allows_pid1_denial_and_is_closed_before_stage(self):
        h = ProofHarness()
        with h.preflight() as (digest, validate):
            digest.side_effect = lambda *_: self.assertIn(3, h.closed) or 'public-pin'
            self.assertEqual(controller.preflight(Path('/stage'), Path('/node'), None), 'public-pin')
            validate.assert_called_once()
        self.assertEqual(h.closed.count(3), 1)
        self.assertEqual(set(h.closed), {3, 20, 21, 22, 23})

    def test_missing_proof_stops_real_preflight_before_stage(self):
        h = ProofHarness()
        h.missing = True
        h.pid1_denied = False
        with h.preflight() as (digest, validate), self.assertRaises(ControllerRejected):
            try:
                controller.preflight(Path('/stage'), Path('/node'), None)
            finally:
                digest.assert_not_called()
                validate.assert_not_called()
        self.assertEqual(h.closed, [3])

    def assert_refused(self, h):
        with h.active(), patch.object(controller, 'SessionOwner') as owner, \
             patch.object(controller, 'validate') as validate, patch.object(controller, 'receipt_digest') as digest, \
             patch.object(controller, 'publish') as publish, patch('signal.signal'), patch('signal.setitimer'):
            code = controller.run(Path('/stage'), Path('/node'), Path('/unused'), 193)
        self.assertEqual(code, 3)
        self.assertEqual(h.closed.count(3), 1)
        owner.assert_not_called()
        validate.assert_not_called()
        digest.assert_not_called()
        self.assertEqual(publish.call_args.args[1]['nativeRuns'], 0)

    def test_descriptor_authority_and_snapshot_faults_never_construct_native(self):
        for changes in ({'st_uid': 20000}, {'st_gid': 20000}, {'st_mode': stat.S_IFREG | 0o600},
                        {'st_mode': stat.S_IFDIR | 0o400}, {'st_mode': stat.S_IFSOCK | 0o400},
                        {'st_nlink': 1}, {'st_size': 0}, {'st_size': 4097}):
            h = ProofHarness()
            h.meta = changes
            with self.subTest(changes=changes):
                self.assert_refused(h)
        for attr, values in (('seal', [0, ProofHarness.seals & ~fcntl.F_SEAL_WRITE,
                                       ProofHarness.seals & ~fcntl.F_SEAL_GROW,
                                       ProofHarness.seals & ~fcntl.F_SEAL_SHRINK,
                                       ProofHarness.seals & ~fcntl.F_SEAL_SEAL]),
                             ('access', [os.O_WRONLY, os.O_RDWR]), ('link', ['/tmp/public', '/memfd:other (deleted)'])):
            for value in values:
                h = ProofHarness()
                setattr(h, attr, value)
                with self.subTest(attr=attr, value=value):
                    self.assert_refused(h)
        for changes in ({'st_ino': 901}, {'st_mode': stat.S_IFREG | 0o440}, {'st_size': 1}, {'st_uid': 20000}):
            h = ProofHarness()
            h.after = changes
            self.assert_refused(h)

    def test_closed_schema_subject_pairs_and_maps(self):
        changes = [lambda v: v.update(extra=True), lambda v: v.update(schema=1),
                   lambda v: v.update(subject={'pid': 124, 'startTicks': 456}),
                   lambda v: v['subject'].update(startTicks=457), lambda v: v['subject'].update(pid=True),
                   lambda v: v['subject'].update(extra=1), lambda v: v.update(initial=[])]
        for name in ProofHarness.kinds:
            changes += [lambda v, n=name: v['isolated'].__setitem__(n, [4, 999]),
                        lambda v, n=name: v['initial'].__setitem__(n, [True, 1]),
                        lambda v, n=name: v['isolated'].__setitem__(n, [0, 1]),
                        lambda v, n=name: v['isolated'].__setitem__(n, [4, 2 ** 64]),
                        lambda v, n=name: v['isolated'].pop(n)]
        changes += [lambda v: v['isolated'].__setitem__('net', v['initial']['net']),
                    lambda v: v['isolated'].__setitem__('mnt', v['initial']['mnt'])]
        for change in changes:
            h = ProofHarness()
            change(h.value)
            with self.subTest(value=h.value):
                self.assert_refused(h)
        for raw in (b'{}', b'null', b'{', b'\xff', b'{"schema":1,"schema":2}', b'[]', b' ' * 4097):
            h = ProofHarness()
            h.raw = raw
            self.assert_refused(h)
        for name in ('uid_map', 'gid_map'):
            for mapping in ('0 20000 1\n', '0 0 4294967295\n1 1 1\n', '', '0 0 4294967294\n'):
                h = ProofHarness()
                h.maps[name] = mapping
                self.assert_refused(h)

    def test_short_reads_succeed_but_zero_errors_and_close_faults_stop(self):
        h = ProofHarness()
        h.chunk = 1
        with h.active():
            controller.consume_attestation()
        self.assertGreater(h.reads, 100)
        for fault in (lambda *_: b'', lambda *_: (_ for _ in ()).throw(OSError('synthetic')),
                      lambda *_: b'x' * 4097):
            h = ProofHarness()
            h.io_fault = fault
            self.assert_refused(h)
        for fd in (3, 20, 21, 22, 23):
            h = ProofHarness()
            h.close_fault = fd
            self.assert_refused(h)
        h = ProofHarness()
        with h.active(), patch('os.set_inheritable', side_effect=OSError), self.assertRaises(ControllerRejected):
            controller.consume_attestation()
        self.assertEqual(h.closed, [3])

    def test_namespace_read_and_type_denial_never_falls_back(self):
        for call in ('os.open', 'os.fstat', 'fcntl.ioctl', 'os.readlink'):
            h = ProofHarness()
            with h.active(), patch(call, side_effect=PermissionError), self.assertRaises(ControllerRejected):
                controller.consume_attestation()
            self.assertIn(3, h.closed)
        h = ProofHarness()
        with h.active(), patch('fcntl.ioctl', return_value=0), self.assertRaises(ControllerRejected):
            controller.consume_attestation()
        self.assertIn(3, h.closed)

    def test_real_unprivileged_memfd_with_synthetic_root_ownership(self):
        # No fixed host FD is overwritten: map only production calls on FD3 to
        # this ordinary owned memfd. Seals/access/bytes are real kernel facts.
        h = ProofHarness()
        fd = os.memfd_create('linuxcast-f102-namespace', os.MFD_ALLOW_SEALING | os.MFD_CLOEXEC)
        readonly = None
        real_fstat, real_pread, real_fcntl, real_link = os.fstat, os.pread, fcntl.fcntl, os.readlink
        try:
            raw = json.dumps(h.value).encode()
            os.write(fd, raw)
            os.fchmod(fd, 0o400)
            fcntl.fcntl(fd, fcntl.F_ADD_SEALS, h.seals)
            readonly = os.open('/proc/self/fd/' + str(fd), os.O_RDONLY | os.O_CLOEXEC)
            def info(number):
                actual = real_fstat(readonly)
                return SimpleNamespace(**{name: getattr(actual, name) for name in
                    ('st_dev', 'st_ino', 'st_mode', 'st_nlink', 'st_size')}, st_uid=0, st_gid=0)
            with h.active(), patch('os.fstat', side_effect=info), \
                 patch('os.pread', side_effect=lambda number, count, offset: real_pread(readonly, count, offset)), \
                 patch('fcntl.fcntl', side_effect=lambda number, cmd: real_fcntl(readonly, cmd)), \
                 patch('os.readlink', side_effect=lambda _: real_link('/proc/self/fd/' + str(readonly))), \
                 patch.object(controller, 'own_namespaces', return_value=h.current):
                controller.consume_attestation()
            with self.assertRaises(OSError):
                os.write(fd, b'x')
        finally:
            if readonly is not None:
                os.close(readonly)
            os.close(fd)

    def test_import_and_failed_preflight_never_import_staging(self):
        original = builtins.__import__
        imports = []
        def guarded(name, *args, **kwargs):
            imports.append(name)
            if name == 'product_staging':
                raise AssertionError('staging imported before proof')
            return original(name, *args, **kwargs)
        with patch('builtins.__import__', side_effect=guarded), patch('os.open') as opened:
            importlib.reload(controller)
        opened.assert_not_called()
        self.assertNotIn('product_staging', imports)
        h = ProofHarness()
        h.missing = True
        with h.active(), patch('builtins.__import__', side_effect=guarded), self.assertRaises(ControllerRejected):
            controller.preflight(Path('/stage'), Path('/node'), None)
        self.assertNotIn('product_staging', imports)
        self.assertEqual(h.closed, [3])

    def test_proof_closed_before_session_and_any_native_construction(self):
        h = ProofHarness()
        def owner():
            self.assertEqual(set(h.closed), {3, 20, 21, 22, 23})
            return FakeOwner()
        with h.preflight(), patch.object(controller, 'SessionOwner', side_effect=owner) as create, \
             patch.object(controller, 'infrastructure', side_effect=ControllerRejected('child')) as native, \
             patch.object(controller, 'publish') as publish, patch('signal.signal'), patch('signal.setitimer'):
            self.assertEqual(controller.run(Path('/stage'), Path('/node'), Path('/unused'), 193), 3)
        create.assert_called_once()
        native.assert_called_once()
        self.assertEqual(publish.call_args.args[1]['nativeRuns'], 0)

    def test_post_read_authority_changes_and_proc_denials_close_proof(self):
        for command, wrong in ((fcntl.F_GETFL, os.O_RDWR), (fcntl.F_GET_SEALS, 0)):
            h = ProofHarness()
            def flags(fd, cmd):
                if cmd == command and h.reads:
                    return wrong
                return h.seal if cmd == fcntl.F_GET_SEALS else h.access
            with h.active(), patch('fcntl.fcntl', side_effect=flags), self.assertRaises(ControllerRejected):
                controller.consume_attestation()
            self.assertEqual(h.closed, [3])
        h = ProofHarness()
        with h.active(), patch('os.readlink', side_effect=lambda _: h.link if not h.reads else '/tmp/foreign'), \
             self.assertRaises(ControllerRejected):
            controller.consume_attestation()
        self.assertEqual(h.closed, [3])
        for target in ('uid_map', 'gid_map', 'stat'):
            h = ProofHarness()
            with h.active():
                original = Path.read_text
                def read(path, *args, **kwargs):
                    if path.name == target:
                        raise PermissionError
                    return original(path, *args, **kwargs)
                with patch.object(Path, 'read_text', read), self.assertRaises(ControllerRejected):
                    controller.consume_attestation()
            self.assertEqual(h.closed, [3])
        h = ProofHarness()
        with h.active():
            original = Path.read_text
            def changed_map(path, *args, **kwargs):
                return '0 20000 1' if h.reads and path.name.endswith('_map') else original(path, *args, **kwargs)
            with patch.object(Path, 'read_text', changed_map), self.assertRaises(ControllerRejected):
                controller.consume_attestation()
        self.assertIn(3, h.closed)

    def test_existing_os_identity_capability_and_device_gates_survive_proof(self):
        for fault in ('os', 'uid', 'gid', 'groups', 'caps', 'nnp', 'devices', 'interfaces'):
            h = ProofHarness()
            with h.preflight() as (digest, validate), ExitStack() as stack:
                if fault == 'os':
                    stack.enter_context(patch.object(controller.platform, 'machine', return_value='other'))
                if fault in ('uid', 'gid'):
                    stack.enter_context(patch('os.getres' + fault, return_value=(0,) * 3))
                if fault == 'groups':
                    stack.enter_context(patch('os.getgroups', return_value=[20000]))
                if fault in ('caps', 'nnp'):
                    original = Path.read_text
                    def read(path, *args, **kwargs):
                        raw = original(path, *args, **kwargs)
                        return raw.replace('CapEff: 0', 'CapEff: 1') if fault == 'caps' else raw.replace('NoNewPrivs: 1', 'NoNewPrivs: 0')
                    stack.enter_context(patch.object(Path, 'read_text', read))
                if fault == 'devices':
                    stack.enter_context(patch.object(Path, 'exists', return_value=True))
                if fault == 'interfaces':
                    stack.enter_context(patch.object(Path, 'iterdir', return_value=iter([Path('eth0')])))
                with self.assertRaises(ControllerRejected):
                    controller.preflight(Path('/stage'), Path('/node'), None)
                digest.assert_not_called()
                validate.assert_not_called()
            self.assertEqual(h.closed.count(3), 1)

    def test_invalid_cli_closes_proof_without_native_work(self):
        for args in ([], ['--reviewed-controller', '--staging', '/stage', '--node', '/node',
                          '--new-evidence', '/out', '--display', '1']):
            with patch.object(sys, 'argv', ['controller', *args]), patch('os.close') as close, \
                 patch('sys.stderr'), patch.object(controller, 'run') as run:
                try:
                    controller.main()
                except ControllerRejected:
                    pass
            self.assertTrue(close.called)
            run.assert_not_called()
    def test_real_proc_map_reader_rejects_fabrication_and_bind_overlays(self):
        import lab_namespace
        # Exercise BOTH actual proc readers, substituting only individual
        # syscalls. No real ctypes/syscall adapter is constructed or invoked.
        for module in (controller, lab_namespace):
            for fault in ('none', 'root-open', 'root-stat', 'not-root', 'fake-fs', 'fs-error',
                          'missing-mask', 'mount-zero', 'statx-error', 'leaf-open', 'leaf-stat',
                          'foreign-device', 'not-regular', 'bind-map', 'read', 'oversize',
                          'decode', 'close-leaf', 'close-root'):
                closed = []
                reads = []
                def opened(path, flags, **kwargs):
                    if path == '/proc':
                        self.assertTrue(flags & os.O_DIRECTORY and flags & os.O_NOFOLLOW)
                        if fault == 'root-open':
                            raise OSError
                        return 30
                    self.assertEqual((path, kwargs), ('self/uid_map', {'dir_fd': 30}))
                    if fault == 'leaf-open':
                        raise OSError
                    return 31
                def info(fd):
                    if (fault == 'root-stat' and fd == 30) or (fault == 'leaf-stat' and fd == 31):
                        raise OSError
                    return SimpleNamespace(st_mode=(stat.S_IFDIR if fd == 30 else
                        stat.S_IFIFO if fault == 'not-regular' else stat.S_IFREG),
                        st_ino=2 if fault == 'not-root' else 1,
                        st_dev=5 if fd == 31 and fault == 'foreign-device' else 4)
                class Lib:
                    def fstatfs(self, fd, pointer):
                        ctypes.cast(pointer, ctypes.POINTER(ctypes.c_long))[0] = 0 if fault == 'fake-fs' else 0x9fa0
                        return -1 if fault == 'fs-error' else 0
                    def statx(self, fd, path, flags, mask, pointer):
                        self_args = (path, flags, mask)
                        if self_args != (b'', 0x1000, 0x1000):
                            raise AssertionError('wrong fixed statx invocation')
                        ctypes.cast(pointer, ctypes.POINTER(ctypes.c_uint32))[0] = 0 if fault == 'missing-mask' else 0x1000
                        ctypes.c_uint64.from_address(ctypes.addressof(pointer._obj) + 0x90).value = (
                            0 if fault == 'mount-zero' else 100 if fd == 31 and fault == 'bind-map' else 99)
                        return -1 if fault == 'statx-error' else 0
                def read(fd, count, offset):
                    reads.append(offset)
                    if fault == 'read':
                        raise OSError
                    raw = b'x' * 4097 if fault == 'oversize' else b'\xff' if fault == 'decode' else b'0 0 4294967295\n'
                    return raw[offset:offset + min(7, count)]
                def close(fd):
                    closed.append(fd)
                    if (fault == 'close-leaf' and fd == 31) or (fault == 'close-root' and fd == 30):
                        raise OSError
                with self.subTest(module=module.__name__, fault=fault), \
                     patch('ctypes.CDLL', return_value=Lib()), patch('os.open', side_effect=opened), \
                     patch('os.fstat', side_effect=info), patch('os.pread', side_effect=read), patch('os.close', side_effect=close):
                    if fault == 'none':
                        self.assertEqual(module.proc_text('uid_map'), '0 0 4294967295\n')
                        self.assertEqual(reads, [0, 7, 14, 15])
                    else:
                        with self.assertRaises((OSError, ControllerRejected, lab_namespace.Rejected, UnicodeError)):
                            module.proc_text('uid_map')
                if fault == 'root-open':
                    self.assertEqual(closed, [])
                else:
                    self.assertEqual(closed[-1], 30)
                if fault in ('fake-fs', 'missing-mask', 'bind-map', 'foreign-device', 'not-root', 'not-regular'):
                    self.assertEqual(reads, [])

    def test_initial_deadline_failure_closes_proof_before_any_work(self):
        with patch.object(controller, 'Deadline', side_effect=OSError), patch('os.close') as close, \
             patch.object(controller, 'publish') as publish, patch.object(controller, 'SessionOwner') as owner, \
             patch.object(controller, 'preflight') as preflight, patch('signal.signal'), patch('signal.setitimer'):
            self.assertEqual(controller.run(Path('/stage'), Path('/node'), Path('/unused'), 193), 3)
        close.assert_called_once_with(3)
        preflight.assert_not_called()
        owner.assert_not_called()
        self.assertEqual(publish.call_args.args[1]['nativeRuns'], 0)

    def test_early_cli_setup_faults_close_once_without_staging(self):
        args = ['controller', '--reviewed-controller', '--staging', '/stage', '--node', '/node', '--new-evidence', '/out']
        for fault in ('resolve', 'signal', 'timer', 'close'):
            with patch.object(sys, 'argv', args), patch.object(controller, 'run') as run, \
                 patch('os.close', side_effect=OSError if fault == 'close' else None) as close, \
                 patch.object(Path, 'resolve', side_effect=OSError if fault in ('resolve', 'close') else None, return_value=Path('/stage')), \
                 patch('signal.signal', side_effect=OSError if fault == 'signal' else None), \
                 patch('signal.setitimer', side_effect=OSError if fault == 'timer' else None):
                self.assertEqual(controller.main(), 3)
                close.assert_called_once_with(3)
                run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
