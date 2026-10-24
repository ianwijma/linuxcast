#!/usr/bin/python3
"""OFFLINE REVIEW: no invocation until coordinator grants exclusive VM access.

Only synthetic reviewed files cross stdin. No container transfer files, key reads,
shell commands, retries, raw child output logs, or existing-path overwrites.
"""
import base64
import datetime
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import threading

HERE = pathlib.Path(__file__).resolve().parent
IMMUTABLE = pathlib.Path('/tmp/linuxcast-s001-prevalidation-51ed-immutable')
SOURCE = pathlib.Path('/tmp/linuxcast-s0-01/spikes/launcher/tests/native-session')
# Filled only when the final reviewed collector/phase is frozen.
COLLECTOR_HASH = 'f9c79944ed04cbc02e87d540eea57f68e5b736e7eab55f22a8a21fdae99404ae'
PHASE_HASH = 'bbe00ac54edd320d98d4255e5e2bcb1c71b1304e5eb81c6631a71f9959282754'
CONTAINER = 'linuxcast-s0-04-vm'
SSH = ['docker', 'exec', '-i', CONTAINER, '/usr/bin/ssh', '-i', '/lab/test-key', '-p', '2222',
       '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=/lab/known_hosts',
       'debian@127.0.0.1', '/usr/bin/python3', '-']
TOOL_HASHES = {'node': 'e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb',
               'bun': '10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235'}
PUBLIC_NAMES = {'report.json', 'source-manifest.json', 'provenance.json', 'cleanup.json',
                'dark-launcher.png', 'light-capabilities.png'}


def require(condition):
    if not condition:
        raise ValueError('HOST_COLLECTOR_REJECTED')


def load(file, name):
    spec = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def exact_keys(value, names):
    require(type(value) is dict and set(value) == set(names))


def boolean(value):
    require(type(value) is bool)


