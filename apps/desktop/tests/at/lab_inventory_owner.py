"""Separate inventory-only reservation. Import is inert; no native admission bypass.

The embedded program is guest source DATA, not a host probe. No executable, path,
account, command, timeout, stdin program or backend is accepted by this CLI.
"""
import os
from pathlib import Path
import re
import shlex
import signal
import sys

import lab_owner as owner

PERMIT = 'f102-inventory-permit.json'
PACKAGES = ('python3', 'python3-gi', 'orca', 'at-spi2-core', 'gir1.2-atspi-2.0',
            'dbus', 'dbus-daemon', 'speech-dispatcher', 'speech-dispatcher-audio-plugins',
            'xvfb', 'xauth', 'xdotool', 'gcc', 'g++', 'make', 'pkg-config',
            'libc6-dev', 'libsqlite3-dev', 'libdbus-1-dev', 'libglib2.0-dev',
            'libx11-dev', 'libxtst-dev', 'systemd', 'util-linux')
PATHS = ('/usr/bin/python3', '/usr/bin/dbus-daemon', '/usr/bin/orca',
         '/usr/bin/Xvfb', '/usr/bin/xauth', '/usr/bin/xdotool',
         '/usr/bin/speech-dispatcher', '/usr/bin/gcc', '/usr/bin/g++',
         '/usr/bin/make', '/usr/bin/pkg-config', '/usr/bin/systemctl',
         '/usr/bin/sudo', '/usr/bin/true')
CONTROLLERS = ('cpu', 'cpuset', 'io', 'memory', 'pids', 'hugetlb', 'rdma', 'misc', 'dmem')
FAILURES = ('none', 'identity', 'os', 'packages', 'paths', 'cgroup', 'accounts',
            'proc', 'probe', 'cleanup', 'deadline', 'output')
PROBE_FAILURES = ('none', 'setup', 'fork', 'retain', 'gate', 'child', 'output', 'wait', 'cleanup')

