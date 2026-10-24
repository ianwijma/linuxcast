"""Private fixed metadata child. Importing has no udev or process effect."""
import ctypes
import hashlib
import importlib.util
import json
import os
import pathlib
import resource
import select
import signal
import socket
import stat
import struct
import sys
import time
import types

ENV = {'LC_ALL': 'C.UTF-8', 'LANG': 'C.UTF-8', 'PATH': '/usr/bin:/bin'}
ROOT = pathlib.Path('/tmp/linuxcast-s003-readiness-guardian-v1')
PINS = {
    'readiness.py': '1c766776f8105e19bb82f86d5e8a9696f0482fa6fd86f4d876f90dc60983a0f5',
    'udev_metadata.py': 'c22ae4178000cb050d98873935909fd8432c2a38032dbf3f1e14a0f23074e218',
}
MAX_PACKET = 4096
SO_PEERPIDFD = 77  # Verified /usr/include/asm-generic/socket.h:136.
CHILD_STAGES = frozenset({'CHILD_CHANNEL', 'CHILD_PEER_BINDING', 'CHILD_START',
    'CHILD_CATALOG', 'CHILD_METADATA_ADAPTER', 'CHILD_FILTER_OR_VALIDATION',
    'CHILD_PARENT_RECHECK', 'CHILD_RESULT', 'CHILD_CLEANUP'} |
    {'CHILD_ADAPTER_' + name for name in ('ENVIRONMENT', 'LIBRARY', 'C_RUNTIME',
    'SIGNATURES', 'CONTEXT', 'ENUMERATION', 'SUBSYSTEM_FILTER', 'KEYBOARD_FILTER',
    'SCAN', 'ENTRY', 'TIME_OR_COUNT', 'DEVICE', 'INITIALIZED', 'SEAT', 'PARENT',
    'METADATA', 'CLEANUP')})
PARENT_STAGES = frozenset({'PARENT_BOOTSTRAP', 'PARENT_CHANNEL', 'PARENT_SPAWN',
    'PARENT_REPLY', 'PARENT_QUERY_DEADLINE', 'PARENT_CLEANUP',
    'PARENT_CANCELLED', 'CHILD_NO_TYPED_RESULT'})
STAGES = CHILD_STAGES | PARENT_STAGES | {'OBSERVATION_COMPLETE'}


class Rejected(Exception):
    pass


class Unsupported(Rejected):
    pass


def require(value):
    if not value:
        raise Rejected() from None


def initialize():
    require(dict(os.environ) == ENV and os.getuid() == os.geteuid() != 0)
    require(os.uname().machine == 'x86_64')
    require(not signal.pthread_sigmask(signal.SIG_BLOCK, set()) &
            {signal.SIGALRM, signal.SIGTERM, signal.SIGHUP, signal.SIGINT})
    require(signal.getsignal(signal.SIGCHLD) == signal.SIG_DFL)
    signal.signal(signal.SIGCHLD, signal.SIG_DFL)  # Clear SA_NOCLDWAIT before spawning.
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    libc = ctypes.CDLL(None, use_errno=True)
    require(libc.prctl(4, 0, 0, 0, 0) == 0 and libc.prctl(3, 0, 0, 0, 0) == 0)
    require(resource.getrlimit(resource.RLIMIT_CORE) == (0, 0))
    return libc


