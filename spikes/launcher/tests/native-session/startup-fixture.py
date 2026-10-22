"""No display/Gio bus: deterministic startup parser, deadline and entry ordering."""
import copy
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import types
from unittest.mock import patch
import observer_startup as startup
import private
from supervision import Supervisor

case=sys.argv[1]

class Variant:
    def __init__(self,signature,value): self.signature=signature;self.value=value
    def get_type_string(self): return self.signature
    def get_child_value(self,index): assert index==0;return self.value
    def n_children(self): return len(self.value)
    def lookup_value(self,key,_type): assert key in ('state','enabled');return self.value.get(key)
    def get_double(self): return self.value
    def get_boolean(self): return self.value

def reply(state=1.0,enabled=True,state_type='d',enabled_type='b'):
    return Variant('(a{sv})',Variant('a{sv}',{'state':Variant(state_type,state),'enabled':Variant(enabled_type,enabled),'error':Variant('s','synthetic-private-canary')}))

if case=='parser':
    output=startup.FixedOutput()
    output.feed(b'synthetic-private-canary\nLINUXCAST_S001_OBSER')
    output.feed(b'VER:MODULE_ENTERED\nLINUXCAST_S001_OBSERVER:MODULE_ENTERED\n')
    output.feed(b'LINUXCAST_S001_OBSERVER:ENABLE_ENTERED private-canary\n')
    output.feed(b'x'*4096+b'LINUXCAST_S001_OBSERVER:POLL_INSTALLED\n')
    output.feed(b'LINUXCAST_S001_OBSERVER:FIRST_POLL_TICK\n')
    for serial in range(1,25):output.feed(b'LINUXCAST_S001_OBSERVER:REQUEST_VALIDATED:'+str(serial).encode()+b'\n')
    for serial in ('0','0001','1001','-1','1.0','1:private-canary'):
        output.feed(b'LINUXCAST_S001_OBSERVER:REPLY_PUBLISHED:'+serial.encode()+b'\n')
    value=output.snapshot();assert value['checkpoints']==['MODULE_ENTERED','FIRST_POLL_TICK']
    assert len(value['requests'])==16 and value['requests'][0]['request']==9 and value['requests'][-1]['request']==24
    assert 'canary' not in json.dumps(value) and len(output.line)<=256
elif case=='prevalidation-parser':
    output=startup.FixedOutput()
    for marker in startup.CHECKPOINTS:
        for _ in range(2):output.feed(startup.PREFIX+marker.encode()+b'\n')
    for marker in startup.CHECKPOINTS[7:]:output.feed(startup.PREFIX+marker.encode()+b':synthetic-private-canary\n')
    value=output.snapshot();assert value['checkpoints']==list(startup.CHECKPOINTS) and len(value['checkpoints'])==15
    assert len(value['checkpoints'][7:])==8 and 'synthetic-private' not in json.dumps(value)
    invalid=copy.deepcopy(value);invalid['checkpoints'].append('READ_FAILED')
    try:startup.snapshot(invalid)
    except ValueError:pass
    else:raise AssertionError('CHECKPOINT_CAP_ACCEPTED_DUPLICATE')
elif case=='drain':
    # Harmless own child writes more than pipe capacity; no raw file survives.
    process=subprocess.Popen(['/usr/bin/python3','-c',"import os;os.write(1,b'private-canary'*50000+b'\\n');os.write(1,b'LINUXCAST_S001_OBSERVER:POLL_INSTALLED\\n')"],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,bufsize=0)
    drain=startup.ShellDrain(process.stdout)
    try: assert process.wait(timeout=3)==0
    finally: drain.close()
    assert drain.snapshot()['checkpoints']==['POLL_INSTALLED']
    assert not drain.thread.is_alive() and not drain.line and 'canary' not in json.dumps(drain.snapshot())
