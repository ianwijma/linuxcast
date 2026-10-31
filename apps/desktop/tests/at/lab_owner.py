"""Fixed v4 outer lab owner. Inert until explicitly invoked; review before use.

No Docker/SSH backend, paths, identities, timeouts or commands are CLI options.
The private coordinator permit is authority, not proof of guest prerequisites.
Tests inject only synthetic adapters. SIGKILL/outage cannot run finalizers:
durable dirty custody and conservative recovery cover total-owner loss.
"""
import argparse
import contextlib
import ctypes
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import socket
import stat
import subprocess
import sys
import time


LAB = Path('/home/ian/Projects/ianwijma/linuxcast/.worktrees/private-lab')
CONTAINER = '674cd884c30e07cdaa12e8d238209adbb1af03fb18e92ea9fa80586d0c7f5098'
IMAGE = 'sha256:a1805464d68589e26be87a26cf7f8577a0b0dc494c88b1d14cb9cf7f155c4d10'
TREE = '5a85d5251101716b338e820f23f78eef5e162dfb'
ARCHIVE = '732f7bcc1aced64225ce13f4ee2ebaf848e623a5d3a3b631f1236d574a8436dc'
LOCK = 'f102-coordinator.lock'
PERMIT = 'f102-owner-permit.json'
MARKER = 'f102-outer-owner.json'
WRAPPER = '/usr/local/libexec/linuxcast-f102-lab/lab_namespace.py'
DOCKER = ('/usr/bin/docker', '--host', 'unix:///var/run/docker.sock',
          '--config', '/nonexistent-linuxcast-f102-docker-config')
ENV = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'HOME': '/nonexistent'}
MAX_BYTES = 65536
INVENTORY_SHA256 = 'a7f1095d0ce26fd41f32a51b21b0743dde0a35c024b854c59d609f62ba032b3d'
START_SECONDS, JOB_SECONDS, CLEAN_SECONDS, TOTAL_SECONDS = 120, 360, 45, 600
GUARDIAN_GRACE_SECONDS = 2
# Never spend the fallback's stop8/kill/three inspections/reap allowance waiting
# for guest shutdown. These are fixed parts of CLEAN_SECONDS, not extensions.
FALLBACK_SECONDS, GRACEFUL_SECONDS = 28, 11
CLEAN_INSPECT_SECONDS, POWEROFF_SECONDS = 3, 5
SSH_SHUTDOWN_DISCONNECTS = frozenset((
    b'Connection to 127.0.0.1 closed by remote host.\r\n',
    b'client_loop: send disconnect: Broken pipe\r\n',
))
REASONS = frozenset(('none', 'prerequisite', 'reservation', 'custody', 'foreign',
                     'configuration', 'interrupted', 'caller-lost', 'guardian-lost',
                     'deadline', 'child', 'output', 'transport', 'protocol', 'stop',
                     'kill', 'inspect', 'reap', 'cleanup', 'recovery', 'poweroff'))


class Rejected(Exception):
    """Only these fixed categories can reach public output."""


def require(condition, reason='prerequisite'):
    if not condition:
        raise Rejected(reason)


def reason(error, default='prerequisite'):
    return error.args[0] if isinstance(error, Rejected) and len(error.args) == 1 and error.args[0] in REASONS - {'none'} else default


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('ascii')


def unique_json(raw, maximum=MAX_BYTES):
    require(type(raw) is bytes and len(raw) <= maximum, 'output')

    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'protocol')
            result[key] = value
        return result

    try:
        return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: require(False, 'protocol'))
    except (ValueError, UnicodeError, RecursionError):
        raise Rejected('protocol') from None


def identity(info):
    return info.st_dev, info.st_ino


def regular(info, uid, mode=None):
    require(stat.S_ISREG(info.st_mode) and info.st_uid == uid and info.st_nlink == 1
            and not info.st_mode & 0o7000, 'custody')
    if mode is not None:
        require(stat.S_IMODE(info.st_mode) == mode, 'custody')


def read_fd(fd, maximum=MAX_BYTES):
    require(os.fstat(fd).st_size <= maximum, 'output')
    raw = os.pread(fd, maximum + 1, 0)
    require(len(raw) <= maximum, 'output')
    return raw


