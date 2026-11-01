"""Closed read-only Debian build-facts preparation. Import never probes the host.

Guest source is inert data, pinned separately. The shared owner retains all
start/child/guardian/recovery/shutdown authority; this module grants none.
"""
import base64
import binascii
import hashlib
from functools import partial
import io
import os
from pathlib import Path
import re
import shlex
import signal
import sys
import uuid
import zlib

import lab_owner as owner

PERMIT = 'f102-build-facts-permit.json'
MAX_SNAPSHOT = 2 * 1024 * 1024
MAX_PACKET = 60000
FIELDS = ('Package', 'Architecture', 'Version', 'Status', 'Essential', 'Protected',
          'Priority', 'Multi-Arch', 'Depends', 'Pre-Depends', 'Provides', 'Conflicts',
          'Breaks', 'Replaces', 'Installed-Size')
FOLDED = ('Depends', 'Pre-Depends', 'Provides', 'Conflicts', 'Breaks', 'Replaces')
FAILURES = ('none', 'identity', 'os', 'package-lock', 'packages', 'package-state',
            'architecture', 'resources', 'locale', 'keyring', 'bounds', 'deadline', 'output', 'custody')
FILESYSTEMS = ('/', '/opt', '/var/cache/apt')
CAPACITY = ('availableBytes', 'freeBytes', 'totalBytes', 'availableInodes', 'freeInodes', 'totalInodes')