elif case=='typed-info':
    for state in startup.STATES:assert startup.extract_info(reply(float(state)))=={'status':'INFO_AVAILABLE','state':state,'enabled':True}
    assert startup.extract_info(reply(1.0,False))=={'status':'INFO_AVAILABLE','state':1,'enabled':False}
    for candidate in (reply('1'),reply(float('nan')),reply(float('inf')),reply(1.5),reply(0),reply(9),reply(1.0,state_type='s'),reply(1.0,enabled_type='s'),reply(1.0,enabled='true'),Variant('(s)',None)):
        assert startup.extract_info(candidate)=={'status':'INFO_UNAVAILABLE'}
    assert startup.extract_info(Variant('(a{sv})',Variant('a{sv}',{})))=={'status':'NOT_FOUND'}
    assert startup.extract_info(Variant('(a{sv})',Variant('a{sv}',{'error':Variant('s','private-canary')})))=={'status':'INFO_UNAVAILABLE'}
elif case=='schema':
    base={'latest':{'checkpoints':['PRIVATE_CONTEXT_REJECTED'],'requests':[],'extensionInfo':{'status':'INFO_AVAILABLE','state':1,'enabled':True}}}
    assert startup.diagnostic(base)==base  # ACTIVE does not imply polling/guard success.
    for mutate in (lambda v:v.update(private='canary'),lambda v:v['latest'].update(private='canary'),lambda v:v['latest']['checkpoints'].append('canary'),lambda v:v['latest'].update(requests=[{'event':'REQUEST_VALIDATED','request':1,'private':'canary'}]),lambda v:v['latest']['extensionInfo'].update(error='canary'),lambda v:v['latest']['extensionInfo'].update(state=True),lambda v:v['latest'].update(requests=[{'event':'canary','request':1}]),lambda v:v['latest'].update(requests=[{'event':'REQUEST_VALIDATED','request':True}]*17)):
        value=copy.deepcopy(base);mutate(value)
        try:startup.diagnostic(value)
        except ValueError:pass
        else:raise AssertionError('PRIVATE_STARTUP_ACCEPTED')
elif case=='lifecycle-schema':
    drain={'eofObserved':False,'readerAlive':True,'stopRequested':False}
    running={'compositor':{'state':'running','exitCode':None},'drain':drain}
    exited={'compositor':{'state':'exited','exitCode':-15},'drain':{'eofObserved':True,'readerAlive':False,'stopRequested':True}}
    base={'latest':{'checkpoints':[],'requests':[],'extensionInfo':{'status':'INFO_UNAVAILABLE'}},
          'lifecycle':{'beforeChecker':running,'afterChecker':exited,'finally':exited}}
    assert startup.diagnostic(base)==base
    for code in (0,255,-64):
        value=copy.deepcopy(base);value['lifecycle']['finally']['compositor']['exitCode']=code
        assert startup.diagnostic(value)==value
    for mutate in (lambda v:v['lifecycle'].update(private='synthetic-private-canary'),
                   lambda v:v['lifecycle'].pop('finally'),
                   lambda v:v['lifecycle']['finally'].update(private='synthetic-private-canary'),
                   lambda v:v['lifecycle']['finally']['compositor'].update(error='synthetic-private-canary'),
                   lambda v:v['lifecycle']['finally']['compositor'].update(state='crashed'),
                   lambda v:v['lifecycle']['beforeChecker']['compositor'].update(exitCode=0),
                   lambda v:v['lifecycle']['finally']['drain'].update(readerAlive='synthetic-private-canary'),
                   lambda v:v['lifecycle']['finally']['drain'].update(private='synthetic-private-canary')):
        value=copy.deepcopy(base);mutate(value)
        try:startup.diagnostic(value)
        except ValueError:pass
        else:raise AssertionError('PRIVATE_LIFECYCLE_ACCEPTED')
    for code in (None,True,False,float('nan'),float('inf'),-65,256,1.5,'synthetic-private-canary'):
        value=copy.deepcopy(base);value['lifecycle']['finally']['compositor']['exitCode']=code
        try:startup.diagnostic(value)
        except ValueError:pass
        else:raise AssertionError('INVALID_EXIT_CODE_ACCEPTED')
