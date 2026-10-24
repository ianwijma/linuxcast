"""Real own processes/socketpairs/pidfds; libudev is fully fake. No hardware."""
import ast, array, contextlib, ctypes, hashlib, json, os, pathlib, resource, signal, socket
import subprocess, sys, tempfile, time, unittest
from unittest.mock import patch
HERE=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import guardian as G
import guardian_child as C
import guardian_family as F
import udev_metadata as U
import test_readiness as Fixtures


def private_child(case):
    libc=C.initialize()
    if case == 'actual-main-scan-error':
        fixture=Fixtures.UdevChecks()
        verified={name:(HERE/name).read_bytes() for name in C.PINS}
        # Actual child main/query/kernel binding, but source authority and all
        # libudev calls are private fixture seams. No fixed deployment is read.
        with patch.object(C,'initialize',return_value=libc), patch.object(C,'authority',return_value=verified), patch.object(C.sys,'argv',['fixed','--metadata-child']), patch.object(ctypes,'CDLL',side_effect=fixture.fake(scan_error=True)):
            os._exit(C.main())
    channel=socket.socket(fileno=3)
    if case=='timeout': time.sleep(30)
    if case=='cancel':
        for number in (signal.SIGTERM,signal.SIGHUP,signal.SIGINT): os.kill(os.getppid(),number)
        time.sleep(30)
    if case=='descendant':
        if os.fork()==0: os.setsid(); time.sleep(30); os._exit(0)
        os._exit(0)
    if case=='early-exit': os._exit(1)
    if case=='no-typed-result':
        assert C.receive(channel)=={'schemaVersion':1,'operation':'START'}
        os._exit(3)
    fixture=Fixtures.UdevChecks()
    with patch.object(U.C,'CDLL',side_effect=fixture.fake()):
        value=C.query(channel,libc,U.UdevMetadata())
    assert fixture.calls==['device-unref','enumeration-unref','context-unref']
    if case=='bad-bool': value['schemaVersion']=True
    raw=json.dumps(value).encode() if case!='oversize' else b'x'*5000
    if case=='rights':
        read,write=os.pipe()
        try: channel.sendmsg([raw],[(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',[read]))])
        finally: os.close(read); os.close(write)
    else: channel.send(raw)
    if case=='second': channel.send(raw)
    if case=='zero-second': channel.send(b'')
    channel.close(); os._exit(0)


def parent_case(case):
    C.initialize()
    if case=='post-spawn-fault':
        actual=F.Family.adopt; count=[0]
        def fail_once(owner):
            count[0]+=1
            if count[0]==1: raise OSError('PRIVATE_CANARY')
            actual(owner)
        F.Family.adopt=fail_once
    if case=='late-cancel':
        stop=F.Family.stop
        def cancel_after_stop(owner,deadline):
            value=stop(owner,deadline); os.kill(os.getpid(),signal.SIGTERM); return value
        F.Family.stop=cancel_after_stop
    if case=='close-fault':
        close=socket.socket.close; triggered=[]
        def fail_close(channel):
            number=channel.fileno(); close(channel)
            if number==3 and not triggered: triggered.append(True); raise OSError('PRIVATE_CANARY')
        socket.socket.close=fail_close
    argv=['/usr/bin/python3','-I','-S','-B',str(HERE/'test_guardian.py'),'--private-child','timeout' if case=='post-spawn-fault' else 'healthy' if case in ('late-cancel','close-fault') else case]
    start=time.monotonic(); value=G._observe(C,F,argv,start)
    assert not F.children() and time.monotonic()-start<5
    print(json.dumps({'result':value,'ownedChildrenAbsent':True,'elapsedMs':round((time.monotonic()-start)*1000)}))


def binding_checks():
    libc=C.initialize(); left,right=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
    try:
        for wrong_kind in (False,True):
            with patch.object(C.socket,'SOCK_SEQPACKET',socket.SOCK_STREAM if wrong_kind else socket.SOCK_SEQPACKET):
                try: C.Binding(right,libc)
                except C.Rejected: pass
                else: raise AssertionError('self creator/wrong kind accepted')
    finally: left.close(); right.close()
    print('{"wrongCreatorAndKindDenied":true}')


class FixturePostForkFault(Exception): pass


def parent_death(fault=False):
    C.initialize()
    # Dedicated fixture has no competing reaper. Family retains actual pidfds
    # until its own reap, and adopts the manufactured orphan before inspecting it.
    family=F.Family(); start=time.monotonic(); deadline=start+5
    tunnel,carrier=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
    retained=None; reaped=set(); numeric=[]; actual_kill=os.kill; failure_seen=False
    def checked_kill(pid,number):
        assert pid not in reaped, 'REAPED_PID_SIGNAL_FORBIDDEN'
        numeric.append((pid,number)); return actual_kill(pid,number)
    def creator(_parent):
        assert F.libc.prctl(1,signal.SIGKILL,0,0,0)==0 and os.getppid()==_parent
        tunnel.close(); left,right=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
        ready,write=os.pipe(); child=os.fork()
        if child==0:
            os.close(ready); left.close(); carrier.close()
            libc=ctypes.CDLL(None,use_errno=True)
            binding=C.Binding(right,libc); assert binding.alive()
            os.write(write,b'R'); os.close(write); time.sleep(30); os._exit(88)
        right.close(); os.close(write); assert os.read(ready,1)==b'R'; os.close(ready)
        carrier.sendmsg([str(child).encode()],[(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',[left.fileno()]))])
        left.close(); carrier.close()
    with F.Cancellation()as guard, patch.object(os,'kill',checked_kill):
        try:
            parent=family.fork(creator,guard)
            if fault: raise FixturePostForkFault()
            carrier.close(); tunnel.settimeout(max(.001,deadline-time.monotonic()))
            raw,ancillary,_,_=tunnel.recvmsg(64,socket.CMSG_SPACE(4)); child=int(raw)
            kept=array.array('i'); kept.frombytes(ancillary[0][2]); retained=socket.socket(fileno=kept[0])
            while family.exited(parent)is None and time.monotonic()<deadline: time.sleep(.005)
            assert family.exited(parent)==0
            # WNOWAIT above leaves the creator unreaped. The killed manufactured
            # child is now ours by actual subreaper adoption, never a claimed PID.
            family.adopt(); assert child in F.children() and child in family.handles
            while family.exited(child)is None and time.monotonic()<deadline: time.sleep(.005)
            assert family.exited(child)==-signal.SIGKILL
            before=set(family.handles); family.reap(); reaped.update(before-set(family.handles))
            assert parent in reaped and child in reaped
            # Deterministic PID-reuse simulation: the same integers might now
            # denote unrelated processes. Replace the actual sender with a spy,
            # so a broken guard can fail this regression without harming one.
            sender=actual_kill; misdirected=[]
            actual_kill=lambda *args:misdirected.append(args)
            try:
                for pid in reaped:
                    rejected=False
                    try: checked_kill(pid,signal.SIGKILL)
                    except AssertionError: rejected=True
                    assert rejected
                assert not misdirected
            finally: actual_kill=sender
        except FixturePostForkFault:
            assert fault; failure_seen=True
        finally:
            guard.cleanup()
            close_ok=True
            for channel in (tunnel,carrier,retained):
                if channel is not None:
                    try: channel.close()
                    except BaseException: close_ok=False
            # Stop operates only on still-owned handles/children. In particular,
            # no unconditional numeric signal is sent after a successful reap.
            stopped=all(family.stop(deadline).values())
            assert stopped and close_ok
        assert not numeric and not F.children() and failure_seen is fault
    print(json.dumps({'parentDeathDespiteRetainedSocket':not fault,
                      'noNumericSignalsAfterReap':True,
                      'simulatedReusedPidSignalRejected':not fault,
                      'postForkFailureOwnedCleanup':fault}))


def startup_case(case):
    if case=='blocked': signal.pthread_sigmask(signal.SIG_BLOCK,{signal.SIGALRM})
    if case=='autoreap': signal.signal(signal.SIGCHLD,signal.SIG_IGN)
    if case=='unknown-env': os.environ['PRIVATE_ADDRESS']='PRIVATE_CANARY'
    if case in ('blocked','autoreap','unknown-env'):
        with patch.object(C.ctypes,'CDLL',side_effect=AssertionError('NO_LIBRARY')):
            try: C.initialize()
            except C.Rejected: print('{"startupRejectedBeforeLibrary":true}'); return
        raise AssertionError('startup accepted')
    libc=C.initialize(); assert resource.getrlimit(resource.RLIMIT_CORE)==(0,0) and libc.prctl(3,0,0,0,0)==0
    print('{"actualNoCoreAndDumpReadbacks":true}')


def binding_life_child():
    libc=C.initialize(); channel=socket.socket(fileno=3)
    binding=C.Binding(channel,libc)
    assert C.receive(channel)=={'schemaVersion':1,'operation':'START'} and binding.alive()
    channel.send(b'READY')
    deadline=time.monotonic()+2
    while binding.alive() and time.monotonic()<deadline: time.sleep(.005)
    assert not binding.alive()
    left,right=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
    try:
        binding.channel=right
        assert not binding.alive()  # Replacement cannot revive the retained binding.
    finally:
        binding.close(); left.close(); right.close(); channel.close()
    os._exit(0)


def binding_life_parent():
    C.initialize(); start=time.monotonic(); family=F.Family()
    left,right=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
    with F.Cancellation()as guard:
        try:
            assert (left.fileno(),right.fileno())==(3,4)
            child=family.spawn(['/usr/bin/python3','-I','-S','-B',str(__file__),'--private-binding-life-child'],guard,channel_fd=4,pass_fds=(3,4),stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            right.close(); left.send(b'{"schemaVersion":1,"operation":"START"}')
            left.settimeout(2); assert left.recv(64)==b'READY'; left.close()
            while family.exited(child.pid)is None and time.monotonic()<start+3: time.sleep(.005)
            assert family.exited(child.pid)==0
        finally:
            guard.cleanup(); left.close(); right.close()
            assert all(family.stop(start+5).values())
    print('{"disconnectTerminalDespiteNewSameUidSocket":true}')


class GuardianChecks(unittest.TestCase):
    def run_private(self,category,case=None):
        argv=['/usr/bin/python3','-I','-S','-B',str(__file__),category]+([case]if case else [])
        done=subprocess.run(argv,env=C.ENV,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=8)
        self.assertEqual(done.returncode,0,done.stderr.decode(errors='replace')); self.assertEqual(done.stderr,b'')
        self.assertNotIn(b'PRIVATE_CANARY',done.stdout); return json.loads(done.stdout)
    def test_real_child_fake_udev_and_kernel_parent(self):
        v=self.run_private('--private-parent','healthy'); self.assertEqual(v['result']['counts'],{'usb':1,'bluetooth':0,'i8042':0})
        self.assertEqual(v['result']['reason'],'AUTHENTICATED_LIVE_COMPANION_UNAVAILABLE')
        self.assertTrue(v['ownedChildrenAbsent']and all(v['result'][k]is False for k in G.FALSE_FIELDS))
    def test_independent_stalled_child_deadline(self):
        v=self.run_private('--private-parent','timeout'); self.assertEqual(v['result']['reason'],'DEADLINE')
        self.assertEqual(v['result']['diagnosticStage'],'PARENT_QUERY_DEADLINE')
        self.assertGreaterEqual(v['elapsedMs'],1900); self.assertLess(v['elapsedMs'],5000)
    def test_extra_empty_packets_bool_rights_oversize_and_exit(self):
        for case in ('second','zero-second','bad-bool','rights','oversize','early-exit'):
            with self.subTest(case=case):
                v=self.run_private('--private-parent',case); self.assertEqual(v['result']['outcome'],'UNAVAILABLE'); self.assertTrue(v['ownedChildrenAbsent'])
    def test_post_spawn_acquisition_fault_cleanup(self):
        v=self.run_private('--private-parent','post-spawn-fault'); self.assertEqual(v['result']['outcome'],'UNAVAILABLE'); self.assertTrue(v['ownedChildrenAbsent'])
    def test_cancellation_and_exited_leader_escaped_descendant(self):
        for case in ('cancel','descendant'):
            with self.subTest(case=case):
                v=self.run_private('--private-parent',case); self.assertEqual(v['result']['outcome'],'UNAVAILABLE'); self.assertTrue(v['ownedChildrenAbsent'])
    def test_cleanup_close_fault_and_late_cancellation_cannot_report_observed(self):
        for case,reason in (('close-fault','CLEANUP_UNVERIFIED'),('late-cancel','METADATA_UNAVAILABLE')):
            with self.subTest(case=case):
                v=self.run_private('--private-parent',case)
                self.assertEqual(v['result']['outcome'],'UNAVAILABLE'); self.assertEqual(v['result']['reason'],reason)
                self.assertEqual(v['result']['diagnosticStage'],'PARENT_CLEANUP' if case=='close-fault' else 'PARENT_CANCELLED')
                self.assertTrue(v['ownedChildrenAbsent'])
    def test_wrong_actual_creator_and_socket_kind(self): self.assertTrue(self.run_private('--private-binding')['wrongCreatorAndKindDenied'])
    def test_actual_parent_death_retained_socket(self):
        value=self.run_private('--private-death')
        self.assertTrue(value['parentDeathDespiteRetainedSocket'] and value['noNumericSignalsAfterReap'] and value['simulatedReusedPidSignalRejected'])
    def test_parent_death_postfork_exception_has_bounded_owned_cleanup(self):
        value=self.run_private('--private-death-fault')
        self.assertTrue(value['postForkFailureOwnedCleanup'] and value['noNumericSignalsAfterReap'])
    def test_real_startup_environment_mask_and_no_core(self):
        for case in ('normal','blocked','autoreap','unknown-env'):
            with self.subTest(case=case): self.run_private('--private-startup',case)
    def test_real_source_bytes_symlink_and_ancestor_swap(self):
        for module in (C,G):
            with tempfile.TemporaryDirectory(prefix='linuxcast-guardian-fixture-')as raw:
                root=pathlib.Path(raw); root.chmod(0o700); p=root/'public.py'; p.write_bytes(b'public fixed source'); p.chmod(0o600)
                pins={'public.py':hashlib.sha256(p.read_bytes()).hexdigest()}; self.assertEqual(module.authority(root,pins),{'public.py':p.read_bytes()})
                p.unlink(); p.symlink_to('/PRIVATE_CANARY')
                with self.assertRaises((OSError,ValueError,C.Rejected)): module.authority(root,pins)
                p.unlink(); p.write_bytes(b'public fixed source'); p.chmod(0o600); actual=module.os.open; switched=[]
                def swap(name,flags,*args,**kwargs):
                    if name=='public.py'and not switched:
                        switched.append(True); root.rename(root.with_name(root.name+'-saved')); root.symlink_to('/PRIVATE_CANARY')
                    return actual(name,flags,*args,**kwargs)
                try:
                    with patch.object(module.os,'open',swap):
                        with self.assertRaises((OSError,ValueError,C.Rejected)): module.authority(root,pins)
                finally: root.unlink(); root.with_name(root.name+'-saved').rename(root)
                self.assertTrue(switched)
    def test_strict_schema_and_received_rights_closed(self):
        for raw in (b'{"a":1,"a":2}',b'{"a":NaN}',b'x'*4097):
            with self.assertRaises((C.Rejected,ValueError)): C.strict(raw)
        v=C.denial('METADATA_UNAVAILABLE'); G.validate(C,v)
        for change in ({'schemaVersion':True},{'canCapture':0},{'private':'PRIVATE_CANARY'}):
            with self.assertRaises(C.Rejected): G.validate(C,{**v,**change})
        left,right=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET); read,write=os.pipe()
        try:
            right.sendmsg([b'{}'],[(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',[read]))]); before=set(os.listdir('/proc/self/fd'))
            with self.assertRaises(C.Rejected): C.receive(left)
            self.assertEqual(set(os.listdir('/proc/self/fd')),before)
        finally: left.close(); right.close(); os.close(read); os.close(write)
    def test_disconnect_terminal_despite_new_same_uid_socket(self):
        self.assertTrue(self.run_private('--private-binding-life-parent')['disconnectTerminalDespiteNewSameUidSocket'])
    def test_fixed_verified_script_survives_path_mutation(self):
        with tempfile.TemporaryDirectory(prefix='linuxcast-guardian-exec-fixture-')as raw:
            root=pathlib.Path(raw); root.chmod(0o700); p=root/'fixed.py'
            data=b'print("{\\"fixedVerifiedBytes\\":true}")'
            p.write_bytes(data); p.chmod(0o600)
            verified=C.authority(root,{'fixed.py':hashlib.sha256(data).hexdigest()})['fixed.py']
            p.write_text('raise RuntimeError("PRIVATE_CANARY")')
            done=subprocess.run(G.child_command(verified),env=C.ENV,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=2)
            self.assertEqual(done.returncode,0,done.stderr); self.assertEqual(json.loads(done.stdout),{'fixedVerifiedBytes':True})
    def test_expired_startup_never_constructs_family_or_spawns(self):
        with patch.object(F,'Family',side_effect=AssertionError('NO_SPAWN')):
            self.assertEqual(G._observe(C,F,[],time.monotonic()-3)['reason'],'DEADLINE')
    def test_fixed_public_cli_rejects_before_bootstrap(self):
        done=subprocess.run(['/usr/bin/python3','-I','-S','-B',str(HERE/'guardian.py'),'--private-claimed-source'],env=C.ENV,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=2)
        self.assertEqual(done.returncode,3); self.assertEqual(done.stderr,b'')
        self.assertEqual(json.loads(done.stdout),C.denial('UNSUPPORTED', 'PARENT_BOOTSTRAP'))
        for n,h in G.PINS.items(): self.assertEqual(hashlib.sha256((HERE/n).read_bytes()).hexdigest(),h)
    def test_parent_validation_failure_never_publishes_unvalidated_value(self):
        captured=[]
        with patch.object(G.sys,'argv',['fixed','--observe-metadata']), patch.object(G,'bootstrap',return_value=(C,F,b'')), patch.object(G,'_observe',return_value={'private':'PRIVATE_CANARY'}), patch.object(G.os,'set_blocking'), patch.object(G.os,'write',side_effect=lambda fd,raw:captured.append(raw) or len(raw)):
            self.assertEqual(G.main(),3)
        self.assertEqual(json.loads(captured[0]),C.denial('UNSUPPORTED', 'PARENT_BOOTSTRAP'))
        self.assertNotIn(b'PRIVATE_CANARY',captured[0])
    def test_authority_shared_ast_and_private_fixture_separation(self):
        find=lambda tree,name:next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name==name)
        self.assertEqual(ast.dump(find(ast.parse((HERE/'guardian.py').read_text()),'authority')),ast.dump(find(ast.parse((HERE/'guardian_child.py').read_text()),'authority')))
        source=(HERE/'guardian_child.py').read_text(); self.assertNotIn('test_guardian',source); self.assertNotIn('test_readiness',source); self.assertIn('U.UdevMetadata(stage=stage.enter)',source)
        self.assertIn('470c0bee8a6771f8f1634f34308f5ce9e640c2a4a64b83b5b5352ee77edd30c5',(HERE/'guardian_family.py').read_text())

    def test_scan_tracker_forwards_one_exact_object_or_exception(self):
        stage=C.Stage(); value=object(); source=type('Source',(),{})(); calls=[]
        source.scan=lambda:calls.append(True) or value
        with patch.object(C.os,'open',side_effect=AssertionError('NO_EXTRA_FS')):
            self.assertIs(C.ForwardScan(source,stage).scan(),value)
        self.assertEqual(calls,[True]); self.assertEqual(stage.value,'CHILD_FILTER_OR_VALIDATION')
        error=RuntimeError('PRIVATE_ADAPTER_CANARY')
        def failed(): calls.append(True); raise error
        source.scan=failed
        with self.assertRaises(RuntimeError) as caught:C.ForwardScan(source,stage).scan()
        self.assertIs(caught.exception,error); self.assertEqual(calls,[True,True]); self.assertEqual(stage.value,'CHILD_METADATA_ADAPTER')

    def test_actual_child_main_fake_adapter_reports_attempted_stage_only(self):
        value=self.run_private('--private-parent','actual-main-scan-error')['result']
        self.assertEqual(value,C.denial('METADATA_UNAVAILABLE','CHILD_ADAPTER_SCAN'))

    def test_no_typed_result_after_start_is_explicitly_ambiguous(self):
        value=self.run_private('--private-parent','no-typed-result')['result']
        self.assertEqual(value,C.denial('METADATA_UNAVAILABLE','CHILD_NO_TYPED_RESULT'))

    def test_query_stage_boundaries_preserve_no_additional_scan(self):
        import readiness as R
        class Binding:
            def __init__(self,*_):self.uid=os.getuid(); self.checks=0
            def alive(self):self.checks+=1; return self.checks<4 or case!='recheck'
            def close(self):closed.append(True)
        class Source:
            def scan(self):
                calls.append(True)
                if case=='adapter':raise RuntimeError('PRIVATE_ADAPTER_CANARY')
                return [Fixtures.row()] if case=='filter' else (Fixtures.row(),)
        expected={'peer':'CHILD_PEER_BINDING','start':'CHILD_START','catalog':'CHILD_CATALOG','adapter':'CHILD_METADATA_ADAPTER','filter':'CHILD_FILTER_OR_VALIDATION','recheck':'CHILD_PARENT_RECHECK','cleanup':'CHILD_CLEANUP'}
        for case,wanted in expected.items():
            stage=C.Stage(); calls=[]; closed=[]
            with self.subTest(case=case), patch.object(C,'Binding',side_effect=RuntimeError('PRIVATE_PEER') if case=='peer' else Binding), patch.object(C,'receive',return_value={'schemaVersion':1,'operation':'BAD' if case=='start' else 'START'}):
                with patch.object(R,'Catalog',side_effect=RuntimeError('PRIVATE_CATALOG')) if case=='catalog' else contextlib.nullcontext():
                    with patch.object(R.Catalog,'cancel',side_effect=RuntimeError('PRIVATE_CLEANUP')) if case=='cleanup' else contextlib.nullcontext():
                        with self.assertRaises(Exception):C.query(object(),object(),Source(),stage)
            self.assertEqual(stage.value,wanted)
            self.assertEqual(len(calls),0 if case in('peer','start','catalog') else 1)
            if case not in('peer','cleanup'):self.assertEqual(closed,[True])

    def test_parent_stage_boundaries_use_no_new_message_or_operation(self):
        class Channel:
            def fileno(self):return 3 if self is left else 4
            def setsockopt(self,*_):pass
            def setblocking(self,*_):pass
            def send(self,*_):raise OSError('PRIVATE_REPLY_CANARY')
            def close(self):pass
        class Owner:
            def spawn(self,*args,**kwargs):
                if case=='spawn':raise RuntimeError('PRIVATE_SPAWN_CANARY')
                return type('Child',(),{'pid':123})()
            def stop(self,*_):return {'owned':True}
        for case,wanted in(('channel','PARENT_CHANNEL'),('spawn','PARENT_SPAWN'),('reply','PARENT_REPLY')):
            left,right=Channel(),Channel()
            with self.subTest(case=case),patch.object(F,'Family',side_effect=RuntimeError('PRIVATE_CHANNEL_CANARY') if case=='channel' else Owner),patch.object(socket,'socketpair',return_value=(left,right)):
                value=G._observe(C,F,[],time.monotonic())
            self.assertEqual(value,C.denial('METADATA_UNAVAILABLE',wanted))

    def test_stage_schema_rejects_old_private_unknown_wrong_origin_and_relation(self):
        value=C.denial('METADATA_UNAVAILABLE','CHILD_PEER_BINDING'); G.validate(C,value,child=True)
        for change in({'schemaVersion':1},{'schemaVersion':2},{'schemaVersion':3},{'diagnosticStage':'PRIVATE_PATH_CANARY'},{'diagnosticStage':True},{'diagnosticStage':'PARENT_CHANNEL'},{'diagnosticStage':'CHILD_NO_TYPED_RESULT'},{'reason':'DEADLINE'},{'private':{'value':'PRIVATE_CANARY'}}):
            with self.subTest(change=change),self.assertRaises(C.Rejected):G.validate(C,{**value,**change},child=True)
        observed=C.counts_result([])
        with self.assertRaises(C.Rejected):G.validate(C,{**observed,'diagnosticStage':'CHILD_METADATA_ADAPTER'})
        with self.assertRaises(C.Rejected):C.Stage().enter('PRIVATE_CANARY')


if __name__=='__main__':
    if sys.argv[1:2]==['--private-child']: private_child(sys.argv[2])
    elif sys.argv[1:2]==['--private-parent']: parent_case(sys.argv[2])
    elif sys.argv[1:]==['--private-binding-life-child']: binding_life_child()
    elif sys.argv[1:]==['--private-binding-life-parent']: binding_life_parent()
    elif sys.argv[1:]==['--private-binding']: binding_checks()
    elif sys.argv[1:]==['--private-death-fault']: parent_death(True)
    elif sys.argv[1:]==['--private-death']: parent_death()
    elif sys.argv[1:2]==['--private-startup']: startup_case(sys.argv[2])
    else: unittest.main(verbosity=2)
