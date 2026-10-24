#!/usr/bin/python3
"""Fixed private KWin X11 discrimination control; never the full launcher probe."""
import importlib.util
import json
import os
import pathlib
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time

HERE=pathlib.Path(__file__).resolve().parent
NATIVE=HERE.parent
SOURCE_ROOT=NATIVE.parents[3]
HOME=pathlib.Path('/home/debian')
NODE=HOME/'linuxcast-tools/bin/node'
sys.path.insert(0,str(NATIVE))
from private import private_root,private_environment,target_guard
from supervision import Supervisor,Cancelled
from artifacts import public_manifest

spec=importlib.util.spec_from_file_location('s001_owned_control_public',HERE/'public.py')
P=importlib.util.module_from_spec(spec);spec.loader.exec_module(P)

class HupSafeSupervisor:
    """Exact reviewed orchestration shield; Supervisor owns TERM/INT/children."""
    def __init__(self,supervisor):self.supervisor=supervisor;self.closed=False
    def __enter__(self):return self.supervisor.__enter__()
    def __exit__(self,kind,error,traceback):
        previous=signal.signal(signal.SIGHUP,signal.SIG_IGN)
        try:
            result=self.supervisor.__exit__(kind,error,traceback);self.closed=True;return result
        finally:signal.signal(signal.SIGHUP,previous)

def directory(path):
    P.require(path.is_absolute() and path==path.resolve(strict=True))
    metadata=path.lstat()
    P.require(stat.S_ISDIR(metadata.st_mode) and metadata.st_uid==os.getuid() and stat.S_IMODE(metadata.st_mode)==0o700)
def private_stage(source_root):
    P.require(source_root.name=='source' and source_root.parent.parent==HOME and re.fullmatch('lc1-[A-Za-z0-9_-]{8}',source_root.parent.name))
    for path in (source_root.parent,source_root,source_root/'t'):directory(path)
def verify_node():
    P.require(P.file_hash(NODE,256*1024*1024)==P.NODE_SHA256)
def verify_sources(authority_hash,source_root=None):
    source_root=SOURCE_ROOT if source_root is None else source_root
    private_stage(source_root);P.hash_value(authority_hash)
    raw=P.regular_bytes(source_root.parent/'control-authority.json',16384,private=True)
    P.require(P.digest(raw)==authority_hash);authority=P.runtime_authority(P.loads(raw))
    native=source_root/'spikes/launcher/tests/native-session';here=native/'owned-control'
    raw=P.regular_bytes(here/'runtime-authority.json',16384)
    P.require(P.digest(raw)==P.AUTHORITY);expected=public_manifest(P.loads(raw))
    built=P.regular_bytes(native/'dist/manifest.json',16384)
    P.require(P.digest(built)==P.AUTHORITY and public_manifest(P.loads(built))==expected)
    for names,base in ((expected['sourceSha256'],native),(expected['outputSha256'],native/'dist')):
        for name,digest in names.items():
            file=pathlib.Path(os.path.abspath(base/name));P.require(file.is_relative_to(source_root))
            P.require(P.file_hash(file,8*1024*1024)==digest)
    for file,key in ((source_root/'docs/design/tokens.json','designTokensSha256'),
                     (source_root/'spikes/launcher/resources/io.github.ianwijma.Linuxcast.desktop','launcherDesktopFileSha256')):
        P.require(P.file_hash(file,1024*1024)==expected[key])
    for name,digest in authority['controlSourceSha256'].items():P.require(P.file_hash(here/name,8*1024*1024)==digest)
    verify_node()
    return P.source_manifest({'kind':'S0-01-owned-control-source-manifest','applicationObserver':expected,
        'controlSourceSha256':authority['controlSourceSha256'],'controlAuthoritySha256':P.AUTHORITY},public_manifest)

def unavailable(reason):
    print(json.dumps(P.unavailable(reason)));return 3
def has_owner(env,remaining):
    P.require(remaining>0)
    result=subprocess.run(['/usr/bin/gdbus','call','--session','--dest','org.freedesktop.DBus','--object-path','/org/freedesktop/DBus',
        '--method','org.freedesktop.DBus.NameHasOwner','org.kde.KWin'],env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
        text=True,timeout=min(5,remaining))
    P.require(len(result.stdout.encode())<=1024)
    return result.returncode==0 and result.stdout.strip()=='(true,)'
