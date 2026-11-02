"""Public synthetic-only collector/host adversarial tests, automatically discovered.

All guest paths map to a new private fixture root. No default guest System,
owner, child, command, package database, /proc or environment probe is used.
Real POSIX/OFD lock conflicts need no child and use only owned fixture FDs.
"""
import ast
import base64
import copy
import errno
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import shlex
import signal
import stat
import struct
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zlib

import install_metadata as m


def guest(body=None):
    namespace = {'__name__': 'test_definitions'}
    program = m._guest_program().decode('ascii')
    if body is not None:
        program = program[:-len(m.GUEST_BODY)] + body
    exec(compile(program, '<synthetic-install-metadata-definitions>', 'exec'), namespace)
    return SimpleNamespace(**namespace)


G = guest()
STATUS = b'''Package: dpkg
Status: install ok installed
Architecture: amd64
Version: 1.22.22

Package: man-db
Status: hold ok installed
Architecture: amd64
Version: 2.13.1-1

Package: libc-bin
Status: install ok installed
Architecture: amd64
Version: 2.41-12

Package: partial
Status: deinstall reinstreq half-installed
trIGgers-Pending: ldconfig
 more

'''


def info(st):
    # Synthetic root ownership only, retaining every actual private fixture stamp.
    return SimpleNamespace(**{name: (0 if name in ('st_uid', 'st_gid') else getattr(st, name))
                             for name in ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid',
                                          'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')})


class Ops:
    """Only '/' is translated; all other operations require a retained private FD."""
    environ = {'SUDO_UID': '1000', 'SUDO_GID': '1000'}

    def __init__(self, root):
        self.root, self.owned, self.paths, self.events = root, set(), {}, []
        self.hook = lambda *_: None
        self.short = False

    def event(self, event, fd=None):
        self.events.append((event, self.paths.get(fd)))
        self.hook(event, fd)

    def open(self, name, flags, dir_fd=None):
        if dir_fd is None:
            assert name == '/'
            path = '/'
            fd = os.open(self.root, flags)
        else:
            assert dir_fd in self.owned and '/' not in name
            path = self.paths[dir_fd].rstrip('/') + '/' + name
            fd = os.open(name, flags, dir_fd=dir_fd)
        self.owned.add(fd)
        self.paths[fd] = path
        self.event('open', fd)
        return fd

    def close(self, fd):
        assert fd in self.owned
        self.event('close-before', fd)
        os.close(fd)
        self.owned.remove(fd)
        self.event('close-after', fd)

    def fstat(self, fd):
        assert fd in self.owned
        self.event('fstat', fd)
        return info(os.fstat(fd))

    def stat(self, name, dir_fd=None, follow_symlinks=False):
        assert not follow_symlinks
        if dir_fd is None:
            assert name == '/'
            return info(os.stat(self.root, follow_symlinks=False))
        assert dir_fd in self.owned and '/' not in name
        self.event('stat', dir_fd)
        return info(os.stat(name, dir_fd=dir_fd, follow_symlinks=False))

    def pread(self, fd, count, offset):
        assert fd in self.owned and count <= 65536
        self.event('pread', fd)
        return os.pread(fd, min(count, 7) if self.short else count, offset)

    def lseek(self, fd, offset, whence):
        assert fd in self.owned and offset == 0 and whence == os.SEEK_SET
        self.event('rewind', fd)
        return os.lseek(fd, offset, whence)

    def scandir(self, fd):
        assert fd in self.owned
        self.event('scandir', fd)
        class Scan:
            def __enter__(self_scan):
                self_scan.scan = os.scandir(fd)
                return (SimpleNamespace(name=e.name, stat=lambda follow_symlinks=False, e=e:
                                        info(e.stat(follow_symlinks=follow_symlinks))) for e in self_scan.scan)
            def __exit__(self_scan, *_):
                self_scan.scan.close()
        return Scan()

    @staticmethod
    def geteuid():
        return 0

    @staticmethod
    def getegid():
        return 0

    @staticmethod
    def uname():
        return SimpleNamespace(machine='x86_64')

    def cleanup(self):
        # Independent fixture ownership; never relies on System.close().
        for fd in list(self.owned):
            os.close(fd)
            self.owned.remove(fd)


class Fixture:
    def __init__(self, module=G):
        self.temp = tempfile.TemporaryDirectory(prefix='f102-install-metadata-')
        self.root = Path(self.temp.name)
        for name in ('usr/lib', 'var/lib/dpkg/updates', 'var/lib/dpkg/triggers',
                     'var/lib/dpkg/info', 'etc/dpkg/dpkg.cfg.d'):
            (self.root / name).mkdir(parents=True, exist_ok=True)
        self.put('/usr/lib/os-release', b'ID=debian\nVERSION_ID="13.7"\n')
        self.put(m.BASE + 'status', STATUS)
        for path in m.LOCKS:
            self.put(path, b'')
        self.put(m.BASE + 'triggers/File', b'/usr/share/man man-db/noawait\n/lib/pkgconfig pkgconf-bin\n')
        self.put(m.BASE + 'triggers/Unincorp', b'')
        self.put(m.BASE + 'triggers/ldconfig', b'libc-bin/await\n')
        self.put(m.BASE + 'info/format', b'1\n')
        self.put(m.BASE + 'info/man-db.triggers', b'interest-noawait /usr/share/man\n')
        self.put(m.BASE + 'info/man-db.postinst', b'#!/bin/sh\n# synthetic; never execute\n')
        self.put('/etc/dpkg/dpkg.cfg.d/20-test', b'# synthetic nonempty config\n')
        self.put('/etc/dpkg/dpkg.cfg.d/ignored.conf', b'PRIVATE-IGNORED-SYNTHETIC')
        for directory in self.root.rglob('*'):
            if directory.is_dir():
                directory.chmod(0o700)
        self.ops = Ops(self.root)
        self.system = module.System(self.ops)
        self.module = module

    def path(self, path):
        return self.root / path.lstrip('/')

    def put(self, path, raw):
        self.path(path).write_bytes(raw)
        self.path(path).chmod(0o600)

    def collect(self):
        return self.module.collect(self.system)

    def close(self):
        self.ops.cleanup()
        self.temp.cleanup()


def packet_raw(snapshot):
    return m.canonical(G.packet(snapshot))