PROBE_SOURCE = ('FIELDS = ' + repr(FIELDS) + '\nFOLDED = ' + repr(FOLDED)
                + '\nFAILURES = ' + repr(FAILURES) + '\nFILESYSTEMS = ' + repr(FILESYSTEMS)
                + '\nCAPACITY = ' + repr(CAPACITY) + '\n') + r'''
import base64
import ctypes
import errno
import fcntl
import hashlib
import json
import os
import re
import signal
import stat
import zlib

class Fault(Exception):
    pass

class Deadline(BaseException):
    pass

def need(value, reason='packages'):
    if not value:
        raise Fault(reason)

def encode(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('ascii')

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def package_records(raw):
    need(type(raw) is bytes and 0 < len(raw) <= 8388608, 'bounds')
    try:
        text = raw.decode('utf-8')
    except UnicodeError:
        raise Fault('packages') from None
    need(not any(ord(c) < 32 and c not in '\n\t' or ord(c) == 127 for c in text))
    records, fields, current, stanza = [], {}, None, 0
    canonical = {key.lower(): key for key in FIELDS}
    def finish():
        if not fields:
            return
        need('package' in fields and 'status' in fields)
        projected = {canonical[k]: v for k, v in fields.items() if k in canonical}
        for key in FOLDED:
            if key in projected:
                projected[key] = ' '.join(projected[key].split())
        need(all(all(32 <= ord(c) < 127 for c in v) for v in projected.values()))
        validate_record(projected)
        records.append(projected)
        need(len(records) <= 4096, 'bounds')
    for line in text.split('\n'):
        need(len(line.encode('utf-8')) <= 16384, 'bounds')
        if not line.strip(' \t'):
            finish()
            fields, current, stanza = {}, None, 0
            continue
        stanza += len(line.encode('utf-8')) + 1
        need(stanza <= 131072, 'bounds')
        if line[0] in ' \t':
            need(current is not None)
            # Simple projected fields cannot acquire a second physical line.
            need(current not in canonical or canonical[current] in FOLDED)
            fields[current] += ' ' + line.strip(' \t')
            need(len(fields[current].encode('utf-8')) <= 16384, 'bounds')
        else:
            key, sep, value = line.partition(':')
            need(sep and re.fullmatch(r'[!-9;-~]+', key) and not key.startswith(('#', '-')))
            key = key.lower()
            need(key not in fields)
            fields[key] = value.strip(' \t')
            current = key
    finish()
    records.sort(key=lambda p: (p['Package'], p.get('Architecture', '')))
    ids = [(p['Package'], p.get('Architecture', '')) for p in records]
    need(len(set(ids)) == len(ids) and records)
    return records

def valid_version(value):
    parts = value.split(':', 1)
    if len(parts) == 2:
        epoch, value = parts
        need(re.fullmatch(r'[0-9]{1,10}', epoch) and int(epoch) <= 2147483647)
    if '-' in value:
        value, revision = value.rsplit('-', 1)
        need(re.fullmatch(r'[A-Za-z0-9+.~]+', revision))
    need(re.fullmatch(r'[0-9][A-Za-z0-9.+:~\-]*', value))

def validate_record(p):
    need(re.fullmatch(r'[a-z0-9][a-z0-9+.-]{1,127}', p['Package']))
    parts = p['Status'].split(' ')
    need(len(parts) == 3 and parts[0] in ('unknown', 'install', 'hold', 'deinstall', 'purge')
         and parts[1] in ('ok', 'reinstreq') and parts[2] in ('not-installed', 'config-files',
         'half-installed', 'unpacked', 'half-configured', 'triggers-awaited', 'triggers-pending', 'installed'))
    need(parts[2] in ('not-installed', 'half-installed') or 'Architecture' in p and 'Version' in p)
    if 'Architecture' in p:
        need(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', p['Architecture'])
             and p['Architecture'] != 'unknown')
    if 'Version' in p:
        valid_version(p['Version'])
    for key in ('Essential', 'Protected'):
        need(key not in p or p[key] in ('yes', 'no'))
    need('Priority' not in p or p['Priority'] in ('required', 'important', 'standard', 'optional', 'extra'))
    need('Multi-Arch' not in p or p['Multi-Arch'] in ('no', 'same', 'foreign', 'allowed'))
    need(p.get('Multi-Arch') != 'same' or p.get('Architecture') not in (None, 'all'))
    need('Installed-Size' not in p or re.fullmatch(r'[0-9]{1,16}', p['Installed-Size']))

def state_for(records, raw):
    holds = [{'package': p['Package'], 'architecture': p.get('Architecture')}
             for p in records if p['Status'].split()[0] == 'hold']
    broken = sum(p['Status'].split()[1] != 'ok' or p['Status'].split()[2]
                 not in ('installed', 'config-files', 'not-installed') for p in records)
    return {'statusSha256': sha(raw), 'statusBytes': len(raw), 'holds': holds,
            'pending': {'updates': 0, 'triggers': False, 'broken': broken, 'clean': broken == 0}}

def stamp(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)

class System:
    """Fixed-path reads only. Tests replace this adapter, never probe host facts."""
    def __init__(self):
        self.retained = []
        self.missing = []

    def identity(self):
        need(os.geteuid() == os.getegid() == 0 and os.environ.get('SUDO_UID') == '1000'
             and os.environ.get('SUDO_GID') == '1000', 'identity')
        return {'effectiveUid': 0, 'effectiveGid': 0, 'sudoIdentity': 'uid1000'}

    def open(self, path, directory=False, optional=False):
        flags = os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC
        try:
            fd = os.open(path, flags | (os.O_DIRECTORY if directory else 0))
        except FileNotFoundError:
            if not optional:
                raise
            self.missing.append(path)
            return None
        # Retain immediately, before any fallible bookkeeping/validation.
        self.retained.append([path, fd, None, None, None])
        info = os.fstat(fd)
        need(info.st_uid == 0 and not info.st_mode & 0o6022 and
             (stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode) and info.st_nlink == 1), 'custody')
        need(stamp(os.stat(path, follow_symlinks=False)) == stamp(info), 'custody')
        self.retained[-1][2] = stamp(info)
        return self.retained[-1]

    def read(self, path, maximum, optional=False):
        row = self.open(path, optional=optional)
        if row is None:
            return None
        need(row[2][6] <= maximum, 'bounds')
        raw = os.pread(row[1], maximum + 1, 0)
        need(len(raw) <= maximum and len(raw) == row[2][6], 'bounds')
        row[3] = raw
        need(stamp(os.fstat(row[1])) == row[2], 'custody')
        return raw

    def locks(self):
        for path in ('/var/lib/dpkg/lock-frontend', '/var/lib/dpkg/lock'):
            row = self.open(path)
            fcntl.lockf(row[1], fcntl.LOCK_SH | fcntl.LOCK_NB)

    def pending(self):
        row = self.open('/var/lib/dpkg/updates', directory=True)
        names = []
        with os.scandir(row[1]) as entries:
            for entry in entries:
                need(len(names) < 4096, 'bounds')
                names.append((entry.name, stamp(entry.stat(follow_symlinks=False))))
        row[4] = sorted(names)
        need(not names, 'package-state')
        raw = self.read('/var/lib/dpkg/triggers/Unincorp', 131072, optional=True)
        need(raw in (None, b''), 'package-state')

    def os(self):
        fields = {}
        for line in self.read('/usr/lib/os-release', 8192).decode('ascii').splitlines():
            if line.startswith(('ID=', 'VERSION_ID=')):
                key, value = line.split('=', 1)
                need(key not in fields, 'os')
                fields[key] = value.strip('"')
        need(fields.get('ID') == 'debian' and
             re.fullmatch(r'13(?:\.[0-9]{1,3}){0,2}', fields.get('VERSION_ID', ''))
             and os.uname().machine == 'x86_64', 'os')
        return {'id': 'debian', 'version': fields['VERSION_ID'], 'architecture': 'amd64'}

    def architecture(self, records):
        dpkg = [p for p in records if p['Package'] == 'dpkg' and p['Status'].split()[2] == 'installed']
        need(len(dpkg) == 1 and dpkg[0].get('Architecture') == 'amd64', 'architecture')
        raw = self.read('/var/lib/dpkg/arch', 8192, optional=True)
        names = [] if raw is None else raw.decode('ascii').splitlines()
        need(raw is None or names and 'amd64' in names, 'architecture')
        need(len(names) <= 128 and len(set(names)) == len(names) and all(
             re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', a) and a not in ('all', 'unknown') for a in names), 'architecture')
        need(all(p.get('Architecture') in set(names) | {'amd64', 'all'}
                 for p in records if p['Status'].split()[2] == 'installed'), 'architecture')
        return {'native': 'amd64', 'foreign': sorted(a for a in names if a != 'amd64'),
                'source': 'dpkg-status-and-arch'}

    def resources(self):
        filesystems = {}
        for path in FILESYSTEMS:
            value = dict.fromkeys(CAPACITY)
            try:
                row = self.open(path, directory=True, optional=True)
                if row is None:
                    status = 'missing'
                else:
                    v = os.fstatvfs(row[1])
                    counts = (v.f_bavail * v.f_frsize, v.f_bfree * v.f_frsize, v.f_blocks * v.f_frsize,
                              v.f_favail, v.f_ffree, v.f_files)
                    need(all(type(n) is int and 0 <= n <= 2**63-1 for n in counts), 'resources')
                    need(counts[0] <= counts[1] <= counts[2] and counts[3] <= counts[4] <= counts[5], 'resources')
                    value, status = dict(zip(CAPACITY, counts)), 'known'
            except (OSError, Fault):
                status = 'unknown'
            filesystems[path] = dict(value, status=status)
        memory = {'status': 'unknown', 'totalBytes': None, 'availableBytes': None}
        try:
            # Proc pseudo-files have size0 and dynamic contents: retain/check
            # identity, but do not demand a second identical resource sample.
            row = self.open('/proc/meminfo')
            raw = os.pread(row[1], 16385, 0)
            need(len(raw) <= 16384, 'resources')
            values = {}
            for line in raw.decode('ascii').splitlines():
                if line.startswith(('MemTotal:', 'MemAvailable:')):
                    key, sep, value = line.partition(':')
                    need(key not in values and re.fullmatch(r'\s*[0-9]{1,16} kB', value), 'resources')
                    values[key] = int(value.split()[0]) * 1024
            total, available = values['MemTotal'], values['MemAvailable']
            need(0 <= available <= total <= 2**63-1 and total > 0, 'resources')
            memory = {'status': 'known', 'totalBytes': total, 'availableBytes': available}
        except (OSError, Fault, KeyError, ValueError, UnicodeError):
            pass
        affinity = {'status': 'unknown', 'count': None}
        try:
            count = len(os.sched_getaffinity(0))
            need(1 <= count <= 1048576, 'resources')
            affinity = {'status': 'known', 'count': count}
        except (OSError, Fault):
            pass
        return {'filesystems': filesystems, 'memory': memory, 'cpuAffinity': affinity}

    def locale(self):
        libc = ctypes.CDLL(None, use_errno=True)
        libc.newlocale.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_void_p)
        libc.newlocale.restype = ctypes.c_void_p
        libc.freelocale.argtypes = (ctypes.c_void_p,)
        ctypes.set_errno(0)
        # glibc LC_ALL_MASK: categories0..12 excluding the LC_ALL selector6.
        handle = libc.newlocale(0x1fbf, b'en_US.UTF-8', None)
        if not handle:
            missing = ctypes.get_errno() == errno.ENOENT
            return {'status': 'missing' if missing else 'unknown', 'available': False if missing else None}
        libc.freelocale(handle)
        return {'status': 'known', 'available': True}

    def keyring(self, version):
        try:
            raw = self.read('/usr/share/keyrings/debian-archive-keyring.gpg', 262144, optional=True)
            need(raw is None or len(raw) > 0, 'keyring')
            return {'status': 'missing' if raw is None else 'known', 'sha256': None if raw is None else sha(raw),
                    'bytes': None if raw is None else len(raw), 'packageVersion': version}
        except (OSError, Fault):
            return {'status': 'unknown', 'sha256': None, 'bytes': None, 'packageVersion': version}

    def verify(self):
        for path in self.missing:
            try:
                os.stat(path, follow_symlinks=False)
            except FileNotFoundError:
                continue
            raise Fault('custody')
        for path, fd, before, raw, names in self.retained:
            need(before is not None and stamp(os.fstat(fd)) == before
                 and stamp(os.stat(path, follow_symlinks=False)) == before, 'custody')
            if raw is not None:
                need(os.pread(fd, len(raw) + 1, 0) == raw, 'custody')
            if names is not None:
                after = []
                with os.scandir(fd) as entries:
                    for entry in entries:
                        need(len(after) < 4096, 'bounds')
                        after.append((entry.name, stamp(entry.stat(follow_symlinks=False))))
                need(sorted(after) == names, 'custody')
        # Metadata and path binding are checked again AFTER all byte/entry reads.
        for path, fd, before, _, _ in self.retained:
            need(stamp(os.fstat(fd)) == before and stamp(os.stat(path, follow_symlinks=False)) == before, 'custody')

    def close(self):
        failed = False
        while self.retained:
            _, fd, _, _, _ = self.retained.pop()
            try:
                os.close(fd)
            except OSError:
                failed = True  # never retry ambiguous Linux close
        need(not failed, 'custody')

def installed_version(records, package):
    values = [p['Version'] for p in records if p['Package'] == package and p['Status'].split()[2] == 'installed']
    need(len(values) <= 1)
    return values[0] if values else None

def collect(system):
    phase, failure, value = 'identity', None, None
    try:
        identity = system.identity()
        phase = 'os'
        operating = system.os()
        phase = 'package-lock'
        system.locks()
        phase = 'package-state'
        system.pending()
        phase = 'packages'
        raw = system.read('/var/lib/dpkg/status', 8388608)
        records = package_records(raw)
        package_state = state_for(records, raw)
        phase = 'architecture'
        architecture = system.architecture(records)
        phase = 'resources'
        resources = system.resources()
        need(all(v['status'] != 'unknown' for v in resources['filesystems'].values()) and
             resources['memory']['status'] == resources['cpuAffinity']['status'] == 'known', 'resources')
        phase = 'locale'
        locale = system.locale()
        need(locale['status'] != 'unknown', 'locale')
        phase = 'keyring'
        keyring = system.keyring(installed_version(records, 'debian-archive-keyring'))
        need(keyring['status'] != 'unknown', 'keyring')
        phase = 'custody'
        system.verify()
        value = {'schema': 'f102-build-facts-v1', 'identity': identity, 'os': operating,
                 'architecture': architecture, 'packages': records, 'packageState': package_state,
                 'resources': resources, 'locale': locale, 'keyring': keyring}
    except Deadline:
        failure = 'deadline'
    except BaseException as error:
        failure = error.args[0] if isinstance(error, Fault) and error.args[0] in FAILURES else phase
    finally:
        try:
            system.close()
        except Deadline:
            failure = failure or 'deadline'
        except BaseException:
            failure = failure or 'custody'
    if failure:
        raise Fault(failure)
    return value

def unavailable(failure):
    return {'schema': 'f102-build-facts-packet-v1', 'status': 'unavailable', 'firstFailure': failure,
            'encoding': 'zlib-base64', 'expandedBytes': 0, 'sha256': None, 'data': None}

def packet(value):
    raw = encode(value)
    need(0 < len(raw) <= 2097152, 'bounds')
    out = {'schema': 'f102-build-facts-packet-v1', 'status': 'observed', 'firstFailure': 'none',
           'encoding': 'zlib-base64', 'expandedBytes': len(raw), 'sha256': sha(raw),
           'data': base64.b64encode(zlib.compress(raw, 9)).decode('ascii')}
    need(len(encode(out)) <= 60000, 'bounds')
    return out

def main():
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(Deadline()))
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, lambda *_: (_ for _ in ()).throw(Deadline()))
    signal.setitimer(signal.ITIMER_REAL, 25)
    try:
        try:
            result = packet(collect(System()))
        except Deadline:
            result = unavailable('deadline')
        except BaseException as error:
            reason = error.args[0] if isinstance(error, Fault) and error.args[0] in FAILURES else 'output'
            result = unavailable(reason)
        raw = encode(result)
        need(os.write(1, raw) == len(raw), 'output')
        return 0 if result['status'] == 'observed' else 3
    except BaseException:
        return 3

if __name__ == '__main__':
    os._exit(main())
'''
PROBE_SHA256 = owner.digest(PROBE_SOURCE.encode('utf-8'))


