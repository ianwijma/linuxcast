"""Fixed device-free metadata guardian. No actual use before separate review."""
import time
STARTED = time.monotonic()
import hashlib
import json
import os
import pathlib
import select
import socket
import stat
import struct
import subprocess
import sys
import types

ROOT = pathlib.Path('/tmp/linuxcast-s003-readiness-guardian-v1')
PYTHON = '/usr/bin/python3'
# Filled from final owned source; the parent source itself is pinned externally.
PINS = {'guardian_child.py': '589f3e9b6d9fd2326ccd5b82b38bd6f3a7a8e4613eb73d06aab91aa096eff29b', 'guardian_family.py': '9c0d0618b61a85e2c46bcf3397ebb8a67b7f179438cb5b111f20d2fc3512e7ad', 'readiness.py': '1c766776f8105e19bb82f86d5e8a9696f0482fa6fd86f4d876f90dc60983a0f5', 'udev_metadata.py': 'c22ae4178000cb050d98873935909fd8432c2a38032dbf3f1e14a0f23074e218'}
FALSE_FIELDS = {'canCapture', 'consentEstablished', 'deviceOpenAvailable', 'workerArmAvailable'}
def require(value):
    if not value:
        raise ValueError() from None


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


REASONS = {'METADATA_UNAVAILABLE', 'PARENT_INVALIDATED', 'DEADLINE',
           'CLEANUP_UNVERIFIED', 'UNSUPPORTED'}


def bootstrap():
    if dict(os.environ) != {'LC_ALL':'C.UTF-8', 'LANG':'C.UTF-8', 'PATH':'/usr/bin:/bin'}:
        raise ValueError()
    path = ROOT/'guardian_child.py'
    raw = authority(ROOT, {'guardian_child.py': PINS['guardian_child.py']})['guardian_child.py']
    module = types.ModuleType('guardian_child')
    module.__file__ = str(path)
    sys.modules[module.__name__] = module
    exec(compile(raw, str(path), 'exec'), module.__dict__)
    module.initialize()
    verified = module.authority(ROOT, PINS)
    family = module.load('guardian_family', verified['guardian_family.py'])
    return module, family, raw


def validate(C, value, *, child=False):
    C.require(type(value) is dict and value.get('schemaVersion') == 4 and
              type(value['schemaVersion']) is int and
              all(value.get(k) is False for k in FALSE_FIELDS))
    common = {'schemaVersion', 'outcome', 'reason', 'diagnosticStage'} | FALSE_FIELDS
    if value.get('outcome') == 'UNAVAILABLE':
        C.require(set(value) == common and value['reason'] in REASONS and
                  type(value['diagnosticStage']) is str and
                  value['diagnosticStage'] in (C.CHILD_STAGES if child else C.STAGES) and
                  value['diagnosticStage'] != 'OBSERVATION_COMPLETE')
        permitted = {
            'UNSUPPORTED': {'PARENT_BOOTSTRAP', 'CHILD_PEER_BINDING'},
            'DEADLINE': {'PARENT_QUERY_DEADLINE'},
            'CLEANUP_UNVERIFIED': {'PARENT_CLEANUP'},
            'PARENT_INVALIDATED': {'CHILD_PEER_BINDING', 'CHILD_PARENT_RECHECK'},
            'METADATA_UNAVAILABLE': C.CHILD_STAGES | {'PARENT_CHANNEL', 'PARENT_SPAWN',
                'PARENT_REPLY', 'PARENT_CANCELLED', 'CHILD_NO_TYPED_RESULT'},
        }
        C.require(value['diagnosticStage'] in permitted[value['reason']])
    else:
        C.require(set(value) == common | {'counts', 'total'} and
                  value['outcome'] == 'OBSERVED' and
                  value['reason'] == 'AUTHENTICATED_LIVE_COMPANION_UNAVAILABLE' and
                  value['diagnosticStage'] == 'OBSERVATION_COMPLETE')
        C.require(type(value['counts']) is dict and set(value['counts']) == {'usb', 'bluetooth', 'i8042'})
        C.require(type(value['total']) is int and 0 <= value['total'] <= 128)
        C.require(all(type(v) is int and 0 <= v <= 128 for v in value['counts'].values()))
        C.require(sum(value['counts'].values()) == value['total'])
    return value


def reply(C, channel, child_pid):
    packet, ancillary, flags, _ = channel.recvmsg(4096, socket.CMSG_SPACE(64))
    rights = False
    for level, kind, raw in ancillary:
        if level == socket.SOL_SOCKET and kind == socket.SCM_RIGHTS:
            rights = True
            for offset in range(0, len(raw)-3, 4):
                os.close(struct.unpack('i', raw[offset:offset+4])[0])
    C.require(not rights and not flags & (socket.MSG_TRUNC | socket.MSG_CTRUNC))
    if not packet and not ancillary:
        return None  # EOF; empty packets carry kernel credentials too.
    C.require(len(ancillary) == 1)
    level, kind, raw = ancillary[0]
    C.require(level == socket.SOL_SOCKET and kind == socket.SCM_CREDENTIALS and len(raw) == 12)
    pid, uid, _ = struct.unpack('3i', raw)
    C.require(pid == child_pid and uid == os.getuid())
    return C.strict(packet)


