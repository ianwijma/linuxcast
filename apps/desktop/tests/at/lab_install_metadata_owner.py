"""Closed read-only install metadata host owner; import is inert.

This is preparation, not installation or capture authority. The adjacent codec
is deliberately absent from the prepared base and is resolved only at admission.
"""
import base64
import binascii
import contextlib
from functools import partial
import io
import os
from pathlib import Path
import re
import shlex
import signal
import stat
import sys
from types import FunctionType, ModuleType
import zlib

import lab_owner as owner
import lab_build_facts as custody

PERMIT = 'f102-install-metadata-permit.json'
MAX_SNAPSHOT = 2 * 1024 * 1024
MAX_PACKET = 60000
TARGET_SHA256 = '59e3967d9110c7b451a0ba5181382eef395967bdb4945ef1ceec9561f987f153'
EXPANDED_TARGET_SHA256 = 'a54b64bcd53987a9db18066f859d2f2d9ca02f36284f80e1636cea7a6cba2432'
BASE_SHA256 = 'd3b5c60dd50c4d380d5f9f4a5f6c69dc57dde4f1579edfe93244067be0814399'
ARTIFACT_OWNER_SHA256 = 'd2cde7f381e11cdc89075e94897a2d80b7a6fdf291d7c9bf6a859a3dade89b4b'
SOURCE_KEYS = ('ownerSha256', 'artifactOwnerSha256', 'installMetadataOwnerSha256',
               'installMetadataCollectorSha256', 'installMetadataTargetsSha256', 'installMetadataProbeSha256')
PERMIT_KEYS = ('schema', 'jobKind', 'captureId', 'containerId', 'imageId', 'labRoot', 'labDevice', 'labInode',
               *SOURCE_KEYS, 'guestAccount', 'guestPrivilege', 'installMetadataAuthorityReviewed')
COUNTS = ('packageCount', 'fileCount', 'directoryCount', 'handlerCount')
BOUNDS = ((1, 4096), (1, 128), (1, 64), (0, 32))
exact, integer, sha256, capture_id = custody.exact, custody.integer, custody.sha256, custody.capture_id


def empty_metadata():
    return dict(status='not-received', firstFailure='none', captureId=None, bytes=None, sha256=None,
                packageCount=None, fileCount=None, directoryCount=None, handlerCount=None)


def validate_relay(value, failures=()):
    try:
        exact(value, (*owner.empty_result(), 'installMetadata', 'artifact'))
        owner.require(len(owner.encoded(value)) <= 4096, 'output')
        owner.validate_result({k: value[k] for k in owner.empty_result()})
        metadata = value['installMetadata']
        exact(metadata, empty_metadata())
        owner.require(metadata['status'] in ('not-received', 'unavailable', 'observed'), 'protocol')
        received = metadata['status'] != 'not-received'
        owner.require(value['transportResultValid'] == received, 'protocol')
        if received:
            capture_id(metadata['captureId'])
            owner.require(value['mayHaveDispatched'], 'protocol')
        else:
            owner.require(metadata == empty_metadata(), 'protocol')
        if metadata['status'] == 'observed':
            owner.require(metadata['firstFailure'] == 'none', 'protocol')
            integer(metadata['bytes'], 1, MAX_SNAPSHOT)
            sha256(metadata['sha256'])
            for key, (low, high) in zip(COUNTS, BOUNDS):
                integer(metadata[key], low, high)
            exact(value['artifact'], ('device', 'inode'))
            integer(value['artifact']['device'])
            integer(value['artifact']['inode'], 1)
        else:
            owner.require(value['artifact'] is None and all(metadata[k] is None for k in ('bytes', 'sha256', *COUNTS)), 'protocol')
            if received:
                owner.require(type(metadata['firstFailure']) is str and metadata['firstFailure'] != 'none'
                              and metadata['firstFailure'] in failures and value['status'] != 'completed', 'protocol')
        return value
    except (KeyError, TypeError, ValueError, OverflowError, RecursionError):
        raise owner.Rejected('protocol') from None


def _stamp(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid, info.st_nlink,
            info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def _parent_profile(path):
    # A protected source checkout is required at actual use. A writable source
    # ancestor cannot be redeemed by a digest of its current child.
    owner.require(path.is_absolute() and path.resolve(strict=True) == path, 'custody')
    result = []
    for parent in reversed(path.parents):
        info = parent.stat(follow_symlinks=False)
        owner.require(stat.S_ISDIR(info.st_mode) and info.st_uid in (0, os.getuid())
                      and not info.st_mode & 0o022, 'custody')
        result.append((str(parent), info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid))
    return tuple(result)


@contextlib.contextmanager
def _acquisition_signals():
    # Tiny open/own and close/retire sections only, never byte collection. The
    # independent job/guardian deadline remains deliverable outside these calls.
    old = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGTERM, signal.SIGINT, signal.SIGHUP, signal.SIGALRM})
    try:
        yield
    finally:
        signal.pthread_sigmask(signal.SIG_SETMASK, old)