def exact(value, keys):
    owner.require(type(value) is dict and set(value) == set(keys), 'protocol')


def integer(value, low=0, high=2**63-1):
    owner.require(type(value) is int and low <= value <= high, 'protocol')


def pattern(value, expression):
    owner.require(type(value) is str and re.fullmatch(expression, value) is not None, 'protocol')


def sha256(value):
    pattern(value, r'[a-f0-9]{64}')


def capture_id(value):
    pattern(value, r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}')
    owner.require(str(uuid.UUID(value)) == value, 'protocol')


def validate_version(value):
    pattern(value, r'[A-Za-z0-9.+:~\-]+')
    epoch, colon, rest = value.partition(':')
    if colon:
        pattern(epoch, r'[0-9]{1,10}')
        owner.require(int(epoch) <= 2147483647, 'protocol')
        value = rest
    upstream, hyphen, revision = value.rpartition('-')
    if hyphen:
        pattern(revision, r'[A-Za-z0-9+.~]+')
        value = upstream
    pattern(value, r'[0-9][A-Za-z0-9.+:~\-]*')


def validate_snapshot(value):
    """Host validator has no dependency on executing the guest parser/adapter."""
    exact(value, ('schema', 'identity', 'os', 'architecture', 'packages', 'packageState', 'resources', 'locale', 'keyring'))
    owner.require(value['schema'] == 'f102-build-facts-v1', 'protocol')
    ident = value['identity']
    exact(ident, ('effectiveUid', 'effectiveGid', 'sudoIdentity'))
    integer(ident['effectiveUid'], 0, 0)
    integer(ident['effectiveGid'], 0, 0)
    owner.require(ident['sudoIdentity'] == 'uid1000', 'protocol')
    operating = value['os']
    exact(operating, ('id', 'version', 'architecture'))
    owner.require(operating['id'] == 'debian' and operating['architecture'] == 'amd64', 'protocol')
    pattern(operating['version'], r'13(?:\.[0-9]{1,3}){0,2}')
    arch = value['architecture']
    exact(arch, ('native', 'foreign', 'source'))
    owner.require(arch['native'] == 'amd64' and arch['source'] == 'dpkg-status-and-arch'
                  and type(arch['foreign']) is list and len(arch['foreign']) <= 127, 'protocol')
    for item in arch['foreign']:
        pattern(item, r'[a-z0-9][a-z0-9-]{0,63}')
        owner.require(item not in ('all', 'unknown', 'amd64'), 'protocol')
    owner.require(arch['foreign'] == sorted(set(arch['foreign'])), 'protocol')
    records = value['packages']
    owner.require(type(records) is list and 1 <= len(records) <= 4096, 'protocol')
    order, holds, broken = [], [], 0
    keyring_version, dpkg_count = None, 0
    for record in records:
        owner.require(type(record) is dict and {'Package', 'Status'} <= set(record) <= set(FIELDS), 'protocol')
        for key, val in record.items():
            owner.require(type(val) is str and len(val.encode('utf-8')) <= 16384
                          and all(32 <= ord(c) < 127 for c in val), 'protocol')
            if key in FOLDED:
                owner.require(val == ' '.join(val.split()), 'protocol')
        pattern(record['Package'], r'[a-z0-9][a-z0-9+.-]{1,127}')
        parts = record['Status'].split(' ')
        owner.require(len(parts) == 3 and parts[0] in ('unknown', 'install', 'hold', 'deinstall', 'purge')
                      and parts[1] in ('ok', 'reinstreq') and parts[2] in ('not-installed', 'config-files',
                      'half-installed', 'unpacked', 'half-configured', 'triggers-awaited', 'triggers-pending', 'installed'), 'protocol')
        owner.require(parts[2] in ('not-installed', 'half-installed') or {'Architecture', 'Version'} <= set(record), 'protocol')
        if 'Architecture' in record:
            pattern(record['Architecture'], r'[a-z0-9][a-z0-9-]{0,63}')
            owner.require(record['Architecture'] != 'unknown', 'protocol')
        if parts[2] == 'installed':
            owner.require(record['Architecture'] in set(arch['foreign']) | {'amd64', 'all'}, 'protocol')
        if 'Version' in record:
            validate_version(record['Version'])
        for key in ('Essential', 'Protected'):
            owner.require(key not in record or record[key] in ('yes', 'no'), 'protocol')
        owner.require('Priority' not in record or record['Priority'] in ('required', 'important', 'standard', 'optional', 'extra'), 'protocol')
        owner.require('Multi-Arch' not in record or record['Multi-Arch'] in ('no', 'same', 'foreign', 'allowed'), 'protocol')
        owner.require(record.get('Multi-Arch') != 'same' or record.get('Architecture') not in (None, 'all'), 'protocol')
        if 'Installed-Size' in record:
            pattern(record['Installed-Size'], r'[0-9]{1,16}')
        order.append((record['Package'], record.get('Architecture', '')))
        if parts[0] == 'hold':
            holds.append({'package': record['Package'], 'architecture': record.get('Architecture')})
        broken += parts[1] != 'ok' or parts[2] not in ('installed', 'config-files', 'not-installed')
        if record['Package'] == 'dpkg' and parts[2] == 'installed':
            owner.require(record.get('Architecture') == 'amd64', 'protocol')
            dpkg_count += 1
        if record['Package'] == 'debian-archive-keyring' and parts[2] == 'installed':
            owner.require(keyring_version is None, 'protocol')
            keyring_version = record['Version']
    owner.require(order == sorted(set(order)) and dpkg_count == 1, 'protocol')
    state = value['packageState']
    exact(state, ('statusSha256', 'statusBytes', 'holds', 'pending'))
    sha256(state['statusSha256'])
    integer(state['statusBytes'], 1, 8388608)
    # Projection can discard bytes, never create a larger minimum deb822 input.
    minimum = sum(len(k) + 1 + len(v) + 1 for p in records for k, v in p.items()) + len(records) - 2
    owner.require(state['statusBytes'] >= minimum, 'protocol')
    owner.require(type(state['holds']) is list and state['holds'] == holds, 'protocol')
    for item in state['holds']:
        exact(item, ('package', 'architecture'))
    pending = state['pending']
    exact(pending, ('updates', 'triggers', 'broken', 'clean'))
    integer(pending['updates'], 0, 0)
    integer(pending['broken'], 0, 4096)
    owner.require(pending['triggers'] is False and type(pending['clean']) is bool
                  and pending['broken'] == broken and pending['clean'] == (broken == 0), 'protocol')
    resources = value['resources']
    exact(resources, ('filesystems', 'memory', 'cpuAffinity'))
    exact(resources['filesystems'], FILESYSTEMS)
    for capacity in resources['filesystems'].values():
        exact(capacity, ('status', *CAPACITY))
        owner.require(capacity['status'] in ('known', 'missing', 'unknown'), 'protocol')
        for key in CAPACITY:
            if capacity['status'] == 'known':
                integer(capacity[key])
            else:
                owner.require(capacity[key] is None, 'protocol')
        if capacity['status'] == 'known':
            owner.require(capacity['availableBytes'] <= capacity['freeBytes'] <= capacity['totalBytes']
                          and capacity['availableInodes'] <= capacity['freeInodes'] <= capacity['totalInodes'], 'protocol')
    memory = resources['memory']
    exact(memory, ('status', 'totalBytes', 'availableBytes'))
    owner.require(memory['status'] in ('known', 'unknown'), 'protocol')
    if memory['status'] == 'known':
        integer(memory['totalBytes'], 1)
        integer(memory['availableBytes'], 0, memory['totalBytes'])
    else:
        owner.require(memory['totalBytes'] is memory['availableBytes'] is None, 'protocol')
    affinity = resources['cpuAffinity']
    exact(affinity, ('status', 'count'))
    owner.require(affinity['status'] in ('known', 'unknown'), 'protocol')
    if affinity['status'] == 'known':
        integer(affinity['count'], 1, 1048576)
    else:
        owner.require(affinity['count'] is None, 'protocol')
    locale = value['locale']
    exact(locale, ('status', 'available'))
    owner.require(locale['status'] in ('known', 'missing', 'unknown'), 'protocol')
    owner.require(type(locale['available']) is bool if locale['status'] == 'known' else
                  locale['available'] is False if locale['status'] == 'missing' else locale['available'] is None, 'protocol')
    keyring = value['keyring']
    exact(keyring, ('status', 'sha256', 'bytes', 'packageVersion'))
    owner.require(keyring['status'] in ('known', 'missing', 'unknown') and keyring['packageVersion'] == keyring_version, 'protocol')
    if keyring['status'] == 'known':
        sha256(keyring['sha256'])
        integer(keyring['bytes'], 1, 262144)
    else:
        owner.require(keyring['sha256'] is keyring['bytes'] is None, 'protocol')
    return value


