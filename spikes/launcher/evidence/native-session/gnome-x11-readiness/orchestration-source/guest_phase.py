"""Executed on stdin ONLY by reviewed host.py after explicit VM reservation.

PAYLOAD is injected by host.py and contains only frozen public files. All stdout
is one bounded fixed-schema response after cleanup, never a raw subprocess log.
"""
import base64
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import shutil
import re
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile

HOME = pathlib.Path('/home/debian')
NAMES = ('source.tgz', 'authority.json', 'collect.py')
PROCESSES = ('gnome-shell', 'kwin_wayland', 'kwin_x11', 'Xvfb', 'electron', 'node', 'gdb', 'dbus-daemon')
EXPECTED = {name: (2 if name == 'dbus-daemon' else 0) for name in PROCESSES}
TOOL_HASHES = {'node': 'e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb',
               'bun': '10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235'}
FILES = ('report.json', 'source-manifest.json', 'provenance.json', 'cleanup.json', 'dark-launcher.png', 'light-capabilities.png')


def require(condition):
    if not condition:
        raise ValueError('GUEST_PHASE_REJECTED')


def snapshot():
    counts = dict.fromkeys(PROCESSES, 0)
    for path in pathlib.Path('/proc').iterdir():
        if path.name.isdigit():
            try:
                name = (path / 'comm').read_text().strip()
            except FileNotFoundError:
                continue
            if name in counts:
                counts[name] += 1
    return {'fixedProcessCounts': counts,
            'privateMatrixRootsAbsent': not any(pathlib.Path('/tmp').glob('linuxcast-s001-matrix-*')) and not any(HOME.glob('linuxcast-s001-matrix-*')) and not any(HOME.glob('lc1-*')) and not any(HOME.glob('linuxcast-s001-collection-*')),
            'inputLabMarkerAbsent': not pathlib.Path('/run/linuxcast-input-spike-lab').exists()}


def clean(value):
    return value['fixedProcessCounts'] == EXPECTED and value['privateMatrixRootsAbsent'] and value['inputLabMarkerAbsent']


def exclusive(path, value, mode=0o400):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(value)


def extract(archive, stage):
    """No links/devices/absolute paths/duplicates; no tar extraction API."""
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as source:
        members = source.getmembers()
        require(len(members) <= 1024 and sum(item.size for item in members) <= 16 * 1024 * 1024)
        seen = set()
        for item in members:
            name = pathlib.PurePosixPath(item.name)
            require(not name.is_absolute() and '..' not in name.parts and name.parts and str(name) == item.name.rstrip('/'))
            require(item.name.rstrip('/') not in seen and (item.isdir() or item.isfile()))
            seen.add(item.name.rstrip('/'))
        for item in members:
            target = stage / item.name
            if item.isdir():
                target.mkdir(mode=0o700, parents=True, exist_ok=True)
            else:
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                with source.extractfile(item) as stream:
                    value = stream.read(item.size + 1)
                require(len(value) == item.size)
                exclusive(target, value, 0o700 if item.mode & 0o111 else 0o600)


def load(file, name):
    specification = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


class HupSafeSupervisor:
    """Orchestration owns HUP; reviewed supervisor owns TERM/INT and children."""
    def __init__(self, supervisor):
        self.supervisor = supervisor

    def __enter__(self):
        return self.supervisor.__enter__()

    def __exit__(self, kind, error, traceback):
        # The first HUP cancels work. Repeated HUP must not interrupt the
        # supervisor's existing bounded TERM/KILL/reap sequence before deletion.
        previous = signal.signal(signal.SIGHUP, signal.SIG_IGN)
        try:
            return self.supervisor.__exit__(kind, error, traceback)
        finally:
            signal.signal(signal.SIGHUP, previous)


def verify_tools():
    for name, expected in TOOL_HASHES.items():
        file = HOME / 'linuxcast-tools/bin' / name
        require(file == file.resolve(strict=True))
        descriptor = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            metadata = os.fstat(descriptor)
            require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == os.getuid() and
                    not metadata.st_mode & 0o022 and metadata.st_size <= 256 * 1024 * 1024)
            digest = hashlib.sha256()
            with os.fdopen(descriptor, 'rb', closefd=False) as stream:
                remaining = 256 * 1024 * 1024 + 1
                while remaining:
                    chunk = stream.read(min(4 * 1024 * 1024, remaining))
                    if not chunk:
                        break
                    digest.update(chunk)
                    remaining -= len(chunk)
                require(remaining > 0)
            require(digest.hexdigest() == expected)
        finally:
            os.close(descriptor)
    return True


def preparation_environment(stage):
    env = {'HOME': str(HOME), 'PATH': str(HOME / 'linuxcast-tools/bin') + ':/usr/bin:/bin',
           'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1'}
    for key, name in (('TMPDIR', '.install-tmp'), ('BUN_INSTALL_CACHE_DIR', '.install-cache'),
                      ('electron_config_cache', '.electron-cache'), ('XDG_CACHE_HOME', '.xdg-cache')):
        directory = stage / name
        directory.mkdir(mode=0o700)
        require(directory == directory.resolve(strict=True) and directory.parent == stage)
        require(directory.stat().st_uid == os.getuid() and stat.S_IMODE(directory.stat().st_mode) == 0o700)
        env[key] = str(directory)
    env['BUN_TMPDIR'] = env['TMPDIR']
    return env


