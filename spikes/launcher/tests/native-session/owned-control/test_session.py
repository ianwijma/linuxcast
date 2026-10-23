"""Harmless production-runner fixtures: no compositor, Xlib, Electron or prctl.
All child/native entry points and signal installation are explicitly replaced.
Only synthetic owned temporary files are created. Existing Node fixtures test
real control helpers separately; this module tests their new session boundary.
"""
import contextlib
import copy
import importlib.util
import io
import json
import os
import pathlib
import shutil
import signal
import stat
import subprocess
import tempfile
import unittest
from unittest import mock

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('owned_control_session_fixture',HERE/'session.py')
S=importlib.util.module_from_spec(spec);spec.loader.exec_module(S)
P=S.P
PACKAGES=['kwin-x11 4:6.3.6-1','libqt6qml6 6.8.2+dfsg-9']

def complete():return dict(P.SCOPE,diagnosticOutcome='complete',completedSteps=list(P.STEPS),failedStage=None)
def failed(count=0):return dict(P.SCOPE,diagnosticOutcome='failed',completedSteps=list(P.STEPS[:count]),failedStage=P.STEPS[count] if count<len(P.STEPS) else 'cleanup')
def authority():return {'kind':'S0-01-owned-control-runtime-authority','backend':P.BACKEND,'probeMode':P.MODE,
    'applicationObserverManifestSha256':P.AUTHORITY,'controlSourceSha256':{name:'a'*64 for name in P.RUNTIME_SOURCES},'nodeSha256':P.NODE_SHA256}

class PublicFixtures(unittest.TestCase):
    def test_core_protocol_complete_and_each_terminal_prefix(self):
        for value in [complete(),*[failed(index) for index in range(7)]]:
            self.assertEqual(P.control_result(value),value)
        report=P.make_report(complete(),P.state('completed',3,None),PACKAGES)
        self.assertTrue(report['controlChecksCompleted']);self.assertEqual(report['status'],'incomplete')
        self.assertFalse(report['fullAcceptanceEstablished']);self.assertFalse(report['selectedLifecycleEstablished'])
    def test_reject_result_forgery_and_nested_private_canary(self):
        for key,value in [('status','passed'),('backend','gnome-x11'),('probeMode','lifecycle-only'),
            ('physicalDesktopMatrixEstablished',True),('fullAcceptanceEstablished',True),('countScope','own-process'),
            ('focusOrShortcutEstablished',0),('private',{'title':'PRIVATE_CANARY'}),('failedStage','PRIVATE_CANARY'),
            ('completedSteps',list(P.STEPS)[::-1])]:
            altered=complete();altered[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):P.control_result(altered)
        for key in ('physicalDesktopMatrixEstablished','fullAcceptanceEstablished'):
            altered=P.unavailable('CONTROL_ENTRY_REJECTED');altered[key]=0
            with self.assertRaises(ValueError):P.control_result(altered)
    def test_reports_never_promote_wrong_driver_or_missing_packages(self):
        states=[P.state('driver-timeout',reason='CONTROL_DRIVER_DEADLINE'),P.state('session-timeout',reason='CONTROL_SESSION_DEADLINE'),
                P.state('driver-exit-rejected',0,'CONTROL_DRIVER_EXIT_REJECTED'),P.state('session-exit-rejected',-9,'CONTROL_SESSION_EXIT_REJECTED')]
        for state in states:
            report=P.make_report(complete(),state,[]);self.assertFalse(report['controlChecksCompleted'])
            report['controlChecksCompleted']=True
            with self.assertRaises(ValueError):P.session_report(report)
        with self.assertRaises(ValueError):P.make_report(complete(),P.state('completed',3,None),[])
        for code in (True,3.0,None,256,-256):
            with self.subTest(code=code),self.assertRaises(ValueError):P.state('driver-exit-rejected',code,'CONTROL_DRIVER_EXIT_REJECTED')
    def test_report_unknown_fields_false_cleanup_and_old_formats(self):
        report=P.make_report(complete(),P.state('completed',3,None),PACKAGES)
        for key,value in [('privateProcessTreeCleanupVerified',False),('sourceUnchanged',False),('private',{'pid':9123}),
                          ('fullAcceptanceEstablished',True),('kind','S0-01-private-native-compositor-probe')]:
            changed=copy.deepcopy(report);changed[key]=value
            with self.assertRaises(ValueError):P.session_report(changed)
        for value in ({'status':'passed'}, {'probeMode':'lifecycle-only'}, complete()):
            with self.assertRaises(ValueError):P.session_report(value)
    def test_duplicate_json_and_nonfinite_rejected(self):
        for raw in ('{"kind":1,"kind":2}','{"x":NaN}','{"x":Infinity}','{"x":{"s":1,"s":2}}'):
            with self.assertRaises(ValueError):P.loads(raw)
    def test_descriptor_exact_fixed_non_authorization_schema(self):
        self.assertEqual(P.runtime_authority(authority()),authority())
        for key,value in [('commands',['PRIVATE_COMMAND']),('sourceRoot','/tmp/private'),('principal','root'),
            ('sourceSigned',True),('signedRuntimeCommit','a'*40),('nodeSha256','b'*64),('backend','gnome-x11'),
            ('applicationObserverManifestSha256','c'*64),('controlSourceSha256',{'session.py':'a'*64})]:
            altered=authority();altered[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):P.runtime_authority(altered)
    def test_publish_validates_everything_before_any_creation(self):
        with tempfile.TemporaryDirectory() as name:
            root=pathlib.Path(name);destination=root/'result'
            invalid=P.make_report(complete(),P.state('completed',3,None),PACKAGES);invalid['private']='PRIVATE_CANARY'
            manifest={'kind':'S0-01-owned-control-source-manifest','applicationObserver':{},
                'controlSourceSha256':authority()['controlSourceSha256'],'controlAuthoritySha256':P.AUTHORITY}
            with self.assertRaises(ValueError):P.publish(destination,invalid,manifest,lambda value:value)
            self.assertFalse(destination.exists())
            valid=P.make_report(complete(),P.state('completed',3,None),PACKAGES)
            malformed=copy.deepcopy(manifest);malformed['private']='PRIVATE_CANARY'
            with self.assertRaises(ValueError):P.publish(destination,valid,malformed,lambda value:value)
            self.assertFalse(destination.exists())
            code,_=P.publish(destination,valid,manifest,lambda value:value)
            self.assertEqual(code,3);self.assertEqual({file.name for file in destination.iterdir()},{'report.json','source-manifest.json'})
            self.assertEqual(destination.stat().st_mode&0o777,0o700)
            for file in destination.iterdir():self.assertEqual(file.stat().st_mode&0o777,0o600)
            with self.assertRaises(FileExistsError):P.publish(destination,valid,manifest,lambda value:value)