# Constants are part of the exact UTF-8 source pin. No account/route interpolation.
PROBE_SOURCE = ('PACKAGES = ' + repr(PACKAGES) + '\nPATHS = ' + repr(PATHS)
                + '\nCONTROLLERS = ' + repr(CONTROLLERS) + '\n') + r'''
import ctypes
import json
import os
import re
import resource
import select
import signal
import stat
import time

class Fault(Exception):
    pass

class Deadline(BaseException):
    pass

def need(value):
    if not value:
        raise Fault()

def encode(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('ascii')

def read_fixed(path, limit):
    fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        need(stat.S_ISREG(os.fstat(fd).st_mode))
        chunks, size = [], 0
        while True:
            raw = os.read(fd, min(65536, limit + 1 - size))
            size += len(raw)
            need(size <= limit)
            if not raw:
                return b''.join(chunks)
            chunks.append(raw)
    finally:
        os.close(fd)

def text(path, limit):
    return read_fixed(path, limit).decode('utf-8')

def package_versions(raw):
    need(len(raw) <= 8 * 1024 * 1024)
    versions = dict.fromkeys(PACKAGES)
    seen = set()
    for paragraph in raw.split('\n\n'):
        need(len(paragraph) <= 131072)
        fields = {}
        for line in paragraph.splitlines():
            need(len(line) <= 16384)
            if line.startswith((' ', '\t')) or not line:
                continue
            key, sep, value = line.partition(': ')
            need(sep and key not in fields)
            fields[key] = value
        package = fields.get('Package')
        if package in versions:
            need(package not in seen)
            seen.add(package)
            if fields.get('Status') == 'install ok installed':
                version = fields.get('Version', '')
                need(re.fullmatch(r'[0-9][A-Za-z0-9.+:~\-]{0,95}', version))
                versions[package] = version
    return versions

def os_facts():
    fields = {}
    for line in text('/usr/lib/os-release', 8192).splitlines():
        if line.startswith(('ID=', 'VERSION_ID=')):
            key, value = line.split('=', 1)
            need(key not in fields)
            fields[key] = value.strip('"')
    need(re.fullmatch(r'[0-9]{1,3}(\.[0-9]{1,3}){0,2}', fields.get('VERSION_ID', '')))
    return {'status': 'known', 'id': 'debian' if fields.get('ID') == 'debian' else 'other',
            'version': fields['VERSION_ID'],
            'architecture': 'amd64' if os.uname().machine == 'x86_64' else 'other'}

def accounts():
    present = []
    for path, width, index in (('/etc/passwd', 7, 2), ('/etc/group', 4, 2)):
        found = False
        for line in text(path, 262144).splitlines():
            row = line.split(':')
            need(len(row) == width and row[index].isdigit())
            found = found or int(row[index]) == 20000
        present.append(found)
    return {'status': 'known', 'uidPresent': present[0], 'gidPresent': present[1]}

def process_counts():
    # Metadata only: never cmdline, environ, links to executables or file bodies.
    counts = {'status': 'known', 'total': 0, 'uid20000': 0,
              'graphicalCandidates': 0, 'testCandidates': 0}
    graphical = {'Xvfb', 'Xorg', 'Xwayland', 'orca', 'speech-dispatch', 'at-spi-bus-laun', 'at-spi2-registr'}
    tests = {'electron', 'linuxcast', 'xdotool'}
    with os.scandir('/proc') as entries:
        for entry in entries:
            if not entry.name.isdecimal():
                continue
            counts['total'] += 1
            need(counts['total'] <= 8192)
            # A vanished/unreadable process makes the snapshot UNKNOWN, not zero.
            fields = {}
            for line in text('/proc/' + entry.name + '/status', 16384).splitlines():
                key, sep, value = line.partition(':')
                if key in ('Name', 'Uid'):
                    need(sep and key not in fields)
                    fields[key] = value.strip()
            uids = fields.get('Uid', '').split()
            need(len(uids) == 4 and all(v.isdecimal() for v in uids))
            need('Name' in fields)
            counts['uid20000'] += int(any(int(v) == 20000 for v in uids))
            counts['graphicalCandidates'] += int(fields['Name'] in graphical)
            counts['testCandidates'] += int(fields['Name'] in tests)
    return counts

def ns_fact(kind):
    values, states = [], []
    for path in ('/proc/self/ns/' + kind, '/proc/1/ns/' + kind):
        try:
            info = os.stat(path)
            values.append((info.st_dev, info.st_ino))
            states.append('allowed')
        except PermissionError:
            values.append(None)
            states.append('denied')
        except OSError:
            values.append(None)
            states.append('unknown')
    return {'self': states[0], 'pid1': states[1],
            'same': values[0] == values[1] if None not in values else None}

class Ops:
    """Guest-only kernel adapter. Tests replace EVERY privileged operation."""
    def __init__(self):
        self.lib = ctypes.CDLL(None, use_errno=True)

    def prctl(self, option, value):
        need(self.lib.prctl(option, ctypes.c_ulong(value), 0, 0, 0) == 0)

    def drop(self, parent):
        # UAPI constants pinned to linux/prctl.h and linux/capability.h; no unshare.
        last = int(text('/proc/sys/kernel/cap_last_cap', 32))
        need(0 <= last <= 63)
        for cap in range(last + 1):
            self.prctl(24, cap)  # PR_CAPBSET_DROP
        self.prctl(47, 4)  # PR_CAP_AMBIENT_CLEAR_ALL
        self.prctl(38, 1)  # PR_SET_NO_NEW_PRIVS
        os.setgroups([])
        os.setresgid(20000, 20000, 20000)
        os.setresuid(20000, 20000, 20000)
        self.prctl(4, 0)  # PR_SET_DUMPABLE
        self.prctl(1, signal.SIGKILL)  # setuid clears PDEATHSIG; reapply immediately
        need(os.getppid() == parent)
        class Header(ctypes.Structure):
            _fields_ = [('version', ctypes.c_uint32), ('pid', ctypes.c_int)]
        class Data(ctypes.Structure):
            _fields_ = [('effective', ctypes.c_uint32), ('permitted', ctypes.c_uint32), ('inheritable', ctypes.c_uint32)]
        header, data = Header(0x20080522, 0), (Data * 2)()
        need(self.lib.capset(ctypes.byref(header), ctypes.byref(data)) == 0)
        need(os.getresuid() == (20000,) * 3 and os.getresgid() == (20000,) * 3 and not os.getgroups())
        fields = dict(line.split(':', 1) for line in text('/proc/self/status', 16384).splitlines() if ':' in line)
        need(all(int(fields[k].strip(), 16) == 0 for k in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb')))
        need(fields['NoNewPrivs'].strip() == '1')

    def pipe(self):
        return os.pipe2(os.O_CLOEXEC | os.O_NONBLOCK)

    fork = staticmethod(os.fork)
    pidfd = staticmethod(os.pidfd_open)
    close = staticmethod(os.close)
    read = staticmethod(os.read)
    write = staticmethod(os.write)
    wait = staticmethod(os.waitpid)
    kill = staticmethod(os.kill)
    fd_kill = staticmethod(signal.pidfd_send_signal)
    clock = staticmethod(time.monotonic)
    pause = staticmethod(time.sleep)

    def poll(self, fd, seconds):
        return bool(select.select([fd], [], [], seconds)[0])

    def child(self, gate, output, parent):
        # Independent short alarm survives setuid/PDEATHSIG reset and parent loss.
        signal.pthread_sigmask(signal.SIG_SETMASK, set())
        signal.signal(signal.SIGALRM, signal.SIG_DFL)
        signal.setitimer(signal.ITIMER_REAL, 2)
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        resource.setrlimit(resource.RLIMIT_CPU, (2, 2))
        self.prctl(1, signal.SIGKILL)
        need(os.getppid() == parent and parent > 1)
        need(self.poll(gate, 1) and self.read(gate, 2) == b'G')
        self.close(gate)
        self.drop(parent)
        raw = encode({'net': ns_fact('net'), 'pid': ns_fact('pid')})
        need(len(raw) <= 512 and self.write(output, raw) == len(raw))
        self.close(output)


def probe_empty(status='failed', failure='none', cleanup=True):
    unknown = {'self': 'unknown', 'pid1': 'unknown', 'same': None}
    return {'status': status, 'firstFailure': failure, 'cleanup': cleanup,
            'net': dict(unknown), 'pid': dict(unknown)}

def validate_ns(value):
    need(type(value) is dict and set(value) == {'net', 'pid'})
    for v in value.values():
        need(type(v) is dict and set(v) == {'self', 'pid1', 'same'})
        need(v['self'] in ('allowed', 'denied', 'unknown') and v['pid1'] in ('allowed', 'denied', 'unknown'))
        need(type(v['same']) is bool if v['self'] == v['pid1'] == 'allowed' else v['same'] is None)
    return value

def unique(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            need(key not in result)
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: need(False))

def feasibility(ops):
    result = probe_empty()
    fds, pid, pidfd, attempted, reaped = [], None, None, False, False
    phase, expired = 'setup', False
    try:
        parent = os.getpid()
        gate_r, gate_w = ops.pipe()
        fds.extend((gate_r, gate_w))
        out_r, out_w = ops.pipe()
        fds.extend((out_r, out_w))
        phase = 'fork'
        attempted = True  # lost fork return still requires sole-child ECHILD
        pid = ops.fork()
        if pid == 0:
            try:
                ops.close(gate_w)
                ops.close(out_r)
                ops.child(gate_r, out_w, parent)
                os._exit(0)
            except BaseException:
                os._exit(3)
        phase = 'retain'
        pidfd = ops.pidfd(pid)
        # Gate stays shut through all bookkeeping; no drop before exact retention.
        fds.remove(gate_r)
        ops.close(gate_r)
        fds.remove(out_w)
        ops.close(out_w)
        phase = 'gate'
        need(ops.write(gate_w, b'G') == 1)
        fds.remove(gate_w)
        ops.close(gate_w)
        phase = 'output'
        end, raw = ops.clock() + 3, bytearray()
        while True:
            left = end - ops.clock()
            need(left > 0)
            if not ops.poll(out_r, min(left, .05)):
                continue
            chunk = ops.read(out_r, 513)
            need(len(raw) + len(chunk) <= 512)
            if not chunk:
                break
            raw.extend(chunk)
        phase = 'wait'
        while True:
            found, status = ops.wait(pid, os.WNOHANG)
            if found:
                pid = None  # never signal a reaped/reusable PID, even on bad status
                try:
                    ops.wait(-1, os.WNOHANG)
                except ChildProcessError:
                    reaped = True
                need(reaped and os.waitstatus_to_exitcode(status) == 0)
                break
            need(ops.clock() < end)
            ops.poll(pidfd, .01)
        phase = 'output'
        result.update(validate_ns(unique(bytes(raw))))
        result['status'] = 'observed'
    except BaseException as error:
        expired = isinstance(error, Deadline)
        result['firstFailure'] = phase
    finally:
        # Closing the gate independently prevents a post-fork failure releasing it.
        # Exact direct-child PID fallback is safe until this sole waiter reaps it.
        clean = True
        # Gate/output writes are revoked before waiting, including lost fork PID.
        for fd in (gate_w, out_w) if attempted else ():
            if fd in fds:
                fds.remove(fd)
                try:
                    ops.close(fd)
                except BaseException:
                    clean = False
        if attempted and not reaped:
            if pid is not None:
                try:
                    if pidfd is None:
                        pidfd = ops.pidfd(pid)
                    ops.fd_kill(pidfd, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                except BaseException:
                    clean = False
                    try:
                        ops.kill(pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    except BaseException:
                        clean = False
            # A failed clock/bookkeeping call must never skip termination/reap.
            # The iteration cap independently bounds repeated clock/wait faults.
            try:
                end = ops.clock() + 2
            except BaseException:
                clean, end = False, None
            for _ in range(400):
                try:
                    found, _ = ops.wait(-1, os.WNOHANG)
                    if found:
                        pid = None
                        continue
                except ChildProcessError:
                    reaped = True
                    break
                except BaseException:
                    clean = False
                try:
                    if end is not None and ops.clock() >= end:
                        break
                    ops.pause(.005)
                except BaseException:
                    clean = False
        for fd in fds + ([pidfd] if pidfd is not None else []):
            try:
                ops.close(fd)
            except BaseException:
                clean = False
        result['cleanup'] = clean and (not attempted or reaped)
        if not result['cleanup'] and result['firstFailure'] == 'none':
            result['firstFailure'] = 'cleanup'
            result['status'] = 'failed'
        if result['status'] != 'observed':
            for kind in ('net', 'pid'):
                result[kind] = {'self': 'unknown', 'pid1': 'unknown', 'same': None}
    if expired:
        raise Deadline()
    return result

def collect():
    facts = {'identity': {'effectiveUid': 0 if os.geteuid() == 0 else None, 'effectiveGid': 0 if os.getegid() == 0 else None,
                         'sudoIdentity': 'uid1000' if os.environ.get('SUDO_UID') == os.environ.get('SUDO_GID') == '1000'
                         else 'absent' if 'SUDO_UID' not in os.environ and 'SUDO_GID' not in os.environ else 'unknown'},
             'os': {'status': 'unknown', 'id': 'unknown', 'version': None, 'architecture': 'unknown'},
             'packages': {'status': 'unknown', 'versions': dict.fromkeys(PACKAGES)},
             'paths': dict.fromkeys(PATHS), 'controllers': {'status': 'unknown', 'names': None},
             'accounts': {'status': 'unknown', 'uidPresent': None, 'gidPresent': None},
             'processes': {'status': 'unknown', 'total': None, 'uid20000': None,
                           'graphicalCandidates': None, 'testCandidates': None},
             'namespaceProbe': probe_empty('uid-unknown')}
    first = 'none'
    def attempt(key, fn, failure):
        nonlocal first
        try:
            facts[key] = fn()
        except Deadline:
            raise
        except BaseException:
            if first == 'none':
                first = failure
    if facts['identity']['effectiveUid'] != 0 or facts['identity']['effectiveGid'] != 0 or facts['identity']['sudoIdentity'] == 'unknown':
        return {'schema': 'f102-inventory-probe-v1', 'jobKind': 'inventory-only',
                'firstFailure': 'identity', 'facts': facts}
    attempt('os', os_facts, 'os')
    attempt('packages', lambda: {'status': 'known', 'versions': package_versions(text('/var/lib/dpkg/status', 8 * 1024 * 1024))}, 'packages')
    def paths():
        values = dict.fromkeys(PATHS)
        for path in PATHS:
            try:
                info = os.stat(path)
                values[path] = stat.S_ISREG(info.st_mode) and bool(info.st_mode & 0o111)
            except FileNotFoundError:
                values[path] = False
        return values
    attempt('paths', paths, 'paths')
    def controllers():
        names = text('/sys/fs/cgroup/cgroup.controllers', 1024).split()
        need(len(names) <= len(CONTROLLERS) and len(set(names)) == len(names) and set(names) <= set(CONTROLLERS))
        return {'status': 'known', 'names': sorted(names)}
    attempt('controllers', controllers, 'cgroup')
    attempt('accounts', accounts, 'accounts')
    attempt('processes', process_counts, 'proc')
    counts = facts['processes']
    if counts['status'] == 'known' and counts['uid20000'] == 0:
        try:
            facts['namespaceProbe'] = feasibility(Ops())
        except Deadline:
            raise
        except BaseException:
            facts['namespaceProbe'] = probe_empty('failed', 'setup', False)
        if facts['namespaceProbe']['firstFailure'] != 'none' and first == 'none':
            first = 'probe'
    elif counts['status'] == 'known':
        facts['namespaceProbe'] = probe_empty('uid-in-use')
    return {'schema': 'f102-inventory-probe-v1', 'jobKind': 'inventory-only', 'firstFailure': first, 'facts': facts}

def main():
    # Hard program deadline leaves room inside the fixed 30s transport budget.
    # Child has its own independent alarm even if this root parent is killed.
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(Deadline()))
    signal.setitimer(signal.ITIMER_REAL, 25)
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, lambda *_: (_ for _ in ()).throw(Deadline()))
    try:
        value = collect()
        raw = encode(value)
        need(len(raw) <= 4096)
        need(os.write(1, raw) == len(raw))
        return 0 if value['firstFailure'] == 'none' else 3
    except BaseException:
        return 3  # no arbitrary exception/traceback reaches SSH output

if __name__ == '__main__':
    os._exit(main())
'''
PROBE_SHA256 = owner.digest(PROBE_SOURCE.encode('utf-8'))