def execute():
    require(os.getuid() == 1000 and os.geteuid() == 1000)
    release = pathlib.Path('/etc/os-release').read_text().splitlines()
    require('ID=debian' in release and 'VERSION_ID="13"' in release and os.uname().release == '6.12.113+deb13-amd64')
    before = snapshot()
    require(clean(before))
    verify_tools()
    require(type(PAYLOAD) is dict and set(PAYLOAD) == {'files', 'sha256'})
    require(set(PAYLOAD['files']) == set(NAMES) and set(PAYLOAD['sha256']) == set(NAMES))
    values = {}
    for name in NAMES:
        value = base64.b64decode(PAYLOAD['files'][name], validate=True)
        require(len(value) <= (8 * 1024 * 1024 if name == 'source.tgz' else 65536))
        require(hashlib.sha256(value).hexdigest() == PAYLOAD['sha256'][name])
        values[name] = value
    # Root is internally created and immediately owned, including early failures.
    root = pathlib.Path(tempfile.mkdtemp(prefix='lc1-', dir=HOME))
    owned = root.stat().st_dev, root.stat().st_ino
    def cancelled(_number, _frame):
        raise KeyboardInterrupt()
    previous_signals = {number: signal.signal(number, cancelled) for number in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP)}
    result = {'phase': 'preparation-failed', 'collectorExitCode': None, 'files': {}, 'before': before,
              'release': None, 'ownedGuestCapsuleRemoved': False,
              'expectedToolSha256': TOOL_HASHES, 'toolsVerifiedBeforeAndAfter': False}
    try:
        require(re.fullmatch(r'lc1-[A-Za-z0-9_-]{8}', root.name))
        for name in NAMES:
            exclusive(root / name, values[name])
        collector = load(root / 'collect.py', 'linuxcast_s001_collector')
        require(collector.ARCHIVE_HASH == PAYLOAD['sha256']['source.tgz'] and collector.AUTHORITY_HASH == PAYLOAD['sha256']['authority.json'])
        stage = root / 'source'
        stage.mkdir(mode=0o700)
        extract(values['source.tgz'], stage)
        collector.verify_authority(stage, root / 'source.tgz', root / 'authority.json')
        here = stage / collector.RELATIVE
        sys.path.insert(0, str(here))
        supervisor = load(here / 'supervision.py', 'linuxcast_s001_supervision')
        # SSH disconnects must enter the same owned cleanup path, no raw error log.
        try:
            with HupSafeSupervisor(supervisor.Supervisor()):
                env = preparation_environment(stage)
                commands = ([str(HOME / 'linuxcast-tools/bin/bun'), 'install', '--frozen-lockfile'],
                            [str(HOME / 'linuxcast-tools/bin/bun'), 'run', 'setup:electron'],
                            [str(HOME / 'linuxcast-tools/bin/node'), str(here / 'build.ts')])
                for command in commands:
                    verify_tools()
                    child = subprocess.Popen(command, env=env, cwd=stage, stdin=subprocess.DEVNULL,
                                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
                    require(child.wait(timeout=180) == 0)
                    verify_tools()
                collector.verify_authority(stage, root / 'source.tgz', root / 'authority.json')
                # Exactly one collector call; its own runner ceiling is unchanged.
                verify_tools()
                child = subprocess.Popen(['/usr/bin/python3', str(root / 'collect.py'), str(root)], env=env,
                                         cwd=root, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                         stderr=subprocess.DEVNULL, start_new_session=True)
                result['phase'] = 'native-attempted'
                result['collectorExitCode'] = child.wait(timeout=330)
                require(result['collectorExitCode'] in (0, 3))
                verify_tools()
            # Read only fixed names after the whole owned tree is reaped. Host
            # independently validates all nested public schemas before writing.
            for name in FILES:
                file = root / 'result' / name
                if file.exists() or file.is_symlink():
                    limit = 8 * 1024 * 1024 if name.endswith('.png') else 131072
                    value = collector.regular_bytes(file, limit)
                    result['files'][name] = base64.b64encode(value).decode('ascii')
        finally:
            if 'child' in locals():
                child.poll()
    except BaseException:
        # No arbitrary exception text. Supervisor has already handled children.
        result['phase'] = 'collection-failed' if result['phase'] == 'native-attempted' else 'preparation-failed'
        result['files'] = {}
    finally:
        for number in previous_signals:
            signal.signal(number, signal.SIG_IGN)
        try:
            metadata = root.lstat()
            if (metadata.st_dev, metadata.st_ino) == owned and stat.S_ISDIR(metadata.st_mode) and not root.is_symlink():
                shutil.rmtree(root)
                result['ownedGuestCapsuleRemoved'] = not root.exists()
            result['release'] = snapshot()
            result['toolsVerifiedBeforeAndAfter'] = verify_tools()
        except BaseException:
            result['ownedGuestCapsuleRemoved'] = False
            result['release'] = None
        for number, previous in previous_signals.items():
            signal.signal(number, previous)
    return result


if __name__ == '__main__':
    try:
        response = execute()
    except BaseException:
        response = {'phase': 'entry-rejected', 'collectorExitCode': None, 'files': {}, 'before': None,
                    'release': None, 'ownedGuestCapsuleRemoved': False,
                    'expectedToolSha256': TOOL_HASHES, 'toolsVerifiedBeforeAndAfter': False}
    print(json.dumps(response, allow_nan=False))