class FileFixtures(unittest.TestCase):
    def test_regular_descriptor_rejects_symlink_hardlink_mode_oversize(self):
        with tempfile.TemporaryDirectory() as name:
            root=pathlib.Path(name);file=root/'authority';file.write_bytes(b'public');file.chmod(0o600)
            self.assertEqual(P.regular_bytes(file,6,private=True),b'public')
            with self.assertRaises(ValueError):P.regular_bytes(file,5,private=True)
            link=root/'link';link.symlink_to(file)
            with self.assertRaises(ValueError):P.regular_bytes(link,6,private=True)
            link.unlink();os.link(file,link)
            with self.assertRaises(ValueError):P.regular_bytes(file,6,private=True)
            link.unlink();file.chmod(0o644)
            with self.assertRaises(ValueError):P.regular_bytes(file,6,private=True)
    def test_stable_identity_checked_after_read_and_descriptor_closed(self):
        with tempfile.TemporaryDirectory() as name:
            file=pathlib.Path(name)/'authority';file.write_bytes(b'public');file.chmod(0o600)
            closed=[];real_close=os.close;opened=[];real_open=os.open
            real_fdopen=os.fdopen
            def open_file(*args,**kwargs):fd=real_open(*args,**kwargs);opened.append(fd);return fd
            def read_open(*args,**kwargs):
                replacement=file.with_name('replacement');replacement.write_bytes(b'public');replacement.chmod(0o600)
                os.replace(replacement,file);return real_fdopen(*args,**kwargs)
            def close(fd):closed.append(fd);return real_close(fd)
            with mock.patch.object(os,'open',open_file),mock.patch.object(os,'fdopen',read_open),mock.patch.object(os,'close',close):
                with self.assertRaises(ValueError):P.regular_bytes(file,6,private=True)
            self.assertEqual(closed,list(reversed(opened)))
    def test_parent_swap_cannot_redirect_leaf_or_escape_owned_chain(self):
        with tempfile.TemporaryDirectory() as name:
            root=pathlib.Path(name);parent=root/'capsule';parent.mkdir(mode=0o700)
            file=parent/'authority';file.write_bytes(b'original');file.chmod(0o600)
            foreign=root/'foreign';foreign.mkdir(mode=0o700);(foreign/'authority').write_bytes(b'PRIVATE_CANARY')
            retained=root/'retained';real_open=os.open;opened=[];closed=[];real_close=os.close
            def open_file(path,*args,**kwargs):
                if path=='authority':parent.rename(retained);parent.symlink_to(foreign,target_is_directory=True)
                fd=real_open(path,*args,**kwargs);opened.append(fd);return fd
            def close(fd):closed.append(fd);return real_close(fd)
            with mock.patch.object(os,'open',open_file),mock.patch.object(os,'close',close):
                with self.assertRaises(ValueError):P.regular_bytes(file,16384,private=True)
            self.assertEqual(closed,list(reversed(opened)))
            self.assertEqual((foreign/'authority').read_bytes(),b'PRIVATE_CANARY')
    def test_wrong_uid_denied_before_read_and_all_handles_closed(self):
        with tempfile.TemporaryDirectory() as name:
            file=pathlib.Path(name)/'authority';file.write_bytes(b'public');file.chmod(0o600)
            original=os.fstat;real_close=os.close;opened=[];closed=[];real_open=os.open
            def open_file(*args,**kwargs):fd=real_open(*args,**kwargs);opened.append(fd);return fd
            def metadata(fd):
                result=original(fd)
                if stat.S_ISREG(result.st_mode):
                    values=list(result);values[4]=os.getuid()+1;return os.stat_result(values)
                return result
            def close(fd):closed.append(fd);return real_close(fd)
            with (mock.patch.object(os,'open',open_file),mock.patch.object(os,'fstat',side_effect=metadata),
                  mock.patch.object(os,'fdopen') as read,mock.patch.object(os,'close',close)):
                with self.assertRaises(ValueError):P.regular_bytes(file,16384,private=True)
                read.assert_not_called()
            self.assertEqual(closed,list(reversed(opened)))
    def test_collision_or_changed_root_is_never_removed(self):
        with tempfile.TemporaryDirectory() as name:
            root=pathlib.Path(name)/'root';root.mkdir(mode=0o700);metadata=root.stat();owned=metadata.st_dev,metadata.st_ino
            self.assertFalse(S.remove_owned(root,owned,False));self.assertTrue(root.exists())
            original=root.with_name('original');root.rename(original);root.mkdir(mode=0o700)
            self.assertFalse(S.remove_owned(root,owned,True));self.assertTrue(root.exists());self.assertTrue(original.exists())
            metadata=root.stat();root.chmod(0o755)
            self.assertFalse(S.remove_owned(root,(metadata.st_dev,metadata.st_ino),True))
    def test_fixed_socket_byte_boundary_and_private_setup(self):
        longest='/runtime/linuxcast-s001-wayland'
        S.socket_layout(pathlib.Path('/'+'x'*(107-len(longest)-1)))
        with self.assertRaises(ValueError):S.socket_layout(pathlib.Path('/'+'x'*(108-len(longest)-1)))
        with tempfile.TemporaryDirectory(prefix='s1-') as name:
            root=pathlib.Path(name);root.chmod(0o700);env=S.setup(root)
            self.assertEqual(env['HOME'],str(root/'home'));self.assertEqual(env['GSETTINGS_BACKEND'],'keyfile')
            self.assertIn('unix:path='+str(root/'dbus-session'),(root/'bus.conf').read_text())
            self.assertNotIn('tmpdir=',(root/'bus.conf').read_text())
            self.assertEqual((root/'xauthority').stat().st_mode&0o777,0o600)
            args=S.command(root,'a'*64)
            self.assertEqual(args.count('--inner'),1);self.assertNotIn('--no-sandbox',args)