def inventory_argv(pin: dict, readiness: bool = False) -> tuple[str, ...]:
    owner.require(type(readiness) is bool)
    remote = ('/usr/bin/true',) if readiness else (
        '/usr/bin/python3', '-I', '-B', '-c', shlex.quote(PROBE_SOURCE))
    return owner.fixed_ssh_argv(pin, remote)


class InventoryReservation(owner.Reservation):
    permit_name = PERMIT

    def permit(self, owner_sha: str, inventory_sha: str, probe_sha: str) -> None:
        pin = self.read_permit()
        keys = {'schema', 'jobKind', 'containerId', 'imageId', 'labRoot', 'labDevice', 'labInode',
                'ownerSha256', 'inventoryOwnerSha256', 'inventoryProbeSha256', 'guestAccount',
                'guestPrivilege', 'inventoryAuthorityReviewed'}
        owner.require(type(pin) is dict and set(pin) == keys)
        owner.require(type(pin['schema']) is int and pin['schema'] == 1 and pin['jobKind'] == 'inventory-only'
                      and pin['containerId'] == owner.CONTAINER and pin['imageId'] == owner.IMAGE
                      and pin['labRoot'] == str(owner.LAB))
        owner.require(all(type(pin[k]) is int and pin[k] == v for k, v in
                          zip(('labDevice', 'labInode'), self.root_id)))
        for key, expected in (('ownerSha256', owner_sha), ('inventoryOwnerSha256', inventory_sha),
                              ('inventoryProbeSha256', probe_sha)):
            owner.require(type(pin[key]) is str and re.fullmatch('[a-f0-9]{64}', pin[key]) and pin[key] == expected)
        owner.require(type(pin['guestAccount']) is str and re.fullmatch('[a-z_][a-z0-9_-]{0,31}', pin['guestAccount'])
                      and pin['guestPrivilege'] in ('root', 'sudo-noninteractive')
                      and (pin['guestPrivilege'] != 'root' or pin['guestAccount'] == 'root')
                      and pin['inventoryAuthorityReviewed'] is True)
        self.pin = pin
        self.check()

    @staticmethod
    def result() -> dict:
        return dict(owner.empty_result(), inventoryReply=None)

    @staticmethod
    def validate_reply(value: dict) -> dict:
        owner.require(type(value) is dict and 'inventoryReply' in value, 'protocol')
        owner.require(len(owner.encoded(value)) <= 4096, 'output')
        lifecycle = {k: v for k, v in value.items() if k != 'inventoryReply'}
        owner.validate_result(lifecycle)
        reply = value['inventoryReply']
        if reply is not None:
            owner.require(type(reply) is dict, 'protocol')
            validate_inventory(owner.encoded(reply), 0 if reply.get('firstFailure') == 'none' else 3)
        owner.require(value['transportResultValid'] == (reply is not None), 'protocol')
        return value