class Case(unittest.TestCase):
    def fixture(self, module=G):
        f = Fixture(module)
        self.addCleanup(f.close)
        return f

    def snapshot(self):
        return self.fixture().collect()

    def bad_snapshot(self, value):
        with self.assertRaises(m.Rejected):
            m.validate_snapshot(value)

    def refusal(self, f, reason=None):
        with self.assertRaises(f.module.Fault) as caught:
            f.collect()
        if reason:
            self.assertEqual(caught.exception.args, (reason,))
        self.assertFalse(f.ops.owned)


class SourceTests(Case):
    def test_import_and_running_module_are_inert(self):
        text = Path(m.__file__).read_text()
        # Preload imports, then guard every relevant effect while executing module.
        for name in ('base64', 'hashlib', 'json', 'os', 'pathlib', 're', 'shlex', 'stat', 'zlib'):
            __import__(name)
        def fail(*_, **__):
            raise AssertionError('inert module attempted I/O')
        with patch('builtins.open', fail), patch.object(os, 'open', fail), \
                patch.object(os, 'stat', fail), patch.object(os, 'getenv', fail):
            for name in ('test_import', '__main__'):
                exec(compile(text, '<inert-host-module>', 'exec'), {'__name__': name})

    def test_frozen_input_source_hash_size_and_bootstrap_definitions(self):
        source = m.source_bytes()
        self.assertIs(type(source), bytes)
        self.assertLessEqual(len(shlex.quote(source.decode()).encode()), 60000)
        self.assertEqual(m.source_sha256(), hashlib.sha256(source).hexdigest())
        namespace = {'__name__': 'test_definitions'}
        # This compiles only definitions. Default System/main never runs.
        exec(compile(source, '<fixed-bootstrap>', 'exec'), namespace)
        self.assertEqual(namespace['SCHEMA'], m.SCHEMA)
        self.assertEqual(len(namespace['targets']()), len(G.targets()))
        self.assertEqual(namespace['TARGET_DATA'], m.TARGET_DATA)

    def test_frozen_file_all_checks_and_bounded_read(self):
        raw = Path(m.__file__).with_name('install-metadata-targets.json').read_bytes()
        m._check_targets(raw)
        for bad in (b'', raw[:-1], raw + b' ', raw.replace(b'ldconfig', b'ldconfiX')):
            with self.subTest(length=len(bad)), self.assertRaises(m.Rejected):
                m._check_targets(bad)
        with patch('builtins.open', return_value=io.BytesIO(raw + b'X')):
            with self.assertRaises(m.Rejected):
                m.source_bytes()
        value = json.loads(raw)
        for field in value:
            mutant = copy.deepcopy(value)
            mutant[field] = None
            with self.subTest(field=field), patch.object(m, 'digest', return_value=m.TARGET_FILE_SHA256):
                with self.assertRaises(m.Rejected):
                    m._check_targets(m.canonical(mutant).ljust(len(raw)))

    def test_target_expansion_digest_count_canonical_and_stream_guards(self):
        raw = m.canonical(m._fixed_paths())
        for body in (raw[:-1], raw + b' ', m.canonical(m._fixed_paths()[:-1])):
            with patch.object(m, 'TARGET_DATA', base64.b64encode(zlib.compress(body)).decode()):
                with self.assertRaises(m.Rejected):
                    m._fixed_paths()
        zipped = base64.b64decode(m.TARGET_DATA)
        for bad in (zipped[:-1], zipped + b'x', zipped + zipped):
            with patch.object(m, 'TARGET_DATA', base64.b64encode(bad).decode()):
                with self.assertRaises(m.Rejected):
                    m._fixed_paths()
        self.assertEqual(len(m._fixed_paths()), 5983)

    def test_ast_closed_imports_and_no_host_dispatch(self):
        host = ast.parse(Path(m.__file__).read_text())
        self.assertFalse(any(isinstance(n, ast.ImportFrom) and n.module and n.module.startswith('lab_')
                             for n in ast.walk(host)))
        for body in (host, ast.parse(m.GUEST_BODY)):
            names = {n.id for n in ast.walk(body) if isinstance(n, ast.Name)}
            self.assertFalse({'subprocess', 'socket', 'ctypes', 'requests'} & names)