def _close_stream(stream):
    # Callers mask before entering this helper, covering its Python entry as
    # well as the C close. A signal after C retirement sees a closed object.
    stream.close()


def _reader_opener(path, flags, *, rootfd=None):
    return os.open(path, flags | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=rootfd)


def _source(path, maximum):
    parents = _parent_profile(path)
    stream = None
    failed = False
    try:
        # Install the finally before restoring signal delivery: cancellation at
        # the acquisition/unmask boundary closes explicitly without FileIO's
        # destructor diagnostic (which would contain a private source path).
        with _acquisition_signals():
            stream = io.FileIO(path, 'r', opener=_reader_opener)
        before = os.fstat(stream.fileno())
        owner.regular(before, os.getuid())
        owner.require(not before.st_mode & 0o022 and before.st_size <= maximum, 'custody')
        raw = owner.read_fd(stream.fileno(), maximum)
        owner.require(len(raw) == before.st_size and _stamp(os.fstat(stream.fileno())) == _stamp(before)
                      and _stamp(path.stat(follow_symlinks=False)) == _stamp(before)
                      and _parent_profile(path) == parents, 'custody')
        return raw, (_stamp(before), parents)
    except BaseException:
        failed = True
        raise
    finally:
        if stream is not None:
            try:
                with _acquisition_signals():
                    _close_stream(stream)
            except BaseException:
                if not failed:
                    raise


class _Collector:
    """Closed lazy adjacent adapter. No module cache, discovery or caller factory."""
    def __init__(self, path, raw):
        name = '_linuxcast_install_metadata_collector'
        module = ModuleType(name)
        module.__file__ = str(path)
        exec(compile(raw, str(path), 'exec'), module.__dict__)
        owner.require(module.__file__ == str(path) and module.__name__ == name, 'configuration')
        for key in ('source_bytes', 'decode_packet', 'validate_snapshot'):
            fn = getattr(module, key, None)
            owner.require(type(fn) is FunctionType and fn.__globals__ is module.__dict__
                          and fn.__code__.co_filename == str(path), 'configuration')
        failures = getattr(module, 'FAILURES', None)
        owner.require(type(failures) in (tuple, list) and 1 <= len(failures) <= 128
                      and all(type(v) is str and re.fullmatch('[a-z][a-z0-9-]{0,63}', v) for v in failures)
                      and len(set(failures)) == len(failures) and 'none' not in failures, 'configuration')
        # The collector lists unavailable reasons only; the wire also has the
        # independently checked observed sentinel. This is not an error code.
        self.module, self.failures = module, ('none',) + tuple(failures)
        self.source = module.source_bytes()
        owner.require(type(self.source) is bytes and 0 < len(self.source) <= 60000, 'configuration')
        text = self.source.decode('utf-8')
        owner.require(0 < len(shlex.quote(text).encode('utf-8')) <= 60000, 'configuration')

    def validate_snapshot(self, value):
        checked = self.module.validate_snapshot(value)
        owner.require(type(checked) is dict and checked == value, 'protocol')
        return checked

    def decode_packet(self, raw, code):
        decoded = self.module.decode_packet(raw, code)
        owner.require(type(decoded) is tuple and len(decoded) == 3 and type(decoded[0]) is dict
                      and (decoded[1] is None or type(decoded[1]) is dict)
                      and (decoded[2] is None or type(decoded[2]) is bytes), 'protocol')
        return decoded