def authority(root, pins):
    """Fixed opened-byte authority. Private fixtures use own0700 trees only."""
    require(root.is_absolute())
    opened, records, verified = [], [], {}
    signature = lambda m: (m.st_dev, m.st_ino, m.st_uid, m.st_mode, m.st_size, m.st_mtime_ns, m.st_ctime_ns)
    try:
        parent = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        opened.append(parent)
        for index, component in enumerate(root.parts[1:]):
            fd = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
            opened.append(fd)
            m = os.fstat(fd)
            shared = index == 0 and component == 'tmp' and bool(m.st_mode & stat.S_ISVTX)
            require(stat.S_ISDIR(m.st_mode) and (shared or (m.st_uid in (0, os.getuid()) and not m.st_mode & 0o022)))
            records.append((parent, component, fd, m))
            parent = fd
        def check():
            for parent, component, fd, before in records:
                current = os.fstat(fd)
                path = os.stat(component, dir_fd=parent, follow_symlinks=False)
                require(signature(before) == signature(current) == signature(path))
        for name, expected in pins.items():
            require('/' not in name)
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=opened[-1])
            try:
                m = os.fstat(fd)
                require(stat.S_ISREG(m.st_mode) and m.st_uid in (0, os.getuid()) and not m.st_mode & 0o022 and m.st_size <= 128*1024)
                data = b''
                while len(data) <= 128*1024:
                    block = os.read(fd, min(8192, 128*1024+1-len(data)))
                    if not block:
                        break
                    data += block
                path = os.stat(name, dir_fd=opened[-1], follow_symlinks=False)
                require(signature(m) == signature(os.fstat(fd)) == signature(path) and len(data) == m.st_size and hashlib.sha256(data).hexdigest() == expected)
                check()
                verified[name] = data
            finally:
                os.close(fd)
        check()
        return verified
    finally:
        for fd in reversed(opened):
            os.close(fd)


def load(name, raw):
    module = types.ModuleType(name)
    module.__file__ = str(ROOT/(name+".py"))
    sys.modules[name] = module
    exec(compile(raw, module.__file__, "exec"), module.__dict__)
    return module


def strict(packet):
    require(type(packet) is bytes and 0 < len(packet) <= MAX_PACKET)
    def pairs(items):
        value = {}
        for key, item in items:
            require(key not in value)
            value[key] = item
        return value
    return json.loads(packet, object_pairs_hook=pairs,
                      parse_constant=lambda _: require(False))


def receive(channel):
    packet, ancillary, flags, _ = channel.recvmsg(MAX_PACKET, socket.CMSG_SPACE(16*4))
    # Close received rights before rejecting: the kernel has already installed them.
    for level, kind, raw in ancillary:
        if level == socket.SOL_SOCKET and kind == socket.SCM_RIGHTS:
            for offset in range(0, len(raw)-3, 4):
                os.close(struct.unpack('i', raw[offset:offset+4])[0])
    require(not ancillary and not flags & (socket.MSG_TRUNC | socket.MSG_CTRUNC))
    return strict(packet)


def live(fd):
    poll = select.poll()
    poll.register(fd, select.POLLIN)
    return not poll.poll(0)