class ParserTests(Case):
    def test_status_original_digest_counts_selected_and_privacy(self):
        f = self.fixture()
        snapshot = f.collect()
        state = snapshot['packageState']
        self.assertEqual((state['packageCount'], state['holdCount'], state['brokenCount'], state['pendingCount']), (4, 1, 1, 1))
        self.assertEqual(state['originalStatusSha256'], hashlib.sha256(STATUS).hexdigest())
        self.assertEqual(state['originalStatusBytes'], len(STATUS))
        self.assertIsNone(state['selectedPackages']['apt'])
        raw = m.canonical(snapshot)
        self.assertNotIn(b'partial', raw)
        self.assertNotIn(b'PRIVATE-IGNORED-SYNTHETIC', raw)
        self.assertNotIn(m.BASE + 'status', [r['path'] for r in snapshot['files']])
        m.validate_snapshot(snapshot)

    def test_whitespace_case_continuations_and_pending_records(self):
        raw = b'pAcKaGe:\t aa \t\nStatus: install ok installed\nArchitecture: amd64\nVersion: 1\nDescription: hi\n there\nTRIGGERS-AWAITED:\t \n aa\ntriggers-pending: bb\n\n'
        rows, state = G.status_records(raw)
        self.assertEqual(rows[0]['Package'], 'aa')
        self.assertEqual(state['pendingCount'], 1)
        for pending in (b'\nTriggers-Pending: \t\n', b'\nTriggers-Awaited: \t\n'):
            _, state = G.status_records(b'Package: aa\nStatus: purge ok not-installed' + pending)
            self.assertEqual(state['pendingCount'], 0)

    def test_long_ignored_values_never_become_projected_fields(self):
        raw = b'Package: aa\nStatus: purge ok not-installed\nDescription: x\n' + b' ' + b'x'*8000 + b'\n' + (b' '+b'y'*8000+b'\n')*8
        rows, _ = G.status_records(raw)
        self.assertEqual(rows, [{'Package': 'aa', 'Status': 'purge ok not-installed'}])
        for field in (b'Conffiles', b'Description', b'X-Unknown'):
            G.status_records(raw.replace(b'Description', field))

    def test_legitimate_partial_states_and_multiarch_crossfields(self):
        for state in ('not-installed', 'half-installed'):
            rows, counts = G.status_records(('Package: aa\nStatus: hold ok '+state+'\n').encode())
            self.assertNotIn('Version', rows[0])
            self.assertEqual(counts['holdCount'], 1)
            self.assertEqual(counts['brokenCount'], int(state == 'half-installed'))
        for state in ('installed', 'config-files', 'unpacked', 'half-configured', 'triggers-awaited', 'triggers-pending'):
            with self.subTest(state=state), self.assertRaises(G.Fault):
                G.status_records(('Package: aa\nStatus: install ok '+state+'\n').encode())
        for ma in ('same', 'foreign', 'allowed', 'no'):
            row = {'Package': 'aa', 'Status': 'install ok installed', 'Architecture': 'amd64', 'Version': '1:2-3', 'Multi-Arch': ma}
            G.record(row)
            m._host_package(row)
        for arch in (None, 'all'):
            row = {'Package': 'aa', 'Status': 'purge ok not-installed', 'Multi-Arch': 'same'}
            if arch:
                row['Architecture'] = arch
            with self.assertRaises(G.Fault):
                G.record(row)
            with self.assertRaises(m.Rejected):
                m._host_package(row)

    def test_duplicate_malformed_orphan_control_and_simple_continuations(self):
        bad = (b'Package: aa\npackage: bb\nStatus: install ok not-installed',
               b'Package: aa\nStatus: install ok not-installed\nX-Test: a\nx-test: b',
               b' continuation', b'Package aa', b'Package: aa\nStatus: install ok not-installed\n next',
               b'Package: aa\nStatus: install ok not-installed\nDescription: a\x00b',
               b'Description: no identity', b'Package: a\nStatus: install ok not-installed',
               b'Package: aa\nStatus: invalid ok installed', b'Package: aa\nStatus: install ok not-installed\n-Field: x')
        for raw in bad:
            with self.subTest(raw=raw), self.assertRaises(G.Fault):
                G.status_records(raw)

    def test_status_input_line_stanza_projected_field_and_record_bounds(self):
        seed = b'Package: aa\nStatus: purge ok not-installed\n'
        for raw in (b'', b' '*8388609, seed + b'Description: '+b'x'*16385,
                    seed + b'Description: x\n'+(b' '+b'x'*16000+b'\n')*9,
                    seed + b'Triggers-Pending: '+b'x'*16000+b'\n '+b'x'*500+b'\n',
                    b'\n'.join(seed.replace(b'aa', ('aa'+str(i)).encode()) for i in range(4097))):
            with self.subTest(length=len(raw)), self.assertRaises(G.Fault):
                G.status_records(raw)

    def test_registry_exact_grammar_options_qualifiers_duplicates(self):
        for opt in ('', '/await', '/noawait'):
            line = ('/usr/share/man man-db:amd64'+opt+'\n').encode()
            self.assertEqual(G.registrants(line, True), [('/usr/share/man', 'man-db:amd64')])
            self.assertEqual(m._host_interests(line), [('/usr/share/man', 'man-db:amd64')])
        for raw in (b'/x aa/unknown\n', b'/x aa bb\n', b'/x\taa\n', b'/x  aa\n', b'/x aa/await/noawait\n',
                    b'/x aa:\n', b'/x ../aa\n', b'/x aa\n/x aa/noawait\n', b'/x aa\r\n', b'rel aa\n'):
            with self.subTest(raw=raw), self.assertRaises(G.Fault):
                G.registrants(raw, True)
            with self.assertRaises(m.Rejected):
                m._host_interests(raw)
        for raw in (b'aa\n', b'aa:amd64/noawait\n', b'aa/await\n'):
            G.registrants(raw, False)
            m._host_interests(raw, True)
        for raw in (b'aa aa\n', b'aa/bogus\n', b'aa\naa/await\n', b' aa\n'):
            with self.assertRaises(G.Fault):
                G.registrants(raw, False)

    def test_prefix_ancestors_and_merged_usr_remain_lexical(self):
        ancestors = {'/', '/usr', '/usr/lib', '/usr/lib/pkgconfig', '/usr/lib/pkgconfig/x.pc'}
        registry = b'/lib/pkgconfig aa\n/usr/lib/pkgconfig bb\n/usr/lib/pkg cc\n/usr dd\n/ zz\n'
        self.assertEqual(G.select(registry, b'ee/noawait\n', ancestors), ['bb', 'dd', 'ee', 'zz'])
        f = self.fixture()
        f.put(m.BASE+'triggers/File', b'/usr/share/man man-db\n/usr/share/mann aa\n')
        self.assertEqual(f.collect()['handlers'], ['libc-bin', 'man-db'])

    def test_registry_and_handler_count_bounds(self):
        for raw, explicit in ((b'x'*65537, True), (b'x'*262145, False)):
            with self.assertRaises(G.Fault):
                G.registrants(raw, not explicit)
        with self.assertRaises(G.Fault):
            G.select(b'', b''.join(('aa'+str(i)+'\n').encode() for i in range(33)), {'/'})

    def test_namespace_actual_multiarch_no_fallback_and_absence(self):
        f = self.fixture()
        f.put(m.BASE+'status', STATUS + b'Package: multi\nArchitecture: amd64\nVersion: 1\nStatus: install ok installed\nMulti-Arch: same\n\n')
        f.put(m.BASE+'triggers/ldconfig', b'multi:amd64/noawait\n')
        f.put(m.BASE+'info/multi:amd64.triggers', b'interest ldconfig\n')
        f.put(m.BASE+'info/multi.postinst', b'wrong namespace; must not read')
        value = f.collect()
        m.validate_snapshot(value)
        paths = {r['path']: r for r in value['files']}
        self.assertEqual(paths[m.BASE+'info/multi:amd64.postinst']['state'], 'absent')
        self.assertNotIn(m.BASE+'info/multi.postinst', paths)
        for fmt in (None, b'0\n', b'2\n'):
            with self.subTest(fmt=fmt), self.assertRaises(G.Fault):
                G.namespace({'Package': 'multi', 'Architecture': 'amd64', 'Multi-Arch': 'same'}, 'multi:amd64', fmt)
        with self.assertRaises(G.Fault):
            G.namespace(None, 'multi:amd64', b'1\n')
        self.assertEqual(G.namespace(None, 'missing', b'1\n'), 'missing')

    def test_ambiguous_package_lookup_refuses(self):
        rows = [{'Package': 'multi', 'Architecture': a} for a in ('amd64', 'arm64')]
        with self.assertRaises(G.Fault):
            G.lookup(rows, 'multi')
        self.assertEqual(G.lookup(rows, 'multi:amd64')['Architecture'], 'amd64')

    def test_config_accepted_ignored_and_optional_absence(self):
        f = self.fixture()
        f.path('/etc/dpkg/dpkg.cfg.d/ignored.conf').unlink()
        os.symlink('/forbidden-unread', f.path('/etc/dpkg/dpkg.cfg.d/.ignored'))
        f.put('/etc/dpkg/dpkg.cfg.d/Z_9', b'force-synthetic\n')
        value = f.collect()
        m.validate_snapshot(value)
        paths = {r['path']: r for r in value['files']}
        self.assertIn('/etc/dpkg/dpkg.cfg.d/Z_9', paths)
        self.assertNotIn('/etc/dpkg/dpkg.cfg.d/.ignored', paths)
        self.assertEqual(paths[m.BASE+'diversions']['state'], 'absent')
        f = self.fixture()
        for p in f.path(m.CFG).iterdir():
            p.unlink()
        f.path(m.CFG).rmdir()
        value = f.collect()
        m.validate_snapshot(value)
        self.assertEqual(next(d for d in value['directories'] if d['path'] == m.CFG)['state'], 'absent')

    def test_nonempty_policy_and_config_are_observed_not_admission(self):
        f = self.fixture()
        for name in ('diversions', 'statoverride'):
            f.put(m.BASE+name, b'synthetic nonempty policy\n')
        f.put('/etc/dpkg/dpkg.cfg', b'pre-invoke=NEVER-EXECUTE\n')
        value = f.collect()
        m.validate_snapshot(value)
        self.assertEqual(value['scope'], m.SCOPE)
        self.assertGreater(value['packageState']['brokenCount'], 0)