class _Sources:
    def __init__(self):
        self.bindings = None
        self.codec = None
        self.collector_raw = None

    def check(self, pin, *, collector=True):
        path = Path(__file__)
        owner.require(path.is_absolute() and Path(owner.__file__) == path.with_name('lab_owner.py')
                      and Path(custody.__file__) == path.with_name('lab_build_facts.py')
                      and custody.owner is owner, 'custody')
        names = ('lab_owner.py', 'lab_build_facts.py', path.name, 'install-metadata-targets.json', 'outer-owner-inventory.json')
        raws, bindings = {}, {}
        for name in names + (('install_metadata.py',) if collector else ()):
            raws[name], bindings[name] = _source(path.with_name(name), 1024 * 1024)
        owner.require(owner.digest(raws[names[0]]) == BASE_SHA256
                      and owner.digest(raws[names[1]]) == ARTIFACT_OWNER_SHA256
                      and owner.digest(raws[names[3]]) == TARGET_SHA256
                      and owner.digest(raws[names[4]]) == owner.INVENTORY_SHA256, 'custody')
        for key, name in zip(SOURCE_KEYS[:3], names[:3]):
            owner.require(pin[key] == owner.digest(raws[name]), 'custody')
        owner.require(pin['installMetadataTargetsSha256'] == TARGET_SHA256, 'custody')
        if self.bindings is not None:
            owner.require(all(self.bindings[k] == v for k, v in bindings.items() if k in self.bindings), 'custody')
        if collector:
            raw = raws['install_metadata.py']
            owner.require(owner.digest(raw) == pin['installMetadataCollectorSha256'], 'custody')
            if self.codec is None:
                self.codec = _Collector(path.with_name('install_metadata.py'), raw)
                self.collector_raw = raw
            owner.require(raw == self.collector_raw and owner.digest(self.codec.source) == pin['installMetadataProbeSha256']
                          and self.codec.module.source_bytes() == self.codec.source, 'custody')
            # Codec construction/source generation can read only fixed data.
            # Recheck the closure AFTER it, so a cached module never hides swaps.
            for name in raws:
                after, binding = _source(path.with_name(name), 1024 * 1024)
                owner.require(after == raws[name] and binding == bindings[name], 'custody')
        self.bindings = dict(self.bindings or {}, **bindings)
        return owner.unique_json(raws['outer-owner-inventory.json']), self.codec


def snapshot_counts(snapshot, codec):
    checked = codec.validate_snapshot(snapshot)
    exact(checked, ('schema', 'scope', 'identity', 'os', 'packageState', 'files', 'directories', 'handlers', 'targetSha256'))
    owner.require(checked['schema'] == 'f102-install-metadata-v1'
                  and checked['scope'] == 'first-order-routing-controls-only-not-install-admission'
                  and checked['targetSha256'] == EXPANDED_TARGET_SHA256, 'protocol')
    values = (checked['packageState']['packageCount'], len(checked['files']), len(checked['directories']), len(checked['handlers']))
    owner.require(all(type(checked[k]) is list for k in ('files', 'directories', 'handlers')), 'protocol')
    for value, (low, high) in zip(values, BOUNDS):
        integer(value, low, high)
    return dict(zip(COUNTS, values))


def decode_packet(raw, code, codec):
    """Host independently verifies the complete wire before trusting the adapter."""
    try:
        packet = owner.unique_json(raw, MAX_PACKET)
        exact(packet, ('schema', 'status', 'firstFailure', 'encoding', 'expandedBytes', 'sha256', 'data'))
        owner.require(packet['schema'] == 'f102-install-metadata-packet-v1' and packet['encoding'] == 'zlib-base64'
                      and packet['status'] in ('observed', 'unavailable') and type(packet['firstFailure']) is str
                      and packet['firstFailure'] in codec.failures, 'protocol')
        observed = packet['status'] == 'observed'
        owner.require(type(code) is int and code == (0 if observed else 3), 'protocol')
        snapshot = expanded = None
        if observed:
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
            snapshot = owner.unique_json(expanded, MAX_SNAPSHOT)
            snapshot_counts(snapshot, codec)
            owner.require(owner.encoded(snapshot) == expanded, 'protocol')
        else:
            integer(packet['expandedBytes'], 0, 0)
            owner.require(packet['firstFailure'] != 'none' and packet['sha256'] is packet['data'] is None, 'protocol')
        owner.require(codec.decode_packet(raw, code) == (packet, snapshot, expanded), 'protocol')
        return packet, snapshot, expanded
    except (KeyError, TypeError, ValueError, OverflowError, RecursionError, UnicodeError, binascii.Error, zlib.error):
        raise owner.Rejected('protocol') from None