elif case=='lifecycle-eof-running':
    # A process may close stdout while it remains alive. No display/bus is used.
    drain=None;process=None
    try:
        with Supervisor(grace=0.1):
            process=subprocess.Popen(['/usr/bin/python3','-c','import os,sys; os.close(1); os.close(2); sys.stdin.buffer.read(1)'],
                                     stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,bufsize=0,start_new_session=True)
            drain=startup.ShellDrain(process.stdout);drain.thread.join(timeout=2)
            value=startup.runtime_sample(process,drain)
            assert value=={'compositor':{'state':'running','exitCode':None},'drain':{'eofObserved':True,'readerAlive':False,'stopRequested':False}}
            process.stdin.write(b'x');process.stdin.close();assert process.wait(timeout=2)==0
    finally:
        if drain:drain.close()
        if process:process.poll()
    assert Supervisor.descendants()=={} and drain.health()['stopRequested'] is True
elif case=='lifecycle-exited-pipe-held':
    # The own process can exit while its detached child retains the output pipe.
    # The existing supervisor must remove that child before the fixture returns.
    drain=None;process=None
    try:
        with Supervisor(grace=0.1):
            held='import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(30)'
            code='import subprocess,sys; subprocess.Popen([sys.executable,"-c",'+repr(held)+'],start_new_session=True); sys.exit(7)'
            process=subprocess.Popen(['/usr/bin/python3','-c',code],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,bufsize=0,start_new_session=True)
            drain=startup.ShellDrain(process.stdout);assert process.wait(timeout=2)==7
            value=startup.runtime_sample(process,drain)
            assert value=={'compositor':{'state':'exited','exitCode':7},'drain':{'eofObserved':False,'readerAlive':True,'stopRequested':False}}
    finally:
        if drain:drain.close()
        if process:process.poll()
    assert Supervisor.descendants()=={} and not drain.thread.is_alive()
elif case=='query-deadline':
    calls=[];now=[10.0];env={'public-private-env':'fixed'}
    def run(command,**kwargs):
        calls.append(command);assert command[-1]=='--extension-info' and kwargs['env'] is env and 0<kwargs['timeout']<=0.9
        return types.SimpleNamespace(returncode=0,stdout=json.dumps({'status':'INFO_AVAILABLE','state':8,'enabled':True}))
    assert startup.query_once(env,55,run,lambda:now[0])['state']==8 and len(calls)==1
    calls.clear();assert startup.query_once(env,10,run,lambda:10)=={'status':'INFO_UNAVAILABLE'} and not calls
    def timeout(command,**kwargs):
        calls.append(command);assert 0<kwargs['timeout']<0.25
        raise subprocess.TimeoutExpired(command,kwargs['timeout'])
    assert startup.query_once(env,10.25,timeout,lambda:10)=={'status':'INFO_UNAVAILABLE'} and len(calls)==1
    calls.clear()
    def private_reply(command,**kwargs):calls.append(command);return types.SimpleNamespace(returncode=0,stdout='{"status":"INFO_UNAVAILABLE","private":"synthetic-private-canary"}')
    assert startup.query_once(env,55,private_reply,lambda:10)=={'status':'INFO_UNAVAILABLE'} and len(calls)==1
    calls.clear()
    def late(command,**kwargs):calls.append(command);now[0]=11.1;return types.SimpleNamespace(returncode=0,stdout='{"status":"NOT_FOUND"}')
    assert startup.query_once(env,55,late,lambda:now[0])=={'status':'INFO_UNAVAILABLE'} and len(calls)==1