def decode_packet(raw, code):
    """Allocate at most declared+1 expanded bytes; never flush an unbounded stream."""
    try:
        packet = owner.unique_json(raw, MAX_PACKET)
        exact(packet, ('schema', 'status', 'firstFailure', 'encoding', 'expandedBytes', 'sha256', 'data'))
        owner.require(packet['schema'] == 'f102-build-facts-packet-v1' and packet['encoding'] == 'zlib-base64'
                      and packet['status'] in ('observed', 'unavailable') and packet['firstFailure'] in FAILURES, 'protocol')
        observed = packet['status'] == 'observed'
        owner.require(type(code) is int and code == (0 if observed else 3), 'protocol')
        if not observed:
            integer(packet['expandedBytes'], 0, 0)
            owner.require(packet['firstFailure'] != 'none' and packet['data'] is packet['sha256'] is None, 'protocol')
            return packet, None, None
        owner.require(packet['firstFailure'] == 'none', 'protocol')
        integer(packet['expandedBytes'], 1, MAX_SNAPSHOT)
        sha256(packet['sha256'])
        owner.require(type(packet['data']) is str and len(packet['data']) <= MAX_PACKET, 'protocol')
        compressed = base64.b64decode(packet['data'], validate=True)
        owner.require(base64.b64encode(compressed).decode('ascii') == packet['data'], 'protocol')
        decoder = zlib.decompressobj()
        expanded = decoder.decompress(compressed, packet['expandedBytes'] + 1)
        owner.require(len(expanded) == packet['expandedBytes'] and decoder.eof and not decoder.unused_data
                      and not decoder.unconsumed_tail and owner.digest(expanded) == packet['sha256'], 'protocol')
        snapshot = validate_snapshot(owner.unique_json(expanded, MAX_SNAPSHOT))
        owner.require(owner.encoded(snapshot) == expanded, 'protocol')
        owner.require(all(v['status'] != 'unknown' for v in snapshot['resources']['filesystems'].values())
                      and snapshot['resources']['memory']['status'] == snapshot['resources']['cpuAffinity']['status'] == 'known'
                      and snapshot['locale']['status'] != 'unknown' and snapshot['keyring']['status'] != 'unknown', 'protocol')
        return packet, snapshot, expanded
    except (KeyError, TypeError, ValueError, OverflowError, RecursionError, UnicodeError, binascii.Error, zlib.error):
        raise owner.Rejected('protocol') from None