class Reservation:
    """Retained existing lock and descriptor-relative private marker custody."""

    def __init__(self, root=LAB):
        # root is an internal fixture seam, never an executable/CLI input.
        self.root = Path(root)
        self.uid = os.getuid()
        self.rootfd = self.lockfd = self.permitfd = self.markerfd = None
        self.state = None
        self.pin = None
        self.permit_raw = None
        self.marker_seen = False
        self.marker_raw = None
        self.used = False

    def acquire(self):
        require(self.rootfd is None and self.lockfd is None, 'reservation')
        self.state = self.pin = self.permit_raw = self.marker_raw = None
        self.used = self.marker_seen = False
        require(self.uid != 0 and os.geteuid() == self.uid)
        require(self.root.is_absolute() and self.root.resolve(strict=True) == self.root, 'custody')
        self.rootfd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        info = os.fstat(self.rootfd)
        require(info.st_uid == self.uid and stat.S_IMODE(info.st_mode) == 0o700, 'custody')
        self.root_id = identity(info)
        self.lockfd = os.open(LOCK, os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.rootfd)
        info = os.fstat(self.lockfd)
        regular(info, self.uid)
        require(stat.S_IMODE(info.st_mode) in (0o600, 0o664), 'custody')
        self.lock_id, self.lock_mode = identity(info), stat.S_IMODE(info.st_mode)
        try:
            fcntl.flock(self.lockfd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Rejected('reservation') from None
        self.check()

    def binding(self, name, fd):
        info = os.stat(name, dir_fd=self.rootfd, follow_symlinks=False)
        require(identity(info) == identity(os.fstat(fd)), 'custody')
        return info

    def check(self):
        info = os.stat(self.root, follow_symlinks=False)
        require(self.root.resolve(strict=True) == self.root and identity(info) == self.root_id
                and info.st_uid == self.uid and stat.S_IMODE(info.st_mode) == 0o700, 'custody')
        info = self.binding(LOCK, self.lockfd)
        regular(info, self.uid, self.lock_mode)
        if self.permitfd is not None:
            regular(self.binding(PERMIT, self.permitfd), self.uid, 0o400)
            require(read_fd(self.permitfd) == self.permit_raw, 'custody')
        if self.markerfd is not None:
            regular(self.binding(MARKER, self.markerfd), self.uid, 0o600)
            if self.marker_raw is not None:
                require(read_fd(self.markerfd, 4096) == self.marker_raw, 'custody')

    def permit(self, source_sha):
        self.permitfd = os.open(PERMIT, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.rootfd)
        regular(os.fstat(self.permitfd), self.uid, 0o400)
        self.permit_raw = read_fd(self.permitfd)
        pin = unique_json(self.permit_raw)
        keys = {'schema', 'containerId', 'imageId', 'labRoot', 'labDevice', 'labInode',
                'ownerSha256', 'sourceTree', 'archiveSha256', 'receiptSha256', 'nodeSha256',
                'guestWrapperSha256', 'guestAccount', 'guestPrivilege', 'guestPrerequisitesReviewed'}
        require(type(pin) is dict and set(pin) == keys)
        require(type(pin['schema']) is int and pin['schema'] == 1
                and pin['containerId'] == CONTAINER and pin['imageId'] == IMAGE
                and pin['labRoot'] == str(LAB) and pin['sourceTree'] == TREE
                and pin['archiveSha256'] == ARCHIVE and pin['ownerSha256'] == source_sha)
        require(all(type(pin[k]) is int and pin[k] == v for k, v in zip(('labDevice', 'labInode'), self.root_id)))
        require(all(type(pin[k]) is str and re.fullmatch('[a-f0-9]{64}', pin[k]) for k in
                    ('ownerSha256', 'archiveSha256', 'receiptSha256', 'nodeSha256', 'guestWrapperSha256')))
        # The account is coordinator-supplied fact; no default username or sudo assumption.
        require(type(pin['guestAccount']) is str and re.fullmatch('[a-z_][a-z0-9_-]{0,31}', pin['guestAccount'])
                and pin['guestPrivilege'] in ('root', 'sudo-noninteractive')
                and (pin['guestPrivilege'] != 'root' or pin['guestAccount'] == 'root')
                and pin['guestPrerequisitesReviewed'] is True)
        self.pin = pin
        self.check()

    def lease_binding(self):
        return {'containerId': CONTAINER, 'imageId': IMAGE, 'root': list(self.root_id),
                'lock': list(self.lock_id), 'permitSha256': digest(self.permit_raw)}

    def load_marker(self):
        self.marker_seen = True
        try:
            self.markerfd = os.open(MARKER, os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.rootfd)
        except FileNotFoundError:
            self.marker_seen = False
            return False
        regular(os.fstat(self.markerfd), self.uid, 0o600)
        raw = read_fd(self.markerfd, 4096)
        state = unique_json(raw, 4096)
        require(type(state) is dict and set(state) == {'schema', 'binding', 'lease', 'mayHaveStarted',
                'mayHaveDispatched', 'childrenUncertain', 'children'}, 'foreign')
        require(type(state['schema']) is int and state['schema'] == 1
                and encoded(state['binding']) == encoded(self.lease_binding())
                and type(state['lease']) is str and re.fullmatch('[a-f0-9]{32}', state['lease']), 'foreign')
        require(all(type(state[k]) is bool for k in ('mayHaveStarted', 'mayHaveDispatched', 'childrenUncertain'))
                and (not state['mayHaveDispatched'] or state['mayHaveStarted'])
                and type(state['children']) is list and len(state['children']) <= 16, 'foreign')
        for item in state['children']:
            require(type(item) is dict and set(item) == {'pid', 'start', 'boot'}
                    and type(item['pid']) is int and item['pid'] > 1
                    and type(item['start']) is int and item['start'] > 0
                    and type(item['boot']) is str
                    and re.fullmatch('[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}', item['boot']), 'foreign')
        self.state = state
        self.marker_raw = raw
        self.check()
        return True

    def create_marker(self):
        self.check()
        self.marker_seen = True
        self.marker_raw = None
        self.markerfd = os.open(MARKER, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC,
                                0o600, dir_fd=self.rootfd)
        self.state = {'schema': 1, 'binding': self.lease_binding(), 'lease': os.urandom(16).hex(),
                      'mayHaveStarted': False, 'mayHaveDispatched': False,
                      'childrenUncertain': False, 'children': []}
        self.save()
        os.fsync(self.rootfd)

    def save(self):
        self.check()
        raw = encoded(self.state)
        require(len(raw) <= 4096, 'custody')
        require(os.pwrite(self.markerfd, raw, 0) == len(raw), 'custody')
        os.ftruncate(self.markerfd, len(raw))
        self.marker_raw = raw
        os.fsync(self.markerfd)
        self.check()

    def intent(self, flag):
        self.check()
        require(self.state is not None and self.markerfd is not None
                and self.state[flag] is True and self.marker_raw == encoded(self.state), 'custody')

    def remove_marker(self):
        self.check()
        require(not self.state['childrenUncertain'] and not self.state['children'], 'reap')
        info = os.fstat(self.markerfd)
        os.unlink(MARKER, dir_fd=self.rootfd)
        require(os.fstat(self.markerfd).st_nlink == 0 and info.st_nlink == 1, 'custody')
        os.fsync(self.rootfd)
        os.close(self.markerfd)
        self.markerfd = None
        self.marker_raw = None
        self.check()

    def close(self):
        # Never LOCK_UN a descriptor shared with a live guardian via fork.
        success = True
        for attr in ('markerfd', 'permitfd', 'lockfd', 'rootfd'):
            fd = getattr(self, attr)
            if fd is not None:
                try:
                    os.close(fd)
                except OSError:
                    success = False
                setattr(self, attr, None)
        return success


def validate_inspect(value, inventory):
    require(type(value) is list and len(value) == 1 and type(value[0]) is dict, 'inspect')
    obj = value[0]
    require(obj.get('Id') == CONTAINER and obj.get('Name') == '/linuxcast-native-lab-v4'
            and obj.get('Image') == IMAGE, 'configuration')
    for key, pin in (('Config', 'configSha256'), ('HostConfig', 'hostConfigSha256'), ('Mounts', 'mountsSha256')):
        require(digest(encoded(obj.get(key))) == inventory[pin], 'configuration')
    config, host = obj['Config'], obj['HostConfig']
    require(config['User'] == inventory['configUser'] == '1000:1000'
            and config['Entrypoint'] == inventory['entrypoint']
            and config['Cmd'] == inventory['command'], 'configuration')
    require(obj.get('Path') == inventory['entrypoint'][0]
            and obj.get('Args') == inventory['entrypoint'][1:] + inventory['command'], 'configuration')
    ports = obj.get('NetworkSettings', {}).get('Ports')
    require(type(ports) is dict and all(value is None for value in ports.values()), 'configuration')
    require(host['Privileged'] is False and host['ReadonlyRootfs'] is True
            and host['CapDrop'] == ['ALL'] and host['SecurityOpt'] == ['no-new-privileges']
            and host['PortBindings'] == {} and host['Devices'] == []
            and host['DeviceRequests'] is None and host['NetworkMode'] == 'bridge'
            and host['AutoRemove'] is False and obj['Mounts'] == inventory['mounts'], 'configuration')
    # The complete HostConfig digest binds effective resource/namespace defaults;
    # unknown/malformed effective limits are rejected rather than invented.
    require(all(type(host.get(k)) is int and host[k] >= 0 for k in
                ('Memory', 'MemorySwap', 'NanoCpus', 'CpuQuota', 'CpuPeriod'))
            and (host.get('PidsLimit') is None or type(host['PidsLimit']) is int), 'configuration')
    state = obj.get('State')
    require(type(state) is dict and type(state.get('Running')) is bool
            and type(state.get('Pid')) is int and state['Pid'] >= 0
            and type(state.get('ExitCode')) is int
            and all(state.get(k) is False for k in ('Paused', 'Restarting', 'Dead', 'OOMKilled'))
            and state.get('Status') in ('running', 'exited'), 'inspect')
    require((state['Running'] and state['Status'] == 'running' and state['Pid'] > 0)
            or (not state['Running'] and state['Status'] == 'exited' and state['Pid'] == 0), 'inspect')
    return state


def baseline(state):
    return state['Running'] is False and state['Status'] == 'exited' and state['Pid'] == 0 and state['ExitCode'] == 0


def transport_argv(pin, probe='job'):
    require(probe in ('job', 'permit', 'wrapper-hash', 'poweroff'))
    ssh = ('/usr/bin/ssh', '-F', '/dev/null', '-T', '-n', '-p', '2222', '-l', pin['guestAccount'],
           '-i', '/lab/guest-key', '-o', 'UserKnownHostsFile=/lab/known_hosts',
           '-o', 'GlobalKnownHostsFile=/dev/null', '-o', 'StrictHostKeyChecking=yes',
           '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none',
           '-o', 'ForwardAgent=no', '-o', 'ClearAllForwardings=yes', '-o', 'ForwardX11=no',
           '-o', 'PermitLocalCommand=no', '-o', 'ProxyCommand=none', '-o', 'ProxyJump=none',
           '-o', 'ConnectionAttempts=1', '-o', 'ConnectTimeout=5', '-o', 'ServerAliveInterval=5',
           '-o', 'ServerAliveCountMax=2', '127.0.0.1')
    remote = {'permit': ('/usr/bin/cat', '/etc/linuxcast-f102-lab/permit.json'),
              'wrapper-hash': ('/usr/bin/sha256sum', WRAPPER),
              'poweroff': ('/usr/bin/systemctl', 'poweroff', '--no-block'),
              'job': ('/usr/bin/python3', '-I', '-B', WRAPPER,
                      '--reviewed-wrapper', '--reviewed-controller')}[probe]
    if pin['guestPrivilege'] == 'sudo-noninteractive':
        remote = ('/usr/bin/sudo', '-n', '--', *remote)
    return (*DOCKER, 'exec', '--user', '1000:1000', CONTAINER, '/usr/bin/env', '-i',
            'PATH=/usr/bin:/bin', 'HOME=/nonexistent', 'LANG=C', 'LC_ALL=C', *ssh, *remote)


def validate_guest_permit(raw, pin):
    value = unique_json(raw, 4096)
    keys = {'schema', 'machineIdSha256', 'productUuidSha256', 'sourceTree', 'archiveSha256',
            'receiptSha256', 'nodeSha256', 'wrapperSha256'}
    require(type(value) is dict and set(value) == keys and type(value['schema']) is int
            and value['schema'] == 1 and value['sourceTree'] == pin['sourceTree'])
    require(all(type(value[k]) is str and re.fullmatch('[a-f0-9]{64}', value[k]) for k in keys - {'schema', 'sourceTree'}))
    require(all(value[k] == pin[k] for k in ('archiveSha256', 'receiptSha256', 'nodeSha256'))
            and value['wrapperSha256'] == pin['guestWrapperSha256'])


def validate_transport(raw, code):
    obj = unique_json(raw, 4096)
    keys = {'schema', 'firstFailure', 'failedStep', 'cleanup', 'controllerMayHaveRun', 'controllerStatus',
            'controllerFirstFailure', 'controllerFailedStep', 'controllerCleanup', 'outerLabCleanup', 'acceptance'}
    require(type(obj) is dict and set(obj) == keys and obj['schema'] == 'f102-lab-wrapper-v1', 'protocol')
    require(obj['firstFailure'] in {'none', 'prerequisite', 'setup', 'deadline', 'controller', 'cleanup', 'interrupted'}
            and obj['failedStep'] in {'none', 'preflight', 'reserve', 'cgroup', 'start', 'admit', 'release', 'wait', 'report', 'cleanup'}
            and type(obj['cleanup']) is bool and type(obj['controllerMayHaveRun']) is bool
            and obj['outerLabCleanup'] == 'outstanding' and obj['acceptance'] == 'pending', 'protocol')
    require(obj['controllerStatus'] in {'unavailable', 'incomplete', 'observed-private-sequence'}
            and obj['controllerFirstFailure'] in {'unavailable', 'none', 'prerequisite', 'deadline', 'child',
                                                  'protocol', 'native', 'orca', 'product', 'cleanup'}
            and obj['controllerFailedStep'] in {'unavailable', 'none', 'setup', 'search', 'result', 'away', 'back',
                    'final', 'actions', 'form', 'save', 'cancel', 'restore', 'hide', 'reopen', 'loading', 'error', 'recovery'}
            and (obj['controllerCleanup'] is None or type(obj['controllerCleanup']) is bool), 'protocol')
    success = obj['firstFailure'] == 'none'
    require(code == (0 if success else 3), 'protocol')
    if success:
        require(obj['failedStep'] == 'none' and obj['cleanup'] and obj['controllerMayHaveRun']
                and obj['controllerStatus'] == 'observed-private-sequence' and obj['controllerFirstFailure'] == 'none'
                and obj['controllerFailedStep'] == 'none' and obj['controllerCleanup'] is True, 'protocol')
    else:
        require(obj['failedStep'] != 'none', 'protocol')
    return success


class Budget:
    def __init__(self, seconds, parent=None):
        self.end = min(time.monotonic() + seconds, parent.end if parent else float('inf'))

    def remaining(self):
        left = self.end - time.monotonic()
        require(left > 0, 'deadline')
        return left


def subreaper():
    require(ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0) == 0)