def timestamp(value):
    require(type(value) is str and re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?\+00:00', value))
    datetime.datetime.fromisoformat(value)


def snapshot(value, collector, dated=False, nullable=False):
    if value is None and nullable:
        return
    names = {'fixedProcessCounts', 'privateMatrixRootsAbsent', 'inputLabMarkerAbsent'}
    if dated:
        names.add('checkedUtc')
    exact_keys(value, names)
    exact_keys(value['fixedProcessCounts'], collector.PROCESSES)
    require(all(type(item) is int and 0 <= item <= 1024 for item in value['fixedProcessCounts'].values()))
    boolean(value['privateMatrixRootsAbsent'])
    boolean(value['inputLabMarkerAbsent'])
    if dated:
        timestamp(value['checkedUtc'])


def public_provenance(value, collector, authority, manifest, image_names):
    exact_keys(value, ('task', 'backend', 'collectorOutcome', 'startedUtc', 'finishedUtc', 'exitCode',
        'executedRuntimeCommit', 'runtimeInputsMatchSignedCommit', 'archiveRepresentsWholeSignedTree', 'collectorSha256',
        'privateSocketPathMaxBytes', 'privateSocketPathLengths', 'archiveConstruction', 'archiveSha256', 'sourceArchiveAuthoritySha256', 'sourceInputsVerified', 'sourceSha256',
        'outputSha256', 'designTokensSha256', 'launcherDesktopFileSha256', 'sourceUnchangedDuringRun',
        'rendererPixelsCaptured', 'screenshotKind', 'physicalDesktopMatrixEstablished'))
    require(value['task'] == 'S0-01' and value['backend'] == 'gnome-x11')
    require(type(value['collectorOutcome']) is str and value['collectorOutcome'] in collector.OUTCOMES)
    timestamp(value['startedUtc'])
    timestamp(value['finishedUtc'])
    require(value['finishedUtc'] >= value['startedUtc'])
    require(value['exitCode'] is None or (type(value['exitCode']) is int and -64 <= value['exitCode'] <= 255))
    require(value['executedRuntimeCommit'] == collector.COMMIT and value['runtimeInputsMatchSignedCommit'] is True)
    require(value['archiveRepresentsWholeSignedTree'] is False and value['collectorSha256'] == COLLECTOR_HASH)
    require(type(value['privateSocketPathMaxBytes']) is int and value['privateSocketPathMaxBytes'] == 107)
    require(value['privateSocketPathLengths'] == collector.socket_layout(pathlib.Path('/home/debian/lc1-xxxxxxxx/source')))
    require(all(type(length) is int for length in value['privateSocketPathLengths'].values()))
    exact_keys(value['archiveConstruction'], ('baselineCommit', 'reviewedCombinedDiffSha256', 'unsignedWhenPrepared'))
    require(value['archiveConstruction']['unsignedWhenPrepared'] is True)
    require(value['archiveConstruction'] == {'baselineCommit': collector.BASELINE, 'reviewedCombinedDiffSha256': collector.DIFF, 'unsignedWhenPrepared': True})
    require(value['archiveSha256'] == collector.ARCHIVE_HASH and value['sourceArchiveAuthoritySha256'] == collector.AUTHORITY_HASH)
    require(type(value['sourceInputsVerified']) is int and value['sourceInputsVerified'] == 24)
    require(value['sourceSha256'] == authority['sourceSha256'] and value['outputSha256'] == manifest['outputSha256'])
    for name in ('designTokensSha256', 'launcherDesktopFileSha256'):
        require(value[name] == authority[name])
    boolean(value['sourceUnchangedDuringRun'])
    require(value['rendererPixelsCaptured'] is bool(image_names))
    require(value['screenshotKind'] == ('own-renderer-CDP' if image_names else 'not-captured'))
    require(value['physicalDesktopMatrixEstablished'] is False)
    return value


def public_cleanup(value, collector):
    exact_keys(value, ('beforeExecution', 'afterRunner', 'afterRelease', 'ownGuestSourceArchivesAndCachesRemoved',
                       'cleanReleaseVerified', 'hostSettingsOrDisplaysChanged', 'physicalDesktopMatrixEstablished'))
    snapshot(value['beforeExecution'], collector, dated=True)
    require(collector.clean_baseline(value['beforeExecution']))
    for key in ('afterRunner', 'afterRelease'):
        snapshot(value[key], collector, dated=True, nullable=True)
    boolean(value['ownGuestSourceArchivesAndCachesRemoved'])
    boolean(value['cleanReleaseVerified'])
    expected = collector.clean_baseline(value['afterRunner']) and collector.clean_baseline(value['afterRelease']) and value['ownGuestSourceArchivesAndCachesRemoved']
    require(value['cleanReleaseVerified'] == expected)
    require(value['hostSettingsOrDisplaysChanged'] is False and value['physicalDesktopMatrixEstablished'] is False)
    return value


def public_response(raw, collector, authority, artifacts, expected_manifest):
    require(len(raw) <= 24 * 1024 * 1024)
    value = json.loads(raw)
    exact_keys(value, ('phase', 'collectorExitCode', 'files', 'before', 'release', 'ownedGuestCapsuleRemoved', 'expectedToolSha256', 'toolsVerifiedBeforeAndAfter'))
    require(value['phase'] in ('entry-rejected', 'preparation-failed', 'native-attempted', 'collection-failed'))
    code = value['collectorExitCode']
    require(code is None or (type(code) is int and -64 <= code <= 255))
    snapshot(value['before'], collector, nullable=True)
    snapshot(value['release'], collector, nullable=True)
    boolean(value['ownedGuestCapsuleRemoved'])
    require(value['expectedToolSha256'] == TOOL_HASHES)
    boolean(value['toolsVerifiedBeforeAndAfter'])
    encoded = value['files']
    require(type(encoded) is dict and set(encoded) <= PUBLIC_NAMES)
    if value['phase'] != 'native-attempted':
        require(not encoded)
    else:
        require(code in (0, 3) and {'provenance.json', 'cleanup.json'} <= set(encoded))
    files = {}
    for name, data in encoded.items():
        require(type(data) is str)
        maximum = 8 * 1024 * 1024 if name.endswith('.png') else 131072
        require(len(data) <= ((maximum + 2) // 3) * 4)
        decoded = base64.b64decode(data, validate=True)
        require(len(decoded) <= maximum)
        files[name] = decoded
    require(('report.json' in files) == ('source-manifest.json' in files))
    image_names = set(files) & set(collector.PNG_NAMES)
    require(not image_names or 'report.json' in files)
    for name in image_names:
        require(files[name].startswith(b'\x89PNG\r\n\x1a\n'))
    if 'report.json' in files:
        report = collector.public_report(json.loads(files['report.json']), artifacts)
        manifest = artifacts.public_manifest(json.loads(files['source-manifest.json']))
        require(manifest == expected_manifest)
        require((code == 0) == (report['status'] == 'passed-bounded-native-probe'))
        files['report.json'] = collector.json_bytes(report)
        files['source-manifest.json'] = collector.json_bytes(manifest)
    if 'provenance.json' in files:
        provenance = public_provenance(json.loads(files['provenance.json']), collector, authority, expected_manifest, image_names)
        cleanup = public_cleanup(json.loads(files['cleanup.json']), collector)
        if code == 0:
            require(provenance['collectorOutcome'] == 'completed' and provenance['exitCode'] == 0 and
                    provenance['sourceUnchangedDuringRun'] is True and cleanup['cleanReleaseVerified'] is True and 'report.json' in files)
        files['provenance.json'] = collector.json_bytes(provenance)
        files['cleanup.json'] = collector.json_bytes(cleanup)
    release = {key: value[key] for key in ('phase', 'collectorExitCode', 'before', 'release', 'ownedGuestCapsuleRemoved', 'expectedToolSha256', 'toolsVerifiedBeforeAndAfter')}
    release['guestReleaseVerified'] = value['ownedGuestCapsuleRemoved'] and collector.clean_baseline(value['release']) and value['toolsVerifiedBeforeAndAfter']
    release['physicalDesktopMatrixEstablished'] = False
    return files, release


def bounded_response(command, script, supervisor):
    """Bound stdin writer/output drain; no raw child bytes reach a file/log."""
    chunks, total, overflow, writer_failed = [], [0], [False], [False]
    child = writer = reader = None
    try:
        with supervisor():
            child = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL, start_new_session=True,
                                     env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8'})

            def write():
                try:
                    child.stdin.write(script)
                    child.stdin.close()
                except (OSError, ValueError):
                    writer_failed[0] = True

            def read():
                try:
                    while True:
                        part = child.stdout.read(4096)
                        if not part:
                            break
                        total[0] += len(part)
                        if total[0] > 24 * 1024 * 1024:
                            overflow[0] = True
                            chunks.clear()
                        elif not overflow[0]:
                            chunks.append(part)
                except (OSError, ValueError):
                    overflow[0] = True

            writer, reader = threading.Thread(target=write, daemon=True), threading.Thread(target=read, daemon=True)
            writer.start()
            reader.start()
            code = child.wait(timeout=920)
    finally:
        if child is not None:
            child.poll()
        for thread in (writer, reader):
            if thread is not None:
                thread.join(timeout=1)
        if child is not None:
            if writer is None or not writer.is_alive():
                child.stdin.close()
            if reader is None or not reader.is_alive():
                child.stdout.close()
    require(not writer.is_alive() and not reader.is_alive() and not overflow[0] and not writer_failed[0] and code == 0)
    return b''.join(chunks)


def exclusive(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(value)


def main():
    require(len(sys.argv) == 2 and sys.argv[1] == '--reserved-one-gnome-x11')
    collector_data = (HERE / 'collect.py').read_bytes()
    phase = (HERE / 'guest_phase.py').read_bytes()
    require(hashlib.sha256(collector_data).hexdigest() == COLLECTOR_HASH and hashlib.sha256(phase).hexdigest() == PHASE_HASH)
    collector = load(HERE / 'collect.py', 'linuxcast_s001_host_collector')
    authority_raw = collector.regular_bytes(IMMUTABLE / 'authority.json', 32768)
    archive = collector.regular_bytes(IMMUTABLE / 'source.tgz', 8 * 1024 * 1024)
    require(collector.digest(authority_raw) == collector.AUTHORITY_HASH and collector.digest(archive) == collector.ARCHIVE_HASH)
    authority = json.loads(authority_raw)
    # Verify local reviewed helper inputs before imports, without running a probe.
    for name in ('artifacts.py', 'observer_startup.py', 'private.py', 'supervision.py'):
        require(collector.digest(collector.regular_bytes(SOURCE / name, 65536)) == authority['sourceSha256'][name])
    sys.path.insert(0, str(SOURCE))
    artifacts = __import__('artifacts')
    supervision = __import__('supervision')
    raw_manifest = collector.regular_bytes(SOURCE / 'dist/manifest.json', 16384)
    require(collector.digest(raw_manifest) == collector.MANIFEST_HASH)
    manifest = artifacts.public_manifest(json.loads(raw_manifest))
    capsule = pathlib.Path(tempfile.mkdtemp(prefix='linuxcast-s001-transfer-', dir='/tmp'))
    identity = collector.identity(capsule)
    keep = False
    try:
        inputs = {'source.tgz': archive, 'authority.json': authority_raw, 'collect.py': collector_data}
        for name, value in inputs.items():
            exclusive(capsule / name, value)
        input_identities = {name: collector.identity(capsule / name) for name in inputs}
        payload = {'files': {name: base64.b64encode(value).decode('ascii') for name, value in inputs.items()},
                   'sha256': {name: collector.digest(value) for name, value in inputs.items()}}
        script = ('PAYLOAD=' + repr(payload) + '\n').encode() + phase
        raw = bounded_response(SSH, script, supervision.Supervisor)
        files, release = public_response(raw, collector, authority, artifacts, manifest)
        for name in inputs:
            require(collector.identity(capsule / name) == input_identities[name])
            require(collector.digest(collector.regular_bytes(capsule / name, 8 * 1024 * 1024)) == collector.digest(inputs[name]))
            (capsule / name).unlink()
        release['hostTransferCopiesRemoved'] = True
        result = capsule / 'result'
        collector.publish(result, files)
        descriptor = os.open(result / 'release.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(collector.json_bytes(release))
        keep = True
        print(json.dumps({'outcome': 'collected', 'capsule': str(capsule), 'guestReleaseVerified': release['guestReleaseVerified']}))
        return 0 if release['guestReleaseVerified'] and release['collectorExitCode'] == 0 else 3
    finally:
        require(collector.identity(capsule) == identity and not capsule.is_symlink())
        if not keep:
            shutil.rmtree(capsule)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (Exception, KeyboardInterrupt):
        # Fixed outcome only; no SSH errors, environment, key or raw JSON export.
        print('HOST_COLLECTION_FAILED_RELEASE_UNVERIFIED')
        sys.exit(3)