def empty_facts():
    return {'status': 'not-received', 'firstFailure': 'none', 'packageCount': None,
            'bytes': None, 'sha256': None, 'captureId': None}


def validate_relay(value):
    try:
        return _validate_relay(value)
    except (KeyError, TypeError, ValueError, OverflowError, RecursionError):
        raise owner.Rejected('protocol') from None


def _validate_relay(value):
    exact(value, (*owner.empty_result(), 'buildFacts', 'artifact'))
    owner.require(len(owner.encoded(value)) <= 4096, 'output')
    lifecycle = {k: value[k] for k in owner.empty_result()}
    owner.validate_result(lifecycle)
    facts = value['buildFacts']
    exact(facts, empty_facts())
    owner.require(facts['status'] in ('not-received', 'unavailable', 'observed')
                  and facts['firstFailure'] in FAILURES, 'protocol')
    received = facts['status'] != 'not-received'
    owner.require(value['transportResultValid'] == received, 'protocol')
    if received:
        owner.require(value['mayHaveDispatched'], 'protocol')
        capture_id(facts['captureId'])
    else:
        owner.require(facts == empty_facts(), 'protocol')
    if facts['status'] == 'observed':
        owner.require(facts['firstFailure'] == 'none', 'protocol')
        integer(facts['packageCount'], 1, 4096)
        integer(facts['bytes'], 1, MAX_SNAPSHOT)
        sha256(facts['sha256'])
        exact(value['artifact'], ('device', 'inode'))
        integer(value['artifact']['device'])
        integer(value['artifact']['inode'], 1)
    else:
        owner.require(value['artifact'] is None and all(facts[k] is None for k in ('packageCount', 'bytes', 'sha256')), 'protocol')
        if received:
            owner.require(facts['firstFailure'] != 'none' and value['status'] != 'completed', 'protocol')
    return value


