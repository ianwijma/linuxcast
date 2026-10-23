#!/usr/bin/python3
"""One reviewed GNOME X11 invocation. Prepared offline; no staging/install actions.

Staging/building requires the coordinator's separate reservation. No inherited
display/bus/credential environment reaches the runner. No raw child output is kept.
"""
import datetime
import hashlib
import importlib
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import sys
import tempfile

BACKEND = 'gnome-x11'
SIGNED_RUNTIME = '852f3abf2aeb227d7ada92e29e965830edc8e5e0'
SOURCE_SCOPE = 'declared-runtime-and-static-inputs'
ARCHIVE_BASELINE = '03df170788c2cd2358b15e93cf65dde51919db0c'
INCREMENT_MANIFEST = '463e4632b4b8bd034bd1a18b03d0e269c4f4791e1ecee68fb4ebef1cbaa62b0c'
INCREMENT = '312000a4bd3488fa589acf2d785c986f70622d262a60a68c22d1af86c75bde83'
ARCHIVE_HASH = '890f1429b331fdca52042aa56d99784100a7cb8feea7c6c9945ed3472624607a'
AUTHORITY_HASH = 'e3c880b2d2e59aaec895e7a7d340e21b84bd3a5df4743cbd5a0c13c670a1b940'
MANIFEST_HASH = '78ad174ca9e0aa3fce42aa5cb6032eb10fb2afe5f3984e80952a0e0daefe47f3'
ARCHIVE_CONSTRUCTION = {'baselineCommit': ARCHIVE_BASELINE, 'overlaySourceCommit': SIGNED_RUNTIME,
                        'reviewedIncrementSha256': INCREMENT, 'unsignedWhenPrepared': True}
HOME = pathlib.Path('/home/debian')
RELATIVE = pathlib.Path('spikes/launcher/tests/native-session')
MARKER = pathlib.Path('/run/linuxcast-input-spike-lab')
PROCESSES = ('gnome-shell', 'kwin_wayland', 'kwin_x11', 'Xvfb', 'electron', 'node', 'gdb', 'dbus-daemon')
EXPECTED_COUNTS = {name: (2 if name == 'dbus-daemon' else 0) for name in PROCESSES}
PACKAGE = re.compile(r'(?:gnome-shell|mutter|kwin-wayland|kwin-x11|libqt6qml6) [0-9][A-Za-z0-9:~+.-]{0,99}')
PNG_NAMES = ('dark-launcher.png', 'light-capabilities.png')
OUTCOMES = ('completed', 'runner-timeout', 'cancelled', 'collector-rejected')


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def require(condition):
    if not condition:
        raise ValueError('COLLECTOR_REJECTED')


def digest(value):
    return hashlib.sha256(value).hexdigest()


def regular_bytes(file, maximum, uid=None):
    """No symlinks, TOCTOU replacement or unbounded source/artifact reads."""
    uid = os.getuid() if uid is None else uid
    require(file.is_absolute() and file == file.resolve(strict=True))
    descriptor = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        metadata = os.fstat(descriptor)
        require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == uid and metadata.st_size <= maximum)
        with os.fdopen(descriptor, 'rb', closefd=False) as stream:
            value = stream.read(maximum + 1)
        require(len(value) <= maximum)
        return value
    finally:
        os.close(descriptor)


def json_bytes(value):
    return (json.dumps(value, indent=2, allow_nan=False) + '\n').encode()