class InventoryLab(owner.NativeLab):
    job_seconds = 30

    def cleanup_authorized(self) -> bool:
        return self.lease.pin['inventoryAuthorityReviewed'] is True

    def check_sources(self) -> None:
        base_sha, source_sha, probe_sha, _ = source_pins()
        owner.require(all(self.lease.pin[key] == value for key, value in (
            ('ownerSha256', base_sha), ('inventoryOwnerSha256', source_sha),
            ('inventoryProbeSha256', probe_sha))), 'custody')

    def command(self, op, budget):
        if op == 'start':
            self.check_sources()
        return super().command(op, budget)

    def ready(self, budget):
        while True:
            self.check()
            self.lease.check()
            code, raw = self.children.run(inventory_argv(self.lease.pin, True), owner.Budget(8, budget))
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
        return self.children.run(inventory_argv(self.lease.pin), owner.Budget(30, budget))

    def validate_job_reply(self, raw: bytes, code: int, result: dict) -> bool:
        reply = validate_inventory(raw, code)
        route = self.lease.pin['guestPrivilege']
        expected = 'uid1000' if route == 'sudo-noninteractive' else 'absent'
        owner.require(reply['facts']['identity']['sudoIdentity'] == expected, 'protocol')
        owner.require(len(owner.encoded(dict(result, inventoryReply=reply, transportResultValid=True))) <= 4096, 'output')
        result['inventoryReply'] = reply
        return reply['firstFailure'] == 'none'