def facts_argv(pin, readiness=False):
    owner.require(type(readiness) is bool)
    remote = ('/usr/bin/true',) if readiness else ('/usr/bin/python3', '-I', '-B', '-c', shlex.quote(PROBE_SOURCE))
    return owner.fixed_ssh_argv(pin, remote)


def open_artifact_writer(rootfd, name):
    # FileIO owns open/close in C, including its closed state on syscall errors.
    # The C partial avoids a Python opener handing an unowned descriptor back.
    # x+ supplies O_CREAT|O_EXCL, which refuses existing symlinks as well as all
    # other existing objects; the retained directory and mode remain fixed.
    return io.FileIO(name, 'x+', opener=partial(os.open, mode=0o400, dir_fd=rootfd))


class BuildFactsReservation(owner.Reservation):
    permit_name = PERMIT

    def __init__(self, root=owner.LAB):
        super().__init__(root)
        self.artifact_writer = None
        self.artifactfd = None
        self.artifact_id = self.artifact_raw = None
        self.artifact_uncertain = False

    @property
    def artifactfd(self):
        if self.artifact_writer is not None and not self.artifact_writer.closed:
            return self.artifact_writer.fileno()
        return self._artifactfd

    @artifactfd.setter
    def artifactfd(self, value):
        self._artifactfd = value

    def permit(self, base_sha, source_sha, probe_sha):
        pin = self.read_permit()
        exact(pin, ('schema', 'jobKind', 'captureId', 'containerId', 'imageId', 'labRoot', 'labDevice', 'labInode',
                    'ownerSha256', 'buildFactsOwnerSha256', 'buildFactsProbeSha256', 'guestAccount',
                    'guestPrivilege', 'buildFactsAuthorityReviewed'))
        owner.require(type(pin['schema']) is int and pin['schema'] == 1 and pin['jobKind'] == 'build-facts-only'
                      and pin['containerId'] == owner.CONTAINER and pin['imageId'] == owner.IMAGE
                      and pin['labRoot'] == str(owner.LAB) and pin['guestAccount'] == 'linuxcast'
                      and pin['guestPrivilege'] == 'sudo-noninteractive' and pin['buildFactsAuthorityReviewed'] is True)
        capture_id(pin['captureId'])
        for key, expected in zip(('labDevice', 'labInode'), self.root_id):
            integer(pin[key])
            owner.require(pin[key] == expected)
        for key, expected in (('ownerSha256', base_sha), ('buildFactsOwnerSha256', source_sha), ('buildFactsProbeSha256', probe_sha)):
            sha256(pin[key])
            owner.require(pin[key] == expected)
        self.pin = pin
        self.check()

    def artifact_name(self):
        capture_id(self.pin['captureId'])
        return 'f102-build-facts-' + self.pin['captureId'] + '.json'

    def create_marker(self):
        # The shared transaction loads/recoveries an interrupted marker FIRST.
        # Existing artifacts only block fresh admission, never owned recovery.
        try:
            os.stat(self.artifact_name(), dir_fd=self.rootfd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise owner.Rejected('custody')
        super().create_marker()

    @staticmethod
    def result():
        return dict(owner.empty_result(), buildFacts=empty_facts(), artifact=None)

    def check_artifact(self):
        owner.require(not self.artifact_uncertain, 'custody')
        if self.artifactfd is not None:
            info = self.binding(self.artifact_name(), self.artifactfd)
            owner.regular(info, self.uid, 0o400)
            owner.require(owner.identity(info) == self.artifact_id and info.st_size == len(self.artifact_raw)
                          and owner.read_fd(self.artifactfd, MAX_SNAPSHOT) == self.artifact_raw, 'custody')
            owner.require(owner.identity(self.binding(self.artifact_name(), self.artifactfd)) == self.artifact_id, 'custody')

    def remove_marker(self):
        # Artifact failure must not prevent exact child/guest shutdown. It only
        # prevents releasing a clean reservation or making a publication claim.
        self.check_artifact()
        super().remove_marker()

    def publish(self, raw):
        owner.require(self.artifactfd is None and self.artifact_raw is None, 'custody')
        self.check()
        # All ambiguous partial files remain. Neither failure nor close ever
        # unlinks/adopts a replacement or reports rollback.
        self.artifact_raw = raw
        try:
            self.artifact_writer = open_artifact_writer(self.rootfd, self.artifact_name())
            self.artifact_id = owner.identity(os.fstat(self.artifactfd))
            offset = 0
            while offset < len(raw):
                written = os.pwrite(self.artifactfd, raw[offset:], offset)
                owner.require(type(written) is int and 0 < written <= len(raw) - offset, 'custody')
                offset += written
            self.check()
            self.check_artifact()
            os.fsync(self.artifactfd)
            os.fsync(self.rootfd)
            self.check()
            self.check_artifact()
            self.artifact_uncertain = True
            # Before this C call the object owns an open writer; after it the
            # object's closed state retires the number even if a signal raises.
            # No Python finally handoff and no alarm masking/retry are needed.
            self.artifact_writer.close()
            owner.require(self.artifact_writer.closed, 'custody')
            self.artifactfd = os.open(self.artifact_name(), os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK,
                                      dir_fd=self.rootfd)
            self.artifact_uncertain = False
            self.check()
            self.check_artifact()
            return dict(zip(('device', 'inode'), self.artifact_id))
        except BaseException as error:
            self.artifact_uncertain = True
            if isinstance(error, OSError):
                raise owner.Rejected('custody') from None
            raise

    def invalidate(self, value):
        # Custody loss cannot turn a previous operation failure into success or
        # drop accounted attempts. Remove only the claim, never the artifact.
        value.update(status='incomplete', reservationClean=False)
        if value['buildFacts']['status'] == 'observed':
            value.update(transportResultValid=False, buildFacts=empty_facts(), artifact=None)
        if value['firstFailure'] == 'none':
            value['firstFailure'] = 'custody'
        if value['cleanupFailure'] == 'none':
            value['cleanupFailure'] = 'custody'
        return value

    def validate_reply(self, value):
        validate_relay(value)
        if value['buildFacts']['status'] != 'not-received':
            owner.require(self.pin is not None and value['buildFacts']['captureId'] == self.pin['captureId'], 'custody')
        # A sent packet precedes guardian retirement. A later lost guardian or
        # cleanup failure cannot leave its earlier artifact observation valid.
        if value['buildFacts']['status'] == 'observed' and (
                value['firstFailure'] == 'guardian-lost' or value['cleanupFailure'] != 'none'):
            self.invalidate(value)
        if value['artifact'] is not None:
            try:
                if self.artifactfd is None:
                    # Caller independently reopens the guardian's exact identity.
                    self.artifact_raw = None
                    self.artifact_id = (value['artifact']['device'], value['artifact']['inode'])
                    self.artifactfd = os.open(self.artifact_name(), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC,
                                              dir_fd=self.rootfd)
                    raw = owner.read_fd(self.artifactfd, MAX_SNAPSHOT)
                    owner.require(len(raw) == value['buildFacts']['bytes']
                                  and owner.digest(raw) == value['buildFacts']['sha256'], 'custody')
                    snapshot = validate_snapshot(owner.unique_json(raw, MAX_SNAPSHOT))
                    owner.require(owner.encoded(snapshot) == raw and len(snapshot['packages']) == value['buildFacts']['packageCount'], 'custody')
                    self.artifact_raw = raw
                owner.require(self.artifact_id == (value['artifact']['device'], value['artifact']['inode'])
                              and len(self.artifact_raw) == value['buildFacts']['bytes']
                              and owner.digest(self.artifact_raw) == value['buildFacts']['sha256'], 'custody')
                decoded = validate_snapshot(owner.unique_json(self.artifact_raw, MAX_SNAPSHOT))
                owner.require(len(decoded['packages']) == value['buildFacts']['packageCount'], 'custody')
                self.check()
                self.check_artifact()
            except BaseException:
                self.artifact_uncertain = True
                self.invalidate(value)
        return validate_relay(value)

    def close(self):
        success = not self.artifact_uncertain
        if self.artifact_writer is not None and not self.artifact_writer.closed:
            try:
                self.check_artifact_closed(self.artifact_writer.fileno())
            except BaseException:
                success = False
            try:
                self.artifact_writer.close()
            except BaseException:
                success = False
        elif self.artifactfd is not None:
            fd, self.artifactfd = self.artifactfd, None
            try:
                self.check_artifact_closed(fd)
            except BaseException:
                success = False
            try:
                os.close(fd)
            except BaseException:
                success = False
        return super().close() and success

    def check_artifact_closed(self, fd):
        # Temporarily checking the retained descriptor without adopting anything.
        info = self.binding(self.artifact_name(), fd)
        owner.regular(info, self.uid, 0o400)
        owner.require(owner.identity(info) == self.artifact_id and self.artifact_raw is not None
                      and owner.read_fd(fd, MAX_SNAPSHOT) == self.artifact_raw, 'custody')


class BuildFactsLab(owner.NativeLab):
    job_seconds = 30

    def cleanup_authorized(self):
        return self.lease.pin['buildFactsAuthorityReviewed'] is True

    def check_sources(self):
        base, source, probe, _ = source_pins()
        owner.require(all(self.lease.pin[k] == v for k, v in (
            ('ownerSha256', base), ('buildFactsOwnerSha256', source), ('buildFactsProbeSha256', probe))), 'custody')

    def command(self, op, budget):
        if op == 'start':
            self.check_sources()
        return super().command(op, budget)

    def ready(self, budget):
        while True:
            self.check()
            self.lease.check()
            code, raw = self.children.run(facts_argv(self.lease.pin, True), owner.Budget(8, budget))
            owner.require(not raw, 'protocol')
            if code == 0:
                return
            owner.require(code == 255, 'transport')
            owner.time.sleep(min(.2, budget.remaining()))

    def dispatch(self, budget):
        owner.require(not self.dispatch_attempted, 'reservation')
        self.dispatch_attempted = True
        self.lease.intent('mayHaveDispatched')
        self.lease.check()
        self.check_sources()
        return self.children.run(facts_argv(self.lease.pin), owner.Budget(30, budget))

    def validate_job_reply(self, raw, code, result):
        packet, snapshot, expanded = decode_packet(raw, code)
        facts = {'status': packet['status'], 'firstFailure': packet['firstFailure'],
                 'packageCount': None if snapshot is None else len(snapshot['packages']),
                 'bytes': None if snapshot is None else len(expanded),
                 'sha256': packet['sha256'], 'captureId': self.lease.pin['captureId']}
        artifact = None if expanded is None else self.lease.publish(expanded)
        # A single plain-dict operation is the claim's commit point. Cancellation
        # before it leaves unclaimed partial custody; after it preserves validity.
        result.update(buildFacts=facts, artifact=artifact, transportResultValid=True)
        return snapshot is not None


def public_result(value):
    validate_relay(value)
    public = {'schema': 'f102-build-facts-owner-v1', 'jobKind': 'build-facts-only',
              'lifecycle': {k: value[k] for k in owner.empty_result()},
              'buildFacts': value['buildFacts'], 'acceptance': 'pending'}
    owner.require(len(owner.encoded(public)) <= 4096, 'output')
    return public


def source_pins():
    path = Path(__file__).resolve(strict=True)
    base = owner.digest(owner.read_source(path.with_name('lab_owner.py'), 1024 * 1024))
    source = owner.digest(owner.read_source(path, 1024 * 1024))
    raw = owner.read_source(path.with_name('outer-owner-inventory.json'), owner.MAX_BYTES)
    owner.require(owner.digest(raw) == owner.INVENTORY_SHA256, 'configuration')
    return base, source, PROBE_SHA256, owner.unique_json(raw)


def main(argv=None):
    parser = owner.ClosedParser(description=__doc__, allow_abbrev=False)
    for name in ('build-facts-owner', 'build-facts-probe'):
        parser.add_argument('--reviewed-' + name, action='store_true', required=True)
    parser.parse_args(argv)
    lease = BuildFactsReservation()
    result = lease.result()
    try:
        with owner.operation_deadline() as deadline:
            owner.require(sys.platform == 'linux' and hasattr(os, 'pidfd_open') and hasattr(os, 'fork'))
            owner.require(os.uname().machine == 'x86_64' and hasattr(signal, 'pidfd_send_signal'))
            owner.require(len(os.listdir('/proc/self/task')) == 1)
            owner.require(not os.path.lexists(owner.DOCKER[4]))
            os.umask(0o077)
            for fd in os.listdir('/proc/self/fd'):
                if int(fd) > 2:
                    try:
                        os.close(int(fd))
                    except OSError:
                        pass
            os.environ.clear()
            os.environ.update(owner.ENV)
            for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
                signal.signal(sig, lambda *_: (_ for _ in ()).throw(owner.Rejected('interrupted')))
            signal.pthread_sigmask(signal.SIG_SETMASK, set())
            base, source, probe, inventory = source_pins()
            lease.acquire()
            lease.permit(base, source, probe)
            owner.require(source_pins() == (base, source, probe, inventory), 'custody')
            result = owner.run_guarded(lease, lambda held, check: BuildFactsLab(held, inventory, check), deadline)
    except BaseException as error:
        if result['firstFailure'] == 'none':
            result['firstFailure'] = owner.reason(error)
    finally:
        if not lease.close():
            # A final-close ambiguity invalidates any completed publication.
            lease.invalidate(result)
    print(owner.encoded(public_result(result)).decode('ascii'))
    return 0 if result['status'] == 'completed' else 3


if __name__ == '__main__':
    raise SystemExit(main())