class CodecTests(Case):
    def test_guest_host_codec_deterministic_triple_and_domains(self):
        value = self.snapshot()
        raw = m.encode_packet(value)
        self.assertEqual(raw, packet_raw(value))
        packet, decoded, canonical = m.decode_packet(raw, 0)
        self.assertEqual(decoded, value)
        self.assertEqual(canonical, m.canonical(value))
        self.assertEqual(packet['expandedBytes'], len(canonical))
        self.assertEqual(raw, m.encode_packet(decoded))
        import lab_build_facts
        with self.assertRaises(Exception):
            lab_build_facts.decode_packet(raw, 0)
        old = dict(packet, schema='f102-build-facts-packet-v1')
        with self.assertRaises(m.Rejected):
            m.decode_packet(m.canonical(old), 0)

    def test_closed_failures_and_exit_mapping(self):
        for failure in m.FAILURES:
            raw = m.canonical(m.unavailable(failure))
            p, s, b = m.decode_packet(raw, 3)
            self.assertEqual((p['firstFailure'], s, b), (failure, None, None))
            with self.assertRaises(m.Rejected):
                m.decode_packet(raw, 0)
        for failure in ('none', 'architecture', 'raw/path', '', None):
            with self.assertRaises(m.Rejected):
                m.unavailable(failure)
        raw = m.encode_packet(self.snapshot())
        for code in (3, True, 0.0, -1, 4):
            with self.assertRaises(m.Rejected):
                m.decode_packet(raw, code)

    def test_packet_keys_types_duplicate_nonfinite_canonical_and_size(self):
        packet = G.packet(self.snapshot())
        for key in packet:
            bad = dict(packet)
            bad.pop(key)
            with self.subTest(key=key), self.assertRaises(m.Rejected):
                m.decode_packet(m.canonical(bad), 0)
        bad_values = [dict(packet, extra=1), dict(packet, expandedBytes=True), dict(packet, expandedBytes=1.0),
                      dict(packet, expandedBytes=0), dict(packet, sha256='a'*64), dict(packet, data='!!!!'),
                      dict(packet, status='success'), dict(packet, encoding='base64')]
        for bad in bad_values:
            with self.subTest(fields=list(bad)), self.assertRaises(m.Rejected):
                m.decode_packet(m.canonical(bad), 0)
        raw = m.canonical(packet)
        for bad in (raw+b' ', b' '*60001, raw.replace(b'{', b'{"schema":"duplicate",', 1),
                    raw.replace(str(packet['expandedBytes']).encode(), b'NaN', 1)):
            with self.assertRaises(m.Rejected):
                m.decode_packet(bad, 0)

    def test_zlib_truncation_trailing_second_stream_expansion_lies_and_bomb(self):
        packet = G.packet(self.snapshot())
        zipped = base64.b64decode(packet['data'])
        for bad in (zipped[:-1], zipped+b'trailer', zipped+zipped, zlib.compress(b'x'*(m.MAX_SNAPSHOT+1))):
            mutant = dict(packet, data=base64.b64encode(bad).decode())
            with self.assertRaises(m.Rejected):
                m.decode_packet(m.canonical(mutant), 0)
        for amount in (packet['expandedBytes']-1, packet['expandedBytes']+1, m.MAX_SNAPSHOT+1):
            with self.assertRaises(m.Rejected):
                m.decode_packet(m.canonical(dict(packet, expandedBytes=amount)), 0)

    def test_snapshot_canonical_duplicates_and_schema_inside_valid_packet(self):
        value = self.snapshot()
        raw = m.canonical(value)
        for bad in (raw+b' ', raw.replace(b'{', b'{"schema":"duplicate",', 1),
                    m.canonical(dict(value, schema='f102-build-facts-v1'))):
            packet = dict(G.packet(value), data=base64.b64encode(zlib.compress(bad)).decode(),
                          expandedBytes=len(bad), sha256=m.digest(bad))
            with self.assertRaises(m.Rejected):
                m.decode_packet(m.canonical(packet), 0)

    def test_all_snapshot_key_sets_and_metadata_integer_types(self):
        value = self.snapshot()
        locations = [(), ('identity',), ('os',), ('packageState',), ('files', 0),
                     ('files', 0, 'metadata'), ('directories', 0), ('directories', 0, 'entries', 0)]
        for location in locations:
            obj = value
            for key in location:
                obj = obj[key]
            if obj is None:
                continue
            for key in obj:
                bad = copy.deepcopy(value)
                target = bad
                for part in location:
                    target = target[part]
                target.pop(key)
                with self.subTest(location=location, missing=key):
                    self.bad_snapshot(bad)
            bad = copy.deepcopy(value)
            target = bad
            for part in location:
                target = target[part]
            target['extra'] = 1
            self.bad_snapshot(bad)
        for meta_key in m.META_KEYS:
            for wrong in (True, 1.0, float('nan'), float('inf'), -1, 2**63):
                bad = copy.deepcopy(value)
                row = next(r for r in bad['files'] if r['state'] == 'present')
                row['metadata'][meta_key] = wrong
                self.bad_snapshot(bad)

    def test_host_relationship_mutations_are_rejected(self):
        original = self.snapshot()
        mutations = [lambda v: v['handlers'].clear(),
                     lambda v: v['handlers'].append('zz'),
                     lambda v: v['files'].reverse(), lambda v: v['files'].pop(),
                     lambda v: v['files'].append(copy.deepcopy(v['files'][0])),
                     lambda v: v['directories'].reverse(),
                     lambda v: v['packageState']['selectedPackages'].pop('apt'),
                     lambda v: v['packageState'].__setitem__('holdCount', 0),
                     lambda v: v['packageState'].__setitem__('packageCount', 1),
                     lambda v: v['packageState']['selectedPackages']['man-db'].__setitem__('Package', 'wrong'),
                     lambda v: v.__setitem__('targetSha256', 'a'*64),
                     lambda v: v.__setitem__('scope', 'install-admission')]
        for change in mutations:
            value = copy.deepcopy(original)
            change(value)
            self.bad_snapshot(value)
        for field in ('data', 'bytes', 'sha256', 'metadata'):
            value = copy.deepcopy(original)
            row = next(r for r in value['files'] if r['state'] == 'absent')
            row[field] = 0
            self.bad_snapshot(value)
        for field in ('bytes', 'sha256', 'data'):
            value = copy.deepcopy(original)
            row = next(r for r in value['files'] if r['state'] == 'present' and r['bytes'])
            row[field] = {'bytes': row['bytes']+1, 'sha256': 'a'*64, 'data': 'AA=='}[field]
            self.bad_snapshot(value)

    def test_host_rederives_registry_and_namespace_without_guest_parser(self):
        value = self.snapshot()
        with patch.object(G, 'select', side_effect=AssertionError('not a host parser')):
            m.validate_snapshot(value)
        for file_path, body in ((m.BASE+'triggers/File', b'/usr/share/man aa\n'),
                                (m.BASE+'triggers/ldconfig', b'aa\n'),
                                (m.BASE+'info/format', b'9\n')):
            mutant = copy.deepcopy(value)
            row = next(r for r in mutant['files'] if r['path'] == file_path)
            old_meta = row['metadata']
            row.update(bytes=len(body), sha256=m.digest(body), data=base64.b64encode(body).decode(),
                       metadata=dict(old_meta, size=len(body)))
            for d in mutant['directories']:
                for e in d['entries'] or []:
                    if d['path']+'/'+e['name'] == file_path:
                        e['metadata'] = row['metadata']
            self.bad_snapshot(mutant)