class Binding:
    """SO_PEERCRED/SO_PEERPIDFD identify the socketpair CREATOR parent."""
    def __init__(self, channel, libc):
        self.fd = None
        self.invalid = False
        self.channel = channel
        try:
            require(channel.family == socket.AF_UNIX and channel.type == socket.SOCK_SEQPACKET)
            require(channel.getsockopt(socket.SOL_SOCKET, socket.SO_ACCEPTCONN) == 0)
            pid, uid, _ = struct.unpack('3i', channel.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            require(pid == os.getppid() and uid == os.getuid() and uid != 0)
            self.fd = channel.getsockopt(socket.SOL_SOCKET, SO_PEERPIDFD)
            os.set_inheritable(self.fd, False)
            require(live(self.fd))
            require(libc.prctl(1, signal.SIGKILL, 0, 0, 0) == 0 and os.getppid() == pid)
            self.uid = uid
            require(live(self.fd))
        except OSError as error:
            self.close()
            if error.errno in (22, 92, 95):
                raise Unsupported() from None
            raise Rejected() from None
        except BaseException:
            self.close()
            raise Rejected() from None

    def alive(self):
        try:
            poll = select.poll()
            poll.register(self.channel, select.POLLIN | select.POLLHUP | select.POLLERR)
            # After START no more input is allowed. Readability (EOF/extra frame)
            # is a terminal transport invalidation, not a second request.
            if self.invalid or not live(self.fd) or poll.poll(0):
                self.invalid = True
            return not self.invalid
        except Exception:
            self.invalid = True
            return False

    def close(self):
        self.invalid = True
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None


def denial(reason, stage='CHILD_NO_TYPED_RESULT'):
    require(type(stage) is str and stage in STAGES and stage != 'OBSERVATION_COMPLETE')
    return {'schemaVersion': 4, 'outcome': 'UNAVAILABLE', 'reason': reason,
            'diagnosticStage': stage,
            'canCapture': False, 'consentEstablished': False,
            'deviceOpenAvailable': False, 'workerArmAvailable': False}


def counts_result(candidates):
    counts = {name: 0 for name in ('usb', 'bluetooth', 'i8042')}
    for item in candidates:
        counts[item.transport] += 1
    return {'schemaVersion': 4, 'outcome': 'OBSERVED',
            'reason': 'AUTHENTICATED_LIVE_COMPANION_UNAVAILABLE',
            'diagnosticStage': 'OBSERVATION_COMPLETE',
            'counts': counts, 'total': len(candidates),
            'canCapture': False, 'consentEstablished': False,
            'deviceOpenAvailable': False, 'workerArmAvailable': False}


class Stage:
    """Only a fixed attempted guard; never an error, device value or cause."""
    def __init__(self):
        self.value = 'CHILD_CHANNEL'

    def enter(self, value):
        require(type(value) is str and value in CHILD_STAGES)
        self.value = value


class ForwardScan:
    """One transparent call: preserve the exact returned object or exception."""
    def __init__(self, source, stage):
        self.source, self.stage = source, stage

    def scan(self):
        self.stage.enter('CHILD_METADATA_ADAPTER')
        value = self.source.scan()
        self.stage.enter('CHILD_FILTER_OR_VALIDATION')
        return value


def query(channel, libc, scan, stage=None):
    # Trusted private test seam supplies fake scan; public child selects only UdevMetadata.
    stage = stage if stage is not None else Stage()
    stage.enter('CHILD_PEER_BINDING')
    binding = Binding(channel, libc)
    catalog = None
    try:
        stage.enter('CHILD_START')
        start = receive(channel)
        require(type(start) is dict and set(start) == {'schemaVersion', 'operation'} and
                type(start['schemaVersion']) is int and start['schemaVersion'] == 1 and start['operation'] == 'START')
        require(binding.alive())
        import readiness as R
        peer = R.ParentPeer(binding.uid, 1, time.monotonic_ns()//1_000_000 + 2000, binding.alive)
        stage.enter('CHILD_CATALOG')
        catalog = R.Catalog(ForwardScan(scan, stage), peer)
        value = counts_result(catalog.candidates(peer))
        stage.enter('CHILD_PARENT_RECHECK')
        require(binding.alive())
        return value
    finally:
        try:
            if catalog:
                catalog.cancel()
            binding.close()
        except BaseException:
            stage.enter('CHILD_CLEANUP')
            raise


def main():
    channel = None
    stage = Stage()
    reason = 'METADATA_UNAVAILABLE'
    try:
        require(sys.argv[1:] == ['--metadata-child'])
        libc = initialize()
        verified = authority(ROOT, PINS)
        # -I omits the script directory. Only the pinned fixed source root is added.
        load('readiness', verified['readiness.py'])
        U = load('udev_metadata', verified['udev_metadata.py'])
        channel = socket.socket(fileno=3)
        require(set(os.listdir('/proc/self/fd')) <= {'0', '1', '2', '3', '4'})
        value = query(channel, libc, U.UdevMetadata(stage=stage.enter), stage)
        stage.enter('CHILD_RESULT')
        channel.send(json.dumps(value, sort_keys=True).encode())
        return 0
    except BaseException as failure:
        if isinstance(failure, Unsupported):
            reason = 'UNSUPPORTED'
        if channel:
            try:
                channel.send(json.dumps(denial(reason, stage.value), sort_keys=True).encode())
            except BaseException:
                pass
        return 3
    finally:
        if channel:
            channel.close()


if __name__ == '__main__':
    os._exit(main())