def own_children():
    # Only this dedicated single-thread owner's direct/adopted children; no host scan.
    raw = Path(f'/proc/self/task/{os.getpid()}/children').read_bytes()
    require(len(raw) <= 4096, 'reap')
    return [int(v) for v in raw.split()]


def process_identity(pid):
    raw = Path(f'/proc/{pid}/stat').read_bytes()
    fields = raw[raw.rindex(b')') + 2:].split()
    return {'pid': pid, 'start': int(fields[19]),
            'boot': Path('/proc/sys/kernel/random/boot_id').read_text().strip()}


@contextlib.contextmanager
def blocked_signals():
    # The hard alarm must remain deliverable even during spawn/bookkeeping.
    old = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGTERM, signal.SIGINT, signal.SIGHUP})
    try:
        yield
    finally:
        signal.pthread_sigmask(signal.SIG_SETMASK, old)


def child_setup():
    # Trusted Docker client and descendants die on owner loss; this alone is not
    # proof of descendant absence after simultaneous owner loss.
    parent = os.getppid()
    require(ctypes.CDLL(None, use_errno=True).prctl(1, signal.SIGKILL, 0, 0, 0) == 0)
    require(os.getppid() == parent and parent > 1)
    signal.pthread_sigmask(signal.SIG_SETMASK, set())