def verify_authority(stage, archive, authority_path):
    raw = regular_bytes(authority_path, 32768)
    require(digest(raw) == AUTHORITY_HASH)
    authority = json.loads(raw)
    require(digest(regular_bytes(archive, 8 * 1024 * 1024)) == ARCHIVE_HASH)
    require(type(authority) is dict and set(authority) == {'sourceStatusScope', 'sourceSigned', 'sourceDirty',
        'runtimeInputsMatchSignedCommit', 'signedRuntimeCommit', 'verifiedRuntimeCommit', 'archiveRepresentsWholeSignedTree',
        'archiveConstruction', 'reviewedIncrementSha256', 'reviewedIncrementManifestSha256', 'reviewedDiffPaths',
        'reviewedPatchedFileSha256', 'archiveSha256', 'buildManifestSha256', 'sourceSha256', 'outputSha256',
        'designTokensSha256', 'launcherDesktopFileSha256', 'dependencyAuthority'})
    require(authority['archiveSha256'] == ARCHIVE_HASH and authority['signedRuntimeCommit'] == SIGNED_RUNTIME)
    require(authority['verifiedRuntimeCommit'] == SIGNED_RUNTIME and authority['sourceStatusScope'] == SOURCE_SCOPE)
    require(authority['sourceSigned'] is True and authority['sourceDirty'] is False and authority['runtimeInputsMatchSignedCommit'] is True)
    require(authority['archiveRepresentsWholeSignedTree'] is False)
    require(type(authority['archiveConstruction']) is dict and authority['archiveConstruction'] == ARCHIVE_CONSTRUCTION)
    require(authority['archiveConstruction']['unsignedWhenPrepared'] is True)
    require(authority['reviewedIncrementSha256'] == INCREMENT and authority['reviewedIncrementManifestSha256'] == INCREMENT_MANIFEST)
    require(authority['buildManifestSha256'] == MANIFEST_HASH)
    source = stage / RELATIVE
    require(len(authority['sourceSha256']) == 24 and len(authority['reviewedPatchedFileSha256']) == 7)
    for name, expected in authority['sourceSha256'].items():
        file = pathlib.Path(os.path.abspath(source / name))
        require(file.is_relative_to(stage) and digest(regular_bytes(file, 16 * 1024 * 1024)) == expected)
    for name, expected in authority['reviewedPatchedFileSha256'].items():
        file = pathlib.Path(os.path.abspath(stage / name))
        require(file.is_relative_to(stage) and digest(regular_bytes(file, 16 * 1024 * 1024)) == expected)
    for file, key in ((stage / 'docs/design/tokens.json', 'designTokensSha256'),
                      (stage / 'spikes/launcher/resources/io.github.ianwijma.Linuxcast.desktop', 'launcherDesktopFileSha256')):
        require(digest(regular_bytes(file, 1024 * 1024)) == authority[key])
    return authority


def public_report(value, artifacts):
    """Only publisher's two exact additions may bypass public_result's keys."""
    require(type(value) is dict)
    require(value.get('privateProcessTreeCleanupVerified') is True)
    packages = value.get('packages')
    require(type(packages) is list and len(packages) <= 5)
    require(all(type(item) is str and PACKAGE.fullmatch(item) for item in packages))
    require(len(packages) == len(set(packages)))
    core = {key: item for key, item in value.items() if key not in ('privateProcessTreeCleanupVerified', 'packages')}
    result = artifacts.public_result(core, BACKEND)
    result.update(privateProcessTreeCleanupVerified=True, packages=packages)
    return result


def verify_unchanged_build(here, runner, expected_manifest):
    require(digest(regular_bytes(here / 'dist/manifest.json', 16384)) == MANIFEST_HASH)
    require(runner.verify_build(here / 'dist') == expected_manifest)


def capture(source, authority, artifacts, status, expected_manifest):
    """All bytes remain private until every schema and screenshot is checked."""
    report = public_report(json.loads(regular_bytes(source / 'report.json', 131072)), artifacts)
    manifest = artifacts.public_manifest(json.loads(regular_bytes(source / 'source-manifest.json', 16384)))
    require(manifest == expected_manifest and manifest['sourceSha256'] == authority['sourceSha256'])
    for key in ('designTokensSha256', 'launcherDesktopFileSha256'):
        require(manifest[key] == authority[key])
    require(status in (0, 3))
    require((status == 0) == (report['status'] == 'passed-bounded-native-probe'))
    files = {'report.json': json_bytes(report), 'source-manifest.json': json_bytes(manifest)}
    for name in PNG_NAMES:
        file = source / name
        if file.exists() or file.is_symlink():
            value = regular_bytes(file, 8 * 1024 * 1024)
            require(value.startswith(b'\x89PNG\r\n\x1a\n'))
            files[name] = value
    return files, manifest


def process_counts(proc=pathlib.Path('/proc')):
    counts = dict.fromkeys(PROCESSES, 0)
    for directory in proc.iterdir():
        if directory.name.isdigit():
            try:
                # Only exact comm categories survive; never read args or titles.
                name = (directory / 'comm').read_text().strip()
            except FileNotFoundError:
                continue
            if name in counts:
                counts[name] += 1
    return counts


def snapshot(stage):
    parents = (pathlib.Path('/tmp'), HOME, stage / 't')
    roots_absent = all(not parent.exists() or not any(parent.glob('linuxcast-s001-matrix-*')) for parent in parents)
    roots_absent = roots_absent and not any(path != stage.parent for pattern in ('lc1-*', 'linuxcast-s001-collection-*') for path in HOME.glob(pattern))
    return {'checkedUtc': utc(), 'fixedProcessCounts': process_counts(),
            'privateMatrixRootsAbsent': roots_absent, 'inputLabMarkerAbsent': not MARKER.exists()}