def inner(root,authority_hash):
    P.require(os.environ.get('TMPDIR')==str(SOURCE_ROOT/'t') and root.parent==SOURCE_ROOT/'t')
    root=private_root(str(root),P.BACKEND)
    P.require(os.environ.get('LINUXCAST_S001_NODE')==str(NODE))
    env=private_environment(root,str(NODE))
    env.update(DBUS_SESSION_BUS_ADDRESS=os.environ['DBUS_SESSION_BUS_ADDRESS'],DISPLAY=os.environ['DISPLAY'],XAUTHORITY=os.environ['XAUTHORITY'],
        LINUXCAST_S001_BACKEND=P.BACKEND,XDG_SESSION_TYPE='x11',GDK_BACKEND='x11',LIBGL_ALWAYS_SOFTWARE='1',QT_QUICK_BACKEND='software')
    executable=shutil.which('kwin_x11',path='/usr/bin:/bin')
    if not executable:return P.state(reason='TARGET_COMPOSITOR_PACKAGE_REQUIRED')
    deadline=time.monotonic()+45
    compositor=subprocess.Popen([executable,'--replace'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
    while time.monotonic()<deadline:
        if compositor.poll() is not None:return P.state(reason='TARGET_COMPOSITOR_START_FAILED')
        if has_owner(env,deadline-time.monotonic()):break
        time.sleep(min(0.2,max(0,deadline-time.monotonic())))
    else:return P.state(reason='TARGET_COMPOSITOR_START_DEADLINE')
    verify_sources(authority_hash)
    if compositor.poll() is not None:return P.state(reason='TARGET_COMPOSITOR_START_FAILED')
    if time.monotonic()>=deadline:return P.state(reason='TARGET_COMPOSITOR_START_DEADLINE')
    driver=subprocess.Popen([str(NODE),str(HERE/'control.mjs'),'--source-root',str(SOURCE_ROOT)],env=env,
        stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
    try:code=driver.wait(timeout=180)
    except subprocess.TimeoutExpired:return P.state('driver-timeout',reason='CONTROL_DRIVER_DEADLINE')
    return P.state('completed',3,None) if type(code) is int and code==3 else P.state('driver-exit-rejected',code,'CONTROL_DRIVER_EXIT_REJECTED')

def socket_layout(root):
    suffixes=('dbus-session','runtime/linuxcast-s001-wayland','runtime/bus','runtime/at-spi/bus_9999999999')
    P.require(all(0<len(os.fsencode(root/name))<=107 for name in suffixes))
def setup(root):
    directory(root);socket_layout(root)
    env=private_environment(root,str(NODE))
    for name in ('home','config','data','cache','runtime'):(root/name).mkdir(mode=0o700)
    applications=root/'data/applications';applications.mkdir(mode=0o700)
    P.exclusive(applications/'io.github.ianwijma.Linuxcast.desktop',b'[Desktop Entry]\nType=Application\nName=Linuxcast\nExec=/usr/bin/false\nStartupWMClass=io.github.ianwijma.Linuxcast\nNoDisplay=true\n')
    services=root/'services';services.mkdir(mode=0o700)
    config='<busconfig><type>session</type><listen>unix:path='+str(root/'dbus-session')+'</listen><auth>EXTERNAL</auth><servicedir>'+str(services)+'</servicedir><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>'
    P.exclusive(root/'bus.conf',config.encode());P.exclusive(root/'xauthority',b'')
    return env
def command(root,authority_hash):
    return ['/usr/bin/xvfb-run','--auth-file',str(root/'xauthority'),'-a','-s','-screen 0 1280x900x24 -nolisten tcp',
        '/usr/bin/dbus-run-session','--config-file',str(root/'bus.conf'),'--','/usr/bin/python3','-B','-I',str(HERE/'session.py'),
        '--private-guest','--authority-sha256',authority_hash,'--inner',str(root)]
def remove_owned(root,owned,permitted):
    if not permitted:return False
    metadata=root.lstat()
    if not(stat.S_ISDIR(metadata.st_mode) and metadata.st_uid==os.getuid() and stat.S_IMODE(metadata.st_mode)==0o700 and
           (metadata.st_dev,metadata.st_ino)==owned and root==root.resolve(strict=True)):return False
    shutil.rmtree(root);return not root.exists()
def package_lines(env):
    result=subprocess.run(['/usr/bin/dpkg-query','-W','-f=${Package} ${Version}\n','kwin-x11','libqt6qml6'],env=env,
        stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=5)
    P.require(result.returncode==0 and len(result.stdout.encode())<=4096)
    return P.packages(result.stdout.splitlines())
def run_private(authority_hash,expected):
    P.require(os.environ.get('TMPDIR')==str(SOURCE_ROOT/'t'))
    root=pathlib.Path(tempfile.mkdtemp(prefix='linuxcast-s001-matrix-',dir=SOURCE_ROOT/'t'))
    metadata=root.lstat();owned=metadata.st_dev,metadata.st_ino
    started=False;owner=None;report=None;outer_state=None
    previous={}
    try:
        for number in (signal.SIGTERM,signal.SIGINT,signal.SIGHUP):previous[number]=signal.signal(number,Supervisor.interrupted)
        env=setup(root)
        owner=HupSafeSupervisor(Supervisor())
        with owner:
            # Supervisor ownership starts before Popen, including a failure
            # before the returned child could be assigned or adopted.
            started=True
            child=subprocess.Popen(command(root,authority_hash),env=env,cwd=root,start_new_session=True,
                stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            try:
                code=child.wait(timeout=240)
                if type(code) is not int or code!=3:outer_state=P.state('session-exit-rejected',code,'CONTROL_SESSION_EXIT_REJECTED')
            except subprocess.TimeoutExpired:outer_state=P.state('session-timeout',reason='CONTROL_SESSION_DEADLINE')
            packages=package_lines(env) if outer_state is None else []
        path=root/'session-state.json'
        if outer_state is not None:driver=outer_state
        elif path.exists() or path.is_symlink():driver=P.driver_state(P.loads(P.regular_bytes(path,16384,private=True)))
        else:driver=P.state(reason='CONTROL_SESSION_STATE_MISSING')
        path=root/'owned-control.json'
        result=P.control_result(P.loads(P.regular_bytes(path,65536,private=True))) if path.exists() or path.is_symlink() else P.unavailable(driver['reason'] or 'CONTROL_REPORT_MISSING')
        P.require(verify_sources(authority_hash)==expected)
        report=P.make_report(result,driver,packages)
    except Cancelled:report=None
    except Exception:report=None
    finally:
        for number in previous:signal.signal(number,signal.SIG_IGN)
        try:removed=remove_owned(root,owned,(owner is not None and owner.closed) or not started)
        except (ValueError,OSError):removed=False
        for number,handler in previous.items():signal.signal(number,handler)
    if report is None or not removed:return unavailable('CONTROL_CLEANUP_OR_REPORT_FAILED')
    try:status,report=P.publish(HERE/'result',report,expected,public_manifest)
    except Exception:return unavailable('CONTROL_CLEANUP_OR_REPORT_FAILED')
    print(json.dumps(report));return status

def parse_args(arguments):
    P.require(type(arguments) is list and len(arguments) in (3,5) and arguments[0:2]==['--private-guest','--authority-sha256'])
    P.hash_value(arguments[2]);inner_root=None
    if len(arguments)==5:
        P.require(arguments[3]=='--inner' and type(arguments[4]) is str);inner_root=pathlib.Path(arguments[4])
    return arguments[2],inner_root
def main(arguments=None):
    try:authority_hash,root=parse_args(sys.argv[1:] if arguments is None else arguments)
    except (ValueError,IndexError,TypeError):return unavailable('CONTROL_ENTRY_REJECTED')
    try:target_guard()
    except (ValueError,OSError):return unavailable('CONTROL_PRIVATE_CONTEXT_REJECTED')
    try:
        expected=verify_sources(authority_hash)
        if root is not None:
            root=private_root(str(root),P.BACKEND)
            try:driver=inner(root,authority_hash)
            except Exception:driver=P.state(reason='CONTROL_INNER_REJECTED')
            P.exclusive(root/'session-state.json',P.encoded(driver));return 3
        return run_private(authority_hash,expected)
    except Cancelled:return unavailable('CONTROL_CANCELLED')
    except Exception:return unavailable('CONTROL_SOURCE_REJECTED')
if __name__=='__main__':sys.exit(main())