class Children:
    """Exact retained clients; Linux subreaper adoption closes detached-child gaps.

    Must run only in a dedicated single-thread process. No process-name actions.
    Journal uncertainty BEFORE Popen, including failed post-spawn publication.
    """

    def __init__(self, lease, check=lambda: None):
        self.lease, self.check = lease, check
        self.retained = []
        self.fault = False
        self.preserve_uncertain = False

    def run(self, argv, budget, *, capture_stderr=False):
        self.check()
        budget.remaining()
        # The first read-only inspect precedes the new marker. It still has
        # exact local ownership and reaping; no start/dispatch is possible yet.
        journal = self.lease.state is not None
        if journal:
            self.lease.state['childrenUncertain'] = True
            self.lease.save()
        child = None
        pidfd = None
        failed = False
        try:
            with blocked_signals():
                child = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                         env=ENV, cwd='/', start_new_session=True, close_fds=True,
                                         preexec_fn=child_setup)
                # Retain before every fallible identity/pidfd/journal operation.
                self.retained.append([child, None])
                pidfd = os.pidfd_open(child.pid)
                self.retained[-1][1] = pidfd
                if journal:
                    require(len(self.lease.state['children']) < 16, 'custody')
                    self.lease.state['children'].append(process_identity(child.pid))
                    self.lease.save()
            result = bytearray()
            diagnostics = bytearray()
            size = 0
            with selectors.DefaultSelector() as selector:
                for stream in (child.stdout, child.stderr):
                    os.set_blocking(stream.fileno(), False)
                    selector.register(stream, selectors.EVENT_READ)
                while selector.get_map():
                    self.check()
                    events = selector.select(min(.05, budget.remaining()))
                    for key, _ in events:
                        raw = os.read(key.fd, 8192)
                        size += len(raw)
                        require(size <= MAX_BYTES, 'output')
                        if raw and key.fileobj is child.stdout:
                            result.extend(raw)
                        elif raw and capture_stderr:
                            diagnostics.extend(raw)
                        if not raw:
                            selector.unregister(key.fileobj)
                code = child.wait(timeout=min(1, budget.remaining()))
            require(self.reap(Budget(2, budget)), 'reap')
            # Only shutdown classification requests private bounded stderr; it
            # never enters the public result or changes the combined byte cap.
            return (code, bytes(result), bytes(diagnostics)) if capture_stderr else (code, bytes(result))
        except BaseException:
            # Even a successful Popen followed by failed bookkeeping is retained;
            # subreaper discovery also handles an interrupted Python return path.
            failed = True
            try:
                self.reap(Budget(2))
            except BaseException:
                self.fault = True
            raise
        finally:
            if child is not None:
                close_failed = False
                for stream in (child.stdout, child.stderr):
                    if stream is not None:
                        try:
                            stream.close()
                        except BaseException:
                            self.fault = close_failed = True
                if close_failed and not failed:
                    raise Rejected('reap')

    def reap(self, budget):
        bad = False
        adopted = {}
        try:
            for child, pidfd in self.retained:
                if child.poll() is None:
                    try:
                        if pidfd is None:
                            # Unreaped direct-child PID cannot have been reused.
                            pidfd = os.pidfd_open(child.pid)
                        signal.pidfd_send_signal(pidfd, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    except BaseException:
                        bad = True
                        # A retained unreaped direct child cannot have its PID
                        # reused. This narrow fallback handles pidfd allocation
                        # failure without abandoning the child we just spawned.
                        try:
                            child.kill()
                        except ProcessLookupError:
                            pass
                        except BaseException:
                            pass
                    finally:
                        if pidfd is not None and all(pidfd != row[1] for row in self.retained):
                            os.close(pidfd)
            while budget.remaining():
                try:
                    for pid in own_children():
                        if any(child.pid == pid for child, _ in self.retained):
                            continue
                        if pid not in adopted:
                            adopted[pid] = os.pidfd_open(pid)
                        try:
                            signal.pidfd_send_signal(adopted[pid], signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    for child, _ in self.retained:
                        child.poll()
                    no_children = False
                    while True:
                        try:
                            found, _ = os.waitpid(-1, os.WNOHANG)
                            if found == 0:
                                break
                        except ChildProcessError:
                            no_children = True
                            break
                    if no_children and not own_children() and all(c.poll() is not None for c, _ in self.retained):
                        if bad:
                            self.fault = True
                        if not self.fault and not self.preserve_uncertain and self.lease.state is not None:
                            self.lease.state.update(children=[], childrenUncertain=False)
                            self.lease.save()
                        return not bad and not self.fault
                except BaseException:
                    bad = True
                time.sleep(.01)
        except BaseException:
            bad = True
        finally:
            live = []
            for child, pidfd in self.retained:
                if child.poll() is None:
                    live.append([child, pidfd])
                elif pidfd is not None:
                    os.close(pidfd)
            self.retained = live
            for pidfd in adopted.values():
                os.close(pidfd)
        self.fault = True
        return False


def empty_result():
    return {'schema': 'f102-outer-owner-v1', 'status': 'incomplete', 'firstFailure': 'none',
            'cleanupFailure': 'none', 'mayHaveStarted': False, 'mayHaveDispatched': False,
            'transportResultValid': False, 'ownedChildrenAbsent': False,
            'containerStoppedVerified': False, 'containerTerminated': False,
            'reservationClean': False, 'acceptance': 'pending'}


def validate_result(value):
    require(type(value) is dict and set(value) == set(empty_result())
            and value['schema'] == 'f102-outer-owner-v1'
            and value['status'] in {'incomplete', 'completed', 'recovered'}
            and value['firstFailure'] in REASONS and value['cleanupFailure'] in REASONS
            and value['acceptance'] == 'pending'
            and all(type(value[k]) is bool for k in ('mayHaveStarted', 'mayHaveDispatched', 'transportResultValid',
                    'ownedChildrenAbsent', 'containerStoppedVerified', 'containerTerminated', 'reservationClean')), 'protocol')
    require(not value['mayHaveDispatched'] or value['mayHaveStarted'], 'protocol')
    require(not value['containerStoppedVerified'] or value['containerTerminated'], 'protocol')
    require(not value['reservationClean'] or (value['ownedChildrenAbsent'] and value['containerStoppedVerified']
                                            and value['cleanupFailure'] == 'none'), 'protocol')
    if value['status'] == 'completed':
        require(value['firstFailure'] == 'none' and value['reservationClean'] and value['transportResultValid']
                and value['mayHaveDispatched'], 'protocol')
    if value['status'] == 'recovered':
        require(value['firstFailure'] == 'recovery' and value['reservationClean'], 'protocol')
    return value


class NativeLab:
    def __init__(self, lease, inventory, check=lambda: None):
        self.lease, self.inventory, self.check = lease, inventory, check
        self.children = Children(lease, check)
        self.recovery_uncertain = False
        self.start_attempted = self.dispatch_attempted = False
        self.poweroff_attempted = False

    def command(self, op, budget):
        if op == 'start':
            require(not self.start_attempted, 'reservation')
            self.start_attempted = True
        if op != 'inspect':
            self.lease.intent('mayHaveStarted')
        argv = {'inspect': (*DOCKER, 'inspect', '--type', 'container', CONTAINER),
                'start': (*DOCKER, 'start', CONTAINER),
                'stop': (*DOCKER, 'stop', '--time', '8', CONTAINER),
                'kill': (*DOCKER, 'kill', '--signal', 'KILL', CONTAINER)}[op]
        self.lease.check()
        code, raw = self.children.run(argv, Budget(12, budget))
        require(code == 0, op if op in ('inspect', 'stop', 'kill') else 'child')
        return raw

    def inspect(self, budget):
        return validate_inspect(unique_json(self.command('inspect', budget)), self.inventory)

    def ready(self, budget):
        # Only this non-effectful probe can repeat, within the SAME startup bound.
        while True:
            self.check()
            self.lease.check()
            code, raw = self.children.run(transport_argv(self.lease.pin, 'permit'), Budget(8, budget))
            if code == 0:
                validate_guest_permit(raw, self.lease.pin)
                break
            require(code == 255, 'transport')
            require(not raw, 'protocol')
            time.sleep(min(.2, budget.remaining()))
        self.lease.check()
        code, raw = self.children.run(transport_argv(self.lease.pin, 'wrapper-hash'), Budget(8, budget))
        require(code == 0 and raw == (self.lease.pin['guestWrapperSha256'] + '  ' + WRAPPER + '\n').encode('ascii'))

    def dispatch(self, budget):
        require(not self.dispatch_attempted, 'reservation')
        self.dispatch_attempted = True
        self.lease.intent('mayHaveDispatched')
        self.lease.check()
        return self.children.run(transport_argv(self.lease.pin), budget)

    def recover_children(self):
        # No host-wide process scan, no trust in a stale PID. Once all owners
        # vanished, unjournaled detached descendants cannot be excluded. Keep
        # that interrupted marker dirty for explicit coordinator recovery.
        self.recovery_uncertain = self.lease.state['childrenUncertain'] or bool(self.lease.state['children'])
        self.children.preserve_uncertain = self.recovery_uncertain

    def poweroff(self, budget):
        require(not self.poweroff_attempted, 'reservation')
        self.poweroff_attempted = True
        self.lease.intent('mayHaveStarted')
        # guestPrerequisitesReviewed includes authority for this exact fixed
        # action under the updated contract; no permit/account is manufactured.
        require(self.lease.pin['guestPrerequisitesReviewed'] is True)
        state = self.inspect(Budget(CLEAN_INSPECT_SECONDS, budget))
        if not state['Running']:
            return state  # a concurrent stop never justifies another guest action
        self.lease.check()
        code, raw, stderr = self.children.run(transport_argv(self.lease.pin, 'poweroff'),
                                             Budget(POWEROFF_SECONDS, budget), capture_stderr=True)
        # Accept only an empty acknowledgement or an exact known shutdown
        # disconnect as an uncertain request. Auth/sudo rejection, extra text,
        # unknown errors and failed probes remain failures even after exit0.
        require(not raw and ((code == 0 and not stderr)
                or (code == 255 and stderr in SSH_SHUTDOWN_DISCONNECTS)), 'poweroff')
        return None  # neither acknowledgement nor disconnect proves shutdown

    def graceful_stop(self, budget):
        state = self.poweroff(budget)
        while state is None or state['Running']:
            budget.remaining()
            state = self.inspect(Budget(CLEAN_INSPECT_SECONDS, budget))
            if not state['Running']:
                break
            # A bounded poll is not a replay of poweroff or of the native job.
            time.sleep(min(.2, budget.remaining()))
        return state

    def cleanup(self, budget):
        first = 'none'
        stopped = False
        terminated = False
        try:
            # Reap an interrupted transport BEFORE starting cleanup clients.
            require(self.children.reap(Budget(3, budget)), 'reap')
        except BaseException as error:
            first = reason(error, 'reap')
        state = None
        owned = self.lease.state['mayHaveStarted']
        try:
            state = self.inspect(Budget(CLEAN_INSPECT_SECONDS, budget))
            if state['Running'] and owned:
                try:
                    # Shrink to the current caller/guardian cleanup budget. Do
                    # not borrow fallback time when the caller already reaped a
                    # lost guardian or the initial inspection was slow.
                    available = budget.end - time.monotonic() - FALLBACK_SECONDS
                    require(available > 0, 'deadline')
                    state = self.graceful_stop(Budget(min(GRACEFUL_SECONDS, available), budget))
                except BaseException as error:
                    state = None  # no cached identity/state authorizes fallback
                    if first == 'none':
                        first = reason(error, 'poweroff')
            elif state['Running'] and first == 'none':
                first = 'foreign'
        except BaseException as error:
            if first == 'none':
                first = reason(error, 'inspect')
        if state is None and owned:
            try:
                state = self.inspect(Budget(CLEAN_INSPECT_SECONDS, budget))
                if state['Running']:
                    # Direct Docker stop is forced fallback. Never normalize a
                    # timeout/QEMU SIGTERM exit (143) or even forced exit0 into
                    # successful graceful shutdown.
                    try:
                        self.command('stop', Budget(10, budget))
                    except BaseException as error:
                        if first == 'none':
                            first = reason(error, 'stop')
                    if first == 'none':
                        first = 'stop'
                    state = self.inspect(Budget(CLEAN_INSPECT_SECONDS, budget))
                    if state['Running']:
                        try:
                            self.command('kill', Budget(3, budget))
                        except BaseException as error:
                            if first == 'none':
                                first = reason(error, 'kill')
                        # A failed/unknown kill reply is not absence; inspect
                        # again without replacing the earlier failure.
                        state = self.inspect(Budget(CLEAN_INSPECT_SECONDS, budget))
            except BaseException as error:
                if first == 'none':
                    first = reason(error, 'inspect')
                state = None
        if state is not None:
            stopped = baseline(state)
            terminated = not state['Running'] and state['Pid'] == 0
            if not stopped and first == 'none':
                first = 'stop'
        absent = self.children.reap(Budget(3, budget)) and not self.recovery_uncertain
        if not absent and first == 'none':
            first = 'reap'
        return first, absent, stopped, terminated


def transact(lease, lab, check=lambda: None):
    result = empty_result()
    recovery = False
    admitted = False
    total = Budget(TOTAL_SECONDS - CLEAN_SECONDS)
    try:
        require(not lease.used, 'reservation')
        lease.used = True
        recovery = lease.load_marker()
        if recovery:
            admitted = True
            result['firstFailure'] = 'recovery'
            lab.recover_children()
        else:
            startup = Budget(START_SECONDS, total)
            require(baseline(lab.inspect(startup)), 'foreign')
            check()
            lease.create_marker()
            admitted = True
            check()
            # Persist intent BEFORE spawn; failure to publish cannot mean zero.
            lease.state['mayHaveStarted'] = True
            lease.save()
            lab.command('start', startup)
            lab.ready(startup)
            check()
            lease.state['mayHaveDispatched'] = True
            lease.save()
            code, raw = lab.dispatch(Budget(JOB_SECONDS, total))
            success = validate_transport(raw, code)
            result['transportResultValid'] = True
            require(success, 'transport')
    except BaseException as error:
        if result['firstFailure'] == 'none':
            result['firstFailure'] = reason(error)
    finally:
        if lease.state is not None:
            result.update({k: lease.state[k] for k in ('mayHaveStarted', 'mayHaveDispatched')})
        elif lease.marker_seen:
            # Malformed/foreign custody is unknown progress, never count0.
            result.update(mayHaveStarted=True, mayHaveDispatched=True)
        if admitted:
            # Caller loss must no longer abort cleanup; only its separate deadline.
            lab.children.check = lambda: None
            lab.check = lambda: None
            try:
                with cleanup_alarm():
                    failure, absent, stopped, terminated = lab.cleanup(Budget(CLEAN_SECONDS))
                    result.update(cleanupFailure=failure, ownedChildrenAbsent=absent,
                                  containerStoppedVerified=stopped, containerTerminated=terminated)
                    if failure == 'none' and absent and stopped:
                        lease.remove_marker()
                        result['reservationClean'] = True
                    elif failure == 'none':
                        result['cleanupFailure'] = 'cleanup'
            except BaseException as error:
                result['cleanupFailure'] = reason(error, 'cleanup')
            if result['firstFailure'] == 'none' and result['cleanupFailure'] != 'none':
                result['firstFailure'] = 'cleanup'
        if result['reservationClean']:
            if result['firstFailure'] == 'none':
                result['status'] = 'completed'
            elif recovery and result['firstFailure'] == 'recovery':
                result['status'] = 'recovered'
    return validate_result(result)


@contextlib.contextmanager
def cleanup_alarm():
    # Ignore further cancellation while doing bounded cleanup. A cleanup alarm
    # raises into its enclosing cleanup handler, which retains dirty custody.
    old = {s: signal.getsignal(s) for s in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP, signal.SIGALRM)}
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, signal.SIG_IGN)
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(Rejected('deadline')))
    signal.setitimer(signal.ITIMER_REAL, CLEAN_SECONDS)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        for sig, handler in old.items():
            signal.signal(sig, handler)