class CustodyTests(Case):
    def test_three_real_locks_order_held_through_verify_reverse_close(self):
        f = self.fixture()
        probes = [os.open(f.path(p), os.O_RDWR | os.O_CLOEXEC) for p in m.LOCKS]
        self.addCleanup(lambda: [os.close(fd) for fd in probes])
        original = f.system.verify
        seen = []
        class Locking:
            @staticmethod
            def lockf(fd, flags):
                seen.append(f.ops.paths[fd])
                assert flags == fcntl.LOCK_SH | fcntl.LOCK_NB
                fcntl.lockf(fd, flags)
        f.system.locking = Locking
        def verify():
            self.assertEqual(seen, list(m.LOCKS))
            for fd in probes:
                with self.assertRaises(BlockingIOError):
                    fcntl.fcntl(fd, fcntl.F_OFD_SETLK, struct.pack('hhqqi', fcntl.F_WRLCK, os.SEEK_SET, 0, 0, 0))
            original()
        f.system.verify = verify
        f.collect()
        closed = [p for event, p in f.ops.events if event == 'close-before' and p in m.LOCKS]
        self.assertEqual(closed, list(reversed(m.LOCKS)))
        opened = [p for event, p in f.ops.events if event == 'open' and p in m.LOCKS]
        self.assertEqual(opened, list(m.LOCKS))
        for fd in probes:
            fcntl.fcntl(fd, fcntl.F_OFD_SETLK, struct.pack('hhqqi', fcntl.F_WRLCK, os.SEEK_SET, 0, 0, 0))

    def test_actual_contention_at_each_lock_refuses_no_retry(self):
        for path in m.LOCKS:
            with self.subTest(path=path):
                f = self.fixture()
                fd = os.open(f.path(path), os.O_RDWR | os.O_CLOEXEC)
                try:
                    fcntl.fcntl(fd, fcntl.F_OFD_SETLK, struct.pack('hhqqi', fcntl.F_WRLCK, os.SEEK_SET, 0, 0, 0))
                    self.refusal(f, 'package-lock')
                    self.assertEqual(sum(p == path for e, p in f.ops.events if e == 'open'), 1)
                finally:
                    os.close(fd)

    def test_missing_unsafe_nonregular_and_hardlinked_locks(self):
        for path in m.LOCKS:
            for form in ('absent', 'symlink', 'fifo', 'writable', 'hardlink'):
                with self.subTest(path=path, form=form):
                    f = self.fixture()
                    leaf = f.path(path)
                    if form in ('absent', 'symlink', 'fifo'):
                        leaf.unlink()
                    if form == 'symlink':
                        os.symlink('File', leaf)
                    if form == 'fifo':
                        os.mkfifo(leaf)
                    if form == 'writable':
                        leaf.chmod(0o666)
                    if form == 'hardlink':
                        os.link(leaf, f.root/'extra-link')
                    self.refusal(f)

    def test_required_unincorp_and_updates_never_repair_or_admit(self):
        for form in ('absent', 'nonempty', 'update'):
            f = self.fixture()
            if form == 'absent':
                f.path(m.BASE+'triggers/Unincorp').unlink()
            elif form == 'nonempty':
                f.put(m.BASE+'triggers/Unincorp', b'ldconfig -\n')
            else:
                f.put(m.BASE+'updates/0000', b'unapplied')
            self.refusal(f)
            if form == 'absent':
                self.assertFalse(f.path(m.BASE+'triggers/Unincorp').exists())

    def test_late_absence_creation_same_bytes_swap_content_and_directory_mutations(self):
        for form in ('late-file', 'late-directory', 'swap', 'content', 'add-entry', 'chmod', 'ignored-stat'):
            with self.subTest(form=form):
                f = self.fixture()
                if form == 'late-directory':
                    for p in f.path(m.CFG).iterdir():
                        p.unlink()
                    f.path(m.CFG).rmdir()
                original = f.system.verify
                def mutate():
                    if form == 'late-file':
                        f.put(m.BASE+'diversions', b'')
                    elif form == 'late-directory':
                        f.path(m.CFG).mkdir()
                    elif form == 'swap':
                        p = f.path(m.BASE+'triggers/File')
                        raw = p.read_bytes()
                        p.rename(p.with_suffix('.old'))
                        p.write_bytes(raw)
                    elif form == 'content':
                        f.put(m.BASE+'status', STATUS.replace(b'2.13.1', b'2.13.2'))
                    elif form == 'add-entry':
                        f.put(m.BASE+'triggers/new-trigger', b'')
                    elif form == 'ignored-stat':
                        f.path(m.CFG+'/ignored.conf').chmod(0o600)
                    else:
                        f.path(m.BASE+'info').chmod(0o700)
                    original()
                f.system.verify = mutate
                self.refusal(f, 'custody')

    def test_short_reads_are_complete_and_repeated_scans_rewind(self):
        f = self.fixture()
        f.ops.short = True
        value = f.collect()
        m.validate_snapshot(value)
        scans = [(e, p) for e, p in f.ops.events if e in ('rewind', 'scandir')]
        self.assertGreaterEqual(len(scans), 12)
        for i in range(0, len(scans), 2):
            self.assertEqual(scans[i][0], 'rewind')
            self.assertEqual(scans[i+1], ('scandir', scans[i][1]))
        self.assertEqual(value['packageState']['originalStatusSha256'], m.digest(STATUS))

    def test_ancestor_symlinks_writes_and_selected_leaf_custody_refuse(self):
        for path, form in (('/etc/dpkg', 'writable'), (m.BASE+'info', 'symlink'),
                           (m.CFG+'/20-test', 'symlink'), (m.BASE+'info/man-db.postinst', 'hardlink')):
            f = self.fixture()
            leaf = f.path(path)
            if form == 'writable':
                leaf.chmod(0o777)
            elif form == 'symlink':
                leaf.rename(leaf.with_name(leaf.name+'-original'))
                os.symlink(leaf.name+'-original', leaf)
            else:
                os.link(leaf, f.root/'extra-link')
            self.refusal(f)

    def test_same_inode_not_reopened(self):
        f = self.fixture()
        f.system.identity()
        f.system.locks()
        lock = f.system.leaves[m.LOCKS[0]]
        # A second leaf mapped to the already retained inode must refuse BEFORE open.
        original_stat = f.ops.stat
        f.ops.stat = lambda name, **kw: f.ops.fstat(lock['fd']) if name == 'status' else original_stat(name, **kw)
        before = len(f.ops.events)
        with self.assertRaises(G.Fault):
            f.system.read(m.BASE+'status', 8388608)
        self.assertFalse(any(e == 'open' for e, _ in f.ops.events[before:]))
        f.system.close()

    def test_read_eof_length_and_content_reread_faults(self):
        for mode in ('early-eof', 'too-long', 'verify-different'):
            f = self.fixture()
            original = f.ops.pread
            seen = 0
            def read(fd, count, offset):
                nonlocal seen
                raw = original(fd, count, offset)
                if f.ops.paths[fd] == m.BASE+'status':
                    seen += 1
                    if mode == 'early-eof':
                        return b''
                    if mode == 'too-long':
                        return b'x'*(count+1)
                    if mode == 'verify-different' and seen >= 3:
                        return raw.replace(b'dpkg', b'epkg')
                return raw
            f.ops.pread = read
            self.refusal(f)

    def test_every_open_and_validation_boundary_cancellation_cleans_exact_fds(self):
        previous = signal.getsignal(signal.SIGALRM)
        signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(G.Cancelled()))
        self.addCleanup(signal.signal, signal.SIGALRM, previous)
        baseline = self.fixture()
        baseline.collect()
        opens = [p for e, p in baseline.ops.events if e == 'open']
        for point in ('open', 'fstat', 'pread', 'stat', 'scandir', 'rewind'):
            count = sum(e == point for e, _ in baseline.ops.events)
            # Every open; representative first/middle/last of higher-count read/stat operations.
            indexes = range(1, count+1) if point == 'open' else sorted({1, max(1, count//2), count})
            for index in indexes:
                f = self.fixture()
                seen = 0
                def cancel(event, _):
                    nonlocal seen
                    if event == point:
                        seen += 1
                        if seen == index:
                            if point == 'open':
                                signal.raise_signal(signal.SIGALRM)
                            else:
                                raise G.Cancelled()
                f.ops.hook = cancel
                with self.subTest(point=point, index=index):
                    self.refusal(f, 'deadline')
        self.assertGreater(len(opens), 15)

    def test_all_handled_signals_at_open_handoff_and_close_boundaries(self):
        old_handlers = {sig: signal.getsignal(sig) for sig in G.HANDLED}
        old_mask = signal.pthread_sigmask(signal.SIG_BLOCK, set())
        old_timer = signal.getitimer(signal.ITIMER_REAL)
        def restore():
            signal.setitimer(signal.ITIMER_REAL, 0)
            for sig, handler in old_handlers.items():
                signal.signal(sig, handler)
            signal.setitimer(signal.ITIMER_REAL, *old_timer)
            signal.pthread_sigmask(signal.SIG_SETMASK, old_mask)
        self.addCleanup(restore)
        for sig in G.HANDLED:
            signal.signal(sig, lambda *_: (_ for _ in ()).throw(G.Cancelled()))
        for sig in G.HANDLED:
            for boundary in ('open', 'close-before', 'close-after'):
                with self.subTest(sig=sig, boundary=boundary):
                    f = self.fixture()
                    sent = False
                    def send(event, _):
                        nonlocal sent
                        if event == boundary and not sent:
                            sent = True
                            signal.raise_signal(sig)
                    f.ops.hook = send
                    self.refusal(f, 'deadline' if boundary == 'open' else 'custody')
                    self.assertTrue(sent)

    def test_close_error_after_reuse_never_retries_or_closes_unrelated_fd(self):
        f = self.fixture()
        original = f.ops.close
        reused = []
        def close(fd):
            original(fd)
            if not reused:
                replacement = os.open(f.root/'unrelated', os.O_CREAT | os.O_RDWR | os.O_CLOEXEC, 0o600)
                self.assertEqual(replacement, fd)
                reused.append(replacement)
                raise OSError(errno.EINTR, 'synthetic ambiguous close')
        f.ops.close = close
        self.refusal(f, 'custody')
        try:
            os.fstat(reused[0])
        finally:
            os.close(reused[0])

    def test_every_close_before_or_after_syscall_refuses_without_retry(self):
        baseline = self.fixture()
        baseline.collect()
        count = sum(e == 'close-before' for e, _ in baseline.ops.events)
        for boundary in ('close-before', 'close-after'):
            for index in range(1, count+1):
                f = self.fixture()
                seen, failed_fd = 0, None
                def fault(event, fd):
                    nonlocal seen, failed_fd
                    if event == boundary:
                        seen += 1
                        if seen == index:
                            failed_fd = fd
                            raise OSError(errno.EIO, 'synthetic close ambiguity')
                f.ops.hook = fault
                with self.subTest(boundary=boundary, index=index):
                    with self.assertRaises(G.Fault) as caught:
                        f.collect()
                    self.assertEqual(caught.exception.args, ('custody',))
                    self.assertEqual(sum(e == 'close-before' and p == f.ops.paths[failed_fd]
                                         for e, p in f.ops.events), 1)
                    # A before-close failure deliberately leaves an owned fixture FD;
                    # independent fixture cleanup closes it, implementation never retries.
                    if boundary == 'close-before':
                        self.assertEqual(f.ops.owned, {failed_fd})
                    else:
                        self.assertFalse(f.ops.owned)

    def test_file_directory_count_path_and_export_bounds(self):
        for path, maximum in m.FILE_LIMITS.items():
            f = self.fixture()
            f.put(path, b'x'*(maximum+1))
            self.refusal(f, 'bounds')
        f = self.fixture()
        for i in range(33):
            f.put(m.CFG+'/aa'+str(i), b'')
        self.refusal(f, 'bounds')
        f = self.fixture()
        for i in range(65):
            f.put(m.CFG+'/ignored.'+str(i), b'')
        self.refusal(f, 'bounds')
        for attribute, value, operation in (
                ('files', [None]*128, lambda s: s.read(m.BASE+'arch', 8192, optional=True, export=True)),
                ('slots', [{}]*256, lambda s: s._retain('/', None, '/', True)),
                ('dirs', {str(i): None for i in range(64)}, lambda s: s.directory('/new'))):
            f = self.fixture()
            setattr(f.system, attribute, value)
            with self.assertRaises(G.Fault):
                operation(f.system)
            # No real descriptors were acquired; don't pass synthetic slots to close.
            f.system.slots = []
        with self.assertRaises(G.Fault):
            G.path_ok('/'+'x'*1024)
        f = self.fixture()
        f.system.exported = m.MAX_SNAPSHOT
        with self.assertRaises(G.Fault):
            f.system.read(m.BASE+'triggers/File', 262144, export=True)
        f.system.close()

    def test_main_uses_25_second_alarm_restores_handlers_and_emits_no_stderr(self):
        f = self.fixture()
        timers, output = [], []
        fake_signals = SimpleNamespace(
            getsignal=lambda s: 'previous', getitimer=lambda _: (0, 0),
            pthread_sigmask=lambda *_: set(), signal=lambda *_: None,
            setitimer=lambda *args: timers.append(args),
            SIGALRM=signal.SIGALRM, SIGTERM=signal.SIGTERM, SIGINT=signal.SIGINT, SIGHUP=signal.SIGHUP,
            ITIMER_REAL=signal.ITIMER_REAL, SIG_BLOCK=signal.SIG_BLOCK,
            SIG_UNBLOCK=signal.SIG_UNBLOCK, SIG_SETMASK=signal.SIG_SETMASK)
        namespace = G.main.__globals__
        with patch.dict(namespace, System=lambda: f.system, signal=fake_signals), \
                patch.object(os, 'write', lambda fd, raw: output.append((fd, raw)) or len(raw)):
            self.assertEqual(G.main(), 0)
        self.assertEqual(timers[0], (signal.ITIMER_REAL, 25))
        self.assertEqual(timers[-1], (signal.ITIMER_REAL, 0, 0))
        self.assertEqual([fd for fd, _ in output], [1])
        m.decode_packet(output[0][1], 0)


class AdditionalBounds(Case):
    def test_guest_source_argument_bound_and_target_data_refusal(self):
        noise = b''.join(hashlib.sha256(str(i).encode()).digest() for i in range(2300))
        with patch.object(m, '_guest_program', return_value=noise):
            with self.assertRaises(m.Rejected):
                m.source_bytes()
        for bad in ('x', m.TARGET_DATA[:-4], m.TARGET_DATA + 'AAAA'):
            with patch.dict(G.targets.__globals__, TARGET_DATA=bad):
                with self.assertRaises((G.Fault, ValueError, zlib.error)):
                    G.targets()

    def test_listing_entry_and_name_bounds_with_bounded_synthetic_iterator(self):
        f = self.fixture()
        row = f.system.directory(m.BASE+'triggers')
        sample = f.ops.stat('File', dir_fd=row['fd'], follow_symlinks=False)
        class Entries:
            def __init__(self, count, name=None):
                self.count, self.name = count, name
            def __enter__(self):
                return (SimpleNamespace(name=self.name or str(i), stat=lambda **_: sample)
                        for i in range(self.count))
            def __exit__(self, *_):
                pass
        for count, name in ((4097, None), (1, 'x'*256), (1, '.'), (1, 'a/b')):
            with patch.object(f.ops, 'scandir', lambda _: Entries(count, name)):
                with self.assertRaises(G.Fault):
                    f.system._scan(row, 4096)
        f.system.close()

    def test_snapshot_and_packet_caps_are_separate_from_raw_export_limit(self):
        # <=2MiB raw data can still exceed canonical snapshot cap after base64.
        f = self.fixture()
        for i in range(24):
            f.put(m.CFG+'/data'+str(i), b'x'*65536)
        value = f.collect()
        with self.assertRaises(G.Fault):
            G.packet(value)
        self.bad_snapshot(value)
        # A smaller, incompressible canonical snapshot can exceed packet60000.
        f = self.fixture()
        for i in range(25):
            noise = b''.join(hashlib.sha256((str(i)+':'+str(j)).encode()).digest() for j in range(80))
            f.put(m.CFG+'/random'+str(i), noise)
        value = f.collect()
        m.validate_snapshot(value)
        with self.assertRaises(G.Fault):
            G.packet(value)
        with self.assertRaises(m.Rejected):
            m.encode_packet(value)

    def test_real_hard_alarm_interrupts_unmasked_read_and_cleans_private_fds(self):
        previous = signal.getsignal(signal.SIGALRM)
        previous_timer = signal.getitimer(signal.ITIMER_REAL)
        f = self.fixture()
        def expired(*_):
            raise G.Cancelled()
        signal.signal(signal.SIGALRM, expired)
        def block(event, fd):
            if event == 'pread' and f.ops.paths[fd] == m.BASE+'status':
                signal.setitimer(signal.ITIMER_REAL, .002)
                while True:
                    pass
        f.ops.hook = block
        try:
            self.refusal(f, 'deadline')
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, previous)
            signal.setitimer(signal.ITIMER_REAL, *previous_timer)

    def test_each_phase_has_closed_reason_no_exception_or_path_diagnostic(self):
        for method, expected in (('identity', 'identity'), ('operating', 'os'), ('locks', 'package-lock'),
                                 ('listing', 'package-state'), ('verify', 'custody')):
            f = self.fixture()
            setattr(f.system, method, lambda *_, **__: (_ for _ in ()).throw(OSError('secret-path')))
            with self.assertRaises(G.Fault) as caught:
                f.collect()
            self.assertEqual(caught.exception.args, (expected,))
            raw = m.canonical(G.unavailable(caught.exception.args[0]))
            self.assertNotIn(b'secret-path', raw)
            m.decode_packet(raw, 3)

    def test_extra_listing_missing_control_wrong_namespace_and_config_relation(self):
        original = self.snapshot()
        for kind in ('extra-listing', 'missing-control', 'wrong-namespace', 'cfg-ignored-body', 'listing-size'):
            value = copy.deepcopy(original)
            if kind == 'extra-listing':
                value['directories'].append(copy.deepcopy(value['directories'][0]))
            elif kind == 'missing-control':
                value['files'] = [r for r in value['files'] if r['path'] != m.BASE+'info/libc-bin.postinst']
            elif kind == 'wrong-namespace':
                next(r for r in value['files'] if r['path'] == m.BASE+'info/libc-bin.postinst')['path'] = m.BASE+'info/libc-bin:amd64.postinst'
                value['files'].sort(key=lambda r:r['path'])
            elif kind == 'cfg-ignored-body':
                extra = copy.deepcopy(next(r for r in value['files'] if r['state'] == 'absent'))
                extra['path'] = m.CFG+'/ignored.conf'
                value['files'].append(extra)
                value['files'].sort(key=lambda r:r['path'])
            else:
                listing = next(d for d in value['directories'] if d['path'] == m.CFG)
                listing['entries'][0]['metadata']['size'] += 1
            self.bad_snapshot(value)


class MutationControls(Case):
    def test_behavioral_controls_expose_missing_guest_guards(self):
        cases = (
            ('lock', "self.locking.lockf(row['fd'], fcntl.LOCK_SH | fcntl.LOCK_NB)", 'pass'),
            ('verification', 'system.verify()', 'pass'),
            ('status-hash', "'originalStatusSha256': sha(raw)", "'originalStatusSha256': '0'*64"),
            ('namespace', "return p['Package'] + ':' + p['Architecture']", "return p['Package']"),
            ('Unincorp', "need(system.read(BASE + 'triggers/Unincorp', 0, export=True) == b'', 'package-state')",
             "system.read(BASE + 'triggers/Unincorp', 65536, optional=True, export=True)"),
            ('handler-selection', "if path == 'ldconfig' or path in ancestors", "if path == 'ldconfig'"),
        )
        for name, old, new in cases:
            self.assertEqual(m.GUEST_BODY.count(old), 1)
            module = guest(m.GUEST_BODY.replace(old, new))
            with self.subTest(mutant=name):
                if name == 'lock':
                    f = self.fixture(module)
                    seen = []
                    f.system.locking = SimpleNamespace(lockf=lambda *a: seen.append(a))
                    f.collect()
                    self.assertNotEqual(len(seen), 3)
                elif name == 'verification':
                    f = self.fixture(module)
                    original = f.system.read
                    def read(*args, **kwargs):
                        raw = original(*args, **kwargs)
                        if args[0] == m.BASE+'info/man-db.postinst':
                            f.put(m.BASE+'status', STATUS+b'\n')
                        return raw
                    f.system.read = read
                    module.collect(f.system)  # mutant wrongly reports observation
                elif name == 'status-hash':
                    f = self.fixture(module)
                    self.assertNotEqual(f.collect()['packageState']['originalStatusSha256'], m.digest(STATUS))
                elif name == 'namespace':
                    self.assertNotEqual(module.namespace({'Package': 'aa', 'Architecture': 'amd64', 'Multi-Arch': 'same'},
                                                        'aa:amd64', b'1\n'), 'aa:amd64')
                elif name == 'Unincorp':
                    f = self.fixture(module)
                    f.path(m.BASE+'triggers/Unincorp').unlink()
                    value = f.collect()
                    self.bad_snapshot(value)
                else:
                    f = self.fixture(module)
                    self.assertNotIn('man-db', f.collect()['handlers'])

    def test_host_mutation_controls_expose_omitted_identity_and_registry_validation(self):
        source = Path(m.__file__).read_text()
        identity_guard = "require(package['Package'] == name and (not arch or package.get('Architecture') == arch))"
        routing_guard = 'require(_host_handlers(files) == handlers)'
        for name, old, new in (
                ('identity', identity_guard, "require(not arch or package.get('Architecture') == arch)"),
                ('registry', routing_guard, 'pass')):
            self.assertEqual(source.count(old), 1)
            namespace = {'__name__': 'mutant_host_definitions'}
            exec(compile(source.replace(old, new), '<mutant-host-definitions>', 'exec'), namespace)
            value = self.snapshot()
            if name == 'identity':
                value['packageState']['selectedPackages']['dpkg']['Package'] = 'wrong-package'
            else:
                path = m.BASE+'triggers/File'
                row = next(r for r in value['files'] if r['path'] == path)
                row.update(bytes=0, sha256=m.digest(b''), data='', metadata=dict(row['metadata'], size=0))
                for d in value['directories']:
                    for e in d['entries'] or []:
                        if d['path']+'/'+e['name'] == path:
                            e['metadata'] = row['metadata']
            self.bad_snapshot(value)
            # The precise omitted guard admits the forged object. No fixture
            # errors or unrelated failure are counted as a behavioral control.
            self.assertIs(namespace['validate_snapshot'](value), value)

    def test_host_relation_control_rejects_forged_selected_package(self):
        value = self.snapshot()
        value['packageState']['selectedPackages']['libc-bin']['Package'] = 'wrong-package'
        self.bad_snapshot(value)
        # Omitting guest validators cannot affect independent host acceptance.
        with patch.object(G, 'record', lambda _: None), patch.object(G, 'namespace', lambda *_: 'wrong'):
            self.bad_snapshot(value)


if __name__ == '__main__':
    unittest.main()