def exact(value, keys):
    owner.require(type(value) is dict and set(value) == set(keys), 'protocol')


def validate_inventory(raw: bytes, code: int) -> dict:
    """Validate both closed shape and cross-field facts before relaying any bytes."""
    try:
        return _validate_inventory(raw, code)
    except (KeyError, TypeError, ValueError, OverflowError, RecursionError):
        raise owner.Rejected('protocol') from None


def _validate_inventory(raw, code):
    value = owner.unique_json(raw, 4096)
    exact(value, ('schema', 'jobKind', 'firstFailure', 'facts'))
    owner.require(value['schema'] == 'f102-inventory-probe-v1' and value['jobKind'] == 'inventory-only'
                  and value['firstFailure'] in FAILURES and type(code) is int
                  and code == (0 if value['firstFailure'] == 'none' else 3), 'protocol')
    facts = value['facts']
    exact(facts, ('identity', 'os', 'packages', 'paths', 'controllers', 'accounts', 'processes', 'namespaceProbe'))
    identity = facts['identity']
    exact(identity, ('effectiveUid', 'effectiveGid', 'sudoIdentity'))
    owner.require(all(v is None or type(v) is int and v == 0 for v in
                      (identity['effectiveUid'], identity['effectiveGid']))
                  and identity['sudoIdentity'] in ('absent', 'uid1000', 'unknown'), 'protocol')
    system = facts['os']
    exact(system, ('status', 'id', 'version', 'architecture'))
    known(system)
    if system['status'] == 'known':
        owner.require(system['id'] in ('debian', 'other') and system['architecture'] in ('amd64', 'other')
                      and type(system['version']) is str
                      and re.fullmatch(r'[0-9]{1,3}(\.[0-9]{1,3}){0,2}', system['version']), 'protocol')
    else:
        owner.require(system == {'status': 'unknown', 'id': 'unknown', 'version': None, 'architecture': 'unknown'}, 'protocol')
    packages = facts['packages']
    exact(packages, ('status', 'versions'))
    known(packages)
    exact(packages['versions'], PACKAGES)
    for v in packages['versions'].values():
        owner.require(v is None or packages['status'] == 'known' and type(v) is str
                      and re.fullmatch(r'[0-9][A-Za-z0-9.+:~\-]{0,95}', v), 'protocol')
    exact(facts['paths'], PATHS)
    owner.require(all(v is None or type(v) is bool for v in facts['paths'].values()), 'protocol')
    controllers = facts['controllers']
    exact(controllers, ('status', 'names'))
    known(controllers)
    names = controllers['names']
    owner.require(names is None if controllers['status'] == 'unknown' else
                  type(names) is list and len(names) <= len(CONTROLLERS)
                  and all(type(v) is str and v in CONTROLLERS for v in names)
                  and names == sorted(set(names)), 'protocol')
    accounts = facts['accounts']
    exact(accounts, ('status', 'uidPresent', 'gidPresent'))
    known(accounts)
    owner.require(all(type(accounts[k]) is bool if accounts['status'] == 'known' else accounts[k] is None
                      for k in ('uidPresent', 'gidPresent')), 'protocol')
    processes = facts['processes']
    counts = ('total', 'uid20000', 'graphicalCandidates', 'testCandidates')
    exact(processes, ('status', *counts))
    known(processes)
    owner.require(all(type(processes[k]) is int and 0 <= processes[k] <= 8192
                      if processes['status'] == 'known' else processes[k] is None for k in counts), 'protocol')
    if processes['status'] == 'known':
        owner.require(all(processes[k] <= processes['total'] for k in counts[1:]), 'protocol')
    probe = facts['namespaceProbe']
    exact(probe, ('status', 'firstFailure', 'cleanup', 'net', 'pid'))
    owner.require(probe['status'] in ('observed', 'uid-in-use', 'uid-unknown', 'failed')
                  and probe['firstFailure'] in PROBE_FAILURES and type(probe['cleanup']) is bool, 'protocol')
    for kind in ('net', 'pid'):
        v = probe[kind]
        exact(v, ('self', 'pid1', 'same'))
        owner.require(v['self'] in ('allowed', 'denied', 'unknown') and v['pid1'] in ('allowed', 'denied', 'unknown'), 'protocol')
        owner.require(type(v['same']) is bool if v['self'] == v['pid1'] == 'allowed' else v['same'] is None, 'protocol')
        if probe['status'] != 'observed':
            owner.require(v == {'self': 'unknown', 'pid1': 'unknown', 'same': None}, 'protocol')
    if processes['status'] == 'unknown':
        owner.require(probe['status'] == 'uid-unknown', 'protocol')
    elif processes['uid20000']:
        owner.require(probe['status'] == 'uid-in-use', 'protocol')
    else:
        owner.require(probe['status'] in ('observed', 'failed'), 'protocol')
    if probe['status'] == 'failed':
        owner.require(probe['firstFailure'] != 'none', 'protocol')
    else:
        owner.require(probe['firstFailure'] == 'none' and probe['cleanup'], 'protocol')
    # Missing metadata is not a successful zero. The first failed collection
    # stage is deterministic; denial/UID collision are valid observed facts.
    expected = 'none'
    conditions = (
        ('identity', identity['effectiveUid'] != 0 or identity['effectiveGid'] != 0 or identity['sudoIdentity'] == 'unknown'),
        ('os', system['status'] == 'unknown'), ('packages', packages['status'] == 'unknown'),
        ('paths', None in facts['paths'].values()), ('cgroup', controllers['status'] == 'unknown'),
        ('accounts', accounts['status'] == 'unknown'), ('proc', processes['status'] == 'unknown'),
        ('probe', probe['status'] == 'failed'))
    for failure, missing in conditions:
        if missing:
            expected = failure
            break
    owner.require(value['firstFailure'] == expected, 'protocol')
    return value