def lifetime_check(channel):
    ready, _, _ = __import__('select').select([channel], [], [], 0)
    if ready:
        # After the sole start gate no message is accepted; EOF is caller loss.
        require(channel.recv(1) != b'', 'caller-lost')
        raise Rejected('interrupted')


def guardian(lease, lab_factory, channel):
    """Fork target; reservation remains retained even after caller SIGKILL."""
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, lambda *_: (_ for _ in ()).throw(Rejected('interrupted')))
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(Rejected('deadline')))
    # fork happened inside the caller's bookkeeping critical section. The
    # independent guardian MUST release that inherited signal mask; otherwise
    # SIGALRM and cancellation remain pending forever in a noncooperative job.
    signal.pthread_sigmask(signal.SIG_SETMASK, set())
    signal.setitimer(signal.ITIMER_REAL, TOTAL_SECONDS - CLEAN_SECONDS)
    subreaper()
    channel.settimeout(5)
    try:
        require(channel.recv(2) == b'G', 'caller-lost')
        channel.setblocking(False)
        check = lambda: lifetime_check(channel)
        result = transact(lease, lab_factory(lease, check), check)
        try:
            channel.send(encoded(result))
        except (BrokenPipeError, ConnectionResetError):
            pass
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        require(lease.close(), 'custody')
        channel.close()