class SourceFixtures(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory(prefix='s001-source-fixture-');self.addCleanup(self.temporary.cleanup)
        self.home=pathlib.Path(self.temporary.name);self.stage=self.home/'lc1-abcdefgh';self.stage.mkdir(mode=0o700)
        self.source=self.stage/'source';self.source.mkdir(mode=0o700);(self.source/'t').mkdir(mode=0o700)
        self.native=self.source/'spikes/launcher/tests/native-session';self.native.mkdir(parents=True)
        self.control=self.native/'owned-control';self.control.mkdir();self.manifest=P.loads((HERE/'runtime-authority.json').read_bytes())
        paths={HERE/'runtime-authority.json':self.control/'runtime-authority.json',S.NATIVE/'dist/manifest.json':self.native/'dist/manifest.json'}
        for name in self.manifest['sourceSha256']:paths[S.NATIVE/name]=self.native/name
        for name in self.manifest['outputSha256']:paths[S.NATIVE/'dist'/name]=self.native/'dist'/name
        for relative in ('docs/design/tokens.json','spikes/launcher/resources/io.github.ianwijma.Linuxcast.desktop'):
            paths[S.SOURCE_ROOT/relative]=self.source/relative
        for name in P.RUNTIME_SOURCES:paths[HERE/name]=self.control/name
        for original,destination in paths.items():
            destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(original,destination)
        self.authority=authority();self.authority['controlSourceSha256']={name:P.file_hash(self.control/name,8*1024*1024) for name in P.RUNTIME_SOURCES}
        self.descriptor=self.stage/'control-authority.json';self.descriptor.write_bytes(P.encoded(self.authority));self.descriptor.chmod(0o600)
        self.digest=P.file_hash(self.descriptor,16384)
        self.home_patch=mock.patch.object(S,'HOME',self.home);self.home_patch.start();self.addCleanup(self.home_patch.stop)
        self.node_patch=mock.patch.object(S,'verify_node');self.node=self.node_patch.start();self.addCleanup(self.node_patch.stop)
    def verify(self):return S.verify_sources(self.digest,self.source)
    def test_real_all_source_static_and_build_inputs_plus_descriptor_pass(self):
        value=self.verify();self.assertEqual(len(value['applicationObserver']['sourceSha256']),25)
        self.assertEqual(len(value['controlSourceSha256']),6);self.node.assert_called_once_with()
    def test_descriptor_tamper_rejected_before_tool_or_effect(self):
        self.descriptor.write_bytes(P.encoded(dict(self.authority,private='PRIVATE_CANARY')))
        with self.assertRaises(ValueError):self.verify()
        self.node.assert_not_called()
    def test_actual_source_static_and_output_tamper_rejected(self):
        for path in (self.native/'../../src/renderer/main.tsx',self.source/'docs/design/tokens.json',self.native/'dist/extension.js',self.control/'core.mjs'):
            original=path.read_bytes();path.write_bytes(original+b'PRIVATE_CANARY')
            with self.subTest(path=path.name),self.assertRaises(ValueError):self.verify()
            path.write_bytes(original)
        self.node.assert_not_called()
    def test_descriptor_path_mode_and_staging_escape_rejected(self):
        self.descriptor.chmod(0o644)
        with self.assertRaises(ValueError):self.verify()
        self.descriptor.chmod(0o600)
        for candidate in (self.stage,self.source/'t',self.source.parent/'other'):
            with self.assertRaises((ValueError,FileNotFoundError)):S.verify_sources(self.digest,candidate)
        self.node.assert_not_called()
    def test_oversize_duplicate_and_self_consistent_untrusted_build_manifest_denied(self):
        original=self.descriptor.read_bytes()
        for raw in (b'x'*16385,original[:-2]+b',"backend":"kwin-x11"}'):
            self.descriptor.write_bytes(raw)
            with self.assertRaises(ValueError):S.verify_sources(P.digest(raw),self.source)
        self.descriptor.write_bytes(original)
        output=self.native/'dist/extension.js';output.write_bytes(b'PRIVATE_CANARY')
        altered=copy.deepcopy(self.manifest);altered['outputSha256']['extension.js']=P.digest(output.read_bytes())
        (self.native/'dist/manifest.json').write_bytes(P.encoded(altered))
        with self.assertRaises(ValueError):self.verify()
        self.node.assert_not_called()

class Clock:
    def __init__(self):self.now=0
    def monotonic(self):return self.now
    def sleep(self,seconds):self.now+=seconds

class InnerFixtures(unittest.TestCase):
    def test_external_tmpdir_or_root_denied_before_guard_or_spawn(self):
        for temp,root in ((str(S.SOURCE_ROOT/'t'),pathlib.Path('/external/root')),
                          ('/external',S.SOURCE_ROOT/'t/linuxcast-s001-matrix-abcdefgh')):
            with (mock.patch.dict(S.os.environ,{'TMPDIR':temp},clear=True),mock.patch.object(S,'private_root') as guard,
                  mock.patch.object(S.subprocess,'Popen') as spawn):
                with self.assertRaises(ValueError):S.inner(root,'a'*64)
                guard.assert_not_called();spawn.assert_not_called()
    def run_inner(self,owners=(True,),owner_cost=0,verify_cost=0,compositor_codes=(None,None),driver_code=3,driver_error=None):
        clock=Clock();calls=[];answers=iter(owners);codes=iter(compositor_codes)
        compositor=mock.Mock();compositor.poll.side_effect=lambda:next(codes,None)
        driver=mock.Mock();driver.wait.side_effect=driver_error;driver.wait.return_value=driver_code
        def popen(argv,**kwargs):calls.append((argv,kwargs));return compositor if len(calls)==1 else driver
        def owner(env,remaining):clock.now+=owner_cost;return next(answers,False)
        def verify(_):clock.now+=verify_cost
        root=S.SOURCE_ROOT/'t/linuxcast-s001-matrix-abcdefgh'
        with (mock.patch.object(S,'private_root',return_value=root),mock.patch.object(S,'private_environment',return_value={}),
             mock.patch.dict(S.os.environ,{'TMPDIR':str(S.SOURCE_ROOT/'t'),'LINUXCAST_S001_NODE':str(S.NODE),'DBUS_SESSION_BUS_ADDRESS':'unix:path=/synthetic/private/dbus-session','DISPLAY':':99','XAUTHORITY':'/synthetic/private/xauthority'},clear=True),
             mock.patch.object(S.shutil,'which',return_value='/usr/bin/kwin_x11'),mock.patch.object(S.subprocess,'Popen',side_effect=popen),
             mock.patch.object(S,'has_owner',side_effect=owner) as query,mock.patch.object(S,'verify_sources',side_effect=verify),
             mock.patch.object(S.time,'monotonic',side_effect=clock.monotonic),mock.patch.object(S.time,'sleep',side_effect=clock.sleep)):
            value=S.inner(root,'a'*64)
        return value,calls,query,driver,clock
    def test_original_transport_boundary_one_driver_no_further_query(self):
        value,calls,query,driver,clock=self.run_inner(owners=(False,False,True))
        self.assertEqual(value,P.state('completed',3,None));self.assertEqual(query.call_count,3);self.assertEqual(len(calls),2)
        self.assertEqual(calls[0][0],['/usr/bin/kwin_x11','--replace']);self.assertEqual(calls[1][0][1],str(HERE/'control.mjs'))
        driver.wait.assert_called_once_with(timeout=180);self.assertEqual(clock.now,0.4)
        self.assertNotIn('DBUS_SYSTEM_BUS_ADDRESS',calls[1][1]['env'])
    def test_45_second_budget_is_not_extended_by_owner_or_verification(self):
        for kwargs in ({'owners':(False,),'owner_cost':10},{'owner_cost':45},{'verify_cost':45}):
            value,calls,_,driver,clock=self.run_inner(**kwargs)
            self.assertEqual(value['reason'],'TARGET_COMPOSITOR_START_DEADLINE');self.assertEqual(len(calls),1)
            driver.wait.assert_not_called();self.assertGreaterEqual(clock.now,45)
    def test_dead_compositor_before_and_after_owner_is_terminal(self):
        for codes in ((-11,),(None,0)):
            value,calls,_,driver,_=self.run_inner(compositor_codes=codes)
            self.assertEqual(value['reason'],'TARGET_COMPOSITOR_START_FAILED');self.assertEqual(len(calls),1);driver.wait.assert_not_called()
    def test_driver_timeout_or_exit_zero_never_completes_no_retry(self):
        for kwargs,outcome in (({'driver_code':0},'driver-exit-rejected'),({'driver_error':subprocess.TimeoutExpired('fixed',180)},'driver-timeout')):
            value,calls,query,driver,_=self.run_inner(**kwargs)
            self.assertEqual(value['outcome'],outcome);self.assertEqual(len(calls),2);self.assertEqual(query.call_count,1)

class FakeSignals:
    def __init__(self):self.handlers={value:'original' for value in (signal.SIGTERM,signal.SIGINT,signal.SIGHUP)};self.log=[]
    def install(self,number,handler):old=self.handlers[number];self.handlers[number]=handler;self.log.append((number,handler));return old

class RunnerFixtures(unittest.TestCase):
    def harness(self,wait=3,spawn_error=None,close_error=None,source_changed=False,cancel=False):
        temporary=tempfile.TemporaryDirectory(prefix='s1-run-');self.addCleanup(temporary.cleanup)
        source=pathlib.Path(temporary.name);stage=source/'t';stage.mkdir(mode=0o700);output=source/'control';output.mkdir()
        root=stage/'linuxcast-s001-matrix-abcdefgh';events=[];signals=FakeSignals();expected={'synthetic':'safe'}
        def mkdtemp(**kwargs):self.assertEqual(kwargs,{'prefix':'linuxcast-s001-matrix-','dir':stage});root.mkdir(mode=0o700);return str(root)
        class FakeSupervisor:
            interrupted=S.Supervisor.interrupted
            def __enter__(self):events.append('ownership-enter');return self
            def __exit__(self,*args):
                events.append('ownership-close');self_test.assertEqual(signals.handlers[signal.SIGHUP],signal.SIG_IGN)
                # Repeated HUP cannot invoke cancellation while teardown runs.
                for _ in range(5):
                    if callable(signals.handlers[signal.SIGHUP]):signals.handlers[signal.SIGHUP](signal.SIGHUP,None)
                if close_error:raise close_error
                events.append('all-owned-descendants-gone')
        self_test=self
        def popen(argv,**kwargs):
            events.append('spawn');self.assertIn('ownership-enter',events)
            self.assertEqual(kwargs['cwd'],root);self.assertEqual(argv,S.command(root,'a'*64))
            if spawn_error:raise spawn_error
            P.exclusive(root/'session-state.json',P.encoded(P.state('completed',3,None)))
            P.exclusive(root/'owned-control.json',P.encoded(complete()))
            child=mock.Mock()
            if cancel:child.wait.side_effect=S.Cancelled()
            elif isinstance(wait,Exception):child.wait.side_effect=wait
            else:child.wait.return_value=wait
            return child
        real_remove=S.remove_owned
        def remove(*args):events.append('remove');return real_remove(*args)
        def post(_):events.append('source-postcheck');return {'changed':True} if source_changed else expected
        def publish(destination,report,manifest,parser):
            self.assertFalse(root.exists());self.assertEqual(destination,output/'result');events.append('publish');return 3,report
        stream=io.StringIO()
        with (mock.patch.object(S,'SOURCE_ROOT',source),mock.patch.object(S,'HERE',output),
             mock.patch.dict(S.os.environ,{'TMPDIR':str(stage)},clear=True),
             mock.patch.object(S.tempfile,'mkdtemp',side_effect=mkdtemp),mock.patch.object(S,'setup',return_value={}),
             mock.patch.object(S,'Supervisor',FakeSupervisor),mock.patch.object(S.signal,'signal',side_effect=signals.install),
             mock.patch.object(S.subprocess,'Popen',side_effect=popen),mock.patch.object(S,'package_lines',return_value=PACKAGES),
             mock.patch.object(S,'verify_sources',side_effect=post),mock.patch.object(S,'remove_owned',side_effect=remove),
             mock.patch.object(S.P,'publish',side_effect=publish),contextlib.redirect_stdout(stream)):
            code=S.run_private('a'*64,expected)
        return code,P.loads(stream.getvalue()),events,root,signals
    def test_success_selected_control_only_cleanup_before_capture_and_export(self):
        code,value,events,root,signals=self.harness()
        self.assertEqual(code,3);self.assertTrue(value['controlChecksCompleted']);self.assertEqual(value['status'],'incomplete')
        self.assertLess(events.index('all-owned-descendants-gone'),events.index('source-postcheck'))
        self.assertLess(events.index('remove'),events.index('publish'));self.assertFalse(root.exists())
        self.assertTrue(all(value=='original' for value in signals.handlers.values()))
    def test_spawn_assignment_failure_cleanup_owned_root_after_owner_exit(self):
        _,value,events,root,_=self.harness(spawn_error=OSError('PRIVATE_CANARY'))
        self.assertEqual(value,P.unavailable('CONTROL_CLEANUP_OR_REPORT_FAILED'));self.assertFalse(root.exists())
        self.assertLess(events.index('all-owned-descendants-gone'),events.index('remove'));self.assertNotIn('publish',events)
    def test_unverified_teardown_preserves_owned_root_and_never_publishes(self):
        _,value,events,root,_=self.harness(close_error=OSError('PRIVATE_CANARY'))
        self.assertEqual(value['status'],'unavailable');self.assertTrue(root.exists());self.assertNotIn('publish',events)
    def test_cancel_and_source_tamper_remove_owned_root_never_publish(self):
        for kwargs in ({'cancel':True},{'source_changed':True}):
            _,value,events,root,_=self.harness(**kwargs)
            self.assertEqual(value['status'],'unavailable');self.assertFalse(root.exists());self.assertNotIn('publish',events)
    def test_outer_timeout_or_wrong_exit_overrides_forged_complete_inner_state(self):
        for wait,outcome in ((subprocess.TimeoutExpired('fixed',240),'session-timeout'),(0,'session-exit-rejected')):
            _,value,_,root,_=self.harness(wait=wait)
            self.assertEqual(value['driver']['outcome'],outcome);self.assertFalse(value['controlChecksCompleted']);self.assertFalse(root.exists())

class EntryFixtures(unittest.TestCase):
    def test_malformed_private_arguments_never_reach_target_or_effects(self):
        for args in ([],['PRIVATE_CANARY'],['--private-guest','--authority-sha256','a'*64,'--backend','gnome-x11']):
            with (mock.patch.object(S,'target_guard') as target,mock.patch.object(S,'verify_sources') as source,
                 mock.patch.object(S,'run_private') as run,contextlib.redirect_stdout(io.StringIO()) as out):
                self.assertEqual(S.main(args),3);target.assert_not_called();source.assert_not_called();run.assert_not_called()
                self.assertNotIn('PRIVATE_CANARY',out.getvalue())
    def test_target_and_source_denial_precede_every_native_child(self):
        for boundary in ('target_guard','verify_sources'):
            with (mock.patch.object(S,'target_guard'),mock.patch.object(S,'verify_sources'),
                 mock.patch.object(S,boundary,side_effect=ValueError('PRIVATE_CANARY')),mock.patch.object(S,'run_private') as run,
                 mock.patch.object(S.subprocess,'Popen') as spawn,contextlib.redirect_stdout(io.StringIO()) as out):
                self.assertEqual(S.main(['--private-guest','--authority-sha256','a'*64]),3)
                spawn.assert_not_called();run.assert_not_called();self.assertNotIn('PRIVATE_CANARY',out.getvalue())
    def test_descriptor_rejection_after_actual_target_guard_stops_native_entry(self):
        with (mock.patch.object(S,'target_guard') as target,mock.patch.object(S,'verify_sources',side_effect=ValueError('PRIVATE_CANARY')),
              mock.patch.object(S,'setup') as setup,mock.patch.object(S,'inner') as inner,mock.patch.object(S.subprocess,'Popen') as spawn,
              contextlib.redirect_stdout(io.StringIO()) as out):
            self.assertEqual(S.main(['--private-guest','--authority-sha256','a'*64,'--inner','/private/canary']),3)
            target.assert_called_once_with();setup.assert_not_called();inner.assert_not_called();spawn.assert_not_called()
            self.assertNotIn('PRIVATE_CANARY',out.getvalue())

if __name__=='__main__':unittest.main()