def known(value):
    owner.require(value['status'] in ('known', 'unknown'), 'protocol')


def public_result(value: dict) -> dict:
    InventoryReservation.validate_reply(value)
    return {'schema': 'f102-inventory-owner-v1', 'jobKind': 'inventory-only',
            'lifecycle': {k: v for k, v in value.items() if k != 'inventoryReply'},
            'inventory': value['inventoryReply'], 'acceptance': 'pending'}


def source_pins() -> tuple[str, str, str, dict]:
    source = Path(__file__).resolve(strict=True)
    base = source.with_name('lab_owner.py')
    # Only the fixed module siblings are read. No source/archive/receipt/user data.
    base_sha = owner.digest(owner.read_source(base, 1024 * 1024))
    source_sha = owner.digest(owner.read_source(source, 1024 * 1024))
    raw = owner.read_source(source.with_name('outer-owner-inventory.json'), owner.MAX_BYTES)
    owner.require(owner.digest(raw) == owner.INVENTORY_SHA256, 'configuration')
    return base_sha, source_sha, PROBE_SHA256, owner.unique_json(raw)


def main(argv=None):
    parser = owner.ClosedParser(description=__doc__, allow_abbrev=False)
    for name in ('inventory-owner', 'inventory-probe'):
        parser.add_argument('--reviewed-' + name, action='store_true', required=True)
    parser.parse_args(argv)
    lease = InventoryReservation()
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
            base_sha, source_sha, probe_sha, inventory = source_pins()
            lease.acquire()
            lease.permit(base_sha, source_sha, probe_sha)
            # Recheck all source bytes just before guardian admission; permit
            # bytes and path bindings continue under the shared retained checks.
            owner.require(source_pins() == (base_sha, source_sha, probe_sha, inventory), 'custody')
            result = owner.run_guarded(lease, lambda held, check: InventoryLab(held, inventory, check), deadline)
    except BaseException as error:
        if result['firstFailure'] == 'none':
            result['firstFailure'] = owner.reason(error)
    finally:
        if not lease.close():
            result.update(status='incomplete', reservationClean=False)
            if result['cleanupFailure'] == 'none':
                result['cleanupFailure'] = 'custody'
            if result['firstFailure'] == 'none':
                result['firstFailure'] = 'cleanup'
    print(owner.encoded(public_result(result)).decode('ascii'))
    return 0 if result['status'] == 'completed' else 3


if __name__ == '__main__':
    raise SystemExit(main())