def run_guarded(lease, lab_factory):
    """Dedicated caller only. Injection is a Python test seam, never a CLI flag."""
    subreaper()
    require(not own_children())
    caller, child_channel = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET)
    pid = pidfd = None
    result = None
    try:
        with blocked_signals():
            pid = os.fork()
            if pid == 0:
                caller.close()
                try:
                    guardian(lease, lab_factory, child_channel)
                    os._exit(0)
                except BaseException:
                    os._exit(3)
            # No effect until this exact guardian is retained and gate opened.
            pidfd = os.pidfd_open(pid)
            child_channel.close()
            caller.send(b'G')
        caller.setblocking(False)
        deadline = Budget(TOTAL_SECONDS)
        with selectors.DefaultSelector() as selector:
            selector.register(caller, selectors.EVENT_READ)
            selector.register(pidfd, selectors.EVENT_READ)
            while result is None:
                for key, _ in selector.select(min(.05, deadline.remaining())):
                    if key.fileobj is caller:
                        raw = caller.recv(4097)
                        require(bool(raw), 'guardian-lost')
                        result = validate_result(unique_json(raw, 4096))
                    elif result is None:
                        # A result and process exit can become ready together.
                        try:
                            raw = caller.recv(4097)
                            result = validate_result(unique_json(raw, 4096))
                        except (BlockingIOError, Rejected):
                            raise Rejected('guardian-lost') from None
        # Do not release a clean reservation until the exact guardian is reaped.
        reap_end = Budget(2)
        while True:
            found, status = os.waitpid(pid, os.WNOHANG)
            if found:
                require(os.waitstatus_to_exitcode(status) == 0, 'guardian-lost')
                pid = None
                break
            reap_end.remaining()
            time.sleep(.01)
        require(not own_children(), 'reap')
        lease.check()
        return result
    except BaseException as error:
        if result is None:
            result = empty_result()
            # Unknown guardian progress is conservative, never count0.
            result.update(mayHaveStarted=True, mayHaveDispatched=True)
        result.update(status='incomplete', reservationClean=False)
        if result['firstFailure'] == 'none':
            result['firstFailure'] = reason(error, 'guardian-lost')
        # One separate 45s budget covers guardian termination/reaping AND the
        # caller's identity-bound fallback. Repeated cancellation cannot reset it.
        with cleanup_alarm():
            cleanup = Budget(CLEAN_SECONDS)
            try:
                caller.close()  # EOF asks a live guardian to clean up.
                child_channel.close()  # also close the pre-gate fork-failure copy
                if pid is not None:
                    try:
                        if pidfd is None:
                            pidfd = os.pidfd_open(pid)
                        signal.pidfd_send_signal(pidfd, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    except BaseException:
                        # Exact unreaped direct guardian; its PID cannot be reused.
                        os.kill(pid, signal.SIGKILL)
                    grace = Budget(GUARDIAN_GRACE_SECONDS, cleanup)
                    while True:
                        found, _ = os.waitpid(pid, os.WNOHANG)
                        if found:
                            pid = None
                            break
                        if time.monotonic() >= grace.end:
                            try:
                                signal.pidfd_send_signal(pidfd, signal.SIGKILL)
                            except ProcessLookupError:
                                pass
                            break  # subreaper reaping below retains custody
                        time.sleep(.01)
                # Fork copies have separate markerfd/state; reopen the retained
                # binding rather than trusting stale caller memory.
                if lease.markerfd is not None:
                    os.close(lease.markerfd)
                    lease.markerfd = None
                # Reap our exact direct/adopted children even when filesystem
                # custody is lost. This never authorizes container actions.
                local = Children(lease)
                local.preserve_uncertain = True
                require(local.reap(Budget(3, cleanup)), 'reap')
                result['ownedChildrenAbsent'] = True
                lease.check()
                require(lease.load_marker(), 'recovery')
                lab = lab_factory(lease, lambda: None)
                failure, absent, stopped, terminated = lab.cleanup(cleanup)
                if result['cleanupFailure'] == 'none':
                    result['cleanupFailure'] = failure
                result.update(ownedChildrenAbsent=absent,
                              containerStoppedVerified=stopped, containerTerminated=terminated)
                if result['cleanupFailure'] == 'none' and absent and stopped:
                    lease.remove_marker()
                    result['reservationClean'] = True
            except BaseException as cleanup_error:
                if result['cleanupFailure'] == 'none':
                    result['cleanupFailure'] = reason(cleanup_error, 'cleanup')
        return validate_result(result)
    finally:
        caller.close()
        child_channel.close()
        if pidfd is not None:
            os.close(pidfd)


class ClosedParser(argparse.ArgumentParser):
    def error(self, _message):
        self.exit(3, 'Outer lab owner unavailable: explicit review acknowledgements required; overrides unavailable.\n')


def main(argv=None):
    parser = ClosedParser(description=__doc__, allow_abbrev=False)
    for name in ('owner', 'wrapper', 'controller'):
        parser.add_argument('--reviewed-' + name, action='store_true', required=True)
    parser.parse_args(argv)
    lease = Reservation()
    result = empty_result()
    try:
        require(sys.platform == 'linux' and hasattr(os, 'pidfd_open') and hasattr(os, 'fork'))
        require(os.uname().machine == 'x86_64' and hasattr(signal, 'pidfd_send_signal'))
        require(len(os.listdir('/proc/self/task')) == 1)
        # No ambient Docker config, context, credentials, inherited FDs or bus.
        require(not os.path.lexists(DOCKER[4]))
        os.umask(0o077)
        for fd in os.listdir('/proc/self/fd'):
            if int(fd) > 2:
                try:
                    os.close(int(fd))
                except OSError:
                    pass  # the directory enumeration descriptor is already closed
        os.environ.clear()
        os.environ.update(ENV)
        for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            signal.signal(sig, lambda *_: (_ for _ in ()).throw(Rejected('interrupted')))
        signal.pthread_sigmask(signal.SIG_SETMASK, set())
        source = Path(__file__).resolve(strict=True)
        source_sha = digest(read_source(source, 1024 * 1024))
        inventory_raw = read_source(source.with_name('outer-owner-inventory.json'), MAX_BYTES)
        require(digest(inventory_raw) == INVENTORY_SHA256, 'configuration')
        inventory = unique_json(inventory_raw)
        lease.acquire()
        lease.permit(source_sha)
        result = run_guarded(lease, lambda held, check: NativeLab(held, inventory, check))
    except BaseException as error:
        result['firstFailure'] = reason(error)
    finally:
        if not lease.close():
            result.update(status='incomplete', reservationClean=False, cleanupFailure='custody')
            if result['firstFailure'] == 'none':
                result['firstFailure'] = 'cleanup'
    print(encoded(validate_result(result)).decode('ascii'))
    return 0 if result['status'] == 'completed' else 3


def read_source(path, maximum):
    fd = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        regular(info, os.getuid())
        require(not info.st_mode & 0o022, 'custody')
        raw = read_fd(fd, maximum)
        after = os.fstat(fd)
        require((info.st_size, info.st_mtime_ns, info.st_ctime_ns) ==
                (after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'custody')
        return raw
    finally:
        os.close(fd)


if __name__ == '__main__':
    raise SystemExit(main())
