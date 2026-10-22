"""No-display checks for one strict private clipboard scenario."""
import contextlib
import copy
import importlib.util
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import types
from unittest.mock import patch
import clipboard_scenario as scenario


def valid():
    return dict(kind=scenario.KIND, state='passed', hostClipboardTouched=False,
                guestClipboard='fresh-private-compositor-public-test-selection', productionDataControlAdapter=False,
                nativeOwnerEvents=2, nativeClientFailure=False, **{key: True for key in scenario.CHECKS})


def report_cases():
    source = valid()
    assert scenario.complete(scenario.parse_client(source), 0, True)
    for key in scenario.CHECKS:
        value = dict(source, **{key: False})
        assert not scenario.complete(scenario.parse_client(value), 0, True)
        del value[key]
        assert not scenario.complete(scenario.parse_client(value), 0, True)
    for code, alive in ((3, True), (-9, True), (0, False)):
        assert not scenario.complete(source, code, alive)
    for value in (dict(source, nativeOwnerEvents=1), dict(source, nativeClientFailure=True)):
        assert not scenario.complete(scenario.parse_client(value), 0, True)
    for value in (dict(source, private='synthetic-private-canary'), dict(source, nativeOwnerEvents=True),
                  dict(source, nativeOwnerEvents=1001), dict(source, kind='private-canary'),
                  dict(source, reason='synthetic-private-canary'), dict(source, hostClipboardTouched=True),
                  dict(source, negotiatedWlrDataControlV2='true')):
        try: scenario.parse_client(value)
        except ValueError: pass
        else: raise AssertionError('CLIPBOARD_SCHEMA_ACCEPTED_PRIVATE_OR_INVALID_DATA')
    with tempfile.TemporaryDirectory() as temporary:
        root = pathlib.Path(temporary)
        env = {'LINUXCAST_S002_RESULT_DIR': str(root), 'LINUXCAST_S002_NODE': '/fixed-node'}
        file = root / 'clipboard-result.json'
        calls = []
        class Compositor:
            def poll(self): return None
        def run(command, **kwargs):
            calls.append(command)
            assert command == ['/fixed-node', str(root / 'clipboard-client.mjs')]
            assert kwargs == dict(env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
            file.write_text(json.dumps(source))
            return types.SimpleNamespace(returncode=0)
        result = scenario.collect(env, root, Compositor(), run)
        assert result['state'] == 'passed' and len(calls) == 1
        assert all(result[k] is False for k in ('windowPlacementExercised', 'focusExercised', 'restartExercised', 'physicalDesktopMatrixEstablished'))
        def timeout(*_args, **_kwargs): raise subprocess.TimeoutExpired('fixed-client', 10)
        assert scenario.collect(env, root, Compositor(), timeout)['reason'] == 'CLIPBOARD_ONLY_CLIENT_DEADLINE'
        def bad(*_args, **_kwargs):
            file.write_text(json.dumps(dict(source, private='synthetic-private-canary')))
            return types.SimpleNamespace(returncode=0)
        result = scenario.collect(env, root, Compositor(), bad)
        assert result['state'] == 'unavailable' and 'canary' not in json.dumps(result)


def runner_cases():
    spec = importlib.util.spec_from_file_location('clipboard_runner', pathlib.Path(__file__).with_name('run-session.py'))
    runner = importlib.util.module_from_spec(spec); spec.loader.exec_module(runner)
    for backend, extra in [('gnome-wayland', []), ('gnome-x11', []), ('kwin-x11', []),
                           ('kwin-wayland', ['--restart-scenario']), ('kwin-wayland', ['--debugger-scenario']),
                           ('kwin-wayland', ['--read-only-control']), ('kwin-wayland', ['--own-client-resize-control'])]:
        with patch.object(runner._context, 'guest_allowed', return_value=True), \
             patch.object(sys, 'argv', ['run-session.py', backend, '--private-guest', '--clipboard-only', *extra]), \
             patch('subprocess.Popen', side_effect=AssertionError('UNEXPECTED_NATIVE_PROCESS')), contextlib.redirect_stdout(io.StringIO()):
            assert runner.main() == 3
    with tempfile.TemporaryDirectory() as temporary:
        root = pathlib.Path(temporary); (root / 'manifest.json').write_text('{}')
        (root / 'runtime').mkdir(); (root / 'runtime/linuxcast-s002-wayland').touch()
        calls = []
        class Compositor:
            def poll(self): return None
        child = Compositor()
        def popen(command, **_kwargs):
            assert command[0] == '/fixed-kwin' and not calls
            calls.append('compositor'); return child
        def collect(env, here, compositor):
            assert compositor is child and here == root and calls == ['compositor']
            calls.append('clipboard-once'); return dict(scenario.unavailable('CLIPBOARD_ONLY_TRANSPORT_COMPLETE'), state='passed')
        with patch.object(runner._context, 'private_context', return_value=root), \
             patch.dict(os.environ, {'DBUS_SESSION_BUS_ADDRESS': 'fixed-private-bus'}, clear=True), \
             patch.object(runner, 'HERE', root), patch.object(runner.shutil, 'which', return_value='/fixed-kwin'), \
             patch.object(runner, 'bounded', return_value=types.SimpleNamespace(returncode=0, stdout='(true,)')), \
             patch.object(runner.subprocess, 'Popen', side_effect=popen), \
             patch.object(runner.clipboard_scenario, 'collect', side_effect=collect), \
             patch.object(runner, 'terminate', side_effect=lambda owned: calls.append('terminate-own') if owned is child else (_ for _ in ()).throw(AssertionError('FOREIGN_CHILD'))), \
             contextlib.redirect_stdout(io.StringIO()):
            assert runner.inner('kwin-wayland', root, clipboard_only=True) == 0
        assert calls == ['compositor', 'clipboard-once', 'terminate-own']


if __name__ == '__main__':
    report_cases(); runner_cases()
    print('clipboard-only-fixed-scenario-passed')
