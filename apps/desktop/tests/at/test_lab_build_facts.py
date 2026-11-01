"""Offline build facts: injected guest facts, private files, independently owned children.

Never invoke the owner CLI, guest source entry point, host package/locale/resource
probe, Docker/SSH, privileged adapter, install/build/native or lab private files.
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

import lab_build_facts as build
import lab_owner as owner
import test_lab_owner as native

CAPTURE = '12345678-1234-4234-8234-123456789abc'
RAW = (b'Package: dpkg\nStatus: install ok installed\nArchitecture: amd64\nVersion: 1.22.22\n'
       b'Depends: libc6 (>= 2.38),\n libbz2-1.0\nDescription: synthetic discarded\n text\n\n'
       b'Package: apt\nStatus: hold ok installed\nArchitecture: amd64\nVersion: 3.0.3\n\n'
       b'Package: debian-archive-keyring\nStatus: install ok installed\nArchitecture: all\nVersion: 2025.1\n\n'
       b'Package: removed-demo\nStatus: purge ok not-installed\n')


def definitions(source=None):
    tree = ast.parse(build.PROBE_SOURCE if source is None else source)
    assert all(isinstance(n, (ast.Import, ast.ImportFrom, ast.Assign, ast.ClassDef, ast.FunctionDef, ast.If)) for n in tree.body)
    tree.body = [n for n in tree.body if not isinstance(n, ast.If)]
    scope = {'__name__': 'synthetic_definitions'}
    exec(compile(tree, '<synthetic-build-facts>', 'exec'), scope)
    return scope


PROBE = definitions()


def snapshot():
    records = PROBE['package_records'](RAW)
    return {'schema': 'f102-build-facts-v1',
            'identity': {'effectiveUid': 0, 'effectiveGid': 0, 'sudoIdentity': 'uid1000'},
            'os': {'id': 'debian', 'version': '13.7', 'architecture': 'amd64'},
            'architecture': {'native': 'amd64', 'foreign': [], 'source': 'dpkg-status-and-arch'},
            'packages': records, 'packageState': PROBE['state_for'](records, RAW),
            'resources': {'filesystems': {p: dict(status='known', **dict(zip(build.CAPACITY, (100, 200, 300, 10, 20, 30))))
                                         for p in build.FILESYSTEMS},
                          'memory': {'status': 'known', 'totalBytes': 8192, 'availableBytes': 4096},
                          'cpuAffinity': {'status': 'known', 'count': 2}},
            'locale': {'status': 'missing', 'available': False},
            'keyring': {'status': 'known', 'sha256': owner.digest(b'synthetic public keyring'),
                        'bytes': 24, 'packageVersion': '2025.1'}}


def packet(value=None, expanded=None):
    raw = owner.encoded(snapshot() if value is None else value) if expanded is None else expanded
    return {'schema': 'f102-build-facts-packet-v1', 'status': 'observed', 'firstFailure': 'none',
            'encoding': 'zlib-base64', 'expandedBytes': len(raw), 'sha256': owner.digest(raw),
            'data': base64.b64encode(zlib.compress(raw)).decode('ascii')}


def permit(root):
    info = root.stat()
    return {'schema': 1, 'jobKind': 'build-facts-only', 'captureId': CAPTURE, 'containerId': owner.CONTAINER,
            'imageId': owner.IMAGE, 'labRoot': str(owner.LAB), 'labDevice': info.st_dev, 'labInode': info.st_ino,
            'ownerSha256': '1' * 64, 'buildFactsOwnerSha256': '5' * 64, 'buildFactsProbeSha256': build.PROBE_SHA256,
            'guestAccount': 'linuxcast', 'guestPrivilege': 'sudo-noninteractive', 'buildFactsAuthorityReviewed': True}


def write_permit(root, value=None):
    path = root / build.PERMIT
    if path.exists():
        path.chmod(0o600)
    path.write_bytes(owner.encoded(permit(root) if value is None else value))
    path.chmod(0o400)


def prepare(root):
    native.prepare(root)
    write_permit(root)


def reserved(root):
    lease = build.BuildFactsReservation(root)
    lease.acquire()
    lease.permit('1' * 64, '5' * 64, build.PROBE_SHA256)
    return lease


class FakeLab(native.FakeLab):
    job_seconds = 30

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.reply = owner.encoded(packet())

    def validate_job_reply(self, raw, code, result):
        return build.BuildFactsLab.validate_job_reply(self, raw, code, result)


class Parser(unittest.TestCase):
    def records(self, raw):
        return PROBE['package_records'](raw)

    def test_real_projection_holds_sort_and_absent_versions(self):
        records = self.records(RAW)
        self.assertEqual([r['Package'] for r in records], ['apt', 'debian-archive-keyring', 'dpkg', 'removed-demo'])
        self.assertEqual(records[2]['Depends'], 'libc6 (>= 2.38), libbz2-1.0')
        self.assertNotIn('Description', records[2])
        self.assertNotIn('Version', records[3])
        self.assertEqual(PROBE['state_for'](records, RAW)['holds'], [{'package': 'apt', 'architecture': 'amd64'}])
        build.validate_snapshot(snapshot())

    def test_colon_whitespace_case_and_field_presence(self):
        raw = RAW.replace(b'Package: dpkg', b'pAcKaGe:dpkg').replace(b'Version: 1.22.22', b'version:\t1.22.22 \t')
        records = self.records(raw)
        self.assertEqual(records, self.records(RAW))
        raw = RAW.replace(b'Depends: libc6 (>= 2.38),\n libbz2-1.0', b'Depends:\n\tlibc6,\n  libbz2-1.0')
        self.assertEqual(self.records(raw)[2]['Depends'], 'libc6, libbz2-1.0')
        self.assertIn('Depends', self.records(RAW.replace(b'Depends: libc6 (>= 2.38),\n libbz2-1.0', b'Depends:'))[2])

    def test_whitespace_paragraph_separators_and_no_final_newline(self):
        self.assertEqual(self.records(RAW.replace(b'\n\n', b'\n \t\n').rstrip()), self.records(RAW))

    def test_discarded_fields_are_not_exempt_from_strict_parsing(self):
        for suffix in (b'\nBad\n', b'\nDescription:x\ndescription:y\n', b'\n Bad orphan\n\nUnnamed:x', b'\nBad Key:x\n'):
            with self.subTest(suffix=suffix), self.assertRaises(PROBE['Fault']):
                self.records(RAW + suffix)

    def test_all_duplicate_fields_are_case_insensitive(self):
        for field in ('Package', 'Status', 'Architecture', 'Version', 'X-Private'):
            raw = RAW.replace(b'Package: dpkg', ('Package: dpkg\n' + field + ': x\n' + field.lower() + ': y').encode())
            with self.subTest(field=field), self.assertRaises(PROBE['Fault']):
                self.records(raw)

    def test_simple_fields_disallow_continuation_and_unnamed_stanzas(self):
        for raw in (b' continuation\n' + RAW, RAW + b'\n\nDescription: unnamed\n',
                    RAW.replace(b'Version: 1.22.22', b'Version: 1.22.22\n 2'),
                    RAW.replace(b'Status: install ok installed', b'Status: install\n ok installed', 1)):
            with self.subTest(raw=raw[:50]), self.assertRaises(PROBE['Fault']):
                self.records(raw)

    def test_identity_status_and_projected_enums_are_checked(self):
        for old, new in ((b'Package: dpkg', b'Package: Dpkg'), (b'Architecture: amd64', b'Architecture: ../bad'),
                         (b'Version: 1.22.22', b'Version: bogus'), (b'install ok installed', b'install bad installed'),
                         (b'install ok installed', b'install ok unknown'), (b'install ok installed', b'install  ok installed')):
            with self.subTest(new=new), self.assertRaises(PROBE['Fault']):
                self.records(RAW.replace(old, new, 1))
        for field, val in (('Essential', 'true'), ('Protected', '0'), ('Priority', 'random'), ('Multi-Arch', 'both'), ('Installed-Size', '-1')):
            with self.subTest(field=field), self.assertRaises(PROBE['Fault']):
                self.records(RAW.replace(b'Package: dpkg', f'Package: dpkg\n{field}: {val}'.encode()))

    def test_installed_and_configfiles_need_architecture_and_version(self):
        for state in ('installed', 'config-files', 'unpacked', 'half-configured'):
            for omitted in (b'Architecture: amd64\n', b'Version: 1.22.22\n'):
                with self.subTest(state=state, omitted=omitted), self.assertRaises(PROBE['Fault']):
                    self.records(RAW.replace(b'install ok installed', f'install ok {state}'.encode(), 1).replace(omitted, b'', 1))

    def test_full_status_broken_and_hold_states_are_preserved(self):
        for selection in ('unknown', 'install', 'hold', 'deinstall', 'purge'):
            for state in ('not-installed', 'config-files', 'half-installed', 'unpacked', 'half-configured', 'triggers-awaited', 'triggers-pending', 'installed'):
                raw = RAW.replace(b'Status: install ok installed', f'Status: {selection} reinstreq {state}'.encode(), 1)
                records = self.records(raw)
                self.assertEqual(records[2]['Status'], f'{selection} reinstreq {state}')
                self.assertFalse(PROBE['state_for'](records, raw)['pending']['clean'])

    def test_multiarch_unique_pair_and_duplicate_pair_refusal(self):
        raw = RAW + b'\nPackage: apt\nArchitecture: arm64\nVersion: 2\nStatus: deinstall ok config-files\n'
        self.assertEqual(len(self.records(raw)), 5)
        with self.assertRaises(PROBE['Fault']):
            self.records(RAW + b'\n' + RAW)

    def test_input_stanza_line_field_and_record_bounds(self):
        for raw in (b'x' * 8388609, b'', RAW + b'X:' + b'x' * 16385,
                    RAW.replace(b'Description: synthetic discarded\n text', b'Description:' + b'x' * 10000 + b'\n ' + b'y' * 10000),
                    RAW + b'\nPackage: other\nStatus: purge ok not-installed\n' +
                    b''.join(f'X-{i}:'.encode() + b'x' * 15000 + b'\n' for i in range(9)),
                    RAW + b'\0', RAW + b'\xff', RAW + b'\r\n'):
            with self.subTest(size=len(raw)), self.assertRaises(PROBE['Fault']):
                self.records(raw)
        raw = b'\n'.join(f'Package: p{i}\nStatus: purge ok not-installed\n'.encode() for i in range(4097))
        with self.assertRaises(PROBE['Fault']):
            self.records(raw)

    def test_debian_version_epoch_upstream_revision_validation(self):
        for version in ('1', '1.0~rc1-2+deb13u1', '2:1.0-1', '2147483647:1.0', '1:2:3-4'):
            raw = RAW.replace(b'1.22.22', version.encode())
            self.records(raw)
            build.validate_version(version)
        for version in ('1-', '1::2', ':1', '2147483648:1', '1-2:3', '1_2', '1 2', 'a1'):
            raw = RAW.replace(b'1.22.22', version.encode())
            with self.subTest(version=version), self.assertRaises(PROBE['Fault']):
                self.records(raw)
            with self.subTest(host=version), self.assertRaises(owner.Rejected):
                build.validate_version(version)

    def test_parser_fault_control_duplicate_guard_has_observable_effect(self):
        source = build.PROBE_SOURCE.replace("need(key not in fields)\n            fields[key]", "need(True)\n            fields[key]", 1)
        bad = RAW.replace(b'Package: dpkg', b'Package: dpkg\npackage: dpkg')
        self.assertEqual(definitions(source)['package_records'](bad)[2]['Package'], 'dpkg')
        with self.assertRaises(PROBE['Fault']):
            self.records(bad)


class Codec(unittest.TestCase):
    def reject(self, value, code=0):
        with self.assertRaises(owner.Rejected):
            build.decode_packet(owner.encoded(value), code)

    def test_roundtrip_guest_packet_host_decoder_and_fixed_keys(self):
        v = snapshot()
        packet_value = PROBE['packet'](v)
        p, decoded, raw = build.decode_packet(owner.encoded(packet_value), 0)
        self.assertEqual(decoded, v)
        self.assertEqual(raw, owner.encoded(v))
        self.assertEqual(set(p), {'schema', 'status', 'firstFailure', 'encoding', 'expandedBytes', 'sha256', 'data'})
        self.assertLess(len(owner.encoded(p)), 60000)
        self.assertEqual(owner.MAX_BYTES, 65536)

    def test_every_unavailable_code_is_preserved_without_baseline(self):
        for failure in build.FAILURES[1:]:
            p = PROBE['unavailable'](failure)
            self.assertEqual(build.decode_packet(owner.encoded(p), 3), (p, None, None))
            self.reject(p, 0)
        self.reject(PROBE['unavailable']('none'), 3)

    def test_closed_packet_types_and_status_crossfields(self):
        p = packet()
        changes = [{'extra': 1}, {'schema': 'old'}, {'encoding': 'raw'}, {'status': 'known'},
                   {'firstFailure': 'packages'}, {'expandedBytes': True}, {'expandedBytes': 0},
                   {'expandedBytes': build.MAX_SNAPSHOT + 1}, {'sha256': 'A' * 64}, {'data': None},
                   {'data': p['data'] + '\n'}, {'data': p['data'][:-1]}, {'expandedBytes': p['expandedBytes'] - 1}]
        for change in changes:
            with self.subTest(change=change):
                self.reject(dict(p, **change))
        self.reject(p, True)
        for change in ({'expandedBytes': False}, {'sha256': '0' * 64}, {'data': ''}, {'extra': 0}):
            self.reject(dict(PROBE['unavailable']('packages'), **change), 3)

    def test_strict_json_duplicate_nonfinite_and_bounded_packets(self):
        raw = owner.encoded(packet())
        for bad in (b'{"schema":"x",' + raw[1:], raw + b'garbage', b'NaN', b'[' * 2000 + b']' * 2000,
                    b' ' * 60001, raw.replace(b'"expandedBytes":', b'"unused":NaN,"expandedBytes":')):
            with self.subTest(size=len(bad)), self.assertRaises(owner.Rejected):
                build.decode_packet(bad, 0)

    def test_snapshot_duplicate_unknown_and_noncanonical_bytes(self):
        raw = owner.encoded(snapshot())
        for bad in (b'{"schema":"f102-build-facts-v1",' + raw[1:], b' ' + raw,
                    json.dumps(snapshot(), indent=1).encode(), raw.replace(b'"schema":', b'"secret":"canary","schema":')):
            with self.subTest(size=len(bad)):
                self.reject(packet(expanded=bad))

    def test_zlib_truncation_trailing_and_concatenated_streams(self):
        p = packet()
        compressed = base64.b64decode(p['data'])
        for bad in (compressed[:-1], compressed + b'\x00', compressed + zlib.compress(b'{}'), b'not zlib'):
            with self.subTest(size=len(bad)):
                self.reject(dict(p, data=base64.b64encode(bad).decode()))

    def test_declared_length_bounds_decompression_bomb_before_parse(self):
        p = packet(expanded=b'x' * (build.MAX_SNAPSHOT + 1))
        self.reject(dict(p, expandedBytes=100))
        self.reject(p)
        actual = zlib.decompressobj
        calls = []
        class Decoder:
            def __init__(self):
                self.inner = actual()
            def decompress(self, data, limit):
                calls.append(limit)
                return self.inner.decompress(data, limit)
            def __getattr__(self, name):
                return getattr(self.inner, name)
        with patch.object(build.zlib, 'decompressobj', Decoder):
            self.reject(dict(p, expandedBytes=100))
        self.assertEqual(calls, [101])

    def test_guest_snapshot_and_compressed_packet_limits(self):
        with self.assertRaises(PROBE['Fault']):
            PROBE['packet']({'data': 'x' * build.MAX_SNAPSHOT})
        # Deterministic poorly compressing data, no resource/randomness probe.
        text = ''.join(owner.digest(str(i).encode()) for i in range(1800))
        with self.assertRaises(PROBE['Fault']):
            PROBE['packet']({'data': text})

    def test_independent_schema_rejects_every_nested_unknown_and_bad_integer(self):
        v = snapshot()
        paths = [(), ('identity',), ('os',), ('architecture',), ('packages', 0), ('packageState',),
                 ('packageState', 'pending'), ('packageState', 'holds', 0), ('resources',),
                 ('resources', 'filesystems'), ('resources', 'filesystems', '/'),
                 ('resources', 'memory'), ('resources', 'cpuAffinity'), ('locale',), ('keyring',)]
        for path in paths:
            changed = copy.deepcopy(v)
            target = changed
            for part in path:
                target = target[part]
            target['unexpected'] = True
            with self.subTest(path=path):
                self.reject(packet(changed))
        for path in (('identity', 'effectiveUid'), ('packageState', 'statusBytes'),
                     ('packageState', 'pending', 'broken'), ('resources', 'memory', 'totalBytes'),
                     ('resources', 'cpuAffinity', 'count'), ('keyring', 'bytes')):
            for wrong in (True, -1, 1.0, None, '1'):
                changed = copy.deepcopy(v)
                target = changed
                for part in path[:-1]:
                    target = target[part]
                target[path[-1]] = wrong
                with self.subTest(path=path, wrong=wrong):
                    self.reject(packet(changed))

    def test_crossfield_holds_broken_order_architecture_and_keyring(self):
        for mutate in (lambda v: v['packageState']['holds'].clear(),
                       lambda v: v['packageState'].update(statusBytes=1),
                       lambda v: v['packages'][0].update(Architecture='i386'),
                       lambda v: v['packageState']['pending'].update(broken=1),
                       lambda v: v['packageState']['pending'].update(clean=False),
                       lambda v: v['packageState']['pending'].update(updates=1),
                       lambda v: v['packageState']['pending'].update(triggers=True),
                       lambda v: v['packages'].reverse(), lambda v: v['packages'].append(v['packages'][0]),
                       lambda v: v['packages'][2].update(Architecture='arm64'),
                       lambda v: v['keyring'].update(packageVersion='wrong'),
                       lambda v: v['architecture'].update(foreign=['arm64', 'arm64']),
                       lambda v: v['architecture'].update(foreign=['amd64']),
                       lambda v: v['identity'].update(sudoIdentity='absent'),
                       lambda v: v['resources']['filesystems']['/'].update(availableBytes=1000),
                       lambda v: v['resources']['memory'].update(availableBytes=9000)):
            v = snapshot()
            mutate(v)
            self.reject(packet(v))

    def test_missing_is_observed_unknown_is_not_admitted(self):
        v = snapshot()
        v['keyring'].update(status='missing', sha256=None, bytes=None)
        v['resources']['filesystems']['/opt'] = dict.fromkeys(build.CAPACITY)
        v['resources']['filesystems']['/opt']['status'] = 'missing'
        self.assertEqual(build.decode_packet(owner.encoded(packet(v)), 0)[1], v)
        for target in ('memory', 'cpuAffinity', 'filesystem', 'locale', 'keyring'):
            changed = copy.deepcopy(v)
            if target == 'filesystem':
                changed['resources']['filesystems']['/opt']['status'] = 'unknown'
            elif target in ('memory', 'cpuAffinity'):
                obj = changed['resources'][target]
                obj.update({k: None for k in obj if k != 'status'})
                obj['status'] = 'unknown'
            else:
                obj = changed[target]
                obj.update({k: None for k in obj if k not in ('status', 'packageVersion')})
                obj['status'] = 'unknown'
            build.validate_snapshot(changed)  # representable, but not observed
            self.reject(packet(changed))

    def test_codec_fault_control_missing_eof_check_accepts_extra_stream(self):
        source = inspect.getsource(build.decode_packet).replace('and not decoder.unused_data', 'and True')
        scope = dict(vars(build))
        exec(source, scope)
        p = packet()
        p['data'] = base64.b64encode(base64.b64decode(p['data']) + zlib.compress(b'canary')).decode()
        self.assertIsNotNone(scope['decode_packet'](owner.encoded(p), 0)[1])
        self.reject(p)


class SyntheticFiles:
    """Maps only fixed metadata paths to private synthetic files/owned FDs.

    Identity/statvfs/affinity/uname/locale are injected values, never host facts.
    """
    def __init__(self, root):
        self.root, self.fds = root, set()
        self.paths = ('/var/lib/dpkg/lock-frontend', '/var/lib/dpkg/lock', '/var/lib/dpkg/status',
                      '/var/lib/dpkg/updates', '/var/lib/dpkg/triggers/Unincorp', '/var/lib/dpkg/arch',
                      '/usr/lib/os-release', '/proc/meminfo', '/usr/share/keyrings/debian-archive-keyring.gpg',
                      '/', '/opt', '/var/cache/apt')
        for path in self.paths:
            p = self.path(path)
            p.parent.mkdir(parents=True, exist_ok=True)
            if path in ('/', '/opt', '/var/cache/apt', '/var/lib/dpkg/updates'):
                p.mkdir(exist_ok=True)
                p.chmod(0o755)
            else:
                p.write_bytes(b'')
                p.chmod(0o644)
        self.path('/var/lib/dpkg/status').write_bytes(RAW)
        self.path('/var/lib/dpkg/arch').write_bytes(b'amd64\narm64\n')
        self.path('/usr/lib/os-release').write_bytes(b'ID=debian\nVERSION_ID="13.7"\n')
        self.path('/proc/meminfo').write_bytes(b'MemTotal:       8192 kB\nMemAvailable: 4096 kB\nOther: 9 kB\n')
        self.path('/usr/share/keyrings/debian-archive-keyring.gpg').write_bytes(b'synthetic public keyring')
        self.environ = {'SUDO_UID': '1000', 'SUDO_GID': '1000'}
        self.errors, self.opens = {}, []
        self.O_RDONLY, self.O_NONBLOCK, self.O_NOFOLLOW, self.O_CLOEXEC, self.O_DIRECTORY = (
            os.O_RDONLY, os.O_NONBLOCK, os.O_NOFOLLOW, os.O_CLOEXEC, os.O_DIRECTORY)

    def path(self, path):
        assert path in self.paths or path == '/'
        return self.root / ('rootfs' if path == '/' else path.lstrip('/'))

    def info(self, value):
        data = {k: getattr(value, k) for k in ('st_dev', 'st_ino', 'st_mode', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')}
        return SimpleNamespace(**data, st_uid=0, st_gid=0)

    def open(self, path, flags):
        self.opens.append((path, flags))
        if path in self.errors:
            raise self.errors[path]
        fd = os.open(self.path(path), flags)
        self.fds.add(fd)
        return fd

    def fstat(self, fd):
        assert fd in self.fds
        return self.info(os.fstat(fd))

    def stat(self, path, follow_symlinks=False):
        return self.info(os.stat(self.path(path), follow_symlinks=follow_symlinks))

    def pread(self, fd, size, offset):
        assert fd in self.fds
        return os.pread(fd, size, offset)

    def close(self, fd):
        assert fd in self.fds
        self.fds.remove(fd)
        os.close(fd)

    def scandir(self, fd):
        assert fd in self.fds
        return os.scandir(fd)

    def fstatvfs(self, fd):
        assert fd in self.fds
        return SimpleNamespace(f_bavail=100, f_bfree=200, f_blocks=300, f_frsize=4096,
                               f_favail=10, f_ffree=20, f_files=30)

    def sched_getaffinity(self, who):
        assert who == 0
        return {0, 1}

    def geteuid(self):
        return 0

    getegid = geteuid

    def uname(self):
        return SimpleNamespace(machine='x86_64')


class Guest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='build-facts-synthetic-')
        self.fs = SyntheticFiles(Path(self.temp.name))
        self.scope = definitions()
        self.scope['os'] = self.fs
        self.locks = Mock()
        self.scope['fcntl'] = SimpleNamespace(LOCK_SH=fcntl_shared(), LOCK_NB=fcntl_nonblock(), lockf=self.locks)
        self.system = self.scope['System']()
        self.system.locale = lambda: {'status': 'missing', 'available': False}

    def tearDown(self):
        self.system.close()
        self.assertFalse(self.fs.fds)
        self.temp.cleanup()

    def collect(self):
        return self.scope['collect'](self.system)

    def test_complete_collection_is_strictly_host_decodable(self):
        value = self.collect()
        self.assertEqual(value['architecture']['foreign'], ['arm64'])
        build.decode_packet(owner.encoded(self.scope['packet'](value)), 0)
        self.assertEqual(len(self.locks.call_args_list), 2)
        self.assertFalse(self.fs.fds)

    def test_existing_shared_nonblocking_readonly_locks_in_order(self):
        self.system.locks()
        self.assertEqual([p for p, _ in self.fs.opens], ['/var/lib/dpkg/lock-frontend', '/var/lib/dpkg/lock'])
        for _, flags in self.fs.opens:
            self.assertTrue(flags & os.O_NOFOLLOW and flags & os.O_NONBLOCK)
            self.assertEqual(flags & (os.O_CREAT | os.O_TRUNC | os.O_RDWR | os.O_WRONLY), 0)
        for args in self.locks.call_args_list:
            self.assertEqual(args.args[1], fcntl_shared() | fcntl_nonblock())

    def test_missing_unreadable_or_contended_lock_is_package_lock(self):
        for path in ('/var/lib/dpkg/lock-frontend', '/var/lib/dpkg/lock'):
            for error in (FileNotFoundError(), PermissionError()):
                self.fs.errors[path] = error
                with self.subTest(path=path, error=type(error)), self.assertRaisesRegex(self.scope['Fault'], 'package-lock'):
                    self.collect()
                del self.fs.errors[path]
        self.locks.side_effect = BlockingIOError()
        with self.assertRaisesRegex(self.scope['Fault'], 'package-lock'):
            self.collect()

    def test_replaced_lock_binding_after_acquisition_refuses_snapshot(self):
        original = self.system.resources
        def replace():
            value = original()
            path = self.fs.path('/var/lib/dpkg/lock')
            path.rename(path.with_name('old-lock'))
            path.write_bytes(b'')
            return value
        self.system.resources = replace
        with self.assertRaisesRegex(self.scope['Fault'], 'custody'):
            self.collect()

    def test_status_mutation_and_replacement_are_not_a_stable_snapshot(self):
        for replacement in (False, True):
            original = self.system.resources
            def mutate():
                value = original()
                path = self.fs.path('/var/lib/dpkg/status')
                if replacement:
                    path.rename(path.with_name('old-status'))
                path.write_bytes(RAW.replace(b'1.22.22', b'1.22.23'))
                return value
            self.system.resources = mutate
            with self.subTest(replacement=replacement), self.assertRaisesRegex(self.scope['Fault'], 'custody'):
                self.collect()
            self.system.resources = original
            self.fs.path('/var/lib/dpkg/status').write_bytes(RAW)

    def test_same_stamp_changed_bytes_are_independently_detected(self):
        self.system.locks()
        self.system.read('/var/lib/dpkg/status', 8388608)
        actual = self.fs.pread
        self.fs.pread = lambda fd, size, offset: actual(fd, size, offset).replace(b'1.22.22', b'1.22.23')
        with self.assertRaisesRegex(self.scope['Fault'], 'custody'):
            self.system.verify()

    def test_unapplied_journals_and_unknown_update_entries_refuse(self):
        directory = self.fs.path('/var/lib/dpkg/updates')
        for name in ('0000', 'tmp.i', 'unknown'):
            path = directory / name
            path.write_bytes(b'')
            with self.subTest(name=name), self.assertRaisesRegex(self.scope['Fault'], 'package-state'):
                self.collect()
            path.unlink()

    def test_pending_triggers_and_unreadable_pending_metadata_refuse(self):
        path = self.fs.path('/var/lib/dpkg/triggers/Unincorp')
        path.write_bytes(b'glib trigger\n')
        with self.assertRaisesRegex(self.scope['Fault'], 'package-state'):
            self.collect()
        path.write_bytes(b'')
        self.fs.errors['/var/lib/dpkg/triggers/Unincorp'] = PermissionError()
        with self.assertRaisesRegex(self.scope['Fault'], 'package-state'):
            self.collect()

    def test_missing_unincorp_is_known_but_appearance_is_race(self):
        path = self.fs.path('/var/lib/dpkg/triggers/Unincorp')
        path.unlink()
        self.system.pending()
        path.write_bytes(b'')
        with self.assertRaisesRegex(self.scope['Fault'], 'custody'):
            self.system.verify()

    def test_updates_directory_changes_during_snapshot_refuse(self):
        self.system.pending()
        (self.fs.path('/var/lib/dpkg/updates') / '0000').touch()
        with self.assertRaisesRegex(self.scope['Fault'], 'custody'):
            self.system.verify()

    def test_architecture_file_semantics_missing_duplicate_unreadable(self):
        records = PROBE['package_records'](RAW)
        path = self.fs.path('/var/lib/dpkg/arch')
        path.unlink()
        self.assertEqual(self.system.architecture(records)['foreign'], [])
        for raw in (b'', b'arm64\n', b'amd64\namd64\n', b'amd64\nall\n', b'amd64\n../bad\n', b'amd64\n\xff'):
            path.write_bytes(raw)
            path.chmod(0o644)
            with self.subTest(raw=raw), self.assertRaises((self.scope['Fault'], UnicodeError)):
                self.system.architecture(records)
        self.fs.errors['/var/lib/dpkg/arch'] = PermissionError()
        with self.assertRaises(PermissionError):
            self.system.architecture(records)

    def test_architecture_requires_installed_dpkg_amd64(self):
        for change in ({'Architecture': 'i386'}, {'Status': 'deinstall ok config-files'}):
            records = PROBE['package_records'](RAW)
            records[2].update(change)
            with self.subTest(change=change), self.assertRaisesRegex(self.scope['Fault'], 'architecture'):
                self.system.architecture(records)

    def test_installed_foreign_package_must_be_configured_in_arch_file(self):
        records = PROBE['package_records'](RAW)
        records[0]['Architecture'] = 'i386'
        with self.assertRaisesRegex(self.scope['Fault'], 'architecture'):
            self.system.architecture(records)
        records[0]['Architecture'] = 'arm64'
        self.assertEqual(self.system.architecture(records)['foreign'], ['arm64'])

    def test_resources_distinguish_missing_unreadable_and_known_zero(self):
        self.fs.path('/opt').rmdir()
        self.fs.errors['/var/cache/apt'] = PermissionError()
        value = self.system.resources()
        self.assertEqual(value['filesystems']['/opt'], dict(status='missing', **dict.fromkeys(build.CAPACITY)))
        self.assertEqual(value['filesystems']['/var/cache/apt']['status'], 'unknown')
        self.assertIsNone(value['filesystems']['/var/cache/apt']['availableBytes'])
        self.fs.fstatvfs = lambda fd: SimpleNamespace(f_bavail=0, f_bfree=0, f_blocks=300, f_frsize=4096,
                                                     f_favail=0, f_ffree=0, f_files=30)
        value = self.system.resources()
        self.assertEqual(value['filesystems']['/']['availableBytes'], 0)
        self.assertEqual(value['filesystems']['/']['status'], 'known')

    def test_bad_memory_affinity_and_negative_capacities_are_unknown(self):
        for raw in (b'MemTotal: 8 kB\n', b'MemTotal: 8 kB\nMemAvailable: 9 kB',
                    b'MemTotal: 8 kB\nMemTotal: 8 kB\nMemAvailable: 1 kB', b'\xff'):
            self.fs.path('/proc/meminfo').write_bytes(raw)
            self.assertEqual(self.system.resources()['memory']['status'], 'unknown')
        self.fs.sched_getaffinity = lambda who: set()
        self.assertIsNone(self.system.resources()['cpuAffinity']['count'])
        self.fs.fstatvfs = lambda fd: SimpleNamespace(f_bavail=-1, f_bfree=0, f_blocks=1, f_frsize=4096,
                                                     f_favail=0, f_ffree=0, f_files=1)
        self.assertEqual(self.system.resources()['filesystems']['/']['status'], 'unknown')

    def test_missing_keyring_and_unreadable_public_keyring_are_distinct(self):
        self.fs.path('/usr/share/keyrings/debian-archive-keyring.gpg').unlink()
        missing = self.system.keyring('2025.1')
        self.assertEqual(missing, {'status': 'missing', 'sha256': None, 'bytes': None, 'packageVersion': '2025.1'})
        self.fs.errors['/usr/share/keyrings/debian-archive-keyring.gpg'] = PermissionError()
        self.assertEqual(self.system.keyring('2025.1')['status'], 'unknown')

    def test_keyring_symlink_hardlink_and_oversize_are_unavailable(self):
        path = self.fs.path('/usr/share/keyrings/debian-archive-keyring.gpg')
        path.unlink()
        path.symlink_to(self.fs.path('/var/lib/dpkg/status'))
        self.assertEqual(self.system.keyring(None)['status'], 'unknown')
        path.unlink()
        os.link(self.fs.path('/var/lib/dpkg/status'), path)
        self.assertEqual(self.system.keyring(None)['status'], 'unknown')
        path.unlink()
        path.write_bytes(b'x' * 262145)
        self.assertEqual(self.system.keyring(None)['status'], 'unknown')

    def test_identity_and_os_fail_closed_with_injected_facts(self):
        self.fs.environ['SUDO_GID'] = '1001'
        with self.assertRaisesRegex(self.scope['Fault'], 'identity'):
            self.collect()
        self.fs.environ['SUDO_GID'] = '1000'
        for raw in (b'ID=ubuntu\nVERSION_ID=13\n', b'ID=debian\nVERSION_ID=12\n', b'ID=debian\nID=debian\nVERSION_ID=13\n'):
            self.fs.path('/usr/lib/os-release').write_bytes(raw)
            with self.subTest(raw=raw), self.assertRaisesRegex(self.scope['Fault'], 'os'):
                self.collect()

    def test_first_collection_failure_survives_close_failure(self):
        self.system.identity = Mock(side_effect=self.scope['Fault']('identity'))
        self.system.close = Mock(side_effect=OSError('private canary'))
        with self.assertRaisesRegex(self.scope['Fault'], 'identity'):
            self.collect()
        self.system.close = lambda: None

    def test_deadline_is_fixed_failure_and_all_retained_fds_close(self):
        original = self.system.architecture
        self.system.architecture = Mock(side_effect=self.scope['Deadline']())
        with self.assertRaisesRegex(self.scope['Fault'], 'deadline'):
            self.collect()
        self.assertFalse(self.fs.fds)
        self.system.architecture = original

    def test_locale_uses_local_handle_and_errno_without_global_mutation(self):
        for handle, error, status in ((123, 0, 'known'), (0, errno.ENOENT, 'missing'), (0, errno.EACCES, 'unknown')):
            newlocale, freelocale = Mock(return_value=handle), Mock()
            libc = SimpleNamespace(newlocale=newlocale, freelocale=freelocale)
            self.scope['ctypes'] = SimpleNamespace(CDLL=Mock(return_value=libc), set_errno=Mock(),
                get_errno=Mock(return_value=error), c_int=int, c_char_p=bytes, c_void_p=int)
            result = self.scope['System'].locale(self.system)
            self.assertEqual(result['status'], status)
            newlocale.assert_called_once_with(0x1fbf, b'en_US.UTF-8', None)
            self.assertEqual(freelocale.call_count, int(bool(handle)))


def fcntl_shared():
    import fcntl
    return fcntl.LOCK_SH


def fcntl_nonblock():
    import fcntl
    return fcntl.LOCK_NB


class Files(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='build-facts-owner-offline-')
        self.root = Path(self.temp.name)
        prepare(self.root)
        self.lease = reserved(self.root)

    def tearDown(self):
        self.lease.close()
        self.temp.cleanup()

    def renew(self):
        self.lease.close()
        self.lease = reserved(self.root)

    def test_permit_exact_fourteen_keys_and_all_three_source_pins(self):
        self.assertEqual(len(permit(self.root)), 14)
        for key in ('ownerSha256', 'buildFactsOwnerSha256', 'buildFactsProbeSha256'):
            for bad in ('0' * 64, 'A' * 64, None):
                self.lease.close()
                write_permit(self.root, dict(permit(self.root), **{key: bad}))
                self.lease = build.BuildFactsReservation(self.root)
                self.lease.acquire()
                with self.subTest(key=key, bad=bad), self.assertRaises(owner.Rejected):
                    self.lease.permit('1' * 64, '5' * 64, build.PROBE_SHA256)

    def test_closed_domain_fixed_account_capture_identity_and_no_native_admission(self):
        changes = ({'jobKind': 'inventory-only'}, {'schema': True}, {'guestAccount': 'root'},
                   {'guestPrivilege': 'root'}, {'buildFactsAuthorityReviewed': 1}, {'buildFactsAuthorityReviewed': False},
                   {'captureId': '../../escape'}, {'captureId': CAPTURE.upper()}, {'captureId': CAPTURE.replace('-4', '-1')},
                   {'containerId': 'foreign'}, {'imageId': 'foreign'}, {'labRoot': '/tmp'}, {'labInode': True},
                   {'labDevice': -1}, {'command': 'apt install'})
        for change in changes:
            self.lease.close()
            write_permit(self.root, dict(permit(self.root), **change))
            self.lease = build.BuildFactsReservation(self.root)
            self.lease.acquire()
            with self.subTest(change=change), self.assertRaises(owner.Rejected):
                self.lease.permit('1' * 64, '5' * 64, build.PROBE_SHA256)
        self.lease.close()
        native.write_permit(self.root, permit(self.root))
        self.lease = owner.Reservation(self.root)
        self.lease.acquire()
        with self.assertRaises(owner.Rejected):
            self.lease.permit('1' * 64)

    def test_unsafe_permit_objects_duplicates_and_mutation(self):
        path = self.root / build.PERMIT
        for kind in ('mutable', 'symlink', 'hardlink', 'fifo', 'duplicate', 'oversized'):
            self.lease.close()
            path.unlink()
            if kind == 'symlink':
                path.symlink_to(self.root / owner.PERMIT)
            elif kind == 'fifo':
                os.mkfifo(path, 0o400)
            else:
                raw = owner.encoded(permit(self.root))
                raw = b'{"schema":1,' + raw[1:] if kind == 'duplicate' else raw
                raw = b'x' * 65537 if kind == 'oversized' else raw
                path.write_bytes(raw)
                path.chmod(0o600 if kind == 'mutable' else 0o400)
                if kind == 'hardlink':
                    os.link(path, self.root / 'permit-alias')
            self.lease = build.BuildFactsReservation(self.root)
            self.lease.acquire()
            with self.subTest(kind=kind), self.assertRaises((OSError, owner.Rejected)):
                self.lease.permit('1' * 64, '5' * 64, build.PROBE_SHA256)

    def test_retained_permit_binding_and_bytes(self):
        path = self.root / build.PERMIT
        raw = path.read_bytes()
        path.chmod(0o600)
        path.write_bytes(raw + b' ')
        path.chmod(0o400)
        with self.assertRaises(owner.Rejected):
            self.lease.check()
        path.rename(self.root / 'previous-permit')
        write_permit(self.root)
        with self.assertRaises(owner.Rejected):
            self.lease.check()

    def test_foreign_native_and_inventory_markers_refuse_without_cleanup(self):
        self.lease.close()
        previous = native.reserved(self.root)
        previous.create_marker()
        previous.close()
        self.lease = reserved(self.root)
        lab = FakeLab(self.lease)
        result = owner.transact(self.lease, lab)
        self.assertEqual(result['firstFailure'], 'foreign')
        self.assertFalse(lab.calls)
        self.assertTrue((self.root / owner.MARKER).exists())

    def test_changed_capture_cannot_recover_earlier_permit_marker(self):
        self.lease.create_marker()
        self.lease.close()
        write_permit(self.root, dict(permit(self.root), captureId='12345678-1234-4234-8234-123456789abd'))
        self.lease = reserved(self.root)
        lab = FakeLab(self.lease)
        self.assertEqual(owner.transact(self.lease, lab)['firstFailure'], 'foreign')
        self.assertFalse(lab.calls)

    def test_success_private_artifact_and_closed_public_summary(self):
        lab = FakeLab(self.lease)
        result = owner.transact(self.lease, lab)
        self.assertEqual(lab.calls, ['inspect', 'start', 'ready', 'dispatch', 'cleanup'])
        self.assertEqual(result['status'], 'completed')
        path = self.root / self.lease.artifact_name()
        self.assertEqual(path.read_bytes(), owner.encoded(snapshot()))
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o400)
        self.assertEqual(result['artifact'], {'device': path.stat().st_dev, 'inode': path.stat().st_ino})
        public = build.public_result(result)
        self.assertLessEqual(len(owner.encoded(result)), 4096)
        self.assertLessEqual(len(owner.encoded(public)), 4096)
        self.assertEqual(set(public), {'schema', 'jobKind', 'lifecycle', 'buildFacts', 'acceptance'})
        for absent in ('packages', 'Package', 'inode', 'device', 'nativeRuns', str(self.root)):
            self.assertNotIn(absent, owner.encoded(public).decode())
        self.assertEqual(public['acceptance'], 'pending')
        self.assertFalse((self.root / owner.MARKER).exists())

    def test_existing_artifact_refuses_before_marker_or_start_even_symlink(self):
        path = self.root / self.lease.artifact_name()
        for kind in ('regular', 'symlink', 'fifo', 'directory'):
            self.renew()
            if kind == 'regular':
                path.write_bytes(b'previous')
            elif kind == 'symlink':
                path.symlink_to(self.root / 'absent')
            elif kind == 'fifo':
                os.mkfifo(path)
            else:
                path.mkdir()
            lab = FakeLab(self.lease)
            result = owner.transact(self.lease, lab)
            self.assertEqual(result['firstFailure'], 'custody')
            self.assertEqual(lab.calls, ['inspect'])
            self.assertFalse(result['mayHaveStarted'])
            self.assertFalse((self.root / owner.MARKER).exists())
            path.rmdir() if kind == 'directory' else path.unlink()

    def test_owned_interrupted_marker_recovers_before_artifact_collision(self):
        self.lease.create_marker()
        self.lease.state['mayHaveStarted'] = True
        self.lease.state['mayHaveDispatched'] = True
        self.lease.save()
        (self.root / self.lease.artifact_name()).write_bytes(b'old partial')
        self.renew()
        lab = FakeLab(self.lease)
        result = owner.transact(self.lease, lab)
        self.assertEqual(result['status'], 'recovered')
        self.assertEqual(lab.calls, ['recover', 'cleanup'])
        self.assertFalse((self.root / owner.MARKER).exists())
        self.assertEqual((self.root / self.lease.artifact_name()).read_bytes(), b'old partial')

    def test_valid_unavailable_packet_preserves_failure_and_no_artifact(self):
        lab = FakeLab(self.lease)
        lab.reply, lab.code = owner.encoded(PROBE['unavailable']('package-lock')), 3
        result = owner.transact(self.lease, lab)
        self.assertEqual(result['firstFailure'], 'transport')
        self.assertEqual(result['buildFacts']['firstFailure'], 'package-lock')
        self.assertTrue(result['transportResultValid'])
        self.assertTrue(result['reservationClean'])
        self.assertIsNone(result['artifact'])
        self.assertFalse((self.root / self.lease.artifact_name()).exists())

    def test_bad_packet_not_published_and_cleanup_still_occurs(self):
        lab = FakeLab(self.lease)
        lab.reply = b'private canary'
        result = owner.transact(self.lease, lab)
        self.assertEqual(result['firstFailure'], 'protocol')
        self.assertEqual(result['buildFacts'], build.empty_facts())
        self.assertTrue(result['reservationClean'])
        self.assertFalse((self.root / self.lease.artifact_name()).exists())

    def test_short_writes_loop_and_zero_write_retains_partial_without_claim(self):
        real = os.pwrite
        artifact = self.lease.artifact_name()
        def short(fd, data, offset):
            return real(fd, data[:37], offset) if self.lease.artifactfd == fd else real(fd, data, offset)
        with patch.object(owner.os, 'pwrite', short):
            result = owner.transact(self.lease, FakeLab(self.lease))
        self.assertEqual(result['status'], 'completed')
        self.lease.close()
        (self.root / artifact).unlink()
        self.lease = reserved(self.root)
        def zero(fd, data, offset):
            return 0 if self.lease.artifactfd == fd else real(fd, data, offset)
        with patch.object(owner.os, 'pwrite', zero):
            lab = FakeLab(self.lease)
            result = owner.transact(self.lease, lab)
        self.assertEqual(result['firstFailure'], 'custody')
        self.assertFalse(result['transportResultValid'])
        self.assertEqual(lab.calls[-1], 'cleanup')
        self.assertTrue(result['containerStoppedVerified'])
        self.assertFalse(result['reservationClean'])
        self.assertTrue((self.root / artifact).exists())
        self.assertTrue((self.root / owner.MARKER).exists())

    def test_short_write_lie_is_detected_by_readback(self):
        real = os.pwrite
        def lie(fd, raw, offset):
            if self.lease.artifactfd == fd:
                return len(raw)
            return real(fd, raw, offset)
        with patch.object(owner.os, 'pwrite', lie):
            result = owner.transact(self.lease, FakeLab(self.lease))
        self.assertEqual(result['firstFailure'], 'custody')
        self.assertFalse(result['transportResultValid'])

    def test_artifact_readback_fault_control_detects_disabled_guard(self):
        real = os.pwrite
        def lie(fd, raw, offset):
            return len(raw) if self.lease.artifactfd == fd else real(fd, raw, offset)
        with patch.object(owner.os, 'pwrite', lie), patch.object(self.lease, 'check_artifact', lambda: None):
            self.lease.publish(owner.encoded(snapshot()))
        self.assertEqual((self.root / self.lease.artifact_name()).read_bytes(), b'')
        # Above deliberately disabled guard admitted a real empty artifact.
        with self.assertRaises(owner.Rejected):
            self.lease.check_artifact()

    def test_fsync_failure_retains_identity_and_partial_custody(self):
        real = os.fsync
        def fail(fd):
            if fd == self.lease.artifactfd:
                raise OSError('synthetic fsync')
            return real(fd)
        with patch.object(owner.os, 'fsync', fail):
            result = owner.transact(self.lease, FakeLab(self.lease))
        self.assertEqual(result['firstFailure'], 'custody')
        self.assertFalse(result['reservationClean'])
        self.assertFalse(result['transportResultValid'])
        self.assertTrue((self.root / self.lease.artifact_name()).exists())

    def test_close_ambiguity_never_retries_or_claims_publication(self):
        real = os.close
        attempted = []
        def fail(fd):
            # publish sets artifactfd=None and uncertain=True BEFORE close.
            if self.lease.artifact_uncertain and self.lease.artifactfd is None and not attempted:
                attempted.append(fd)
                real(fd)
                raise OSError('synthetic close after actual close')
            return real(fd)
        with patch.object(owner.os, 'close', fail):
            result = owner.transact(self.lease, FakeLab(self.lease))
        self.assertEqual(len(attempted), 1)
        self.assertFalse(result['transportResultValid'])
        self.assertFalse(result['reservationClean'])
        self.assertTrue((self.root / self.lease.artifact_name()).exists())

    def test_artifact_replacement_during_write_is_preserved_and_never_adopted(self):
        path = self.root / self.lease.artifact_name()
        real = os.pwrite
        replaced = []
        def swap(fd, raw, offset):
            written = real(fd, raw, offset)
            if fd == self.lease.artifactfd and not replaced:
                path.rename(self.root / 'original-artifact')
                path.write_bytes(b'foreign replacement')
                path.chmod(0o400)
                replaced.append(True)
            return written
        with patch.object(owner.os, 'pwrite', swap):
            result = owner.transact(self.lease, FakeLab(self.lease))
        self.assertEqual(result['firstFailure'], 'custody')
        self.assertFalse(result['transportResultValid'])
        self.assertEqual(path.read_bytes(), b'foreign replacement')
        self.assertTrue((self.root / 'original-artifact').exists())

    def test_exclusive_create_closes_race_after_preflight(self):
        path = self.root / self.lease.artifact_name()
        class RacedLab(FakeLab):
            def dispatch(inner, budget):
                value = super().dispatch(budget)
                path.write_bytes(b'foreign')
                return value
        result = owner.transact(self.lease, RacedLab(self.lease))
        self.assertFalse(result['transportResultValid'])
        self.assertEqual(path.read_bytes(), b'foreign')

    def test_caller_independently_checks_guardian_identity_and_content(self):
        result = owner.transact(self.lease, FakeLab(self.lease))
        original = copy.deepcopy(result)
        self.renew()
        self.assertEqual(self.lease.validate_reply(copy.deepcopy(result)), original)
        self.lease.close()
        path = self.root / ('f102-build-facts-' + CAPTURE + '.json')
        path.rename(self.root / 'previous-artifact')
        path.write_bytes(owner.encoded(snapshot()))
        path.chmod(0o400)
        self.lease = reserved(self.root)
        value = self.lease.validate_reply(result)
        self.assertEqual(value['firstFailure'], 'custody')
        self.assertFalse(value['transportResultValid'])
        self.assertFalse(value['reservationClean'])
        self.assertEqual(value['buildFacts'], build.empty_facts())

    def test_publication_interruption_is_atomic_before_and_after_commit(self):
        method = build.BuildFactsLab.validate_job_reply
        lines, start = inspect.getsourcelines(method)
        for after in (False, True):
            self.renew()
            boundary = start + next(i for i, line in enumerate(lines) if
                                   ('return snapshot is not None' if after else 'result.update(buildFacts=') in line)
            fired = []
            def trace(frame, event, _arg):
                if event == 'line' and frame.f_code is method.__code__ and frame.f_lineno == boundary and not fired:
                    fired.append(True)
                    raise owner.Rejected('interrupted')
                return trace
            try:
                sys.settrace(trace)
                result = owner.transact(self.lease, FakeLab(self.lease))
            finally:
                sys.settrace(None)
            self.assertEqual(fired, [True])
            self.assertEqual(result['firstFailure'], 'interrupted')
            self.assertEqual(result['transportResultValid'], after)
            self.assertEqual(result['buildFacts']['status'], 'observed' if after else 'not-received')
            self.assertTrue(result['mayHaveStarted'] and result['mayHaveDispatched'])
            self.assertTrue(result['reservationClean'])
            self.lease.close()
            (self.root / self.lease.artifact_name()).unlink()

    def test_first_operation_failure_separate_from_cleanup_and_attempt_flags(self):
        lab = FakeLab(self.lease, cleanup=('stop', True, False, True))
        lab.reply = b'not JSON'
        result = owner.transact(self.lease, lab)
        self.assertEqual(result['firstFailure'], 'protocol')
        self.assertEqual(result['cleanupFailure'], 'stop')
        self.assertTrue(result['mayHaveStarted'] and result['mayHaveDispatched'])
        self.assertFalse(result['reservationClean'])

    def test_relay_count_digest_and_identity_do_not_bypass_retained_artifact(self):
        value = owner.transact(self.lease, FakeLab(self.lease))
        for key, wrong in (('packageCount', 1), ('bytes', 1), ('sha256', '0' * 64)):
            changed = copy.deepcopy(value)
            changed['buildFacts'][key] = wrong
            invalid = self.lease.validate_reply(changed)
            self.assertFalse(invalid['transportResultValid'])
            self.renew()
            self.lease.validate_reply(copy.deepcopy(value))
        changed = copy.deepcopy(value)
        changed['artifact']['inode'] += 1
        self.assertFalse(self.lease.validate_reply(changed)['transportResultValid'])

    def test_unavailable_failure_survives_later_descriptor_custody_failure(self):
        lab = FakeLab(self.lease)
        lab.reply, lab.code = owner.encoded(PROBE['unavailable']('architecture')), 3
        value = owner.transact(self.lease, lab)
        self.lease.invalidate(value)
        self.assertEqual(value['firstFailure'], 'transport')
        self.assertEqual(value['cleanupFailure'], 'custody')
        self.assertEqual(value['buildFacts']['firstFailure'], 'architecture')
        self.assertTrue(value['transportResultValid'])

    def test_relay_rejects_false_observation_and_private_extra_keys(self):
        for mutate in (lambda v: v.update(transportResultValid=True),
                       lambda v: v.update(artifact={'device': 1, 'inode': 2}),
                       lambda v: v['buildFacts'].update(packageCount=0),
                       lambda v: v.update(private='canary'),
                       lambda v: v['buildFacts'].update(status='observed')):
            value = self.lease.result()
            mutate(value)
            with self.assertRaises(owner.Rejected):
                build.public_result(value)


class Wiring(unittest.TestCase):
    def test_fixed_transport_quoting_readiness_and_poweroff(self):
        pin = {'guestAccount': 'linuxcast', 'guestPrivilege': 'sudo-noninteractive'}
        argv = build.facts_argv(pin)
        self.assertEqual(argv, owner.fixed_ssh_argv(pin, ('/usr/bin/python3', '-I', '-B', '-c', shlex.quote(build.PROBE_SOURCE))))
        self.assertEqual(shlex.split(argv[-1]), [build.PROBE_SOURCE])
        self.assertEqual(build.facts_argv(pin, True), owner.fixed_ssh_argv(pin, ('/usr/bin/true',)))
        self.assertIn('/usr/bin/sudo', argv)
        for forbidden in ('lab_namespace.py', 'apt-get', 'scp', 'sftp', 'install', 'bash', 'sh'):
            self.assertNotIn(forbidden, argv)
        self.assertIn('/usr/bin/systemctl', owner.transport_argv(pin, 'poweroff'))
        self.assertEqual((owner.START_SECONDS, owner.CLEAN_SECONDS, owner.TOTAL_SECONDS, build.BuildFactsLab.job_seconds), (120, 45, 600, 30))

    def test_closed_cli_rejects_overrides_before_any_resource_access(self):
        with patch.object(build, 'BuildFactsReservation', side_effect=AssertionError('no lease')):
            for args in ([], ['--reviewed-owner'], ['--reviewed-build-facts-owner'],
                         ['--reviewed-build-facts-owner', '--reviewed-build-facts-probe', '--command', 'true'],
                         ['--reviewed-build-facts-o', '--reviewed-build-facts-probe'],
                         ['--reviewed-build-facts-owner', '--reviewed-build-facts-probe', '--timeout', '50']):
                with self.subTest(args=args), patch('sys.stderr', io.StringIO()), self.assertRaises(SystemExit) as caught:
                    build.main(args)
                self.assertEqual(caught.exception.code, 3)

    def test_import_and_embedded_definitions_are_inert(self):
        tree = ast.parse(Path(build.__file__).read_text())
        # Reexecute module with all effectful APIs trapped; hashlib/stdlib imports
        # and source construction alone remain allowed.
        scope = {'__name__': 'synthetic_inert_import', '__file__': build.__file__}
        with patch.object(os, 'open', side_effect=AssertionError('open')), \
             patch.object(os, 'statvfs', side_effect=AssertionError('resource')), \
             patch.object(subprocess, 'Popen', side_effect=AssertionError('child')):
            exec(compile(tree, '<inert-owner-import>', 'exec'), scope)
            definitions()
        self.assertEqual(scope['PROBE_SHA256'], build.PROBE_SHA256)

    def test_source_pins_bind_unchanged_base_new_owner_probe_and_inventory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ('lab_owner.py', 'lab_build_facts.py', 'outer-owner-inventory.json'):
                target = root / name
                target.write_bytes(Path(build.__file__).with_name(name).read_bytes())
                target.chmod(0o600)
            with patch.object(build, '__file__', str(root / 'lab_build_facts.py')):
                base, source, probe, inventory = build.source_pins()
                actual = owner.read_source
                def tamper(path, limit):
                    raw = actual(path, limit)
                    return raw + b' ' if Path(path).name == 'outer-owner-inventory.json' else raw
                with patch.object(owner, 'read_source', tamper), self.assertRaises(owner.Rejected):
                    build.source_pins()
        self.assertEqual(base, owner.digest(Path(owner.__file__).read_bytes()))
        self.assertEqual(source, owner.digest(Path(build.__file__).read_bytes()))
        self.assertEqual(probe, owner.digest(build.PROBE_SOURCE.encode()))
        self.assertEqual(inventory['containerId'], owner.CONTAINER)

    def test_start_and_dispatch_recheck_all_source_pins_before_launch(self):
        lease = SimpleNamespace(pin={'buildFactsAuthorityReviewed': True, 'ownerSha256': '1' * 64,
                                    'buildFactsOwnerSha256': '5' * 64, 'buildFactsProbeSha256': build.PROBE_SHA256},
                                check=Mock(), intent=Mock())
        lab = build.BuildFactsLab(lease, {})
        lab.children = SimpleNamespace(run=Mock(side_effect=AssertionError('no launch')))
        with patch.object(build, 'source_pins', return_value=('0' * 64, '5' * 64, build.PROBE_SHA256, {})):
            for operation in (lambda: lab.command('start', owner.Budget(1)), lambda: lab.dispatch(owner.Budget(1))):
                with self.assertRaisesRegex(owner.Rejected, 'custody'):
                    operation()
        self.assertFalse(lab.start_attempted)
        self.assertTrue(lab.dispatch_attempted)
        with self.assertRaisesRegex(owner.Rejected, 'reservation'):
            lab.dispatch(owner.Budget(1))
        lab.children.run.assert_not_called()

    def test_readiness_only_repeats_true_and_dispatch_is_exact_once(self):
        pin = {'guestAccount': 'linuxcast', 'guestPrivilege': 'sudo-noninteractive'}
        lease = SimpleNamespace(pin=pin, check=Mock(), intent=Mock())
        lab = build.BuildFactsLab(lease, {})
        run = Mock(side_effect=[(255, b''), (0, b'')])
        lab.children = SimpleNamespace(run=run)
        # No clocks, deadlines, or owner guards are changed.
        lab.ready(owner.Budget(1))
        self.assertEqual([c.args[0] for c in run.call_args_list], [build.facts_argv(pin, True)] * 2)
        lab.children.run = Mock(return_value=(3, b''))
        lab.check_sources = lambda: None
        lab.dispatch(owner.Budget(1))
        with self.assertRaises(owner.Rejected):
            lab.dispatch(owner.Budget(1))
        lab.children.run.assert_called_once()
        lease.intent.assert_called_once_with('mayHaveDispatched')

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
                        if argv == build.facts_argv(lease.pin, True):
                            calls.append('true')
                            return 0, b''
                        if argv == build.facts_argv(lease.pin):
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
                lab = build.BuildFactsLab(lease, inventory)
                lab.children = Client()
                actual = os.pwrite
                def write(fd, data, offset):
                    if fail_artifact and fd == lease.artifactfd:
                        return 0
                    return actual(fd, data, offset)
                try:
                    with patch.object(lab, 'check_sources'), patch.object(owner.os, 'pwrite', write), \
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

    def test_no_guest_command_install_network_native_or_privileged_probe(self):
        tree = ast.parse(build.PROBE_SOURCE)
        imports = {n.names[0].name for n in tree.body if isinstance(n, ast.Import)}
        self.assertFalse(imports & {'subprocess', 'socket', 'urllib', 'resource'})
        attributes = {n.attr for n in ast.walk(tree) if isinstance(n, ast.Attribute)}
        self.assertFalse(attributes & {'fork', 'system', 'execve', 'setuid', 'setgid', 'unshare', 'setlocale', 'chmod', 'unlink', 'kill'})
        self.assertIn('setitimer', attributes)
        self.assertIn('25', build.PROBE_SOURCE)
        self.assertNotIn('sys.argv', build.PROBE_SOURCE)
        self.assertEqual(owner.MAX_BYTES, 65536)


# The external fixture entry point is ONLY ordinary-process tests. Its independent
# supervisor is the reviewed FixtureGuard, not any implementation cleanup helper.
def supervise(mode):
    import fcntl
    guard = native.FixtureGuard()
    code = None
    with tempfile.TemporaryFile() as output:
        def work():
            with tempfile.TemporaryDirectory(prefix='build-facts-ordinary-') as directory:
                root = Path(directory)
                if mode == 'locks':
                    fs = SyntheticFiles(root)
                    local_guard = native.FixtureGuard()
                    readfd, writefd = os.pipe2(os.O_CLOEXEC)
                    def holder():
                        fd = os.open(fs.path('/var/lib/dpkg/lock-frontend'), os.O_RDWR)
                        fcntl.lockf(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                        os.write(writefd, b'G')
                        signal.pause()
                    try:
                        pid = local_guard.spawn(holder)
                        os.close(writefd)
                        import select
                        if not select.select([readfd], [], [], .5)[0] or os.read(readfd, 1) != b'G':
                            raise RuntimeError('lock child readiness')
                        scope = definitions()
                        scope['os'] = fs
                        system = scope['System']()
                        try:
                            try:
                                system.locks()
                            except BlockingIOError:
                                blocked = True
                            else:
                                blocked = False
                        finally:
                            system.close()
                    finally:
                        os.close(readfd)
                        absent = local_guard.cleanup()
                    value = {'blocked': blocked, 'independentAbsence': absent}
                else:
                    prepare(root)
                    lease = reserved(root)
                    try:
                        def factory(held, check):
                            lab = FakeLab(held, check)
                            if mode == 'publication-failure':
                                actual_write = os.pwrite
                                def write(fd, data, offset):
                                    return 0 if fd == held.artifactfd else actual_write(fd, data, offset)
                                os.pwrite = write
                            if mode == 'unavailable':
                                lab.reply, lab.code = owner.encoded(PROBE['unavailable']('packages')), 3
                            return lab
                        result = owner.run_guarded(lease, factory)
                        value = {'result': build.public_result(result), 'cleanClose': lease.close()}
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
        print(json.dumps({'result': value, 'independentAbsence': absent}))


class OrdinaryProcesses(unittest.TestCase):
    def fixture(self, mode):
        result = subprocess.run([sys.executable, '-B', str(Path(__file__).resolve()), '--ordinary-fixture', mode],
                                stdin=subprocess.DEVNULL, capture_output=True, env=native.FIXTURE_ENV,
                                timeout=5, check=True)
        value = json.loads(result.stdout)
        self.assertTrue(value['independentAbsence'])
        return value['result']

    def test_real_guardian_relays_summary_and_caller_checks_private_identity(self):
        value = self.fixture('guardian')
        self.assertEqual(value['result']['lifecycle']['status'], 'completed')
        self.assertEqual(value['result']['buildFacts']['status'], 'observed')
        self.assertTrue(value['cleanClose'])
        self.assertNotIn('artifact', value['result'])

    def test_real_guardian_preserves_unavailable_first_failure(self):
        value = self.fixture('unavailable')
        self.assertEqual(value['result']['lifecycle']['firstFailure'], 'transport')
        self.assertEqual(value['result']['buildFacts']['firstFailure'], 'packages')
        self.assertTrue(value['cleanClose'])

    def test_guardian_partial_artifact_failure_retains_cleanup_and_attempt_accounting(self):
        value = self.fixture('publication-failure')
        lifecycle = value['result']['lifecycle']
        self.assertEqual(lifecycle['firstFailure'], 'custody')
        self.assertEqual(lifecycle['cleanupFailure'], 'custody')
        self.assertTrue(lifecycle['mayHaveStarted'] and lifecycle['mayHaveDispatched'])
        self.assertTrue(lifecycle['ownedChildrenAbsent'] and lifecycle['containerStoppedVerified'])
        self.assertFalse(lifecycle['transportResultValid'] or lifecycle['reservationClean'])

    def test_real_posix_writer_excludes_nonblocking_shared_reader(self):
        value = self.fixture('locks')
        self.assertTrue(value['blocked'])
        self.assertTrue(value['independentAbsence'])


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--ordinary-fixture':
        supervise(sys.argv[2])
    else:
        unittest.main()