elif case=='gio-call':
    calls=[]
    class Connection:
        def call_sync(self,*args):
            calls.append(args);assert args[:4]==('org.gnome.Shell','/org/gnome/Shell','org.gnome.Shell.Extensions','GetExtensionInfo')
            assert args[4]==('(s)',(startup.UUID,)) and args[5]=='(a{sv})' and args[7]==800
            return reply()
    repository=types.ModuleType('gi.repository');repository.Gio=types.SimpleNamespace(bus_get_sync=lambda *_args:Connection(),BusType=types.SimpleNamespace(SESSION=0),DBusCallFlags=types.SimpleNamespace(NONE=0))
    repository.GLib=types.SimpleNamespace(Variant=lambda signature,value:(signature,value),VariantType=types.SimpleNamespace(new=lambda value:value))
    gi=types.ModuleType('gi');gi.require_version=lambda *_args:None
    with patch.dict(sys.modules,{'gi':gi,'gi.repository':repository}),patch.object(private,'target_guard'),patch.object(private,'private_root'):
        assert startup.gio_info()['state']==1 and len(calls)==1
    with patch.object(private,'target_guard',side_effect=ValueError('private-canary')),patch.object(private,'private_root',side_effect=AssertionError('GUARD_ORDER')):
        try:startup.gio_info()
        except ValueError:pass
        else:raise AssertionError('QUERY_BEFORE_TARGET_GUARD')
    assert len(calls)==1
    with patch.object(private,'target_guard'),patch.object(private,'private_root',side_effect=ValueError('private-canary')):
        try:startup.gio_info()
        except ValueError:pass
        else:raise AssertionError('QUERY_BEFORE_PRIVATE_GUARD')
    assert len(calls)==1
elif case in ('runner-order','runner-deadline'):
    spec=importlib.util.spec_from_file_location('startup_runner',pathlib.Path(__file__).with_name('run-session.py'))
    runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
    events=[];now=[100]
    with tempfile.TemporaryDirectory(prefix='linuxcast-s001-matrix-startup-') as temporary:
        root=pathlib.Path(temporary)
        class Monitor(startup.FixedOutput):
            def __init__(self,_stream):super().__init__();self.closed=False;self.feed(startup.PREFIX+b'MODULE_ENTERED\n')
            def close(self):self.closed=True;events.append('drain-close')
            def health(self):return {'eofObserved':False,'readerAlive':not self.closed,'stopRequested':self.closed}
        class Child:
            stdout=None
            def poll(self):return None
            def wait(self,timeout):assert timeout==180;events.append('driver-wait');return 3
        def spawn(command,**kwargs):
            if command[0]=='/fixed-shell':events.append('shell')
            else:
                events.append('checker');assert (root/'observer-startup.json').exists()
            return Child()
        def query(env,deadline):
            events.append('one-info');assert deadline==145
            if case=='runner-deadline':now[0]=145
            return {'status':'NOT_FOUND'}
        with patch.object(runner,'private_root',return_value=root),patch.dict(os.environ,{'DBUS_SESSION_BUS_ADDRESS':'private-fixture','LINUXCAST_S001_NODE':'/fixed-node','DISPLAY':':99','XAUTHORITY':str(root/'xauthority')},clear=True),patch.object(runner.shutil,'which',return_value='/fixed-shell'),patch.object(runner,'bounded',return_value=types.SimpleNamespace(returncode=0)),patch.object(runner,'has_owner',side_effect=lambda *_:events.append('owner') or True),patch.object(runner.time,'monotonic',side_effect=lambda:now[0]),patch.object(runner.subprocess,'Popen',side_effect=spawn),patch.object(runner,'ShellDrain',Monitor),patch.object(runner,'query_once',side_effect=query):
            assert runner.inner('gnome-x11',root)==3
        if case=='runner-deadline':
            assert events==['shell','owner','one-info','drain-close']
            value=startup.diagnostic(json.loads((root/'observer-startup.json').read_text()))
            assert 'beforeChecker' not in value and set(value['lifecycle'])=={'finally'}
            print('startup-'+case+'-passed');sys.exit(0)
        assert events==['shell','owner','one-info','checker','driver-wait','drain-close']
        value=startup.diagnostic(json.loads((root/'observer-startup.json').read_text()))
        assert value['beforeChecker']['extensionInfo']=={'status':'NOT_FOUND'}
        assert set(value['lifecycle'])=={'beforeChecker','afterChecker','finally'}
        assert value['lifecycle']['beforeChecker']['drain']['stopRequested'] is False
        assert value['lifecycle']['afterChecker']['drain']['stopRequested'] is False
        assert value['lifecycle']['finally']['drain']['stopRequested'] is True

else:raise ValueError('UNKNOWN_STARTUP_FIXTURE')
print('startup-'+case+'-passed')