def clean_baseline(value):
    if type(value) is not dict:
        return False
    return value['fixedProcessCounts'] == EXPECTED_COUNTS and value['privateMatrixRootsAbsent'] is True and value['inputLabMarkerAbsent'] is True


SOCKET_PATH_LIMIT = 107  # Linux sockaddr_un.sun_path[108], including trailing NUL.
SOCKET_SUFFIXES = {'privateSessionBus': 'dbus-session',
                   'nativeWaylandSocket': 'runtime/linuxcast-s001-wayland',
                   'runtimeBus': 'runtime/bus', 'atSpiSocket': 'runtime/at-spi/bus_9999999999'}


def socket_layout(stage):
    # Frozen runner uses Python mkdtemp's eight-character generated suffix.
    # No filesystem, bus, native call or readiness wait is added by this guard.
    # Reject unexpected interpreter suffix generation before any child starts.
    require(len(next(tempfile._get_candidate_names())) == 8)
    matrix = stage / 't' / 'linuxcast-s001-matrix-xxxxxxxx'
    lengths = {name: len(os.fsencode(matrix / suffix)) for name, suffix in SOCKET_SUFFIXES.items()}
    require(all(0 < length <= SOCKET_PATH_LIMIT for length in lengths.values()))
    return lengths


def runner_environment(stage):
    # Fixed commands only; inherited credentials, displays and buses are omitted.
    return {'HOME': str(HOME), 'PATH': str(HOME / 'linuxcast-tools/bin') + ':/usr/bin:/bin',
            'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1',
            'TMPDIR': str(stage / 't')}


def invoke_once(command, env, cwd, supervisor, ceiling=300):
    """No retry branch. Supervisor owns teardown even on timeout/cancellation."""
    outcome, code, child = 'collector-rejected', None, None
    try:
        with supervisor():
            child = subprocess.Popen(command, env=env, cwd=cwd, start_new_session=True,
                                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                code = child.wait(timeout=ceiling)
                outcome = 'completed'
            except subprocess.TimeoutExpired:
                outcome = 'runner-timeout'
    finally:
        # Supervisor may have reaped the child; reconcile Popen bookkeeping only.
        if child is not None:
            child.poll()
    return outcome, code


def identity(path):
    info = path.lstat()
    require(info.st_uid == os.getuid())
    return info.st_dev, info.st_ino


def private_collection_root(path):
    require(path.is_absolute() and path == path.resolve(strict=True) and path.parent == HOME)
    require(re.fullmatch(r'lc1-[A-Za-z0-9_-]{8}', path.name))
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700)
    return path


def cleanup_owned(owned):
    # Preserve replacements/collisions. Inputs live within an owned 0700 root.
    complete = True
    for path, expected, is_directory in owned:
        try:
            if identity(path) != expected or path.is_symlink():
                complete = False
                continue
            if is_directory:
                shutil.rmtree(path)
            else:
                path.unlink()
        except (OSError, ValueError):
            complete = False
    return complete and all(not path.exists() and not path.is_symlink() for path, _, _ in owned)


def safe_snapshot(stage):
    try:
        return snapshot(stage)
    except OSError:
        return None