def _observe(C, F, argv, start):
    """Trusted fixture seam; public main always supplies one fixed child command."""
    deadline = start+5
    query_deadline = start+2
    left = right = family = process = None
    stage = 'PARENT_CHANNEL'
    result = C.denial('METADATA_UNAVAILABLE', stage)
    clean = True
    if time.monotonic() >= query_deadline:
        return C.denial('DEADLINE', 'PARENT_QUERY_DEADLINE')
    with F.Cancellation() as guard:
        try:
            family = F.Family()
            with guard.critical():
                left, right = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET)
            left.setsockopt(socket.SOL_SOCKET, socket.SO_PASSCRED, 1)
            # Dedicated production entry owns no other nonstdio FD. Mapping is
            # fixed, and no caller FD is closed/replaced to make the condition pass.
            C.require(left.fileno() == 3 and right.fileno() == 4)
            stage = 'PARENT_SPAWN'
            process = family.spawn(argv, guard, channel_fd=4, pass_fds=(3,4),
                                   env=C.ENV, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            right.close(); right = None
            left.setblocking(False)
            stage = 'PARENT_REPLY'
            left.send(b'{"schemaVersion":1,"operation":"START"}')
            poll = select.poll()
            poll.register(left, select.POLLIN | select.POLLHUP | select.POLLERR)
            received = None
            eof = False
            while True:
                guard.check()
                if time.monotonic() >= query_deadline:
                    result = C.denial('DEADLINE', 'PARENT_QUERY_DEADLINE')
                    break
                events = poll.poll(max(1, min(20, int((query_deadline-time.monotonic())*1000))))
                if time.monotonic() >= query_deadline:
                    result = C.denial('DEADLINE', 'PARENT_QUERY_DEADLINE')
                    break
                if events and not eof:
                    value = reply(C, left, process.pid)
                    if value is None:
                        eof = True
                    else:
                        C.require(received is None)
                        received = validate(C, value, child=True)
                status = family.exited(process.pid)
                if eof and status is not None:
                    if received is None:
                        result = C.denial('METADATA_UNAVAILABLE', 'CHILD_NO_TYPED_RESULT')
                        break
                    C.require(status == (0 if received['outcome'] == 'OBSERVED' else 3))
                    result = received
                    break
        except BaseException:
            result = C.denial('METADATA_UNAVAILABLE', stage)
        finally:
            # Cancellation handler only latches; a repeated signal cannot escape
            # before cleanup protection is installed or skip another close/stop.
            guard.cleanup()
            close_ok = True
            for channel in (left, right):
                if channel is not None:
                    try:
                        channel.close()
                    except BaseException:
                        close_ok = False
            if family is not None:
                try:
                    proof = family.stop(deadline)
                    clean = close_ok and all(v is True for v in proof.values())
                except BaseException:
                    clean = False
    if guard.cancelled:
        result = C.denial('METADATA_UNAVAILABLE', 'PARENT_CANCELLED')
    if not clean or time.monotonic() >= deadline:
        return C.denial('CLEANUP_UNVERIFIED', 'PARENT_CLEANUP')
    return result


def child_command(raw):
    # Public reviewed fixed source bytes, not a caller-selected script or value.
    return [PYTHON, '-I', '-S', '-B', '-c', raw.decode('utf-8'), '--metadata-child']


def main():
    start = STARTED
    code = 3
    fallback = {'schemaVersion':4, 'outcome':'UNAVAILABLE', 'reason':'UNSUPPORTED',
             'diagnosticStage':'PARENT_BOOTSTRAP',
             'canCapture':False, 'consentEstablished':False,
             'deviceOpenAvailable':False, 'workerArmAvailable':False}
    value = fallback
    try:
        os.set_blocking(1, False)
        if sys.argv[1:] != ['--observe-metadata']:
            raise ValueError()
        C, F, raw = bootstrap()
        value = _observe(C, F, child_command(raw), start)
        validate(C, value)
        code = 0 if value['outcome'] == 'OBSERVED' else 3
    except BaseException:
        value = fallback
        code = 3
    try:
        raw = (json.dumps(value, sort_keys=True)+'\n').encode()
        if len(raw) > 4096 or os.write(1, raw) != len(raw):
            return 3
    except BaseException:
        return 3
    return code


if __name__ == '__main__':
    sys.exit(main())
