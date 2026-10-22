"""One packaged-client clipboard check on the fresh private compositor only."""
import json
import os
import pathlib
import stat
import subprocess

KIND = 'packaged-wl-clipboard-current-ClipboardTransfer-on-isolated-KWin-display'
MODE = 'clipboard-only'
EVIDENCE = 'actual-isolated-KWin-packaged-clipboard-only-transport'
CHECKS = ('publicPayloadMatches', 'negotiatedWlrDataControlV2', 'deniedBeforeNativeRead',
          'unsupportedMimeRejected', 'cancelled', 'oversizeRejected')
BASE = {'kind', 'state', 'hostClipboardTouched', 'guestClipboard', 'productionDataControlAdapter'}
OPTIONAL = set(CHECKS) | {'nativeOwnerEvents', 'nativeClientFailure', 'reason'}


def parse_client(value):
    if type(value) is not dict or not BASE <= set(value) or not set(value) <= BASE | OPTIONAL:
        raise ValueError('CLIPBOARD_ONLY_RESULT_SCHEMA_REJECTED')
    if (value['kind'] != KIND or value['state'] not in ('passed', 'failed', 'unavailable')
            or value['hostClipboardTouched'] is not False or value['productionDataControlAdapter'] is not False
            or value['guestClipboard'] != 'fresh-private-compositor-public-test-selection'):
        raise ValueError('CLIPBOARD_ONLY_RESULT_SCHEMA_REJECTED')
    for key in (*CHECKS, 'nativeClientFailure'):
        if key in value and type(value[key]) is not bool:
            raise ValueError('CLIPBOARD_ONLY_RESULT_SCHEMA_REJECTED')
    if 'nativeOwnerEvents' in value and (type(value['nativeOwnerEvents']) is not int or not 0 <= value['nativeOwnerEvents'] <= 1000):
        raise ValueError('CLIPBOARD_ONLY_RESULT_SCHEMA_REJECTED')
    if 'reason' in value and value['reason'] != 'ISOLATED_NATIVE_CLIPBOARD_CLIENT_UNAVAILABLE':
        raise ValueError('CLIPBOARD_ONLY_RESULT_SCHEMA_REJECTED')
    return dict(value)


def complete(value, exit_code, compositor_alive):
    return (exit_code == 0 and compositor_alive and value['state'] == 'passed'
            and all(value.get(key) is True for key in CHECKS)
            and value.get('nativeClientFailure') is False and value.get('nativeOwnerEvents', 0) >= 2)


def unavailable(reason):
    return {'state': 'unavailable', 'reason': reason, 'mode': MODE, 'evidenceKind': EVIDENCE,
            'windowPlacementExercised': False, 'focusExercised': False, 'restartExercised': False,
            'physicalDesktopMatrixEstablished': False, 'hostDisplayClipboardOrSettingsUsed': False}


def collect(env, here, compositor, run=subprocess.run):
    report = unavailable('CLIPBOARD_ONLY_TRANSPORT_INCOMPLETE')
    try:
        result = run([env.get('LINUXCAST_S002_NODE', '/usr/bin/node'), str(here / 'clipboard-client.mjs')],
                     env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        path = pathlib.Path(env['LINUXCAST_S002_RESULT_DIR']) / 'clipboard-result.json'
        metadata = path.lstat()
        if (path != path.resolve(strict=True) or not stat.S_ISREG(metadata.st_mode)
                or metadata.st_uid != os.getuid() or metadata.st_size > 4096):
            raise ValueError('CLIPBOARD_ONLY_RESULT_SCHEMA_REJECTED')
        if type(result.returncode) is not int or not -64 <= result.returncode <= 255:
            raise ValueError('CLIPBOARD_ONLY_CLIENT_EXIT_INVALID')
        client = parse_client(json.loads(path.read_text()))
        alive = compositor.poll() is None
        report.update(clipboard=client, nativeClientExitCode=result.returncode, compositorAliveAfterClient=alive)
        if complete(client, result.returncode, alive):
            report.update(state='passed', reason='CLIPBOARD_ONLY_TRANSPORT_COMPLETE')
        return report
    except subprocess.TimeoutExpired:
        report['reason'] = 'CLIPBOARD_ONLY_CLIENT_DEADLINE'
    except (OSError, ValueError, KeyError):
        report['reason'] = 'CLIPBOARD_ONLY_RESULT_UNAVAILABLE'
    return report