def publish(destination, files):
    require(not destination.exists() and not destination.is_symlink())
    allowed = {'report.json', 'source-manifest.json', 'provenance.json', 'cleanup.json', *PNG_NAMES}
    require(set(files) <= allowed)
    destination.mkdir(mode=0o700)
    for name, value in files.items():
        descriptor = os.open(destination / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(value)


def main():
    require(len(sys.argv) == 2 and os.getuid() == 1000 and os.geteuid() == 1000)
    collection = private_collection_root(pathlib.Path(sys.argv[1]))
    collection_identity = identity(collection)
    collector_hash = digest(regular_bytes(pathlib.Path(__file__).resolve(strict=True), 65536))
    stage, archive, authority_path, destination = (collection / name for name in ('source', 'source.tgz', 'authority.json', 'result'))
    release = pathlib.Path('/etc/os-release').read_text().splitlines()
    require('ID=debian' in release and 'VERSION_ID="13"' in release)
    require(os.uname().release == '6.12.113+deb13-amd64')
    require(stage == stage.resolve(strict=True) and stage.parent == collection)
    metadata = stage.lstat()
    require(stat.S_ISDIR(metadata.st_mode) and metadata.st_uid == os.getuid() and stat.S_IMODE(metadata.st_mode) == 0o700)
    require(not destination.exists() and not destination.is_symlink())
    socket_path_lengths = socket_layout(stage)
    before = snapshot(stage)
    require(clean_baseline(before))
    authority = verify_authority(stage, archive, authority_path)
    owned = [(path, identity(path), directory) for path, directory in ((stage, True), (archive, False), (authority_path, False))]
    here = stage / RELATIVE
    require(digest(regular_bytes(here / 'dist/manifest.json', 16384)) == MANIFEST_HASH)
    # Imports occur only after every source, including these helpers, is hashed.
    sys.path.insert(0, str(here))
    artifacts = importlib.import_module('artifacts')
    runner = importlib.import_module('run-session')
    supervision = importlib.import_module('supervision')
    manifest = runner.verify_build(here / 'dist')
    require(manifest['sourceSha256'] == authority['sourceSha256'])
    historical = stage / 'spikes/launcher/evidence/native-session/gnome-x11'
    if historical.exists():
        require(historical == historical.resolve(strict=True) and historical.is_dir())
        shutil.rmtree(historical)
    temporary = stage / 't'
    temporary.mkdir(mode=0o700)
    started, files, status, outcome = utc(), {}, None, 'collector-rejected'
    unchanged = False
    try:
        outcome, status = invoke_once(['/usr/bin/python3', str(here / 'run-session.py'), BACKEND, '--private-guest'],
                                     runner_environment(stage), stage, supervision.Supervisor)
        verify_authority(stage, archive, authority_path)
        verify_unchanged_build(here, runner, manifest)
        unchanged = True
        if outcome == 'completed':
            files, manifest = capture(historical, authority, artifacts, status, manifest)
    except supervision.Cancelled:
        outcome = 'cancelled'
    except (ValueError, OSError, KeyError, TypeError):
        outcome = 'collector-rejected'
        files = {}
    finally:
        finished = utc()
        after = safe_snapshot(stage)
        removed = cleanup_owned(owned)
        released = safe_snapshot(stage)
        cleanup = {'beforeExecution': before, 'afterRunner': after, 'afterRelease': released,
                   'ownGuestSourceArchivesAndCachesRemoved': removed,
                   'cleanReleaseVerified': clean_baseline(after) and clean_baseline(released) and removed,
                   'hostSettingsOrDisplaysChanged': False, 'physicalDesktopMatrixEstablished': False}
        provenance = {'task': 'S0-01', 'backend': BACKEND, 'collectorOutcome': outcome,
            'startedUtc': started, 'finishedUtc': finished, 'exitCode': status,
            'executedRuntimeCommit': SIGNED_RUNTIME if outcome == 'completed' and type(status) is int and unchanged else None,
            'runtimeInputsMatchSignedCommit': True, 'signedRuntimeCommit': SIGNED_RUNTIME, 'verifiedRuntimeCommit': SIGNED_RUNTIME,
            'sourceStatusScope': SOURCE_SCOPE, 'sourceSigned': True, 'sourceDirty': False, 'reviewedIncrementSha256': INCREMENT,
            'archiveRepresentsWholeSignedTree': False, 'collectorSha256': collector_hash,
            'privateSocketPathMaxBytes': SOCKET_PATH_LIMIT, 'privateSocketPathLengths': socket_path_lengths,
            'archiveConstruction': dict(ARCHIVE_CONSTRUCTION),
            'archiveSha256': ARCHIVE_HASH, 'sourceArchiveAuthoritySha256': AUTHORITY_HASH,
            'sourceInputsVerified': 24, 'sourceSha256': authority['sourceSha256'],
            'outputSha256': manifest['outputSha256'], 'designTokensSha256': authority['designTokensSha256'],
            'launcherDesktopFileSha256': authority['launcherDesktopFileSha256'],
            'sourceUnchangedDuringRun': unchanged, 'rendererPixelsCaptured': any(name in files for name in PNG_NAMES),
            'screenshotKind': 'own-renderer-CDP' if any(name in files for name in PNG_NAMES) else 'not-captured',
            'physicalDesktopMatrixEstablished': False}
        files.update({'provenance.json': json_bytes(provenance), 'cleanup.json': json_bytes(cleanup)})
        private_collection_root(collection)
        require(identity(collection) == collection_identity)
        publish(destination, files)
    return 0 if outcome == 'completed' and status == 0 and cleanup['cleanReleaseVerified'] else 3


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError):
        print('COLLECTOR_REJECTED')
        sys.exit(3)