class InstallMetadataReservation(custody.BuildFactsReservation):
    permit_name = PERMIT

    def __init__(self, root=owner.LAB):
        super().__init__(root)
        self.artifact_reader = None
        self.sources = _Sources()
        self.codec = None

    @property
    def artifactfd(self):
        for stream in (self.artifact_writer, self.artifact_reader):
            if stream is not None and not stream.closed:
                return stream.fileno()
        return None

    def permit(self):
        pin = self.read_permit()
        exact(pin, PERMIT_KEYS)
        owner.require(type(pin['schema']) is int and pin['schema'] == 1 and pin['jobKind'] == 'install-metadata-only'
                      and pin['containerId'] == owner.CONTAINER and pin['imageId'] == owner.IMAGE
                      and pin['labRoot'] == str(owner.LAB) and pin['guestAccount'] == 'linuxcast'
                      and pin['guestPrivilege'] == 'sudo-noninteractive' and pin['installMetadataAuthorityReviewed'] is True)
        capture_id(pin['captureId'])
        for key, expected in zip(('labDevice', 'labInode'), self.root_id):
            integer(pin[key])
            owner.require(pin[key] == expected)
        for key in SOURCE_KEYS:
            sha256(pin[key])
        self.pin = pin
        self.sources.check(pin, collector=False)
        self.check()

    def check_sources(self):
        inventory, self.codec = self.sources.check(self.pin)
        return inventory

    def artifact_name(self):
        capture_id(self.pin['captureId'])
        return 'f102-install-metadata-' + self.pin['captureId'] + '.json'

    @staticmethod
    def result():
        return dict(owner.empty_result(), installMetadata=empty_metadata(), artifact=None)

    def create_marker(self):
        # Base transact recovers a valid marker FIRST, even with a partial file
        # or an unavailable collector. Only fresh admission needs the codec.
        self.check_sources()
        super().create_marker()

    def _open_reader(self):
        with _acquisition_signals():
            self.artifact_reader = io.FileIO(self.artifact_name(), 'r', opener=partial(_reader_opener, rootfd=self.rootfd))

    def publish(self, raw):
        owner.require(type(raw) is bytes and 0 < len(raw) <= MAX_SNAPSHOT, 'custody')
        owner.require(self.artifactfd is None and self.artifact_raw is None, 'custody')
        self.check()
        self.artifact_raw = raw
        try:
            with _acquisition_signals():
                self.artifact_writer = custody.open_artifact_writer(self.rootfd, self.artifact_name())
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
            self.artifact_writer.close()
            owner.require(self.artifact_writer.closed, 'custody')
            self._open_reader()
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
        value.update(status='incomplete', reservationClean=False)
        # All custody loss invalidates the claim, including unavailable replies.
        # Lifecycle first failure and durable attempts remain unchanged.
        value.update(transportResultValid=False, installMetadata=empty_metadata(), artifact=None)
        if value['firstFailure'] == 'none':
            value['firstFailure'] = 'custody'
        if value['cleanupFailure'] == 'none':
            value['cleanupFailure'] = 'custody'
        return value

    def validate_reply(self, value):
        # Validate structure before any invalidation may discard a claim. The
        # tentative reason is NOT authority: the pinned codec allowlist is
        # enforced below before a received value can be accepted.
        tentative = value.get('installMetadata', {}).get('firstFailure') if type(value) is dict and type(value.get('installMetadata')) is dict else None
        validate_relay(value, (tentative,) if type(tentative) is str else ())
        # Resolve/recheck the full closure in both processes. The caller's fork
        # copy has no guardian-created codec; a guardian cache cannot hide a late
        # source replacement between dispatch, publication and final close.
        if value['installMetadata']['status'] in ('observed', 'unavailable'):
            try:
                self.check_sources()
            except BaseException:
                # Keep known attempts/first failure while rejecting the claim.
                self.artifact_uncertain = True
                self.invalidate(value)
        failures = () if self.codec is None else self.codec.failures
        validate_relay(value, failures)
        metadata = value['installMetadata']
        if metadata['status'] != 'not-received':
            owner.require(self.pin is not None and metadata['captureId'] == self.pin['captureId'], 'custody')
        if value['firstFailure'] == 'guardian-lost' or value['cleanupFailure'] != 'none':
            self.invalidate(value)
        if value['artifact'] is not None:
            try:
                if self.codec is None:
                    self.check_sources()
                expected = (value['artifact']['device'], value['artifact']['inode'])
                if self.artifactfd is None:
                    self.artifact_id = expected
                    self.artifact_raw = None
                    self._open_reader()
                    raw = owner.read_fd(self.artifactfd, MAX_SNAPSHOT)
                    owner.require(len(raw) == metadata['bytes'] and owner.digest(raw) == metadata['sha256'], 'custody')
                    self.artifact_raw = raw
                owner.require(self.artifact_id == expected and len(self.artifact_raw) == metadata['bytes']
                              and owner.digest(self.artifact_raw) == metadata['sha256'], 'custody')
                snapshot = owner.unique_json(self.artifact_raw, MAX_SNAPSHOT)
                counts = snapshot_counts(snapshot, self.codec)
                owner.require(owner.encoded(snapshot) == self.artifact_raw
                              and all(metadata[k] == counts[k] for k in COUNTS), 'custody')
                self.check()
                self.check_artifact()
            except BaseException:
                self.artifact_uncertain = True
                self.invalidate(value)
        return validate_relay(value, failures)

    def close(self):
        success = not self.artifact_uncertain
        if self.codec is not None and self.pin is not None:
            try:
                self.check_sources()
            except BaseException:
                success = False
        for stream in (self.artifact_writer, self.artifact_reader):
            if stream is not None and not stream.closed:
                try:
                    self.check_artifact_closed(stream.fileno())
                except BaseException:
                    success = False
                try:
                    with _acquisition_signals():
                        _close_stream(stream)
                except BaseException:
                    success = False
        # Bypass the old raw-reader retirement; both readers and writers here
        # are owning C objects, whose closed state survives signal/close errors.
        try:
            with _acquisition_signals():
                success = owner.Reservation.close(self) and success
        except BaseException:
            success = False
        if not success:
            self.artifact_uncertain = True
        return success


class InstallMetadataLab(owner.NativeLab):
    job_seconds = 30

    def cleanup_authorized(self):
        return self.lease.pin['installMetadataAuthorityReviewed'] is True

    def command(self, op, budget):
        if op == 'start':
            self.lease.check_sources()
        return super().command(op, budget)

    def ready(self, budget):
        while True:
            self.check()
            self.lease.check()
            code, raw = self.children.run(metadata_argv(self.lease.pin, readiness=True), owner.Budget(8, budget))
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
        self.lease.check_sources()
        return self.children.run(metadata_argv(self.lease.pin, self.lease.codec.source), owner.Budget(30, budget))

    def validate_job_reply(self, raw, code, result):
        packet, snapshot, expanded = decode_packet(raw, code, self.lease.codec)
        metadata = dict(empty_metadata(), status=packet['status'], firstFailure=packet['firstFailure'],
                        captureId=self.lease.pin['captureId'])
        if snapshot is not None:
            metadata.update(bytes=len(expanded), sha256=owner.digest(expanded), **snapshot_counts(snapshot, self.lease.codec))
        artifact = None if expanded is None else self.lease.publish(expanded)
        # Single C dict.update is the claim commit point; no interruptible series
        # of Python setters can erase the real pre/post-commit interruption cause.
        result.update(installMetadata=metadata, artifact=artifact, transportResultValid=True)
        return snapshot is not None


def metadata_argv(pin, source=None, *, readiness=False):
    owner.require(type(readiness) is bool, 'configuration')
    if readiness:
        remote = ('/usr/bin/true',)
    else:
        owner.require(type(source) is bytes and 0 < len(source) <= 60000, 'configuration')
        quoted = shlex.quote(source.decode('utf-8'))
        owner.require(0 < len(quoted.encode('utf-8')) <= 60000, 'configuration')
        remote = ('/usr/bin/python3', '-I', '-B', '-c', quoted)
    return owner.fixed_ssh_argv(pin, remote)


def public_result(value, failures=()):
    validate_relay(value, failures)
    result = {'schema': 'f102-install-metadata-owner-v1', 'jobKind': 'install-metadata-only',
              'lifecycle': {k: value[k] for k in owner.empty_result()},
              'installMetadata': value['installMetadata'], 'acceptance': 'pending'}
    owner.require(len(owner.encoded(result)) <= 4096, 'output')
    return result


class _Parser(owner.ClosedParser):
    def error(self, _message):
        self.exit(3)  # no caller arguments or private exception on stderr


def parse_args(argv):
    parser = _Parser(description=__doc__, allow_abbrev=False, add_help=False)
    flags = ('--reviewed-install-metadata-owner', '--reviewed-install-metadata-probe')
    for flag in flags:
        parser.add_argument(flag, action='store_true', required=True)
    parser.parse_args(argv)
    if len(argv) != 2 or set(argv) != set(flags):
        parser.error('closed flags')


def main(argv=None):
    parse_args(sys.argv[1:] if argv is None else argv)
    lease = InstallMetadataReservation()
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
            lease.acquire()
            lease.permit()
            inventory, _ = lease.sources.check(lease.pin, collector=False)
            result = owner.run_guarded(lease, lambda held, check: InstallMetadataLab(held, inventory, check), deadline)
    except BaseException as error:
        if result['firstFailure'] == 'none':
            result['firstFailure'] = owner.reason(error)
    finally:
        if not lease.close():
            lease.invalidate(result)
    print(owner.encoded(public_result(result, () if lease.codec is None else lease.codec.failures)).decode('ascii'))
    return 0 if result['status'] == 'completed' and result['installMetadata']['status'] == 'observed' else 3


if __name__ == '__main__':
    raise SystemExit(main())
